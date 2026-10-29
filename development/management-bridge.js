// Phase 3 integration on the served original. No browser writes to Firestore.
let settingsPhotoPending=false;
let managementData=null,serviceEditor=null,productEditor=null,barberEditor=null,settingsEditorRevision=0,clientDraft=null;
const serviceOwner=fieldSelect('serviceOwnerSelect','Servicio autorizado para',serviceForm);
const notesOwner=fieldSelect('notesOwnerSelect','Notas del barbero',document.querySelector('.client-notes-card'));
const clientModal=document.createElement('div');clientModal.id='newClientModal';clientModal.className='modal-backdrop';
clientModal.innerHTML='<div class="modal"><div class="modal-head"><h3>Cliente</h3><button type="button" class="close-btn" id="closeNewClient">×</button></div><form id="newClientForm"><div class="field"><label for="newClientName">Nombre</label><input id="newClientName" maxlength="120" required></div><div class="field"><label for="newClientPhone">Teléfono</label><input id="newClientPhone" type="tel" maxlength="40"></div><div class="field"><label for="newClientNotes">Notas</label><textarea id="newClientNotes" maxlength="2000"></textarea></div><button class="primary-btn" type="submit">Guardar cliente</button></form></div>';
document.body.append(clientModal);
const clientOwner=fieldSelect('clientOwnerSelect','Barbero',document.getElementById('newClientForm'));
const newClientButton=document.createElement('button');newClientButton.id='newClientButton';newClientButton.className='primary-btn';newClientButton.textContent='Agregar cliente';newClientButton.type='button';document.querySelector('#screenClients .section-title').after(newClientButton);
newClientButton.onclick=()=>{document.getElementById('newClientForm').reset();barberChoices(clientOwner);clientModal.classList.add('open');};
document.getElementById('closeNewClient').onclick=()=>clientModal.classList.remove('open');
const rev=row=>row?.revision??(row?1:0);
const allowed=cap=>window.kuimbaeProfile?.role==='admin'||window.kuimbaeProfile?.permissions?.[cap]===true;
const admin=()=>window.kuimbaeProfile?.role==='admin';
function settingsPayload(){return Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map(k=>[k,structuredClone(settings[k])]));}
function captureSettings(){
 const value=settingsPayload();
 for(const [key,id] of Object.entries({businessName:'settingsBusinessName',businessSubtitle:'settingsBusinessSubtitle',address:'settingsAddress',businessPhone:'settingsBusinessPhone',morningStart:'settingsMorningStart',morningEnd:'settingsMorningEnd',afternoonStart:'settingsAfternoonStart',afternoonEnd:'settingsAfternoonEnd',whatsappMessage:'settingsWhatsappMessage'}))value[key]=document.getElementById(id).value.trim();
 for(const [key,id] of Object.entries({slotInterval:'settingsSlotInterval',defaultDuration:'settingsDefaultDuration',vipVisits:'settingsVipVisits',vipDays:'settingsVipDays',habitualMonths:'settingsHabitualMonths',inactiveDays:'settingsInactiveDays',followupDays:'settingsFollowupDays'}))value[key]=Number(document.getElementById(id).value);
 value.openDays=[...document.querySelectorAll('#settingsOpenDays input:checked')].map(e=>Number(e.value));value.logoData=settingsLogoDraft||'';return value;
}
const originalLogoFile=handleSettingsLogoFile;
handleSettingsLogoFile=async function(input){settingsPhotoPending=true;enforceReadOnly();try{await originalLogoFile(input);}finally{settingsPhotoPending=false;enforceReadOnly();}};
const originalOpenSettings=openSettings;
openSettings=function(){settingsEditorRevision=rev(managementData?.v2Settings?.[0]);originalOpenSettings();};
saveSettingsFromUI=function(){void runServer({action:'settings.save',revision:settingsEditorRevision,settings:captureSettings()},'Ajustes guardados',result=>{settingsEditorRevision=result.revision;});};
addClosurePeriod=function(){
 const start=document.getElementById('closureStart').value,end=document.getElementById('closureEnd').value||start,reason=document.getElementById('closureReason').value.trim()||'Cerrado';
 const payload=captureSettings();payload.closures.push({id:crypto.randomUUID(),start,end,reason});void runServer({action:'settings.save',revision:settingsEditorRevision,settings:payload},'Bloqueo guardado',result=>{settingsEditorRevision=result.revision;renderClosures();});
};
removeClosurePeriod=function(id){const payload=captureSettings();payload.closures=payload.closures.filter(c=>c.id!==id);void runServer({action:'settings.save',revision:settingsEditorRevision,settings:payload},'Bloqueo eliminado',result=>{settingsEditorRevision=result.revision;renderClosures();});};
const originalOpenService=openServiceModal;
openServiceModal=function(){serviceEditor={id:crypto.randomUUID(),revision:0};originalOpenService();barberChoices(serviceOwner);serviceOwner.disabled=false;};
const originalEditService=editService;
editService=function(id){const item=services.find(s=>s.id===id);if(!item)return;serviceEditor={id,revision:rev(item)};originalEditService(id);barberChoices(serviceOwner,item.barberId);serviceOwner.disabled=true;};
deleteService=function(id){const item=services.find(s=>s.id===id);if(item&&confirm('¿Dar de baja este servicio? Los turnos conservan su precio histórico.'))void runServer({action:'service.delete',id,revision:rev(item)},'Servicio eliminado');};
const originalOpenProduct=openProductForm;
openProductForm=function(id){const row=products.find(p=>p.id===id);productEditor={id:row?.id||crypto.randomUUID(),revision:rev(row)};originalOpenProduct(id);};
confirmDeleteProduct=function(){const row=products.find(p=>p.id===pendingDeleteProductId);if(row)void runServer({action:'product.delete',id:row.id,revision:rev(row)},'Producto eliminado',()=>closeProductDelete());};
const originalOpenBarber=openBarberModal;
openBarberModal=function(){barberEditor={id:crypto.randomUUID(),revision:0,photo:''};originalOpenBarber();};
const phase2Barbers=renderBarbers;
renderBarbers=function(){phase2Barbers();if(!admin())return;document.querySelectorAll('#barbersGrid .barber-card').forEach((card,i)=>{const row=barbers[i];const button=document.createElement('button');button.className='secondary-btn';button.type='button';button.textContent='Editar perfil';button.onclick=()=>{barberEditor={id:row.id,revision:rev(row),photo:row.photo};originalOpenBarber();document.getElementById('barberName').value=row.name;document.getElementById('barberRole').value=row.role||'';};card.after(button);});};
const historicClients=buildClientProfiles;
buildClientProfiles=function(){const rows=historicClients(),keys=new Set(rows.map(r=>r.key));for(const c of managementData?.v2Clients||[]){if(!keys.has(c.key)){rows.push({key:c.key,name:c.name,phone:c.phone,appointments:[],attended:[],last:null,category:'ocasional',days:null,upcoming:null,favoriteService:'—',favoriteBarber:'—'});keys.add(c.key);}}return rows;};
const originalClientDetail=renderClientDetail;
renderClientDetail=function(){
 const selected=notesOwner.value;barberChoices(notesOwner,selected);const owner=notesOwner.value;
 const record=managementData?.v2Clients?.find(c=>c.key===currentClientKey&&c.barberId===owner);
 clientMeta[currentClientKey]={notes:record?.notes||''};originalClientDetail();
 if(!clientDraft||!clientDraft.dirty||clientDraft.key!==currentClientKey||clientDraft.barberId!==owner)clientDraft={key:currentClientKey,barberId:owner,revision:rev(record),dirty:false};
 if(clientDraft.dirty)document.getElementById('clientNotesInput').value=clientDraft.notes;
};
notesOwner.onchange=()=>{clientDraft=null;renderClientDetail();};
document.getElementById('clientNotesInput').addEventListener('input',()=>{if(clientDraft){clientDraft.dirty=true;clientDraft.notes=document.getElementById('clientNotesInput').value;}});
saveClientNotes=async function(){const p=getClientProfile(currentClientKey);if(!p||!clientDraft)return;const draft={...clientDraft},notes=document.getElementById('clientNotesInput').value;
 const id=await window.kuimbaeClientId(draft.barberId,draft.key);void runServer({action:'client.save',id,revision:draft.revision,barberId:draft.barberId,key:draft.key,name:p.name,phone:p.phone||'',notes},'Notas guardadas',result=>{clientDraft={...draft,revision:result.revision,dirty:false};renderClientDetail();});};
