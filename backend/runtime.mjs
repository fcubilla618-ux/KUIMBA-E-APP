import {initializeApp,getApps} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {PROJECT} from '../development/access.mjs';
export function assertEmulatorEnvironment(env){
 for(const [key,expected] of Object.entries({FIRESTORE_EMULATOR_HOST:'127.0.0.1:18080',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:19099',GCLOUD_PROJECT:PROJECT,GOOGLE_CLOUD_PROJECT:PROJECT})){
  if(env[key]&&env[key]!==expected)throw Error('Servidor exclusivo de emuladores: configuración incompatible.');
 }
}
assertEmulatorEnvironment(process.env);
// Emulator-only process: never probe cloud metadata for credentials.
process.env.METADATA_SERVER_DETECTION='none';
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:18080';
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:19099';
const app=getApps().find(x=>x.name==='kuimbae-emulator-server')||initializeApp({projectId:PROJECT},'kuimbae-emulator-server');
export const database=getFirestore(app);
export const auth=getAuth(app);
