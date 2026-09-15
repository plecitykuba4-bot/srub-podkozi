// Kuchyňský list jako sešit Excelu: jeden list, tři tabulky pod sebou.
// Vlastní krabičky, jednorázové krabičky a kolik se čeho uvaří celkem.
// Bez cen — do kuchyně patří jen počty porcí. Barvy odpovídají jantarové paletě aplikace.
import ExcelJS from 'exceljs';

const AMBER = 'FFFFB000';       // hlavní jantarová z aplikace
const AMBER_SOFT = 'FFFFE6AB';  // světlejší jantarová pro součty
const CREAM = 'FFFFFAF0';       // krémová plocha karet
const SOUP = 'FFFFF1CF';        // podbarvení polévek
const LINE = 'FFD3AE63';        // jemná linka místo černé mřížky
const INK = 'FF231F18';         // základní text
const MUTED = 'FF776B58';       // popisky
const BROWN = 'FF8A5800';       // nadpisy sekcí
const EDGE = 'FFB07C1A';        // rámeček kolem tabulky

const thin = {style: 'thin', color: {argb: LINE}};
const edge = {style: 'medium', color: {argb: EDGE}};
const BORDER = {top: thin, left: thin, bottom: thin, right: thin};

// Rámeček kolem celé tabulky, aby na papíře působila jako tabulka, ne jako sloupce čísel.
function outline(sheet, firstRow, lastRow, columns) {
  for (let r = firstRow; r <= lastRow; r++) {
    for (let c = 1; c <= columns; c++) {
      const cell = sheet.getRow(r).getCell(c);
      cell.border = {
        top: r === firstRow ? edge : thin,
        bottom: r === lastRow ? edge : thin,
        left: c === 1 ? edge : thin,
        right: c === columns ? edge : thin
      };
    }
  }
}
const fill = argb => ({type: 'pattern', pattern: 'solid', fgColor: {argb}});

// Jídla v pořadí z jídelníčku, polévky napřed – stejně jako na tištěném listu.
function dishesOf(rows) {
  const out = [];
  for (const r of rows) if (!out.some(d => d.name === r.name)) out.push({name: r.name, soup: r.category === 'Polévka'});
  return out.sort((a, b) => (a.soup === b.soup ? 0 : a.soup ? -1 : 1));
}

function firmsOf(rows, packaging) {
  const ids = [...new Set(rows.filter(r => r.packaging === packaging).map(r => r.company_id))];
  return ids.map(id => ({id, name: rows.find(r => r.company_id === id).company}))
    .sort((a, b) => a.name.localeCompare(b.name, 'cs'));
}

