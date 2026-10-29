import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateManagement,validatePhoto,clientId} from '../backend/management-validation.mjs';
import {createManagementOperations} from '../backend/management.mjs';
const command={action:'product.save',operationId:'abc',id:'p',revision:0,name:'Producto',category:'',price:12,cost:5,stock:2,photo:'',active:true};
test('strict validation rejects forged fields, invalid revisions, money and SVG',()=>{
 assert.equal(validateManagement(command).price,12);
 for(const changes of [{uid:'admin'},{revision:-1},{stock:1.2},{price:NaN},{photo:'data:image/svg+xml;base64,PHN2Zy8+'},{active:1}])assert.throws(()=>validateManagement({...command,...changes}),e=>e.code==='invalid-input');
 assert.throws(()=>validatePhoto('data:image/png;base64,'+Buffer.alloc(256001).toString('base64')));
 assert.throws(()=>validatePhoto('data:image/png;base64,'+Buffer.from('not a png').toString('base64')));
});
test('client key identity is stable and owner scoped',()=>{
 assert.equal(clientId('a','x'),clientId('a','x'));assert.notEqual(clientId('a','x'),clientId('b','x'));
 assert.throws(()=>validateManagement({action:'client.save',operationId:'a',id:'forged',revision:0,barberId:'a',key:'x',name:'X',phone:'',notes:''}));
});
function memoryDb(initial={}){
 const rows=new Map(Object.entries(initial));let writes=[];
 const doc=path=>({path,async get(){const v=rows.get(path);return {exists:v!==undefined,data:()=>structuredClone(v)}}});
 return {rows,doc,collection:path=>({path,where(field,op,value){return {...this,filter:[field,value]}}}),async runTransaction(fn){writes=[];const tx={async get(ref){if(ref.filter){return {docs:[...rows].filter(([k,v])=>k.startsWith(ref.path+'/')&&v[ref.filter[0]]===ref.filter[1]).map(([path,v])=>({id:path.split('/').at(-1),data:()=>structuredClone(v)}))}}const v=rows.get(ref.path);return {exists:v!==undefined,data:()=>structuredClone(v)}} ,async getAll(...refs){return Promise.all(refs.map(r=>tx.get(r)))},set(r,v){writes.push([r.path,v])},create(r,v){assert(!rows.has(r.path));writes.push([r.path,v])},update(r,v){writes.push([r.path,{...rows.get(r.path),...v}])}};const result=await fn(tx);for(const [k,v] of writes)rows.set(k,v);return result}};
}
const root='shops/kuimbae-style';
const profiles={'users/a':{role:'admin',active:true},'users/b':{role:'barber',active:true,barberId:'b'},[root+'/v2Barbers/b']:{id:'b',uid:'b',active:true}};
test('catalog revisions, private costs, replay protection and disabled actor checks',async()=>{
 const db=memoryDb(profiles),execute=createManagementOperations(db);
 assert.equal((await execute('a',command)).revision,1);
 assert.equal(db.rows.get(root+'/v2Products/p').cost,undefined);assert.equal(db.rows.get(root+'/v2ProductCosts/p').cost,5);
 await assert.rejects(execute('a',{...command,operationId:'stale'}),e=>e.code==='stale-revision');
 assert.equal((await execute('a',command)).revision,1);
 await assert.rejects(execute('a',{...command,price:99}),e=>e.code==='idempotency-conflict');
 db.rows.set('users/a',{role:'admin',active:false});await assert.rejects(execute('a',command),e=>e.code==='permission-denied');
});
test('barber can manage only own services with explicit permission; clients default allowed',async()=>{
 const db=memoryDb(profiles),execute=createManagementOperations(db),service={action:'service.save',operationId:'s',id:'s',revision:0,barberId:'b',name:'Corte',description:'',price:2,duration:30,active:true};
 await assert.rejects(execute('b',service),e=>e.code==='permission-denied');
 db.rows.set('users/b',{...profiles['users/b'],permissions:{manageServices:true}});await execute('b',service);
 await assert.rejects(execute('b',{...service,operationId:'bad',id:'other',barberId:'other'}),e=>e.code==='permission-denied');
 await execute('b',{action:'client.save',operationId:'c',id:clientId('b','x'),revision:0,barberId:'b',key:'x',name:'X',phone:'',notes:'private'});
});
test('payment corrections update paired records and cannot modify reversed accounting',async()=>{
 const entry={id:'service-x',barberId:'b',type:'servicio',amount:42,payment:'Efectivo',revision:1};
 const db=memoryDb({...profiles,[root+'/v2Cash/service-x']:entry,[root+'/v2Sales/service-x']:entry}),execute=createManagementOperations(db);
 await execute('a',{action:'cash.payment',operationId:'pay',id:'service-x',revision:1,payment:'Tarjeta'});
 assert.equal(db.rows.get(root+'/v2Sales/service-x').payment,'Tarjeta');assert.equal(db.rows.get(root+'/v2Cash/service-x').amount,42);
 db.rows.set(root+'/v2Cash/reverse-x',{amount:-42});await assert.rejects(execute('a',{action:'cash.payment',operationId:'pay2',id:'service-x',revision:2,payment:'Efectivo'}),e=>e.code==='accounting-review-required');
});
test('user updates cannot lock out self, hijack barber, or move stale profiles',async()=>{
 const db=memoryDb({...profiles,'users/second':{role:'admin',active:true,revision:1}}),execute=createManagementOperations(db);
 const permissions={manageAppointments:true,canSell:true,manageClients:true,manageServices:false};
 const base={action:'user.update',operationId:'u',uid:'a',revision:1,name:'Admin',role:'admin',barberId:'',active:false,permissions};
 await assert.rejects(execute('a',base),e=>e.code==='self-lockout');
 await assert.rejects(execute('a',{...base,uid:'second',role:'barber',barberId:'b',active:true}),e=>e.code==='barber-already-linked');
 await execute('a',{...base,uid:'second',active:true});
 await assert.rejects(execute('a',{...base,operationId:'u2',uid:'second',active:true}),e=>e.code==='stale-revision');
});
test('settings reject unknown keys and validate real original closure objects',async()=>{
 const {validateSettings}=await import('../backend/management-validation.mjs');
 const settings={businessName:'Test',businessSubtitle:'',address:'',businessPhone:'',logoData:'',openDays:[1,2],morningStart:'06:00',morningEnd:'11:00',afternoonStart:'14:00',afternoonEnd:'22:00',slotInterval:60,defaultDuration:60,vipVisits:6,vipDays:90,habitualMonths:3,inactiveDays:120,followupDays:21,whatsappMessage:'Hola',closures:[{id:'closed',start:'2026-12-01',end:'2026-12-03',reason:'Descanso'}]};
 assert.deepEqual(validateSettings(settings),settings);
 for(const changed of [{openDays:[1,1]},{closures:[{id:'bad',start:'2026-02-30',end:'2026-03-01',reason:''}]},{morningEnd:'23:00'},{extra:1},{openDays:[]},{slotInterval:15},{defaultDuration:15},{vipVisits:1},{vipDays:29},{habitualMonths:1},{inactiveDays:29},{followupDays:6}])assert.throws(()=>validateSettings({...settings,...changed}));
});
function fakeAuth(){
 const users=new Map(),effects=[];return {users,effects,async createUser(value){effects.push(['create',value.uid,value.disabled]);if(users.has(value.uid))throw Object.assign(Error('exists'),{code:'auth/uid-already-exists'});users.set(value.uid,{...value});return value},async getUser(uid){return users.get(uid)},async updateUser(uid,value){effects.push(['update',uid,{...value}]);users.set(uid,{...users.get(uid),...value});},async revokeRefreshTokens(){}};
}
const allPermissions={manageAppointments:true,canSell:true,manageClients:true,manageServices:false};
test('failed user provisioning stays disabled and recovers safely with exact operation',async()=>{
 const db=memoryDb(profiles),auth=fakeAuth(),execute=createManagementOperations(db,{auth});
 const cmd={action:'user.create',operationId:'new',name:'New barber',email:'new@example.test',password:'TestPass123',role:'barber',barberId:'unlinked',permissions:allPermissions};
 await assert.rejects(execute('a',cmd),e=>e.code==='invalid-barber');
 assert.equal([...auth.users.values()][0].disabled,true);
 db.rows.set(root+'/v2Barbers/unlinked',{id:'unlinked',active:true});
 const result=await execute('a',cmd);
 assert.equal(auth.users.get(result.uid).disabled,false);
 assert.equal(db.rows.get('users/'+result.uid).password,undefined);
 assert.equal(db.rows.get(root+'/v2Barbers/unlinked').uid,result.uid);
 const count=auth.effects.length;
 await execute('a',cmd);assert.equal(auth.effects.length,count,'completed create replay has no external Auth side effects');
 await assert.rejects(execute('a',{...cmd,password:'Changed123'}),e=>e.code==='idempotency-conflict');
 for(const value of db.rows.values())assert.equal(JSON.stringify(value).includes('TestPass123'),false);
});
test('completed password operation replay cannot undo a later password reset',async()=>{
 const db=memoryDb(profiles),auth=fakeAuth(),execute=createManagementOperations(db,{auth});
 const first={action:'user.password',operationId:'password1',uid:'b',password:'FirstPass123'};
 await execute('a',first);await execute('a',{...first,operationId:'password2',password:'SecondPass123'});await execute('a',first);
 assert.equal(auth.users.get('b').password,'SecondPass123');
});
test('barber can correct own payment only, without accessing another owner',async()=>{
 const own={id:'cash-own',barberId:'b',type:'producto',amount:10,payment:'Efectivo'};
 const other={...own,id:'cash-other',barberId:'another'};
 const db=memoryDb({...profiles,[root+'/v2Cash/cash-own']:own,[root+'/v2Sales/cash-own']:own,[root+'/v2Cash/cash-other']:other,[root+'/v2Sales/cash-other']:other}),execute=createManagementOperations(db);
 await execute('b',{action:'cash.payment',operationId:'ownpay',id:own.id,revision:1,payment:'Tarjeta'});
 assert.equal(db.rows.get(root+'/v2Cash/cash-own').payment,'Tarjeta');
 await assert.rejects(execute('b',{action:'cash.payment',operationId:'otherpay',id:other.id,revision:1,payment:'Tarjeta'}),e=>e.code==='permission-denied');
});
test('catalog cost edits preserve private migrated historical sales costs',async()=>{
 const historicalSales={sale1:{unitCost:3,quantity:2},sale2:{unitCost:4,quantity:1}};
 const db=memoryDb({...profiles,[root+'/v2Products/p']:{id:'p',name:'Original',stock:2,price:12,revision:1},[root+'/v2ProductCosts/p']:{id:'p',cost:5,historicalSales}}),execute=createManagementOperations(db);
 await execute('a',{...command,operationId:'cost-edit',revision:1,cost:7});
 assert.equal(db.rows.get(root+'/v2ProductCosts/p').cost,7);
 assert.deepEqual(db.rows.get(root+'/v2ProductCosts/p').historicalSales,historicalSales);
 assert.equal(db.rows.get(root+'/v2Products/p').historicalSales,undefined);
 assert.equal(db.rows.get(root+'/v2Products/p').cost,undefined);
});
test('client keys cannot inject original inline navigation handlers',()=>{
 const key="x');alert(1)//",barberId='b';
 assert.throws(()=>validateManagement({action:'client.save',operationId:'unsafe-key',id:clientId(barberId,key),revision:0,barberId,key,name:'X',phone:'',notes:''}),e=>e.code==='invalid-input');
});
test('duplicate Auth email is a definitive conflict so administrator can correct the form',async()=>{
 const db=memoryDb(profiles),auth={async createUser(){const error=Error('SDK error');error.code='auth/email-already-exists';throw error;}};
 const run=createManagementOperations(db,{auth});
 await assert.rejects(run('a',{action:'user.create',operationId:'duplicate-email',email:'duplicate@example.test',password:'Synthetic123!',name:'Ensayo',role:'admin',barberId:'',permissions:{manageAppointments:true,canSell:true,manageClients:true,manageServices:false}}),e=>e.code==='email-in-use'&&e.status===409);
 assert.equal([...db.rows.keys()].filter(k=>k.startsWith('users/')).length,2);
});
