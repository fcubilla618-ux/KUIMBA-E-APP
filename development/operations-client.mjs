// Keeps one ambiguous request in memory. Never queues or persists writes offline.
export function createOperationClient({getIdentity,send}){
 let pending=null,inFlight=null,epoch=0;
 async function execute(command){
  const started=epoch,identity=await getIdentity();
  if(!identity?.uid)throw Error('Tenés que iniciar sesión.');
  const signature=JSON.stringify(Object.fromEntries(Object.keys(command).sort().map(k=>[k,command[k]])));
  if(pending&&pending.uid!==identity.uid)pending=null;
  if(pending&&pending.signature!==signature)throw Error('Hay una operación pendiente de confirmar. Reintentá primero la misma operación.');
  if(inFlight?.uid===identity.uid)return inFlight.promise;
  pending=pending||{uid:identity.uid,signature,payload:{...command,operationId:crypto.randomUUID()}};
  const request=pending;
  const promise=(async()=>{
   try{
    const result=await send(request.payload,identity.token);
    if((await getIdentity())?.uid!==identity.uid||epoch!==started)throw Error('Cambió la sesión durante la operación.');
    if(pending===request)pending=null;
    return result;
   }catch(error){if(error.definitive&&pending===request)pending=null;throw error;}
   finally{if(inFlight?.request===request)inFlight=null;}
  })();
  inFlight={uid:identity.uid,request,promise};
  return promise;
 }
 execute.retry=()=>{if(!pending)throw Error('No hay una operación pendiente.');const {operationId,...command}=pending.payload;return execute(command);};
 execute.reset=()=>{epoch++;pending=null;inFlight=null;};
 return execute;
}
