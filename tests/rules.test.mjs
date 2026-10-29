import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,collection,query,where,setDoc,updateDoc,deleteDoc} from 'firebase/firestore';
import {PROJECT,ROOT} from '../development/access.mjs';
import {accounts,documents} from '../development/fixtures.mjs';
let env;
before(async()=>{
  env=await initializeTestEnvironment({projectId:PROJECT,firestore:{host:'127.0.0.1',port:18080,rules:await readFile('development/firestore.rules','utf8')}});
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c=>{
    for(const [path,data] of Object.entries(documents()))await setDoc(doc(c.firestore(),path),data);
    for(const [uid,data] of Object.entries({inactive:{role:'admin',active:false},missing:{role:'admin'},broken:{role:'barber',active:true,barberId:'test-walter'}}))await setDoc(doc(c.firestore(),'users',uid),data);
  });
});
after(async()=>env?.cleanup());
for(const a of accounts.filter(a=>a.barberId))test(`${a.uid}: direct API isolation, query scope, costs and V1`,async()=>{
 const db=env.authenticatedContext(a.uid).firestore();
 await assertSucceeds(getDoc(doc(db,'users',a.uid)));
 for(const kind of ['v2Appointments','v2Services','v2Cash','v2Sales']){
  const ref=collection(db,ROOT,kind);
  assert.equal((await assertSucceeds(getDocs(query(ref,where('barberId','==',a.barberId))))).size,1);
  await assertFails(getDocs(ref));
  for(const other of accounts.filter(x=>x.barberId&&x.uid!==a.uid)){
   await assertFails(getDoc(doc(ref,other.uid)));
   await assertFails(getDocs(query(ref,where('barberId','==',other.barberId))));
  }
 }
 await assertSucceeds(getDoc(doc(db,ROOT,'v2Barbers',a.barberId)));
 await assertFails(getDocs(collection(db,ROOT,'v2Barbers')));
 await assertFails(getDoc(doc(db,ROOT,'v2ProductCosts','test-product')));
 await assertFails(getDoc(doc(db,ROOT,'datasets','appointments')));
 await assertFails(getDocs(collection(db,'users')));
 for(const kind of ['_v2Operations','_v2ScheduleLocks'])await assertFails(getDocs(collection(db,ROOT,kind)));
 await assertFails(updateDoc(doc(db,'users',a.uid),{role:'admin',barberId:'test-dani'}));
});
test('admin reads all accounting; every client write blocked including overlaps, negative stock and replay',async()=>{
 for(const a of accounts){
  const db=env.authenticatedContext(a.uid).firestore();
  if(a.role==='admin')assert.equal((await assertSucceeds(getDocs(collection(db,ROOT,'v2Cash')))).size,3);
  for(const kind of ['v2Appointments','v2Services','v2Cash','v2Sales','v2Products','v2ProductCosts','v2Barbers','datasets']){
   await assertFails(setDoc(doc(db,ROOT,kind,'new'),{barberId:a.barberId||'test-walter',date:'2026-11-01',time:'10:00',stock:-1}));
   const id=kind==='v2Products'||kind==='v2ProductCosts'?'test-product':kind==='datasets'?'appointments':'test-walter';
   await assertFails(updateDoc(doc(db,ROOT,kind,id),{stock:-1,amount:999,barberId:'test-dani'}));
   await assertFails(deleteDoc(doc(db,ROOT,kind,id)));
  }
  const results=await Promise.allSettled([1,2].map(()=>setDoc(doc(db,ROOT,'v2Appointments','same-slot'),{barberId:'test-walter',time:'10:00'})));
  assert.ok(results.every(x=>x.status==='rejected'));
 }
});
test('unauthenticated, inactive, missing active, missing profile and wrong reciprocal link denied',async()=>{
 for(const uid of [null,'inactive','missing','absent','broken']){
  const db=(uid?env.authenticatedContext(uid):env.unauthenticatedContext()).firestore();
  await assertFails(getDoc(doc(db,ROOT,'v2Cash','test-walter')));
  await assertFails(getDocs(collection(db,ROOT,'v2Products')));
 }
});
