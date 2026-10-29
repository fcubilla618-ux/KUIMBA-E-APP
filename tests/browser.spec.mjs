import {test,expect} from '@playwright/test';
import {doc,setDoc,updateDoc,deleteDoc} from 'firebase/firestore';
import {seed} from '../development/seed.mjs';
let fixture;
test.beforeAll(async()=>{fixture=await seed();});
test.afterAll(async()=>fixture?.env.cleanup());
async function login(page,name){
 const account=fixture.credentials.find(x=>x.email.startsWith(name+'@'));
 await page.goto('/');await page.locator('#firebase-email').fill(account.email);await page.locator('#firebase-password').fill(account.password);await page.locator('#firebase-login button').click();
 await expect(page.locator('#firebase-status')).toHaveText('Sincronizado · solo lectura');
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
 await fixture.env.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),'shops/kuimbae-style/v2Appointments/realtime-test'),{id:'realtime-test',barberId:'test-walter',client:'Turno ficticio nuevo',date:new Date().toISOString().slice(0,10),time:'11:00',duration:60,service:'Ensayo',price:100,status:'pendiente'});});
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
 await expect(page.locator('#firebase-status')).toHaveText('Sincronizado · solo lectura');
 await fixture.env.withSecurityRulesDisabled(async c=>{for(const kind of ['v2Appointments','v2Cash'])await deleteDoc(doc(c.firestore(),`shops/kuimbae-style/${kind}/test-dani`));});
 await expect(page.locator('#firebase-status')).toContainText('Sin registros');
 const a=fixture.credentials.find(x=>x.email.startsWith('dani@'));
 await fixture.env.withSecurityRulesDisabled(async c=>{await updateDoc(doc(c.firestore(),'users',a.uid),{active:false});});
 await expect(page.locator('#firebase-status')).toContainText('Error de permisos o perfil');await expect(page.locator('body > .app')).toBeHidden();
});
