#!/usr/bin/env node
// V2 appointment migration PREVIEW — read only, no Firestore credentials.
// Usage: node beta/tools/preview-appointments.mjs ./backup.json
// Prints ONLY aggregate stats; does not print customer names or phone numbers.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const isId=x=>typeof x==='string'&&x.trim().length>0;
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s);
const validTime=s=>typeof s==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s);

export function previewAppointments(backup) {
  const data=backup?.data;
  if(!data || !Array.isArray(data.barbers) || !Array.isArray(data.appointments)
    || !Array.isArray(data.services)) throw Error('Respaldo sin listas válidas.');
  const barberIds=new Set(data.barbers.map(b=>b?.id).filter(isId));
  if(barberIds.size!==data.barbers.length) throw Error('IDs de barberos faltantes o repetidos.');
  const serviceByName=new Map(data.services.map(s=>[s?.name,s]).filter(([name])=>isId(name)));
  const appointments=[],ids=new Set(),warnings=[];
  for(let i=0;i<data.appointments.length;i++) {
    const a=data.appointments[i];
    if(!a || !isId(a.id) || ids.has(a.id))throw Error('Turno con ID inválido o duplicado: índice '+i);
    ids.add(a.id);
    if(!isId(a.barberId)||!barberIds.has(a.barberId))
      throw Error('Turno sin barbero válido: índice '+i);
    if(!validDate(a.date)||!validTime(a.time))
      throw Error('Fecha/hora inválidas: índice '+i);
    if(!['pendiente','atendido','cancelado'].includes(a.status))
      throw Error('Estado inválido: índice '+i);
    if(!Number.isFinite(Number(a.servicePrice)) || Number(a.servicePrice)<0)
      throw Error('Precio del turno inválido: índice '+i);
    const currentService=serviceByName.get(a.service);
    if(!currentService)warnings.push({code:'HISTORICAL_SERVICE',appointmentIndex:i});
    // Preserve the price PAID/AGREED AT BOOKING: never substitute current catalog price.
    // createdAt remains ISO in PREVIEW; convert to Firestore Timestamp only at import.
    // Admin migration must set audit fields server-side, not invent historical creators.
    appointments.push({
      id:a.id,barberId:a.barberId,client:a.client||'',phone:a.phone||'',
      date:a.date,time:a.time,duration:Number(a.duration)||60,
      service:a.service||'',serviceId:currentService?.id||null,
      price:Number(a.servicePrice),notes:a.notes||'',status:a.status,
      historicalCreatedAt:a.createdAt||null
    });
  }
  return {
    dryRun:true,firestoreWrites:0,
    appointmentsPrepared:appointments.length,uniqueIds:ids.size,
    barberCount:barberIds.size,historicalServiceReferences:warnings.length,
    warnings,
    // In-memory only: NEVER upload personal names/phone numbers to public GitHub.
    documents:appointments
  };
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  if(!process.argv[2]) { console.error('Uso: node beta/tools/preview-appointments.mjs respaldo.json'); process.exitCode=2; }
  else try {
    const result=previewAppointments(JSON.parse(readFileSync(process.argv[2],'utf8')));
    const {documents,...redacted}=result;
    console.log(JSON.stringify(redacted,null,2));
  }catch(error){console.error('No se puede preparar:','Formato inválido; revisar respaldo localmente');process.exitCode=1;}
}
