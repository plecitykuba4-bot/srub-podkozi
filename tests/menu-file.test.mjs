// Lístek si firma stáhne přesně v té podobě, v jaké ho restaurace nahrála,
// a poznámka restaurace k objednávce dojde až do souhrnu dne.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {pragueNow, dayAfter} from '../domain.mjs';

// Nejmenší platné PDF; jde o bajty, ne o obsah.
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n');

test('Jídelníček ke stažení a poznámka k objednávce', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'srub-menufile-'));
  const port = 32320 + Math.floor(Math.random() * 1000);
  const origin = `http://127.0.0.1:${port}`;
  const proc = spawn(process.execPath, ['server.mjs'], {cwd: new URL('..', import.meta.url), env: {...process.env, DEMO: 'true', PORT: String(port), DATA_DIR: dir, HOST: '127.0.0.1'}, stdio: ['ignore', 'pipe', 'pipe']});
  let error = '';
  proc.stderr.on('data', x => error += x);
  await Promise.race([
    once(proc.stdout, 'data'),
    once(proc, 'exit').then(() => {throw new Error(error);}),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Server startup timeout: ' + error)), 10000).unref())
  ]);
  const call = async (path, data, cookie = '') => {
    const r = await fetch(origin + '/api/' + path, {method: data ? 'POST' : 'GET', headers: {...(data ? {'Content-Type': 'application/json', Origin: origin} : {}), Cookie: cookie}, body: data ? JSON.stringify(data) : undefined});
    return {status: r.status, headers: r.headers, raw: r, cookie: r.headers.get('set-cookie')?.split(';')[0]};
  };
  try {
    const admin = (await call('login', {email: 'restaurace@demo.cz', password: 'SrubDemo2026!'})).cookie;
    const firm = (await call('login', {email: 'fish@demo.cz', password: 'SrubDemo2026!'})).cookie;
    assert.ok(admin && firm);

    const date = dayAfter(pragueNow().date, 3);
    const saved = await call('meals', {
      meals: [
        {date, category: 'Polévka', name: 'Vývar', description: '', allergens: '9', price: 40},
        {date, category: 'Hlavní jídlo', name: 'Řízek', description: '', allergens: '1', price: 170},
        {date, category: 'Hlavní jídlo', name: 'Guláš', description: '', allergens: '1', price: 160}
      ],
      file: {data: PDF.toString('base64'), mime: 'application/pdf'}
    }, admin);
    assert.equal(saved.status, 200);

    // Firma dostane zpět tentýž soubor, ne přepis z databáze.
    const got = await call('menu/file?week=' + date, null, firm);
    assert.equal(got.status, 200);
    assert.equal(got.headers.get('content-type'), 'application/pdf');
    assert.ok(Buffer.from(await got.raw.arrayBuffer()).equals(PDF), 'stažený lístek se liší od nahraného');

    // Bez přihlášení se lístek nevydá.
    assert.equal((await call('menu/file?week=' + date)).status, 401);

    // Poznámka patří ke konkrétnímu jídlu firmy, ne k celému dni.
    const company = (await (await call('dashboard?date=' + date, null, admin)).raw.json()).companies.find(c => c.email === 'fish@demo.cz');
    const meals = (await (await call('admin/order?company=' + company.id + '&date=' + date, null, admin)).raw.json()).meals;
    const soup = meals.find(m => m.category === 'Polévka'), main = meals.find(m => m.category !== 'Polévka');
    await call('admin/order', {company_id: company.id, date, items: [
      {id: soup.id, quantity: 2},
      {id: main.id, quantity: 3, note: 'Jeden s bramborem místo hranolek.'}
    ]}, admin);
    const read = await (await call('admin/order?company=' + company.id + '&date=' + date, null, admin)).raw.json();
    assert.equal(read.meals.find(m => m.id === main.id).note, 'Jeden s bramborem místo hranolek.');
    assert.equal(read.meals.find(m => m.id === soup.id).note, '', 'poznámka se přilepila k jinému jídlu');

    // Uloží se i tehdy, když se počty porcí nemění.
    const again = await call('admin/order', {company_id: company.id, date, items: [
      {id: soup.id, quantity: 2},
      {id: main.id, quantity: 3, note: 'Dva s bramborem.'}
    ]}, admin);
    assert.equal((await again.raw.json()).notes, 1);
    const after = await (await call('admin/order?company=' + company.id + '&date=' + date, null, admin)).raw.json();
    assert.equal(after.meals.find(m => m.id === main.id).note, 'Dva s bramborem.');

    // Poznámka u jídla, které firma zrovna nemá objednané, se taky musí udržet –
    // restaurace si ji zapíše dřív, než firma pošle počty.
    const spare = meals.find(m => m.id !== soup.id && m.id !== main.id);
    await call('admin/order', {company_id: company.id, date, items: [
      {id: soup.id, quantity: 2},
      {id: main.id, quantity: 3, note: 'Dva s bramborem.'},
      {id: spare.id, quantity: 0, note: 'Až bude, tak bez cibule.'}
    ]}, admin);
    const zero = await (await call('admin/order?company=' + company.id + '&date=' + date, null, admin)).raw.json();
    assert.equal(zero.meals.find(m => m.id === spare.id).note, 'Až bude, tak bez cibule.', 'poznámka u nulové porce se ztratila');
    assert.equal(zero.meals.find(m => m.id === spare.id).quantity, 0);

    // Kuchyňský list nese poznámku na řádku té porce, ne u firmy.
    const rows = (await (await call('dashboard?date=' + date, null, admin)).raw.json()).rows;
    assert.equal(rows.find(r => r.meal_id === main.id).note, 'Dva s bramborem.');
    assert.equal(rows.find(r => r.meal_id === soup.id).note, '');
  } finally {
    proc.kill();
    await once(proc, 'exit');
    rmSync(dir, {recursive: true, force: true});
  }
});

