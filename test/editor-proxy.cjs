// Browser -> same-origin local adapter -> mock upstream. No real keys or paid requests.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),sharp=require('sharp'),{createPSAIMiddleware}=require('../lib/ps-ai-node.cjs');
const root=path.resolve(__dirname,'../source/ps'),output=path.resolve(__dirname,'../work/editor-ai');
const mime={'.html':'text/html;charset=utf-8','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.wasm':'application/wasm'};
(async()=>{
 await fs.mkdir(output,{recursive:true});const fixture=await sharp({create:{width:64,height:48,channels:4,background:'#9bd8bc'}}).png().toBuffer();
 const requests=[],direct=[],errors=[];let phase='generate',round=0;
 const relay=createPSAIMiddleware({env:{},fetch:async(url,init)=>{
  requests.push({url,method:init.method,headers:Object.fromEntries(init.headers),body:Buffer.from(init.body||[])});
  if(url.endsWith('/models'))return Response.json({data:[{id:'control-model'},{id:'image-model'}]});
  assert.equal(init.headers.get('authorization'),'Bearer dummy-relay-key');
  if(url.endsWith('/chat/completions')){
   const body=JSON.parse(Buffer.from(init.body).toString());assert.equal(body.model,'control-model');
   let message={role:'assistant',content:'已完成图像任务。'};
   if(round++===0){const calls=[];if(phase==='generate')calls.push({id:'create',type:'function',function:{name:'create_document',arguments:JSON.stringify({width:64,height:48,name:'Relay fixture',background:'white'})}});calls.push({id:'generate-'+phase,type:'function',function:{name:'generate_image',arguments:JSON.stringify({mode:'generate',prompt:'A green fixture.'})}});message={role:'assistant',content:null,tool_calls:calls};}
   return Response.json({choices:[{message}]});
  }
  assert.equal(url,'https://openaiapi.cc/v1/images/'+(phase==='reference'?'edits':'generations'));
  if(phase==='reference'){
   const form=await new Request(url,{method:'POST',headers:init.headers,body:init.body}).formData();
   assert.equal(form.get('model'),'image-model');const image=form.get('image');assert(image,'reference must reach image provider');assert.equal((await sharp(Buffer.from(await image.arrayBuffer())).metadata()).format,'png');
  }else assert.equal(JSON.parse(Buffer.from(init.body).toString()).model,'image-model');
  return Response.json({data:[{b64_json:fixture.toString('base64')}]});
 }});
 const server=http.createServer((req,res)=>relay(req,res,async()=>{try{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(root+path.sep))throw Error('path');
  let data=await fs.readFile(file);if(file.endsWith('pp1753360222.js'))data=Buffer.from(data.toString().replace('OnlinePS.install({','OnlinePS.install(window.debugNative={').replace('OnlinePS.start(senkouApp)','window.debugApp=senkouApp;OnlinePS.start(senkouApp)'));
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(data);
 }catch{res.writeHead(404).end();}}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:960},locale:'zh-CN'});
  await context.route('**/*',async route=>{
   if(route.request().url().startsWith(origin))return route.continue();
   if(route.request().url()==='https://openaiapi.cc/v1/models'){direct.push(route.request().url());return route.fulfill({headers:{'access-control-allow-origin':'*'},json:{data:[{id:'control-model'}]}});}
   return route.abort();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());page.setDefaultTimeout(15000);
  await page.goto(origin);await page.waitForFunction(()=>document.body.classList.contains('ui-ready')&&window.OnlinePS?.ai);await page.evaluate(()=>OnlinePS.ai.open('settings'));
  const status=page.locator('#workspace-ai .ai-status');
  await page.locator('#ai-protocol').selectOption('chat');await page.locator('#ai-name').fill('Control');await page.locator('#ai-endpoint').fill('https://openaiapi.cc/v1');await page.locator('#ai-model').fill('control-model');await page.locator('#ai-key').fill('dummy-relay-key');
  assert.equal(await page.locator('#ai-proxy').isChecked(),false,'new and legacy configurations default to direct connection');
  await page.getByRole('button',{name:'测试连接',exact:true}).click();await status.filter({hasText:'连接成功'}).waitFor();assert.equal(direct.length,1);assert.equal(requests.length,0);
  await page.locator('#ai-proxy').check();await page.getByRole('button',{name:'测试连接',exact:true}).click();await status.filter({hasText:'连接成功'}).waitFor();assert.equal(requests.length,1);assert.equal(requests[0].url,'https://openaiapi.cc/v1/models');
  await page.getByRole('button',{name:'保存并使用',exact:true}).click();await status.filter({hasText:'已保存'}).waitFor();assert(await page.locator('#ai-proxy').isChecked());
  const controlId=await page.locator('#ai-profile').inputValue();
  await page.getByRole('button',{name:'＋ 新增平台配置',exact:true}).click();assert.equal(await page.locator('#ai-proxy').isChecked(),false);
  await page.locator('#ai-name').fill('Image');await page.locator('#ai-model').fill('image-model');await page.locator('#ai-endpoint').fill('https://openaiapi.cc/v1');await page.locator('#ai-key').fill('dummy-relay-key');await page.locator('#ai-proxy').check();await page.getByRole('button',{name:'保存并使用',exact:true}).click();await status.filter({hasText:'已保存'}).waitFor();
  const imageId=await page.locator('#ai-profile').inputValue();assert.notEqual(controlId,imageId);
  await page.locator('#ai-profile').selectOption(controlId);assert(await page.locator('#ai-proxy').isChecked());await page.locator('#ai-proxy').uncheck();await page.getByRole('button',{name:'保存并使用',exact:true}).click();
  await page.locator('#ai-profile').selectOption(imageId);assert(await page.locator('#ai-proxy').isChecked(),'per-profile preference must remain independent');
  await page.locator('#ai-profile').selectOption(controlId);assert.equal(await page.locator('#ai-proxy').isChecked(),false);await page.locator('#ai-proxy').check();await page.getByRole('button',{name:'保存并使用',exact:true}).click();
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('senkou.image-ai.v1')));assert(stored.profiles.every(p=>p.proxy===true&&!p.key));assert.equal(stored.assistant,controlId);assert.equal(stored.image,imageId);
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:900});await page.locator('#ai-proxy').scrollIntoViewIfNeeded();
   assert.equal(await page.locator('.ai-settings').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);const bounds=await page.locator('#workspace-ai').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width+1);
   await page.screenshot({path:path.join(output,'proxy-settings-'+width+'.png')});
  }
  await page.setViewportSize({width:1440,height:960});await page.getByRole('button',{name:'关闭 AI 面板'}).click();await page.evaluate(()=>OnlinePS.ai.open('assistant'));
  async function send(text){await page.locator('#ai-task').fill(text);await page.getByRole('button',{name:'发送',exact:true}).click();await status.filter({hasText:'已完成，可在画布查看结果'}).waitFor();assert.equal(await page.locator('#ai-task').inputValue(),'');}
  await send('通过本站转发生成一张图');assert(await page.evaluate(()=>debugApp.xK()?.U.length>=2));assert.equal(direct.length,1,'control and generation must use the site, not browser upstream');
  assert(requests.some(r=>r.url.endsWith('/chat/completions'))&&requests.some(r=>r.url.endsWith('/images/generations')));
  phase='reference';round=0;await page.locator('#ai-attachments').setInputFiles({name:'reference.png',mimeType:'image/png',buffer:fixture});await page.waitForFunction(()=>document.querySelectorAll('.ai-attachment').length===1);await send('参考这张图再生成一张');assert(requests.some(r=>r.url.endsWith('/images/edits')));
  assert.deepEqual(errors,[]);await context.close();
  console.log('AI relay browser passed: default direct calls, opt-in checkbox, per-profile persistence without keys, same-origin model checks, control/image collaboration, reference upload and desktop/mobile settings.');
 }finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
