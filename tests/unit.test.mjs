import {test} from 'node:test';
import assert from 'node:assert/strict';
import {profile,scope} from '../development/access.mjs';
import {createSession} from '../development/session.mjs';
import {audit} from '../development/audit.mjs';
test('roles require explicit activation and valid barber identifiers',()=>{
  for(const raw of [{role:'admin'},{role:'admin',active:false},{role:'barber',active:true,barberId:"x');alert(1)//"},{role:'unknown',active:true}])assert.throws(()=>profile('test',raw));
  assert.equal(profile('test',{role:'admin',active:true}).role,'admin');
  assert.deepEqual(scope(profile('test',{role:'barber',active:true,barberId:'walter'}),'v2Cash'),['barberId','==','walter']);
  assert.throws(()=>scope(profile('test',{role:'barber',active:true,barberId:'walter'}),'v2ProductCosts'));
});
test('session clears stale snapshots on logout, permission failures and reconnection',()=>{
  const events=[],subscriptions=[];
  const source={watchProfile(uid,ok,fail){subscriptions.push({uid,ok,fail});return ()=>{};},watchRows(p,name,ok,fail){subscriptions.push({p,name,ok,fail});return ()=>{};}};
  const session=createSession(source,x=>events.push(x));
  session.login('first');subscriptions[0].ok({role:'admin',active:true});
  const old=subscriptions.find(s=>s.name==='v2Cash');
  session.login('second');old.ok([{id:'secret'}]);
  assert.equal(events.at(-1).data,null);
  subscriptions.find(s=>s.uid==='second').ok({role:'barber',active:true,barberId:'walter'});
  const rows=subscriptions.filter(s=>s.name&&s!==old&&s.p.uid==='second');
  for(const row of rows)row.ok(row.name==='v2Barbers'?[{id:'walter',uid:'second',active:true}]:[]);
  assert.equal(events.at(-1).status,'empty');
  rows[0].fail({code:'permission-denied'});assert.equal(events.at(-1).status,'error');assert.equal(events.at(-1).data,null);
  rows[1].ok([{id:'late'}]);assert.equal(events.at(-1).data,null);
  session.login(null);assert.equal(events.at(-1).status,'signed-out');
});
test('audit reports totals without returning private data and refuses broken links',()=>{
  const input={data:{barbers:[{id:'walter',name:'Walter'}],appointments:[{id:'a',barberId:'walter',date:'2026-11-01',time:'10:00',duration:60,servicePrice:100,status:'pendiente'}],services:[],cashEntries:[{id:'c',barberId:'walter',amount:100}],products:[]}};
  const result=audit(input,{walter:'walter'});assert.equal(result.cashTotal,100);assert.equal(result.ready,true);assert.ok(!JSON.stringify(result).includes('Walter'));
  input.data.appointments.push({...input.data.appointments[0]});assert.equal(audit(input,{}).ready,false);
});
test('audit blocks negative stock, missing datasets and overlapping appointments',()=>{
 const b={data:{barbers:[{id:'walter'}],appointments:[],services:[],cashEntries:[],products:[{id:'product',stock:-1,price:20}]}};
 assert.equal(audit(b,{account:'walter'}).ready,false);
 delete b.data.products;assert.equal(audit(b,{account:'walter'}).ready,false);
 b.data.products=[];b.data.appointments=[1,2].map(i=>({id:`a${i}`,barberId:'walter',date:'2026-11-01',time:'10:00',duration:60,servicePrice:20,status:'pendiente'}));
 assert.equal(audit(b,{account:'walter'}).ready,false);
});
test('audit rejects invalid raw durations before preview defaults and malformed records',()=>{
 const b={data:{barbers:[{id:'walter'}],appointments:[{id:'a',barberId:'walter',date:'2026-11-01',time:'10:00',duration:60,servicePrice:20,status:'pendiente'}],services:[],cashEntries:[],products:[]}};
 for(const invalid of [0,undefined,'bad',-1]){b.data.appointments[0].duration=invalid;assert.equal(audit(b,{account:'walter'}).ready,false);}
 b.data.cashEntries=[null];assert.equal(audit(b,null).ready,false);
});
test('phase 3 session includes isolated client notes, shared settings and admin-only user roster',()=>{
 const p=profile('test',{role:'barber',active:true,barberId:'walter',permissions:{manageServices:true,canSell:false}});
 assert.equal(p.permissions.manageServices,true);assert.equal(p.permissions.canSell,false);
 assert.deepEqual(scope(p,'v2Clients'),['barberId','==','walter']);
 assert.equal(scope(p,'v2Settings'),null);
 assert.throws(()=>scope(p,'users'));
 const subscriptions=[];const session=createSession({watchProfile(uid,ok){ok({role:'admin',active:true});return ()=>{};},watchRows(p,name,ok){subscriptions.push(name);return ()=>{};}},()=>{});
 session.login('test');assert.ok(subscriptions.includes('users'));assert.ok(subscriptions.includes('v2Settings'));assert.ok(subscriptions.includes('v2Clients'));
});
