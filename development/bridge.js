// Runs inside the original classic-script scope. No remote or storage writes.
window.kuimbaeView={
  clear(){
    window.kuimbaeProfile=null;
    barbers=[];appointments=[];services=[];cashEntries=[];products=[];clientMeta={};
    currentBarberId=null;cashScope='general';currentClientKey='';
    renderBarbers();renderClients();renderProducts();renderServices();renderCashPicker();renderCashDetail();
    document.getElementById('calendarGrid')?.replaceChildren();document.getElementById('slotsGrid')?.replaceChildren();
    document.getElementById('clientProfileCard')?.replaceChildren();
    for(const id of ['clientName','clientPhone','clientNotesInput']){const e=document.getElementById(id);if(e){e.value='';e.textContent='';}}
    document.querySelectorAll('.modal-backdrop').forEach(e=>e.classList.remove('open'));
    document.querySelectorAll('form:not(#firebase-login)').forEach(e=>e.reset());
    subtitle.textContent=DEFAULT_SETTINGS.businessSubtitle;
    document.querySelectorAll('.screen').forEach(e=>e.classList.remove('active'));
    for(const id of ['barbersGrid','appointmentsList','cashPickerGrid','cashEntriesList','clientsList','productsGrid','productSalesList','servicesList','agendaHead','clientDetailContent','clientDetailHead','clientReminder','clientHistoryList','clientVisitCount','clientLastVisit','clientFavoriteService'])document.getElementById(id)?.replaceChildren();
  },
  apply(p,data){
    barbers=data.v2Barbers.map(x=>({...x,photo:/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(x.photo||'')?x.photo:''}));appointments=data.v2Appointments.map(x=>({...x,servicePrice:x.price}));services=data.v2Services;
    cashEntries=data.v2Cash; // Sales are already represented here exactly once.
    const costs=new Map((data.v2ProductCosts||[]).map(x=>[x.id,x.cost]));
    products=data.v2Products.map(x=>({...x,...(p.role==='admin'?{cost:costs.get(x.id)}:{})}));
    if(p.role==='barber'){currentBarberId=p.barberId;cashScope=p.barberId;}
    const changed=!window.kuimbaeProfile||window.kuimbaeProfile.uid!==p.uid;window.kuimbaeProfile=p;
    if(changed)renderState({screen:'home'});
    const screen=document.querySelector('.screen.active')?.id;
    if(screen==='screenClientDetail'){
      for(const id of ['clientReminder','clientVisitCount','clientLastVisit','clientFavoriteService'])document.getElementById(id).replaceChildren();
      document.getElementById('clientNotesInput').value='';
      renderClientDetail();
    }
    if(screen==='screenAgenda'&&selectedDate) {renderAgendaHead();renderCalendar();renderSlots();renderAppointments();}
    renderBarbers();renderCashPicker();renderCashDetail();renderProducts();renderServices();renderClients();syncAppointmentServices();
    if(p.role==='barber'){
      document.querySelectorAll('[onclick*="openCashDetail(\'general\')"],.add-card,.product-card-cost').forEach(e=>e.hidden=true);
    }
    enforceReadOnly();
  }
};

const originalRenderState=renderState;
renderState=function(state){
  const p=window.kuimbaeProfile;
  if(p?.role==='barber'){
    if(state?.screen==='cash'||state?.screen==='cashdetail')state={...state,screen:'cashdetail',scope:p.barberId};
    if(state?.screen==='agenda')state={...state,barberId:p.barberId};
    if(state?.screen==='settings')state={screen:'home'};
  }
  originalRenderState(state);
  enforceReadOnly();
};
function enforceReadOnly(){
  const mutator=/^(openBarberModal|openServiceModal|editService|deleteService|openProductForm|openProductDelete|confirmDeleteProduct|saveClientNotes|saveSettingsFromUI|resetKuimbaeSystem|applyRestoreBackup|restoreOriginalSettingsLogo|removeClosurePeriod|document.getElementById\('restoreBackupInput')/;
  for(const e of document.querySelectorAll('[onclick],.add-card,.cash-payment')){
    if((mutator.test(e.getAttribute('onclick')||'')||e.matches('.add-card,.cash-payment'))&&!e.disabled)e.disabled=true;
  }
  if(window.kuimbaeProfile?.role==='barber'){
    document.querySelectorAll('.product-card-cost').forEach(e=>{e.hidden=true;});
    document.getElementById('productsCostValue')?.parentElement.setAttribute('hidden','');
  }else document.getElementById('productsCostValue')?.parentElement.removeAttribute('hidden');
}
for(const name of ['saveSettingsFromUI','saveClientNotes','setAppointmentStatus','setCashPayment','saveProductFromForm','saveProductSale','confirmDeleteProduct','deleteService','executeKuimbaeReset','applyRestoreBackup','restoreFullBackup','addClosurePeriod','removeClosurePeriod','registerCashForAppointment','removeCashForAppointment'])window[name]=()=>showToast('Escrituras bloqueadas hasta disponer de validación del servidor');
new MutationObserver(()=>enforceReadOnly()).observe(document.querySelector('body > .app'),{childList:true,subtree:true});
