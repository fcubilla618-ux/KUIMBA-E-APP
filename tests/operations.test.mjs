import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../development/seed.mjs';
import {createOperations} from '../backend/operations.mjs';
import {database,auth,assertEmulatorEnvironment} from '../backend/runtime.mjs';
import {ROOT} from '../development/access.mjs';
import {randomUUID} from 'node:crypto';
let fixture,ops;
const call=(who,command)=>ops(fixture.credentials.find(a=>a.email.startsWith(who+'@')).uid,{operationId:randomUUID(),...command});
const turn=(barber='walter',time='12:00')=>({action:'appointment.create',barberId:`test-${barber}`,serviceId:`test-${barber}`,date:'2026-11-03',time,client:'Cliente ficticio',phone:'',notes:''});
before(async()=>{fixture=await seed();ops=createOperations(database);});
after(async()=>{await fixture?.env.cleanup();await database.terminate();});
test('runtime cannot be redirected to real Firebase',()=>assert.throws(()=>assertEmulatorEnvironment({FIRESTORE_EMULATOR_HOST:'production:443'})));
test('four real emulator Auth accounts are verified and each barber can create only own turns',async()=>{
 for(const who of ['admin','walter','dani','junior']){
  const a=fixture.credentials.find(x=>x.email.startsWith(who+'@'));
  const r=await fetch('http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-only',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:a.email,password:a.password,returnSecureToken:true})});
  const token=await r.json();assert.equal((await auth.verifyIdToken(token.idToken,true)).uid,a.uid);
  const b=who==='admin'?'walter':who;const result=await call(who,turn(b,who==='admin'?'11:00':'12:00'));assert.equal(result.revision,1);
  if(who!=='admin')await assert.rejects(call(who,turn(b==='walter'?'dani':'walter','14:00')),e=>e.code==='permission-denied');
 }
});
test('independent transactions racing an empty schedule, partial overlaps and adjacent slots',async()=>{
 const command=turn('walter','14:00');
 const competing=await Promise.allSettled([call('walter',command),call('admin',{...command,time:'14:30'})]);
 assert.equal(competing.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(competing.find(r=>r.status==='rejected').reason.code,'appointment-conflict');
 // Independent date so the winner's interval is irrelevant.
 await call('walter',{...turn('walter','16:00'),date:'2026-11-04'});
 await call('admin',{...turn('walter','17:00'),date:'2026-11-04'});
});
test('update/cancel use revisions; failed update preserves original; cash reversal never deletes history',async()=>{
 const first=await call('dani',{...turn('dani','15:00'),date:'2026-11-05'});
 const command={...turn('dani','16:00'),action:'appointment.update',id:first.id,revision:1};
 const updated=await call('dani',command);assert.equal(updated.revision,2);
 await assert.rejects(call('dani',command),e=>e.code==='stale-revision');
 await assert.rejects(call('walter',{action:'appointment.cancel',id:first.id,revision:2}),e=>e.code==='permission-denied');
 await call('dani',{action:'appointment.complete',id:first.id,revision:2,payment:'Efectivo'});
 const original=await database.doc(`${ROOT}/v2Cash/service-${first.id}`).get();assert.equal(original.data().amount,100);
 await call('admin',{action:'appointment.cancel',id:first.id,revision:3});
 assert.equal((await database.doc(`${ROOT}/v2Cash/service-${first.id}`).get()).data().amount,100);
 assert.equal((await database.doc(`${ROOT}/v2Cash/reverse-${first.id}`).get()).data().amount,-100);
});
test('idempotent sale and concurrent stock decrement are atomic; prices and owners cannot be forged',async()=>{
 const cmd={action:'product.sell',operationId:'same-sale',barberId:'test-junior',productId:'test-product',quantity:1,payment:'Tarjeta'};
 const same=await Promise.all([call('junior',cmd),call('junior',cmd)]);assert.equal(same[0].id,same[1].id);
 assert.equal((await database.doc(`${ROOT}/v2Products/test-product`).get()).data().stock,0);
 const cash=(await database.doc(`${ROOT}/v2Cash/${same[0].id}`).get()).data();assert.equal(cash.amount,20);assert.equal(cash.barberId,'test-junior');assert.equal(cash.unitCost,undefined);
 await assert.rejects(call('junior',{...cmd,quantity:2}),e=>e.code==='idempotency-conflict');
 await assert.rejects(call('dani',{...cmd,operationId:'other',barberId:'test-dani'}),e=>e.code==='insufficient-stock');
 await assert.rejects(call('walter',{...cmd,operationId:'forged',price:1}),e=>e.code==='invalid-input');
});
test('deactivated profiles cannot replay previously successful operations',async()=>{
 const a=fixture.credentials.find(x=>x.email.startsWith('junior@'));
 await database.doc(`users/${a.uid}`).update({active:false});
 await assert.rejects(call('junior',{action:'product.sell',operationId:'same-sale',barberId:'test-junior',productId:'test-product',quantity:1,payment:'Tarjeta'}),e=>e.code==='permission-denied');
 await database.doc(`users/${a.uid}`).update({active:true});
});
test('two different sellers racing last unit create exactly one sale and cash row',async()=>{
 await database.doc(`${ROOT}/v2Products/last-unit`).set({name:'Ficticio',price:50,stock:1});
 const results=await Promise.allSettled(['dani','junior'].map(who=>call(who,{action:'product.sell',barberId:`test-${who}`,productId:'last-unit',quantity:1,payment:'Efectivo'})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'insufficient-stock');
 assert.equal((await database.doc(`${ROOT}/v2Products/last-unit`).get()).data().stock,0);
 for(const kind of ['v2Sales','v2Cash'])assert.equal((await database.collection(`${ROOT}/${kind}`).where('productId','==','last-unit').get()).size,1);
});
test('moving into occupied slot rolls back; admin reassignment releases old day and enforces scoped services',async()=>{
 const a=await call('admin',{...turn('walter','10:00'),date:'2026-11-10'});
 await call('admin',{...turn('walter','11:00'),date:'2026-11-10'});
 await assert.rejects(call('admin',{...turn('walter','11:30'),date:'2026-11-10',action:'appointment.update',id:a.id,revision:1}),e=>e.code==='appointment-conflict');
 assert.equal((await database.doc(`${ROOT}/v2Appointments/${a.id}`).get()).data().time,'10:00');
 await assert.rejects(call('admin',{...turn('dani','10:00'),serviceId:'test-walter',date:'2026-11-11'}),e=>e.code==='invalid-service');
 await call('admin',{...turn('dani','10:00'),date:'2026-11-11',action:'appointment.update',id:a.id,revision:1});
 await call('walter',{...turn('walter','10:00'),date:'2026-11-10'});
 await assert.rejects(call('walter',{action:'appointment.cancel',id:a.id,revision:2}),e=>e.code==='permission-denied');
});
test('historical service price and cash payment survive catalog changes and reversal',async()=>{
 const a=await call('junior',{...turn('junior','16:00'),date:'2026-11-12'});
 await database.doc(`${ROOT}/v2Services/test-junior`).update({price:999});
 await call('junior',{action:'appointment.complete',id:a.id,revision:1,payment:'Tarjeta'});
 await call('junior',{action:'appointment.cancel',id:a.id,revision:2});
 const original=(await database.doc(`${ROOT}/v2Cash/service-${a.id}`).get()).data();const reverse=(await database.doc(`${ROOT}/v2Cash/reverse-${a.id}`).get()).data();
 assert.equal(original.amount,100);assert.equal(reverse.amount,-100);assert.equal(reverse.payment,'Tarjeta');
 await assert.rejects(call('junior',{action:'appointment.cancel',id:a.id,revision:3}),e=>e.code==='invalid-transition');
 await database.doc(`${ROOT}/v2Services/test-junior`).update({price:100});
});
test('server records business date around UTC midnight and keeps UTC audit timestamp',async()=>{
 await database.doc(`${ROOT}/v2Products/time-zone`).set({name:'Ficticio',price:50,stock:1});
 const clock=()=>new Date('2026-11-03T00:30:00Z');const fixed=createOperations(database,{clock});
 const a=fixture.credentials.find(x=>x.email.startsWith('dani@'));
 const result=await fixed(a.uid,{action:'product.sell',operationId:'time-zone',barberId:'test-dani',productId:'time-zone',quantity:1,payment:'Efectivo'});
 const cash=(await database.doc(`${ROOT}/v2Cash/${result.id}`).get()).data();
 assert.equal(cash.date,'2026-11-02');assert.equal(cash.time,'21:30');assert.equal(cash.createdAt,'2026-11-03T00:30:00.000Z');
});
test('phase 3 operations honor shared closures and live permissions, even for a prior receipt',async()=>{
 const a=fixture.credentials.find(x=>x.email.startsWith('walter@'));
 await database.doc(`users/${a.uid}`).update({permissions:{manageAppointments:false,canSell:false}});
 await assert.rejects(call('walter',{...turn('walter','16:00'),date:'2026-11-17'}),e=>e.code==='permission-denied');
 await assert.rejects(call('walter',{action:'product.sell',barberId:'test-walter',productId:'test-product',quantity:1,payment:'Efectivo'}),e=>e.code==='permission-denied');
 await database.doc(`users/${a.uid}`).update({permissions:{manageAppointments:true,canSell:true}});
 const config=database.doc(`${ROOT}/v2Settings/public`),value=(await config.get()).data();
 await config.update({'settings.closures':[{id:'closure',start:'2026-11-17',end:'2026-11-17',reason:'Ensayo'}]});
 await assert.rejects(call('admin',{...turn('walter','16:00'),date:'2026-11-17'}),e=>e.code==='shop-closed');
 await config.set(value);
});
test('phase 3 stale catalog editor cannot overwrite stock sold through the server',async()=>{
 const data={action:'product.save',id:'phase3-stock',revision:0,name:'Ficticio',category:'Otro',price:20,cost:5,stock:3,photo:'',active:true};
 await call('admin',data);await call('dani',{action:'product.sell',barberId:'test-dani',productId:'phase3-stock',quantity:1,payment:'Efectivo'});
 await assert.rejects(call('admin',{...data,revision:1,price:30}),e=>e.code==='stale-revision');
 assert.equal((await database.doc(`${ROOT}/v2Products/phase3-stock`).get()).data().stock,2);
});