setCashPayment=function(id,payment){const item=cashEntries.find(c=>c.id===id);if(item)void runServer({action:'cash.payment',id,revision:rev(item),payment},'Forma de pago actualizada');};
const phase2Submit=window.kuimbaeSubmit;
window.kuimbaeSubmit=async function(event){
 const form=event.target;
 if(form.id==='serviceForm'){
  if(!serviceEditor)return;void runServer({action:'service.save',...serviceEditor,barberId:serviceOwner.value,name:document.getElementById('serviceName').value.trim(),description:document.getElementById('serviceDescription').value.trim(),price:Number(document.getElementById('servicePrice').value),duration:Number(document.getElementById('serviceDuration').value),active:true},'Servicio guardado',()=>closeServiceModal());return;
 }
 if(form.id==='productForm'){
  if(!productEditor)return;
  try{let photo=productPhotoDraft||'';const file=document.getElementById('productPhotoFile').files?.[0];if(file)photo=await compressProductPhoto(file);
   void runServer({action:'product.save',...productEditor,name:document.getElementById('productName').value.trim(),category:document.getElementById('productCategory').value,price:Number(document.getElementById('productPrice').value),cost:Number(document.getElementById('productCost').value),stock:Number(document.getElementById('productStockInput').value),photo,active:true},'Producto guardado',()=>closeProductForm());
  }catch{operationMessage.textContent='No se pudo procesar la foto.';}return;
 }
 if(form.id==='barberForm'){
  if(!barberEditor)return;try{const file=document.getElementById('barberPhoto').files?.[0],photo=file?await readImage(file):barberEditor.photo;void runServer({action:'barber.save',id:barberEditor.id,revision:barberEditor.revision,name:document.getElementById('barberName').value.trim(),role:document.getElementById('barberRole').value.trim(),photo:photo||'',active:true},'Barbero guardado',()=>closeBarberModal());}catch{operationMessage.textContent='No se pudo procesar la foto.';}return;
 }
 if(form.id==='newClientForm'){
  const name=document.getElementById('newClientName').value.trim(),key=clientKeyFromName(name),barberId=clientOwner.value,id=await window.kuimbaeClientId(barberId,key),existing=managementData?.v2Clients?.find(c=>c.id===id);
  void runServer({action:'client.save',id,revision:rev(existing),barberId,key,name,phone:document.getElementById('newClientPhone').value.trim(),notes:document.getElementById('newClientNotes').value.trim()},'Cliente guardado',()=>clientModal.classList.remove('open'));return;
 }
 if(form.id==='userForm'){submitUser();return;}
 phase2Submit(event);
};
const userPanel=document.createElement('section');userPanel.id='userManager';userPanel.className='settings-card';userPanel.hidden=true;
userPanel.innerHTML='<h2>Usuarios y permisos</h2><p>Cuentas de ensayo. Los permisos se verifican en el servidor.</p><div id="userRows"></div><button id="newUserButton" type="button" class="secondary-btn">Nueva cuenta</button><form id="userForm"><input id="managedUid" type="hidden"><div class="field"><label for="managedName">Nombre</label><input id="managedName" required maxlength="120"></div><div class="field"><label for="managedEmail">Correo de ensayo</label><input id="managedEmail" type="email" autocomplete="off" required></div><div class="field"><label for="managedPassword">Contraseña inicial o nueva</label><input id="managedPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128"></div><div class="field"><label for="managedRole">Rol</label><select id="managedRole"><option value="barber">Barbero</option><option value="admin">Administrador</option></select></div><div class="field"><label for="managedBarber">Vinculado al barbero</label><select id="managedBarber"></select></div><label><input id="managedActive" type="checkbox" checked> Cuenta activa</label><div id="permissionControls"></div><button id="userSave" type="submit" class="primary-btn">Guardar usuario</button><button id="resetUserPassword" type="button" class="secondary-btn">Cambiar contraseña</button></form>';
document.querySelector('#screenSettings .settings-stack').append(userPanel);
const permissionKeys=['manageAppointments','canSell','manageClients','manageServices'];
for(const [key,label] of Object.entries({manageAppointments:'Gestionar sus turnos',canSell:'Vender productos',manageClients:'Gestionar sus clientes',manageServices:'Gestionar sus servicios y precios'})){
 const wrapper=document.createElement('label'),checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.id='permission-'+key;wrapper.append(checkbox,document.createTextNode(' '+label));document.getElementById('permissionControls').append(wrapper,document.createElement('br'));
}
let userEditorRevision=0;
function userBarbers(selected){const select=document.getElementById('managedBarber');select.replaceChildren();for(const b of barbers){const option=document.createElement('option');option.value=b.id;option.textContent=b.name;select.append(option);}select.value=selected||barbers.find(b=>!b.uid)?.id||barbers[0]?.id||'';select.parentElement.hidden=document.getElementById('managedRole').value==='admin';}
document.getElementById('managedRole').onchange=()=>userBarbers(document.getElementById('managedBarber').value);
function editUser(row){
 document.getElementById('userForm').reset();document.getElementById('managedUid').value=row?.id||'';userEditorRevision=rev(row);
 for(const [id,value] of Object.entries({managedName:row?.name||'',managedEmail:row?.email||'',managedRole:row?.role||'barber'}))document.getElementById(id).value=value;
 document.getElementById('managedEmail').disabled=!!row;document.getElementById('managedPassword').required=!row;
 document.getElementById('managedActive').checked=row?.active??true;document.getElementById('managedActive').disabled=!row;
 document.getElementById('resetUserPassword').disabled=!row;
 for(const key of permissionKeys)document.getElementById('permission-'+key).checked=row?.permissions?.[key]??key!=='manageServices';
 userBarbers(row?.barberId);
}
document.getElementById('newUserButton').onclick=()=>editUser(null);
function renderUsers(){
 userPanel.hidden=!admin();const rows=document.getElementById('userRows');rows.replaceChildren();if(!admin())return;
 for(const row of managementData?.users||[]){const button=document.createElement('button');button.type='button';button.className='secondary-btn';button.dataset.userId=row.id;button.textContent=`${row.name||row.email||row.id} · ${row.role} · ${row.active?'activo':'inactivo'}`;button.onclick=()=>editUser(row);rows.append(button);}
 userBarbers(document.getElementById('managedBarber').value);
}
function submitUser(){
 const uid=document.getElementById('managedUid').value,role=document.getElementById('managedRole').value,name=document.getElementById('managedName').value.trim(),barberId=role==='admin'?'':document.getElementById('managedBarber').value;
 const permissions=Object.fromEntries(permissionKeys.map(k=>[k,document.getElementById('permission-'+k).checked]));
 const password=document.getElementById('managedPassword').value;
 const command=uid?{action:'user.update',uid,revision:userEditorRevision,name,role,barberId,active:document.getElementById('managedActive').checked,permissions}:{action:'user.create',name,email:document.getElementById('managedEmail').value.trim(),password,role,barberId,permissions};
 document.getElementById('managedPassword').value='';void runServer(command,uid?'Usuario actualizado':'Usuario creado',result=>{userEditorRevision=result.revision;document.getElementById('managedUid').value=result.uid;document.getElementById('managedEmail').disabled=true;document.getElementById('managedPassword').required=false;document.getElementById('managedActive').disabled=false;document.getElementById('resetUserPassword').disabled=false;});
}
document.getElementById('resetUserPassword').onclick=()=>{const uid=document.getElementById('managedUid').value,password=document.getElementById('managedPassword').value;document.getElementById('managedPassword').value='';if(uid)void runServer({action:'user.password',uid,password},'Contraseña actualizada');};
const phase2Apply=window.kuimbaeView.apply,phase2Clear=window.kuimbaeView.clear;
window.kuimbaeView.apply=function(p,data){
 const before=managementData?.v2Settings?.[0]?.revision;managementData=data;
 settings=normalizeSettings(data.v2Settings?.[0]?.settings||DEFAULT_SETTINGS);clientMeta={};
 const safePhoto=value=>typeof value==='string'&&/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value)?value:'';
 const filtered={...data,v2Barbers:data.v2Barbers.filter(x=>x.active!==false).map(x=>({...x,photo:safePhoto(x.photo)})),v2Services:data.v2Services.filter(x=>x.active!==false),v2Products:data.v2Products.filter(x=>x.active!==false).map(x=>({...x,photo:safePhoto(x.photo)}))};
 phase2Apply(p,filtered);applyBusinessSettings();
 if(document.getElementById('screenSettings').classList.contains('active')&&before!==data.v2Settings?.[0]?.revision&&!document.getElementById('screenSettings').contains(document.activeElement)){settingsEditorRevision=rev(data.v2Settings?.[0]);renderSettings();}
 renderUsers();enforceReadOnly();
};
window.kuimbaeView.clear=function(){document.getElementById('migrationReport').textContent='';document.getElementById('migrationMapping').value=JSON.stringify({barberLinks:{},serviceAssignments:{},productSaleOwners:{},clientOwners:{}});managementData=null;clientDraft=null;serviceEditor=null;productEditor=null;barberEditor=null;settingsEditorRevision=0;document.getElementById('userRows').replaceChildren();userPanel.hidden=true;phase2Clear();editUser(null);settings=normalizeSettings(DEFAULT_SETTINGS);settingsLogoDraft='';applyBusinessSettings();for(const id of ['productSaleInfo','productPhotoBox'])document.getElementById(id)?.replaceChildren();};
enforceReadOnly=function(){
 const isAdmin=admin();
 for(const button of document.querySelectorAll('[onclick],.add-card,.cash-payment')){
  const action=button.getAttribute('onclick')||'';let permit;
  if(/^(openServiceModal|editService|deleteService)/.test(action))permit=allowed('manageServices');
  else if(/^(openProductForm|openProductDelete|confirmDeleteProduct|saveSettingsFromUI|restoreOriginalSettingsLogo|addClosurePeriod|removeClosurePeriod)/.test(action)||button.classList.contains('add-card'))permit=isAdmin;
  else if(/^saveClientNotes/.test(action))permit=allowed('manageClients');
  else if(/^(selectSlot|setAppointmentStatus)/.test(action))permit=allowed('manageAppointments');
  else if(/^openProductSale/.test(action))permit=allowed('canSell');
  else if(button.classList.contains('cash-payment')){const id=/setCashPayment\('([a-zA-Z0-9_-]+)'/.exec(button.getAttribute('onchange')||'')?.[1],entry=cashEntries.find(x=>x.id===id);permit=!!entry&&entry.type!=='reversion'&&!cashEntries.some(x=>x.reverses===id);}
  else if(/^(resetKuimbaeSystem|executeKuimbaeReset|applyRestoreBackup)/.test(action))permit=false;
  else if(action.includes("'restoreBackupInput'"))permit=isAdmin;
  if(action.startsWith('saveSettingsFromUI')&&settingsPhotoPending)permit=false;
  if(permit!==undefined)button.disabled=!permit;
 }
 newClientButton.disabled=!allowed('manageClients');
 if(!isAdmin){document.querySelectorAll('.product-card-cost').forEach(e=>{e.hidden=true;});document.getElementById('productsCostValue')?.parentElement.setAttribute('hidden','');}
 else document.getElementById('productsCostValue')?.parentElement.removeAttribute('hidden');
};
// Snapshots may rerender an open detail; retain its draft and revision until saved.
const syncClientDetail=renderClientDetail;
renderClientDetail=function(){
 if(clientDraft?.key!==currentClientKey){const record=managementData?.v2Clients?.find(c=>c.key===currentClientKey);if(record)barberChoices(notesOwner,record.barberId);}
 syncClientDetail();
};
// Exports are local, scoped to the verified profile, and retain all V2-only data.
exportFullBackup=function(){
 if(!window.kuimbaeProfile||!managementData)return;
 const backup={app:"Kuimba'e Style",version:'3.13-firebase-v2',exportedAt:new Date().toISOString(),data:{barbers,appointments,services,cashEntries,clientMeta,settings:settingsPayload(),products},v2:structuredClone(managementData)};
 downloadBlob(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}),`kuimbae-respaldo-desarrollo-${localISO()}.json`);showToast('Respaldo exportado con datos V2 de esta sesión');
};
const migrationCard=document.createElement('section');migrationCard.className='settings-card';migrationCard.innerHTML='<h2>Migración en seco</h2><p>Auditar un respaldo no importa ni reemplaza datos.</p><label for="migrationMapping">Vínculos y asignaciones JSON revisados</label><textarea id="migrationMapping" rows="5" spellcheck="false">{"barberLinks":{},"serviceAssignments":{},"productSaleOwners":{},"clientOwners":{}}</textarea><p id="migrationReport" role="status" aria-live="polite"></p>';
document.querySelector('#screenSettings .settings-stack').append(migrationCard);
restoreFullBackup=async function(input){const file=input.files?.[0];if(!file||!admin())return;const output=document.getElementById('migrationReport');if(file.size>15*1024*1024){output.textContent='Respaldo demasiado grande.';input.value='';return;}try{const mapping=JSON.parse(document.getElementById('migrationMapping').value),backup=JSON.parse(await file.text());const report=await window.kuimbaePreviewMigration(backup,mapping);output.textContent=JSON.stringify(report);output.scrollIntoView({block:'center'});}catch{output.textContent='No se pudo auditar. Revisá el formato localmente; no se escribió ningún dato.';}finally{input.value='';}};
editUser(null);

const restorePreviewButton=document.querySelector('[onclick="document.getElementById(\'restoreBackupInput\').click()"]');
if(restorePreviewButton)restorePreviewButton.textContent='Auditar respaldo (sin importar)';
