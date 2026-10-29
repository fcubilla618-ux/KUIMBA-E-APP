import {auditBackup} from './migration/audit-v1.mjs';
import {previewAppointments} from './migration/preview-appointments.mjs';
import {safeId} from './access.mjs';
// Pure offline report. Never imports Firebase, emits records, or performs writes.
export function audit(backup,links={}){
  const data=backup?.data,errors=[],counts={};
  if(!data||typeof data!=='object')return {ready:false,errors:['Formato de respaldo inválido']};
  const names=['barbers','appointments','services','cashEntries','products'];
  const ids=new Set();
  for(const name of names){
    const rows=data[name];counts[name]=Array.isArray(rows)?rows.length:0;
    if(!Array.isArray(rows)){errors.push(`${name}: formato inválido`);continue;}
    const seen=new Set();
    for(const row of rows){
      if(!row||!safeId(row.id)||seen.has(row.id))errors.push(`${name}: identificador ausente o duplicado`);
      seen.add(row?.id);if(name==='barbers')ids.add(row?.id);
    }
  }
  if(errors.length)return {dryRun:true,firestoreWrites:0,ready:false,counts,errors};
  if(!links||typeof links!=='object'||Array.isArray(links))links={};
  for(const row of data.appointments){
    if(!Number.isInteger(row.duration)||row.duration<=0||row.duration>1440)errors.push('Turnos: duración original inválida');
    const date=new Date(row.date+'T00:00:00Z');
    if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==row.date)errors.push('Turnos: fecha inválida');
  }
  for(const name of ['appointments','cashEntries'])for(const row of Array.isArray(data[name])?data[name]:[]){
    if(!ids.has(row?.barberId))errors.push(`${name}: vínculo de barbero pendiente`);
  }
  const recovered=auditBackup(backup);
  if(!recovered.ok)errors.push('Auditoría V1 recuperada: datos inválidos');
  if(recovered.warnings.some(w=>['SHARED_SERVICE','UNATTRIBUTED_PRODUCT_SALE'].includes(w.code)))errors.push('Mapeo de servicios compartidos o ventas sin dueño pendiente');
  let preview;
  try{preview=previewAppointments(backup);}catch{errors.push('Vista previa V2: turnos inválidos');}
  const intervals=new Map();
  for(const row of preview?.documents||[]){
    if(!Number.isFinite(row.duration)||row.duration<=0||row.duration>1440){errors.push('Turnos: duración inválida');continue;}
    if(row.status==='cancelado')continue;
    const [hours,minutes]=row.time.split(':').map(Number),start=hours*60+minutes,end=start+row.duration;
    const key=`${row.barberId}/${row.date}`,existing=intervals.get(key)||[];
    if(existing.some(([a,b])=>start<b&&end>a))errors.push('Turnos: superposición por barbero y fecha');
    existing.push([start,end]);intervals.set(key,existing);
  }
  const linked=Object.values(links);
  if(!ids.size||linked.length!==ids.size||new Set(linked).size!==linked.length||linked.some(id=>!ids.has(id)))errors.push('Verificar mapa de cuentas y barberos completo');
  const cash=Array.isArray(data.cashEntries)?data.cashEntries:[];
  if(cash.some(row=>!Number.isFinite(row.amount)))errors.push('Caja: monto inválido');
  return {dryRun:true,firestoreWrites:0,requiresRealProfileVerification:true,ready:!errors.length,counts,cashTotal:cash.reduce((n,row)=>n+(Number.isFinite(row.amount)?row.amount:0),0),errors};
}
