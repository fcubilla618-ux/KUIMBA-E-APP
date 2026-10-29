import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import './build.mjs';
import {auth,database} from '../backend/runtime.mjs';
import {createOperations} from '../backend/operations.mjs';
import {createApiHandler} from '../backend/http.mjs';
const api=createApiHandler({auth,execute:createOperations(database)});
const root=fileURLToPath(new URL('../',import.meta.url));
const bridge=await readFile(join(root,'development/bridge.js'),'utf8')+'\n'+await readFile(join(root,'development/operations-bridge.js'),'utf8');
const source=await readFile(join(root,'index.html'),'utf8');
// Transform only the served development copy. Fail if the original shape changes.
const transforms=[
 ['function loadData(key,fallback){','function loadData(key,fallback){return structuredClone(fallback);'],
 ['function saveData(key,value){','function saveData(key,value){throw Error("Escrituras bloqueadas en desarrollo");'],
 ['function commitStorageChanges(changes){','function commitStorageChanges(changes){return false;'],
 ['function syncCashFromAttendedAppointments(){','function syncCashFromAttendedAppointments(){return;'],
 ["if ('serviceWorker' in navigator", "if (false && 'serviceWorker' in navigator"]
];
let html=source;
for(const [before,after] of transforms){if(!html.includes(before))throw Error('Cambió la aplicación original: revisar adaptador '+before);html=html.replace(before,after);}
html=html.replace('</head>','<style>html:not(.firebase-ready) body>.app{display:none}#firebase-session .firebase-panel{width:min(100%,760px);margin:auto;padding:12px 16px}#operation-message{width:min(100%,760px);margin:0 auto;padding:0 16px 12px}#firebase-session input{max-width:100%;padding:10px;margin:6px 0}#firebase-session label{display:block}body{overflow-wrap:anywhere}</style></head>');
html=html.replace('</body>',`<script>${bridge}</script><script type="module" src="/development/generated/client.js"></script></body>`);
const assets=new Set(['manifest.webmanifest','logo.png','logo-original.jpg','icon-32.png','icon-64.png','icon-192.png','icon-512.png','icon-maskable-512.png','apple-touch-icon.png','development/generated/client.js']);
createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  // Bound CSP restricts Firebase transports to our emulator ports.
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' http://127.0.0.1:18080 http://127.0.0.1:19099; worker-src 'none'; frame-ancestors 'none'; form-action 'self'");
  const path=new URL(req.url,'http://localhost').pathname.slice(1);
  if(!['127.0.0.1:4173','localhost:4173'].includes(req.headers.host)){res.writeHead(403).end();return;}
  if(path==='api/v2/operations'){await api(req,res);return;}
  if(req.method!=='GET'){res.writeHead(405).end();return;}
  if(!path||path==='index.html'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
  if(!assets.has(path)){res.writeHead(404).end();return;}
  try{res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.png')?'image/png':path.endsWith('.jpg')?'image/jpeg':'application/manifest+json');res.end(await readFile(join(root,path)));}catch{res.writeHead(404).end();}
}).listen(4173,'127.0.0.1',()=>console.log('Desarrollo original: http://127.0.0.1:4173 (solo emuladores)'));
