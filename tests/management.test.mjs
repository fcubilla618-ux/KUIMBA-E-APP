import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {seed} from '../development/seed.mjs';
import {ROOT} from '../development/access.mjs';
import {database,auth} from '../backend/runtime.mjs';
import {createManagementOperations} from '../backend/management.mjs';
import {clientId} from '../backend/management-validation.mjs';
let fixture,execute;
const uid=who=>fixture.credentials.find(a=>a.email.startsWith(who+'@')).uid;
const call=(who,command)=>execute(uid(who),{operationId:randomUUID(),...command});
const permissions={manageAppointments:true,canSell:true,manageClients:true,manageServices:false};
before(async()=>{fixture=await seed();execute=createManagementOperations(database,{auth});});
after(async()=>{await fixture?.env.cleanup();await database.terminate();});
test('product writes separate private costs, preserve images and reject stale stock edits',async()=>{
 const photo='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
 const cmd={action:'product.save',id:'management-product',revision:0,name:'Ficticio',category:'Otro',price:40,cost:11,stock:3,photo,active:true};
 const first=await call('admin',cmd);assert.equal(first.revision,1);
 const publicDoc=(await database.doc(`${ROOT}/v2Products/${cmd.id}`).get()).data();assert.equal(publicDoc.photo,photo);assert.equal(publicDoc.cost,undefined);
 assert.equal((await database.doc(`${ROOT}/v2ProductCosts/${cmd.id}`).get()).data().cost,11);
 await database.doc(`${ROOT}/v2Products/${cmd.id}`).update({stock:2,revision:2});
 await assert.rejects(call('admin',{...cmd,revision:1}),e=>e.code==='stale-revision');
 assert.equal((await database.doc(`${ROOT}/v2Products/${cmd.id}`).get()).data().stock,2);
 await assert.rejects(call('walter',{...cmd,id:'forged'}),e=>e.code==='permission-denied');
});
test('own services require explicit management permission and cannot transfer owners',async()=>{
 const cmd={action:'service.save',id:'management-service',revision:0,barberId:'test-walter',name:'Ficticio',description:'Ensayo',price:70,duration:30,active:true};
 await assert.rejects(call('walter',cmd),e=>e.code==='permission-denied');
 await database.doc(`users/${uid('walter')}`).update({permissions:{...permissions,manageServices:true}});
 await call('walter',cmd);
 await assert.rejects(call('dani',{action:'service.delete',id:cmd.id,revision:1}),e=>e.code==='permission-denied');
 await assert.rejects(call('admin',{...cmd,revision:1,barberId:'test-dani'}),e=>e.code==='immutable-owner');
 await call('walter',{action:'service.delete',id:cmd.id,revision:1});
 assert.equal((await database.doc(`${ROOT}/v2Services/${cmd.id}`).get()).data().active,false);
});
test('clients use deterministic owner scoped IDs and deactivation blocks successful receipt replay',async()=>{
 const cmd={action:'client.save',operationId:'management-client',id:clientId('test-dani','cliente'),revision:0,barberId:'test-dani',key:'cliente',name:'Ficticio',phone:'',notes:'Privado Dani'};
 await call('dani',cmd);await call('dani',cmd);
 await assert.rejects(call('walter',cmd),e=>e.code==='permission-denied');
 await database.doc(`users/${uid('dani')}`).update({active:false});
 await assert.rejects(call('dani',cmd),e=>e.code==='permission-denied');
 await database.doc(`users/${uid('dani')}`).update({active:true});
});
test('concurrent creates claim an unlinked barber once; profile and barber links stay reciprocal',async()=>{
 const id='management-unlinked';await database.doc(`${ROOT}/v2Barbers/${id}`).set({id,name:'Ficticio',active:true,revision:1});
 const cmd={action:'user.create',name:'Ficticio',email:'managed-first@example.test',password:'Synthetic123!',role:'barber',barberId:id,permissions};
 const results=await Promise.allSettled([call('admin',cmd),call('admin',{...cmd,email:'managed-second@example.test'})]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(results.find(x=>x.status==='rejected').reason.code,'barber-already-linked');
 const linked=(await database.doc(`${ROOT}/v2Barbers/${id}`).get()).data();assert.equal(linked.revision,2);
 const user=(await database.doc(`users/${linked.uid}`).get()).data();assert.equal(user.barberId,id);assert.equal(user.password,undefined);
 assert.equal((await auth.getUser(linked.uid)).disabled,false);
 const unused=(await auth.listUsers()).users.filter(x=>x.email?.startsWith('managed-')&&x.uid!==linked.uid);assert.equal(unused.length,1);assert.equal(unused[0].disabled,true);
 await call('admin',{action:'user.update',uid:linked.uid,revision:1,name:'Ficticio',role:'admin',barberId:'',active:true,permissions});
 assert.equal((await database.doc(`${ROOT}/v2Barbers/${id}`).get()).data().uid,null);
 assert.equal((await database.doc(`${ROOT}/v2Barbers/${id}`).get()).data().revision,3);
});
test('admin cannot self-demote, hijack linked barber or leak password during reset',async()=>{
 await assert.rejects(call('admin',{action:'user.update',uid:uid('admin'),revision:1,name:'Ficticio',role:'admin',barberId:'',active:false,permissions}),e=>e.code==='self-lockout');
 const second=await call('admin',{action:'user.create',name:'Segundo',email:'management-admin@example.test',password:'Synthetic123!',role:'admin',barberId:'',permissions});
 await assert.rejects(call('admin',{action:'user.update',uid:second.uid,revision:1,name:'Segundo',role:'barber',barberId:'test-junior',active:true,permissions}),e=>e.code==='barber-already-linked');
 const passwordCmd={action:'user.password',operationId:'management-password',uid:second.uid,password:'Different123!'};
 await call('admin',passwordCmd);await call('admin',passwordCmd);
 assert.equal((await database.doc(`users/${second.uid}`).get()).data().password,undefined);
 const response=await fetch('http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-only',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'management-admin@example.test',password:'Different123!',returnSecureToken:true})});assert.equal(response.ok,true);
});
test('payment corrections preserve amounts and reject reversal pairs',async()=>{
 const id='service-management-appt',entry={id,appointmentId:'management-appt',barberId:'test-walter',type:'servicio',amount:100,payment:'Efectivo',revision:1};
 for(const kind of ['v2Cash','v2Sales'])await database.doc(`${ROOT}/${kind}/${id}`).set(entry);
 await call('admin',{action:'cash.payment',id,revision:1,payment:'Tarjeta'});
 for(const kind of ['v2Cash','v2Sales']){const updated=(await database.doc(`${ROOT}/${kind}/${id}`).get()).data();assert.equal(updated.payment,'Tarjeta');assert.equal(updated.amount,100);assert.equal(updated.barberId,'test-walter');}
 for(const kind of ['v2Cash','v2Sales'])await database.doc(`${ROOT}/${kind}/reverse-management-appt`).set({...entry,id:'reverse-management-appt',type:'reversion',reverses:id,amount:-100});
 await assert.rejects(call('admin',{action:'cash.payment',id,revision:2,payment:'Efectivo'}),e=>e.code==='accounting-review-required');
});
test('concurrent administrators cannot disable each other and leave no active administrator',async()=>{
 const first=uid('admin');const list=await database.collection('users').where('role','==','admin').get();
 const second=list.docs.find(d=>d.id!==first&&d.data().email==='management-admin@example.test');assert.ok(second);
 for(const record of list.docs)if(record.id!==first&&record.id!==second.id)await record.ref.update({active:false});
 const [a,b]=await Promise.all([database.doc(`users/${first}`).get(),second.ref.get()]);
 const update=(actor,target,old)=>execute(actor,{action:'user.update',operationId:randomUUID(),uid:target,revision:old.revision??1,name:old.name||'Ensayo',role:'admin',barberId:'',active:false,permissions});
 const results=await Promise.allSettled([update(first,second.id,b.data()),update(second.id,first,a.data())]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const active=(await database.collection('users').where('role','==','admin').get()).docs.filter(d=>d.data().active===true);assert.equal(active.length,1);
});
