import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const host='127.0.0.1', port=Number(process.env.PORT||4173);
const ollama=new URL(process.env.OLLAMA_URL||'http://127.0.0.1:11435');
if (ollama.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(ollama.hostname))throw Error('OLLAMA_URL deve apontar para um endereço HTTP local');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.md':'text/markdown; charset=utf-8','.svg':'image/svg+xml'};
const respond=(res,status,body,contentType='application/json; charset=utf-8')=>{res.writeHead(status,{'Content-Type':contentType,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body);};
async function readBody(req,limit=15000){let value='';for await(const chunk of req){value+=chunk;if(value.length>limit)throw Error('Requisição acima de 15 KB');}return JSON.parse(value);}
let active=0;
const server=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://127.0.0.1');
  if(u.pathname==='/api/ollama'){
   if(req.method!=='POST')return respond(res,405,JSON.stringify({error:'Use POST'}));
   if(active>=2)return respond(res,429,JSON.stringify({error:'Ollama ocupado. Tente novamente.'}));
   const body=await readBody(req);
   const model=String(body.model||'lfm3');
   if(!/^[a-zA-Z0-9_./:@-]{1,96}$/.test(model))return respond(res,400,JSON.stringify({error:'Nome de modelo inválido'}));
   if(!Array.isArray(body.messages)||body.messages.length>5)return respond(res,400,JSON.stringify({error:'Mensagens inválidas'}));
   const messages=body.messages.map(m=>({role:m.role==='system'?'system':'user',content:String(m.content||'').slice(0,4800)}));
   active++;
   try{
    const response=await fetch(new URL('/api/chat',ollama),{
     method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(16000),
     body:JSON.stringify({model,messages,stream:false,format:'json',options:{temperature:Math.max(0,Math.min(Number(body.options?.temperature)||0,.9)),num_predict:Math.min(160,Math.max(16,Number(body.options?.num_predict)||64)),num_ctx:2048}})
    });
    const text=await response.text();
    respond(res,response.ok?200:502,text.slice(0,15000));
   }catch(error){respond(res,502,JSON.stringify({error:'Ollama indisponível',detail:String(error.message).slice(0,120)}));}
   finally{active--;}
   return;
  }
  if(req.method!=='GET'&&req.method!=='HEAD')return respond(res,405,'Método não permitido','text/plain');
  let pathname=decodeURIComponent(u.pathname);
  if(pathname==='/')pathname='/demo/index.html';
  if(pathname==='/demo/')pathname='/demo/index.html';
  const file=path.resolve(root,'.'+pathname);
  if(file!==root && !file.startsWith(root+path.sep))return respond(res,403,'Proibido','text/plain');
  if(!['.html','.css','.js','.json','.md','.svg'].includes(path.extname(file)))return respond(res,404,'Não encontrado','text/plain');
  const data=await fs.readFile(file);
  res.writeHead(200,{'Content-Type':mime[path.extname(file)],'Content-Length':data.length,'X-Content-Type-Options':'nosniff'});
  res.end(req.method==='HEAD'?undefined:data);
 }catch(error){respond(res,error.code==='ENOENT'?404:400,JSON.stringify({error:String(error.message)}));}
});
server.listen(port,host,()=>{console.log(`\nWorldAI → http://${host}:${port}/\nOllama local → ${ollama}\nCtrl+C para encerrar\n`);});
