import {businessTime} from '../development/business-time.mjs';
import {ROOT,safeId} from '../development/access.mjs';
import {validateCommand,fingerprint,reject} from './validation.mjs';
const money=v=>Number.isSafeInteger(v)&&v>=0&&v<=1_000_000_000;
const revision=d=>d.revision??1;
const minutes=time=>Number(time.slice(0,2))*60+Number(time.slice(3,5));
const denied=()=>reject('permission-denied','No tenés permiso para esta operación.',403);

/** All reads (including authorization and receipts) precede every write.
 * Firestore retries have no side effects outside the transaction.
 */
export function createOperations(db,{clock=()=>new Date()}={}){
 const ref=(kind,id)=>db.doc(`${ROOT}/${kind}/${id}`);
 async function authorize(tx,uid,barberId){
  const user=(await tx.get(db.doc(`users/${uid}`))).data();
  if(user?.active!==true||!['admin','barber'].includes(user.role))denied();
  if(user.role==='barber'&&user.barberId!==barberId)denied();
  if(!safeId(barberId))denied();
  const barber=(await tx.get(ref('v2Barbers',barberId))).data();
  if(barber?.active!==true||barber.id!==barberId||!safeId(barber.uid))denied();
  const linked=barber.uid===uid?user:(await tx.get(db.doc(`users/${barber.uid}`))).data();
  if(linked?.role!=='barber'||linked.active!==true||linked.barberId!==barberId)denied();
  if(user.role==='barber'&&barber.uid!==uid)denied();
  return user;
 }
 return async function execute(uid,raw){
  if(!safeId(uid))denied();
  const input=validateCommand(raw),hash=fingerprint(input);
  const key=fingerprint({uid,operationId:input.operationId});
  const receipt=ref('_v2Operations',key);
  return db.runTransaction(async tx=>{
   let old,appointmentRef;
   if(input.action.startsWith('appointment.')&&input.action!=='appointment.create'){
    appointmentRef=ref('v2Appointments',input.id);
    old=(await tx.get(appointmentRef)).data();
    if(!old)denied(); // Does not reveal whether another barber's ID exists.
   }
   if(old&&(!safeId(old.barberId)||old.id!==input.id||!/^\d{4}-\d{2}-\d{2}$/.test(old.date)))reject('data-review-required','El turno requiere revisión.',409);
   const target=input.barberId||old?.barberId;
   const user=await authorize(tx,uid,target);
   if(old&&user.role!=='admin'&&old.barberId!==user.barberId)denied();
   const prior=await tx.get(receipt);
   if(prior.exists){
    if(prior.data().fingerprint!==hash)reject('idempotency-conflict','Esta clave ya se usó con otros datos.',409);
    return prior.data().result;
   }
   if(old&&revision(old)!==input.revision)reject('stale-revision','El turno cambió en otro dispositivo. Actualizá la agenda.',409);
   const instant=clock(),now=instant.toISOString(),business=businessTime(instant);
   let result;
   if(input.action==='product.sell'){
    const productRef=ref('v2Products',input.productId);
    const product=(await tx.get(productRef)).data();
    if(!product||product.active===false||!money(product.price)||!Number.isSafeInteger(product.stock)||product.stock<0)reject('invalid-product','Producto no disponible.',409);
    if(product.stock<input.quantity)reject('insufficient-stock','Stock insuficiente.',409);
    const amount=product.price*input.quantity;
    if(!Number.isSafeInteger(amount)||amount>1_000_000_000)reject('invalid-amount','Importe fuera de rango.');
    const id=`product-${key}`;
    const sale={id,type:'producto',barberId:target,productId:input.productId,productName:product.name,client:product.name,service:'Venta de producto',quantity:input.quantity,unitPrice:product.price,amount,payment:input.payment,date:business.date,time:business.time,createdAt:now,createdBy:uid};
    tx.update(productRef,{stock:product.stock-input.quantity,updatedAt:now,updatedBy:uid});
    tx.create(ref('v2Sales',id),sale);tx.create(ref('v2Cash',id),sale);
    result={id,barberId:target,amount};
   }else{
    const creating=input.action==='appointment.create';
    const editing=creating||input.action==='appointment.update';
    if(!creating&&old.status==='cancelado')reject('invalid-transition','El turno ya está cancelado.',409);
    if(input.action==='appointment.update'&&old.status!=='pendiente')reject('invalid-transition','Sólo se puede modificar un turno pendiente.',409);
    if(input.action==='appointment.complete'&&old.status!=='pendiente')reject('invalid-transition','El turno ya fue atendido.',409);
    let next;
    if(editing){
     const service=(await tx.get(ref('v2Services',input.serviceId))).data();
     if(service?.active!==true||service.barberId!==target||!money(service.price)||!Number.isInteger(service.duration)||service.duration<=0||service.duration>1440)reject('invalid-service','Servicio no autorizado o inválido.',403);
     const unchanged=old?.serviceId===input.serviceId&&old.barberId===target;
     next={...(old||{}),id:old?.id||`appointment-${key}`,barberId:target,serviceId:input.serviceId,service:service.name,
      price:unchanged?old.price:service.price,duration:unchanged?old.duration:service.duration,date:input.date,time:input.time,
      client:input.client.trim(),phone:input.phone.trim(),notes:input.notes.trim(),status:'pendiente',
      revision:creating?1:revision(old)+1,updatedAt:now,updatedBy:uid,...(creating?{createdAt:now,createdBy:uid}:{})};
     if(!money(next.price)||!Number.isInteger(next.duration)||next.duration<=0||minutes(next.time)+next.duration>1440)reject('invalid-duration','El turno debe terminar dentro del día.');
    }else next={...old,status:input.action==='appointment.cancel'?'cancelado':'atendido',revision:revision(old)+1,updatedAt:now,updatedBy:uid};
    appointmentRef=appointmentRef||ref('v2Appointments',next.id);
    // Reading/updating a shared day document serializes concurrent empty queries.
    // Both source and destination are acquired in stable order when moving a turn.
    const days=new Map();
    for(const item of [old,next].filter(Boolean))days.set(`${item.barberId}_${item.date}`,{barberId:item.barberId,date:item.date});
    const locks=[...days.keys()].sort().map(id=>ref('_v2ScheduleLocks',id));
    const lockSnaps=await tx.getAll(...locks);
    if(editing){
     const occupied=await tx.get(db.collection(`${ROOT}/v2Appointments`).where('barberId','==',next.barberId).where('date','==',next.date));
     const start=minutes(next.time),end=start+next.duration;
     for(const snap of occupied.docs){
      if(snap.id===next.id)continue;
      const item=snap.data();if(item.status==='cancelado')continue;
      if(typeof item.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(item.time)||!Number.isInteger(item.duration)||item.duration<=0)reject('data-review-required','La agenda requiere revisión antes de reservar.',409);
      if(start<minutes(item.time)+item.duration&&end>minutes(item.time))reject('appointment-conflict','Ese horario se superpone con otro turno.',409);
     }
    }
    const completing=input.action==='appointment.complete';
    const reversing=input.action==='appointment.cancel'&&old.status==='atendido';
    let sale,cashId,reversedPayment;
    if(completing||reversing){
     if(!money(old.price))reject('data-review-required','Falta verificar el precio histórico.',409);
     cashId=`${reversing?'reverse':'service'}-${next.id}`;
     // Explicit reads also protect legacy/migrated accounting from double entries.
     const [existingSale,existingCash]=await tx.getAll(ref('v2Sales',cashId),ref('v2Cash',cashId));
     if(existingSale.exists||existingCash.exists)reject('accounting-review-required','El turno ya tiene un asiento; requiere revisión.',409);
     if(reversing){
      const [originalSale,originalCash]=await tx.getAll(ref('v2Sales',`service-${next.id}`),ref('v2Cash',`service-${next.id}`));
      reversedPayment=originalCash.data()?.payment||'Sin especificar';
      if(!originalSale.exists||!originalCash.exists||originalCash.data().amount!==old.price||originalSale.data().amount!==old.price)reject('accounting-review-required','Falta verificar el cobro original.',409);
     }
     sale={id:cashId,type:reversing?'reversion':'servicio',appointmentId:next.id,barberId:next.barberId,client:old.client,service:old.service,serviceId:old.serviceId??null,amount:reversing?-old.price:old.price,payment:reversedPayment||input.payment||'Sin especificar',date:business.date,time:business.time,createdAt:now,createdBy:uid,...(reversing?{reverses:`service-${next.id}`}:{})};
    }
    for(let i=0;i<locks.length;i++)tx.set(locks[i],{revision:(lockSnaps[i].data()?.revision||0)+1,updatedAt:now});
    if(creating)tx.create(appointmentRef,next);else tx.set(appointmentRef,next);
    if(sale){tx.create(ref('v2Sales',cashId),sale);tx.create(ref('v2Cash',cashId),sale);}
    result={id:next.id,revision:next.revision,barberId:next.barberId};
   }
   tx.create(receipt,{uid,fingerprint:hash,result,createdAt:now});
   return result;
  },{maxAttempts:10});
 };
}
