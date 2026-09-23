const $=s=>document.querySelector(s);
// Česká shoda převzatá z fitness-app/src/lib/format.ts.
function plural(count,one,few,many){const n=Math.abs(count);if(n===1)return one;if(n>=2&&n<=4)return few;return many;}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('cs-CZ',{style:'currency',currency:'CZK',minimumFractionDigits:0,maximumFractionDigits:2}).format(n/100);
const dateLabel=(d,opt={day:'numeric',month:'long'})=>new Date(d+'T12:00:00').toLocaleDateString('cs-CZ',opt);
const plus=(d,n)=>{const dt=new Date(d+'T12:00:00Z');dt.setUTCDate(dt.getUTCDate()+n);return dt.toISOString().slice(0,10);};
const icons={menu:'▤',orders:'▣',dashboard:'◷',companies:'♧',settings:'⚙',logout:'↗'};
let state={user:null,demo:false,view:'menu',date:'',data:null,quantities:{},dirty:false,filter:'all',search:''};
let renderId=0;
async function api(path,body){const r=await fetch('/api/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok){if(r.status===401&&state.user){state.user=null;await render();}throw new Error(data.error||'Něco se nepovedlo. Zkuste to znovu.');}return data;}
function toast(message,error=false,ms=4500){const t=$('#toast');t.textContent=message;t.className=error?'show error':'show';clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.className='',ms);}
function brand(){return `<a class="brand" href="/" aria-label="Srub Podkozí – úvod"><img src="/logo.png" alt="" width="42" height="42"><span>srub podkozí<small>POCTIVĚ. KAŽDÝ DEN.</small></span></a>`;}
function empty(title,desc){return `<div class="empty"><span>↟</span><h3>${title}</h3><p>${desc}</p></div>`;}
{
function nav(){const admin=state.user.role==='admin';const links=admin?[['dashboard','Denní přehled'],['menu','Jídelní lístek'],['companies','Firmy a ceny'],['settings','Nastavení']]:[['menu','Polední menu'],['orders','Moje objednávky'],['settings','Můj účet']];return `<aside class="sidebar">${brand()}<div class="workspace-label">${admin?'SPRÁVA RESTAURACE':'FIREMNÍ STRAVOVÁNÍ'}</div><nav>${links.map(([v,l])=>`<button data-view="${v}" class="nav-link ${state.view===v?'active':''}"><span aria-hidden="true">${icons[v]}</span>${l}${v==='menu'?'<i>5</i>':''}</button>`).join('')}</nav><div class="sidebar-note"><span class="twig">⌁</span><strong>Dobré jídlo.<br>Lepší pracovní den.</strong><p>Z naší kuchyně<br>rovnou k vám.</p></div><div class="account"><span class="avatar">${esc(admin?'SP':state.user.name?.slice(0,2).toUpperCase())}</span><div><strong>${esc(admin?'Restaurace':state.user.name)}</strong><small>${admin?'Správce':'Firemní účet'}</small></div><button data-action="logout" title="Odhlásit se" aria-label="Odhlásit se">↗</button></div></aside>`;}
function shell(content){const admin=state.user.role==='admin';return `${nav()}<div class="main"><header class="topbar"><span>${admin?'Restaurace':'Váš firemní oběd'} <b>/</b> ${esc({menu:admin?'Jídelní lístek':'Polední menu',dashboard:'Denní přehled',companies:'Firmy a ceny',orders:'Moje objednávky',settings:'Nastavení'}[state.view])}</span><div><span class="live-dot"></span> ${state.demo?'Místní demo · ukázkové firmy':'Přihlášeno'}<span class="top-date">${dateLabel(state.clock.date,{day:'numeric',month:'long',year:'numeric'})}</span></div></header><main id="content">${content}</main><footer>© ${new Date().getFullYear()} Srub Podkozí <span>Vaříme s chutí. Vy objednáváte v klidu.</span></footer></div>`;}
function heading(kicker,title,subtitle,actions=''){return `<div class="heading"><div><p class="eyebrow">${kicker}</p><h1>${title}</h1><p class="subtitle">${subtitle}</p></div>${actions?`<div class="heading-actions">${actions}</div>`:''}</div>`;}
function datePicker(){const week=new Date(state.date+'T12:00:00Z').getUTCDay();const monday=plus(state.date,-((week+6)%7));return `<div class="week"><button class="week-arrow" data-shift="-7" aria-label="Předchozí týden">←</button><div class="days">${Array.from({length:5},(_,i)=>{const d=plus(monday,i);return `<button data-date="${d}" class="day ${state.date===d?'selected':''}"><span>${dateLabel(d,{weekday:'long'})}</span><strong>${dateLabel(d,{day:'numeric',month:'numeric'})}</strong>${d===state.clock.date?'<i>Dnes</i>':state.data?.dates?.includes(d)?'<i class="available">Menu</i>':'<i> </i>'}</button>`;}).join('')}</div><button class="week-arrow" data-shift="7" aria-label="Další týden">→</button><label class="calendar-label">Vybrat datum<input aria-label="Vybrat datum" id="date-picker" type="date" value="${state.date}"></label></div>`;}
function basket(){const {meals,company,closed:locked,orders}=state.data;const selected=meals.filter(m=>state.quantities[m.id]>0);const quantity=selected.reduce((s,m)=>s+state.quantities[m.id],0);const priceFor=m=>orders.find(o=>o.meal_id===m.id)?.price??m.price;const feeFor=m=>orders.find(o=>o.meal_id===m.id)?.fee??company.fee;const food=selected.reduce((s,m)=>s+state.quantities[m.id]*priceFor(m),0),fee=selected.reduce((s,m)=>s+state.quantities[m.id]*feeFor(m),0);return `<div class="basket-header"><span class="eyebrow">VÁŠ OBĚD</span><span class="basket-icon">♧</span><h2>Objednávka</h2><p>${dateLabel(state.date,{weekday:'long',day:'numeric',month:'long'})}</p></div><div class="basket-items">${selected.length?selected.map(m=>`<div class="basket-item"><b>${state.quantities[m.id]}×</b><span>${esc(m.name)}</span><strong>${money(state.quantities[m.id]*priceFor(m))}</strong></div>`).join(''):'<p class="muted">Vyberte si něco dobrého z dnešní nabídky. Stačí přidat počet porcí.</p>'}</div><div class="basket-details"><div><span>Počet porcí</span><b>${quantity}</b></div><div><span>${company.packaging==='own'?'Vlastní krabičky':'Jednorázové krabičky'}</span><b>${fee?money(fee):'Bez příplatku'}</b></div></div><div class="basket-total"><span>Celkem</span><strong>${money(food+fee)}</strong></div><button class="primary full" data-action="save-order" ${locked||(!state.dirty)?'disabled':''}>${locked?'Objednávky uzavřeny':state.dirty?(orders.length?'Uložit změny':'Potvrdit objednávku'):(orders.length?'✓ Objednávka potvrzena':'Vyberte počet porcí')} <span>→</span></button><p class="basket-foot">${locked?'Uzávěrka na tento den již proběhla.':'Objednávku můžete upravit do 8:00 v den rozvozu.'}</p>${state.dirty?'<p class="unsaved">Máte neuložené změny.</p>':''}`;}
function menuView(){const admin=state.user.role==='admin';const d=state.data;let meals=d.meals;return heading(admin?'Z NAŠÍ KUCHYNĚ':'POCTIVÁ KUCHYNĚ, BEZ STAROSTÍ',admin?'Jídelní lístek':'Co si dáte dobrého?',admin?'Připravte nabídku, ze které si firmy objednají svůj oběd.':'Vyberte oběd pro sebe i kolegy. O zbytek se postaráme my.',admin?'<button class="primary" data-action="import">↥ Importovat jídelníček</button>':'<span class="brand-chip">↟ &nbsp; Vaříme v Podkozí</span>')+datePicker()+`<div class="notice ${d.closed?'locked':''}"><span>${d.closed?'◷':'ⓘ'}</span><div><strong>${d.closed?'Na tento den už máme objednávky uzavřené.':'Na dobrý oběd je čas do 8:00.'}</strong><span>${d.closed?'Na další dny si můžete vybírat a objednávat dál.':'V den rozvozu se v 8:00 objednávky uzavřou. Dopředu objednávejte kdykoliv.'}</span></div>${d.closed?'<button class="text-button" data-action="next-day">Vybrat další den →</button>':''}</div><div class="menu-layout ${admin?'admin-menu':''}"><section><div class="section-top"><h2>${dateLabel(state.date,{weekday:'long',day:'numeric',month:'long'})}</h2><span>${d.meals.length} jídel v nabídce</span></div><div class="meal-list">${meals.length?meals.map((m,i)=>{const soup=m.category==='Polévka';const ordered=d.orders?.find(o=>o.meal_id===m.id);const q=state.quantities[m.id]||0;return `<article class="meal-card ${q?'chosen':''}"><div class="meal-number ${soup?'soup':''}">${soup?'≈':String(d.meals.filter(x=>x.category!=='Polévka').findIndex(x=>x.id===m.id)+1).padStart(2,'0')}</div><div class="meal-content"><span class="meal-category">${soup?'POLÉVKA':'HLAVNÍ JÍDLO'}${q&&!admin?'<span class="chosen-dot">● Ve vaší objednávce</span>':''}</span><h3>${esc(m.name)}</h3><p>${esc(m.description||'Poctivě připravené v naší kuchyni.')}</p><small>Alergeny: ${esc(m.allergens||'neuvedeny')}</small></div><div class="meal-right"><strong>${money(!admin&&ordered?ordered.price:m.price)}</strong>${admin?`<button class="secondary small" data-edit-meal="${m.id}" ${d.closed?'disabled':''}>Upravit</button>`:`<div class="stepper"><button aria-label="Odebrat porci: ${esc(m.name)}" data-qty="${m.id}" data-delta="-1" ${d.closed||q===0?'disabled':''}>−</button><input aria-label="Počet porcí: ${esc(m.name)}" type="number" min="0" max="500" value="${q}" data-quantity="${m.id}" ${d.closed?'disabled':''}><button aria-label="Přidat porci: ${esc(m.name)}" data-qty="${m.id}" data-delta="1" ${d.closed?'disabled':''}>＋</button></div>`}</div></article>`;}).join(''):empty('Tady se ještě vaří plán.','Na tento den zatím není zveřejněný jídelní lístek.')}</div><div class="menu-bottom"><span>↟</span><p><strong>Čerstvě uvařeno. Poctivě zabaleno.</strong><br>Každý pracovní den z kuchyně Srubu Podkozí.</p></div></section>${admin?'':`<aside><div class="basket" id="basket">${basket()}</div><div class="company-note"><span>♧</span><p><strong>${esc(d.company.name)}</strong><br>${d.company.price!==null?'Zobrazujeme vaše sjednané firemní ceny.':'Zobrazujeme ceny z jídelního lístku.'}</p></div></aside>`}</div>`;}
function dashboard(){const d=state.data;const byMeal={};for(const r of d.rows){byMeal[r.name]=(byMeal[r.name]||0)+r.quantity;}const firms=[...new Set(d.rows.map(r=>r.company_id))];const own=d.rows.filter(r=>r.packaging==='own').reduce((s,r)=>s+r.quantity,0);return heading('VŠECHNO NA JEDNOM MÍSTĚ','Dnes v kuchyni', 'Přesné počty pro vaření, balení i rozvoz.',`<a class="secondary" href="/api/report?date=${state.date}">↓ Kuchyňský list v Excelu · ${dateLabel(state.date,{day:'numeric',month:'numeric',year:'numeric'})}</a><button class="primary" data-action="print">Vytisknout přehled</button>`)+`<div class="dashboard-date"><input aria-label="Datum přehledu" type="date" id="date-picker" value="${state.date}"><span class="badge ${d.closed?'':'green'}">${d.closed?'Uzavřeno v 8:00':'Objednávky se ještě mohou měnit'}</span></div><div class="stats"><article><span>Celkem připravit</span><strong>${d.total}<small>porcí</small></strong><p>Polévky a hlavní jídla</p></article><article><span>Firem k rozvozu</span><strong>${d.firms}<small>${plural(d.firms,"firma","firmy","firem")}</small></strong><p>Každá objednávka na svém místě</p></article><article><span>Jednorázové krabičky</span><strong>${d.total-own}<small>ks</small></strong><p>${own} porcí do vlastních krabiček</p></article></div><div class="dashboard-grid"><section class="panel"><div class="panel-title"><h2>Co dnes uvařit</h2><span>CELKOVÉ POČTY</span></div>${Object.keys(byMeal).length?Object.entries(byMeal).map(([name,q],i)=>`<div class="kitchen-row"><span class="row-index">${String(i+1).padStart(2,'0')}</span><strong>${esc(name)}</strong><b>${q}<small>porcí</small></b></div>`).join(''):empty('Zatím žádné objednávky','Jakmile firma objedná, uvidíte zde součet porcí.')}</section><section class="panel olive-panel"><span class="eyebrow">RANNÍ SOUHRN</span><h2>Ráno víte,<br>na čem jste.</h2><p>Po uzávěrce v 8:00 připravíme přehled všech jídel a rozpis pro jednotlivé firmy.</p><div class="report-status">${d.report?.status==='sent'?'✓ Souhrn byl odeslán e-mailem':d.report?.status==='error'?'! Odeslání selhalo. Zkontrolujte nastavení.':d.report?'✓ Souhrn připraven ke stažení':'◷ Čekáme na ranní uzávěrku'}</div><button class="light-button" data-view="settings">Nastavení e-mailu →</button></section></div><div class="section-top"><h2>Připraveno pro firmy</h2><span>${firms.length} ${plural(firms.length,"objednávající firma","objednávající firmy","objednávajících firem")}</span></div><div class="delivery-grid">${firms.map(id=>{const rows=d.rows.filter(r=>r.company_id===id);return `<article class="panel delivery"><div class="delivery-head"><span class="avatar">${esc(rows[0].company.slice(0,2).toUpperCase())}</span><div><h3>${esc(rows[0].company)}</h3><p>${esc(rows[0].address||'Adresa není vyplněná')}</p></div><strong>${rows.reduce((s,r)=>s+r.quantity,0)}<small>porcí</small></strong></div>${rows.map(r=>`<div class="delivery-row"><b>${r.quantity}×</b><span>${esc(r.name)}</span><small>${r.packaging==='own'?'Vlastní':'Jednorázové'}</small></div>`).join('')}</article>`;}).join('')}</div>`;}
function companies(){const firms=state.data.companies.filter(c=>(c.name+' '+c.email).toLowerCase().includes(state.search.toLowerCase()));return heading('DOBRÉ VZTAHY ZAČÍNAJÍ OBĚDEM','Firmy a ceny','Přístupy, firemní ceny a krabičky přehledně na jednom místě.','<button class="primary" data-action="new-company">＋ Přidat firmu</button>')+`<div class="toolbar"><input id="company-search" type="search" placeholder="Hledat firmu nebo e-mail…" value="${esc(state.search)}" aria-label="Hledat firmu"><span>${firms.length} ${plural(firms.length,"firma","firmy","firem")}</span></div><div class="panel table-wrap"><table><thead><tr><th>Firma</th><th>Hlavní jídlo</th><th>Polévka</th><th>Krabičky</th><th>Stav</th><th></th></tr></thead><tbody>${firms.map(c=>`<tr><td><strong>${esc(c.name)}</strong><small>${esc(c.email)}</small></td><td>${c.price===null?'Dle menu':money(c.price)}</td><td>${c.soup_price===null?'Dle menu':money(c.soup_price)}</td><td>${c.packaging==='own'?'Vlastní':`Jednorázové · ${money(c.fee)}`}</td><td><span class="badge ${c.active?'green':''}">${c.active?'Aktivní':'Pozastavená'}</span></td><td><button class="secondary small" data-edit-company="${c.id}">Upravit</button></td></tr>`).join('')}</tbody></table>${firms.length?'':empty('Žádná firma','Přidejte první firmu nebo změňte hledání.')}</div><p class="footnote">Sjednané ceny se použijí pro nové objednávky. Již objednané porce si zachovají původní cenu.</p>`;}
function history(){const rows=state.data.rows;const dates=[...new Set(rows.map(r=>r.date))];return heading('PŘEHLED VAŠICH OBĚDŮ','Moje objednávky','Všechno, co jste si objednali, přehledně po dnech.')+`<div class="history-list">${dates.length?dates.map(date=>{const rs=rows.filter(r=>r.date===date);return `<article class="panel"><div class="panel-title"><h2>${dateLabel(date,{weekday:'long',day:'numeric',month:'long'})}</h2><button class="secondary small" data-open-order="${date}">Zobrazit objednávku →</button></div>${rs.map(r=>`<div class="history-row"><b>${r.quantity}×</b><span>${esc(r.name)}</span><strong>${money(r.quantity*(r.price+r.fee))}</strong></div>`).join('')}<div class="history-total"><span>Celkem včetně krabiček</span><strong>${money(rs.reduce((s,r)=>s+r.quantity*(r.price+r.fee),0))}</strong></div></article>`;}).join(''):empty('První oběd na vás teprve čeká','Vyberte si z poledního menu a potvrďte svou objednávku.')}</div>`;}
function settings(){const admin=state.user.role==='admin';const d=state.data;return heading('ABY VŠE FUNGOVALO','Nastavení',admin?'Ranní přehledy a zabezpečení vašeho účtu.':'Přihlašovací údaje a vaše firemní nastavení.')+`<div class="settings-grid">${admin?`<section class="panel form-panel"><h2>Ranní souhrn e-mailem</h2><p>Každý den po 8:00. Konečné počty jídel a rozpis pro firmy.</p><form id="settings-form"><label>E-mail pro ranní souhrn<input type="email" name="reportEmail" placeholder="provoz@vase-restaurace.cz" value="${esc(d.reportEmail)}"></label><div class="notice compact"><span>ⓘ</span><p>${d.emailReady?'E-mailová služba je nakonfigurována.':state.demo?'V místním demu se e-maily neposílají. Souhrny si můžete stáhnout v denním přehledu.':'Pro odesílání je potřeba připojit e-mailovou službu na serveru.'}</p></div><button class="primary">Uložit nastavení</button></form></section>`:`<section class="panel form-panel"><h2>${esc(state.user.name)}</h2><p>${esc(state.user.email)}</p><div class="notice compact"><p>Cenu a typ krabiček vám nastavuje restaurace. Pokud potřebujete změnu, obraťte se na obsluhu Srubu Podkozí.</p></div></section>`}<section class="panel form-panel"><h2>Změna hesla</h2><p>Pro bezpečné přihlášení používejte vlastní heslo.</p><form id="password-form"><label>Současné heslo<input name="current" type="password" required autocomplete="current-password" maxlength="128"></label><label>Nové heslo<input name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password" placeholder="Alespoň 12 znaků"></label><label>Nové heslo znovu<input name="confirm" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></label><button class="secondary">Změnit heslo</button></form></section></div>`;}
function login(){return `<div class="login-layout"><section class="login-story">${brand()}<div><span class="eyebrow">FIREMNÍ STRAVOVÁNÍ OD SRUBU</span><h1>Dobrý oběd.<br>Každý pracovní den.</h1><p>Poctivá kuchyně z Podkozí.<br>Pro vás a celý váš tým.</p><div class="story-lines">↟ &nbsp; Čerstvě uvařeno &nbsp; · &nbsp; S chutí doručeno</div></div><small>SRUB PODKOZÍ · RODINNÁ RESTAURACE</small></section><section class="login-form"><div class="login-inner"><p class="eyebrow">VÍTEJTE U NÁS</p><h2>Váš oběd začíná tady.</h2><p>Přihlaste se do svého firemního účtu<br>nebo do správy restaurace.</p><form id="login-form"><label>E-mail<input type="email" name="email" placeholder="vas@email.cz" required autocomplete="username"></label><label>Heslo<input type="password" name="password" placeholder="Vaše heslo" required autocomplete="current-password" maxlength="128"></label><button class="primary full">Přihlásit se <span>→</span></button><p class="form-error" role="alert"></p></form>${state.demo?'<div class="demo-box"><span>MÍSTNÍ UKÁZKA APLIKACE</span><p>Prohlédněte si obě strany jednoho oběda.</p><div><button class="secondary" data-demo="company">Vstoupit jako firma →</button><button class="secondary" data-demo="admin">Správa restaurace →</button></div><small>Ukázkové účty a objednávky. E-maily se neodesílají.</small></div>':'<p class="muted">Nemáte přístup nebo jste zapomněli heslo? Obraťte se na správce restaurace.</p>'}<a class="back-site" href="https://www.srubpodkozi.cz/" target="_blank" rel="noreferrer">← Web restaurace Srub Podkozí</a></div></section></div>`;}
}
async function render(){const id=++renderId;try{if(!state.user){$('#app').innerHTML=login();return;}const v=state.view;let data;if(v==='menu')data=await api('menu?date='+state.date);if((v==='dashboard'||v==='delivery')&&state.user.role==='company')data=await api('history');else if(v==='dashboard'||v==='companies'||v==='delivery')data=await api('dashboard?date='+state.date);if(v==='orders')data=state.user.role!=='company'?await api(`firm-orders?company=${state.firm||''}&date=${state.date}`):await api('history');if(v==='kitchen')data=await api('dashboard?date='+state.date);if(v==='settings')data=state.user.role==='admin'?await api('settings'):{};if(v==='dashboard'&&state.user.role==='owner')data=await api('owner-summary');if(v==='orders'&&data&&(state.user.role==='company'?true:Boolean(data.company))){try{data.payment=await api(`payment?date=${state.date}${state.user.role==='admin'?'&company='+data.company.id:''}`);}catch{data.payment=null;}}if(id!==renderId)return;state.data=data;if(v==='orders'&&state.user.role==='admin')state.firm=data.company?.id;if(v==='menu'){state.quantities=Object.fromEntries(data.orders.map(o=>[o.meal_id,o.quantity]));state.dirty=false;}$('#app').innerHTML=shell(({menu:menuView,dashboard:(state.user.role==='owner'?ownerDashboard:state.user.role==='admin'?dashboard:companyOverview),companies,orders:(state.user.role==='company'?history:adminOrders),kitchen:kitchenSheet,delivery:(state.user.role==='admin'?(globalThis.delivery||dashboard):companyDelivery),settings}[v])());}catch(e){toast(e.message,true);}}
function canLeave(){return !state.dirty||confirm('Máte neuložené změny objednávky. Opravdu chcete odejít bez uložení?');}
function openModal(html){const d=$('#modal');d.innerHTML=`<button class="modal-close" aria-label="Zavřít" data-action="close-modal">×</button>${html}<p class="form-error" role="alert"></p>`;d.showModal();}
function input(label,name,value='',type='text',extra=''){return `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;}
function companyModal(id){const c=state.data.companies.find(c=>c.id===id)||{};openModal(`<p class="eyebrow">FIREMNÍ ÚČET</p><h2>${id?'Upravit firmu':'Nová firma'}</h2><p>Připravte přístup a podmínky stravování.</p><form id="company-form" data-id="${id||''}">${input('Název firmy','name',c.name,'text','required maxlength="200"')}${input('Přihlašovací e-mail','email',c.email,'email','required')}${input('Adresa rozvozu','address',c.address)}<div class="form-row">${input('Cena hlavního jídla (Kč)','price',c.price==null?'':c.price/100,'number','min="0" max="10000" step="1" placeholder="cena z lístku"')}${input('Cena polévky (Kč)','soup_price',c.soup_price==null?'':c.soup_price/100,'number','min="0" max="10000" step="1" placeholder="cena z lístku"')}</div><div class="form-row"><label>Typ krabiček<select name="packaging"><option value="own" ${c.packaging==='own'?'selected':''}>Vlastní krabičky</option><option value="disposable" ${c.packaging==='disposable'?'selected':''}>Jednorázové krabičky</option></select></label>${input('Příplatek za krabičku (Kč)','fee',(id?(c.fee||0):1000)/100,'number','min="0" max="10000" step="1"')}</div>${input(id?'Nové heslo (nechte prázdné pro zachování)':'Heslo pro první přihlášení','password','','password',`${id?'':'required'} minlength="12" maxlength="128" autocomplete="new-password"`)}${id?`<label class="checkbox"><input name="active" type="checkbox" ${c.active?'checked':''}>Účet firmy je aktivní</label>`:''}<p class="footnote">Prázdná cena použije cenu z menu. Změna cen platí pro nové objednávky. Heslo předáte firmě samostatně.</p><button class="primary full">${id?'Uložit firmu':'Vytvořit firemní účet'}</button></form>`);}
function mealModal(id){const m=state.data.meals.find(m=>m.id===id)||{};openModal(`<p class="eyebrow">POLEDNÍ NABÍDKA</p><h2>${id?'Upravit jídlo':'Přidat něco dobrého'}</h2><form id="meal-form" data-id="${id||''}"><div class="form-row">${input('Den nabídky','date',m.date||state.date,'date','required')}<label>Druh<select name="category"><option ${m.category!=='Polévka'?'selected':''}>Hlavní jídlo</option><option ${m.category==='Polévka'?'selected':''}>Polévka</option></select></label></div>${input('Název jídla','name',m.name,'text','required maxlength="200"')}${input('Příloha a popis','description',m.description,'text','maxlength="500"')}<div class="form-row">${input('Cena z menu (Kč)','price',m.price?m.price/100:'','number','required min="0" max="10000" step="1"')}${input('Alergeny','allergens',m.allergens,'text','placeholder="1, 3, 7" maxlength="80"')}</div><button class="primary full">Uložit do jídelního lístku</button>${id?`<button class="danger-link" type="button" data-delete-meal="${id}">Odstranit jídlo bez objednávek</button>`:''}</form>`);}
let imported=[];
function importModal(){imported=[];openModal(`<p class="eyebrow">CELÝ TÝDEN NAJEDNOU</p><h2>Import jídelního lístku</h2><p>Nahrajte CSV soubor. Před uložením uvidíte náhled.</p><div class="notice compact"><p>Fotku jídelníčku zatím automaticky nepřepisujeme. Vámi dodané menu 7.–11. 9. je v ukázce již zadané.</p></div><label class="upload">↥ Vybrat CSV soubor<input type="file" id="csv-file" accept=".csv,text/csv"></label><p class="footnote">Sloupce oddělené středníkem: datum;nazev;popis;alergeny;cena;typ<br>Datum: 2026-09-14. Typ: Polévka nebo Hlavní jídlo.</p><button class="text-button" data-action="csv-template">↓ Stáhnout vzor CSV</button><div id="import-preview"></div>`);}
function parseCSV(source){const rows=[];let row=[],field='',quote=false;const s=source.replace(/^\uFEFF/,'');for(let i=0;i<s.length;i++){const c=s[i];if(c==='"'){if(quote&&s[i+1]==='"'){field+='"';i++;}else quote=!quote;}else if(c===';'&&!quote){row.push(field);field='';}else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&s[i+1]==='\n')i++;row.push(field);if(row.some(x=>x.trim()))rows.push(row);row=[];field='';}else field+=c;}if(quote)throw new Error('CSV obsahuje neuzavřené uvozovky.');row.push(field);if(row.some(x=>x.trim()))rows.push(row);if(rows.shift()?.join(';').trim()!=='datum;nazev;popis;alergeny;cena;typ')throw new Error('Hlavička CSV neodpovídá vzoru.');return rows.map((r,i)=>{if(r.length!==6||!r[0]||!r[1]||!r[4].trim()||!Number.isFinite(Number(r[4].replace(',','.')))||!['Polévka','Hlavní jídlo'].includes(r[5]))throw new Error(`Zkontrolujte řádek ${i+2}.`);return {date:r[0],name:r[1],description:r[2],allergens:r[3],price:r[4].replace(',','.'),category:r[5]};});}
function download(name,content){const url=URL.createObjectURL(new Blob(['\uFEFF'+content],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
document.addEventListener('click',async event=>{const b=event.target.closest('button,a[data-action]');if(!b)return;try{
 if(b.dataset.view){if(!canLeave())return;state.view=b.dataset.view;state.search='';await render();}
 if(b.dataset.date||b.dataset.shift){if(!canLeave())return;state.date=b.dataset.date||plus(state.date,Number(b.dataset.shift));await render();}
 if(b.dataset.filter){state.filter=b.dataset.filter;$('#content').innerHTML=menuView();}
 if(b.dataset.qty){const id=Number(b.dataset.qty),q=Math.max(0,Math.min(500,(state.quantities[id]||0)+Number(b.dataset.delta)));state.quantities[id]=q;state.dirty=true;$('#content').innerHTML=menuView();}
 if(b.dataset.demo){b.disabled=true;await api('login',{email:b.dataset.demo==='admin'?'restaurace@demo.cz':'zkouska@demo.cz',password:'SrubDemo2026!'});await boot();}
 if(b.dataset.editCompany)companyModal(Number(b.dataset.editCompany));
 if(b.dataset.removeCompany){const id=Number(b.dataset.removeCompany);const c=state.data.companies.find(x=>x.id===id);
  openModal(`<h2>Odebrat firmu</h2><p>Opravdu chcete odebrat firmu <strong>${esc(c.name)}</strong>? Přijde tím i o přihlášení do aplikace.</p><button class="primary full" data-confirm-remove="${id}">Ano, odebrat</button><button class="secondary full" data-action="close-modal">Zrušit</button>`);}
 if(b.dataset.confirmRemove){const id=Number(b.dataset.confirmRemove);b.disabled=true;const r=await api('companies/delete',{id});$('#modal').close();toast(`Firma ${r.name} byla odebrána.`);await render();}
 if(b.dataset.editMeal)mealModal(Number(b.dataset.editMeal));
 if(b.dataset.openOrder){state.date=b.dataset.openOrder;state.view='menu';await render();}
 if(b.dataset.deleteMeal){if(confirm('Odstranit toto jídlo z nabídky?')){await api('meals/delete',{id:Number(b.dataset.deleteMeal)});$('#modal').close();await render();toast('Jídlo bylo odstraněno.');}}
 const a=b.dataset.action;
 if(a==='logout'){if(!canLeave())return;await api('logout',{});state.dirty=false;await boot();}
 if(a==='close-modal')$('#modal').close();
 if(a==='new-company')companyModal();if(a==='new-meal')mealModal();if(a==='import')importModal();if(a==='test-mail'){b.disabled=true;try{const r=await api('report/test',{date:state.date});toast(`Zkušební e-mail odeslán na ${r.to}.`);}finally{b.disabled=false;}}if(a==='print')window.print();
 if(a==='next-day'){state.date=state.data.dates.find(d=>d>state.clock.date)||plus(state.clock.date,1);await render();}
 if(a==='save-order'){b.disabled=true;await api('order',{date:state.date,items:state.data.meals.map(m=>({id:m.id,quantity:state.quantities[m.id]||0}))});state.dirty=false;await render();toast('Objednávka je uložená. Děkujeme a dobrou chuť!');}
 if(a==='csv-template')download('vzor-jidelnicku.csv','datum;nazev;popis;alergeny;cena;typ\n'+plus(state.clock.date,1)+';Hovězí vývar;Maso, nudle, zelenina;1, 3, 9, 12;60;Polévka\n');
 if(a==='save-import'){const bad=importDraft.filter(m=>!m.name||!(m.price>0));if(bad.length)throw new Error(`${bad.length} jídel nemá název nebo cenu. Doplňte je před uložením.`);b.disabled=true;let r;try{r=await api('meals',{meals:importDraft});}finally{b.disabled=false;}state.date=r.from||importDraft[0].date;$('#modal').close();await render();const kratce=d=>dateLabel(d,{day:'numeric',month:'numeric'});const rozsah=r.from===r.to?kratce(r.from):`${kratce(r.from)} – ${kratce(r.to)}`;const kdo=r.companies===1?'1 firma':`všech ${r.companies} ${plural(r.companies,'firma','firmy','firem')}`;toast(`Jídelníček na ${rozsah} je uložený (${r.saved} ${plural(r.saved,'jídlo','jídla','jídel')}) – vidí ho ${kdo}.`,false,9000);}
 }catch(e){b.disabled=false;const target=$('#modal[open] .form-error');if(target)target.textContent=e.message;else toast(e.message,true);}});
document.addEventListener('change',async e=>{try{if(e.target.name==='packaging'){const fee=e.target.closest('form')?.querySelector('.fee-field');if(fee)fee.hidden=e.target.value==='own';}if(e.target.id==='date-picker'){if(!canLeave()){e.target.value=state.date;return;}if(e.target.value){state.date=e.target.value;await render();}}
 if(e.target.dataset.quantity){const n=Number(e.target.value);if(!Number.isInteger(n)||n<0||n>500){e.target.value=state.quantities[e.target.dataset.quantity]||0;throw new Error('Zadejte celé číslo od 0 do 500.');}state.quantities[e.target.dataset.quantity]=n;state.dirty=true;$('#content').innerHTML=menuView();}
 if(e.target.id==='menu-file'){const f=e.target.files[0];if(!f)return;const box=$('#import-preview');const nameEl=document.querySelector('.dropzone-file');if(nameEl)nameEl.textContent=`${f.name} · ${Math.max(1,Math.round(f.size/1024))} kB`;
  const monday=(()=>{const w=new Date(state.date+'T12:00:00Z').getUTCDay();return plus(state.date,-((w+6)%7));})();
  if(/\.csv$/i.test(f.name)||f.type==='text/csv'){
   if(f.size>100000)throw new Error('CSV smí mít nejvýše 100 kB.');
   const rows=parseCSV(await f.text());
   if(!rows.length||rows.length>100)throw new Error('CSV musí obsahovat 1 až 100 jídel.');
   const meals=rows.map(m=>({date:m.date,category:m.typ||m.category||'Hlavní jídlo',name:m.name,description:m.popis||m.description||'',allergens:m.alergeny||m.allergens||'',price:Number(m.price),warnings:[]}));
   box.innerHTML=importPreview(meals,[],'');return;}
  if(f.size>8*1024*1024)throw new Error('Soubor smí mít nejvýše 8 MB.');
  const r=await readMenuWithProgress(f,monday,box);
  box.innerHTML=importPreview(r.meals,r.notes,r.poznamka,r.weekDates);}
 }catch(err){toast(err.message,true);}});
document.addEventListener('input',e=>{if(e.target.dataset.draft!==undefined){const i=Number(e.target.dataset.draft),f=e.target.dataset.field;const v=f==='price'?(e.target.value===''?null:Number(e.target.value)):e.target.value;importDraft[i][f]=v;const row=e.target.closest('.import-row');if(row){const ok=importDraft[i].name&&importDraft[i].price>0;row.classList.toggle('has-warn',!ok);}return;}if(e.target.id==='company-search'){state.search=e.target.value;const start=e.target.selectionStart;$('#content').innerHTML=companies();$('#company-search').focus();$('#company-search').setSelectionRange(start,start);}});
document.addEventListener('submit',async e=>{e.preventDefault();const f=e.target,b=f.querySelector('button[type="submit"],button:not([type])');const data=Object.fromEntries(new FormData(f));if(b)b.disabled=true;try{
 if(f.id==='login-form'){await api('login',data);await boot();}
 if(f.id==='company-form'){await api('companies',{...data,id:f.dataset.id?Number(f.dataset.id):undefined,active:f.dataset.id?f.elements.active.checked:true});$('#modal').close();await render();toast('Firemní účet je uložený.');}
 if(f.id==='meal-form'){await api('meals',{...data,id:f.dataset.id?Number(f.dataset.id):undefined});state.date=data.date;$('#modal').close();await render();toast('Jídlo je v nabídce.');}
 if(f.id==='settings-form'){await api('settings',data);toast('Nastavení je uložené.');}
 if(f.id==='password-form'){if(data.password!==data.confirm)throw new Error('Nová hesla se neshodují.');await api('password',data);state.dirty=false;await boot();toast('Heslo změněno. Přihlaste se novým heslem.');}
 }catch(err){const error=f.querySelector('.form-error')||$('#modal[open] .form-error');if(error)error.textContent=err.message;else toast(err.message,true);}finally{if(b)b.disabled=false;}});
window.addEventListener('beforeunload',e=>{if(state.dirty){e.preventDefault();e.returnValue='';}});
// Po přihlášení a přepnutí účtu ukáže dnešek; o víkendu nadcházející pondělí, kdy se dá objednávat.
function workday(date){const day=new Date(date+'T12:00:00Z').getUTCDay();return day===6?plus(date,2):day===0?plus(date,1):date;}
async function boot(){const me=await api('me');state={...state,...me,date:workday(me.clock.date),view:me.user?.role==='company'?'menu':'dashboard',dirty:false,filter:'all'};if(me.demo&&me.user)state.devUsers=(await api('dev-users')).users;await render();}
boot().catch(e=>{$('#app').innerHTML=empty('Aplikace není dostupná',esc(e.message));});
setInterval(async()=>{if(!state.user||state.view!=='menu')return;try{const {clock}=await api('me');state.clock=clock;const locked=state.date<clock.date||(state.date===clock.date&&clock.hour>=8);if(state.data&&locked!==state.data.closed){state.data.closed=locked;$('#content').innerHTML=menuView();}}catch{/* Server validates every save even during a temporary connection loss. */}},30000);

// Jednodušší pohled pro firmy: jen Jídelníček, Souhrn a Účet.
function heading(kicker,title,subtitle,actions=''){return `<div class="heading"><div><p class="eyebrow">${kicker}</p><h1>${title}</h1><p class="subtitle">${subtitle}</p></div>${actions?`<div class="heading-actions">${actions}</div>`:''}</div>`;}
function datePicker(){const weekday=new Date(state.date+'T12:00:00Z').getUTCDay(),monday=plus(state.date,-((weekday+6)%7));return `<div class="week"><button class="week-arrow" data-shift="-7">←</button><div class="days">${Array.from({length:5},(_,i)=>{const date=plus(monday,i);return `<button data-date="${date}" class="day ${state.date===date?'selected':''}"><span>${dateLabel(date,{weekday:'long'})}</span><strong>${dateLabel(date,{day:'numeric',month:'numeric'})}</strong></button>`;}).join('')}</div><button class="week-arrow" data-shift="7">→</button></div>`;}
function dashboard(){const d=state.data,byMeal={};for(const row of d.rows)byMeal[row.name]=(byMeal[row.name]||0)+row.quantity;return heading('PŘEHLED RESTAURACE','Dnes v kuchyni','Počty pro vaření, balení a rozvoz.',`<a class="secondary" href="/api/report?date=${state.date}">Kuchyňský list v Excelu · ${dateLabel(state.date,{day:'numeric',month:'numeric',year:'numeric'})}</a>`)+`<div class="dashboard-date"><input aria-label="Datum přehledu" type="date" id="date-picker" value="${state.date}"><span class="badge">${d.closed?'Uzavřeno v 8:00':'Objednávky jsou otevřené'}</span></div><section class="panel"><div class="panel-title"><h2>Co připravit</h2><span>${d.total} porcí</span></div>${Object.entries(byMeal).map(([name,quantity])=>`<div class="kitchen-row"><strong>${esc(name)}</strong><b>${quantity}<small>porcí</small></b></div>`).join('')||'<p class="muted">Zatím žádné objednávky.</p>'}</section>`;}
function companies(){const firms=state.data.companies.filter(c=>(c.name+' '+c.email).toLowerCase().includes(state.search.toLowerCase()));return heading('SPRÁVA FIREM','Firmy','Přístupy, ceny a typ krabiček.','<button class="primary" data-action="new-company">Přidat firmu</button>')+`<div class="toolbar"><input id="company-search" type="search" placeholder="Hledat firmu" value="${esc(state.search)}"><span>${firms.length} ${plural(firms.length,'firma','firmy','firem')}</span></div><div class="panel table-wrap"><table><thead><tr><th>Firma</th><th>Hlavní jídlo</th><th>Polévka</th><th>Krabičky</th><th></th></tr></thead><tbody>${firms.map(c=>`<tr><td><strong>${esc(c.name)}</strong><small>${esc(c.email)}</small></td><td>${c.price==null?'Dle menu':money(c.price)}</td><td>${c.soup_price==null?'Dle menu':money(c.soup_price)}</td><td>${c.packaging==='own'?'Vlastní':`Jednorázové · ${money(c.fee)}`}</td><td><button class="secondary small" data-edit-company="${c.id}">Upravit</button></td></tr>`).join('')}</tbody></table></div>`;}
var shell = function(content){
 const admin=state.user.role==='admin'; const links=admin?[['dashboard','Přehled'],['menu','Jídelníček'],['companies','Firmy'],['settings','Účet']]:[['menu','Jídelníček'],['orders','Souhrn'],['settings','Účet']];
 return `<div class="simple-app"><header class="simple-header"><div class="header-inner"><a href="/" class="simple-brand"><img src="/logo.png" alt="" width="36" height="36">Srub Podkozí</a><span class="signed-name">${esc(admin?'Správa restaurace':state.user.name)}</span></div><nav class="simple-nav">${links.map(([view,label])=>`<button class="${state.view===view?'selected':''}" data-view="${view}">${label}</button>`).join('')}</nav></header><main id="content" class="simple-content">${content}</main>${state.demo?'<div class="demo-label">Ukázková aplikace · testovací data</div>':''}</div>`;
};
function simpleWeek(showDays=true){
 const weekday=new Date(state.date+'T12:00:00Z').getUTCDay(),monday=plus(state.date,-((weekday+6)%7));
 return `<div class="simple-week"><div class="week-switch"><button class="secondary" data-shift="-7">←</button><strong>${dateLabel(monday,{day:'numeric',month:'numeric'})} – ${dateLabel(plus(monday,4),{day:'numeric',month:'numeric',year:'numeric'})}</strong><button class="secondary" data-shift="7">→</button></div>${showDays?`<div class="simple-days">${Array.from({length:5},(_,i)=>{const date=plus(monday,i);return `<button class="${date===state.date?'selected':''}" data-date="${date}"><span>${dateLabel(date,{weekday:'long'})}</span><b>${dateLabel(date,{day:'numeric',month:'numeric'})}</b></button>`;}).join('')}</div>`:''}</div>`;
}
var menuView = function(){if(state.user.role==='company')return simpleMenu();return adminMenuView();};
function adminMenuView(){
 const d=state.data;
 const meals=d.meals;
 return `<div class="simple-title"><h1>Jídelníček</h1><p>Připravte nabídku pro firmy.</p></div><div class="simple-actions"><button class="primary" data-action="import">↥ Importovat jídelníček</button></div>${simpleWeek()}<div class="simple-day-heading"><h2>${dateLabel(state.date,{weekday:'long',day:'numeric',month:'long'})}</h2><span class="cutoff">${d.closed?'Objednávky uzavřeny':'Objednávky do 8:00 v den rozvozu'}</span></div>${d.closed?'<p class="plain-notice">Na tento den jsou objednávky uzavřené, menu už nelze měnit.</p>':''}<div class="simple-meals admin-menu">${meals.map(m=>`<article class="simple-meal is-listed"><div class="simple-meal-text"><span class="meal-type">${esc(m.category)}</span><h3>${esc(m.name)}</h3><p class="meal-meta">${m.description?esc(m.description)+' ':''}<small>Alergeny: ${esc(m.allergens||'neuvedeny')}</small></p></div><div class="simple-meal-action"><strong>${money(m.price)}</strong><button class="secondary" data-edit-meal="${m.id}" ${d.closed?'disabled':''}>Upravit</button></div></article>`).join('')||empty('Menu není připravené','Nahrajte jídelníček na tento týden.')}</div>`;
}
function simpleMenu(){
 const d=state.data,total=d.orders.reduce((sum,o)=>sum+o.quantity,0);
 return `<div class="simple-title"><h1>Jídelníček</h1><p>Vyberte den a objednejte si jídlo.</p></div>${simpleWeek()}<div class="simple-day-heading"><h2>${dateLabel(state.date,{weekday:'long',day:'numeric',month:'long'})}</h2>${d.closed?'':'<span class="cutoff">Objednávky do 8:00 v den rozvozu</span>'}</div>${d.edited?editNote([{date:state.date,edited_at:d.edited}],state.date):''}${d.closed?'<p class="change-call">Pro změnu jídla volejte <a href="tel:+420602122100">+420 602 122 100</a></p><p class="plain-notice">Na tento den už nelze objednávat. Vyberte jiný den.</p>':''}<div class="simple-meals">${d.meals.map(m=>{const o=d.orders.find(x=>x.meal_id===m.id);return `<article class="simple-meal ${o?'is-ordered':''}"><div class="simple-meal-text"><span class="meal-type">${esc(m.category)}</span><h3>${esc(m.name)}</h3><p class="meal-meta">${m.description?esc(m.description)+' ':''}<small>Alergeny: ${esc(m.allergens||'neuvedeny')}</small></p>${o?`<div class="ordered-label">✓ Objednáno ${o.quantity}×</div>`:''}</div><div class="simple-meal-action"><div class="price-stack"><strong>${money(o?.price??m.price)}</strong>${boxFee(o,d.company)?`<small class="box-fee">+ ${money(boxFee(o,d.company))} krabička</small>`:''}</div><button class="${o?'secondary':'primary'}" data-order-meal="${m.id}" ${d.closed?'disabled':''}>${d.closed?'Uzavřeno':o?'Změnit počet':'Objednat'}</button></div></article>`;}).join('')||empty('Jídelníček není připravený','Zkuste jiný den.')}</div>${total?`<div class="simple-day-total"><div><strong>Na tento den máte ${total} ${plural(total,'porci','porce','porcí')}.</strong><p>Objednávky jsou uložené.</p></div><button class="secondary" data-view="orders">Zobrazit souhrn →</button></div>`:''}`;
}
var history = function(){
 const weekday=new Date(state.date+'T12:00:00Z').getUTCDay(),monday=plus(state.date,-((weekday+6)%7));
 const days=Array.from({length:5},(_,i)=>{const date=plus(monday,i),rows=state.data.rows.filter(r=>r.date===date);return {date,rows,qty:rows.reduce((s,r)=>s+r.quantity,0),sum:rows.reduce((s,r)=>s+r.quantity*(r.price+r.fee),0),locked:date<state.clock.date||(date===state.clock.date&&state.clock.hour>=8),hasMenu:state.data.menuDates?.includes(date)};});
 const totalQty=days.reduce((s,d)=>s+d.qty,0),totalSum=days.reduce((s,d)=>s+d.sum,0),orderedDays=days.filter(d=>d.qty).length;
 return `<section class="delivery-view company-summary"><header class="delivery-view-head"><div><h1>Objednávky</h1><p>Přehled obědů na celý týden.</p></div></header>${simpleWeek(false)}<div class="delivery-view-note"><span>${totalQty}</span><p>${plural(totalQty,'porce','porce','porcí')} na tento týden<br><small>${orderedDays} ${plural(orderedDays,'den','dny','dnů')} s objednávkou</small></p></div><div class="delivery-route">${days.map((d,i)=>{const action=d.qty?`<button class="secondary stop-action" data-open-order="${d.date}">${d.locked?'Zobrazit':'Upravit'}</button>`:(!d.locked&&d.hasMenu?`<button class="primary stop-action" data-open-order="${d.date}">Vybrat jídlo</button>`:'');return `<article class="route-stop ${d.qty?'has-order':''}"><span class="route-number">${i+1}</span><div class="route-stop-main"><div class="stop-head"><h2>${dateLabel(d.date,{weekday:'long',day:'numeric',month:'long'})}</h2>${action}</div>${editNote(state.data.edits,d.date)}${d.qty?`<div class="route-meals">${d.rows.map(r=>`<span><b>${r.quantity}×</b><em>${esc(r.name)}</em><i>${money(r.quantity*(r.price+r.fee))}</i></span>`).join('')}</div><div class="stop-total"><span class="stop-count"><span class="stop-tag">✓ Objednáno</span>${d.qty} ${plural(d.qty,'porce','porce','porcí')}</span><span class="stop-sum">Celkem<b>${money(d.sum)}</b></span></div>`:`<p>${d.locked?'Objednávání na tento den už skončilo.':d.hasMenu?'Vyberte si jídlo do 8:00 v den rozvozu.':'Jakmile restaurace přidá menu, můžete objednávat.'}</p>`}</div></article>`;}).join('')}</div><footer class="admin-orders-total"><span>Celkem za týden<small>${totalQty} ${plural(totalQty,'porce','porce','porcí')} dohromady</small></span><strong>${money(totalSum)}</strong></footer>${payCard(state.data.payment)}</section>`;
};
var settings = function(){if(state.user.role==='admin')return adminSettings();return `<div class="simple-title"><h1>Účet</h1></div><section class="panel account-info"><h2>${esc(state.user.name)}</h2><p>${esc(state.user.email)}</p>${state.user.role==='owner'?'<p>Účet jen pro sledování tržeb. Nic v aplikaci nemění a nikde se nezobrazuje.</p>':'<p>Ceny a krabičky vám nastavuje restaurace.</p>'}<button class="secondary" data-action="logout">Odhlásit se</button></section><details class="panel password-details"><summary>Změnit heslo</summary><form id="password-form">${input('Současné heslo','current','','password','required autocomplete="current-password" maxlength="128"')}${input('Nové heslo','password','','password','required minlength="12" maxlength="128" autocomplete="new-password"')}${input('Nové heslo znovu','confirm','','password','required minlength="12" maxlength="128" autocomplete="new-password"')}<button class="primary">Uložit nové heslo</button></form></details>`;};
function adminSettings(){const d=state.data;return heading('NASTAVENÍ','Nastavení','Ranní přehledy a zabezpečení účtu.')+`<div class="settings-grid"><section class="panel form-panel"><h2>Ranní souhrn e-mailem</h2><form id="settings-form"><label>E-mail pro ranní souhrn<input type="email" name="reportEmail" value="${esc(d.reportEmail)}"></label><button class="primary">Uložit nastavení</button></form></section></div>`;}
var login = function(){return `<main class="simple-login"><a class="simple-brand" href="/"><img src="/logo.png" alt="" width="40" height="40">Srub Podkozí</a><h1>Objednávky obědů</h1><p>Přihlaste se ke svému účtu.</p><form id="login-form">${input('E-mail','email','','email','required autocomplete="username"')}${input('Heslo','password','','password','required autocomplete="current-password" maxlength="128"')}<button class="primary full">Přihlásit se</button><p class="form-error" role="alert"></p></form>${state.demo?'<section class="demo-box"><strong>Vyzkoušet aplikaci</strong><button class="secondary full" data-demo="company">Pohled firmy</button><button class="secondary full" data-demo="admin">Správa restaurace</button><small>Ukázková data. E-maily se neodesílají.</small></section>':''}</main>`;};
function orderModal(id){const m=state.data.meals.find(x=>x.id===id);if(!m||state.data.closed)return;const o=state.data.orders.find(x=>x.meal_id===id),q=o?.quantity||1;openModal(`<h2>${esc(m.name)}</h2><p>${money(o?.price??m.price)} za porci${boxFee(o,state.data.company)?` + ${money(boxFee(o,state.data.company))} za jednorázovou krabičku`:''}</p><form id="simple-order-form" data-id="${id}"><label>Kolik porcí chcete?</label><div class="quantity-picker"><button type="button" data-count-delta="-1">−</button><input id="portion-count" name="quantity" type="number" min="1" max="500" value="${q}" required><button type="button" data-count-delta="1">＋</button></div><button class="primary full">${o?'Uložit změnu':'Potvrdit objednávku'}</button>${o?`<button class="secondary full cancel-order" type="button" data-cancel-order="${id}">Zrušit toto jídlo</button>`:''}</form>`);}
document.addEventListener('click',async event=>{const b=event.target.closest('button');if(!b)return;try{if(b.dataset.orderMeal)orderModal(Number(b.dataset.orderMeal));if(b.dataset.countDelta){const input=$('#portion-count');input.value=Math.max(1,Math.min(500,Number(input.value||1)+Number(b.dataset.countDelta)));}if(b.dataset.cancelOrder){b.disabled=true;await api('order',{date:state.date,items:[{id:Number(b.dataset.cancelOrder),quantity:0}]});$('#modal').close();await render();toast('Jídlo je z objednávky odebrané.');}}catch(error){b.disabled=false;toast(error.message,true);}});
document.addEventListener('submit',async event=>{if(event.target.id!=='simple-order-form')return;event.preventDefault();const form=event.target,button=form.querySelector('.primary');button.disabled=true;try{const quantity=Number(new FormData(form).get('quantity'));if(!Number.isInteger(quantity)||quantity<1||quantity>500)throw new Error('Zadejte počet porcí od 1 do 500.');await api('order',{date:state.date,items:[{id:Number(form.dataset.id),quantity}]});$('#modal').close();await render();toast('Objednávka je uložená.');}catch(error){$('#modal .form-error').textContent=error.message;button.disabled=false;}});


/* Rozložení převzaté z mobilního rytmu fitness aplikace: kompaktní hlavička,
   dotykové plochy min. 48 px a fixní spodní navigace se symbolem i popiskem. */
shell = function(content){
  const admin=state.user.role==='admin';
  const links=admin
    ? [['dashboard','Přehled','⌂'],['menu','Jídelníček','▤'],['companies','Firmy','♧'],['settings','Účet','⚙']]
    : [['menu','Jídelníček','▤'],['orders','Souhrn','✓'],['settings','Účet','◉']];
  return `<div class="fitness-shell">
    <header class="fitness-header"><a href="/" class="fitness-brand"><img src="/logo.png" alt="" width="36" height="36"><span>Restaurace Srub Podkozí<small>${admin?'SPRÁVA RESTAURACE':'FIREMNÍ STRAVOVÁNÍ'}</small></span></a><div class="fitness-account"><span>${esc(admin?'Správa':state.user.name)}</span><button data-action="logout" aria-label="Odhlásit se">↪ <b>Odhlásit</b></button></div></header>
    <main id="content" class="fitness-content">${content}</main>
    <nav class="fitness-bottom-nav" aria-label="Hlavní navigace"><div>${links.map(([view,label,icon])=>`<button class="${state.view===view?'selected':''}" data-view="${view}" aria-current="${state.view===view?'page':'false'}"><span class="fitness-nav-icon" aria-hidden="true">${icon}</span><span>${label}</span></button>`).join('')}</div></nav>
    ${state.demo?'<div class="demo-label">Ukázková aplikace · testovací data</div>':''}
  </div>`;
};

// Virtuální přepínač je dostupný výhradně v lokálním demu (DEMO=true).
// Server kontroluje režim i při přímém volání API; v produkci cesta neexistuje.
function devSwitcher(){
  if(!state.demo||!state.devUsers?.length)return '';
  const groups=[['Správa',state.devUsers.filter(u=>u.role==='admin')],['Firmy',state.devUsers.filter(u=>u.role==='company')]];
  return `<details class="dev-switcher"><summary><span aria-hidden="true">⚗</span> Virtuální přepínač účtů <small>— ${esc(state.user.name)}</small><b>⌄</b></summary><div><p>Pouze pro vývoj. Přepne pohled bez zadávání hesla.</p>${groups.map(([label,users])=>users.length?`<section><strong>${label}</strong><span>${users.map(u=>`<button data-dev-switch="${u.id}" ${u.id===state.user.id?'disabled':''}>${esc(u.name)}${u.id===state.user.id?' ✓':''}</button>`).join('')}</span></section>`:'').join('')}</div></details>`;
}
const baseShell=shell;
shell=function(content){return `${devSwitcher()}${baseShell(content)}`;};
const previousBoot=boot;
boot=async function(){await previousBoot();if(state.demo&&state.user){try{state.devUsers=(await api('dev-users')).users;await render();}catch(error){toast(error.message,true);}}};
document.addEventListener('click',async event=>{const button=event.target.closest('[data-dev-switch]');if(!button)return;button.disabled=true;try{await api('dev-switch',{id:Number(button.dataset.devSwitch)});state.devUsers=null;await boot();}catch(error){button.disabled=false;toast(error.message,true);}});

/* Navigace s vlastním SVG systémem: žádné znakové pseudoikony. */
const fitnessIcons={
 dashboard:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
 menu:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14M5 12h14M5 18h14"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></svg>',
 orders:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/><path d="M5 5h6M5 19h14"/></svg>',
 companies:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3.5 20c.6-3.5 2.4-5.5 5.5-5.5s4.9 2 5.5 5.5M16 7h5M18.5 4.5v5"/></svg>',
 settings:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.05.05-2.1 2.1-.05-.05a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.55V20.3h-3v-.1A1.7 1.7 0 0 0 10.7 18.6a1.7 1.7 0 0 0-1.88.34l-.05.05-2.1-2.1.05-.05A1.7 1.7 0 0 0 7.06 15a1.7 1.7 0 0 0-1.55-1.03h-.1v-3h.1A1.7 1.7 0 0 0 7.06 9.94a1.7 1.7 0 0 0-.34-1.88l-.05-.05 2.1-2.1.05.05a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.03-1.55v-.1h3v.1A1.7 1.7 0 0 0 15.76 6.3a1.7 1.7 0 0 0 1.88-.34l.05-.05 2.1 2.1-.05.05a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.55 1.03h.1v3h-.1A1.7 1.7 0 0 0 19.4 15Z"/></svg>'
};
shell=function(content){
 const admin=state.user.role==='admin';
 const links=admin?[['dashboard','Přehled'],['menu','Jídelníček'],['companies','Firmy'],['settings','Účet']]:[['menu','Jídelníček'],['orders','Souhrn'],['settings','Účet']];
 return `${devSwitcher()}<div class="fitness-shell"><header class="fitness-header"><a href="/" class="fitness-brand"><img src="/logo.png" alt="" width="40" height="40"><span>Restaurace Srub Podkozí<small>${state.user.role==='owner'?'Přehled tržeb':admin?'Správa restaurace':'Firemní stravování'}</small></span></a><div class="fitness-account"><span>${esc(state.user.name)}</span><button data-action="logout" aria-label="Odhlásit se"><span class="logout-icon">↪</span><b>Odhlásit</b></button></div></header><main id="content" class="fitness-content">${content}</main><nav class="fitness-bottom-nav" aria-label="Hlavní navigace"><div>${links.map(([view,label])=>`<button class="${state.view===view?'selected':''}" data-view="${view}" aria-current="${state.view===view?'page':'false'}"><span class="fitness-nav-icon">${fitnessIcons[view]}</span><span>${label}</span></button>`).join('')}</div></nav>${state.demo?'<div class="demo-label">Ukázková aplikace</div>':''}</div>`;
};

/* Velký provozní přehled restaurace místo drobné tabulky. */
dashboard=function(){
 const d=state.data,byMeal={};for(const row of d.rows)byMeal[row.name]=(byMeal[row.name]||0)+row.quantity;
 const firms=[...new Set(d.rows.map(row=>row.company_id))];
 return `<section class="restaurant-overview"><header class="overview-header"><h1>Dnes v kuchyni</h1><p>${dateLabel(state.date,{weekday:'long',day:'numeric',month:'long'})}</p><div class="overview-actions"><input aria-label="Datum přehledu" type="date" id="date-picker" value="${state.date}"><a class="overview-download" href="/api/report?date=${state.date}">Kuchyňský list v Excelu · ${dateLabel(state.date,{day:'numeric',month:'numeric',year:'numeric'})}</a></div></header><article class="overview-total"><span>${d.closed?'Objednávky jsou uzavřené':'Objednávky jsou otevřené'}</span><strong>${d.total}<small>porcí</small></strong><p>${d.firms} ${plural(d.firms,'firma','firmy','firem')} k přípravě a rozvozu</p></article><section class="prep-section"><div class="overview-section-title"><h2>Co připravit</h2><span>Celkový počet porcí</span></div><div class="prep-cards">${Object.entries(byMeal).map(([name,quantity],index)=>`<article class="prep-card"><span>${String(index+1).padStart(2,'0')}</span><div><h3>${esc(name)}</h3><p>Připravit a zabalit</p></div><strong>${quantity}<small> porcí</small></strong></article>`).join('')||empty('Zatím žádné objednávky','Jakmile firma objedná, porce se objeví zde.')}</div></section><section class="delivery-section"><div class="overview-section-title"><h2>Rozvoz podle firem</h2><span>${firms.length} ${plural(firms.length,'firma','firmy','firem')}</span></div><div class="delivery-cards">${firms.map(id=>{const rows=d.rows.filter(row=>row.company_id===id),total=rows.reduce((sum,row)=>sum+row.quantity,0);return `<article class="delivery-card"><div class="delivery-company"><span>${esc(rows[0].company.slice(0,2).toUpperCase())}</span><div><h3>${esc(rows[0].company)}</h3><p>${esc(rows[0].address||'Adresa není vyplněná')}</p></div><strong>${total}<small> porcí</small></strong></div><div class="delivery-items">${rows.map(row=>`<p><b>${row.quantity}×</b><span>${esc(row.name)}</span><small>${row.packaging==='own'?'Vlastní krabičky':'Jednorázové krabičky'}</small></p>`).join('')}</div></article>`;}).join('')||'<p class="overview-empty">Zatím není co rozvážet.</p>'}</div></section></section>`;
};

fitnessIcons.delivery='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h11v10H3zM14 10h3l4 4v2h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>';
shell=function(content){
 const admin=state.user.role==='admin';
 const links=[['dashboard','Přehled'],['menu','Jídelníček'],['orders','Objednávky'],['settings','Nastavení']];
 return `${devSwitcher()}<div class="fitness-shell ${state.user.role==='owner'?'is-owner':''}"><header class="fitness-header"><a href="/" class="fitness-brand"><img src="/logo.png" alt="" width="40" height="40"><span>Restaurace Srub Podkozí<small>${state.user.role==='owner'?'Přehled tržeb':admin?'Správa restaurace':'Firemní stravování'}</small></span></a><div class="fitness-account"><span>${esc(state.user.name)}</span><button data-action="logout" aria-label="Odhlásit se"><span class="logout-icon">↪</span><b>Odhlásit</b></button></div></header><main id="content" class="fitness-content">${content}</main><nav class="fitness-bottom-nav" aria-label="Hlavní navigace"><div>${links.map(([view,label])=>`<button class="${state.view===view?'selected':''}" data-view="${view}" aria-current="${state.view===view?'page':'false'}"><span class="fitness-nav-icon">${fitnessIcons[view]}</span><span>${label}</span></button>`).join('')}</div></nav>${state.demo?'<div class="demo-label">Ukázková aplikace</div>':''}</div>`;
};

// Schválené mobilní rozhraní: struktura přehledu podle dodaného vzoru, bez fotografií jídel.
fitnessIcons.dashboard='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10h-6v-6H9v6H3z"/></svg>';
fitnessIcons.menu='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3v7M3.5 3v4a2.5 2.5 0 0 0 5 0V3M6 10v11M17 3v18M17 3c2.5 1.5 3.5 4 3.5 7H17"/></svg>';
fitnessIcons.orders='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6"/></svg>';
fitnessIcons.delivery='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h11v10H3zM14 10h3l4 4v2h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>';

dashboard=function(){
 const d=state.data,byMeal={};
 for(const row of d.rows)byMeal[row.name]=(byMeal[row.name]||0)+row.quantity;
 const meals=Object.entries(byMeal);
 const orderedIds=new Set(d.rows.map(row=>row.company_id));
 const active=(d.companies||[]).filter(c=>c.active!==0);
 const missing=active.filter(c=>!orderedIds.has(c.id));
 const revenue=d.rows.reduce((sum,row)=>sum+row.quantity*(row.price+row.fee),0);
 const own=d.rows.filter(row=>row.packaging==='own').reduce((sum,row)=>sum+row.quantity,0);
 const report=d.report?.status==='sent'?'Odeslán e-mailem':d.report?.status==='error'?'Odeslání selhalo':d.report?'Připraven ke stažení':'Čeká na uzávěrku';
 const row=(mark,label,value,tone='')=>`<div class="state-row ${tone}"><b>${mark}</b><span>${label}</span><strong>${value}</strong></div>`;
 return `<section class="company-overview"><div class="simple-title"><h1>Přehled</h1><p>Co dnes potřebujete vědět.</p></div>${simpleWeek()}<article class="company-overview-card"><span>${dateLabel(state.date,{weekday:'long',day:'numeric',month:'long'}).toUpperCase()}</span><strong>${d.total}<small> porcí</small></strong><p>${meals.length} ${plural(meals.length,'jídlo','jídla','jídel')} · tržba ${money(revenue)}</p></article><section class="ks-inline"><div class="ks-inline-head"><h2>Kuchyňský list</h2><a class="secondary small" href="/api/report?date=${state.date}">↓ Excel</a></div>${kitchenBlocks()}</section><section class="state-list"><h2>Stav dne</h2>${row(d.closed?'◷':'●',d.closed?'Objednávky uzavřeny':'Objednávky otevřené do 8:00',d.closed?'Uzavřeno':'Otevřeno',d.closed?'is-locked':'is-open')}${row('▤','Firmy s objednávkou',`${orderedIds.size} z ${active.length}`,missing.length?'is-warn':'is-open')}${row('▥','Krabičky (jednorázové / vlastní)',`${d.total-own} / ${own}`)}${row('✉','Ranní souhrn',report,d.report?.status==='error'?'is-warn':'')}</section>${missing.length?`<section class="company-overview-list"><h2>Bez objednávky na tento den</h2>${missing.slice(0,state.showMissing?missing.length:6).map(c=>`<div><b>${esc(c.name.slice(0,2).toUpperCase())}</b><span>${esc(c.name)}<small>${esc(c.email)}</small></span><strong>—</strong></div>`).join('')}${missing.length>6?`<button type="button" class="missing-toggle" data-toggle-missing>${state.showMissing?'Skrýt':`Zobrazit další ${missing.length-6} ${plural(missing.length-6,'firmu','firmy','firem')}`}</button>`:''}</section>`:''}<div class="overview-foot"><button class="secondary overview-more" data-view="orders">Otevřít objednávky →</button><a class="text-button" href="/api/report?date=${state.date}">↓ Kuchyňský list v Excelu · ${dateLabel(state.date,{day:'numeric',month:'numeric',year:'numeric'})}</a></div></section>`;
};

// Ikony jsou převzaté z Lucide, stejné sady, kterou používá fitness aplikace.
fitnessIcons.dashboard='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>';
fitnessIcons.menu='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3v7M2 3v4a2 2 0 0 0 4 0V3M4 10v11M18 3v18M18 3c2.5 1.5 3.5 4 3.5 7H18"/></svg>';
fitnessIcons.orders='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 11h6M9 15h4"/></svg>';
fitnessIcons.delivery='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17h4V5H2v12h3"/><path d="M14 9h4l4 4v4h-3"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>';
fitnessIcons.settings='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.05.05-2.1 2.1-.05-.05a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.55v.1h-3v-.1a1.7 1.7 0 0 0-1.03-1.55 1.7 1.7 0 0 0-1.88.34l-.05.05-2.1-2.1.05-.05A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1.03H3v-3h.05A1.7 1.7 0 0 0 4.6 9.94a1.7 1.7 0 0 0-.34-1.88l-.05-.05 2.1-2.1.05.05a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 9.27 4.75v-.1h3v.1A1.7 1.7 0 0 0 13.3 6.3a1.7 1.7 0 0 0 1.88-.34l.05-.05 2.1 2.1-.05.05a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.55 1.03H19v3h-.05A1.7 1.7 0 0 0 17.4 15Z"/></svg>';

globalThis.delivery=function(){
 const d=state.data;
 const firmIds=[...new Set(d.rows.map(row=>row.company_id))];
 return `<section class="delivery-view"><header class="delivery-view-head"><div><h1>Rozvoz</h1><p>${dateLabel(state.date,{weekday:'long',day:'numeric',month:'long'})}</p></div><label>Datum<input aria-label="Datum rozvozu" type="date" id="date-picker" value="${state.date}"></label></header><div class="delivery-view-note"><span>${d.total}</span><p>porcí připravených k rozvozu<br><small>${firmIds.length} ${plural(firmIds.length,'firma','firmy','firem')} na trase</small></p></div><div class="delivery-route">${firmIds.map((id,index)=>{const rows=d.rows.filter(row=>row.company_id===id),total=rows.reduce((sum,row)=>sum+row.quantity,0),first=rows[0];return `<article class="route-stop"><span class="route-number">${index+1}</span><div class="route-stop-main"><h2>${esc(first.company)}</h2><p>${esc(first.address||'Adresa rozvozu není vyplněná')}</p><div class="route-meals">${rows.map(row=>`<span><b>${row.quantity}×</b> ${esc(row.name)}</span>`).join('')}</div></div><strong>${total}<small> porcí</small></strong></article>`;}).join('')||'<p class="photo-empty">Na tento den zatím není naplánovaný rozvoz.</p>'}</div></section>`;
};

// Přímé SVG cesty Lucide v1.37.0, shodná sada s fitness aplikací.
fitnessIcons.dashboard='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
fitnessIcons.menu='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>';
fitnessIcons.orders='<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01"/></svg>';
fitnessIcons.delivery='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>';
fitnessIcons.settings='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/></svg>';

// Samostatný přepínač pro pevnou spodní navigaci: každé tlačítko vždy otevře svou záložku.
document.addEventListener('click',event=>{
 const button=event.target.closest('.fitness-bottom-nav button[data-view]');
 if(!button)return;
 event.preventDefault();
 event.stopImmediatePropagation();
 if(!canLeave())return;
 state.view=button.dataset.view;
 state.search='';
 render();
},true);

// Tři odlišné záložky pro firemní účet; každá navazující na data, ke kterým má firma přístup.
function adminOrders(){
 const d=state.data,byCompany=new Map();
 for(const row of d.rows){if(!byCompany.has(row.company_id))byCompany.set(row.company_id,[]);byCompany.get(row.company_id).push(row);}
 const companies=[...byCompany.values()];
 const totalPortions=d.rows.reduce((sum,row)=>sum+row.quantity,0);
 const totalPrice=d.rows.reduce((sum,row)=>sum+row.quantity*(row.price+row.fee),0);
 const mealTotals=new Map();
 for(const row of d.rows){const meal=mealTotals.get(row.meal_id)||{name:row.name,own:0,disposable:0};meal[row.packaging==='own'?'own':'disposable']+=row.quantity;mealTotals.set(row.meal_id,meal);}
 return `<section class="admin-orders"><header class="admin-orders-head"><div><h1>Objednávky</h1><p>${dateLabel(state.date,{weekday:'long',day:'numeric',month:'long'})}</p></div><input aria-label="Datum objednávek" type="date" id="date-picker" value="${state.date}"></header><div class="admin-order-stats"><span><b>${companies.length}</b> firem</span><span><b>${totalPortions}</b> porcí</span></div><div class="admin-order-list">${companies.map((rows,index)=>{const portions=rows.reduce((sum,row)=>sum+row.quantity,0),price=rows.reduce((sum,row)=>sum+row.quantity*(row.price+row.fee),0),packageLabel=rows[0].packaging==='own'?'vlastní':'jednorázové';return `<article><span class="admin-order-index">${String(index+1).padStart(2,'0')}</span><div><h2>${esc(rows[0].company)} <small>(${packageLabel})</small></h2><p>${portions} ${plural(portions,'porce','porce','porcí')} · ${rows.map(row=>`${row.quantity}× ${esc(row.name)}`).join(', ')}</p></div><strong>${money(price)}</strong></article>`;}).join('')||'<p class="photo-empty">Na tento den zatím nejsou objednávky.</p>'}</div><section class="admin-meal-totals"><h2>Připravit do kuchyně</h2><p>Celkový počet porcí rozdělený podle krabiček.</p><div class="meal-total-head"><span>Jídlo</span><b>Jednorázové</b><b>Vlastní</b></div>${[...mealTotals.values()].map(meal=>`<article><span>${esc(meal.name)}</span><strong>${meal.disposable}</strong><strong>${meal.own}</strong></article>`).join('')}</section><footer class="admin-orders-total"><span>Celkem za všechny firmy<small>${totalPortions} ${plural(totalPortions,'porce','porce','porcí')} dohromady</small></span><strong>${money(totalPrice)}</strong></footer></section>`;
}

// Objednávky jsou provozní seznam: zastávky pro jednotlivé firmy, potom kuchyňský součet.
adminOrders=function(){
 const d=state.data,firmIds=[...new Set(d.rows.map(row=>row.company_id))];
 const totalPrice=d.rows.reduce((sum,row)=>sum+row.quantity*(row.price+row.fee),0),mealTotals=new Map();
 for(const row of d.rows){const meal=mealTotals.get(row.meal_id)||{name:row.name,own:0,disposable:0};meal[row.packaging==='own'?'own':'disposable']+=row.quantity;mealTotals.set(row.meal_id,meal);}
 return `<section class="delivery-view admin-orders-route"><header class="delivery-view-head"><div><h1>Objednávky</h1><p>${dateLabel(state.date,{weekday:'long',day:'numeric',month:'long'})}</p></div></header>${simpleWeek()}<div class="delivery-view-note"><span>${d.total}</span><p>porcí připravených pro firmy<br><small>${firmIds.length} ${plural(firmIds.length,'firma','firmy','firem')} v objednávkách</small></p></div><div class="delivery-route">${firmIds.map((id,index)=>{const rows=d.rows.filter(row=>row.company_id===id),total=rows.reduce((sum,row)=>sum+row.quantity,0),price=rows.reduce((sum,row)=>sum+row.quantity*(row.price+row.fee),0),first=rows[0],label=first.packaging==='own'?'vlastní':'jednorázové';return `<article class="route-stop"><span class="route-number">${index+1}</span><div class="route-stop-main"><div class="stop-head"><h2>${esc(first.company)} <small>(${label})</small></h2></div><p>${esc(first.address||'Adresa rozvozu není vyplněná')}</p><div class="route-meals">${rows.map(row=>`<span><b>${row.quantity}×</b><em>${esc(row.name)}</em><i>${money(row.quantity*(row.price+row.fee))}</i></span>`).join('')}</div><div class="stop-total"><span class="stop-count">${total} ${plural(total,'porce','porce','porcí')}</span><span class="stop-sum">Celkem<b>${money(price)}</b></span></div></div></article>`;}).join('')||'<p class="photo-empty">Na tento den zatím nejsou objednávky.</p>'}</div><section class="admin-meal-totals"><h2>Připravit do kuchyně</h2><p>Celkový počet porcí rozdělený podle krabiček.</p><div class="meal-total-head"><span>Jídlo</span><b>Jednorázové</b><b>Vlastní</b></div>${[...mealTotals.values()].map(meal=>`<article><span>${esc(meal.name)}</span><strong>${meal.disposable}</strong><strong>${meal.own}</strong></article>`).join('')}</section><footer class="admin-orders-total"><span>Celkem za všechny firmy<small>${d.total} ${plural(d.total,'porce','porce','porcí')} dohromady</small></span><strong>${money(totalPrice)}</strong></footer></section>`;
};

function companyOverview(){
 const rows=state.data.rows||[],menuDates=state.data.menuDates||[];
 const weekday=new Date(state.date+'T12:00:00Z').getUTCDay(),monday=plus(state.date,-((weekday+6)%7));
 const week=Array.from({length:5},(_,i)=>{const date=plus(monday,i),rs=rows.filter(r=>r.date===date);
  return {date,qty:rs.reduce((s,r)=>s+r.quantity,0),sum:rs.reduce((s,r)=>s+r.quantity*(r.price+r.fee),0),
   locked:date<state.clock.date||(date===state.clock.date&&state.clock.hour>=8),hasMenu:menuDates.includes(date)};});
 const total=week.reduce((s,d)=>s+d.qty,0),spend=week.reduce((s,d)=>s+d.sum,0);
 const next=week.find(d=>d.qty&&d.date>=state.clock.date);
 const todo=week.filter(d=>!d.qty&&!d.locked&&d.hasMenu);
 const cutoffToday=week.find(d=>d.date===state.clock.date);
 const row=(mark,label,value,tone='')=>`<div class="state-row ${tone}"><b>${mark}</b><span>${label}</span><strong>${value}</strong></div>`;
 return `<section class="company-overview"><div class="simple-title"><h1>Přehled</h1><p>Co vás tento týden čeká.</p></div><article class="company-overview-card"><span>TENTO TÝDEN</span><strong>${total}<small> porcí</small></strong><p>${dateLabel(monday,{day:'numeric',month:'numeric'})} – ${dateLabel(plus(monday,4),{day:'numeric',month:'numeric'})} · ${money(spend)}</p></article><section class="state-list"><h2>Stav objednávek</h2>${row('▤','Nejbližší rozvoz',next?`${dateLabel(next.date,{weekday:'long',day:'numeric',month:'numeric'})} · ${next.qty} ${plural(next.qty,'porce','porce','porcí')}`:'Zatím nic naplánováno',next?'is-open':'is-warn')}${row(todo.length?'!':'✓','Dny bez objednávky',todo.length?`${todo.length} ${plural(todo.length,'den','dny','dnů')}`:'Žádné',todo.length?'is-warn':'is-open')}${cutoffToday?row(cutoffToday.locked?'◷':'●','Dnešní uzávěrka',cutoffToday.locked?'Uzavřeno v 8:00':'Otevřeno do 8:00',cutoffToday.locked?'is-locked':'is-open'):''}</section>${todo.length?`<section class="company-overview-list"><h2>Ještě si vyberte</h2>${todo.map(d=>`<div><b>▱</b><span>${dateLabel(d.date,{weekday:'long',day:'numeric',month:'long'})}<small>Menu je zveřejněné, objednat lze do 8:00</small></span><strong>—</strong></div>`).join('')}<button class="secondary overview-more" data-view="menu">Otevřít jídelníček →</button></section>`:`<button class="secondary overview-more" data-view="orders">Zobrazit objednávky →</button>`}</section>`;
}
function companyDelivery(){
 const dates=[...new Set((state.data.rows||[]).map(row=>row.date))];
 return `<section class="company-delivery"><div class="simple-title"><h1>Rozvoz</h1><p>Kdy čekat vaše firemní obědy.</p></div><article class="company-delivery-card"><span>ROZVOZ OBĚDŮ</span><h2>Po–Pá · kolem poledne</h2><p>Restaurace připraví objednávku po ranní uzávěrce. Přesný čas a místo rozvozu nastavuje správce firmy.</p></article><section class="company-overview-list"><h2>Naplánované dny</h2>${dates.map(date=>{const count=state.data.rows.filter(row=>row.date===date).reduce((sum,row)=>sum+row.quantity,0);return `<div><b>▱</b><span>${dateLabel(date,{weekday:'long',day:'numeric',month:'long'})}<small>Objednávka je uložená</small></span><strong>${count} porcí</strong></div>`;}).join('')||'<p class="photo-empty">Pro tento týden zatím nemáte naplánovaný rozvoz.</p>'}</section></section>`;
}

function kitchenBlocks(){
 const d=state.data,rows=d.rows||[];
 const dishes=[];for(const r of rows)if(!dishes.some(x=>x.name===r.name))dishes.push({name:r.name,soup:/pol[ée]vka|vývar|krém|česnek|boršč/i.test(r.name)});
 dishes.sort((a,b)=>(a.soup===b.soup)?0:(a.soup?-1:1));
 const qty=(companyId,name)=>rows.filter(r=>r.company_id===companyId&&r.name===name).reduce((s,r)=>s+r.quantity,0);
 const block=(packaging,title)=>{
  const ids=[...new Set(rows.filter(r=>r.packaging===packaging).map(r=>r.company_id))];
  const firms=ids.map(id=>({id,name:rows.find(r=>r.company_id===id).company}));
  if(!firms.length)return `<section class="ks-block"><h2>${title}</h2><p class="ks-empty">Na tento den nikdo neobjednal.</p></section>`;
  const dishTotal=name=>firms.reduce((s,f)=>s+qty(f.id,name),0);
  const firmTotal=id=>dishes.reduce((s,x)=>s+qty(id,x.name),0);
  return `<section class="ks-block"><h2>${title} <small>${firms.length} ${plural(firms.length,'firma','firmy','firem')}</small></h2>
   <div class="ks-scroll"><table class="ks-table">
   <thead><tr><th class="ks-dish">Jídlo</th>${firms.map(f=>`<th><span>${esc(f.name)}</span></th>`).join('')}<th class="ks-sum">Celkem</th></tr></thead>
   <tbody>${dishes.map(x=>`<tr class="${x.soup?'ks-soup':''}"><td class="ks-dish">${esc(x.name)}</td>${firms.map(f=>{const q=qty(f.id,x.name);return `<td>${q||'<span class="ks-zero">–</span>'}</td>`;}).join('')}<td class="ks-sum">${dishTotal(x.name)}</td></tr>`).join('')}</tbody>
   <tfoot><tr><td class="ks-dish">Celkem za firmu</td>${firms.map(f=>`<td>${firmTotal(f.id)}</td>`).join('')}<td class="ks-sum">${firms.reduce((s,f)=>s+firmTotal(f.id),0)}</td></tr></tfoot>
   </table></div></section>`;};
 const totalFor=(name,packaging)=>rows.filter(r=>r.name===name&&r.packaging===packaging).reduce((s,r)=>s+r.quantity,0);
 return `
  ${block('disposable','Jednorázové krabičky')}
  ${block('own','Vlastní krabičky')}
  <section class="ks-block ks-final"><h2>Uvařit celkem</h2>
   <div class="ks-scroll"><table class="ks-table">
   <thead><tr><th class="ks-dish">Jídlo</th><th>Jednorázové</th><th>Vlastní</th><th class="ks-sum">Celkem</th></tr></thead>
   <tbody>${dishes.map(x=>`<tr class="${x.soup?'ks-soup':''}"><td class="ks-dish">${esc(x.name)}</td><td>${totalFor(x.name,'disposable')}</td><td>${totalFor(x.name,'own')}</td><td class="ks-sum">${totalFor(x.name,'disposable')+totalFor(x.name,'own')}</td></tr>`).join('')}</tbody>
   </table></div></section>`;
}

function kitchenSheet(){
 const d=state.data;
 return `<section class="kitchen-sheet">
  <header class="ks-head"><div><h1>Kuchyňský list</h1><p>${dateLabel(state.date,{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p></div>
   <div class="ks-head-right"><strong>${d.total}<small> porcí</small></strong><div class="ks-actions"><button class="secondary small" data-action="print">Vytisknout</button><button class="secondary small" data-view="dashboard">Zpět</button></div></div></header>
  ${kitchenBlocks()}
 </section>`;
}

adminSettings=function(){
 const d=state.data||{};
 return `<div class="simple-title"><h1>Nastavení</h1><p>Firmy, ranní souhrn a účet.</p></div>
 <section class="set-card"><div class="set-card-head"><h2>Firmy</h2><button class="primary small" data-view="companies">Spravovat →</button></div>
  <p>Přidejte novou firmu, změňte jí typ krabiček nebo ji odeberte ze seznamu.</p></section>
 <section class="set-card"><h2>Ranní souhrn e-mailem</h2>
  <form id="settings-form"><label>E-mail pro ranní souhrn<input type="email" name="reportEmail" value="${esc(d.reportEmail||'')}"></label>
  <button class="primary">Uložit nastavení</button></form></section>
 <section class="set-card"><h2>Účet</h2><p>${esc(state.user.name)}</p>
  <button class="secondary" data-action="logout">Odhlásit se</button></section>`;
};

companies=function(){
 const all=state.data.companies||[];
 const term=state.search.toLowerCase();
 const firms=all.filter(c=>(c.name+' '+c.email).toLowerCase().includes(term));
 const group=(pack,title)=>{
  const list=firms.filter(c=>c.packaging===pack);
  return `<section class="company-overview-list"><h2>${title} (${list.length} ${plural(list.length,'firma','firmy','firem')})</h2>
   ${list.map(c=>`<div><b>${esc(c.name.slice(0,2).toUpperCase())}</b><span>${esc(c.name)}<small>${c.active?esc(c.email):'Pozastavená · '+esc(c.email)}</small></span>
    <span class="firm-actions"><button class="secondary small" data-edit-company="${c.id}">Upravit</button><button class="secondary small danger" data-remove-company="${c.id}">Odebrat</button></span></div>`).join('')||'<p class="photo-empty">Žádná firma.</p>'}</section>`;};
 return `<div class="simple-title"><h1>Firmy</h1><p>${all.length} ${plural(all.length,'firma','firmy','firem')} celkem.</p></div>
 <div class="simple-actions"><button class="primary" data-action="new-company">＋ Přidat firmu</button><button class="secondary" data-view="settings">Zpět</button></div>
 <div class="toolbar"><input id="company-search" type="search" placeholder="Hledat firmu" value="${esc(state.search)}" aria-label="Hledat firmu"></div>
 ${group('disposable','Jednorázové krabičky')}
 ${group('own','Vlastní krabičky')}`;
};

companyModal=function(id){
 const c=state.data.companies.find(x=>x.id===id)||{};
 const kc=v=>v==null?'':v/100;
 const priceField=(n)=>input(`M${n}`,`price_m${n}`,kc(c[`price_m${n}`]),'number','min="0" max="10000" step="1" placeholder="cena z lístku"');
 return openModal(`<p class="eyebrow">FIREMNÍ ÚČET</p><h2>${id?'Upravit firmu':'Nová firma'}</h2>
 <form id="company-form" data-id="${id||''}">
 ${input('Název firmy','name',c.name,'text','required maxlength="200"')}
 ${input('Přihlašovací e-mail','email',c.email,'email','required')}
 ${input('Adresa rozvozu','address',c.address)}
 ${input('Cena polévky (Kč)','soup_price',kc(c.soup_price),'number','min="0" max="10000" step="1" placeholder="cena z lístku"')}
 <fieldset class="price-grid"><legend>Ceny hlavních jídel (Kč)</legend>
  <div class="price-row">${[1,2,3,4].map(priceField).join('')}</div>
  <p class="footnote">M1 až M4 jsou hlavní jídla v pořadí, jak jsou ten den v jídelníčku. Prázdné pole použije cenu z lístku.</p>
 </fieldset>
 <div class="form-row"><label>Typ krabiček<select name="packaging"><option value="own" ${c.packaging==='own'?'selected':''}>Vlastní krabičky</option><option value="disposable" ${c.packaging==='disposable'?'selected':''}>Jednorázové krabičky</option></select></label>
  ${input('Příplatek za krabičku (Kč)','fee',(id?(c.fee||0):1000)/100,'number','min="0" max="10000" step="1"')}</div>
 ${input(id?'Nové heslo pro firmu':'Heslo firmy pro první přihlášení','password','','password',`${id?'':'required'} minlength="12" maxlength="128" autocomplete="new-password"`)}
 ${id?'<p class="footnote">Heslo, kterým se firma přihlašuje do aplikace. Nechte prázdné a zůstane jí to současné. Když ho změníte, firma se odhlásí a nové heslo jí musíte předat.</p>':'<p class="footnote">Heslo, kterým se firma poprvé přihlásí. Předejte jí ho samostatně.</p>'}${id?`<label class="checkbox"><input name="active" type="checkbox" ${c.active?'checked':''}>Účet firmy je aktivní</label>`:''}
 <button class="primary full">${id?'Uložit firmu':'Vytvořit firemní účet'}</button></form>`);
};

function passwordCard(){
 return `<section class="set-card"><h2>Změna hesla</h2>
  <form id="password-form">
   ${input('Staré heslo','current','','password','required autocomplete="current-password" maxlength="128"')}
   ${input('Nové heslo','password','','password','required minlength="12" maxlength="128" autocomplete="new-password"')}
   ${input('Nové heslo znovu','confirm','','password','required minlength="12" maxlength="128" autocomplete="new-password"')}
   <p class="footnote">Nové heslo musí mít aspoň 12 znaků. Po změně vás aplikace odhlásí.</p>
   <button class="primary">Uložit nové heslo</button></form></section>`;
}

adminSettings=function(){
 const d=state.data||{};
 return `<div class="simple-title"><h1>Nastavení</h1><p>Firmy, ranní souhrn, heslo a účet.</p></div>
 <section class="set-card"><h2>Firmy</h2>
  <p>Přidejte novou firmu, změňte jí ceny nebo typ krabiček, případně ji odeberte ze seznamu.</p>
  <div class="set-card-foot"><button class="primary small" data-view="companies">Spravovat →</button></div></section>
 <section class="set-card"><h2>Ranní souhrn e-mailem</h2>
  <p>Odchází po ranní uzávěrce v 8:00 na adresu níže. Obsahuje celkový počet porcí, soupis pro kuchyni a rozpis po firmách včetně adresy a typu krabiček.</p>
  <form id="settings-form"><label>E-mail pro ranní souhrn<input type="email" name="reportEmail" value="${esc(d.reportEmail||'')}"></label>
  <div class="set-card-foot"><button class="primary small">Uložit</button></div></form></section>
 <section class="set-card"><h2>Platby QR kódem</h2>
  <p>Firmy po skončení týdne (u měsíčního vyúčtování měsíce) uvidí QR kód s přesnou částkou, variabilním symbolem a zprávou „Srub Podkozí – firma – období“. Stačí ho naskenovat v bankovní aplikaci.</p>
  <div class="state-row ${d.bankIban?'is-open':'is-warn'}"><b>Kč</b><span>Účet pro platby</span><strong>${d.bankIban?esc(d.bankIban):'Nevyplněno'}</strong></div>
  <form id="bank-form"><label>Číslo účtu nebo IBAN<input name="account" value="${esc(d.bankAccount||'')}" placeholder="123456789/0800" autocomplete="off" inputmode="text"></label>
  <p class="footnote">Např. 19-123456789/0800 nebo CZ65 0800 0000 1920 0014 5399. Appka číslo účtu zkontroluje. Prázdné pole QR kódy vypne.</p>
  <div class="set-card-foot"><button class="primary small">Uložit účet</button></div></form></section>
 ${passwordCard()}
 <section class="set-card"><h2>Účet</h2><p>${esc(state.user.name)}</p>
  <div class="set-card-foot"><button class="secondary small" data-action="logout">Odhlásit se</button></div></section>`;
};

settings=function(){
 if(state.user.role==='admin')return adminSettings();
 return `<div class="simple-title"><h1>Účet</h1><p>Vaše přihlášení a heslo.</p></div>
 <section class="set-card"><h2>${esc(state.user.name)}</h2>
  <p>${esc(state.user.email)}<br>Ceny a typ krabiček vám nastavuje restaurace.</p>
  <div class="set-card-foot"><button class="secondary small" data-action="logout">Odhlásit se</button></div></section>
 ${passwordCard()}`;
};

companyModal=function(id){
 const c=state.data.companies.find(x=>x.id===id)||{};
 const kc=v=>v==null?'':v/100;
 const priceField=n=>input(`M${n}`,`price_m${n}`,kc(c[`price_m${n}`]),'number','min="0" max="10000" step="1" placeholder="cena z lístku"');
 return openModal(`<p class="eyebrow">FIREMNÍ ÚČET</p><h2>${id?'Upravit firmu':'Nová firma'}</h2>
 <form id="company-form" data-id="${id||''}">
 ${input('Název firmy','name',c.name,'text','required maxlength="200"')}
 ${input('Adresa rozvozu','address',c.address)}

 <fieldset class="form-group"><legend>Přihlášení firmy do aplikace</legend>
  ${input('E-mail','email',c.email,'email','required')}
  ${input(id?'Nové heslo':'Heslo pro první přihlášení','password','','password',`${id?'':'required'} minlength="12" maxlength="128" autocomplete="new-password"`)}
  <p class="footnote">${id?'Heslo nechte prázdné a firmě zůstane to současné. Když ho změníte, firma se odhlásí a nové heslo jí musíte předat.':'Tímto e-mailem a heslem se firma přihlásí. Předejte jí je samostatně.'}</p>
 </fieldset>

 <fieldset class="form-group"><legend>Sjednané ceny (Kč)</legend>
  ${input('Polévka','soup_price',kc(c.soup_price),'number','min="0" max="10000" step="1" placeholder="cena z lístku"')}
  <div class="price-row">${[1,2,3,4].map(priceField).join('')}</div>
  <p class="footnote">M1 až M4 jsou hlavní jídla v pořadí, jak jsou ten den v jídelníčku. Prázdné pole použije cenu z lístku.</p>
 </fieldset>

 <fieldset class="form-group"><legend>Krabičky</legend>
  <div class="form-row"><label>Typ krabiček<select name="packaging"><option value="own" ${c.packaging==='own'?'selected':''}>Vlastní krabičky</option><option value="disposable" ${c.packaging==='disposable'?'selected':''}>Jednorázové krabičky</option></select></label>
  ${input('Příplatek za krabičku (Kč)','fee',(id?(c.fee||0):1000)/100,'number','min="0" max="10000" step="1"')}</div>
 </fieldset>

 <fieldset class="form-group"><legend>Vyúčtování</legend>
  ${choice('Jak se firmě účtuje','billing',[['week','Týdně'],['month','Měsíčně']],c.billing==='month'?'month':'week')}
  <p class="footnote">Měsíčně: v Objednávkách se firma ukáže po týdnech za celý kalendářní měsíc.</p>
 </fieldset>
 ${id?`<label class="checkbox"><input name="active" type="checkbox" ${c.active?'checked':''}>Účet firmy je aktivní</label>`:''}
 <button class="primary full">${id?'Uložit firmu':'Vytvořit firemní účet'}</button></form>`);
};

adminSettings=function(){
 const d=state.data||{};
 const stav=d.smtpReady?['is-open','Připraveno']:['is-warn','Nenastaveno'];
 const poznamka=!d.smtpReady?'Doplňte SMTP údaje do souboru .env a restartujte server.':d.demo?'Ukázkový režim: ranní rozesílání se spustí až v ostrém provozu. Zkušební e-mail odešlete tlačítkem níže.':'Souhrn odchází automaticky po uzávěrce v 8:00.';
 return `<div class="simple-title"><h1>Nastavení</h1><p>Firmy, ranní souhrn, heslo a účet.</p></div>
 <section class="set-card"><h2>Firmy</h2>
  <p>Přidejte novou firmu, změňte jí ceny nebo typ krabiček, případně ji odeberte ze seznamu.</p>
  <div class="set-card-foot"><button class="primary small" data-view="companies">Spravovat →</button></div></section>
 <section class="set-card"><h2>Ranní souhrn e-mailem</h2>
  <p>Odchází po ranní uzávěrce v 8:00 na adresu níže. Obsahuje celkový počet porcí, soupis pro kuchyni a rozpis po firmách včetně adresy a typu krabiček.</p>
  <div class="state-row ${stav[0]}"><b>✉</b><span>Stav odesílání</span><strong>${stav[1]}</strong></div><p class="footnote mail-note">${poznamka}</p>
  <form id="settings-form"><label>E-mail pro ranní souhrn<input type="email" name="reportEmail" value="${esc(d.reportEmail||'')}"></label>
  <div class="set-card-foot"><button class="secondary small" type="button" data-action="test-mail" ${d.smtpReady?'':'disabled'}>Odeslat zkušební e-mail</button><button class="primary small">Uložit</button></div></form></section>
 <section class="set-card"><h2>Platby QR kódem</h2>
  <p>Firmy po skončení týdne (u měsíčního vyúčtování měsíce) uvidí QR kód s přesnou částkou, variabilním symbolem a zprávou „Srub Podkozí – firma – období“. Stačí ho naskenovat v bankovní aplikaci.</p>
  <div class="state-row ${d.bankIban?'is-open':'is-warn'}"><b>Kč</b><span>Účet pro platby</span><strong>${d.bankIban?esc(d.bankIban):'Nevyplněno'}</strong></div>
  <form id="bank-form"><label>Číslo účtu nebo IBAN<input name="account" value="${esc(d.bankAccount||'')}" placeholder="123456789/0800" autocomplete="off" inputmode="text"></label>
  <p class="footnote">Např. 19-123456789/0800 nebo CZ65 0800 0000 1920 0014 5399. Appka číslo účtu zkontroluje. Prázdné pole QR kódy vypne.</p>
  <div class="set-card-foot"><button class="primary small">Uložit účet</button></div></form></section>
 ${passwordCard()}
 <section class="set-card"><h2>Účet</h2><p>${esc(state.user.name)}</p>
  <div class="set-card-foot"><button class="secondary small" data-action="logout">Odhlásit se</button></div></section>`;
};

let importDraft=[];

importModal=function(){
 importDraft=[];
 const monday=(()=>{const w=new Date(state.date+'T12:00:00Z').getUTCDay();return plus(state.date,-((w+6)%7));})();
 openModal(`<p class="eyebrow">CELÝ TÝDEN NAJEDNOU</p><h2>Nahrát jídelní lístek</h2>
 <p>Nahrajte lístek jako PDF nebo fotku, případně vyplněné CSV. <strong>Před uložením uvidíte náhled a můžete cokoli opravit.</strong></p>
 <label class="upload">↥ Vybrat soubor (PDF, fotka nebo CSV)
  <input type="file" id="menu-file" accept=".csv,text/csv,application/pdf,image/png,image/jpeg,image/webp"></label>
 <p class="footnote">Datum se bere přímo z lístku. Když na něm chybí, použije se týden ${dateLabel(monday,{day:'numeric',month:'numeric'})} – ${dateLabel(plus(monday,4),{day:'numeric',month:'numeric',year:'numeric'})}.</p>
 <button class="text-button" data-action="csv-template">↓ Stáhnout vzor CSV</button>
 <div id="import-preview"></div>`);
};

function importPreview(meals,notes,poznamka,week){
 importDraft=meals;
 const den=d=>dateLabel(d,{weekday:'long',day:'numeric',month:'numeric'});
 const dny=[...new Set(meals.map(m=>m.date))].sort();
 return `${week?`<div class=\"import-week\">Rozpoznaný týden z lístku: <strong>${dateLabel(week[0],{day:'numeric',month:'numeric'})} – ${dateLabel(week[4],{day:'numeric',month:'numeric',year:'numeric'})}</strong></div>`:''}${poznamka?`<div class="import-note">Model upozorňuje: ${esc(poznamka)}</div>`:''}
 ${notes.length?`<div class="import-note warn"><strong>Zkontrolujte:</strong><br>${notes.map(esc).join('<br>')}</div>`:''}
 <h3>Náhled · ${meals.length} ${plural(meals.length,'jídlo','jídla','jídel')}</h3>
 <div class="import-days">${dny.map(d=>`<div class="import-day"><h4>${den(d)}</h4>
  ${meals.map((m,i)=>[m,i]).filter(([m])=>m.date===d).map(([m,i])=>`<div class="import-row ${m.warnings.length?'has-warn':''}">
   <span class="import-cat">${m.category==='Polévka'?'P':'M'}</span>
   <input aria-label="Název" data-draft="${i}" data-field="name" value="${esc(m.name)}">
   <input aria-label="Cena" class="import-price" type="number" min="0" max="10000" step="1" data-draft="${i}" data-field="price" value="${m.price??''}" placeholder="cena">
   ${m.warnings.length?`<small class="import-warn">${esc(m.warnings.join(', '))}</small>`:''}
  </div>`).join('')}</div>`).join('')}</div>
 <button class="primary full" data-action="save-import">Potvrdit a uložit jídelníček</button>`;
}

mealModal=function(id){
 const m=state.data.meals.find(x=>x.id===id)||{};
 const den=m.date||state.date;
 return openModal(`<p class="eyebrow">POLEDNÍ NABÍDKA</p><h2>${id?'Upravit jídlo':'Nové jídlo'}</h2>
 <p class="modal-sub">${dateLabel(den,{weekday:'long',day:'numeric',month:'long'})}</p>
 <form id="meal-form" data-id="${id||''}">
 <fieldset class="form-group"><legend>Jídlo</legend>
  ${input('Název','name',m.name,'text','required maxlength="200"')}
  ${input('Příloha a popis','description',m.description,'text','maxlength="500" placeholder="např. houskový knedlík"')}
 </fieldset>
 <fieldset class="form-group"><legend>Zařazení</legend>
  <div class="form-row">${input('Den','date',den,'date','required')}
   <label>Druh<select name="category"><option ${m.category!=='Polévka'?'selected':''}>Hlavní jídlo</option><option ${m.category==='Polévka'?'selected':''}>Polévka</option></select></label></div>
 </fieldset>
 <fieldset class="form-group"><legend>Cena a alergeny</legend>
  <div class="form-row">${input('Cena z lístku (Kč)','price',m.price?m.price/100:'','number','required min="0" max="10000" step="1"')}
   ${input('Alergeny','allergens',m.allergens,'text','placeholder="1, 3, 7" maxlength="80"')}</div>
  <p class="footnote">Firmy se sjednanou cenou platí svou cenu, ne tuhle.</p>
 </fieldset>
 <button class="primary full">Uložit jídlo</button>
 ${id?`<button class="secondary full meal-delete" type="button" data-delete-meal="${id}">Odstranit jídlo</button>
  <p class="footnote center">Odstranit jde jen jídlo, které si zatím nikdo neobjednal.</p>`:''}
 </form>`);
};

// Výběr ze dvou až tří možností jako dlaždice místo rozbalovacího seznamu.
function choice(label,name,options,value){
 return `<div class="choice"><span class="choice-label">${label}</span><div class="choice-group" role="radiogroup" aria-label="${label}">${options.map(([v,t])=>`<label class="choice-option"><input type="radio" name="${name}" value="${esc(v)}" ${v===value?'checked':''}><span>${t}</span></label>`).join('')}</div></div>`;
}

companyModal=function(id){
 const c=state.data.companies.find(x=>x.id===id)||{};
 const kc=v=>v==null?'':v/100;
 const pack=c.packaging||'own';
 const priceField=n=>input(`M${n}`,`price_m${n}`,kc(c[`price_m${n}`]),'number','min="0" max="10000" step="1" placeholder="cena z lístku"');
 return openModal(`<p class="eyebrow">FIREMNÍ ÚČET</p><h2>${id?'Upravit firmu':'Nová firma'}</h2>
 <form id="company-form" data-id="${id||''}">
 ${input('Název firmy','name',c.name,'text','required maxlength="200"')}
 ${input('Adresa rozvozu','address',c.address)}
 <fieldset class="form-group"><legend>Přihlášení firmy do aplikace</legend>
  ${input('E-mail','email',c.email,'email','required')}
  ${input(id?'Nové heslo':'Heslo pro první přihlášení','password','','password',`${id?'':'required'} minlength="12" maxlength="128" autocomplete="new-password"`)}
  <p class="footnote">${id?'Heslo nechte prázdné a firmě zůstane to současné. Když ho změníte, firma se odhlásí a nové heslo jí musíte předat.':'Tímto e-mailem a heslem se firma přihlásí. Předejte jí je samostatně.'}</p>
 </fieldset>
 <fieldset class="form-group"><legend>Sjednané ceny (Kč)</legend>
  ${input('Polévka','soup_price',kc(c.soup_price),'number','min="0" max="10000" step="1" placeholder="cena z lístku"')}
  <div class="price-row">${[1,2,3,4].map(priceField).join('')}</div>
  <p class="footnote">M1 až M4 jsou hlavní jídla v pořadí, jak jsou ten den v jídelníčku. Prázdné pole použije cenu z lístku.</p>
 </fieldset>
 <fieldset class="form-group"><legend>Krabičky</legend>
  ${choice('Typ krabiček','packaging',[['own','Vlastní krabičky'],['disposable','Jednorázové krabičky']],pack)}
  <div class="fee-field" ${pack==='own'?'hidden':''}>${input('Příplatek za krabičku (Kč)','fee',(id?(c.fee||0):1000)/100,'number','min="0" max="10000" step="1"')}</div>
 </fieldset>
 <fieldset class="form-group"><legend>Vyúčtování</legend>
  ${choice('Jak se firmě účtuje','billing',[['week','Týdně'],['month','Měsíčně']],c.billing==='month'?'month':'week')}
  <p class="footnote">Týdně: platba za každý týden po–pá. Měsíčně: jedna platba za celý kalendářní měsíc.</p>
 </fieldset>
 ${id?`<label class="checkbox"><input name="active" type="checkbox" ${c.active?'checked':''}>Účet firmy je aktivní</label>`:''}
 <button class="primary full">${id?'Uložit firmu':'Vytvořit firemní účet'}</button></form>`);
};

mealModal=function(id){
 const m=state.data.meals.find(x=>x.id===id)||{};
 const den=m.date||state.date;
 return openModal(`<p class="eyebrow">POLEDNÍ NABÍDKA</p><h2>${id?'Upravit jídlo':'Nové jídlo'}</h2>
 <p class="modal-sub">${dateLabel(den,{weekday:'long',day:'numeric',month:'long'})}</p>
 <form id="meal-form" data-id="${id||''}">
 <fieldset class="form-group"><legend>Jídlo</legend>
  ${input('Název','name',m.name,'text','required maxlength="200"')}
  ${input('Příloha a popis','description',m.description,'text','maxlength="500" placeholder="např. houskový knedlík"')}
 </fieldset>
 <fieldset class="form-group"><legend>Zařazení</legend>
  ${choice('Druh','category',[['Hlavní jídlo','Hlavní jídlo'],['Polévka','Polévka']],m.category==='Polévka'?'Polévka':'Hlavní jídlo')}
  ${input('Den','date',den,'date','required')}
 </fieldset>
 <fieldset class="form-group"><legend>Cena a alergeny</legend>
  <div class="form-row">${input('Cena z lístku (Kč)','price',m.price?m.price/100:'','number','required min="0" max="10000" step="1"')}
   ${input('Alergeny','allergens',m.allergens,'text','placeholder="1, 3, 7" maxlength="80"')}</div>
  <p class="footnote">Firmy se sjednanou cenou platí svou cenu, ne tuhle.</p>
 </fieldset>
 <button class="primary full">Uložit jídlo</button>
 ${id?`<button class="secondary full meal-delete" type="button" data-delete-meal="${id}">Odstranit jídlo</button>
  <p class="footnote center">Odstranit jde jen jídlo, které si zatím nikdo neobjednal.</p>`:''}
 </form>`);
};

// ---- Nahrávání lístku: přetažení souboru a průběh čtení ----
importModal=function(){
 importDraft=[];
 const monday=(()=>{const w=new Date(state.date+'T12:00:00Z').getUTCDay();return plus(state.date,-((w+6)%7));})();
 openModal(`<p class="eyebrow">CELÝ TÝDEN NAJEDNOU</p><h2>Nahrát jídelní lístek</h2>
 <p class="modal-sub">Před uložením uvidíte náhled a můžete cokoli opravit.</p>
 <label class="dropzone">
  <input type="file" id="menu-file" accept=".csv,text/csv,application/pdf,image/png,image/jpeg,image/webp">
  <span class="dropzone-icon" aria-hidden="true">↥</span>
  <span class="dropzone-title">Přetáhněte lístek sem</span>
  <span class="dropzone-hint">nebo klikněte a vyberte soubor</span>
  <span class="dropzone-types"><b>PDF</b><b>PNG</b><b>JPG</b></span>
  <span class="dropzone-file"></span>
 </label>
 <p class="footnote">Datum se bere přímo z lístku. Když na něm chybí, použije se týden ${dateLabel(monday,{day:'numeric',month:'numeric'})} – ${dateLabel(plus(monday,4),{day:'numeric',month:'numeric',year:'numeric'})}.</p>
 <div id="import-preview"></div>`);
};

function progressView(){
 const r=26,c=(2*Math.PI*r).toFixed(1);
 return `<div class="read-progress" role="status" aria-live="polite">
  <div class="read-dial"><svg class="read-ring" viewBox="0 0 64 64" aria-hidden="true">
   <circle class="read-ring-bg" cx="32" cy="32" r="${r}"/>
   <circle class="read-ring-fg" cx="32" cy="32" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c}"/>
   <g class="read-spin"><circle class="read-ring-spin" cx="32" cy="32" r="${r}" stroke-dasharray="10 ${c}"/></g>
  </svg><strong class="read-pct">0 %</strong></div>
  <p class="read-text"></p></div>`;
}

function setProgress(box,pct,text){
 if(!box.querySelector('.read-progress'))box.innerHTML=progressView();
 const fg=box.querySelector('.read-ring-fg'),c=Number(fg.getAttribute('stroke-dasharray'));
 fg.setAttribute('stroke-dashoffset',(c*(1-pct/100)).toFixed(1));
 box.querySelector('.read-pct').textContent=`${pct} %`;
 box.querySelector('.read-text').textContent=text;
}

async function readMenuWithProgress(file,weekStart,box){
 let pct=0,creep=null;
 const show=(p,t)=>{pct=Math.max(pct,Math.min(100,p));setProgress(box,pct,t);};
 try{
  show(3,'Připravuji soubor…');
  // Převod po částech – rozbalení celého pole do argumentů by u většího souboru spadlo.
  const bytes=new Uint8Array(await file.arrayBuffer());
  let bin='';for(let i=0;i<bytes.length;i+=0x8000)bin+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));
  show(8,'Nahrávám lístek…');
  const res=await fetch('/api/menu/read',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:btoa(bin),mediaType:file.type||'application/pdf',weekStart})});
  if(!(res.headers.get('Content-Type')||'').includes('ndjson')){const d=await res.json().catch(()=>({}));throw new Error(d.error||'Lístek se nepodařilo načíst.');}
  show(12,'Model čte lístek…');
  // Než model začne psát, změřit nic nejde – ukazatel jen pomalu dojde do 30 %.
  creep=setInterval(()=>{if(pct<30)show(pct+1,'Model čte lístek…');},1000);
  const reader=res.body.getReader(),dec=new TextDecoder();let buf='',result=null;
  for(;;){
   const {value,done}=await reader.read();if(done)break;
   buf+=dec.decode(value,{stream:true});
   let nl;
   while((nl=buf.indexOf('\n'))>=0){
    const ln=buf.slice(0,nl).trim();buf=buf.slice(nl+1);if(!ln)continue;
    const msg=JSON.parse(ln);
    if(msg.error)throw new Error(msg.error);
    if(msg.result){result=msg.result;continue;}
    const p=msg.progress;
    if(p&&p.phase==='writing'){
     if(creep){clearInterval(creep);creep=null;}
     // Od prvního vypsaného jídla je průběh skutečný: 30 % + podíl přepsaných jídel z obvyklých 25.
     show(30+Math.min(65,Math.round(p.meals/25*65)),`Přepsáno ${p.meals} ${plural(p.meals,'jídlo','jídla','jídel')}`);
    }
   }
  }
  if(!result)throw new Error('Čtení skončilo bez výsledku. Zkuste to prosím znovu.');
  show(100,'Hotovo, připravuji náhled…');
  await new Promise(r=>setTimeout(r,400));
  return result;
 }catch(err){
  box.innerHTML=`<div class="import-note warn">${esc(err.message)}</div>`;
  throw err;
 }finally{
  if(creep)clearInterval(creep);
 }
}

document.addEventListener('dragover',e=>{const z=e.target.closest?.('.dropzone');if(!z)return;e.preventDefault();z.classList.add('is-over');});
document.addEventListener('dragleave',e=>{const z=e.target.closest?.('.dropzone');if(z&&!z.contains(e.relatedTarget))z.classList.remove('is-over');});
document.addEventListener('drop',e=>{
 const z=e.target.closest?.('.dropzone');if(!z)return;
 e.preventDefault();z.classList.remove('is-over');
 const inp=z.querySelector('#menu-file');
 if(e.dataTransfer?.files?.length){inp.files=e.dataTransfer.files;inp.dispatchEvent(new Event('change',{bubbles:true}));}
});

login=function(){
 return `<main class="login-page"><section class="login-card">
 <header class="login-brand">
  <img class="login-logo" src="/logo.png" alt="Logo Srub Podkozí">
  <div><strong>Restaurace Srub Podkozí</strong><span>Objednávky obědů pro firmy</span></div>
 </header>
 <h1>Přihlášení</h1>
 <p class="login-sub">Přihlaste se e-mailem a heslem ke svému účtu.</p>
 <form id="login-form">
  ${input('E-mail','email','','email','required autocomplete="username" placeholder="vas@email.cz"')}
  <div class="pw-field"><label class="pw-label" for="login-password">Heslo</label><div class="pw-wrap"><input id="login-password" type="password" name="password" required autocomplete="current-password" maxlength="128" placeholder="Vaše heslo"><button type="button" class="pw-toggle" aria-controls="login-password" aria-label="Zobrazit heslo" aria-pressed="false">${EYE_ICON}</button></div></div>
  <button class="primary full">Přihlásit se</button>
  <p class="form-error" role="alert"></p>
 </form>
 ${state.demo?`<section class="login-demo"><strong>Vyzkoušet bez přihlášení</strong><p>Ukázková data. E-maily se neodesílají.</p>
  <div class="login-demo-choices"><button class="secondary" data-demo="company">Pohled firmy</button><button class="secondary" data-demo="admin">Správa restaurace</button></div></section>`:''}
 </section></main>`;
};

// Očko u hesla: přepíná zobrazení hesla, stav hlásí i čtečce obrazovky.
const EYE_ICON='<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF_ICON='<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1"/><path d="M6.6 6.6C3.9 8.3 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
document.addEventListener('click',e=>{
 const t=e.target.closest('.pw-toggle');if(!t)return;
 const inp=document.getElementById(t.getAttribute('aria-controls'));if(!inp)return;
 const show=inp.type==='password';
 inp.type=show?'text':'password';
 t.setAttribute('aria-pressed',String(show));
 t.setAttribute('aria-label',show?'Skrýt heslo':'Zobrazit heslo');
 t.innerHTML=show?EYE_OFF_ICON:EYE_ICON;
 // Kurzor zpět do pole na konec textu, ať se dá hned psát dál.
 inp.focus({preventScroll:true});
 const end=inp.value.length;try{inp.setSelectionRange(end,end);}catch{}
});


// Příplatek za jednorázovou krabičku na porci (v haléřích). U objednaného jídla platí částka
// uložená v objednávce, jinak aktuální nastavení firmy; vlastní krabičky nic nepřidávají.
function boxFee(order,company){
 const fee=order?order.fee:(company?.packaging==='disposable'?company.fee:0);
 return fee>0?fee:0;
}


// Objednávky restaurace: nahoře výběr firmy, pod ním její objednávky a ceny.
// Týdenní firmy vidí po–pá jídlo po jídle, měsíční firmy součty po týdnech za celý měsíc.
const firmCost=r=>r.quantity*(r.price+r.fee);
const firmSum=rows=>rows.reduce((s,r)=>s+firmCost(r),0), firmPortions=rows=>rows.reduce((s,r)=>s+r.quantity,0);
const firmPorce=n=>`${n} ${plural(n,'porce','porce','porcí')}`;
function firmDays(dates,rows){
 return `<div class="delivery-route">${dates.map((date,i)=>{const day=rows.filter(r=>r.date===date);
  return `<article class="route-stop ${day.length?'has-order':''}"><span class="route-number">${i+1}</span><div class="route-stop-main"><div class="stop-head"><h2>${dateLabel(date,{weekday:'long',day:'numeric',month:'long'})}</h2><button type="button" class="secondary stop-action" data-admin-edit="${date}">Upravit</button></div>${editNote(state.data.edits,date)}${day.length?`<div class="route-meals">${day.map(r=>`<span><b>${r.quantity}×</b><em>${esc(r.name)}</em><i>${money(firmCost(r))}</i></span>`).join('')}</div><div class="stop-total"><span class="stop-count">${firmPorce(firmPortions(day))}</span><span class="stop-sum">Celkem<b>${money(firmSum(day))}</b></span></div>`:'<p>Bez objednávky.</p>'}</div></article>`;}).join('')}</div>`;
}
// Týdny měsíce: jen pracovní dny, které do měsíce patří.
function monthWeeks(from,to){
 const weeks=[];
 for(let date=from;date<=to;date=plus(date,1)){const wd=new Date(date+'T12:00:00Z').getUTCDay();if(wd===0||wd===6)continue;
  const monday=plus(date,-((wd+6)%7));let w=weeks.find(x=>x.monday===monday);if(!w){w={monday,days:[]};weeks.push(w);}w.days.push(date);}
 return weeks;
}
adminOrders=function(){
 const d=state.data,company=d.company;
 const picker=`<div class="firm-picker">${[...d.companies].sort((x,y)=>(x.billing==='month'?0:1)-(y.billing==='month'?0:1)).map(c=>`<button class="${company&&c.id===company.id?'selected':''}" data-firm="${c.id}"><span>${esc(c.name)}</span><small>${c.billing==='month'?'měsíčně':'týdně'}</small></button>`).join('')}</div>`;
 const head=`<header class="delivery-view-head"><div><h1>Objednávky</h1><p>Vyberte firmu a uvidíte, co objednala a kolik to stojí.</p></div></header>`;
 if(!company)return `<section class="delivery-view company-summary firm-orders">${head}<p class="photo-empty">Zatím tu nejsou žádné firmy.</p></section>`;
 const sum=firmSum, portions=firmPortions, porce=firmPorce;
 const title=`<div class="firm-title"><h2>${esc(company.name)}</h2><span>${company.packaging==='own'?'vlastní krabičky':'jednorázové krabičky'} · vyúčtování ${company.billing==='month'?'měsíčně':'týdně'}</span></div>`;
 if(company.billing==='month'){
  const weeks=monthWeeks(d.from,d.to);
  const month=dateLabel(d.from,{month:'long',year:'numeric'});
  const tiles=weeks.map((w,i)=>{const rows=d.rows.filter(r=>w.days.includes(r.date)),first=w.days[0],last=w.days.at(-1);
   return `<button type="button" class="month-week ${rows.length?'has-order':''}" data-month-week="${i}"><span class="week-label">${i+1}. týden</span><span class="week-range">${dateLabel(first,{day:'numeric',month:'numeric'})}${first===last?'':' – '+dateLabel(last,{day:'numeric',month:'numeric'})}</span><strong>${money(sum(rows))}</strong><small>${porce(portions(rows))}</small><span class="week-open">Zobrazit týden →</span></button>`;}).join('');
  return `<section class="delivery-view company-summary firm-orders">${head}${picker}${title}
   <div class="simple-week"><div class="week-switch"><button class="secondary" data-month-shift="-1">←</button><strong>${month.charAt(0).toUpperCase()+month.slice(1)}</strong><button class="secondary" data-month-shift="1">→</button></div></div>
   <div class="month-weeks">${tiles}</div>
   <footer class="admin-orders-total"><span>Celkem za měsíc<small>${porce(portions(d.rows))} dohromady</small></span><strong>${money(sum(d.rows))}</strong></footer>${payCard(state.data.payment)}</section>`;
 }
 const days=firmDays(Array.from({length:5},(_,i)=>plus(d.from,i)),d.rows);
 return `<section class="delivery-view company-summary firm-orders">${head}${picker}${title}${simpleWeek(false)}${days}
  <footer class="admin-orders-total"><span>Celkem za týden<small>${porce(portions(d.rows))} dohromady</small></span><strong>${money(sum(d.rows))}</strong></footer>${payCard(state.data.payment)}</section>`;
};

document.addEventListener('click',async e=>{
 const firm=e.target.closest('[data-firm]');
 if(firm){state.firm=Number(firm.dataset.firm);await render();return;}
 const week=e.target.closest('[data-month-week]');
 if(week){const d=state.data,w=monthWeeks(d.from,d.to)[Number(week.dataset.monthWeek)];if(!w)return;
  const rows=d.rows.filter(r=>w.days.includes(r.date)),first=w.days[0],last=w.days.at(-1);
  openModal(`<p class="eyebrow">${esc(d.company.name)} · ${Number(week.dataset.monthWeek)+1}. týden</p><h2>${dateLabel(first,{day:'numeric',month:'numeric'})}${first===last?'':' – '+dateLabel(last,{day:'numeric',month:'numeric'})} ${first.slice(0,4)}</h2>
   <div class="company-summary firm-orders week-detail">${firmDays(w.days,rows)}<footer class="admin-orders-total"><span>Celkem za týden<small>${firmPorce(firmPortions(rows))} dohromady</small></span><strong>${money(firmSum(rows))}</strong></footer></div>`);
  const dlg=$('#modal');dlg.classList.add('week-modal');dlg.addEventListener('close',()=>dlg.classList.remove('week-modal'),{once:true});return;}
 const month=e.target.closest('[data-month-shift]');
 if(month){const d=new Date(state.date.slice(0,8)+'01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+Number(month.dataset.monthShift));state.date=d.toISOString().slice(0,10);await render();}
});

// Každé okno se zavře kliknutím vedle něj, není nutné mířit na křížek.
// Rozepsaný formulář se ale bez potvrzení nezavře a probíhající čtení jídelníčku se nepřeruší.
{
 const dlg=$('#modal');
 let downOutside=false;
 const outside=e=>{const r=dlg.getBoundingClientRect();return e.target===dlg&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom);};
 const changed=()=>[...dlg.querySelectorAll('input,textarea,select')].some(el=>
  el.type==='checkbox'||el.type==='radio'?el.checked!==el.defaultChecked:
  el.tagName==='SELECT'?[...el.options].some(o=>o.selected!==o.defaultSelected):
  el.type==='file'?el.files?.length>0:el.value!==el.defaultValue);
 // Kliknutí se počítá jen když začalo i skončilo mimo okno – označování textu přetažením ven okno nezavře.
 dlg.addEventListener('mousedown',e=>{downOutside=outside(e);});
 dlg.addEventListener('click',e=>{
  if(!downOutside||!outside(e))return;
  downOutside=false;
  if(dlg.querySelector('.read-ring'))return;
  if(changed()&&!confirm('Máte neuložené změny. Opravdu okno zavřít?'))return;
  dlg.close();
 });
}


// Seznam firem bez objednávky v Přehledu: rozbalí zbylé firmy, nebo je zase schová.
document.addEventListener('click',async e=>{
 if(!e.target.closest('[data-toggle-missing]'))return;
 state.showMissing=!state.showMissing;
 await render();
});


// Poznámka, že objednávku na daný den upravila restaurace (typicky po telefonátu po uzávěrce).
function editNote(edits,date){
 const e=(edits||[]).find(x=>x.date===date);if(!e)return '';
 const when=new Date(e.edited_at).toLocaleString('cs-CZ',{timeZone:'Europe/Prague',day:'numeric',month:'numeric',hour:'2-digit',minute:'2-digit'});
 return `<p class="edit-note">✎ Upraveno restaurací ${esc(when)}</p>`;
}

// Úprava objednávky restaurací za firmu – jakýkoli den, i po uzávěrce.
async function adminEditModal(date){
 const firm=state.data?.company;if(!firm)return;
 const d=await api(`admin/order?company=${firm.id}&date=${date}`);
 if(!d.meals.length){toast('Na tento den není v jídelníčku žádné jídlo.',true);return;}
 const unit=m=>money(m.price)+(m.fee?` + ${money(m.fee)} krabička`:'');
 openModal(`<p class="eyebrow">${esc(d.company.name)} · úprava restaurací</p><h2>${dateLabel(date,{weekday:'long',day:'numeric',month:'long'})}</h2>
  <p class="modal-sub">${d.closed?'Den je po uzávěrce – firma sama už měnit nemůže. ':''}Nastavte počty porcí. 0 jídlo z objednávky odebere.</p>
  <form id="admin-order-form" data-company="${d.company.id}" data-date="${date}" data-name="${esc(d.company.name)}">
   <div class="admin-edit-list">${d.meals.map(m=>`<div class="admin-edit-row">
    <div><b>${esc(m.name)}</b><small>${m.category==='Polévka'?'Polévka':'M'+m.slot} · ${unit(m)}${m.locked?' · cena z objednávky':''}</small></div>
    <div class="admin-edit-qty"><button type="button" class="secondary" data-edit-delta="-1" aria-label="Ubrat">−</button><input type="number" name="q${m.id}" data-meal="${m.id}" min="0" max="500" step="1" value="${m.quantity}" inputmode="numeric"><button type="button" class="secondary" data-edit-delta="1" aria-label="Přidat">+</button></div>
   </div>`).join('')}</div>
   <button class="primary full">Uložit úpravu</button>
  </form>`);
}
document.addEventListener('click',async e=>{
 const edit=e.target.closest('[data-admin-edit]');
 if(edit){try{await adminEditModal(edit.dataset.adminEdit);}catch(err){toast(err.message,true);}return;}
 const delta=e.target.closest('[data-edit-delta]');
 if(delta){const input=delta.parentElement.querySelector('input');input.value=Math.max(0,Math.min(500,(Number(input.value)||0)+Number(delta.dataset.editDelta)));}
});
document.addEventListener('submit',async e=>{
 const f=e.target;if(f.id!=='admin-order-form')return;
 e.preventDefault();const btn=f.querySelector('button.primary');btn.disabled=true;
 try{
  const items=[...f.querySelectorAll('input[data-meal]')].map(i=>({id:Number(i.dataset.meal),quantity:Number(i.value)}));
  if(items.some(x=>!Number.isInteger(x.quantity)||x.quantity<0||x.quantity>500))throw new Error('Počet porcí musí být celé číslo od 0 do 500.');
  const r=await api('admin/order',{company_id:Number(f.dataset.company),date:f.dataset.date,items});
  $('#modal').close();await render();
  const kdy=dateLabel(f.dataset.date,{weekday:'long',day:'numeric',month:'numeric'});
  toast(r.changed?{title:'Objednávka upravena',text:`${f.dataset.name} · ${kdy} — kuchyňský list i součty jsou přepočítané.`}:{title:'Beze změny',text:`${f.dataset.name} · ${kdy} — počty porcí zůstaly stejné.`},false,6000);
 }catch(err){btn.disabled=false;toast(err.message,true);}
});

// Hláška po akci: karta s ikonou, nadpisem a popisem, pruhem zbývajícího času a zavíracím křížkem.
// toast('text') nebo toast({title,text}); druhý parametr true = chyba. Najetí myší odpočet zastaví.
toast=function(message,error=false,ms=4500){
 const box=$('#toast');clearTimeout(toast.timer);
 const {title,text}=typeof message==='object'&&message?message:{title:error?'Něco se nepovedlo':'Hotovo',text:String(message)};
 const icon=error
  ?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v6M12 16.5v.5"/></svg>'
  :'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.5 12.5 3.5 3.5 7.5-8"/></svg>';
 box.setAttribute('role',error?'alert':'status');
 box.innerHTML=`<div class="toast-card ${error?'is-error':'is-ok'}"><span class="toast-icon">${icon}</span><div class="toast-body"><strong>${esc(title)}</strong>${text?`<span>${esc(text)}</span>`:''}</div><button type="button" class="toast-close" aria-label="Zavřít hlášku">×</button><i class="toast-bar"></i></div>`;
 const card=box.firstElementChild,bar=card.querySelector('.toast-bar');
 bar.style.setProperty('--toast-ms',ms+'ms');
 let left=ms,started=Date.now();
 const hide=()=>{card.classList.add('is-leaving');clearTimeout(toast.timer);toast.timer=setTimeout(()=>{if(box.firstElementChild===card){box.innerHTML='';try{box.hidePopover?.();}catch{}}},260);};
 const arm=()=>{started=Date.now();toast.timer=setTimeout(hide,left);};
 card.addEventListener('mouseenter',()=>{clearTimeout(toast.timer);left-=Date.now()-started;card.classList.add('is-paused');});
 card.addEventListener('mouseleave',()=>{card.classList.remove('is-paused');arm();});
 card.querySelector('.toast-close').addEventListener('click',hide);
 // Hláška jde do vrchní vrstvy prohlížeče, aby byla vidět i nad otevřeným oknem.
 if(box.showPopover){if(!box.popover)box.popover='manual';try{box.hidePopover();}catch{}box.showPopover();}
 requestAnimationFrame(()=>card.classList.add('is-in'));
 arm();
};


// Karta platby pod součtem v Objednávkách: částka, variabilní symbol, zpráva, QR kód a stav zaplacení.
function payCard(p){
 if(!p||!p.amount)return '';
 const admin=state.user.role==='admin';
 const range=p.kind==='week'?` (${dateLabel(p.from,{day:'numeric',month:'numeric'})} – ${dateLabel(p.to,{day:'numeric',month:'numeric'})})`:'';
 const title=`Platba za ${p.label}${range}`;
 if(!p.finished)return `<section class="pay-card is-waiting"><div class="pay-head"><h2>${esc(title)}</h2><span class="pay-badge">Probíhá</span></div><p class="pay-note">${admin?'Období ještě neskončilo – částka se může změnit.':'Platbu uhraďte po skončení '+(p.kind==='week'?'týdne':'měsíce')+', až bude částka konečná.'} Zatím ${money(p.amount)}.</p></section>`;
 const when=p.paid?new Date(p.paid.paid_at).toLocaleString('cs-CZ',{timeZone:'Europe/Prague',day:'numeric',month:'numeric',hour:'2-digit',minute:'2-digit'}):'';
 const who=p.paid?(p.paid.paid_by==='restaurant'?'restaurace':'firma'):'';
 const rows=[['Částka',`<b>${money(p.amount)}</b>`],['Variabilní symbol',`<b>${esc(p.vs)}</b>`],['Zpráva pro příjemce',esc(p.message)],['Účet',p.account?esc(p.account):'------']];
 return `<section class="pay-card ${p.paid?'is-paid':''}">
  <div class="pay-head"><h2>${esc(title)}</h2>${p.paid?`<span class="pay-badge is-paid">✓ Zaplaceno</span>`:`<span class="pay-badge is-due">K úhradě</span>`}</div>
  <div class="pay-body">
   <div class="pay-qr">${p.svg?`<div class="pay-qr-code" role="img" aria-label="QR kód pro platbu ${money(p.amount)}">${p.svg}</div><small>Naskenujte v bankovní aplikaci</small><button type="button" class="secondary small pay-save" data-pay-save>↓ Uložit QR kód</button><small class="pay-save-hint">Uloží obrázek do telefonu (iPhone: Uložit obrázek) – v bance ho pak vyberete z galerie.</small>`:`<div class="pay-qr-missing">QR kód</div>`}</div>
   <dl class="pay-details">${rows.map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
  </div>
  <div class="pay-foot">${p.paid
   ?`<span class="pay-paid-note">Označila ${who} ${esc(when)}</span><button type="button" class="secondary small" data-pay-toggle="0">Zrušit označení</button>`
   :`<span class="pay-paid-note">${admin?'Firma zatím neoznačila platbu.':'Po zaplacení označte, ať to restaurace ví.'}</span><button type="button" class="primary small" data-pay-toggle="1">Označit jako zaplacené</button>`}</div>
 </section>`;
}
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-pay-toggle]');if(!b)return;
 const p=state.data?.payment;if(!p)return;
 b.disabled=true;
 try{
  const paid=b.dataset.payToggle==='1';
  await api('payment/paid',{date:state.date,paid,company_id:p.company.id});
  await render();
 }catch(err){b.disabled=false;toast(err.message,true);}
});
document.addEventListener('submit',async e=>{
 const f=e.target;if(f.id!=='bank-form')return;
 e.preventDefault();const btn=f.querySelector('button');btn.disabled=true;
 try{
  const r=await api('settings/bank',{account:f.elements.account.value});
  await render();
  toast(r.iban?{title:'Účet uložen',text:`QR platby půjdou na ${r.iban}.`}:{title:'Účet odebrán',text:'QR kódy se firmám nezobrazí, dokud účet znovu nevyplníte.'});
 }catch(err){btn.disabled=false;toast(err.message,true);}
});


// Uložení QR kódu jako obrázku: na telefonu přes nabídku sdílení (Uložit obrázek → Fotky/galerie),
// jinde klasické stažení souboru.
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-pay-save]');if(!b)return;
 const p=state.data?.payment;if(!p)return;
 b.disabled=true;
 try{
  const res=await fetch(`/api/payment/qr.png?date=${state.date}${state.user.role==='admin'?'&company='+p.company.id:''}`,{credentials:'same-origin'});
  if(!res.ok)throw new Error((await res.json().catch(()=>({}))).error||'QR kód se nepodařilo připravit.');
  const name=(res.headers.get('content-disposition')||'').match(/filename="([^"]+)"/)?.[1]||'qr-platba.png';
  const blob=await res.blob();
  const file=new File([blob],name,{type:'image/png'});
  const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  if(ios&&navigator.canShare&&navigator.canShare({files:[file]})){
   try{await navigator.share({files:[file],title:'QR platba – Srub Podkozí'});}catch(err){if(err.name!=='AbortError')throw err;}
  }else{
   const url=URL.createObjectURL(blob);const link=document.createElement('a');
   link.href=url;link.download=name;document.body.append(link);link.click();link.remove();
   setTimeout(()=>URL.revokeObjectURL(url),10000);
  }
 }catch(err){toast(err.message,true);}
 finally{b.disabled=false;}
});


// Přehled pro tichý majitelský účet: kolik restaurace vydělává a kdo ještě nezaplatil.
function ownerDashboard(){
 const d=state.data||{};
 const box=(label,v,note)=>`<article class="own-stat"><span>${label}</span><strong>${money(v.trzba||0)}</strong><small>${v.porce||0} ${plural(v.porce||0,'porce','porce','porcí')}${note?' · '+note:''}</small></article>`;
 const mesic=(m)=>`<div><dt>${esc(dateLabel(m.mesic+'-01',{month:'long',year:'numeric'}))}</dt><dd><b>${money(m.trzba)}</b><small>${m.porce} ${plural(m.porce,'porce','porce','porcí')}</small></dd></div>`;
 const firma=(f)=>`<article class="${f.trzba?'':'is-empty'}"><span>${esc(f.name)}<small>${f.billing==='month'?'měsíčně':'týdně'}</small></span><strong>${money(f.trzba)}</strong><small>${f.porce} ${plural(f.porce,'porce','porce','porcí')}</small></article>`;
 return `<div class="simple-title"><h1>Přehled tržeb</h1><p>Jen pro vás. Nikde jinde se tento účet neukazuje.</p></div>
 <div class="own-stats">${box('Dnes',d.dnes||{})}${box('Tento týden',d.tyden||{})}${box('Tento měsíc',d.mesic||{})}${box('Letos',d.rok||{},(d.firmCount||0)+' '+plural(d.firmCount||0,'firma','firmy','firem'))}</div>
 <section class="set-card"><h2>Poslední měsíce</h2><dl class="own-months">${(d.months||[]).map(mesic).join('')||'<p class="photo-empty">Zatím žádné objednávky.</p>'}</dl></section>
 <section class="set-card"><h2>Nezaplacená období</h2>${(d.unpaid||[]).length?`<div class="own-unpaid">${d.unpaid.map(u=>`<article><span>${esc(u.company)}<small>${esc(u.label)}</small></span><strong>${money(u.amount)}</strong></article>`).join('')}</div><p class="footnote">Stav plateb označují firmy samy v Objednávkách.</p>`:'<p class="photo-empty">Vše zaplacené.</p>'}</section>
 <section class="set-card"><h2>Firmy tento měsíc</h2><div class="own-firms">${(d.firms||[]).map(firma).join('')||'<p class="photo-empty">Zatím žádné objednávky.</p>'}</div></section>`;
}
