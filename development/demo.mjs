import {seed} from './seed.mjs';
// Only synthetic emulator credentials, generated at runtime and never persisted.
const {credentials,env}=await seed();
console.log('CUENTAS FICTICIAS: válidas únicamente en los emuladores locales de ensayo.');
for(const {email,password} of credentials)console.log(`${email}  ${password}`);
await env.cleanup();
