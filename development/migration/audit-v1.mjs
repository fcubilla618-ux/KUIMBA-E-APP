#!/usr/bin/env node
// Kuimba'e Style BETA — auditoría V1 de SOLO LECTURA.
// node beta/tools/audit-v1.mjs /ruta/mi-respaldo.json
// No conecta a Firebase, no escribe ningún archivo, no imprime clientes/telefonos.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const list=(v)=>Array.isArray(v)?v:null;
const validId=(v)=>typeof v==='string' && v.trim().length>0;
const money=(v)=>typeof v==='number' && Number.isFinite(v) && v>=0;
const integer=(v)=>Number.isInteger(v)&&v>=0;
const isoDate=(v)=>typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const hour=(v)=>typeof v==='string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

export function auditBackup(backup) {
  const errors=[],warnings=[],counts={},summary={};
  const d=(backup&&typeof backup==='object'&&(backup.data||backup))||{};
  function fail(code,detail){errors.push({code,detail})}
  function warn(code,detail){warnings.push({code,detail})}
  const collections={
    barbers:list(d.barbers),
    appointments:list(d.appointments),
    services:list(d.services),
    cash:list(d.cashEntries??d.cash),
    products:list(d.products)
  };
  for(const [type,items] of Object.entries(collections)){
    if(!items){fail('MISSING_LIST',type+' no es una lista; no migrar.');continue}
    counts[type]=items.length;
    const seen=new Set();
    for(let n=0;n<items.length;n++){
      const it=items[n];
      if(!it||typeof it!=='object'||Array.isArray(it)||!validId(it.id)){
        fail('INVALID_ID',type+'['+n+'] no tiene id válido.');continue;
      }
      if(seen.has(it.id))fail('DUPLICATE_ID',type+' tiene un id duplicado en índice '+n);
      seen.add(it.id);
    }
  }
  // Una copia corrupta o parcialmente cargada NO debe usarse para migrar.
  if(errors.some(e=>e.code==='MISSING_LIST'))return {ok:false,counts,summary,errors,warnings};
  const barberIds=new Set(collections.barbers.map(x=>x?.id).filter(validId));
  const activeServiceNames=new Set(collections.services.map(x=>x?.name).filter(validId));
  const appointmentServiceNames=new Map();
  for(const [idx,a] of collections.appointments.entries()){
    if(validId(a?.service) && !activeServiceNames.has(a.service)){
      warn('MISSING_ACTIVE_SERVICE','Turno #'+idx+' refiere un servicio que ya no figura en el catálogo.');
      appointmentServiceNames.set(a.service,(appointmentServiceNames.get(a.service)||0)+1);
    }
    if(!a||!validId(a.barberId)||!barberIds.has(a.barberId))
      fail('APPOINTMENT_BARBER_UNKNOWN','Turno #'+idx+' no tiene barberId correspondiente a barbers.');
    if(!isoDate(a?.date)||!hour(a?.time))
      fail('APPOINTMENT_DATE_INVALID','Turno #'+idx+' tiene fecha/hora inválida.');
    if(!['pendiente','atendido','cancelado'].includes(a?.status))
      warn('APPOINTMENT_STATUS','Turno #'+idx+' tiene estado no reconocido; revisar equivalencias.');
  }
  for(const [idx,c] of collections.cash.entries()){
    if(!c||!money(Number(c.amount)))fail('CASH_AMOUNT_INVALID','Movimiento #'+idx+' tiene monto inválido.');
    if(c?.barberId!=null&&!barberIds.has(c.barberId))
      fail('CASH_BARBER_UNKNOWN','Movimiento #'+idx+' tiene barberId desconocido.');
    if(c?.type==='producto'&&!validId(c.barberId))
      warn('UNATTRIBUTED_PRODUCT_SALE','Venta producto #'+idx+' no tiene barbero; NO asignar automáticamente.');
  }
  for(const [idx,p] of collections.products.entries()){
    if(!p||!integer(Number(p.stock)))fail('PRODUCT_STOCK_INVALID','Producto #'+idx+' tiene stock inválido.');
    if(!money(Number(p?.price)))fail('PRODUCT_PRICE_INVALID','Producto #'+idx+' tiene precio inválido.');
  }
  for(const [idx,s] of collections.services.entries()){
    if(!s||!money(Number(s.price)))fail('SERVICE_PRICE_INVALID','Servicio #'+idx+' tiene precio inválido.');
    if(!validId(s?.barberId))
      warn('SHARED_SERVICE','Servicio #'+idx+' no tiene barberId; definir precios por barbero antes de migrar.');
    else if(!barberIds.has(s.barberId))
      fail('SERVICE_BARBER_UNKNOWN','Servicio #'+idx+' tiene barberId desconocido.');
  }
  summary.appointmentsMissingActiveService=warnings.filter(x=>x.code==='MISSING_ACTIVE_SERVICE').length;
  summary.distinctMissingServiceNames=appointmentServiceNames.size;
  summary.unattributedProductSales=warnings.filter(x=>x.code==='UNATTRIBUTED_PRODUCT_SALE').length;
  summary.sharedServices=warnings.filter(x=>x.code==='SHARED_SERVICE').length;
  summary.cashGross=collections.cash.reduce((sum,c)=>sum+(Number.isFinite(Number(c?.amount))?Number(c.amount):0),0);
  summary.stockUnits=collections.products.reduce((sum,p)=>sum+(Number.isFinite(Number(p?.stock))?Number(p.stock):0),0);
  summary.totalAppointments=collections.appointments.length;
  summary.barberIdsFound=barberIds.size;
  summary.migrationWrites=0;
  return {ok:errors.length===0,counts,summary,errors,warnings};
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const source=process.argv[2];
  if(!source){console.error('Uso: node beta/tools/audit-v1.mjs respaldo.json');process.exitCode=2}
  else try{
    const parsed=JSON.parse(readFileSync(source,'utf8'));
    const result=auditBackup(parsed);
    console.log(JSON.stringify(result,null,2));
    if(!result.ok)process.exitCode=1;
  }catch(err){console.error('No se pudo auditar el respaldo:','JSON inválido o archivo no disponible');process.exitCode=2}
}
