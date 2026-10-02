// Jídelní lístek na celý týden ve vzhledu tištěného menu restaurace:
// dva sloupce na A4, vlevo značka a první dva dny, vpravo zbytek týdne.
// Stránka se otevře rovnou v tiskovém dialogu, odkud se uloží jako PDF.
const DNY = ['PONDĚLÍ', 'ÚTERÝ', 'STŘEDA', 'ČTVRTEK', 'PÁTEK'];

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const kratce = d => `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}.`;

// Polévka stojí bez čísla, hlavní jídla se číslují 1–4 jako na tištěném lístku.
function dishRow(meal, index) {
  const cislo = meal.category === 'Polévka' ? '' : `${index}. `;
  // Sjednaná nula znamená, že jídlo má firma v ceně – „0 Kč“ by na lístku vypadalo jako chyba.
  const cena = meal.price > 0 ? `${Math.round(meal.price / 100)} Kč` : 'v ceně';
  const alergeny = meal.allergens ? `(${esc(meal.allergens)})` : '';
  const popis = [esc(meal.description), alergeny].filter(Boolean).join(' ');
  return `<li${meal.category === 'Polévka' ? ' class="soup"' : ''}>
    <div class="row"><span class="name">${cislo}${esc(meal.name)}</span><span class="price">${cena}</span></div>
    ${popis ? `<p>${popis}</p>` : ''}
  </li>`;
}

function dayBlock(date, meals, i) {
  if (!meals.length) {
    return `<section class="day"><h2>${DNY[i]} ${kratce(date)}</h2>
      <p class="closed">Dnes nevaříme.</p></section>`;
  }
  const soups = meals.filter(m => m.category === 'Polévka');
  const mains = meals.filter(m => m.category !== 'Polévka');
  const rows = [...soups.map(m => dishRow(m, 0)), ...mains.map((m, n) => dishRow(m, n + 1))];
  return `<section class="day"><h2>${DNY[i]} ${kratce(date)}</h2><ul>${rows.join('')}</ul></section>`;
}

/**
 * @param dates  pondělí až pátek
 * @param byDate jídla ke každému dni, seřazená podle lístku; ceny už přepočtené pro příjemce
 * @param extras řádky doplňkové nabídky do patičky
 * @param forCompany jméno firmy, pro kterou ceny platí (prázdné = ceníkové ceny)
 * @param boxNote poznámka o krabičce do patičky
 */
export function menuSheetHtml(dates, byDate, extras = [], forCompany = '', boxNote = '') {
  const dny = dates.map((d, i) => dayBlock(d, byDate[d] || [], i));
  const rozsah = `${kratce(dates[0])} – ${kratce(dates[4])} ${dates[4].slice(0, 4)}`;
  return `<!doctype html>
<html lang="cs"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Srub Podkozí — polední menu ${rozsah}</title>
<style>
  @page { size: A4; margin: 9mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #e9e9e6; color: #000;
    font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
  .sheet { width: 210mm; min-height: 297mm; margin: 14px auto; padding: 9mm 8mm;
    background: #fff; display: grid; grid-template-columns: 1fr 1fr; gap: 0 9mm; }
  .col { display: flex; flex-direction: column; }
  .col.right { border-left: 1.4px solid #000; padding-left: 9mm; }
  .brand { text-align: center; padding: 0 6mm; }
  .brand img { width: 50mm; max-width: 100%; height: auto; }
  .brand .label { display: block; margin: 4mm 0 0; padding: 2.4mm 2mm;
    background: #000; color: #fff; font-size: 13pt; font-weight: 700;
    letter-spacing: .3px; }
  .day { margin-top: 5mm; break-inside: avoid; }
  .col.right .day:first-child { margin-top: 0; }
  h2 { padding: 1.9mm 0; border-top: 1.4px solid #000; border-bottom: 1.4px solid #000;
    font-size: 12pt; font-weight: 500; letter-spacing: .4px; }
  ul { list-style: none; margin-top: 1.6mm; }
  li { padding: 1.4mm 0; }
  .row { display: flex; align-items: baseline; gap: 4mm; }
  .name { flex: 1; font-size: 10.5pt; font-weight: 400; line-height: 1.25; }
  .price { font-size: 10.5pt; font-weight: 400; white-space: nowrap; }
  li p { margin-left: 2.4mm; color: #1a1a1a; font-size: 7.8pt; line-height: 1.35; }
  .closed { padding: 3mm 0; color: #333; font-size: 10pt; }
  .foot { grid-column: 1 / -1; display: flex; justify-content: space-between;
    align-items: flex-end; gap: 8mm; margin-top: auto; padding-top: 3mm;
    border-top: 1.4px solid #000; }
  .foot .note { font-size: 8.5pt; letter-spacing: .4px; line-height: 1.6;
    text-transform: uppercase; }
  .foot .box { display: block; margin-top: 2mm; font-weight: 600; }
  .for-firm { margin-top: 2.5mm; font-size: 9pt; letter-spacing: .3px; }
  .foot .extras { font-size: 8.2pt; line-height: 1.55; text-align: right; }
  .bar { position: sticky; top: 0; display: flex; justify-content: center; gap: 10px;
    padding: 10px; background: #fff; border-bottom: 1px solid #d8d8d2; }
  .bar button { padding: 10px 18px; border: 0; border-radius: 8px; background: #ffb000;
    color: #231f18; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
  .bar span { align-self: center; color: #6b6b63; font-size: 13px; }
  @media print { .bar { display: none; } body { background: #fff; }
    .sheet { margin: 0; padding: 0; width: auto; min-height: 0; } }
</style></head>
<body>
<div class="bar"><button onclick="window.print()">Uložit jako PDF nebo vytisknout</button>
  <span>V dialogu zvolte „Uložit jako PDF“.</span></div>
<div class="sheet">
  <div class="col">
    <div class="brand"><img src="/logo.png" alt="Srub Podkozí">
      <span class="label">Polední menu</span>
      ${forCompany ? `<p class="for-firm">Ceny pro ${esc(forCompany)}</p>` : ''}</div>
    ${dny[0]}${dny[1]}
  </div>
  <div class="col right">${dny[2]}${dny[3]}${dny[4]}</div>
  <div class="foot">
    <div class="note">Seznam alergenů a cen<br>na vyžádání u obsluhy${boxNote ? `<span class="box">${esc(boxNote)}</span>` : ''}</div>
    <div class="extras">${extras.map(e => esc(e)).join('<br>') || ''}</div>
  </div>
</div>
<script>
  // Tisk se nabídne sám; když ho někdo zavře, stránka zůstane otevřená.
  addEventListener('load', () => setTimeout(() => window.print(), 400));
</script>
</body></html>`;
}
