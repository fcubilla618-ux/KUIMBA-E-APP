import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,setDoc} from 'firebase/firestore';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PROJECT} from './access.mjs';
import {accounts,documents} from './fixtures.mjs';
// No configurable project/endpoint and no production credentials. Tests only.
export async function seed(){
 const env=await initializeTestEnvironment({projectId:PROJECT,firestore:{host:'127.0.0.1',port:18080,rules:await readFile('development/firestore.rules','utf8')}});
 await env.clearFirestore();
 await fetch(`http://127.0.0.1:19099/emulator/v1/projects/${PROJECT}/accounts`,{method:'DELETE'});
 const credentials=[];
 const docs=documents();
 for(const account of accounts){
  const password=randomUUID();
  const response=await fetch('http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-only',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:account.email,password,returnSecureToken:true})});
  if(!response.ok)throw Error('No se pudo crear cuenta sintética');
  const {localId:uid}=await response.json();
  docs[`users/${uid}`]=docs[`users/${account.uid}`];delete docs[`users/${account.uid}`];
  if(account.barberId)docs[`shops/kuimbae-style/v2Barbers/${account.barberId}`].uid=uid;
  credentials.push({...account,uid,password});
 }
 await env.withSecurityRulesDisabled(async c=>{for(const [path,data] of Object.entries(docs))await setDoc(doc(c.firestore(),path),data);});
 return {credentials,env};
}
