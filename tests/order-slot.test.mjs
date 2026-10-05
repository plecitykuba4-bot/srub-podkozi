// Pořadí jídel v přehledech drží jídelníček (polévka, M1–M4), ne pořadí objednávek.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {kitchenWorkbook} from '../lib/kitchen-xlsx.mjs';
import {reportHtml} from '../lib/report-grid.mjs';
import ExcelJS from 'exceljs';

// Abecedně první firma si objedná jen poslední hlavní jídlo. Druhá firma objedná
// polévku a první hlavní. Bez slotu by se "Řízek" dostal na první řádek.
const rows = [
  {company_id: 1, company: 'Alfa', address: '', packaging: 'own', quantity: 2, name: 'Řízek', category: 'Hlavní jídlo', slot: 4},
  {company_id: 2, company: 'Beta', address: '', packaging: 'own', quantity: 3, name: 'Gulášová', category: 'Polévka', slot: 0},
  {company_id: 2, company: 'Beta', address: '', packaging: 'own', quantity: 1, name: 'Svíčková', category: 'Hlavní jídlo', slot: 1}
];

test('Kuchyňský list řadí jídla podle lístku, ne podle objednávek', async () => {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await kitchenWorkbook('2026-10-01', rows));
  const names = [];
  book.getWorksheet(1).eachRow(r => { const v = r.getCell(1).value; if (typeof v === 'string') names.push(v); });
  const dishes = names.filter(n => ['Gulášová', 'Svíčková', 'Řízek'].includes(n));
  assert.deepEqual(dishes.slice(0, 3), ['Gulášová', 'Svíčková', 'Řízek']);
});

test('Mřížka v hlášení drží stejné pořadí', () => {
  const html = reportHtml('2026-10-01', rows, 6, null);
  const order = ['Gulášová', 'Svíčková', 'Řízek'].map(n => html.indexOf(n));
  assert.ok(order[0] < order[1] && order[1] < order[2], 'jídla nejsou v pořadí z lístku');
});

// Kuchaři připravují porce v zabydleném pořadí firem, které není abecední.
test('Kuchyňský list řadí firmy podle nastaveného pořadí, ne podle abecedy', async () => {
  const rows = [
    {company_id: 1, company: 'Autosklo', sort_order: 70, packaging: 'own', quantity: 1, name: 'Vývar', category: 'Polévka', slot: 0},
    {company_id: 2, company: 'Fish', sort_order: 10, packaging: 'own', quantity: 2, name: 'Vývar', category: 'Polévka', slot: 0},
    {company_id: 3, company: 'Sedlo', sort_order: 20, packaging: 'own', quantity: 3, name: 'Vývar', category: 'Polévka', slot: 0},
    // Nová firma bez pořadí patří na konec, i když je abecedně první.
    {company_id: 4, company: 'Alfa', sort_order: null, packaging: 'own', quantity: 1, name: 'Vývar', category: 'Polévka', slot: 0}
  ];
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await kitchenWorkbook('2026-10-05', rows));
  const sheet = book.getWorksheet(1);
  let firms = [];
  sheet.eachRow((r, i) => {
    if (typeof r.getCell(1).value === 'string' && /VLASTNÍ/i.test(r.getCell(1).value)) {
      const head = sheet.getRow(i + 1), out = [];
      head.eachCell(c => out.push(String(c.value)));
      firms = out.slice(1, -1);
    }
  });
  assert.deepEqual(firms, ['Fish', 'Sedlo', 'Autosklo', 'Alfa']);
});
