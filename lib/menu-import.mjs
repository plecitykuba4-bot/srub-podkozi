// Přečtení nahraného jídelního lístku (PDF nebo obrázek) přes Claude API.
// Model vrací pouze data; nic se neukládá bez potvrzení správcem v náhledu.
import Anthropic from '@anthropic-ai/sdk';

export const LIMITS = {
  maxBytes: 8 * 1024 * 1024,   // strop na velikost souboru
  maxMeals: 60,                // pět dní po polévce a čtyřech hlavních je 25; rezerva
  maxPerDay: 5                 // kolik nahrání denně appka pustí
};

const DNY = ['pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek'];

const MEDIA = {
  'application/pdf': 'document',
  'image/png': 'image', 'image/jpeg': 'image', 'image/webp': 'image', 'image/gif': 'image'
};

const SCHEMA = {
  type: 'object',
  properties: {
    meals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: {type: 'string', description: 'Datum ve tvaru RRRR-MM-DD'},
          category: {type: 'string', enum: ['Polévka', 'Hlavní jídlo']},
          name: {type: 'string'},
          description: {type: 'string'},
          allergens: {type: 'string'},
          price: {type: ['number', 'null'], description: 'Cena v celých Kč, null když na lístku není'}
        },
        required: ['date', 'category', 'name', 'description', 'allergens', 'price'],
        additionalProperties: false
      }
    },
    poznamka: {type: 'string', description: 'Co bylo nečitelné nebo sporné; prázdné když nic'}
  },
  required: ['meals', 'poznamka'],
  additionalProperties: false
};

export async function readMenuFile({buffer, mediaType, weekDates, apiKey, model = 'claude-opus-5', onProgress = () => {}}) {
  const kind = MEDIA[mediaType];
  if (!kind) throw new Error('Podporujeme PDF, PNG, JPG a WEBP.');
  if (buffer.length > LIMITS.maxBytes) throw new Error('Soubor smí mít nejvýše 8 MB.');

  const client = new Anthropic({apiKey});
  const source = {type: 'base64', media_type: mediaType, data: buffer.toString('base64')};
  const nahradni = weekDates.map((d, i) => `${DNY[i]} = ${d}`).join('\n');
  const pokyn = `Přepiš jídelní lístek z přiloženého souboru do strukturovaných dat.

Datum každého jídla vezmi z lístku samotného. Lístek bývá na jeden pracovní týden (pondělí až pátek);
když je na něm rozsah dat nebo datum u jednotlivých dnů, použij přesně ta.
Jen pokud lístek žádné datum neobsahuje, použij tento náhradní týden:
${nahradni}
Když na lístku chybí rok, vezmi rok z náhradního týdne.

Pravidla:
- Ke každému dni patří obvykle jedna polévka a několik hlavních jídel. Zachovej pořadí, v jakém jsou na lístku.
- Cenu uveď v celých korunách jako číslo. Když u jídla cena není, dej null. Nic si nedomýšlej.
- Alergeny opiš přesně tak, jak jsou (typicky čísla oddělená čárkami). Když nejsou, nech prázdný řetězec.
- Popis je doplněk k názvu (příloha, úprava). Když není, nech prázdný řetězec.
- Do pole poznamka napiš jen to, co bylo nečitelné nebo sporné. Když bylo vše jasné, nech prázdné.`;

  let message;
  try {
    const stream = client.messages.stream({
      model,
      max_tokens: 8000,
      output_config: {format: {type: 'json_schema', schema: SCHEMA}},
      messages: [{role: 'user', content: [{type: kind, source}, {type: 'text', text: pokyn}]}]
    });
    onProgress({phase: 'reading'});
    let written = '';
    let reported = -1;
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        written += event.delta.text;
        // Každé jídlo končí polem "price" – jeho výskyty jsou skutečný počet přepsaných jídel.
        const meals = (written.match(/"price"\s*:/g) || []).length;
        if (meals !== reported) {
          reported = meals;
          onProgress({phase: 'writing', meals});
        }
      }
    }
    message = await stream.finalMessage();
  } catch (e) {
    const cause = e?.cause?.code || e?.cause?.message || '';
    if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(String(cause) + String(e.message))) {
      throw new Error('Nepodařilo se ověřit certifikát api.anthropic.com. Na tomto počítači to dělá antivirus, který rozplétá HTTPS. Server spusťte s --use-system-ca.');
    }
    throw new Error(`Spojení s Claude API selhalo: ${e.message}${cause ? ' (' + cause + ')' : ''}`);
  }

  if (message.stop_reason === 'refusal') throw new Error('Model odmítl lístek zpracovat. Zkuste jiný soubor, nebo import CSV.');
  if (message.stop_reason === 'max_tokens') throw new Error('Lístek je na jedno načtení příliš dlouhý. Rozdělte ho na menší části.');

  const text = message.content.filter(b => b.type === 'text').map(b => b.text).join('');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Model nevrátil čitelná data. Zkuste to znovu, nebo použijte import CSV.');
  }

  return {
    meals: normalize(parsed.meals || []),
    poznamka: String(parsed.poznamka || '').slice(0, 500),
    usage: message.usage
  };
}

