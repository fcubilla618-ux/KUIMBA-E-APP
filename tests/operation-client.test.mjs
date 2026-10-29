import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createOperationClient} from '../development/operations-client.mjs';
test('lost response retry uses same operation key, changed intent is blocked until resolved',async()=>{
 const sent=[];let lost=true;
 const client=createOperationClient({getIdentity:async()=>({uid:'u',token:'synthetic'}),send:async payload=>{sent.push(payload);if(lost)throw Error('network');return {id:'committed'};}});
 await assert.rejects(client({action:'product.sell',quantity:1}));
 await assert.rejects(client({action:'product.sell',quantity:2}),/pendiente/);
 lost=false;assert.equal((await client({action:'product.sell',quantity:1})).id,'committed');
 assert.equal(sent[0].operationId,sent[1].operationId);
});
test('client never applies old session response to a new identity',async()=>{
 let uid='first',finish;
 const client=createOperationClient({getIdentity:async()=>({uid,token:'synthetic'}),send:()=>new Promise(resolve=>{finish=resolve;})});
 const pending=client({action:'test'});await new Promise(resolve=>setTimeout(resolve,0));uid='second';finish({id:'private'});
 await assert.rejects(pending,/sesión/);
});
test('retry confirms the stored payload after its UI record already advanced revision',async()=>{
 const sent=[];let lost=true;
 const client=createOperationClient({getIdentity:async()=>({uid:'u',token:'synthetic'}),send:async payload=>{sent.push(payload);if(lost)throw Error('network');return {id:'record',revision:2};}});
 await assert.rejects(client({action:'appointment.complete',id:'record',revision:1}));
 lost=false;assert.equal((await client.retry()).revision,2);assert.deepEqual(sent[0],sent[1]);
 assert.equal((await client({action:'product.sell',quantity:1})).id,'record');
});
