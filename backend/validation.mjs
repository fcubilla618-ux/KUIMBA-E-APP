import {createHash} from 'node:crypto';
import {safeId} from '../development/access.mjs';
export class OperationError extends Error {
  constructor(code,message,status=400){super(message);this.code=code;this.status=status;}
}
export function reject(code,message,status=400){throw new OperationError(code,message,status);}
const text=(v,max,required=false)=>typeof v==='string'&&v.length<=max&&(!required||v.trim().length>0);
const positive=v=>Number.isSafeInteger(v)&&v>0;
const editable=['barberId','serviceId','date','time','client','phone','notes'];
const schemas={
 'appointment.create':editable,
 'appointment.update':['id','revision',...editable],
 'appointment.cancel':['id','revision'],
 'appointment.complete':['id','revision','payment'],
 'product.sell':['barberId','productId','quantity','payment']
};
export const PAYMENTS=['Efectivo','Transferencia','Tarjeta','Sin especificar'];
export function validateCommand(input){
 if(!input||Array.isArray(input)||typeof input!=='object'||!Object.hasOwn(schemas,input.action))reject('invalid-input','Operación inválida.');
 const allowed=['action','operationId',...schemas[input.action]];
 if(Object.keys(input).some(k=>!allowed.includes(k))||allowed.some(k=>!Object.hasOwn(input,k)))reject('invalid-input','Campos inválidos o faltantes.');
 for(const field of ['operationId','id','barberId','serviceId','productId'])if(field in input&&!safeId(input[field]))reject('invalid-input','Identificador inválido.');
 if('revision' in input&&!positive(input.revision))reject('invalid-input','Revisión inválida.');
 if('quantity' in input&&(!positive(input.quantity)||input.quantity>1000))reject('invalid-input','Cantidad inválida.');
 if('payment' in input&&!PAYMENTS.includes(input.payment))reject('invalid-input','Forma de pago inválida.');
 if(input.action==='appointment.create'||input.action==='appointment.update'){
  if(!text(input.client,120,true)||!text(input.phone,40)||!text(input.notes,1000))reject('invalid-input','Datos del turno inválidos.');
  const date=new Date(input.date+'T00:00:00Z');
  if(typeof input.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==input.date
    ||typeof input.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time))reject('invalid-input','Fecha u hora inválida.');
 }
 return structuredClone(input);
}
export function fingerprint(value){
 const canonical=v=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):Array.isArray(v)?v.map(canonical):v;
 return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