// Ověření na naší straně: co neprojde, se neschová, ale označí pro kontrolu.
function normalize(meals) {
  return meals.slice(0, LIMITS.maxMeals).map(m => {
    const warnings = [];
    const date = String(m.date || '');
    const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T12:00:00Z') : null;
    if (!day || Number.isNaN(day.getTime())) warnings.push('neplatné datum');
    else if ([0, 6].includes(day.getUTCDay())) warnings.push('datum připadá na víkend');
    const category = m.category === 'Polévka' ? 'Polévka' : 'Hlavní jídlo';
    if (m.category !== 'Polévka' && m.category !== 'Hlavní jídlo') warnings.push('neznámý typ jídla');
    const name = String(m.name || '').trim().slice(0, 200);
    if (!name) warnings.push('chybí název');
    const price = m.price === null || m.price === undefined ? null : Number(m.price);
    if (price === null) warnings.push('chybí cena');
    else if (!Number.isFinite(price) || price <= 0 || price > 10000) warnings.push('cena mimo rozsah');
    return {
      date, category, name,
      description: String(m.description || '').trim().slice(0, 500),
      allergens: String(m.allergens || '').trim().slice(0, 80),
      price, warnings
    };
  });
}

// Týden, na který lístek skutečně je: pondělí až pátek podle nejčastějšího týdne v datech.
export function detectWeek(meals) {
  const mondays = {};
  for (const m of meals) {
    const d = new Date(m.date + 'T12:00:00Z');
    if (Number.isNaN(d.getTime())) continue;
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const key = d.toISOString().slice(0, 10);
    mondays[key] = (mondays[key] || 0) + 1;
  }
  const best = Object.entries(mondays).sort((a, b) => b[1] - a[1])[0];
  if (!best) return null;
  const monday = new Date(best[0] + 'T12:00:00Z');
  return Array.from({length: 5}, (_, i) => {
    const x = new Date(monday);
    x.setUTCDate(monday.getUTCDate() + i);
    return x.toISOString().slice(0, 10);
  });
}

// Kontrola celku: chybějící den, den bez polévky, jídla mimo rozpoznaný týden.
export function reviewMeals(meals, weekDates) {
  const notes = [];
  const outside = meals.filter(m => !weekDates.includes(m.date)).length;
  if (outside) notes.push(`${outside} jídel má datum mimo rozpoznaný týden`);
  for (const [i, date] of weekDates.entries()) {
    const forDay = meals.filter(m => m.date === date);
    if (!forDay.length) {
      notes.push(`${DNY[i]} ${date}: žádné jídlo`);
      continue;
    }
    if (!forDay.some(m => m.category === 'Polévka')) notes.push(`${DNY[i]} ${date}: chybí polévka`);
    const mains = forDay.filter(m => m.category === 'Hlavní jídlo').length;
    if (mains !== 4) notes.push(`${DNY[i]} ${date}: ${mains} hlavních jídel místo čtyř`);
  }
  return notes;
}
