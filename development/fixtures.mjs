import {BUSINESS_DEFAULTS} from './settings-model.mjs';
import {businessTime} from './business-time.mjs';
export const accounts=['admin','walter','dani','junior'].map(name=>({uid:`test-${name}`,email:`${name}@example.test`,role:name==='admin'?'admin':'barber',...(name==='admin'?{}:{barberId:`test-${name}`})}));
export function documents(){
  const result={};
  for(const a of accounts){
    result[`users/${a.uid}`]={role:a.role,active:true,name:a.uid,email:a.email,revision:1,...(a.barberId?{barberId:a.barberId}:{})};
    if(!a.barberId)continue;
    result[`shops/kuimbae-style/v2Barbers/${a.barberId}`]={id:a.barberId,uid:a.uid,active:true,name:a.uid,role:'Barbero',photo:''};
    for(const kind of ['v2Appointments','v2Services','v2Cash','v2Sales'])result[`shops/kuimbae-style/${kind}/${a.uid}`]={id:a.uid,barberId:a.barberId,client:`Cliente ficticio ${a.uid}`,name:'Servicio de ensayo',service:'Servicio de ensayo',date:businessTime().date,time:'10:00',duration:60,price:100,amount:100,status:'pendiente',payment:'Efectivo'};
  }
  for(const a of accounts.filter(x=>x.barberId))result[`shops/kuimbae-style/v2Services/${a.barberId}`].active=true;
  result['shops/kuimbae-style/v2Products/test-product']={id:'test-product',name:'Producto ficticio',category:'Ensayo',price:20,stock:1};
  result['shops/kuimbae-style/v2ProductCosts/test-product']={id:'test-product',cost:5};
  result['shops/kuimbae-style/v2Settings/public']={id:'public',revision:1,settings:{...structuredClone(BUSINESS_DEFAULTS),openDays:[0,1,2,3,4,5,6],morningStart:'00:00',morningEnd:'11:30',afternoonStart:'12:00',afternoonEnd:'23:30',slotInterval:30}};
  result['shops/kuimbae-style/datasets/appointments']={data:[],version:1};
  return result;
}
