// Kuchyňský list pro e-mail: stejná mřížka jako na papíře restaurace –
// jídla v řádcích, firmy ve sloupcích, zvlášť jednorázové a vlastní krabičky.
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function layout(rows) {
  const dishes = [];
  for (const r of rows) if (!dishes.some(d => d.name === r.name)) {
    dishes.push({name: r.name, soup: r.category === 'Polévka'});
  }
  dishes.sort((a, b) => (a.soup === b.soup ? 0 : a.soup ? -1 : 1));
  const qty = (companyId, name) => rows
    .filter(r => r.company_id === companyId && r.name === name)
    .reduce((s, r) => s + r.quantity, 0);
  const block = packaging => {
    const ids = [...new Set(rows.filter(r => r.packaging === packaging).map(r => r.company_id))];
    return {firms: ids.map(id => ({id, name: rows.find(r => r.company_id === id).company}))};
  };
  return {dishes, qty, disposable: block('disposable'), own: block('own')};
}

export function reportHtml(date, rows, totalPortions, week) {
  const {dishes, qty, disposable, own} = layout(rows);
  const table = ({firms}, title) => {
    if (!firms.length) return `<h3 style="font:700 15px system-ui;margin:22px 0 6px">${title}</h3><p style="margin:0;color:#776b58;font:14px system-ui">Na tento den nikdo neobjednal.</p>`;
    const th = 'style="border:1px solid #d8cdb5;padding:6px 7px;background:#fff3d5;font:700 12px system-ui;text-align:center"';
    const td = 'style="border:1px solid #d8cdb5;padding:6px 7px;font:13px system-ui;text-align:center"';
    const tdName = 'style="border:1px solid #d8cdb5;padding:6px 8px;font:700 13px system-ui;text-align:left"';
    const head = `<tr><th ${th}>Jídlo</th>${firms.map(f => `<th ${th}>${esc(f.name)}</th>`).join('')}<th ${th}>Celkem</th></tr>`;
    const body = dishes.map(d => {
      const cells = firms.map(f => `<td ${td}>${qty(f.id, d.name) || '–'}</td>`).join('');
      const sum = firms.reduce((s, f) => s + qty(f.id, d.name), 0);
      return `<tr><td ${tdName}>${esc(d.name)}</td>${cells}<td ${td}><b>${sum}</b></td></tr>`;
    }).join('');
    const foot = `<tr><td ${tdName}>Celkem za firmu</td>${firms.map(f => `<td ${td}><b>${dishes.reduce((s, d) => s + qty(f.id, d.name), 0)}</b></td>`).join('')}<td ${td}><b>${firms.reduce((s, f) => s + dishes.reduce((n, d) => n + qty(f.id, d.name), 0), 0)}</b></td></tr>`;
    return `<h3 style="font:700 15px system-ui;margin:22px 0 6px">${title} <span style="color:#776b58;font-weight:600">· ${firms.length} firem</span></h3>
<table cellspacing="0" cellpadding="0" style="border-collapse:collapse">${head}${body}${foot}</table>`;
  };
  return `<div style="font-family:system-ui,Arial,sans-serif;color:#231f18">
<h2 style="font-size:20px;margin:0 0 2px">Srub Podkozí — kuchyňský list</h2>
<p style="margin:0;color:#776b58;font-size:14px">${date} · celkem ${totalPortions} porcí</p>
${table(disposable, 'Jednorázové krabičky')}
${table(own, 'Vlastní krabičky')}
${week ? `<h2 style="font-size:18px;margin:30px 0 2px">Celý týden</h2>${weeklyTables(week.rowsByDate, week.dates, htmlStyles)}` : ''}
<p style="margin:22px 0 0;color:#776b58;font-size:12px">V příloze je stejná mřížka k vytištění a soubor pro Excel.</p></div>`;
}

const htmlStyles = {
  th: 'style="border:1px solid #d8cdb5;padding:6px 7px;background:#fff3d5;font:700 12px system-ui;text-align:center"',
  td: 'style="border:1px solid #d8cdb5;padding:6px 7px;font:13px system-ui;text-align:center"',
  tdName: 'style="border:1px solid #d8cdb5;padding:6px 8px;font:700 13px system-ui;text-align:left"',
  wrap: (title, firms, inner) => firms
    ? `<h3 style="font:700 15px system-ui;margin:22px 0 6px">${title} <span style="color:#776b58;font-weight:600">· ${firms} firem</span></h3><table cellspacing="0" cellpadding="0" style="border-collapse:collapse">${inner}</table>`
    : `<h3 style="font:700 15px system-ui;margin:22px 0 6px">${title}</h3><p style="margin:0;color:#776b58;font:14px system-ui">Tento týden nikdo neobjednal.</p>`
};

