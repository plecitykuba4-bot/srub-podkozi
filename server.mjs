import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {mkdirSync,readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {pragueNow,closed,validDate,money,portionPrice,dayAfter} from './domain.mjs';
import {smtpConfig,sendMail} from './lib/mailer.mjs';
import {reportHtml} from './lib/report-grid.mjs';
import {kitchenWorkbook} from './lib/kitchen-xlsx.mjs';
import {readMenuFile,reviewMeals,detectWeek,LIMITS} from './lib/menu-import.mjs';
// Jídla dne i s pořadím hlavního jídla (M1–M4); polévka má slot 0.
const SQL_MEALS_WITH_SLOT="SELECT *,CASE WHEN category='Polévka' THEN 0 ELSE ROW_NUMBER() OVER (PARTITION BY category='Polévka' ORDER BY id) END AS slot FROM meals WHERE date=? ORDER BY id";
import {weekMenu} from './seed-menu.mjs';
import {loginAllowed,recordFailedLogin,clearLoginFailures,pruneLoginAttempts} from './lib/login-rate-limit.mjs';

const root=dirname(fileURLToPath(import.meta.url));
const demo=process.env.DEMO==='true';
const host=process.env.HOST||'127.0.0.1', port=Number(process.env.PORT||3020);
if(demo && !['127.0.0.1','localhost','::1'].includes(host)) throw new Error('Demo musí běžet pouze na localhost.');
const dataDir=resolve(root,process.env.DATA_DIR||'data');mkdirSync(dataDir,{recursive:true});
const db=new DatabaseSync(resolve(dataDir,'srub.sqlite'));
// Sjednané ceny za jednotlivá hlavní jídla M1–M4; starší databáze sloupce nemají.
function addColumnIfMissing(table,column,type){
 const has=db.prepare(`PRAGMA table_info(${table})`).all().some(c=>c.name===column);
 if(!has)db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS companies(id INTEGER PRIMARY KEY,name TEXT NOT NULL, email TEXT NOT NULL, address TEXT NOT NULL DEFAULT '', price INTEGER, packaging TEXT NOT NULL, fee INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, soup_price INTEGER);
 CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL,company_id INTEGER REFERENCES companies(id));
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER REFERENCES users(id),expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS meals(id INTEGER PRIMARY KEY,date TEXT NOT NULL,name TEXT NOT NULL,description TEXT NOT NULL,allergens TEXT NOT NULL,price INTEGER NOT NULL,category TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS orders(company_id INTEGER REFERENCES companies(id),meal_id INTEGER REFERENCES meals(id),quantity INTEGER NOT NULL,price INTEGER NOT NULL,fee INTEGER NOT NULL,packaging TEXT NOT NULL,updated TEXT NOT NULL,PRIMARY KEY(company_id,meal_id));
 CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS reports(date TEXT PRIMARY KEY,body TEXT NOT NULL,status TEXT NOT NULL,created TEXT NOT NULL,sent TEXT,error TEXT);
 CREATE TABLE IF NOT EXISTS login_attempts(key TEXT PRIMARY KEY,count INTEGER NOT NULL,until INTEGER NOT NULL);
`);
for(const n of [1,2,3,4])addColumnIfMissing('companies',`price_m${n}`,'INTEGER');
// Jak se firmě vyúčtovává: po týdnech, nebo za celý kalendářní měsíc.
addColumnIfMissing('companies','billing',"TEXT NOT NULL DEFAULT 'week'");

const all=(sql,...p)=>db.prepare(sql).all(...p), get=(sql,...p)=>db.prepare(sql).get(...p), run=(sql,...p)=>db.prepare(sql).run(...p);
function hash(password){const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(password,salt,64).toString('hex');}
function verify(password,stored){const [salt,h]=stored.split(':');return timingSafeEqual(scryptSync(password,salt,64),Buffer.from(h,'hex'));}
function text(value,max=200){if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new Error('Vyplňte požadované údaje ve správné délce.');return value.trim();}
function email(value){const e=text(value).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))throw new Error('Zadejte platný e-mail.');return e;}
function password(value){if(typeof value!=='string'||value.length<12||value.length>128)throw new Error('Heslo musí mít 12 až 128 znaků.');return value;}
function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const v=fn();db.exec('COMMIT');return v;}catch(e){db.exec('ROLLBACK');throw e;}}
const setting=k=>get('SELECT value FROM settings WHERE key=?',k)?.value||'';
const set=(k,v)=>run('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',k,v);
if(setting('mode') && setting('mode')!==(demo?'demo':'production'))throw new Error('Použijte samostatný DATA_DIR pro demo a produkci.');
set('mode',demo?'demo':'production');
if(!get('SELECT id FROM users LIMIT 1')){
 if(!demo && (!process.env.ADMIN_EMAIL||!process.env.ADMIN_PASSWORD))throw new Error('Nastavte ADMIN_EMAIL a ADMIN_PASSWORD nebo DEMO=true pro místní ukázku.');
 run('INSERT INTO users(email,password,role) VALUES(?,?,?)',demo?'restaurace@demo.cz':email(process.env.ADMIN_EMAIL),hash(demo?'SrubDemo2026!':password(process.env.ADMIN_PASSWORD)),'admin');
 if(demo){
  // Uložené dva týdny menu se posunou tak, aby druhý připadl na aktuální týden (o víkendu na příští).
  const now=pragueNow().date, weekday=new Date(now+'T12:00:00Z').getUTCDay();
  const monday=dayAfter(now,weekday===6?2:weekday===0?1:1-weekday);
  const lastMonday=weekMenu.map(m=>m[0]).sort().at(-1), lastDay=new Date(lastMonday+'T12:00:00Z');
  lastDay.setUTCDate(lastDay.getUTCDate()-((lastDay.getUTCDay()+6)%7));
  const shift=Math.round((new Date(monday+'T12:00:00Z')-lastDay)/86400000);
  for(const [date,name,description,allergens,price,category] of weekMenu)run('INSERT INTO meals(date,name,description,allergens,price,category) VALUES(?,?,?,?,?,?)',dayAfter(date,shift),name,description,allergens,price*100,category);
 }
}
// Lokální ukázka má záměrně deset firem a objednávky pro všechny dny menu,
// aby se dal ověřit skutečný provozní soupis restaurace.
if(demo){
 const demoFirms=[
  ["Fish","fish@demo.cz","",null,"disposable",1000],
  ["Sedlo","sedlo@demo.cz","",null,"disposable",1000],
  ["Pospa","pospa@demo.cz","",null,"disposable",1000],
  ["Held","held@demo.cz","",null,"disposable",1000],
  ["Magoš","magos@demo.cz","",null,"disposable",1000],
  ["Chára","chara@demo.cz","",null,"disposable",1000],
  ["Hyundai","hyundai@demo.cz","",null,"disposable",1000],
  ["Autosklo","autosklo@demo.cz","",null,"disposable",1000],
  ["Nevecom","nevecom@demo.cz","",null,"disposable",1000],
  ["Vít","vit@demo.cz","",null,"disposable",1000],
  ["Otec","otec@demo.cz","",null,"disposable",1000],
  ["Barcal","barcal@demo.cz","",null,"own",0],
  ["Káča","kaca@demo.cz","",null,"own",0],
  ["OÚ Ptice","ou-ptice@demo.cz","",null,"own",0],
  ["Hlava","hlava@demo.cz","",null,"own",0],
  ["JRK Firm","jrk-firm@demo.cz","",null,"own",0],
  ["Nouzov","nouzov@demo.cz","",null,"own",0],
  ["Jarda","jarda@demo.cz","",null,"own",0],
  ["Jitka","jitka@demo.cz","",null,"own",0],
  ["Lída","lida@demo.cz","",null,"own",0],
  ["Síla","sila@demo.cz","",null,"own",0],
  ["Ptice","ptice@demo.cz","",null,"own",0]
 ];
 transaction(()=>{
  // Ukázkové firmy se zakládají jen jednou. Když firmě v aplikaci změníte e-mail,
  // server ji jinak při dalším startu podle starého e-mailu založil znovu jako duplikát.
  if(!setting('demoFirmsSeeded')){for(const f of demoFirms){
   if(get('SELECT id FROM companies WHERE email=?',f[1]))continue;
   const id=run('INSERT INTO companies(name,email,address,price,packaging,fee) VALUES(?,?,?,?,?,?)',...f).lastInsertRowid;
   run('INSERT INTO users(email,password,role,company_id) VALUES(?,?,?,?)',f[1],hash('SrubDemo2026!'),'company',id);
  }
  // Ukázkové objednávky jen pro ukázkové firmy – firmy založené v aplikaci se generátor nesmí dotknout.
  // Ceny se počítají podle pořadí jídla (M1–M4), aby platily i sjednané ceny firmy.
  // Typ krabiček se nastavuje jen při založení firmy; přepisovat ho při každém startu by rušilo úpravy z aplikace.
  const demoEmails=demoFirms.map(f=>f[1]);
  const demoCompanies=all(`SELECT * FROM companies WHERE email IN (${demoEmails.map(()=>'?').join(',')})`,...demoEmails);
  for(const {date} of all('SELECT DISTINCT date FROM meals'))
   for(const meal of all(SQL_MEALS_WITH_SLOT,date))for(const c of demoCompanies){
    const q=(meal.id*3+c.id*2)%6+1;
    run('INSERT OR IGNORE INTO orders VALUES(?,?,?,?,?,?,?)',c.id,meal.id,q,portionPrice(meal,c),c.fee,c.packaging,new Date().toISOString());
   }
  // Ukázkové objednávky vzniknou jen jednou – jinak by se po každém startu vrátily i ty, které restaurace zrušila.
  set('demoFirmsSeeded','1');}
 });
}
function session(req){const raw=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('srub_session='))?.slice(13);if(!raw)return null;const token=createHash('sha256').update(raw).digest('hex');return get(`SELECT u.id,u.email,u.role,u.company_id,COALESCE(c.name,'Restaurace Srub Podkozí') name FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN companies c ON c.id=u.company_id WHERE s.token=? AND s.expires>? AND (u.role='admin' OR c.active=1)`,token,Date.now());}
function rowsFor(date,company){return all(`SELECT o.*,m.name,m.description,m.date,m.category,c.name company,c.address FROM orders o JOIN meals m ON m.id=o.meal_id JOIN companies c ON c.id=o.company_id WHERE m.date=? ${company?'AND o.company_id=?':''} ORDER BY c.name,m.id`,...company?[date,company]:[date]);}
function summary(date){const rows=rowsFor(date);return {date,rows,total:rows.reduce((s,r)=>s+r.quantity,0),firms:new Set(rows.map(r=>r.company_id)).size};}
// Pondělí až pátek toho týdne, do kterého datum spadá.
function weekDates0(date){
 const d=new Date(date+'T12:00:00Z');
 const monday=new Date(d);monday.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));
 return Array.from({length:5},(_,i)=>{const x=new Date(monday);x.setUTCDate(monday.getUTCDate()+i);return x.toISOString().slice(0,10);});
}
async function reportMail(date,subject){
 const s=summary(date);
 const dates=weekDates0(date);
 const rowsByDate=Object.fromEntries(dates.map(d=>[d,rowsFor(d)]));
 const week={dates,rowsByDate};
 return {subject,text:reportText(date),html:reportHtml(date,s.rows,s.total,week),
  attachments:[{filename:`kuchynsky-list-${date}.xlsx`,content:await kitchenWorkbook(date,s.rows),contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}]};
}
function reportText(date){const s=summary(date);const total={};for(const r of s.rows)total[r.name]=(total[r.name]||0)+r.quantity;let body=`SRUB PODKOZÍ — ${date}\nUzávěrka v 8:00 (Europe/Prague)\nCelkem ${s.total} porcí pro ${s.firms} firem\n\nKUCHYNĚ\n`;
 for(const [name,q] of Object.entries(total))body+=`${q}× ${name}\n`;
 for(const id of new Set(s.rows.map(r=>r.company_id))){const rows=s.rows.filter(r=>r.company_id===id);body+=`\n${rows[0].company} — ${rows[0].address}\n`;for(const r of rows)body+=`${r.quantity}× ${r.name} | ${r.packaging==='own'?'vlastní krabičky':'jednorázové krabičky'}\n`;}
 return body;
}
let reporting=false;
async function dailyReport(){if(reporting)return;reporting=true;try{
 const {date,hour}=pragueNow();if(hour<8)return;
 run('INSERT OR IGNORE INTO reports(date,body,status,created) VALUES(?,?,?,?)',date,reportText(date),'prepared',new Date().toISOString());
 const report=get('SELECT * FROM reports WHERE date=?',date);
 const smtp=smtpConfig();
 if(report.status==='sent'||demo||!smtp||!setting('reportEmail'))return;
 await sendMail(smtp,{to:setting('reportEmail'),...await reportMail(date,`Srub Podkozí · objednávky ${date}`)});
 run('UPDATE reports SET status=\'sent\',sent=?,error=NULL WHERE date=?',new Date().toISOString(),date);
 }catch(e){run('UPDATE reports SET status=\'error\',error=? WHERE date=?',String(e.message).slice(0,200),pragueNow().date);}finally{reporting=false;}}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.pdf':'application/pdf'};
const dummyHash=hash(randomBytes(24).toString('hex'));
const server=http.createServer(async(req,res)=>{
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"};
 function send(code,value,extra={}){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8',...headers,...extra});res.end(Buffer.isBuffer(value)?value:typeof value==='string'?value:JSON.stringify(value));}
 try{
  const url=new URL(req.url,'http://localhost'), path=url.pathname;
  if(!path.startsWith('/api/')){if(req.method!=='GET')return send(405,{error:'Nepovolená metoda.'});const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/brand.svg':'brand.svg','/logo.png':'logo.png','/brand-goat.svg':'brand-goat.svg','/brand-full.svg':'brand-full.svg'};if(!files[path])return send(404,{error:'Stránka neexistuje.'});const ext=path==='/'?'.html':path.slice(path.lastIndexOf('.'));return send(200,readFileSync(resolve(root,'public',files[path]),['.png','.pdf'].includes(ext)?null:'utf8'),{'Content-Type':mime[ext]});}
  let body={};
  if(req.method!=='GET'){
   const expected=process.env.APP_ORIGIN||`http://${req.headers.host}`;
   if(req.headers.origin!==expected)return send(403,{error:'Nepovolený původ požadavku.'});
   if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'Vyžadován JSON.'});
   let raw='';const bodyLimit=path==='/api/menu/read'?12*1024*1024:100000;for await(const chunk of req){raw+=chunk;if(raw.length>bodyLimit)return send(413,{error:'Soubor je příliš velký.'});}try{body=JSON.parse(raw||'{}');}catch{return send(400,{error:'Neplatná data.'});}
  }
  if(path==='/api/login'&&req.method==='POST'){
   const limitKeys=['ip:'+req.socket.remoteAddress,'email:'+String(body.email||'').trim().toLowerCase()];
   if(!loginAllowed(limitKeys))return send(429,{error:'Příliš mnoho pokusů. Zkuste to za 15 minut.'});
   const e=email(body.email);const key=createHash('sha256').update(req.socket.remoteAddress+'|'+e).digest('hex');const attempts=get('SELECT * FROM login_attempts WHERE key=?',key);
   if(attempts?.until>Date.now()&&attempts.count>=8)return send(429,{error:'Příliš mnoho pokusů. Zkuste to za 15 minut.'});
   const u=get('SELECT u.*,c.active FROM users u LEFT JOIN companies c ON c.id=u.company_id WHERE u.email=?',e);
   const ok=typeof body.password==='string'&&body.password.length<=128&&verify(body.password,u?.password||dummyHash);
   if(!ok||!u||(u.role==='company'&&!u.active)){recordFailedLogin(limitKeys);const count=attempts?.until>Date.now()?attempts.count+1:1;run('INSERT OR REPLACE INTO login_attempts VALUES(?,?,?)',key,count,Date.now()+900000);return send(401,{error:'Nesprávný e-mail nebo heslo.'});}
   clearLoginFailures([limitKeys[1]]);
   run('DELETE FROM login_attempts WHERE key=?',key);const token=randomBytes(32).toString('hex');run('INSERT INTO sessions VALUES(?,?,?)',createHash('sha256').update(token).digest('hex'),u.id,Date.now()+43200000);
   return send(200,{ok:true},{'Set-Cookie':`srub_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${process.env.COOKIE_SECURE==='true'?'; Secure':''}`});
  }
  const user=session(req);
  if(demo&&path==='/api/dev-users'&&req.method==='GET')return send(200,{users:all('SELECT u.id,u.role,u.email,COALESCE(c.name,\'Restaurace Srub Podkozí\') name FROM users u LEFT JOIN companies c ON c.id=u.company_id ORDER BY CASE WHEN u.role=\'admin\' THEN 0 ELSE 1 END,c.name')});
  if(demo&&path==='/api/dev-switch'&&req.method==='POST'){
   if(!user)return send(401,{error:'Přihlaste se prosím.'});
   if(!Number.isInteger(body.id))throw new Error('Neplatný účet.');
   const target=get('SELECT u.id,u.role,c.active FROM users u LEFT JOIN companies c ON c.id=u.company_id WHERE u.id=?',body.id);
   if(!target||(target.role==='company'&&!target.active))throw new Error('Účet není dostupný.');
   const old=(req.headers.cookie||'').match(/srub_session=([^;]+)/)?.[1]||'';run('DELETE FROM sessions WHERE token=?',createHash('sha256').update(old).digest('hex'));
   const token=randomBytes(32).toString('hex');run('INSERT INTO sessions VALUES(?,?,?)',createHash('sha256').update(token).digest('hex'),target.id,Date.now()+43200000);
   return send(200,{ok:true},{'Set-Cookie':`srub_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`});
  }
  if(path==='/api/me'&&req.method==='GET')return send(200,{user,demo,clock:pragueNow()});
  if(!user)return send(401,{error:'Přihlaste se prosím.'});
  if(path==='/api/logout'&&req.method==='POST'){const token=(req.headers.cookie||'').match(/srub_session=([^;]+)/)?.[1]||'';run('DELETE FROM sessions WHERE token=?',createHash('sha256').update(token).digest('hex'));return send(200,{ok:true},{'Set-Cookie':'srub_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});}
  if(path==='/api/password'&&req.method==='POST'){const u=get('SELECT * FROM users WHERE id=?',user.id);if(!verify(String(body.current||''),u.password))return send(400,{error:'Současné heslo nesouhlasí.'});run('UPDATE users SET password=? WHERE id=?',hash(password(body.password)),user.id);run('DELETE FROM sessions WHERE user_id=?',user.id);return send(200,{ok:true});}
  if(path==='/api/menu'&&req.method==='GET'){
   const date=url.searchParams.get('date')||pragueNow().date;if(!validDate(date))throw new Error('Neplatné datum.');
   const company=user.role==='company'?get('SELECT * FROM companies WHERE id=?',user.company_id):null;
   const meals=all(SQL_MEALS_WITH_SLOT,date).map(m=>({...m,price:company?portionPrice(m,company):m.price}));
   return send(200,{date,closed:closed(date),meals,company,orders:company?rowsFor(date,company.id):rowsFor(date),dates:all('SELECT DISTINCT date FROM meals WHERE date>=? ORDER BY date',pragueNow().date).map(x=>x.date)});
  }
  if(path==='/api/history'&&req.method==='GET')return send(200,{menuDates:all('SELECT DISTINCT date FROM meals ORDER BY date').map(m=>m.date),rows:all(`SELECT o.*,m.name,m.date FROM orders o JOIN meals m ON m.id=o.meal_id ${user.role==='company'?'WHERE o.company_id=?':''} ORDER BY m.date DESC,m.id`,...user.role==='company'?[user.company_id]:[])});
  if(path==='/api/order'&&req.method==='POST'){
   if(user.role!=='company')return send(403,{error:'Objednávání je dostupné firmám.'});
   if(!validDate(body.date)||!Array.isArray(body.items)||body.items.length>100)throw new Error('Neplatná objednávka.');
   transaction(()=>{
    if(closed(body.date))throw new Error('Objednávky na tento den jsou od 8:00 uzavřené.');
    const c=get('SELECT * FROM companies WHERE id=?',user.company_id);const seen=new Set();
    for(const item of body.items){if(!Number.isInteger(item.id)||!Number.isInteger(item.quantity)||item.quantity<0||item.quantity>500||seen.has(item.id))throw new Error('Počet porcí musí být celé číslo od 0 do 500.');seen.add(item.id);const m=all(SQL_MEALS_WITH_SLOT,body.date).find(x=>x.id===item.id);if(!m)throw new Error('Jídlo už není v nabídce.');
     if(item.quantity===0)run('DELETE FROM orders WHERE company_id=? AND meal_id=?',c.id,m.id);
     else run('INSERT INTO orders VALUES(?,?,?,?,?,?,?) ON CONFLICT(company_id,meal_id) DO UPDATE SET quantity=excluded.quantity,updated=excluded.updated',c.id,m.id,item.quantity,portionPrice(m,c),c.fee,c.packaging,new Date().toISOString());
    }
   });return send(200,{ok:true});
  }
  if(user.role!=='admin')return send(403,{error:'Tato část je dostupná pouze restauraci.'});
  if(path==='/api/firm-orders'&&req.method==='GET'){
   const date=url.searchParams.get('date')||pragueNow().date;if(!validDate(date))throw new Error('Neplatné datum.');
   const companies=all('SELECT id,name,packaging,fee,billing,active FROM companies ORDER BY name');
   const company=companies.find(c=>c.id===Number(url.searchParams.get('company')))||companies[0]||null;
   if(!company)return send(200,{companies,company:null,rows:[],from:date,to:date});
   let from,to;
   if(company.billing==='month'){from=date.slice(0,8)+'01';const end=new Date(from+'T12:00:00Z');end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(0);to=end.toISOString().slice(0,10);}
   else{const d=new Date(date+'T12:00:00Z');from=dayAfter(date,-((d.getUTCDay()+6)%7));to=dayAfter(from,4);}
   const rows=all('SELECT o.quantity,o.price,o.fee,o.packaging,m.id meal_id,m.name,m.category,m.date FROM orders o JOIN meals m ON m.id=o.meal_id WHERE o.company_id=? AND m.date BETWEEN ? AND ? AND o.quantity>0 ORDER BY m.date,m.id',company.id,from,to);
   return send(200,{companies,company,rows,from,to});
  }
  if(path==='/api/dashboard'&&req.method==='GET'){const date=url.searchParams.get('date')||pragueNow().date;if(!validDate(date))throw new Error('Neplatné datum.');return send(200,{...summary(date),closed:closed(date),companies:all('SELECT * FROM companies ORDER BY name'),report:get('SELECT date,status,sent,error FROM reports WHERE date=?',date)||null});}
  if(path==='/api/menu/read'&&req.method==='POST'){
   if(!process.env.ANTHROPIC_API_KEY)throw new Error('Čtení lístku není nastavené. Doplňte ANTHROPIC_API_KEY do .env a restartujte server.');
   // Denní strop volání, aby chyba nebo překlikání nespotřebovaly kredit.
   const today=pragueNow().date, used=Number(setting('menuReads:'+today)||0);
   if(used>=LIMITS.maxPerDay)throw new Error(`Dnes už proběhlo ${used} načtení lístku. Zkuste to zítra, nebo použijte import CSV.`);
   const buffer=Buffer.from(String(body.data||''),'base64');
   if(!buffer.length)throw new Error('Soubor je prázdný.');
   if(buffer.length>LIMITS.maxBytes)throw new Error('Soubor smí mít nejvýše 8 MB.');
   if(!validDate(body.weekStart))throw new Error('Neplatné datum týdne.');
   const weekDates=weekDates0(body.weekStart);
   run("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=?", 'menuReads:'+today, String(used+1), String(used+1));
   // Od této chvíle posíláme průběh po řádcích (NDJSON), okno z nich ukazuje skutečná procenta.
   // Chyby už nejdou vyhodit výjimkou, hlavička odpovědi je odeslaná – posílají se jako řádek.
   res.writeHead(200,{...headers,'Content-Type':'application/x-ndjson; charset=utf-8'});
   const line=o=>res.write(JSON.stringify(o)+'\n');
   try{
    const result=await readMenuFile({buffer,mediaType:String(body.mediaType||''),weekDates,apiKey:process.env.ANTHROPIC_API_KEY,onProgress:p=>line({progress:p})});
    const week=detectWeek(result.meals)||weekDates;
    line({result:{...result,weekDates:week,notes:reviewMeals(result.meals,week),reads:{used:used+1,limit:LIMITS.maxPerDay}}});
   }catch(e){
    // Když se čtení nepovedlo, pokus se z denního limitu vrátí – nic se neutratilo.
    run("UPDATE settings SET value=? WHERE key=?", String(used), 'menuReads:'+today);
    line({error:String(e.message||e)});
   }
   return res.end();
  }
  if(path==='/api/report/test'&&req.method==='POST'){
   // Ruční zkušební odeslání. Záměrně obchází demo pojistku, protože je to vždy
   // vědomé kliknutí správce – automatický ranní report se v demu dál neodesílá.
   const smtp=smtpConfig();
   if(!smtp)throw new Error('Odesílání není nastavené. Doplňte SMTP údaje do .env a restartujte server.');
   const to=setting('reportEmail');
   if(!to)throw new Error('Vyplňte e-mail pro ranní souhrn.');
   const date=validDate(body.date)?body.date:pragueNow().date;
   await sendMail(smtp,{to,...await reportMail(date,`Srub Podkozí · zkušební souhrn ${date}`)});
   return send(200,{ok:true,to,date});
  }
  if(path==='/api/companies/delete'&&req.method==='POST'){
   const firm=get('SELECT id,name FROM companies WHERE id=?',body.id);
   if(!firm)throw new Error('Firma neexistuje.');
   const used=get('SELECT COUNT(*) n FROM orders WHERE company_id=?',firm.id).n;
   if(used)throw new Error(`Firma má ${used} objednávek, proto ji nelze smazat. Pozastavte ji místo toho.`);
   transaction(()=>{
    run('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE company_id=?)',firm.id);
    run('DELETE FROM users WHERE company_id=?',firm.id);
    run('DELETE FROM companies WHERE id=?',firm.id);
   });
   return send(200,{ok:true,name:firm.name});
  }
  if(path==='/api/companies'&&req.method==='POST'){
   const c={name:text(body.name),email:email(body.email),address:String(body.address||'').trim().slice(0,500),price:body.price===''||body.price==null?null:money(body.price),price_m1:body.price_m1===''||body.price_m1==null?null:money(body.price_m1),price_m2:body.price_m2===''||body.price_m2==null?null:money(body.price_m2),price_m3:body.price_m3===''||body.price_m3==null?null:money(body.price_m3),price_m4:body.price_m4===''||body.price_m4==null?null:money(body.price_m4),soup_price:body.soup_price===''||body.soup_price==null?null:money(body.soup_price),packaging:body.packaging,fee:body.packaging==='own'?0:money(body.fee||0)};
   if(!['own','disposable'].includes(c.packaging))throw new Error('Vyberte typ krabiček.');
   transaction(()=>{if(body.id){if(!get('SELECT id FROM companies WHERE id=?',body.id))throw new Error('Firma neexistuje.');run('UPDATE companies SET name=?,email=?,address=?,price=?,price_m1=?,price_m2=?,price_m3=?,price_m4=?,soup_price=?,packaging=?,fee=?,active=? WHERE id=?',c.name,c.email,c.address,c.price,c.price_m1,c.price_m2,c.price_m3,c.price_m4,c.soup_price,c.packaging,c.fee,body.active===false?0:1,body.id);run('UPDATE users SET email=? WHERE company_id=?',c.email,body.id);
    // Nové ceny a krabičky platí pro dny, které ještě nejsou po uzávěrce.
    // Dny už uzavřené si drží cenu, za kterou se objednávalo – z těch se fakturuje.
    {const firm=get('SELECT * FROM companies WHERE id=?',body.id);
     const open=all('SELECT DISTINCT m.date d FROM orders o JOIN meals m ON m.id=o.meal_id WHERE o.company_id=?',body.id).map(x=>x.d).filter(d=>!closed(d));
     for(const d of open)for(const meal of all(SQL_MEALS_WITH_SLOT,d))
      run('UPDATE orders SET price=?,fee=?,packaging=? WHERE company_id=? AND meal_id=?',portionPrice(meal,firm),firm.fee,firm.packaging,body.id,meal.id);}if(body.password){run('UPDATE users SET password=? WHERE company_id=?',hash(password(body.password)),body.id);run('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE company_id=?)',body.id);}}
    else{const h=hash(password(body.password));const id=run('INSERT INTO companies(name,email,address,price,price_m1,price_m2,price_m3,price_m4,soup_price,packaging,fee) VALUES(?,?,?,?,?,?,?,?,?,?,?)',c.name,c.email,c.address,c.price,c.price_m1,c.price_m2,c.price_m3,c.price_m4,c.soup_price,c.packaging,c.fee).lastInsertRowid;run('INSERT INTO users(email,password,role,company_id) VALUES(?,?,?,?)',c.email,h,'company',id);}
    run('UPDATE companies SET soup_price=? WHERE email=?',body.soup_price===''||body.soup_price==null?null:money(body.soup_price),c.email);
    run('UPDATE companies SET billing=? WHERE email=?',body.billing==='month'?'month':'week',c.email);
    if(body.id&&body.active===false)run('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE company_id=?)',body.id);
   });return send(200,{ok:true});
  }
  if(path==='/api/meals'&&req.method==='POST'){
   const meals=body.meals||[body];if(!Array.isArray(meals)||!meals.length||meals.length>100)throw new Error('Nahrajte nejvýše 100 jídel.');
   const importing=Array.isArray(body.meals);
   const dates=[...new Set(meals.map(m=>m.date))].sort();
   const kratce=d=>`${Number(String(d).slice(8,10))}. ${Number(String(d).slice(5,7))}.`;
   transaction(()=>{
    if(importing){
     // Nahrání jídelníčku nahrazuje celé dny, aby druhé nahrání téhož týdne jídla nezdvojilo.
     // Den s objednávkami přepsat nejde – objednávky by ztratily jídla, na která ukazují.
     for(const d of dates){
      if(!validDate(d)||closed(d))throw new Error('Jídelníček po uzávěrce nelze měnit.');
      if(get('SELECT 1 FROM orders o JOIN meals m ON m.id=o.meal_id WHERE m.date=?',d))throw new Error(`Na ${kratce(d)} už firmy objednávaly, jídelníček toho dne nejde přepsat.`);
      run('DELETE FROM meals WHERE date=?',d);
     }
    }
    for(const m of meals){if(!validDate(m.date)||closed(m.date))throw new Error('Jídelníček po uzávěrce nelze měnit.');const values=[m.date,text(m.name),String(m.description||'').slice(0,500),String(m.allergens||'').slice(0,80),money(m.price),text(m.category||'Z naší kuchyně',50)];if(m.id){const old=get('SELECT * FROM meals WHERE id=?',m.id);if(!old||closed(old.date))throw new Error('Toto jídlo nelze změnit.');if(get('SELECT 1 FROM orders WHERE meal_id=?',m.id))throw new Error('Jídlo už má objednávky. Zachováme jeho původní údaje.');run('UPDATE meals SET date=?,name=?,description=?,allergens=?,price=?,category=? WHERE id=?',...values,m.id);}else run('INSERT INTO meals(date,name,description,allergens,price,category) VALUES(?,?,?,?,?,?)',...values);}
   });
   return send(200,{ok:true,saved:meals.length,from:dates[0],to:dates[dates.length-1],days:dates.length,companies:get('SELECT COUNT(*) n FROM companies WHERE active=1').n});
  }
  if(path==='/api/meals/delete'&&req.method==='POST'){const m=get('SELECT * FROM meals WHERE id=?',body.id);if(!m||closed(m.date))throw new Error('Toto jídlo nelze odstranit.');if(get('SELECT 1 FROM orders WHERE meal_id=?',m.id))throw new Error('Jídlo už má objednávky a nelze je odstranit.');run('DELETE FROM meals WHERE id=?',m.id);return send(200,{ok:true});}
  if(path==='/api/settings'&&req.method==='GET')return send(200,{reportEmail:setting('reportEmail'),emailReady:!demo&&Boolean(smtpConfig()),smtpReady:Boolean(smtpConfig()),demo});
  if(path==='/api/settings'&&req.method==='POST'){set('reportEmail',body.reportEmail?email(body.reportEmail):'');return send(200,{ok:true});}
  if(path==='/api/report'&&req.method==='GET'){const date=url.searchParams.get('date')||pragueNow().date;if(!validDate(date))throw new Error('Neplatné datum.');const book=await kitchenWorkbook(date,summary(date).rows);return send(200,book,{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="kuchynsky-list-${date}.xlsx"`});}
  return send(404,{error:'Požadavek neexistuje.'});
 }catch(e){const message=String(e.message);send(400,{error:message.includes('UNIQUE')?'Tento e-mail už používá jiný účet.':message.includes('SQLITE')?'Data se nepodařilo uložit.':message});}
});
// Na Vercelu běží server jako funkce: žádné naslouchání na portu ani smyčky na pozadí.
if(!process.env.VERCEL){
 server.listen(port,host,()=>{console.log(`Srub Podkozí: http://${host}:${port} (${demo?'local demo':'private application'})`);dailyReport();});
 setInterval(dailyReport,60000).unref();
 setInterval(pruneLoginAttempts,60000).unref();
 setInterval(()=>run('DELETE FROM sessions WHERE expires<?',Date.now()),3600000).unref();
}
export default function handler(req,res){server.emit('request',req,res);}
process.on('SIGTERM',()=>server.close(()=>{db.close();process.exit(0);}));
