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
  client=(await call('login',{email:'firma@demo.cz',password:'SrubDemo2026!'})).cookie;
  other=(await call('login',{email:'drevo@demo.cz',password:'SrubDemo2026!'})).cookie;
  assert.ok(admin&&client&&other);
  assert.equal((await call('dashboard',null,client)).status,403);
  assert.equal((await call('companies',{name:'Forbidden'},client)).status,403);
  assert.equal((await call('order',{},client,'https://evil.example')).status,403);
  const date=dayAfter(pragueNow().date,2);
  assert.equal((await call('meals',{date,name:'Integrační jídlo',description:'Test',allergens:'7',price:180,category:'Hlavní jídlo'},admin)).status,200);
  const m=(await call('menu?date='+date,null,client)).data.meals.find(x=>x.name==='Integrační jídlo');
  assert.equal(m.price,13900);
  assert.equal((await call('order',{date,company_id:2,items:[{id:m.id,quantity:8}],price:1},client)).status,200);
  const own=(await call('menu?date='+date,null,client)).data.orders.find(x=>x.meal_id===m.id);
  assert.equal(own.quantity,8);assert.equal(own.price,13900);assert.equal(own.company_id,1);
  assert.equal((await call('menu?date='+date,null,other)).data.orders.some(x=>x.meal_id===m.id),false);
  assert.equal((await call('order',{date,items:[{id:m.id,quantity:-1}]},client)).status,400);
  assert.equal((await call('order',{date:dayAfter(pragueNow().date,-1),items:[]},client)).status,400);
  assert.equal((await call('meals/delete',{id:m.id},admin)).status,400);
  const companies=(await call('dashboard',null,admin)).data.companies;const c=companies.find(x=>x.id===1);
  assert.equal((await call('companies',{...c,price:100,soup_price:40,fee:0,active:true},admin)).status,200);
  await call('order',{date,items:[{id:m.id,quantity:9}]},client);
  assert.equal((await call('menu?date='+date,null,client)).data.orders.find(x=>x.meal_id===m.id).price,13900);
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
