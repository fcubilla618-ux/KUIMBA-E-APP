import {readFile} from 'node:fs/promises';
import {audit} from './audit.mjs';
try{
 if(process.argv.length!==4)throw Error();
 const [backup,links]=await Promise.all(process.argv.slice(2).map(path=>readFile(path,'utf8').then(JSON.parse)));
 const result=audit(backup,links);console.log(JSON.stringify(result,null,2));process.exitCode=result.ready?0:1;
}catch{console.error('Uso: node development/audit-cli.mjs respaldo-local.json vinculos-locales.json. Revisar formato; no se escribió ningún dato.');process.exitCode=2;}
