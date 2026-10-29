import {initializeApp} from 'firebase/app';
import {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInWithEmailAndPassword,signOut,onIdTokenChanged} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,onSnapshot,collection,query,where} from 'firebase/firestore';
import {PROJECT,ROOT,scope} from './access.mjs';
import {createSession} from './session.mjs';
if(!['localhost','127.0.0.1'].includes(location.hostname))throw Error('Sólo emuladores locales');
const app=initializeApp({projectId:PROJECT,apiKey:'demo-only',authDomain:'localhost'});
const auth=initializeAuth(app,{persistence:inMemoryPersistence});
connectAuthEmulator(auth,'http://127.0.0.1:19099',{disableWarnings:true});
const db=getFirestore(app);connectFirestoreEmulator(db,'127.0.0.1',18080);
const shell=document.createElement('section');shell.id='firebase-session';
shell.innerHTML=`<div class="firebase-panel"><p>Desarrollo · datos de ensayo · solo lectura</p><form id="firebase-login"><label>Correo <input id="firebase-email" type="email" autocomplete="username" required></label> <label>Contraseña <input id="firebase-password" type="password" autocomplete="current-password" required></label> <button class="primary-btn">Ingresar</button></form><button id="firebase-logout" class="secondary-btn" hidden>Cerrar sesión</button><p id="firebase-status" role="status" aria-live="polite">Iniciando…</p></div>`;
document.body.prepend(shell);
const main=document.querySelector('body > .app');
const status=document.getElementById('firebase-status');
let currentUid=null;
const source={
  watchProfile(uid,ok,fail){let confirmed=false;const timer=setTimeout(()=>fail({code:'unavailable'}),8000);const stop=onSnapshot(doc(db,'users',uid),{includeMetadataChanges:true},snap=>{if(snap.metadata.fromCache){if(confirmed)fail({code:'unavailable'});return;}confirmed=true;clearTimeout(timer);ok(snap.exists()?snap.data():null);},fail);return ()=>{clearTimeout(timer);stop();};},
  watchRows(p,name,ok,fail){if(name==='v2Barbers'&&p.role==='barber')return onSnapshot(doc(db,ROOT,name,p.barberId),{includeMetadataChanges:true},snap=>{if(!snap.metadata.fromCache)ok(snap.exists()?[{...snap.data(),id:snap.id}]:[]);},fail);const filter=scope(p,name),ref=collection(db,ROOT,name);return onSnapshot(filter?query(ref,where(...filter)):query(ref),{includeMetadataChanges:true},snap=>{if(!snap.metadata.fromCache)ok(snap.docs.map(d=>({...d.data(),id:d.id})));},fail);}
};
const session=createSession(source,state=>{
  const ready=!!state.data;
  main.hidden=!ready;main.inert=!ready;
  document.documentElement.classList.toggle('firebase-ready',ready);
  document.getElementById('firebase-login').hidden=!!currentUid;
  document.getElementById('firebase-logout').hidden=!currentUid;
  status.textContent=({loading:'Cargando registros del servidor…','signed-out':'Ingresá con tu cuenta de ensayo.',empty:'Sin registros de turnos o caja. No se importó ningún respaldo.',ready:'Sincronizado · solo lectura',error:state.code==='unavailable'?'Sin conexión. Datos ocultos; reconectá la sesión.':'Error de permisos o perfil. No se importó ningún dato.'})[state.status];
  if(ready)window.kuimbaeView.apply(state.profile,state.data);else{window.kuimbaeView.clear();window.kuimbaeProfile=null;}
});
onIdTokenChanged(auth,user=>{currentUid=user?.uid||null;session.login(currentUid);},()=>{currentUid=null;session.close();});
document.getElementById('firebase-login').addEventListener('submit',async event=>{
  event.preventDefault();try{await signInWithEmailAndPassword(auth,document.getElementById('firebase-email').value,document.getElementById('firebase-password').value);}catch{status.textContent='No se pudo iniciar sesión. Revisá la cuenta y la conexión.';}finally{document.getElementById('firebase-password').value='';}
});
document.getElementById('firebase-logout').onclick=async()=>{session.close();await signOut(auth);};
window.addEventListener('offline',()=>{session.close();status.textContent='Sin conexión. Datos ocultos.';});
window.addEventListener('online',()=>session.login(currentUid));
// Original forms must never change local state pretending to sync.
document.addEventListener('submit',event=>{if(event.target.id!=='firebase-login'){event.preventDefault();event.stopImmediatePropagation();status.textContent='Escrituras bloqueadas hasta disponer de validación del servidor.';}},true);
