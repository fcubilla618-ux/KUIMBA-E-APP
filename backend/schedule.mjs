import {reject} from './validation.mjs';
const mins=time=>Number(time.slice(0,2))*60+Number(time.slice(3,5));
export function assertSchedule(settings,date,time){
 const weekday=new Date(date+'T00:00:00Z').getUTCDay();
 if(!settings.openDays.includes(weekday)||settings.closures.some(c=>date>=c.start&&date<=c.end))reject('shop-closed','El negocio está cerrado en esa fecha.',409);
 const start=mins(time),valid=[[settings.morningStart,settings.morningEnd],[settings.afternoonStart,settings.afternoonEnd]].some(([a,b])=>start>=mins(a)&&start<=mins(b)&&(start-mins(a))%settings.slotInterval===0);
 if(!valid)reject('outside-schedule','El horario no está habilitado.',409);
}
