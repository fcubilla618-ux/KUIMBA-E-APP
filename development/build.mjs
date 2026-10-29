import {build} from 'esbuild';
await build({entryPoints:['development/client.mjs'],outfile:'development/generated/client.js',bundle:true,format:'esm',platform:'browser'});
