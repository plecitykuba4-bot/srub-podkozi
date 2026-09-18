// QR Platba (formát SPD České bankovní asociace) pro vyúčtování firem.
// Vše je čistě výpočetní: období, variabilní symbol, IBAN a text pro QR kód.

const MONTHS = ['leden', 'unor', 'brezen', 'duben', 'kveten', 'cerven', 'cervenec', 'srpen', 'zari', 'rijen', 'listopad', 'prosinec'];
const MONTHS_CZ = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];

const day = date => new Date(date + 'T12:00:00Z');
const iso = d => d.toISOString().slice(0, 10);
const addDays = (date, n) => { const d = day(date); d.setUTCDate(d.getUTCDate() + n); return iso(d); };

// Zbytek po dělení 97 pro dlouhé číslo zapsané jako text (kontrola IBAN).
function mod97(digits) {
  let rest = 0;
  for (const ch of digits) rest = (rest * 10 + Number(ch)) % 97;
  return rest;
}

// Kontrola českého čísla účtu (vážený součet dělitelný 11) pro předčíslí i základní část.
function validCzechPart(value, weights) {
  const padded = value.padStart(weights.length, '0');
  const sum = [...padded].reduce((s, ch, i) => s + Number(ch) * weights[i], 0);
  return sum % 11 === 0;
}

/**
 * Z českého čísla účtu (19-123456789/0800) nebo IBAN (CZ65 0800 …) udělá IBAN bez mezer.
 * Neplatný vstup vyhodí chybu se srozumitelnou zprávou.
 */
export function toIban(input) {
  const raw = String(input || '').replace(/\s+/g, '').toUpperCase();
  if (!raw) throw new Error('Zadejte číslo účtu.');
  if (raw.startsWith('CZ')) {
    if (!/^CZ\d{22}$/.test(raw)) throw new Error('IBAN musí mít tvar CZ a 22 číslic.');
    const numeric = raw.slice(4) + '1235' + raw.slice(2, 4);
    if (mod97(numeric) !== 1) throw new Error('IBAN nemá platný kontrolní součet – zkontrolujte ho.');
    return raw;
  }
  const m = raw.match(/^(?:(\d{1,6})-)?(\d{2,10})\/(\d{4})$/);
  if (!m) throw new Error('Číslo účtu zadejte ve tvaru 123456789/0800 (případně s předčíslím 19-123456789/0800) nebo jako IBAN.');
  const [, prefix = '', number, bank] = m;
  if (prefix && !validCzechPart(prefix, [10, 5, 8, 4, 2, 1])) throw new Error('Předčíslí účtu není platné – zkontrolujte ho.');
  if (!validCzechPart(number, [6, 3, 7, 9, 10, 5, 8, 4, 2, 1])) throw new Error('Číslo účtu není platné – zkontrolujte ho.');
  const bban = bank + prefix.padStart(6, '0') + number.padStart(10, '0');
  const check = String(98 - mod97(bban + '123500')).padStart(2, '0');
  return 'CZ' + check + bban;
}

export const formatIban = iban => String(iban).replace(/(.{4})/g, '$1 ').trim();

// ISO číslo týdne a rok, ke kterému týden patří (týden patří roku, ve kterém je jeho čtvrtek).
function isoWeek(monday) {
  const thursday = day(addDays(monday, 3));
  const year = thursday.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.floor((thursday - jan1) / 86400000 / 7) + 1;
  return {week, year};
}

/**
 * Období platby pro firmu: týden po–pá, nebo celý kalendářní měsíc (billing === 'month').
 * Vrací klíč období, rozsah dnů a popisky pro zprávu i pro obrazovku.
 */
export function periodFor(date, billing) {
  const d = day(date);
  if (billing === 'month') {
    const y = d.getUTCFullYear(), m = d.getUTCMonth();
    const from = iso(new Date(Date.UTC(y, m, 1, 12)));
    const to = iso(new Date(Date.UTC(y, m + 1, 0, 12)));
    return {
      period: `${y}-${String(m + 1).padStart(2, '0')}`, kind: 'month', from, to,
      label: `${MONTHS_CZ[m]} ${y}`, ascii: `${MONTHS[m]} ${y}`,
      code: String(y % 100).padStart(2, '0') + String(60 + m + 1)
    };
  }
  const monday = addDays(date, -((d.getUTCDay() + 6) % 7));
  const {week, year} = isoWeek(monday);
  return {
    period: `${year}-W${String(week).padStart(2, '0')}`, kind: 'week', from: monday, to: addDays(monday, 4),
    label: `týden ${week}/${year}`, ascii: `tyden ${week}/${year}`,
    code: String(year % 100).padStart(2, '0') + String(week).padStart(2, '0')
  };
}

// Variabilní symbol: rok + týden (01–53) nebo 60+měsíc (61–72) + číslo firmy. Jen číslice, max. 10.
export function variableSymbol(companyId, period) {
  const vs = period.code + String(companyId).padStart(3, '0');
  if (!/^\d{1,10}$/.test(vs)) throw new Error('Variabilní symbol se nepodařilo sestavit.');
  return vs;
}

// Zpráva pro příjemce bez diakritiky (některé banky ji v QR platbě komolí), bez hvězdiček, max. 60 znaků.
export function paymentMessage(companyName, period) {
  const plain = `Srub Podkozi - ${companyName} - ${period.ascii}`
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[*]/g, ' ').replace(/\s+/g, ' ').trim();
  return plain.slice(0, 60);
}

/** Text QR Platby. Částka v haléřích. */
export function spdString({iban, amount, vs, message}) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Částka k úhradě musí být kladná.');
  return `SPD*1.0*ACC:${iban}*AM:${(amount / 100).toFixed(2)}*CC:CZK*X-VS:${vs}*MSG:${message}`;
}