export function reportCsv(date, rows) {
  const {dishes, qty, disposable, own} = layout(rows);
  const cell = v => /[";\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  const out = [[`Srub Podkozí — kuchyňský list ${date}`]];
  for (const [block, title] of [[disposable, 'Jednorázové krabičky'], [own, 'Vlastní krabičky']]) {
    out.push([], [title]);
    if (!block.firms.length) { out.push(['Na tento den nikdo neobjednal.']); continue; }
    out.push(['Jídlo', ...block.firms.map(f => f.name), 'Celkem']);
    for (const d of dishes) {
      out.push([d.name, ...block.firms.map(f => qty(f.id, d.name) || ''), block.firms.reduce((s, f) => s + qty(f.id, d.name), 0)]);
    }
    out.push(['Celkem za firmu', ...block.firms.map(f => dishes.reduce((s, d) => s + qty(f.id, d.name), 0)), '']);
  }
  // Direktiva sep= říká Excelu, čím jsou sloupce oddělené, i když má v systému
  // nastavenou čárku. BOM na začátku zajistí správnou diakritiku.
  const body = ['sep=;', ...out.map(l => l.map(cell).join(';'))].join('\r\n');
  return '\uFEFF' + body;
}

// Samostatný soubor k vytištění: otevře se v prohlížeči a Ctrl+P dá A4 na šířku,
// černobíle a bez zbytečností – stejná mřížka jako papír, který kuchyně používá.
export function reportPrintable(date, rows, totalPortions, week) {
  return `<!doctype html>
<html lang="cs"><head><meta charset="utf-8">
<title>Kuchyňský list ${date}</title>
<style>
@page{size:A4 landscape;margin:10mm}
*{box-sizing:border-box}
body{margin:0;padding:14px;font-family:Arial,Helvetica,sans-serif;color:#000;background:#fff}
h1{font-size:20px;margin:0 0 2px}
.sub{margin:0 0 14px;font-size:13px;color:#333}
h3{font-size:14px;margin:16px 0 5px;page-break-after:avoid}
table{border-collapse:collapse;width:100%;page-break-inside:avoid}
th,td{border:1px solid #000;padding:5px 6px;font-size:12px;text-align:center}
th,.h{background:#eee;font-size:11px}
td.n,th.n{text-align:left;font-weight:700;white-space:nowrap}
tr.soup td{background:#f4f4f4}
tfoot td{font-weight:700;background:#eee}
.hint{margin-top:14px;font-size:11px;color:#555}
h2.pagebreak{font-size:17px;margin:0;padding-top:6px;page-break-before:always}
@media print{.hint{display:none}}
</style></head><body>
<h1>Srub Podkozí — kuchyňský list</h1>
<p class="sub">${date} · celkem ${totalPortions} porcí</p>
${printBlocks(rows)}
${week ? `<h2 class="pagebreak">Celý týden</h2>${weeklyTables(week.rowsByDate, week.dates, printStyles)}` : ''}
<p class="hint">Vytisknete klávesovou zkratkou Ctrl+P. Nastaveno na A4 na šířku.</p>
</body></html>`;
}

function printBlocks(rows) {
  const dishes = [];
  for (const r of rows) if (!dishes.some(d => d.name === r.name)) dishes.push({name: r.name, soup: r.category === 'Polévka'});
  dishes.sort((a, b) => (a.soup === b.soup ? 0 : a.soup ? -1 : 1));
  const qty = (id, name) => rows.filter(r => r.company_id === id && r.name === name).reduce((s, r) => s + r.quantity, 0);
  const e = s => String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const block = (packaging, title) => {
    const ids = [...new Set(rows.filter(r => r.packaging === packaging).map(r => r.company_id))];
    const firms = ids.map(id => ({id, name: rows.find(r => r.company_id === id).company}));
    if (!firms.length) return `<h3>${title}</h3><p>Na tento den nikdo neobjednal.</p>`;
    const head = `<thead><tr><th class="n">Jídlo</th>${firms.map(f => `<th>${e(f.name)}</th>`).join('')}<th>Celkem</th></tr></thead>`;
    const body = `<tbody>${dishes.map(d => `<tr class="${d.soup ? 'soup' : ''}"><td class="n">${e(d.name)}</td>${firms.map(f => `<td>${qty(f.id, d.name) || '–'}</td>`).join('')}<td>${firms.reduce((s, f) => s + qty(f.id, d.name), 0)}</td></tr>`).join('')}</tbody>`;
    const foot = `<tfoot><tr><td class="n">Celkem za firmu</td>${firms.map(f => `<td>${dishes.reduce((s, d) => s + qty(f.id, d.name), 0)}</td>`).join('')}<td>${firms.reduce((s, f) => s + dishes.reduce((n, d) => n + qty(f.id, d.name), 0), 0)}</td></tr></tfoot>`;
    return `<h3>${title} · ${firms.length} firem</h3><table>${head}${body}${foot}</table>`;
  };
  return block('disposable', 'Jednorázové krabičky') + block('own', 'Vlastní krabičky');
}

// Týdenní mřížka přesně podle papíru restaurace: v řádcích dny a pod nimi jídla,
// ve sloupcích firmy. Dělí se stejně na jednorázové a vlastní krabičky.
const DNY = ['pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek'];

function weekLayout(rowsByDate, dates) {
  const all = dates.flatMap(d => rowsByDate[d] || []);
  const firmsFor = packaging => {
    const ids = [...new Set(all.filter(r => r.packaging === packaging).map(r => r.company_id))];
    return ids.map(id => ({id, name: all.find(r => r.company_id === id).company}))
      .sort((a, b) => a.name.localeCompare(b.name, 'cs'));
  };
  const dishesOf = date => {
    const rows = rowsByDate[date] || [];
    const out = [];
    for (const r of rows) if (!out.some(x => x.name === r.name)) out.push({name: r.name, soup: r.category === 'Polévka'});
    out.sort((a, b) => (a.soup === b.soup ? 0 : a.soup ? -1 : 1));
    return out;
  };
  const qty = (date, id, name) => (rowsByDate[date] || [])
    .filter(r => r.company_id === id && r.name === name)
    .reduce((s, r) => s + r.quantity, 0);
  return {firmsFor, dishesOf, qty};
}

export function weeklyTables(rowsByDate, dates, {th, td, tdName, wrap}) {
  const {firmsFor, dishesOf, qty} = weekLayout(rowsByDate, dates);
  return ['disposable', 'own'].map(packaging => {
    const title = packaging === 'disposable' ? 'Jednorázové krabičky' : 'Vlastní krabičky';
    const firms = firmsFor(packaging);
    if (!firms.length) return wrap(title, 0, '');
    const head = `<tr><th ${th}>Den / jídlo</th>${firms.map(f => `<th ${th}>${f.name}</th>`).join('')}<th ${th}>Celkem</th></tr>`;
    let body = '';
    dates.forEach((date, i) => {
      body += `<tr><td ${tdName} colspan="${firms.length + 2}">${DNY[i]} ${date.slice(8)}. ${Number(date.slice(5, 7))}.</td></tr>`;
      const dishes = dishesOf(date);
      if (!dishes.length) { body += `<tr><td ${tdName}>—</td>${firms.map(() => `<td ${td}>–</td>`).join('')}<td ${td}>0</td></tr>`; return; }
      for (const d of dishes) {
        const sum = firms.reduce((s, f) => s + qty(date, f.id, d.name), 0);
        body += `<tr><td ${tdName}>${d.name}</td>${firms.map(f => `<td ${td}>${qty(date, f.id, d.name) || '–'}</td>`).join('')}<td ${td}><b>${sum}</b></td></tr>`;
      }
    });
    const totalPerFirm = f => dates.reduce((s, date) => s + dishesOf(date).reduce((n, d) => n + qty(date, f.id, d.name), 0), 0);
    const foot = `<tr><td ${tdName}>Celkem za týden</td>${firms.map(f => `<td ${td}><b>${totalPerFirm(f)}</b></td>`).join('')}<td ${td}><b>${firms.reduce((s, f) => s + totalPerFirm(f), 0)}</b></td></tr>`;
    return wrap(title, firms.length, head + body + foot);
  }).join('');
}

const printStyles = {
  th: 'class="h"', td: '', tdName: 'class="n"',
  wrap: (title, firms, inner) => firms
    ? `<h3>${title} · ${firms} firem</h3><table>${inner}</table>`
    : `<h3>${title}</h3><p>Tento týden nikdo neobjednal.</p>`
};
