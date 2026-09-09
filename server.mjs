import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {mkdirSync,readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {pragueNow,closed,validDate,money,portionPrice,dayAfter} from './domain.mjs';
import {weekMenu} from './seed-menu.mjs';
import {loginAllowed,recordFailedLogin,clearLoginFailures,pruneLoginAttempts} from './lib/login-rate-limit.ts';

const root=dirname(fileURLToPath(import.meta.url));
const demo=process.env.DEMO==='true';
const host=process.env.HOST||'127.0.0.1', port=Number(process.env.PORT||3020);
if(demo && !['127.0.0.1','localhost','::1'].includes(host)) throw new Error('Demo musí běžet pouze na localhost.');
const dataDir=resolve(root,process.env.DATA_DIR||'data');mkdirSync(dataDir,{recursive:true});
const db=new DatabaseSync(resolve(dataDir,'srub.sqlite'));
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
  const firms=[['Ateliér Novotný','firma@demo.cz','Podkozí 24, Chyňava',13900,'own',0],['Dřevostavby Beroun','drevo@demo.cz','Beroun, U Pily 18',12900,'disposable',800],['Studio Zahrada','zahrada@demo.cz','Chyňava 106',null,'disposable',800]];
  for(const f of firms){const id=run('INSERT INTO companies(name,email,address,price,packaging,fee) VALUES(?,?,?,?,?,?)',...f).lastInsertRowid;run('INSERT INTO users(email,password,role,company_id) VALUES(?,?,?,?)',f[1],hash('SrubDemo2026!'),'company',id);}
  const menu=[['Svíčková na smetaně','Hovězí maso, domácí houskový knedlík, brusinky','1, 3, 7, 9',16900,'Klasika'],['Kuřecí řízek s bramborovou kaší','Šťavnatý kuřecí řízek, máslová kaše, okurka','1, 3, 7',14900,'Oblíbené'],['Pečená vepřová krkovice','Šťouchané brambory s cibulkou, zelný salát','7',15900,'Z naší kuchyně'],['Krémové houbové rizoto','Žampiony, parmazán, čerstvá petrželka','7',14500,'Bez masa']];
  const today=pragueNow().date;
  for(const [date,name,description,allergens,price,category] of weekMenu)run('INSERT INTO meals(date,name,description,allergens,price,category) VALUES(?,?,?,?,?,?)',date,name,description,allergens,price*100,category);
  for(const meal of all('SELECT * FROM meals WHERE date IN (?,?)',today,dayAfter(today,1))){for(const c of all('SELECT * FROM companies')){const q=(meal.id+c.id)%5+1;run('INSERT INTO orders VALUES(?,?,?,?,?,?,?)',c.id,meal.id,q,portionPrice(meal,c),c.fee,c.packaging,new Date().toISOString());}}
 }
}
// Lokální ukázka má záměrně deset firem a objednávky pro všechny dny menu,
// aby se dal ověřit skutečný provozní soupis restaurace.
if(demo){
 const demoFirms=[
  ['Ateliér Novotný','firma@demo.cz','Podkozí 24, Chyňava',13900,'own',0],
  ['Dřevostavby Beroun','drevo@demo.cz','Beroun, U Pily 18',12900,'disposable',800],
  ['Studio Zahrada','zahrada@demo.cz','Chyňava 106',null,'disposable',800],
  ['Kovovýroba Král','kral@demo.cz','Beroun, Tyršova 12',13500,'own',0],
  ['Vinařství Hřebec','hrebec@demo.cz','Nižbor 45',14200,'disposable',700],
  ['Pekařství U mostu','most@demo.cz','Zdice, Náměstí 8',12900,'own',0],
  ['Stavby Vltava','vltava@demo.cz','Beroun, Plzeňská 92',13900,'disposable',800],
  ['Technologie Rondo','rondo@demo.cz','Rudná 31',14500,'own',0],
  ['Kanceláře Malina','malina@demo.cz','Loděnice 17',13500,'disposable',700],
  ['Auto Kříž','kriz@demo.cz','Králův Dvůr 64',null,'own',0]
 ];
 transaction(()=>{
  for(const f of demoFirms){
   if(get('SELECT id FROM companies WHERE email=?',f[1]))continue;
   const id=run('INSERT INTO companies(name,email,address,price,packaging,fee) VALUES(?,?,?,?,?,?)',...f).lastInsertRowid;
   run('INSERT INTO users(email,password,role,company_id) VALUES(?,?,?,?)',f[1],hash('SrubDemo2026!'),'company',id);
  }
  for(const meal of all('SELECT * FROM meals'))for(const c of all('SELECT * FROM companies')){
   const q=(meal.id*3+c.id*2)%6+1;
   run('INSERT OR IGNORE INTO orders VALUES(?,?,?,?,?,?,?)',c.id,meal.id,q,portionPrice(meal,c),c.fee,c.packaging,new Date().toISOString());
  }
 });
}
function session(req){const raw=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('srub_session='))?.slice(13);if(!raw)return null;const token=createHash('sha256').update(raw).digest('hex');return get(`SELECT u.id,u.email,u.role,u.company_id,COALESCE(c.name,'Restaurace Srub Podkozí') name FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN companies c ON c.id=u.company_id WHERE s.token=? AND s.expires>? AND (u.role='admin' OR c.active=1)`,token,Date.now());}
function rowsFor(date,company){return all(`SELECT o.*,m.name,m.description,m.date,c.name company,c.address FROM orders o JOIN meals m ON m.id=o.meal_id JOIN companies c ON c.id=o.company_id WHERE m.date=? ${company?'AND o.company_id=?':''} ORDER BY c.name,m.id`,...company?[date,company]:[date]);}
function summary(date){const rows=rowsFor(date);return {date,rows,total:rows.reduce((s,r)=>s+r.quantity,0),firms:new Set(rows.map(r=>r.company_id)).size};}
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
 if(report.status==='sent'||demo||!process.env.RESEND_API_KEY||!process.env.MAIL_FROM||!setting('reportEmail'))return;
 const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`srub-summary-${date}`},body:JSON.stringify({from:process.env.MAIL_FROM,to:[setting('reportEmail')],subject:`Srub Podkozí · objednávky ${date}`,text:report.body})});
 if(!response.ok)throw new Error(`E-mailová služba vrátila ${response.status}.`);
 run('UPDATE reports SET status=\'sent\',sent=?,error=NULL WHERE date=?',new Date().toISOString(),date);
 }catch(e){run('UPDATE reports SET status=\'error\',error=? WHERE date=?',String(e.message).slice(0,200),pragueNow().date);}finally{reporting=false;}}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
