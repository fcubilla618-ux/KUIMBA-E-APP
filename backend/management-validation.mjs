import {fingerprint,reject,PAYMENTS} from './validation.mjs';
import {safeId} from '../development/access.mjs';
const schemas={
 'service.save':['id','revision','barberId','name','description','price','duration','active'],
 'service.delete':['id','revision'],'product.save':['id','revision','name','category','price','cost','stock','photo','active'],
 'product.delete':['id','revision'],'barber.save':['id','revision','name','role','photo','active'],
 'client.save':['id','revision','barberId','key','name','phone','notes'],'settings.save':['revision','settings'],
 'user.create':['email','password','name','role','barberId','permissions'],
 'user.update':['uid','revision','name','role','barberId','active','permissions'],'user.password':['uid','password'],
 'cash.payment':['id','revision','payment']};
export const handlesManagement=action=>Object.hasOwn(schemas,action);
const invalid=()=>reject('invalid-input','Campos inválidos o fuera de rango.');
const text=(v,max,required=false)=>typeof v==='string'&&v.length<=max&&(!required||v.trim().length>0);
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export const clientId=(barberId,key)=>'client-'+fingerprint({barberId,key});
export function validatePhoto(value){
 if(value==='')return value;
 if(typeof value!=='string'||value.length>350000)invalid();
 const match=/^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
 if(!match||match[2].length%4!==0)invalid();
 const bytes=Buffer.from(match[2],'base64');if(bytes.length>250*1024||bytes.toString('base64')!==match[2])invalid();
 const kind=match[1];
 if(kind==='png'&&!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))invalid();
 if(kind==='jpeg'&&!(bytes[0]===255&&bytes[1]===216&&bytes[2]===255))invalid();
 if(kind==='gif'&&!['GIF87a','GIF89a'].includes(bytes.subarray(0,6).toString()))invalid();
 if(kind==='webp'&&!(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP'))invalid();
 return value;
}
export const SETTINGS_KEYS=['businessName','businessSubtitle','address','businessPhone','logoData','openDays','morningStart','morningEnd','afternoonStart','afternoonEnd','slotInterval','defaultDuration','vipVisits','vipDays','habitualMonths','inactiveDays','followupDays','whatsappMessage','closures'];
export function validateSettings(s){
 if(!exact(s,SETTINGS_KEYS))invalid();
 for(const [key,max] of Object.entries({businessName:120,businessSubtitle:200,address:300,businessPhone:40,whatsappMessage:2000}))if(!text(s[key],max,key==='businessName'))invalid();
 validatePhoto(s.logoData);
 if(!Array.isArray(s.openDays)||s.openDays.length===0||s.openDays.length>7||new Set(s.openDays).size!==s.openDays.length||s.openDays.some(x=>!integer(x,0,6)))invalid();
 for(const k of ['morningStart','morningEnd','afternoonStart','afternoonEnd'])if(typeof s[k]!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s[k]))invalid();
 if(s.morningStart>=s.morningEnd||s.afternoonStart>=s.afternoonEnd||s.morningEnd>s.afternoonStart)invalid();
 if(![30,45,60].includes(s.slotInterval)||![30,45,60,90,120].includes(s.defaultDuration))invalid();
 for(const [k,min] of Object.entries({vipVisits:2,vipDays:30,habitualMonths:2,inactiveDays:30,followupDays:7}))if(!integer(s[k],min,3650))invalid();
 if(!Array.isArray(s.closures)||s.closures.length>366)invalid();
 for(const c of s.closures){
  if(!exact(c,['id','start','end','reason'])||!safeId(c.id)||!text(c.reason,300)||c.start>c.end)invalid();
  for(const value of [c.start,c.end])if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(new Date(value+'T00:00:00Z').getTime())||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)invalid();
 }
 return s;
}
export function validateManagement(raw){
 if(!raw||!handlesManagement(raw.action)||!exact(raw,['action','operationId',...schemas[raw.action]]))invalid();
 const c=structuredClone(raw);
 for(const k of ['operationId','id','uid'])if(k in c&&!safeId(c[k]))invalid();
 if('revision'in c&&!integer(c.revision,0,Number.MAX_SAFE_INTEGER-1))invalid();
 if('active'in c&&typeof c.active!=='boolean')invalid();
 for(const k of ['name','description','category','key','phone','notes'])if(k in c&&!text(c[k],({name:120,description:1000,category:100,key:200,phone:40,notes:2000})[k],['name','key'].includes(k)))invalid();
 for(const k of ['price','cost'])if(k in c&&!integer(c[k],0,1_000_000_000))invalid();
 if('stock'in c&&!integer(c.stock,0,1_000_000))invalid();
 if('duration'in c&&!integer(c.duration,1,1440))invalid();
 if('photo'in c)validatePhoto(c.photo);
 if('payment'in c&&!PAYMENTS.includes(c.payment))invalid();
 if(c.action==='barber.save'&&!text(c.role,120))invalid();
 if(c.action.startsWith('user.')){
  if('password'in c&&(!text(c.password,128,true)||c.password.length<8))invalid();
  if('email'in c&&(!text(c.email,254,true)||!/^\S+@\S+\.\S+$/.test(c.email)||c.email!==c.email.trim()))invalid();
  if('role'in c){
   if(!['admin','barber'].includes(c.role)||!(c.role==='admin'?c.barberId==='':safeId(c.barberId)))invalid();
   const keys=['manageAppointments','canSell','manageClients','manageServices'];
   if(!exact(c.permissions,keys)||keys.some(k=>typeof c.permissions[k]!=='boolean'))invalid();
  }
 }else if('barberId'in c&&!safeId(c.barberId))invalid();
 if(c.action==='client.save'&&(!/^[a-z0-9-]{1,180}$/.test(c.key)||c.id!==clientId(c.barberId,c.key)))invalid();
 if(c.action==='settings.save')validateSettings(c.settings);
 return c;
}
