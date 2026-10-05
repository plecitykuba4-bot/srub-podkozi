// Pořadí firem v kuchyňském listu podle toho, jak kuchaři porce připravují.
// Spouští se ručně po změně seznamu:
//   sudo -u srub node --env-file-if-exists=.env scripts/kitchen-order.mjs
// Firma, která v seznamu není, zůstane bez pořadí a řadí se na konec podle jména.
import {DatabaseSync} from 'node:sqlite';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const db = new DatabaseSync(resolve(root, process.env.DATA_DIR || 'data', 'srub.sqlite'));

// Jednorázové krabičky, pak vlastní. Pořadí v poli je pořadí na listu.
const ORDER = [
  'Fish',
  'Sedlo',
  'Pospa',
  'Magoš',
  'Chára',
  'Hyundai',
  'Autosklo',
  'Nevecom',
  'Arco Interiér (Pfaur)',
  'Šárka Kyšice',
  'Held',
  'Movianto Jeneč',
  'Surgi Care Svárov',
  'Otec',
  'Barcalbus',
  'Káča',
  'Hlava',
  'JRK Firma',
  'Nouzov Křížovi',
  'Nečesalová Ptice',
  'OÚ Ptice',
  'Linhartová Ptice',
  'Vít',
  'Síla'
];

// Sloupec přidá server při startu; skript může běžet i dřív, tak si ho doplni sám.
if (!db.prepare('PRAGMA table_info(companies)').all().some(c => c.name === 'sort_order')) {
  db.exec('ALTER TABLE companies ADD COLUMN sort_order INTEGER');
}

const firms = db.prepare('SELECT id,name,packaging FROM companies').all();
const najdi = name => firms.find(f => f.name === name);

const chybi = ORDER.filter(n => !najdi(n));
if (chybi.length) {
  console.error('V databázi nejsou tyto firmy ze seznamu:\n  ' + chybi.join('\n  '));
  process.exit(1);
}

// Po desítkách, ať jde později vložit firmu doprostřed bez přečíslování zbytku.
db.exec('BEGIN IMMEDIATE');
try {
  db.prepare('UPDATE companies SET sort_order=NULL').run();
  const set = db.prepare('UPDATE companies SET sort_order=? WHERE id=?');
  ORDER.forEach((name, i) => set.run((i + 1) * 10, najdi(name).id));
  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  throw e;
}

const bez = firms.filter(f => !ORDER.includes(f.name));
console.log('Pořadí nastaveno pro ' + ORDER.length + ' firem.');
if (bez.length) console.log('Bez pořadí (řadí se na konec podle jména): ' + bez.map(f => f.name).join(', '));

for (const pack of ['disposable', 'own']) {
  const list = db.prepare("SELECT name,sort_order FROM companies WHERE packaging=? ORDER BY sort_order IS NULL, sort_order, name").all(pack);
  console.log('\n' + (pack === 'disposable' ? 'JEDNORÁZOVÉ' : 'VLASTNÍ') + ':');
  list.forEach((c, i) => console.log('  ' + String(i + 1).padStart(2) + '. ' + c.name + (c.sort_order === null ? '  (bez pořadí)' : '')));
}
db.close();
