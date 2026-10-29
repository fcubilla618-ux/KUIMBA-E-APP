#!/usr/bin/env node
// Local files only. Never print plans, paths, source fields, or exception messages.
import {readFileSync} from 'node:fs';
import {prepareMigration,simulateMigration} from './phase3-plan.mjs';
try{
 if(!process.argv[2]||!process.argv[3])throw new Error();
 const backup=JSON.parse(readFileSync(process.argv[2],'utf8'));
 const mapping=JSON.parse(readFileSync(process.argv[3],'utf8'));
 const existing=process.argv[4]?JSON.parse(readFileSync(process.argv[4],'utf8')):{};
 const plan=await prepareMigration(backup,mapping),simulation=simulateMigration(plan,existing);
 console.log(JSON.stringify({ok:simulation.ok,dryRun:true,firestoreWrites:0,audit:plan.report,simulation:simulation.report},null,2));
 if(!simulation.ok)process.exitCode=1;
}catch{console.error(JSON.stringify({ok:false,codes:[{code:'LOCAL_INPUT_INVALID',count:1}],firestoreWrites:0}));process.exitCode=2;}
