import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {pragueNow,dayAfter} from '../domain.mjs';
test('Přihlášení, role, oddělení firem, objednávky, ceny a revokace přístupu',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'srub-test-'));const port=31320+Math.floor(Math.random()*1000);const origin=`http://127.0.0.1:${port}`;
 const proc=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,DEMO:'true',PORT:String(port),DATA_DIR:dir,HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
 let error='';proc.stderr.on('data',x=>error+=x);await Promise.race([once(proc.stdout,'data'),once(proc,'exit').then(()=>{throw new Error(error);}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Server startup timeout: '+error)),10000).unref())]);
 let admin='',client='',other='';
 async function call(path,data,cookie='',customOrigin=origin){const r=await fetch(origin+'/api/'+path,{method:data?'POST':'GET',headers:{...(data?{'Content-Type':'application/json',Origin:customOrigin}:{}),Cookie:cookie},body:data?JSON.stringify(data):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 try{
  assert.equal((await call('menu')).status,401);
  admin=(await call('login',{email:'restaurace@demo.cz',password:'SrubDemo2026!'})).cookie;
  // Klientskou firmu si test zakládá sám, aby nezávisel na ukázkových datech.
  assert.equal((await call('companies',{name:'Klient s.r.o.',email:'klient@example.cz',address:'Chyňava',price:139,soup_price:'',packaging:'own',fee:0,password:'KlientPassword123'},admin)).status,200);
  const clientId=(await call('dashboard',null,admin)).data.companies.find(x=>x.email==='klient@example.cz').id;
  client=(await call('login',{email:'klient@example.cz',password:'KlientPassword123'})).cookie;
  other=(await call('login',{email:'fish@demo.cz',password:'SrubDemo2026!'})).cookie;
  assert.ok(admin&&client&&other);
  assert.equal((await call('dashboard',null,client)).status,403);
  assert.equal((await call('companies',{name:'Forbidden'},client)).status,403);
  assert.equal((await call('order',{},client,'https://evil.example')).status,403);
  const date=dayAfter(pragueNow().date,2);
  assert.equal((await call('meals',{date,name:'Integrační jídlo',description:'Test',allergens:'7',price:180,category:'Hlavní jídlo'},admin)).status,200);
  const m=(await call('menu?date='+date,null,client)).data.meals.find(x=>x.name==='Integrační jídlo');
  assert.equal(m.price,13900);
  assert.equal((await call('order',{date,company_id:clientId+1,items:[{id:m.id,quantity:8}],price:1},client)).status,200);
  const own=(await call('menu?date='+date,null,client)).data.orders.find(x=>x.meal_id===m.id);
  assert.equal(own.quantity,8);assert.equal(own.price,13900);assert.equal(own.company_id,clientId);
  assert.equal((await call('menu?date='+date,null,other)).data.orders.some(x=>x.meal_id===m.id),false);
  assert.equal((await call('order',{date,items:[{id:m.id,quantity:-1}]},client)).status,400);
  assert.equal((await call('order',{date:dayAfter(pragueNow().date,-1),items:[]},client)).status,400);
  assert.equal((await call('meals/delete',{id:m.id},admin)).status,400);
  const companies=(await call('dashboard',null,admin)).data.companies;const c=companies.find(x=>x.id===clientId);
  assert.equal((await call('companies',{...c,price:100,soup_price:40,fee:0,active:true},admin)).status,200);
  // Změna sjednané ceny se promítne i do už uložené objednávky na den, který ještě není po uzávěrce.
  assert.equal((await call('menu?date='+date,null,client)).data.orders.find(x=>x.meal_id===m.id).price,10000,'otevřený den se přecení');
  await call('order',{date,items:[{id:m.id,quantity:9}]},client);
  assert.equal((await call('menu?date='+date,null,client)).data.orders.find(x=>x.meal_id===m.id).price,10000,'nová objednávka jede za novou cenu');
  // Restaurace upraví objednávku za firmu i v uzavřeném minulém dni; firma sama nesmí.
  // Týden před tím, na který demo posune uložené menu (o víkendu je to už příští týden) – má jídelníček a je uzavřený.
  const wd=new Date(pragueNow().date+'T12:00:00Z').getUTCDay();
  const past=dayAfter(pragueNow().date,(wd===6?2:wd===0?1:1-wd)-7);
  const pastMeals=(await call(`admin/order?company=${clientId}&date=${past}`,null,admin)).data.meals;
  assert.ok(pastMeals.length>0,'minulý týden má jídelníček');
  assert.equal((await call('admin/order',{company_id:clientId,date:past,items:[{id:pastMeals[0].id,quantity:3}]},client)).status,403,'firma nesmí upravovat za restauraci');
  const edited=await call('admin/order',{company_id:clientId,date:past,items:[{id:pastMeals[0].id,quantity:3}]},admin);
  assert.equal(edited.status,200);assert.equal(edited.data.changed,1);
  const hist=(await call('history',null,client)).data;
  assert.equal(hist.rows.find(r=>r.meal_id===pastMeals[0].id).quantity,3,'firma vidí upravený počet');
  assert.ok(hist.edits.some(e=>e.date===past),'firma vidí poznámku o úpravě');
  // Úprava počtu u už objednaného jídla nemění cenu z doby objednání.
  await call('admin/order',{company_id:clientId,date,items:[{id:m.id,quantity:5}]},admin);
  const kept=(await call('menu?date='+date,null,client)).data.orders.find(x=>x.meal_id===m.id);
  assert.equal(kept.quantity,5);assert.equal(kept.price,10000,'cena z objednávky zůstává');
  await call('admin/order',{company_id:clientId,date,items:[{id:m.id,quantity:9}]},admin);
  // Platba za skončený týden: částka ze skutečných objednávek, firma ji označí, restaurace to vidí.
  const pay=(await call('payment?date='+past,null,client)).data;
  assert.equal(pay.finished,true);assert.equal(pay.amount,3*(pastMeals[0].price+pastMeals[0].fee),'částka odpovídá objednávkám týdne');
  assert.ok(/^\d+$/.test(pay.vs)&&pay.message.startsWith('Srub Podkozi - '),'symbol a zpráva');
  assert.equal(pay.svg,null,'bez účtu restaurace není QR');
  assert.equal((await call('settings/bank',{account:'19-2000145398/0800'},admin)).status,400,'neplatný účet se neuloží');
  assert.equal((await call('settings/bank',{account:'19-2000145399/0800'},admin)).status,200);
  assert.ok((await call('payment?date='+past,null,client)).data.svg.startsWith('<svg'),'s účtem je QR');
  assert.equal((await call('payment/paid',{date,paid:true},client)).status,400,'neskončené období nejde označit');
  assert.equal((await call('payment/paid',{date:past,paid:true},client)).status,200);
  assert.equal((await call(`payment?company=${clientId}&date=${past}`,null,admin)).data.paid.paid_by,'company','restaurace vidí, že firma zaplatila');
  assert.equal((await call('settings/bank',{account:'1'},client)).status,403,'firma nemůže měnit účet restaurace');
  // Tichý majitelský účet: vidí čísla, ale nic nezmění. Zakládá se přímo v databázi, appka na něj tlačítko nemá.
  {const {DatabaseSync}=await import('node:sqlite');const {randomBytes,scryptSync}=await import('node:crypto');
   const db=new DatabaseSync(join(dir,'srub.sqlite'));const salt=randomBytes(16).toString('hex');
   db.prepare('INSERT INTO users(email,password,role) VALUES(?,?,?)').run('duch@test.local',salt+':'+scryptSync('DuchTajneHeslo123',salt,64).toString('hex'),'owner');
   db.close();}
  const ghost=(await call('login',{email:'duch@test.local',password:'DuchTajneHeslo123'})).cookie;
  assert.ok(ghost,'duch se přihlásí');
  const souhrn=(await call('owner-summary',null,ghost)).data;
  assert.ok(souhrn.mesic.trzba>0&&souhrn.firms.length>0,'duch vidí tržby i firmy');
  assert.equal((await call('dashboard',null,ghost)).status,200);
  assert.equal((await call(`payment?company=${clientId}&date=${past}`,null,ghost)).status,200);
  for(const [cesta,data] of [['admin/order',{company_id:clientId,date,items:[]}],['companies',{name:'X'}],['settings/bank',{account:'1'}],['payment/paid',{date:past,paid:false}],['order',{date,items:[]}]])
    assert.equal((await call(cesta,data,ghost)).status,403,`duch nesmí ${cesta}`);
  assert.equal((await call('owner-summary',null,client)).status,403,'firma souhrn tržeb nevidí');
  assert.equal((await call('companies',{name:'Test s.r.o.',email:'new@example.cz',address:'Chyňava',price:'',soup_price:'',packaging:'own',fee:0,password:'MyNewPassword123'},admin)).status,200);
  const newCookie=(await call('login',{email:'new@example.cz',password:'MyNewPassword123'})).cookie;
  assert.ok(newCookie);assert.equal((await call('history',null,newCookie)).data.rows.length,0);
  await call('companies',{...c,price:100,soup_price:40,fee:0,active:false},admin);
  assert.equal((await call('menu?date='+date,null,client)).status,401);
  assert.equal((await call('password',{current:'MyNewPassword123',password:'AnEvenNewerPassword123'},newCookie)).status,200);
  assert.equal((await call('history',null,newCookie)).status,401);
  const summary=(await call('dashboard?date='+date,null,admin)).data;
  assert.equal(summary.rows.find(x=>x.meal_id===m.id).quantity,9);
 }finally{proc.kill();await once(proc,'exit');rmSync(dir,{recursive:true,force:true});}
});
