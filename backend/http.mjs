import {OperationError,reject} from './validation.mjs';
const ORIGINS=new Set(['http://127.0.0.1:4173','http://localhost:4173']);
export function createApiHandler({auth,execute}){
 return async function handle(req,res){
  const respond=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
  try{
   if(req.method!=='POST')reject('method-not-allowed','Método no permitido.',405);
   if(!ORIGINS.has(req.headers.origin))reject('forbidden-origin','Origen no permitido.',403);
   if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))reject('unsupported-media-type','Se requiere JSON.',415);
   const token=/^Bearer ([^\s]{1,8192})$/.exec(req.headers.authorization||'')?.[1];
   let identity;
   try{if(!token)throw Error();identity=await auth.verifyIdToken(token,true);}catch{reject('unauthenticated','Volvé a iniciar sesión.',401);}
   const chunks=[];let size=0;
   for await(const chunk of req){size+=chunk.length;if(size>524288)reject('body-too-large','Solicitud demasiado grande.',413);chunks.push(chunk);}
   let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{reject('invalid-json','JSON inválido.');}
   const result=await execute(identity.uid,input);respond(200,{result});
  }catch(error){
   if(error instanceof OperationError)respond(error.status,{error:{code:error.code,message:error.message}});
   else respond(503,{error:{code:'unavailable',message:'No se pudo confirmar la operación. Reintentá con la misma clave.'}});
  }
 };
}
