export const PROJECT='demo-kuimbae-original';
export const ROOT='shops/kuimbae-style';
export const SCOPED=['v2Barbers','v2Appointments','v2Services','v2Sales','v2Cash'];
export const safeId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(value);
export function profile(uid,raw){
  if(!safeId(uid)||raw?.active!==true||!['admin','barber'].includes(raw.role)
    ||(raw.role==='barber'&&!safeId(raw.barberId)))throw Error('Perfil inactivo, no autorizado o sin vínculo válido.');
  return Object.freeze({uid,role:raw.role,...(raw.role==='barber'?{barberId:raw.barberId}:{})});
}
export function scope(p,name){
  if(![...SCOPED,'v2Products','v2ProductCosts'].includes(name))throw Error('Colección no autorizada');
  if(p.role==='admin')return null;
  if(name==='v2ProductCosts')throw Error('Costos privados');
  return name==='v2Products'?null:[name==='v2Barbers'?'id':'barberId','==',p.barberId];
}
