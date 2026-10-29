// Adds server-backed actions to the served copy, preserving the original file.
let operationBusy=false,editingAppointment=null,retryIntent=null;
const operationMessage=document.createElement('p');operationMessage.id='operation-message';operationMessage.role='status';operationMessage.setAttribute('aria-live','polite');
document.getElementById('firebase-session')?.append(operationMessage);
// Firebase session shell loads later, so the message initially lives above the app.
if(!operationMessage.isConnected)document.querySelector('body > .app').before(operationMessage);
const retryButton=document.createElement('button');retryButton.id='operation-retry';retryButton.type='button';retryButton.className='secondary-btn';retryButton.textContent='Reintentar confirmación';retryButton.hidden=true;operationMessage.after(retryButton);
retryButton.onclick=()=>{if(retryIntent)void runServer(retryIntent.command,retryIntent.message,retryIntent.onSuccess,true);};
window.kuimbaeResetOperations=()=>{retryIntent=null;retryButton.hidden=true;operationMessage.textContent='';};
window.kuimbaeUseBusinessTime=function(clock){const deviceDate=localISO;localISO=function(value){return value?deviceDate(value):clock(new Date()).date;};};
function fieldSelect(id,labelText,parent){
 const field=document.createElement('div');field.className='field';
 const label=document.createElement('label');label.htmlFor=id;label.textContent=labelText;
 const select=document.createElement('select');select.id=id;field.append(label,select);parent.prepend(field);return select;
}
const appointmentBarber=fieldSelect('appointmentBarberSelect','Barbero',appointmentForm);
const saleBarber=fieldSelect('saleBarberSelect','Caja del barbero',document.getElementById('productSaleForm'));
for(const [id,labelText,type] of [['dateInput','Fecha','date'],['timeInput','Hora','time']]){
 const input=document.getElementById(id);input.type=type;const field=document.createElement('div');field.className='field';
 const label=document.createElement('label');label.htmlFor=id;label.textContent=labelText;input.before(field);field.append(label,input);
}
function barberChoices(select,selected){
 const value=selected??select.value;select.replaceChildren();
 const p=window.kuimbaeProfile;
 select.parentElement.hidden=p?.role!=='admin';
 for(const b of barbers){const option=document.createElement('option');option.value=b.id;option.textContent=b.name;select.append(option);}
 select.value=p?.role==='barber'?p.barberId:value;
 if(!select.value&&barbers.length)select.value=barbers[0].id;
}
syncAppointmentServices=function(){
 const select=document.getElementById('serviceInput'),value=select.value;
 const target=appointmentBarber.value||currentBarberId;select.replaceChildren();
 const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Seleccionar';select.append(placeholder);
 for(const service of services.filter(s=>s.barberId===target&&s.active===true)){
  const option=document.createElement('option');option.value=service.id;option.textContent=`${service.name} · ${formatGs(service.price)}`;select.append(option);
 }
 select.value=[...select.options].some(o=>o.value===value)?value:'';
};
appointmentBarber.onchange=()=>syncAppointmentServices();
syncAppointmentDurationFromService=function(){const service=services.find(s=>s.id===document.getElementById('serviceInput').value);if(service)document.getElementById('durationInput').value=String(service.duration);};
async function runServer(command,message,onSuccess=()=>{},retry=false){
 if(operationBusy)return;
 const uid=window.kuimbaeProfile?.uid;
 if(!uid||!navigator.onLine){operationMessage.textContent='Sin sesión o conexión. No se guardó ningún cambio local.';return;}
 operationBusy=true;operationMessage.textContent='Confirmando con el servidor…';
 document.querySelector('body > .app').setAttribute('aria-busy','true');
 try{
  const result=await (retry?window.kuimbaeExecute.retry():window.kuimbaeExecute(command));
  if(window.kuimbaeProfile?.uid!==uid)return;
  retryIntent=null;retryButton.hidden=true;operationMessage.textContent=message;onSuccess(result);
 }catch(error){if(window.kuimbaeProfile?.uid===uid){operationMessage.textContent=error.message;if(error.definitive){retryIntent=null;}else retryIntent=retryIntent||{uid,command,message,onSuccess};retryButton.hidden=!retryIntent;if(retryIntent&&command.action==='product.sell')closeProductSale();}}
 finally{operationBusy=false;document.querySelector('body > .app').removeAttribute('aria-busy');}
}
const phase1Apply=window.kuimbaeView.apply,phase1Clear=window.kuimbaeView.clear;
window.kuimbaeView.apply=function(p,data){
 if(retryIntent?.uid!==p.uid)retryIntent=null;retryButton.hidden=!retryIntent;
 phase1Apply(p,data);barberChoices(appointmentBarber);barberChoices(saleBarber);syncAppointmentServices();
 document.getElementById('cashCountLabel').textContent='Movimientos';
};
window.kuimbaeView.clear=function(){retryButton.hidden=true;editingAppointment=null;operationMessage.textContent='';phase1Clear();};
const phase1RenderState=renderState;
renderState=function(state){phase1RenderState(state);if(state?.screen==='agenda'&&state.stage==='form'){barberChoices(appointmentBarber,state.barberId||currentBarberId);syncAppointmentServices();}};
const originalSelectSlot=selectSlot;
selectSlot=function(time){editingAppointment=null;document.querySelector('#formStep .form-title').textContent='Nuevo turno';originalSelectSlot(time);};
const phase1RenderAppointments=renderAppointments;
renderAppointments=function(){
 phase1RenderAppointments();
 for(const card of document.querySelectorAll('#appointmentsList .appointment')){
  const id=/setAppointmentStatus\('([a-zA-Z0-9_-]+)'/.exec(card.querySelector('[onclick]')?.getAttribute('onclick')||'')?.[1];
  const item=appointments.find(a=>a.id===id);if(!item||item.status!=='pendiente')continue;
  const button=document.createElement('button');button.type='button';button.className='secondary-btn firebase-edit';button.textContent='Modificar';
  button.onclick=()=>{
   editingAppointment={id:item.id,revision:item.revision??1};
   navigate({screen:'agenda',stage:'form',barberId:item.barberId,date:item.date,time:item.time});
   document.querySelector('#formStep .form-title').textContent='Modificar turno';
   for(const [field,value] of Object.entries({clientInput:item.client,phoneInput:item.phone||'',notesInput:item.notes||'',serviceInput:item.serviceId||''}))document.getElementById(field).value=value;
  };
  card.querySelector('.appointment-actions').append(button);
 }
};
setAppointmentStatus=function(id,status){
 const item=appointments.find(a=>a.id===id);if(!item)return;
 if(status==='cancelado'&&!confirm('¿Cancelar este turno? Si ya fue cobrado se registrará una reversión.'))return;
 const action=status==='cancelado'?'appointment.cancel':'appointment.complete';
 void runServer({action,id,revision:item.revision??1,...(status==='atendido'?{payment:'Sin especificar'}:{})},status==='cancelado'?'Turno cancelado':'Servicio cobrado');
};
const phase1OpenSale=openProductSale;
openProductSale=function(id){barberChoices(saleBarber);phase1OpenSale(id);};
renderProductSaleTotal=function(){
 const product=products.find(p=>p.id===currentProductSaleId),quantity=Number(document.getElementById('productSaleQty').value);
 const valid=product&&Number.isInteger(quantity)&&quantity>0&&quantity<=product.stock;
 document.getElementById('productConfirmSaleBtn').disabled=!valid;
 document.getElementById('productSaleTotal').textContent=valid?`Total: ${formatGs(product.price*quantity)} · El servidor confirmará stock y precio.`:'Revisá la cantidad.';
};
window.kuimbaeSubmit=function(event){
 if(event.target.id==='appointmentForm'){
  const target=appointmentBarber.value||currentBarberId;
  const command={action:editingAppointment?'appointment.update':'appointment.create',...(editingAppointment||{}),barberId:target,serviceId:document.getElementById('serviceInput').value,date:dateInput.value,time:timeInput.value,client:document.getElementById('clientInput').value.trim(),phone:document.getElementById('phoneInput').value.trim(),notes:document.getElementById('notesInput').value.trim()};
  void runServer(command,editingAppointment?'Turno actualizado':'Turno guardado',()=>{editingAppointment=null;appointmentForm.reset();navigate({screen:'agenda',stage:'slots',barberId:target,date:command.date});});return;
 }
 if(event.target.id==='productSaleForm'){
  void runServer({action:'product.sell',barberId:saleBarber.value,productId:currentProductSaleId,quantity:Number(document.getElementById('productSaleQty').value),payment:document.getElementById('productSalePayment').value},'Venta registrada en caja individual',()=>closeProductSale());return;
 }
 operationMessage.textContent='Esta operación sigue protegida; no se guardaron cambios locales.';
};
