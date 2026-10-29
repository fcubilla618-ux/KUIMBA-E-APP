import {businessTime} from '../development/business-time.mjs';
import {test,expect} from '@playwright/test';
import {doc,setDoc,updateDoc,deleteDoc} from 'firebase/firestore';
import {seed} from '../development/seed.mjs';
let fixture;
test.beforeAll(async()=>{fixture=await seed();});
test.afterAll(async()=>fixture?.env.cleanup());
async function login(page,name){
 const account=fixture.credentials.find(x=>x.email.startsWith(name+'@'));
 await page.goto('/');await page.locator('#firebase-email').fill(account.email);await page.locator('#firebase-password').fill(account.password);await page.locator('#firebase-login button').click();
 await expect(page.locator('#firebase-status')).toHaveText('Sincronizado · servidor de ensayo');
 // Synthetic shop is open every day so this operation suite is date-independent.
 await page.evaluate(()=>{settings.openDays=[0,1,2,3,4,5,6];});
}
test('original UI, scoped agenda/cash and realtime across two devices; logout clears DOM',async({page,browser},info)=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>localStorage.setItem('kuimbae_style_cash_v1',JSON.stringify([{id:'private-local',client:'LOCAL SECRET'}])));
 await login(page,'walter');
 await expect(page.locator('#barbersGrid')).toContainText('test-walter');await expect(page.locator('#barbersGrid')).not.toContainText('test-dani');
 await page.evaluate(()=>{openAgenda('test-walter');selectDate(localISO());});
 expect((await page.locator('.topbar').boundingBox()).y).toBeLessThan(250);
 await expect(page.locator('#appointmentsList')).toContainText('Cliente ficticio test-walter');
 await page.evaluate(()=>openCashDetail('test-walter'));
 await expect(page.locator('#cashTotal')).toContainText('100');
 const context=await browser.newContext();const second=await context.newPage();await login(second,'walter');await second.evaluate(()=>{openAgenda('test-walter');selectDate(localISO());});await page.evaluate(()=>{openAgenda('test-walter');selectDate(localISO());});
 await fixture.env.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),'shops/kuimbae-style/v2Appointments/realtime-test'),{id:'realtime-test',barberId:'test-walter',client:'Turno ficticio nuevo',date:businessTime().date,time:'11:00',duration:60,service:'Ensayo',price:100,status:'pendiente'});});
 for(const device of [page,second]){await expect(device.locator('#appointmentsList')).toContainText('Turno ficticio nuevo');await expect(device.locator('#appointmentsList .appointment')).toHaveCount(2);}
 await page.screenshot({path:`artifacts/${info.project.name}-agenda.png`,fullPage:true});
 await page.evaluate(()=>{openClients();openClientDetail(clientKeyFromName('Turno ficticio nuevo'));});
 await expect(page.locator('#clientHistoryList')).toContainText('Ensayo');
 await fixture.env.withSecurityRulesDisabled(async c=>{await updateDoc(doc(c.firestore(),'shops/kuimbae-style/v2Appointments/realtime-test'),{service:'Servicio actualizado'});});
 await expect(page.locator('#clientHistoryList')).toContainText('Servicio actualizado');
 await fixture.env.withSecurityRulesDisabled(async c=>{await deleteDoc(doc(c.firestore(),'shops/kuimbae-style/v2Appointments/realtime-test'));});
 await expect(page.locator('#clientDetailHead')).toContainText('Cliente no encontrado');
 await expect(page.locator('#clientHistoryList')).toBeEmpty();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('#firebase-logout').click();await expect(page.locator('body > .app')).toBeHidden();
 await expect(page.locator('#appointmentsList')).toBeEmpty();
 await expect(page.locator('#clientDetailHead')).toBeEmpty();
 expect(await page.evaluate(()=>localStorage.getItem('kuimbae_style_cash_v1'))).toContain('LOCAL SECRET');
 expect(errors).toEqual([]);await context.close();
});
test('admin general cash, denied/empty states, offline and profile revocation',async({page},info)=>{
 await login(page,'admin');await page.evaluate(()=>openCashDetail('general'));await expect(page.locator('#cashTotal')).toContainText('300');
 await page.screenshot({path:`artifacts/${info.project.name}-cash.png`,fullPage:true});
 await page.locator('#firebase-logout').click();await login(page,'dani');
 await page.context().setOffline(true);await expect(page.locator('body > .app')).toBeHidden();await page.context().setOffline(false);
 await expect(page.locator('#firebase-status')).toHaveText('Sincronizado · servidor de ensayo');
 await fixture.env.withSecurityRulesDisabled(async c=>{for(const kind of ['v2Appointments','v2Cash'])await deleteDoc(doc(c.firestore(),`shops/kuimbae-style/${kind}/test-dani`));});
 await expect(page.locator('#firebase-status')).toContainText('Sin registros');
 const a=fixture.credentials.find(x=>x.email.startsWith('dani@'));
 await fixture.env.withSecurityRulesDisabled(async c=>{await updateDoc(doc(c.firestore(),'users',a.uid),{active:false});});
 await expect(page.locator('#firebase-status')).toContainText('Error de permisos o perfil');await expect(page.locator('body > .app')).toBeHidden();
});
test('phase 2: admin and three barbers book, edit, cancel, complete and sell through server',async({page},info)=>{
 await fixture.env.cleanup();fixture=await seed();
 await fixture.env.withSecurityRulesDisabled(async c=>{await updateDoc(doc(c.firestore(),'shops/kuimbae-style/v2Products/test-product'),{stock:4});});
 page.on('dialog',dialog=>dialog.accept());
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 for(const who of ['admin','walter','dani','junior']){
  const barber=who==='admin'?'walter':who,slot=who==='walter'?'20:00':'18:00',moved=who==='walter'?'21:00':'19:00';
  await login(page,who);
  await page.evaluate(({b,t})=>{openAgenda(`test-${b}`);selectDate(localISO());selectSlot(t);},{b:barber,t:slot});
  await page.locator('#clientInput').fill(`Ensayo ${who}`);await page.locator('#serviceInput').selectOption(`test-${barber}`);
  await page.locator('#appointmentForm button[type=submit]').click();
  await expect(page.locator('#operation-message')).toHaveText('Turno guardado');
  let card=page.locator('.appointment').filter({hasText:`Ensayo ${who}`});await expect(card).toHaveCount(1);
  await card.locator('.firebase-edit').click();await page.locator('#timeInput').fill(moved);
  await page.locator('#appointmentForm button[type=submit]').click();await expect(page.locator('#operation-message')).toHaveText('Turno actualizado');
  await expect(card).toContainText(moved);await card.getByRole('button',{name:'Cancelar',exact:true}).click();await expect(page.locator('#operation-message')).toHaveText('Turno cancelado');
  await page.evaluate(t=>selectSlot(t),slot);await page.locator('#clientInput').fill(`Cobro ${who}`);await page.locator('#serviceInput').selectOption(`test-${barber}`);await page.locator('#appointmentForm button[type=submit]').click();
  await expect(page.locator('#operation-message')).toHaveText('Turno guardado');
  card=page.locator('.appointment').filter({hasText:`Cobro ${who}`});await card.getByRole('button',{name:'Atendido'}).click();await expect(page.locator('#operation-message')).toHaveText('Servicio cobrado');
  await page.evaluate(()=>openProducts());await page.locator('.product-card').getByRole('button',{name:'Vender',exact:true}).click();
  if(who==='admin')await page.locator('#saleBarberSelect').selectOption('test-walter');
  await page.locator('#productConfirmSaleBtn').click();await expect(page.locator('#operation-message')).toHaveText('Venta registrada en caja individual');
  await page.locator('#firebase-logout').click();
 }
 await login(page,'admin');await page.evaluate(()=>openCashDetail('general'));await expect(page.locator('#cashTotal')).toContainText('780');
 await page.screenshot({path:`artifacts/${info.project.name}-phase2-cash.png`,fullPage:true});expect(errors).toEqual([]);
});
test('lost HTTP confirmation can be retried after the snapshot changed status and stock',async({page})=>{
 await fixture.env.cleanup();fixture=await seed();page.on('dialog',dialog=>dialog.accept());
 await login(page,'walter');await page.evaluate(()=>{openAgenda('test-walter');selectDate(localISO());});
 const loseResponse=async route=>{await route.fetch();await route.abort('failed');};
 await page.route('**/api/v2/operations',loseResponse);
 await page.locator('.appointment').getByRole('button',{name:'Atendido'}).click();
 await expect(page.locator('#operation-retry')).toBeVisible();await expect(page.locator('.appointment')).toContainText('ATENDIDO');
 await page.unroute('**/api/v2/operations',loseResponse);await page.locator('#operation-retry').click();await expect(page.locator('#operation-message')).toHaveText('Servicio cobrado');
 await page.locator('.appointment').getByRole('button',{name:'Cancelar',exact:true}).click();await expect(page.locator('#operation-message')).toHaveText('Turno cancelado');
 await page.evaluate(()=>openProducts());await page.locator('.product-card').getByRole('button',{name:'Vender',exact:true}).click();
 await page.route('**/api/v2/operations',loseResponse);await page.locator('#productConfirmSaleBtn').click();await expect(page.locator('#operation-retry')).toBeVisible();
 await page.unroute('**/api/v2/operations',loseResponse);await page.locator('#operation-retry').click();await expect(page.locator('#operation-message')).toHaveText('Venta registrada en caja individual');
 await page.evaluate(()=>openCashDetail('test-walter'));await expect(page.locator('#cashTotal')).toContainText('120');
});
