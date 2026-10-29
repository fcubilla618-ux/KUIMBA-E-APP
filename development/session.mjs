import {profile,SCOPED,safeId} from './access.mjs';
// Firebase supplies the trusted source; the UI never supplies an authorization role.
export function createSession(source,publish){
  let generation=0,profileStop=()=>{},rowStops=[];
  const stopRows=()=>{for(const stop of rowStops)stop();rowStops=[];};
  function login(uid){
    const turn=++generation;profileStop();stopRows();
    publish({status:uid?'loading':'signed-out',data:null});
    if(!uid)return;
    let revision=0,failed=false;
    const fail=error=>{if(turn!==generation)return;failed=true;revision++;stopRows();publish({status:'error',code:error?.code||'profile',data:null});};
    profileStop=source.watchProfile(uid,raw=>{
      if(turn!==generation||failed)return;
      stopRows();const current=++revision;
      publish({status:'loading',data:null});
      let p;try{p=profile(uid,raw);}catch(error){fail(error);return;}
      const names=[...SCOPED,'v2Products',...(p.role==='admin'?['v2ProductCosts']:[])];
      const data={};
      for(const name of names){
        const stop=source.watchRows(p,name,(rows,fromCache=false)=>{
          if(turn!==generation||current!==revision||failed)return;
          if(fromCache){fail({code:'unavailable'});return;}
          if(rows.some(row=>!safeId(row.id)||(p.role==='barber'&&name!=='v2Products'&&(name==='v2Barbers'?row.id!==p.barberId:row.barberId!==p.barberId)))){fail({code:'invalid-data'});return;}
          data[name]=rows;
          if(names.every(key=>Object.hasOwn(data,key))){
            if(p.role==='barber'&&(data.v2Barbers.length!==1||data.v2Barbers[0].uid!==uid||data.v2Barbers[0].active!==true)){fail({code:'invalid-link'});return;}
            publish({status:data.v2Appointments.length||data.v2Cash.length?'ready':'empty',profile:p,data:{...data}});
          }
        },error=>{if(current===revision)fail(error);});
        rowStops.push(stop);
      }
    },fail);
  }
  return {login,close:()=>login(null)};
}
