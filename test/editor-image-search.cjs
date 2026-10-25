// Full editor integration: synthetic search results and model replies, real imported pixels and edits.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),sharp=require('sharp'),{createPSAIMiddleware}=require('../lib/ps-ai-node.cjs');
const root=path.resolve(__dirname,'../source/ps'),output=path.resolve(__dirname,'../work/editor-ai');
let phase='import',round=0,lastState,asset,release,downloadCount=0,searchHeaders=[],imageRequests=[];
const item={murl:'https://images.example.com/red.png',purl:'https://example.com/free-fixture',turl:'https://ts1.mm.bing.net/th?id=fixture',t:'Red fixture'};
const html='<a m="'+JSON.stringify(item).replaceAll('"','&quot;')+'"></a>';
const errors=[],requests=[];
(async()=>{
 const red=await sharp({create:{width:160,height:100,channels:4,background:'#e85c60'}}).png().toBuffer();
 const green=await sharp({create:{width:160,height:100,channels:4,background:'#2b9460'}}).png().toBuffer();
 const middleware=createPSAIMiddleware({images:{cache:new Map(),fetch:async(_url,init)=>{searchHeaders.push(init.headers);return new Response(html,{headers:{'content-type':'text/html'}});},download:async(_url,signal)=>{downloadCount++;if(['hold','stale'].includes(phase))await new Promise((resolve,reject)=>{release=resolve;signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});return red;}}});
 const mime={'.html':'text/html;charset=utf-8','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.wasm':'application/wasm'};
 const server=http.createServer((req,res)=>middleware(req,res,async()=>{try{let file=path.resolve(root,'.'+(new URL(req.url,'http://localhost').pathname==='/'?'/index.html':new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep))throw Error('path');let bytes=await fs.readFile(file);if(file.endsWith('pp1753360222.js'))bytes=Buffer.from(bytes.toString().replace('OnlinePS.install({','OnlinePS.install(window.debugNative={').replace('OnlinePS.start(senkouApp)','window.debugApp=senkouApp;OnlinePS.start(senkouApp)'));res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(bytes);}catch{res.writeHead(404).end();}}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));await fs.mkdir(output,{recursive:true});const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:960},locale:'zh-CN'});
  await context.route('https://assistant.test/**',async route=>{
   const req=route.request(),body=req.postDataJSON();requests.push(body);
   if(!body.tools){imageRequests.push(body);return route.fulfill({json:{data:[{b64_json:green.toString('base64')}]}});}
   assert(body.tools.some(t=>t.function.name==='search_images'));assert(body.tools.some(t=>t.function.name==='import_image'));
   for(const m of body.messages)if(m.role==='tool'){const result=JSON.parse(m.content);if(result.results?.length)asset=result.results[0].asset_id;if(result.state)lastState=result.state;}
   const fn=(name,args)=>({id:'call-'+round+'-'+name,type:'function',function:{name,arguments:JSON.stringify(args)}});let calls,content=null;
   if(round===0)calls=[fn('get_document',{}),fn('search_images',{query:'红色测试风景',limit:3})];
   if(round===1){calls=[];if(phase==='mask')calls.push(fn('select_polygon',{points:[{x:10,y:10},{x:90,y:10},{x:10,y:90}]}));calls.push(fn('import_image',{asset_id:asset,name:'网上素材'}));}
   if(round===2){if(phase==='import')calls=[fn('adjust_layer',{layer_id:lastState.layers.find(l=>l.source).id,effect:'desaturate'})];else if(phase==='handoff')calls=[fn('generate_image',{mode:'edit',prompt:'Make this imported scene green'})];else content='图片已导入。来源：https://example.com/free-fixture';}
   if(round>=3)content='图片已导入并完成编辑。来源：https://example.com/free-fixture';round++;
   await route.fulfill({json:{choices:[{message:{role:'assistant',content,...(calls?{tool_calls:calls}:{})}}]}});
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
  await page.goto(origin,{waitUntil:'networkidle'});await page.waitForFunction(()=>document.body.classList.contains('ui-ready'));
  await page.evaluate(()=>{localStorage.setItem('senkou.image-ai.v1',JSON.stringify({active:'control',assistant:'control',image:'control',profiles:[{id:'control',name:'Test',type:'chat',url:'https://assistant.test/v1',model:'test-model',key:'synthetic-private-key',remember:true}]}));});await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>document.body.classList.contains('ui-ready'));await page.evaluate(()=>OnlinePS.ai.open('assistant'));
  async function run(task){round=0;await page.locator('#ai-task').fill(task);await page.getByRole('button',{name:'发送',exact:true}).click();assert.equal(await page.locator('#ai-task').inputValue(),'');}
  const complete=()=>page.locator('.ai-status').filter({hasText:'已完成，可在画布查看结果'}).waitFor({timeout:30000});
  const pixels=async()=>{const png=Buffer.from(await page.evaluate(()=>Array.from(new Uint8Array(OnlinePS.ai.native.png(debugApp,debugApp.xK())))));return sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});};
  await run('上网找一张图片导入，变成灰色');await complete();assert.deepEqual(await page.evaluate(()=>[debugApp.xK().r,debugApp.xK().B]),[160,100]);
  let picture=await pixels(),pixel=[...picture.data.subarray(0,3)];assert.equal(pixel[0],pixel[1]);assert.equal(pixel[1],pixel[2]);assert(pixel[0]<240,'Actual imported pixels must be edited');assert(lastState.layers.some(l=>l.source?.page===item.purl));assert((await page.locator('.assistant-log').innerText()).includes('来源：'+item.purl));
  await page.locator('.ai-close').click();await page.keyboard.press('Control+z');await page.waitForTimeout(80);picture=await pixels();assert(picture.data[0]>picture.data[1]+50,'Undo restores the downloaded color');await page.keyboard.press('Control+z');await page.waitForTimeout(80);assert(!(await page.evaluate(()=>debugApp.xK().U.some(l=>l.getName()==='网上素材'))),'A single undo removes the imported layer');
  await page.evaluate(()=>debugNative.AI.script(debugApp,'app.documents.add(200,120,72,"Masked import",null,0)'));await page.evaluate(()=>OnlinePS.ai.open('assistant'));phase='mask';await run('把搜到的图片填入三角形选区');await complete();picture=await pixels();const at=(x,y)=>[...picture.data.subarray((y*200+x)*4,(y*200+x)*4+3)];assert(at(20,20)[0]>at(20,20)[1]+50);assert.deepEqual(at(80,80),[255,255,255],'Real polygon mask preserves pixels outside the selection');assert.deepEqual(at(150,100),[255,255,255]);
  await page.evaluate(()=>debugNative.AI.script(debugApp,'app.activeDocument.selection.deselect()'));phase='handoff';await run('导入网络图片，再调用图像 AI 改成绿色');await complete();assert.equal(imageRequests.length,1);picture=await pixels();assert(picture.data[1]>picture.data[0],'Image AI edits the canvas containing the imported source');
  for(const state of ['hold','stale']){
   phase=state;release=null;const before=await page.evaluate(()=>debugApp.xK().U.length);await run('下载并导入一张素材');
   for(let attempt=0;!release&&attempt<200;attempt++)await page.waitForTimeout(10);assert(release,'Download should be waiting');
   if(state==='hold'){await page.getByRole('button',{name:'停止',exact:true}).click();release();await page.locator('.ai-status').filter({hasText:'已停止等待'}).waitFor();await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>debugApp.xK().U.length),before);}
   else{await page.evaluate(()=>debugNative.AI.script(debugApp,'app.documents.add(100,60,72,"New target",null,0)'));release();await page.locator('.ai-status').filter({hasText:'画布已在助手之外被修改或切换'}).waitFor();assert.equal(await page.evaluate(()=>debugApp.xK().U.length),1);}
  }
  assert(downloadCount>=5);assert(searchHeaders.every(h=>!new Headers(h).has('authorization')));assert(requests.every(r=>!JSON.stringify(r).includes('synthetic-private-key')));assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(output,'image-search-editor-20261024.png')});console.log('Editor image search passed: search -> download -> real layer -> adjustment and undo, polygon mask, image-AI handoff, cancellation and stale-document rejection, provenance, no extra UI or leaked platform credentials. Model and search responses mocked.');
 }finally{if(release)release();await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
