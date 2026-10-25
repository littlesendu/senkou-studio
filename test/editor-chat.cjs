// Offline integration checks: API replies and all user images are synthetic.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),sharp=require('sharp');
const root=path.resolve(__dirname,'../source/ps'),output=path.resolve(__dirname,'../work/editor-ai');
const mime={'.html':'text/html;charset=utf-8','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.wasm':'application/wasm'};
const server=http.createServer(async(req,res)=>{try{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(root+path.sep))throw Error('path');let data=await fs.readFile(file);if(file.endsWith('pp1753360222.js'))data=Buffer.from(data.toString().replace('OnlinePS.install({','OnlinePS.install(window.debugNative={').replace('OnlinePS.start(senkouApp)','window.debugApp=senkouApp;OnlinePS.start(senkouApp)'));res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(data);}catch{res.writeHead(404).end();}});
(async()=>{
 await fs.mkdir(output,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
 const profiles=[{id:'control',name:'Control',type:'chat',url:'https://chat.test/v1',model:'control-model'},{id:'image',name:'Image',type:'images',url:'https://image.test/v1',model:'image-model'}];
 const errors=[],requests=[],imageRequests=[];let phase='reply',round=0;
 const fixture=await sharp({create:{width:24,height:16,channels:4,background:'#ed654e'}}).png().toBuffer();
 const blue=await sharp({create:{width:16,height:24,channels:4,background:'#4576bc'}}).png().toBuffer();
 try{
  const context=await browser.newContext({viewport:{width:1440,height:960},locale:'zh-CN'});
  await context.addInitScript(value=>localStorage.setItem('senkou.image-ai.v1',JSON.stringify({active:'control',assistant:'control',image:'image',profiles:value})),profiles);
  await context.route('**/*',async route=>{
   const req=route.request();if(req.url().startsWith(origin))return route.continue();
   if(req.url().startsWith('https://image.test/')){imageRequests.push({url:req.url(),body:req.postDataBuffer()});return route.fulfill({json:{data:[{b64_json:fixture.toString('base64')}]}});}
   if(!req.url().startsWith('https://chat.test/'))return route.abort();
   const body=req.postDataJSON();requests.push(body);
   const fn=(name,args)=>({id:'call-'+round+'-'+name,type:'function',function:{name,arguments:JSON.stringify(args)}});let calls,content='收到参考图，可以继续编辑。';
   if(phase==='draw'&&round===0){content=null;calls=[fn('create_document',{width:160,height:120,name:'Dot fixture',background:'white'}),fn('draw_paths',{name:'Dots',color:'#173e32',width:12,paths:[{points:[{x:20,y:20}]},{points:[{x:40,y:40},{x:80,y:40}]},{points:[{x:100,y:70}]}]})];}
   if(phase==='invalid'&&round===0){content=null;calls=[fn('draw_paths',{name:'Invalid empty stroke',color:'#173e32',width:5,paths:[{points:[{x:10,y:10},{x:20,y:20}]},{points:[{x:30,y:30}]},{points:[]}]})];}
   if(phase==='invalid'&&round===1){content=null;calls=[fn('draw_paths',{name:'Repaired stroke',color:'#173e32',width:5,paths:[{points:[{x:10,y:10},{x:20,y:20}]}]})];}
   if(phase==='handoff'&&round===0){content=null;calls=[fn('generate_image',{mode:'generate',prompt:'Use both reference images.'})];}
   round++;return route.fulfill({json:{choices:[{message:{role:'assistant',content,...(calls?{tool_calls:calls}:{})}}]}});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
  await page.goto(origin);await page.waitForFunction(()=>document.body.classList.contains('ui-ready')&&window.OnlinePS?.ai);await page.evaluate(()=>OnlinePS.ai.open('assistant'));
  const dialog=page.locator('#workspace-ai'),prompt=page.locator('#ai-task');
  async function send(text){if(text!==undefined)await prompt.fill(text);await page.getByRole('button',{name:'发送',exact:true}).click();await page.locator('.ai-status').filter({hasText:'已完成，可在画布查看结果'}).waitFor();assert.equal(await prompt.inputValue(),'');}
  await send('第一条历史记录');
  const firstHistory=await page.locator('.assistant-log').innerText();assert(firstHistory.includes('第一条历史记录'));
  await page.getByRole('button',{name:'关闭 AI 面板'}).click();await page.evaluate(()=>OnlinePS.ai.open('assistant'));assert.equal(await page.locator('.assistant-log').innerText(),firstHistory);
  await page.getByRole('button',{name:'收起历史',exact:true}).click();assert.equal(await page.locator('.assistant-log').isVisible(),false);
  await page.getByRole('button',{name:'关闭 AI 面板'}).click();await page.evaluate(()=>OnlinePS.ai.open('assistant'));assert.equal(await page.locator('.assistant-log').isVisible(),false);await page.getByRole('button',{name:'展开历史',exact:true}).click();
  const before=await dialog.boundingBox(),heading=await page.locator('#ai-title').boundingBox();
  await page.mouse.move(heading.x+30,heading.y+8);await page.mouse.down();await page.mouse.move(heading.x-230,heading.y-102,{steps:10});await page.mouse.up();const moved=await dialog.boundingBox();assert(moved.x<before.x-200&&moved.y<before.y-60);
  await page.locator('#ai-title').focus();await page.keyboard.press('ArrowLeft');assert((await dialog.boundingBox()).x<moved.x-5);
  await prompt.fill('草稿暂存');await page.getByRole('button',{name:'关闭 AI 面板'}).click();await page.evaluate(()=>OnlinePS.ai.open('assistant'));assert.equal(await prompt.inputValue(),'草稿暂存');assert(Math.abs((await dialog.boundingBox()).x-(moved.x-10))<2);
  // File picker and drop on the dialog header both deliver real PNG bytes in image_url parts.
  const chooserPromise=page.waitForEvent('filechooser');await page.getByRole('button',{name:'添加图片',exact:true}).click();const chooser=await chooserPromise;await chooser.setFiles({name:'orange.png',mimeType:'image/png',buffer:fixture});assert.equal(await page.locator('.ai-attachment img').count(),1);
  await page.locator('.ai-header').evaluate((target,bytes)=>{const dt=new DataTransfer();dt.items.add(new File([new Uint8Array(bytes)],'blue.png',{type:'image/png'}));target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));},Array.from(blue));await page.waitForFunction(()=>document.querySelectorAll('.ai-attachment img').length===2);
  await page.screenshot({path:path.join(output,'chat-images-1440.png')});
  const attached=await page.locator('.ai-attachment img').evaluateAll(imgs=>imgs.map(i=>i.src));await send('看看这两张图');
  const sent=requests.at(-1).messages.filter(m=>m.role==='user').at(-1).content.filter(p=>p.type==='image_url').map(p=>p.image_url.url);assert.deepEqual(sent,attached);
  for(const url of sent){const bytes=Buffer.from(url.split(',')[1],'base64');assert.equal((await sharp(bytes).metadata()).format,'png');}
  assert.equal(await page.locator('.ai-attachment').count(),0);assert.equal(await page.locator('.assistant-message-images img').count(),2);
  await page.getByRole('button',{name:'关闭 AI 面板'}).click();await page.evaluate(()=>OnlinePS.ai.open('assistant'));assert.equal(await page.locator('.assistant-message-images img').count(),2);
  await page.locator('#ai-attachments').setInputFiles({name:'remove.png',mimeType:'image/png',buffer:blue});await page.getByRole('button',{name:'移除图片 remove.png',exact:true}).click();assert.equal(await page.locator('.ai-attachment').count(),0);
  // Reopening while an image decodes keeps the current composer synchronized.
  await page.evaluate(()=>{const decode=window.createImageBitmap;window.createImageBitmap=async(...args)=>{await new Promise(resolve=>window.releaseUpload=resolve);window.createImageBitmap=decode;return decode(...args);};});
  await page.locator('#ai-attachments').setInputFiles({name:'delayed.png',mimeType:'image/png',buffer:fixture});await page.waitForFunction(()=>typeof window.releaseUpload==='function');await page.getByRole('button',{name:'关闭 AI 面板'}).click();await page.evaluate(()=>OnlinePS.ai.open('assistant'));assert.equal(await page.getByRole('button',{name:'发送',exact:true}).isDisabled(),true);await page.evaluate(()=>window.releaseUpload());await page.waitForFunction(()=>document.querySelectorAll('.ai-attachment img').length===1);assert.equal(await page.getByRole('button',{name:'发送',exact:true}).isEnabled(),true);await page.getByRole('button',{name:'移除图片 delayed.png',exact:true}).click();
  // A failed/non-image upload is visible and does not overwrite the draft or open a document.
  await prompt.fill('保留草稿');await page.locator('#ai-attachments').setInputFiles({name:'bad.txt',mimeType:'text/plain',buffer:Buffer.from('not an image')});await page.locator('.ai-status').filter({hasText:'请选择 PNG'}).waitFor();assert.equal(await prompt.inputValue(),'保留草稿');assert.equal(await page.evaluate(()=>!!debugApp.xK()),false);
  phase='draw';round=0;await send('画两个圆点和一条线');const rendered=await page.evaluate(()=>Array.from(new Uint8Array(debugNative.AI.png(debugApp,debugApp.xK()))));const raw=await sharp(Buffer.from(rendered)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  for(const [x,y]of[[20,20],[100,70],[60,40]]){const i=(y*raw.info.width+x)*4;assert.deepEqual(Array.from(raw.data.subarray(i,i+3)),[23,62,50]);}
  phase='invalid';round=0;const priorRequests=requests.length;await send('修复错误的第三条笔画');const correction=requests.slice(priorRequests).find(b=>b.messages.some(m=>m.role==='tool'&&m.content.includes('实际为 0')));assert(correction,'precise validation feedback must reach AI for retry');assert((await page.locator('.assistant-log').innerText()).includes('参数.paths[2].points需要 1–500 个元素，实际为 0'));assert(await page.evaluate(()=>debugApp.xK().U.some(l=>l.name==='Repaired stroke')));
  const layerCount=await page.evaluate(()=>debugApp.xK().U.length);phase='handoff';round=0;await page.locator('#ai-attachments').setInputFiles([{name:'one.png',mimeType:'image/png',buffer:fixture},{name:'two.png',mimeType:'image/png',buffer:blue}]);await page.waitForFunction(()=>document.querySelectorAll('.ai-attachment').length===2);await send('基于两张参考图生成图片');assert(imageRequests.at(-1).url.endsWith('/images/edits'));const multipart=imageRequests.at(-1).body.toString('latin1');assert.equal((multipart.match(/name="image\[\]"/g)||[]).length,2);
  assert.equal(await page.evaluate(()=>debugApp.xK().U.length),layerCount+1,await page.locator('.assistant-log').innerText());
  // Check the native Window menu by clicking the same panel twice, including checkmark state.
  await page.getByRole('button',{name:'关闭 AI 面板'}).click();
  await page.locator('.topbar button').filter({hasText:/^窗口$/}).click();
  const windowInfo=await page.evaluate(()=>{const g=debugNative.Topbar.data.find(g=>OnlinePS.t(debugNative.Language.get(g.name))==='窗口');function flatten(items,actions){return items.flatMap((item,i)=>item.sub?flatten(item.sub,actions[i].sub):[{caption:OnlinePS.t(debugNative.Language.get(item.name)),action:actions[i]}]);}return flatten(g.items,g.dJ).filter(i=>i.action.d?.G3!==undefined).map(i=>({caption:i.caption,id:Number(i.action.d.G3)}));});
  const target=windowInfo.find(i=>i.caption==='信息');assert(target,JSON.stringify(windowInfo));const visibleBefore=await page.evaluate(id=>debugApp.j.Mc.includes(id),target.id);
  const info=page.getByText(target.caption,{exact:true}).filter({visible:true}).last();await info.click();assert.equal(await page.evaluate(id=>debugApp.j.Mc.includes(id),target.id),!visibleBefore);
  await page.locator('.topbar button').filter({hasText:/^窗口$/}).click();await page.getByText(target.caption,{exact:true}).filter({visible:true}).last().click();assert.equal(await page.evaluate(id=>debugApp.j.Mc.includes(id),target.id),visibleBefore);
  await page.evaluate(()=>OnlinePS.ai.open('assistant'));await page.getByRole('button',{name:'收起历史',exact:true}).click();
  for(const width of [1440,768,390]){await page.setViewportSize({width,height:900});await page.waitForTimeout(80);const bounds=await dialog.boundingBox();assert(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width+1&&bounds.y+bounds.height<=901);assert.equal(await page.locator('.ai-chat-actions').evaluate(e=>e.scrollWidth<=e.clientWidth),true);await page.screenshot({path:path.join(output,'chat-'+width+'.png')});}
  await page.getByRole('button',{name:'展开历史',exact:true}).click();await page.screenshot({path:path.join(output,'chat-history-390.png')});const expanded=await dialog.boundingBox();assert(expanded.y>=0&&expanded.y+expanded.height<=901);await page.getByRole('button',{name:'收起历史',exact:true}).click();
  const mobileHeading=await page.locator('#ai-title').boundingBox(),cdp=await context.newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true});
  const touch={x:mobileHeading.x+30,y:mobileHeading.y+10,id:71};await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...touch,y:touch.y+30}]});assert.equal(await dialog.evaluate(e=>e.classList.contains('ai-dragging')),true);await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert.equal(await dialog.evaluate(e=>e.classList.contains('ai-dragging')),false);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...touch,y:touch.y+30}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal(await dialog.evaluate(e=>e.classList.contains('ai-dragging')),false);

  // Both other supported image protocols receive the original normalized references too.
  for(const type of ['chat','gemini']){
   const imageContext=await browser.newContext({viewport:{width:1280,height:900},locale:'zh-CN'});
   await imageContext.addInitScript(({profiles,type})=>{profiles=structuredClone(profiles);profiles[1].type=type;localStorage.setItem('senkou.image-ai.v1',JSON.stringify({active:'control',assistant:'control',image:'image',profiles}));},{profiles,type});
   let imageBody;await imageContext.route('**/*',async route=>{const req=route.request();if(req.url().startsWith(origin))return route.continue();if(req.url().startsWith('https://image.test/')){imageBody=req.postDataJSON();return route.fulfill({json:type==='gemini'?{candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:fixture.toString('base64')}}]}}]}:{choices:[{message:{role:'assistant',images:[{image_url:{url:'data:image/png;base64,'+fixture.toString('base64')}}]}}]}});}if(!req.url().startsWith('https://chat.test/'))return route.abort();const b=req.postDataJSON(),hasResult=b.messages.some(m=>m.role==='tool');return route.fulfill({json:{choices:[{message:hasResult?{role:'assistant',content:'Done'}:{role:'assistant',content:null,tool_calls:[{id:'generate-ref',type:'function',function:{name:'generate_image',arguments:JSON.stringify({mode:'generate',prompt:'Use the reference.'})}}]}}]}});});
   const imagePage=await imageContext.newPage();imagePage.on('pageerror',e=>errors.push(e.message));await imagePage.goto(origin);await imagePage.waitForFunction(()=>document.body.classList.contains('ui-ready')&&window.OnlinePS?.ai);await imagePage.evaluate(()=>OnlinePS.ai.open('assistant'));await imagePage.locator('#ai-attachments').setInputFiles({name:'reference.png',mimeType:'image/png',buffer:fixture});await imagePage.waitForFunction(()=>document.querySelectorAll('.ai-attachment img').length===1);const reference=await imagePage.locator('.ai-attachment img').getAttribute('src');await imagePage.getByRole('button',{name:'发送',exact:true}).click();await imagePage.locator('.ai-status').filter({hasText:'已完成，可在画布查看结果'}).waitFor();
   const passed=type==='gemini'?imageBody.contents[0].parts.find(p=>p.inlineData).inlineData.data:imageBody.messages[0].content.find(p=>p.type==='image_url').image_url.url.split(',')[1];assert.equal(passed,reference.split(',')[1]);assert.equal(await imagePage.evaluate(()=>debugApp.xK().U.length),2);await imageContext.close();
  }
  assert.deepEqual(errors,[]);console.log('AI chat passed: draggable/clamped dialog, keyboard movement, retained/foldable history and drafts, image picker/drop/remove/error, image_url bytes, image handoff across three protocols, reopen during image decoding, single-point drawing, precise validation/retry, Window panel toggles, and 1440/768/390 layouts. APIs and images are synthetic; touch cancellation is synthesized in Edge.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
