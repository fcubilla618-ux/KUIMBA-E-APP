import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {seed} from '../development/seed.mjs';
import {createApiHandler} from '../backend/http.mjs';
import {auth,database} from '../backend/runtime.mjs';
import {createOperations} from '../backend/operations.mjs';
let fixture,server,url,token;
before(async()=>{
 fixture=await seed();const a=fixture.credentials.find(x=>x.email.startsWith('walter@'));
 const response=await fetch('http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-only',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:a.email,password:a.password,returnSecureToken:true})});
 token=(await response.json()).idToken;
 server=createServer(createApiHandler({auth,execute:createOperations(database)}));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url=`http://127.0.0.1:${server.address().port}/api/v2/operations`;
});
after(async()=>{await new Promise(resolve=>server?.close(resolve));await fixture?.env.cleanup();await database.terminate();});
const input={action:'appointment.create',operationId:'http-create',barberId:'test-walter',serviceId:'test-walter',date:'2026-11-06',time:'12:00',client:'Cliente HTTP ficticio',phone:'',notes:''};
function send(body=input,headers={}){return fetch(url,{method:'POST',headers:{'content-type':'application/json',origin:'http://127.0.0.1:4173',authorization:`Bearer ${token}`,...headers},body:typeof body==='string'?body:JSON.stringify(body)});}
test('HTTP verifies emulator tokens and returns committed result',async()=>{
 const response=await send();assert.equal(response.status,200);const data=await response.json();assert.equal(data.result.revision,1);
 const replay=await (await send()).json();assert.equal(replay.result.id,data.result.id);
});
test('HTTP rejects absent, malformed, expired, wrong-audience tokens and revoked accounts',async()=>{
 assert.equal((await send(input,{authorization:''})).status,401);
 assert.equal((await send(input,{authorization:'Bearer fabricated'})).status,401);
 const [h,p,s]=token.split('.'),payload=JSON.parse(Buffer.from(p,'base64url'));
 for(const patch of [{exp:1},{aud:'real-project'}]){const fake=[h,Buffer.from(JSON.stringify({...payload,...patch})).toString('base64url'),s].join('.');assert.equal((await send(input,{authorization:`Bearer ${fake}`})).status,401);}
 const a=fixture.credentials.find(x=>x.email.startsWith('walter@'));await auth.updateUser(a.uid,{disabled:true});
 assert.equal((await send()).status,401);await auth.updateUser(a.uid,{disabled:false});
});
test('transport rejects foreign origins, malformed JSON, oversized bodies and injected prices',async()=>{
 assert.equal((await send(input,{origin:'https://foreign.example'})).status,403);
 assert.equal((await send(input,{'content-type':'text/plain'})).status,415);
 assert.equal((await send('{')).status,400);
 assert.equal((await send('x'.repeat(530000))).status,413);
 const response=await send({...input,price:1});assert.equal(response.status,400);assert.equal((await response.json()).error.code,'invalid-input');
});

test('HTTP preserves Spanish names when UTF-8 bytes span request chunks',async()=>{
 const body=Buffer.from(JSON.stringify({...input,operationId:'unicode',time:'14:00',client:'Ñandú 🧉'}));
 const split=body.indexOf(Buffer.from('Ñ'))+1;
 const response=await new Promise((resolve,reject)=>{
  const req=request(url,{method:'POST',headers:{'content-type':'application/json',origin:'http://127.0.0.1:4173',authorization:`Bearer ${token}`}},res=>{let data='';res.on('data',chunk=>data+=chunk);res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(data)}));});
  req.on('error',reject);req.write(body.subarray(0,split));setTimeout(()=>req.end(body.subarray(split)),20);
 });
 assert.equal(response.status,200);
 assert.equal((await database.doc(`shops/kuimbae-style/v2Appointments/${response.data.result.id}`).get()).data().client,'Ñandú 🧉');
});
