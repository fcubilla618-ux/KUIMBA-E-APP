export const PROJECT='demo-kuimbae-original';
export const ROOT='shops/kuimbae-style';
export const SCOPED=['v2Barbers','v2Appointments','v2Services','v2Sales','v2Cash','v2Clients'];
export const safeId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(value);
export function profile(uid,raw){
  if(!safeId(uid)||raw?.active!==true||!['admin','barber'].includes(raw.role)
    ||(raw.role==='barber'&&!safeId(raw.barberId)))throw Error('Perfil inactivo, no autorizado o sin vínculo válido.');
  const permissions=Object.freeze({manageAppointments:raw.role==='admin'||raw.permissions?.manageAppointments!==false,canSell:raw.role==='admin'||raw.permissions?.canSell!==false,manageClients:raw.role==='admin'||raw.permissions?.manageClients!==false,manageServices:raw.role==='admin'||raw.permissions?.manageServices===true});
 return Object.freeze({uid,role:raw.role,permissions,...(raw.role==='barber'?{barberId:raw.barberId}:{})});
}
export function scope(p,name){
  if(![...SCOPED,'v2Products','v2ProductCosts','v2Settings','users'].includes(name))throw Error('Colección no autorizada');
  if(p.role==='admin')return null;
  if(['v2ProductCosts','users'].includes(name))throw Error('Costos privados');
  return ['v2Products','v2Settings'].includes(name)?null:[name==='v2Barbers'?'id':'barberId','==',p.barberId];
}