const dummyHash=hash(randomBytes(24).toString('hex'));
const server=http.createServer(async(req,res)=>{
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"};
 function send(code,value,extra={}){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8',...headers,...extra});res.end(typeof value==='string'?value:JSON.stringify(value));}
 try{
  const url=new URL(req.url,'http://localhost'), path=url.pathname;
  if(!path.startsWith('/api/')){if(req.method!=='GET')return send(405,{error:'Nepovolená metoda.'});const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/brand.svg':'brand.svg'};if(!files[path])return send(404,{error:'Stránka neexistuje.'});const ext=path==='/'?'.html':path.slice(path.lastIndexOf('.'));return send(200,readFileSync(resolve(root,'public',files[path]),'utf8'),{'Content-Type':mime[ext]});}
  let body={};
  if(req.method!=='GET'){
   const expected=process.env.APP_ORIGIN||`http://${req.headers.host}`;
   if(req.headers.origin!==expected)return send(403,{error:'Nepovolený původ požadavku.'});
   if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'Vyžadován JSON.'});
   let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>100000)return send(413,{error:'Soubor je příliš velký.'});}try{body=JSON.parse(raw||'{}');}catch{return send(400,{error:'Neplatná data.'});}
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
   const meals=all('SELECT * FROM meals WHERE date=? ORDER BY id',date).map(m=>({...m,price:company?portionPrice(m,company):m.price}));
   return send(200,{date,closed:closed(date),meals,company,orders:company?rowsFor(date,company.id):rowsFor(date),dates:all('SELECT DISTINCT date FROM meals WHERE date>=? ORDER BY date',pragueNow().date).map(x=>x.date)});
  }
  if(path==='/api/history'&&req.method==='GET')return send(200,{menuDates:all('SELECT DISTINCT date FROM meals ORDER BY date').map(m=>m.date),rows:all(`SELECT o.*,m.name,m.date FROM orders o JOIN meals m ON m.id=o.meal_id ${user.role==='company'?'WHERE o.company_id=?':''} ORDER BY m.date DESC,m.id`,...user.role==='company'?[user.company_id]:[])});
  if(path==='/api/order'&&req.method==='POST'){
   if(user.role!=='company')return send(403,{error:'Objednávání je dostupné firmám.'});
   if(!validDate(body.date)||!Array.isArray(body.items)||body.items.length>100)throw new Error('Neplatná objednávka.');
   transaction(()=>{
    if(closed(body.date))throw new Error('Objednávky na tento den jsou od 8:00 uzavřené.');
    const c=get('SELECT * FROM companies WHERE id=?',user.company_id);const seen=new Set();
    for(const item of body.items){if(!Number.isInteger(item.id)||!Number.isInteger(item.quantity)||item.quantity<0||item.quantity>500||seen.has(item.id))throw new Error('Počet porcí musí být celé číslo od 0 do 500.');seen.add(item.id);const m=get('SELECT * FROM meals WHERE id=? AND date=?',item.id,body.date);if(!m)throw new Error('Jídlo už není v nabídce.');
     if(item.quantity===0)run('DELETE FROM orders WHERE company_id=? AND meal_id=?',c.id,m.id);
     else run('INSERT INTO orders VALUES(?,?,?,?,?,?,?) ON CONFLICT(company_id,meal_id) DO UPDATE SET quantity=excluded.quantity,updated=excluded.updated',c.id,m.id,item.quantity,portionPrice(m,c),c.fee,c.packaging,new Date().toISOString());
    }
   });return send(200,{ok:true});
  }
  if(user.role!=='admin')return send(403,{error:'Tato část je dostupná pouze restauraci.'});
  if(path==='/api/dashboard'&&req.method==='GET'){const date=url.searchParams.get('date')||pragueNow().date;if(!validDate(date))throw new Error('Neplatné datum.');return send(200,{...summary(date),closed:closed(date),companies:all('SELECT * FROM companies ORDER BY name'),report:get('SELECT date,status,sent,error FROM reports WHERE date=?',date)||null});}
  if(path==='/api/companies'&&req.method==='POST'){
   const c={name:text(body.name),email:email(body.email),address:String(body.address||'').trim().slice(0,500),price:body.price===''||body.price===null?null:money(body.price),packaging:body.packaging,fee:body.packaging==='own'?0:money(body.fee||0)};
   if(!['own','disposable'].includes(c.packaging))throw new Error('Vyberte typ krabiček.');
   transaction(()=>{if(body.id){if(!get('SELECT id FROM companies WHERE id=?',body.id))throw new Error('Firma neexistuje.');run('UPDATE companies SET name=?,email=?,address=?,price=?,packaging=?,fee=?,active=? WHERE id=?',c.name,c.email,c.address,c.price,c.packaging,c.fee,body.active===false?0:1,body.id);run('UPDATE users SET email=? WHERE company_id=?',c.email,body.id);if(body.password){run('UPDATE users SET password=? WHERE company_id=?',hash(password(body.password)),body.id);run('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE company_id=?)',body.id);}}
    else{const h=hash(password(body.password));const id=run('INSERT INTO companies(name,email,address,price,packaging,fee) VALUES(?,?,?,?,?,?)',c.name,c.email,c.address,c.price,c.packaging,c.fee).lastInsertRowid;run('INSERT INTO users(email,password,role,company_id) VALUES(?,?,?,?)',c.email,h,'company',id);}
    run('UPDATE companies SET soup_price=? WHERE email=?',body.soup_price===''||body.soup_price==null?null:money(body.soup_price),c.email);
    if(body.id&&body.active===false)run('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE company_id=?)',body.id);
   });return send(200,{ok:true});
  }
  if(path==='/api/meals'&&req.method==='POST'){
   const meals=body.meals||[body];if(!Array.isArray(meals)||!meals.length||meals.length>100)throw new Error('Nahrajte nejvýše 100 jídel.');
   transaction(()=>{for(const m of meals){if(!validDate(m.date)||closed(m.date))throw new Error('Jídelníček po uzávěrce nelze měnit.');const values=[m.date,text(m.name),String(m.description||'').slice(0,500),String(m.allergens||'').slice(0,80),money(m.price),text(m.category||'Z naší kuchyně',50)];if(m.id){const old=get('SELECT * FROM meals WHERE id=?',m.id);if(!old||closed(old.date))throw new Error('Toto jídlo nelze změnit.');if(get('SELECT 1 FROM orders WHERE meal_id=?',m.id))throw new Error('Jídlo už má objednávky. Zachováme jeho původní údaje.');run('UPDATE meals SET date=?,name=?,description=?,allergens=?,price=?,category=? WHERE id=?',...values,m.id);}else run('INSERT INTO meals(date,name,description,allergens,price,category) VALUES(?,?,?,?,?,?)',...values);}});return send(200,{ok:true});
  }
  if(path==='/api/meals/delete'&&req.method==='POST'){const m=get('SELECT * FROM meals WHERE id=?',body.id);if(!m||closed(m.date))throw new Error('Toto jídlo nelze odstranit.');if(get('SELECT 1 FROM orders WHERE meal_id=?',m.id))throw new Error('Jídlo už má objednávky a nelze je odstranit.');run('DELETE FROM meals WHERE id=?',m.id);return send(200,{ok:true});}
  if(path==='/api/settings'&&req.method==='GET')return send(200,{reportEmail:setting('reportEmail'),emailReady:!demo&&Boolean(process.env.RESEND_API_KEY&&process.env.MAIL_FROM),demo});
  if(path==='/api/settings'&&req.method==='POST'){set('reportEmail',body.reportEmail?email(body.reportEmail):'');return send(200,{ok:true});}
  if(path==='/api/report'&&req.method==='GET'){const date=url.searchParams.get('date')||pragueNow().date;if(!validDate(date))throw new Error('Neplatné datum.');return send(200,reportText(date),{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':`attachment; filename="srub-${date}.txt"`});}
  return send(404,{error:'Požadavek neexistuje.'});
 }catch(e){const message=String(e.message);send(400,{error:message.includes('UNIQUE')?'Tento e-mail už používá jiný účet.':message.includes('SQLITE')?'Data se nepodařilo uložit.':message});}
});
server.listen(port,host,()=>{console.log(`Srub Podkozí: http://${host}:${port} (${demo?'local demo':'private application'})`);dailyReport();});
setInterval(dailyReport,60000).unref();
setInterval(pruneLoginAttempts,60000).unref();
setInterval(()=>run('DELETE FROM sessions WHERE expires<?',Date.now()),3600000).unref();
process.on('SIGTERM',()=>server.close(()=>{db.close();process.exit(0);}));
