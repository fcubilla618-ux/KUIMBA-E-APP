import {randomUUID} from 'node:crypto';
import {ROOT,safeId} from '../development/access.mjs';
import {reject,fingerprint} from './validation.mjs';
import {validateManagement,handlesManagement} from './management-validation.mjs';
export {handlesManagement};
const denied=()=>reject('permission-denied','No tenés permiso para esta operación.',403);
const rev=value=>value?.revision??1;
const stale=()=>reject('stale-revision','El registro cambió. Actualizá los datos.',409);
const review=()=>reject('accounting-review-required','El asiento requiere revisión y no se puede corregir.',409);

/** Authentication side effects are deliberately outside transaction callbacks. New
 * Auth users remain disabled until their authorized durable profile is committed.
 * Every retry rechecks profiles, reciprocal ownership, revisions and receipts.
 */
export function createManagementOperations(db,{auth,clock=()=>new Date()}={}){
 const ref=(kind,id)=>db.doc(`${ROOT}/${kind}/${id}`);
 const userRef=uid=>db.doc(`users/${uid}`);
 async function actor(tx,uid){
  const value=(await tx.get(userRef(uid))).data();
  if(value?.active!==true||!['admin','barber'].includes(value.role))denied();
  if(value.role==='barber'){
   if(!safeId(value.barberId))denied();
   const barber=(await tx.get(ref('v2Barbers',value.barberId))).data();
   if(barber?.active!==true||barber.id!==value.barberId||barber.uid!==uid)denied();
  }
  return value;
 }
 async function requireAdmin(uid){return db.runTransaction(async tx=>{const a=await actor(tx,uid);if(a.role!=='admin')denied();return a});}
 return async function execute(uid,raw){
  if(!safeId(uid))denied();
  const input=validateManagement(raw),hash=fingerprint(input),key=fingerprint({uid,operationId:input.operationId});
  const receiptRef=ref('_v2Operations',key),auditRef=ref('_v2Audit',key);
  let provisioned,authLock,authToken,authMarker;
  const authOperation=input.action==='user.create'||input.action==='user.password';
  if(authOperation){
   if(!auth)reject('auth-unavailable','Auth de ensayo no disponible.',503);
   const authTarget=input.action==='user.create'?'user-'+key:input.uid;
   authLock=ref('_v2AuthLocks',authTarget);authMarker=ref('_v2Provisioning',key);authToken=randomUUID();
   const preflight=await db.runTransaction(async tx=>{
    const a=await actor(tx,uid);if(a.role!=='admin')denied();
    const [receipt,marker,lock]=await tx.getAll(receiptRef,authMarker,authLock);
    if((receipt.exists&&receipt.data().fingerprint!==hash)||(marker.exists&&marker.data().fingerprint!==hash))reject('idempotency-conflict','Esta clave ya se usó con otros datos.',409);
    if(marker.data()?.authComplete===true){if(!receipt.exists)reject('data-review-required','Falta el recibo de la cuenta.',409);return receipt.data().result;}
    // A crashed in-flight Auth request stays closed rather than guessing whether
    // a password change happened. Never expire a live lease across processes.
    if(lock.data()?.running===true||(lock.data()?.key&&lock.data().key!==key))reject('auth-operation-pending','Hay una operación Auth pendiente para esta cuenta.',409);
    if(!marker.exists)tx.create(authMarker,{uid,fingerprint:hash,authComplete:false,createdAt:clock().toISOString()});
    tx.set(authLock,{key,token:authToken,running:true});return null;
   });
   if(preflight)return preflight;
  }
  try{
  if(input.action==='user.create'){
   const newUid='user-'+key;
   // A retry can only recover the deterministic account for this exact command.
   const prior=(await receiptRef.get()).data();
   if(prior&&prior.fingerprint!==hash)reject('idempotency-conflict','Esta clave ya se usó con otros datos.',409);
   try{provisioned=await auth.createUser({uid:newUid,email:input.email,password:input.password,displayName:input.name,disabled:true});}
   catch(error){
    if(error.code!=='auth/uid-already-exists')throw error;
    provisioned=await auth.getUser(newUid);
    if(provisioned.email?.toLowerCase()!==input.email.toLowerCase())reject('idempotency-conflict','La cuenta requiere revisión.',409);
    // An incomplete account can be recovered only with its original fingerprint.
    const marker=(await ref('_v2Provisioning',key).get()).data();
    if(!prior&&marker?.fingerprint!==hash)reject('provisioning-review-required','La cuenta pendiente requiere revisión.',409);
   }
  }
  const result=await db.runTransaction(async tx=>{
   const current=await actor(tx,uid);
   const admin=current.role==='admin';
   const action=input.action;
   if(!admin&&!['service.save','service.delete','client.save','cash.payment'].includes(action))denied();
   if(!admin){
    let owner=input.barberId;
    if(action==='service.delete')owner=(await tx.get(ref('v2Services',input.id))).data()?.barberId;
    if(action==='cash.payment')owner=(await tx.get(ref('v2Cash',input.id))).data()?.barberId;
    if(owner!==current.barberId)denied();
    if(action.startsWith('service.')&&current.permissions?.manageServices!==true)denied();
    if(action==='client.save'&&current.permissions?.manageClients===false)denied();
   }
   const prior=await tx.get(receiptRef);
   if(prior.exists){if(prior.data().fingerprint!==hash||prior.data().uid!==uid)reject('idempotency-conflict','Esta clave ya se usó con otros datos.',409);return prior.data().result;}
   const now=clock().toISOString();
   let result,write,auditDetails={};
   if(action.startsWith('user.')){
    if(!admin)denied();
    const targetUid=action==='user.create'?provisioned.uid:input.uid;
    const targetRef=userRef(targetUid),old=(await tx.get(targetRef)).data();
    const lockRef=ref('_v2ManagementLocks','users'),lock=(await tx.get(lockRef)).data();
    if(action!=='user.create'&&!old)denied();
    if(action==='user.create'&&old)stale();
    if(action==='user.update'&&rev(old)!==input.revision)stale();
    if(action==='user.password'){
     result={uid:targetUid};
     write=()=>tx.set(lockRef,{revision:(lock?.revision??0)+1,updatedAt:now});
    }else{
     const next={...(old||{}),uid:targetUid,name:input.name.trim(),role:input.role,barberId:input.barberId,permissions:input.permissions,active:action==='user.create'?true:input.active,revision:old?rev(old)+1:1,updatedAt:now,updatedBy:uid,...(!old?{email:input.email,createdAt:now,createdBy:uid}:{})};
     if(targetUid===uid&&(!next.active||next.role!=='admin'))reject('self-lockout','No podés deshabilitar tu acceso administrador.',409);
     if(old?.role==='admin'&&old.active===true&&(next.role!=='admin'||!next.active)){
      const admins=await tx.get(db.collection('users').where('role','==','admin'));
      if(admins.docs.filter(x=>x.data().active===true&&x.id!==targetUid).length===0)reject('last-admin','Debe permanecer un administrador activo.',409);
     }
     const ids=[...new Set([old?.role==='barber'?old.barberId:null,next.role==='barber'?next.barberId:null].filter(Boolean))];
     const links=[];
     for(const id of ids){
      if(!safeId(id))reject('data-review-required','Vínculo inválido.',409);
      const linkRef=ref('v2Barbers',id),barber=(await tx.get(linkRef)).data();
      if(!barber||barber.id!==id)reject('invalid-barber','Barbero no disponible.',409);
      const attaching=next.role==='barber'&&next.barberId===id;
      if(barber.uid&&barber.uid!==targetUid)reject('barber-already-linked','El barbero ya tiene otra cuenta.',409);
      if(old?.role==='barber'&&old.barberId===id&&barber.uid!==targetUid)reject('data-review-required','Vínculo no recíproco.',409);
      links.push([linkRef,{...barber,uid:attaching?targetUid:null,revision:rev(barber)+1,updatedAt:now,updatedBy:uid}]);
     }
     result={uid:targetUid,revision:next.revision};
     write=()=>{tx.set(targetRef,next);for(const [r,v]of links)tx.set(r,v);tx.set(lockRef,{revision:(lock?.revision??0)+1,updatedAt:now});};
    }
   }else if(action==='cash.payment'){
    const cashRef=ref('v2Cash',input.id),saleRef=ref('v2Sales',input.id);
    const [cashSnap,saleSnap]=await tx.getAll(cashRef,saleRef),cash=cashSnap.data(),sale=saleSnap.data();
    if(!admin&&cash?.barberId!==current.barberId)denied();
    if(!cash||!sale||cash.id!==input.id||sale.id!==input.id||cash.type==='reversion'||sale.type==='reversion'||cash.reverses||sale.reverses||cash.amount!==sale.amount||cash.barberId!==sale.barberId||cash.payment!==sale.payment||!Number.isSafeInteger(cash.amount)||cash.amount<0)review();
    if(rev(cash)!==input.revision)stale();
    // Query both journals: legacy reversals may use nonstandard IDs.
    for(const kind of ['v2Cash','v2Sales']){
     const reversals=await tx.get(db.collection(`${ROOT}/${kind}`).where('reverses','==',input.id));if(reversals.docs.length)review();
    }
    if(cash.appointmentId){
     const [a,b]=await tx.getAll(ref('v2Cash',`reverse-${cash.appointmentId}`),ref('v2Sales',`reverse-${cash.appointmentId}`));if(a.exists||b.exists)review();
    }
    // Conservative guard for the canonical service ID even on malformed legacy rows.
    if(input.id.startsWith('service-')){const a=await tx.get(ref('v2Cash',`reverse-${input.id.slice(8)}`));if(a.exists)review();}
    const revision=rev(cash)+1;result={id:input.id,revision};
    auditDetails={previousPayment:cash.payment,payment:input.payment};
    write=()=>{tx.update(cashRef,{payment:input.payment,revision,updatedAt:now,updatedBy:uid});tx.update(saleRef,{payment:input.payment,revision:rev(sale)+1,updatedAt:now,updatedBy:uid});};
   }else{
    const kind=action.startsWith('service.')?'v2Services':action.startsWith('product.')?'v2Products':action==='barber.save'?'v2Barbers':action==='client.save'?'v2Clients':'v2Settings';
    const id=action==='settings.save'?'public':input.id,target=ref(kind,id),old=(await tx.get(target)).data();
    const deleting=action.endsWith('.delete');
    if(deleting&&!old)denied();
    const owner=input.barberId||old?.barberId;
    if(!admin){
     const flag=action==='client.save'?'manageClients':'manageServices';
     if(owner!==current.barberId||(flag==='manageServices'?current.permissions?.[flag]!==true:current.permissions?.[flag]===false))denied();
     if(old?.barberId&&old.barberId!==current.barberId)denied();
    }
    if(kind==='v2Services'||kind==='v2Clients'){
     if(old?.barberId&&old.barberId!==owner)reject('immutable-owner','No se puede transferir un registro existente.',409);
     const barber=(await tx.get(ref('v2Barbers',owner))).data();
     if(!barber||barber.id!==owner)reject('invalid-barber','Barbero inválido.',409);
    }
    if((old?rev(old):0)!==input.revision)stale();
    const revision=old?rev(old)+1:1;
    const clean={...input};for(const k of ['action','operationId','cost'])delete clean[k];
    let next=deleting?{...old,active:false}:{...(old||{}),...clean,id};
    next={...next,revision,updatedAt:now,updatedBy:uid,...(!old?{createdAt:now,createdBy:uid}:{})};
    if(kind==='v2Settings'){next={id,settings:input.settings,revision,updatedAt:now,updatedBy:uid};}
    // Never copy an accidentally leaked legacy cost into the public catalog.
    if(kind==='v2Products'){delete next.cost;auditDetails={previousStock:old?.stock??0,stock:next.stock};}
    result={id,revision,...(owner?{barberId:owner}:{})};
    const costRef=kind==='v2Products'&&!deleting?ref('v2ProductCosts',id):null;
    const previousCost=costRef?(await tx.get(costRef)).data():null;
    const historical=previousCost&&Object.hasOwn(previousCost,'historicalSales')?{historicalSales:previousCost.historicalSales}:{};
    write=()=>{tx.set(target,next);if(costRef)tx.set(costRef,{id,cost:input.cost,revision,...historical,updatedAt:now,updatedBy:uid});};
   }
   write();
   // No secrets or private client notes are copied into receipts/audit entries.
   tx.create(auditRef,{uid,action:input.action,target:result.id||result.uid||null,revision:result.revision??null,createdAt:now,...auditDetails});
   tx.create(receiptRef,{uid,fingerprint:hash,result,createdAt:now});
   return result;
  },{maxAttempts:10});
  if(input.action==='user.create'){
   await requireAdmin(uid);
   // Re-read the durable target so a concurrent deactivation remains closed.
   const target=(await userRef(result.uid).get()).data();
   if(target?.active===true)await auth.updateUser(result.uid,{disabled:false});
  }
  if(input.action==='user.password'){
   await requireAdmin(uid);
   await auth.updateUser(result.uid,{password:input.password});
   await auth.revokeRefreshTokens?.(result.uid);
  }
  if(authOperation){
   await db.runTransaction(async tx=>{
    const current=await actor(tx,uid);if(current.role!=='admin')denied();
    const lock=(await tx.get(authLock)).data();if(lock?.token!==authToken)reject('auth-operation-pending','La operación Auth requiere revisión.',409);
    tx.update(authMarker,{authComplete:true,completedAt:clock().toISOString()});
   });
  }
  return result;
  }catch(error){
   if(error.code==='auth/email-already-exists')reject('email-in-use','Ese correo ya tiene una cuenta. Elegí otro o editá el usuario existente.',409);
   if(['auth/invalid-email','auth/invalid-password','auth/weak-password'].includes(error.code))reject('invalid-input','Revisá el correo y la contraseña de la cuenta.');
   if(error.code==='auth/user-not-found')reject('auth-account-missing','La cuenta Auth requiere revisión antes de continuar.',409);
   throw error;
  }finally{
   if(authOperation)await db.runTransaction(async tx=>{
    const [lock,marker]=await tx.getAll(authLock,authMarker);
    if(lock.data()?.token===authToken)tx.set(authLock,{key:marker.data()?.authComplete?null:key,running:false,token:null});
   });
  }
 };
}