test('Vykreslený jídelníček drží pořadí z lístku a zvládne den bez jídel', async () => {
  const {menuSheetHtml} = await import('../lib/menu-sheet.mjs');
  const dates = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'];
  const byDate = {
    '2026-10-05': [
      {category: 'Polévka', name: 'Vývar', description: 'nudle', allergens: '1, 9', price: 5500, slot: 0},
      {category: 'Hlavní jídlo', name: 'Svíčková', description: 'knedlík', allergens: '1, 7', price: 14500, slot: 1},
      {category: 'Hlavní jídlo', name: 'Řízek', description: 'kaše', allergens: '1, 3', price: 21000, slot: 4}
    ],
    '2026-10-06': []
  };
  const html = menuSheetHtml(dates, byDate, ['Omáčka 40 Kč']);

  // Polévka bez čísla, hlavní jídla číslovaná v pořadí z lístku.
  assert.ok(html.includes('>Vývar<'), 'polévka chybí');
  assert.ok(html.includes('1. Svíčková') && html.includes('2. Řízek'), 'hlavní jídla nejsou číslovaná po pořadě');
  assert.ok(html.indexOf('Vývar') < html.indexOf('Svíčková'), 'polévka není první');

  // Ceny v korunách, ne v haléřích.
  assert.ok(html.includes('55 Kč') && html.includes('210 Kč'), 'ceny nesedí');

  // Den bez jídel i tak dostane svůj blok, ať je lístek celý týden.
  assert.ok(html.includes('ÚTERÝ 6. 10.') && html.includes('Dnes nevaříme'), 'prázdný den chybí');
  assert.ok(html.includes('PÁTEK 9. 10.'), 'den bez dat v byDate chybí');
  assert.ok(html.includes('Omáčka 40 Kč'), 'doplňková nabídka chybí');
});