function dateLabel(date) {
  const d = new Date(date + 'T12:00:00Z');
  const text = d.toLocaleDateString('cs-CZ', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'});
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export async function kitchenWorkbook(date, rows) {
  const book = new ExcelJS.Workbook();
  book.creator = 'Srub Podkozí';
  book.created = new Date();
  const sheet = book.addWorksheet('Kuchyňský list', {
    pageSetup: {
      paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      horizontalCentered: true, margins: {left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2}
    },
    views: [{state: 'frozen', xSplit: 1, showGridLines: false}],
    properties: {defaultRowHeight: 18}
  });

  const dishes = dishesOf(rows);
  const total = rows.reduce((s, r) => s + r.quantity, 0);
  const firms = new Set(rows.map(r => r.company_id)).size;
  const qty = (id, name) => rows.filter(r => r.company_id === id && r.name === name).reduce((s, r) => s + r.quantity, 0);
  const qtyBy = (packaging, name) => rows.filter(r => r.packaging === packaging && r.name === name).reduce((s, r) => s + r.quantity, 0);

  const title = sheet.addRow(['Srub Podkozí — kuchyňský list']);
  title.font = {bold: true, size: 18, color: {argb: INK}};
  title.height = 26;
  const sub = sheet.addRow([`${dateLabel(date)} · celkem ${total} ${plural(total)} pro ${firms} ${plural(firms, 'firmu', 'firmy', 'firem')}`]);
  sub.font = {size: 11, color: {argb: MUTED}};
  sub.height = 18;

  let widest = 1;

  // Tabulka firem: v řádcích jídla, ve sloupcích firmy, vpravo součet za jídlo.
  const firmTable = (packaging, heading) => {
    sheet.addRow([]).height = 8;
    const caption = sheet.addRow([heading.toUpperCase()]);
    caption.font = {bold: true, size: 12, color: {argb: BROWN}};
    caption.height = 20;
    const list = firmsOf(rows, packaging);
    if (!list.length) {
      const empty = sheet.addRow(['Na tento den nikdo neobjednal.']);
      empty.font = {italic: true, color: {argb: MUTED}};
      return;
    }
    caption.getCell(1).value = `${heading.toUpperCase()} · ${list.length} ${plural(list.length, 'firma', 'firmy', 'firem')}`;
    const width = list.length + 2;
    const firstRow = sheet.rowCount + 1;
    const header = sheet.addRow(['Jídlo', ...list.map(f => f.name), 'Celkem']);
    styleRow(header, width, {fill: AMBER, bold: true, height: 30, wrapNames: true, size: 12});
    dishes.forEach((d, i) => {
      const row = sheet.addRow([d.name, ...list.map(f => qty(f.id, d.name) || null), list.reduce((s, f) => s + qty(f.id, d.name), 0)]);
      styleRow(row, width, {fill: d.soup ? SOUP : (i % 2 ? CREAM : null), lastBold: true});
    });
    const foot = sheet.addRow(['Celkem za firmu',
      ...list.map(f => dishes.reduce((s, d) => s + qty(f.id, d.name), 0)),
      list.reduce((s, f) => s + dishes.reduce((n, d) => n + qty(f.id, d.name), 0), 0)]);
    styleRow(foot, width, {fill: AMBER_SOFT, bold: true});
    outline(sheet, firstRow, sheet.rowCount, width);
    widest = Math.max(widest, width);
  };

  firmTable('own', 'Vlastní krabičky');
  firmTable('disposable', 'Jednorázové krabičky');

  // Poslední tabulka je souhrn pro vaření: kolik porcí celkem a jak se dělí podle krabiček.
  sheet.addRow([]).height = 8;
  const caption = sheet.addRow(['UVAŘIT CELKEM']);
  caption.font = {bold: true, size: 12, color: {argb: BROWN}};
  caption.height = 20;
  const totalsFirstRow = sheet.rowCount + 1;
  const header = sheet.addRow(['Jídlo', 'Vlastní', 'Jednorázové', 'Celkem']);
  styleRow(header, 4, {fill: AMBER, bold: true, height: 30, size: 12});
  dishes.forEach((d, i) => {
    const own = qtyBy('own', d.name), disposable = qtyBy('disposable', d.name);
    const row = sheet.addRow([d.name, own || null, disposable || null, own + disposable]);
    styleRow(row, 4, {fill: d.soup ? SOUP : (i % 2 ? CREAM : null), lastBold: true});
  });
  const foot = sheet.addRow(['Celkem porcí',
    rows.filter(r => r.packaging === 'own').reduce((s, r) => s + r.quantity, 0),
    rows.filter(r => r.packaging === 'disposable').reduce((s, r) => s + r.quantity, 0),
    total]);
  styleRow(foot, 4, {fill: AMBER_SOFT, bold: true});
  outline(sheet, totalsFirstRow, sheet.rowCount, 4);
  widest = Math.max(widest, 4);

  sheet.getColumn(1).width = 34;
  for (let c = 2; c <= widest; c++) sheet.getColumn(c).width = 12;

  return Buffer.from(await book.xlsx.writeBuffer());
}

// Jméno jídla vlevo tučně, počty na střed; poslední sloupec Celkem je vždy zvýrazněný.
function styleRow(row, columns, {fill: bg = null, bold = false, height = 24, wrapNames = false, lastBold = false, size = 14} = {}) {
  row.height = height;
  for (let c = 1; c <= columns; c++) {
    const cell = row.getCell(c);
    cell.border = BORDER;
    cell.font = {bold: bold || c === 1 || (lastBold && c === columns), size, color: {argb: INK}};
    cell.alignment = c === 1
      ? {vertical: 'middle', horizontal: 'left', wrapText: true}
      : {vertical: 'middle', horizontal: 'center', wrapText: wrapNames};
    const cellBg = lastBold && c === columns ? AMBER_SOFT : bg;
    if (cellBg) cell.fill = fill(cellBg);
  }
}

function plural(n, one = 'porce', few = 'porce', many = 'porcí') {
  return n === 1 ? one : n >= 2 && n <= 4 ? few : many;
}
