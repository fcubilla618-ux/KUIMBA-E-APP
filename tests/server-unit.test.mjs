import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateCommand,fingerprint} from '../backend/validation.mjs';
const create=()=>({action:'appointment.create',operationId:'op-test',barberId:'test-walter',serviceId:'test-walter',date:'2026-11-03',time:'10:00',client:'Cliente ficticio',phone:'',notes:''});
test('server accepts known commands and rejects forged accounting and malformed input',()=>{
 assert.equal(validateCommand(create()).action,'appointment.create');
 for(const change of [{price:1},{stock:2},{role:'admin'},{date:'2026-02-31'},{time:'24:00'},{barberId:'a/b'},{client:''},{notes:'x'.repeat(1001)},{action:'cash.write'}])assert.throws(()=>validateCommand({...create(),...change}));
 for(const quantity of [0,-1,1.5,'1',Number.MAX_SAFE_INTEGER])assert.throws(()=>validateCommand({action:'product.sell',operationId:'sale-test',barberId:'test-walter',productId:'test-product',quantity,payment:'Efectivo'}));
});
test('canonical operation fingerprint ignores key order and binds action and content',()=>{
 assert.equal(fingerprint({a:1,b:2}),fingerprint({b:2,a:1}));
 assert.notEqual(fingerprint({a:1}),fingerprint({a:2}));
});
test('updates require an explicit revision; cancel/complete cannot smuggle edits',()=>{
 const {action,operationId,...fields}=create();
 assert.throws(()=>validateCommand({...fields,action:'appointment.update',operationId,id:'record'}));
 assert.equal(validateCommand({...fields,action:'appointment.update',operationId,id:'record',revision:1}).revision,1);
 assert.throws(()=>validateCommand({action:'appointment.cancel',operationId,id:'record',revision:1,barberId:'test-dani'}));
});