test('Lístek nese sjednané ceny firmy a firma se k cizím nedostane', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'srub-sheet-'));
  const port = 33320 + Math.floor(Math.random() * 1000);
  const origin = `http://127.0.0.1:${port}`;
  const proc = spawn(process.execPath, ['server.mjs'], {cwd: new URL('..', import.meta.url), env: {...process.env, DEMO: 'true', PORT: String(port), DATA_DIR: dir, HOST: '127.0.0.1'}, stdio: ['ignore', 'pipe', 'pipe']});
  let error = '';
  proc.stderr.on('data', x => error += x);
  await Promise.race([
    once(proc.stdout, 'data'),
    once(proc, 'exit').then(() => {throw new Error(error);}),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Server startup timeout: ' + error)), 10000).unref())
  ]);
  const call = async (path, data, cookie = '') => {
    const r = await fetch(origin + '/api/' + path, {method: data ? 'POST' : 'GET', headers: {...(data ? {'Content-Type': 'application/json', Origin: origin} : {}), Cookie: cookie}, body: data ? JSON.stringify(data) : undefined});
    return {status: r.status, raw: r, cookie: r.headers.get('set-cookie')?.split(';')[0]};
  };
  const ceny = html => [...html.matchAll(/<span class="price">([^<]+)</g)].map(m => m[1]);
  try {
    const admin = (await call('login', {email: 'restaurace@demo.cz', password: 'SrubDemo2026!'})).cookie;
    const date = dayAfter(pragueNow().date, 3);
    await call('meals', {meals: [
      {date, category: 'Polévka', name: 'Vývar', description: '', allergens: '9', price: 55},
      {date, category: 'Hlavní jídlo', name: 'Řízek', description: '', allergens: '1', price: 145}
    ]}, admin);

    // Firmě nastavíme jinou cenu, než je na lístku.
    const firm = (await (await call('dashboard?date=' + date, null, admin)).raw.json()).companies.find(c => c.email === 'fish@demo.cz');
    await call('companies', {id: firm.id, name: firm.name, email: firm.email, address: '', price: 139, soup_price: 40, packaging: 'disposable', fee: 10}, admin);
    const cookie = (await call('login', {email: 'fish@demo.cz', password: 'SrubDemo2026!'})).cookie;

    const mine = await (await call('menu/sheet?week=' + date, null, cookie)).raw.text();
    assert.deepEqual(ceny(mine).slice(0, 2), ['40 Kč', '139 Kč'], 'firma nevidí své sjednané ceny');
    assert.ok(mine.includes('krabička 10 Kč'), 'poznámka o krabičce chybí');

    // Cizí firmu si v adrese nepodstrčí – dostane pořád své ceny.
    const other = (await (await call('dashboard?date=' + date, null, admin)).raw.json()).companies.find(c => c.email !== 'fish@demo.cz');
    const stolen = await (await call(`menu/sheet?week=${date}&company=${other.id}`, null, cookie)).raw.text();
    assert.deepEqual(ceny(stolen).slice(0, 2), ['40 Kč', '139 Kč'], 'firma dostala ceny jiné firmy');

    // Restaurace bez vybrané firmy vidí ceníkové ceny z jídelníčku.
    const list = await (await call('menu/sheet?week=' + date, null, admin)).raw.text();
    assert.deepEqual(ceny(list).slice(0, 2), ['55 Kč', '145 Kč'], 'restaurace nevidí ceníkové ceny');
  } finally {
    proc.kill();
    await once(proc, 'exit');
    rmSync(dir, {recursive: true, force: true});
  }
});

test('Firmu s poznámkou jde odebrat', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'srub-del-'));
  const port = 34320 + Math.floor(Math.random() * 1000);
  const origin = `http://127.0.0.1:${port}`;
  const proc = spawn(process.execPath, ['server.mjs'], {cwd: new URL('..', import.meta.url), env: {...process.env, DEMO: 'true', PORT: String(port), DATA_DIR: dir, HOST: '127.0.0.1'}, stdio: ['ignore', 'pipe', 'pipe']});
  let error = '';
  proc.stderr.on('data', x => error += x);
  await Promise.race([
    once(proc.stdout, 'data'),
    once(proc, 'exit').then(() => {throw new Error(error);}),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Server startup timeout: ' + error)), 10000).unref())
  ]);
  const call = async (path, data, cookie = '') => {
    const r = await fetch(origin + '/api/' + path, {method: data ? 'POST' : 'GET', headers: {...(data ? {'Content-Type': 'application/json', Origin: origin} : {}), Cookie: cookie}, body: data ? JSON.stringify(data) : undefined});
    return {status: r.status, raw: r, cookie: r.headers.get('set-cookie')?.split(';')[0]};
  };
  try {
    const admin = (await call('login', {email: 'restaurace@demo.cz', password: 'SrubDemo2026!'})).cookie;
    const date = dayAfter(pragueNow().date, 2);
    await call('meals', {date, name: 'Guláš', description: '', allergens: '1', price: 150, category: 'Hlavní jídlo'}, admin);
    await call('companies', {name: 'Zkouška', email: 'zkouska-del@example.cz', address: '', price: 150, soup_price: '', packaging: 'disposable', fee: 10, password: 'ZkouskaPassword123'}, admin);
    const firm = (await (await call('dashboard?date=' + date, null, admin)).raw.json()).companies.find(c => c.email === 'zkouska-del@example.cz');

    // Poznámka u jídla bez objednané porce drží cizí klíč na firmu.
    const meal = (await (await call(`admin/order?company=${firm.id}&date=${date}`, null, admin)).raw.json()).meals[0];
    await call('admin/order', {company_id: firm.id, date, items: [{id: meal.id, quantity: 0, note: 'jen poznámka'}]}, admin);

    const del = await call('companies/delete', {id: firm.id}, admin);
    assert.equal(del.status, 200, 'firmu s poznámkou nejde odebrat: ' + JSON.stringify(await del.raw.json()));
    const left = (await (await call('dashboard?date=' + date, null, admin)).raw.json()).companies.find(c => c.email === 'zkouska-del@example.cz');
    assert.equal(left, undefined, 'firma v seznamu zůstala');
  } finally {
    proc.kill();
    await once(proc, 'exit');
    rmSync(dir, {recursive: true, force: true});
  }
});
