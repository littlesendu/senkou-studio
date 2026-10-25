// Offline integration checks: API replies and all user images are synthetic.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),sharp=require('sharp');
const root=path.resolve(__dirname,'../source/ps'),output=path.resolve(__dirname,'../work/editor-ai');
const mime={'.html':'text/html;charset=utf-8','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.wasm':'application/wasm'};
const server=http.createServer(async(req,res)=>{try{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(root+path.sep))throw Error('path');let data=await fs.readFile(file);if(file.endsWith('pp1753360222.js'))data=Buffer.from(data.toString().replace('OnlinePS.install({','OnlinePS.install(window.debugNative={').replace('OnlinePS.start(senkouApp)','window.debugApp=senkouApp;OnlinePS.start(senkouApp)'));res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(data);}catch{res.writeHead(404).end();}});
(async()=>{
 await fs.mkdir(output,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
 const base=await sharp({create:{width:320,height:240,channels:4,background:'#a4d6bc'}}).png().toBuffer();
 const red=await sharp({create:{width:320,height:240,channels:4,background:'#e85c60'}}).png().toBuffer(),encoded=red.toString('base64');
 const requests=[],errors=[];let reply='ok',release;
 try{
  const context=await browser.newContext({viewport:{width:1440,height:960},locale:'zh-CN'});
  await context.route('**/*',async route=>{
   const req=route.request(),url=req.url();if(url.startsWith(origin))return route.continue();
   if(url.startsWith('https://mock.test/')){
    const item={url,method:req.method(),headers:req.headers(),body:req.postDataBuffer()};requests.push(item);
    const headers={'access-control-allow-origin':'*','content-type':'application/json'};
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{...headers,'access-control-allow-headers':'*','access-control-allow-methods':'*'}});
    if(req.method()==='GET')return route.fulfill({headers,json:url.includes('v1beta')?{models:[{name:'models/image-model'}]}:{data:[{id:'image-model'}]}});
    const kind=reply;if(kind==='hold')await new Promise(r=>{release=r;});
    if(kind==='error')return route.fulfill({status:401,headers,json:{error:{message:'Invalid key dummy-test-key'}}});
    if(kind==='text')return route.fulfill({headers,json:{choices:[{message:{content:'This model returns only text.'}}]}});
    const json=url.includes(':generateContent')?{candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:encoded}}]}}]}:url.includes('chat/completions')?{choices:[{message:{images:[{image_url:{url:'data:image/png;base64,'+encoded}}]}}]}:kind==='cdn'?{data:[{url:'https://mock-cdn.test/result.png'}]}:{data:[{b64_json:encoded}]};
    try{return await route.fulfill({headers,json});}catch(e){if(!/closed|invalid|handled/i.test(e.message))throw e;}
   }
   if(url==='https://mock-cdn.test/result.png'){requests.push({url,headers:req.headers()});return route.fulfill({headers:{'access-control-allow-origin':'*','content-type':'image/png'},body:red});}
   return route.abort();
  });
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());
  const status=page.locator('#workspace-ai .ai-status');
  async function load(){await page.goto(origin,{waitUntil:'networkidle'});await page.waitForFunction(()=>document.body.dataset.editorVersion);}
  async function open(){await page.locator('#local-open-input').setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:base});await page.waitForFunction(()=>debugApp.xK()?.r===320);await page.waitForTimeout(200);}
  async function tools(mode){await page.evaluate(m=>OnlinePS.ai.open('tools',m),mode);}
  async function close(){await page.getByRole('button',{name:'关闭 AI 面板'}).click();}
  async function configure(type,remember=false){await page.evaluate(()=>OnlinePS.ai.open('settings'));await page.locator('#ai-profile').selectOption('');await page.locator('#ai-name').fill(type+' test');await page.locator('#ai-protocol').selectOption(type);await page.locator('#ai-endpoint').fill('https://mock.test/'+(type==='gemini'?'v1beta/models/image-model:generateContent':'v1/'+(type==='chat'?'chat/completions':'images/generations')));await page.locator('#ai-model').fill('image-model');await page.locator('#ai-key').fill('dummy-test-key');await page.locator('#ai-remember').setChecked(remember);await page.locator('#ai-use-image').check();if(type==='chat')await page.locator('#ai-use-assistant').uncheck();await page.getByRole('button',{name:'测试连接',exact:true}).click();await status.filter({hasText:'连接成功'}).waitFor();await page.getByRole('button',{name:'保存并使用'}).click();await status.filter({hasText:'已保存'}).waitFor();return page.locator('#ai-route-image').inputValue();}
  async function run(mode,prompt){prompt=prompt|| (mode==='generate'?'生成红色图像':mode==='remove'?'移除选中的物体':'修改为红色表面');await tools(mode);await page.locator('#ai-task').fill(prompt);await page.getByRole('button',{name:'发送'}).click();await status.filter({hasText:'已完成'}).waitFor();}
  async function png(){return Buffer.from(await page.evaluate(()=>Array.from(new Uint8Array(debugNative.AI.png(debugApp,debugApp.xK())))));}
  async function pixel(buffer,x,y){const {data,info}=await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});return [...data.subarray((y*info.width+x)*4,(y*info.width+x)*4+4)];}
  async function layers(){return page.evaluate(()=>debugApp.xK().U.length);}
  async function undo(){await close();await page.keyboard.press('Control+z');await page.waitForTimeout(100);}
  async function select(){await page.evaluate(()=>debugNative.AI.script(debugApp,'app.activeDocument.selection.select([[80,60],[240,60],[80,180]])'));await page.waitForFunction(()=>document.querySelector('.context-taskbar').dataset.selection==='true');}
  await load();await open();await page.locator('.workspace-ai').click();await page.evaluate(()=>OnlinePS.ai.open('settings'));
  const imagesID=await configure('images');assert.equal((await page.evaluate(()=>localStorage.getItem('senkou.image-ai.v1'))).includes('dummy-test-key'),false,'Key must not persist by default');
  await run('generate');assert.equal(await layers(),2);assert.deepEqual(await pixel(await png(),160,120),[232,92,96,255]);
  assert.equal(requests.at(-1).url,'https://mock.test/v1/images/generations');assert.equal(requests.at(-1).headers.authorization,'Bearer dummy-test-key');assert.equal(JSON.parse(requests.at(-1).body).model,'image-model');
  await undo();assert.equal(await layers(),1);assert.deepEqual(await pixel(await png(),160,120),[164,214,188,255]);
  await select();await run('fill');assert.equal(await layers(),2);
  const fillReq=requests.at(-1);assert.equal(fillReq.url,'https://mock.test/v1/images/edits');
  const form=await new Request(fillReq.url,{method:'POST',headers:{'content-type':fillReq.headers['content-type']},body:fillReq.body}).formData();assert.equal(form.get('model'),'image-model');
  const mask=Buffer.from(await form.get('mask').arrayBuffer());assert.equal((await pixel(mask,100,80))[3],0,'Editable pixels must be transparent in the Images mask');assert.equal((await pixel(mask,220,160))[3],255,'Triangular selection must not become its bounding rectangle');
  const composite=await png();assert.deepEqual(await pixel(composite,100,80),[232,92,96,255]);assert.deepEqual(await pixel(composite,220,160),[164,214,188,255]);assert.deepEqual(await pixel(composite,0,0),[164,214,188,255]);
  await undo();assert.equal(await layers(),1);assert.deepEqual(await pixel(await png(),100,80),[164,214,188,255],'Fill undo must restore the original selected pixels');
  await page.getByRole('button',{name:'反选',exact:true}).click();await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>debugApp.xK().h.S.r),320);await page.getByRole('button',{name:'取消选择',exact:true}).click();await page.waitForFunction(()=>!debugApp.xK().h);
  await page.locator('.context-more').click();await page.getByRole('button',{name:'隐藏快捷栏'}).click();assert(await page.locator('.context-taskbar').isHidden());await page.locator('.workspace-ai').click();await page.locator('.ai-chat-options summary').click();await page.getByRole('button',{name:'显示画布快捷栏'}).click();await close();assert(await page.locator('.context-taskbar').isVisible());
  const handle=page.locator('.context-drag'),box=await handle.boundingBox();await page.mouse.move(box.x+8,box.y+8);await page.mouse.down();await page.mouse.move(box.x+48,box.y-32);await page.mouse.up();assert((await page.locator('.context-taskbar').boundingBox()).y<box.y-20);await handle.press('Home');
  reply='error';await tools('edit');await page.locator('#ai-task').fill('red');await page.getByRole('button',{name:'发送'}).click();await status.filter({hasText:'HTTP 401'}).waitFor();assert(!(await status.innerText()).includes('dummy-test-key'));assert.equal(await layers(),1);
  reply='text';await page.locator('#ai-task').fill('修改图片');await page.getByRole('button',{name:'发送'}).click();await status.filter({hasText:'接口没有返回图片'}).waitFor();assert.equal(await layers(),1);
  reply='hold';await page.locator('#ai-task').fill('修改图片');await page.getByRole('button',{name:'发送'}).click();await page.waitForFunction(()=>document.querySelector('.ai-status').textContent.includes('正在调用生图 AI'));while(!release)await new Promise(r=>setTimeout(r,10));await page.getByRole('button',{name:'停止'}).click();release();release=null;await page.waitForTimeout(150);assert.equal(await layers(),1);assert((await status.innerText()).includes('已停止'));
  reply='cdn';await run('edit');assert.equal(await layers(),2);assert.equal(requests.at(-1).url,'https://mock-cdn.test/result.png');assert.equal(requests.at(-1).headers.authorization,undefined,'Do not forward Key to the returned image host');await undo();
  reply='ok';const geminiID=await configure('gemini');await close();await select();await run('fill');const gemReq=requests.at(-1),gemJSON=JSON.parse(gemReq.body);assert.equal(gemReq.url,'https://mock.test/v1beta/models/image-model:generateContent');assert.equal(gemReq.headers['x-goog-api-key'],'dummy-test-key');assert.equal(gemJSON.contents[0].parts.length,3);const gm=Buffer.from(gemJSON.contents[0].parts[2].inlineData.data,'base64');assert.deepEqual(await pixel(gm,100,80),[255,255,255,255]);assert.deepEqual(await pixel(gm,0,0),[0,0,0,255]);await undo();assert.deepEqual(await pixel(await png(),100,80),[164,214,188,255],'Gemini fill undo must preserve base pixels');
  const chatID=await configure('chat',true);await run('remove','');const chat=JSON.parse(requests.at(-1).body);assert.equal(chat.messages[0].content.length,3);assert.equal(chat.stream,false);assert.deepEqual(await pixel(await png(),0,0),[164,214,188,255]);await undo();assert.deepEqual(await pixel(await png(),100,80),[164,214,188,255],'Chat remove undo must preserve base pixels');
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('senkou.image-ai.v1')));assert.equal(saved.profiles.length,3);assert.equal(saved.profiles.find(p=>p.id===chatID).key,'dummy-test-key');assert.equal(saved.profiles.find(p=>p.id===geminiID).key,undefined);
  // The layer panel remains native; its inputs and lock states still work.
  await page.evaluate(()=>debugNative.AI.script(debugApp,'app.activeDocument.selection.deselect()'));
  const blend=page.locator('.lphead .ddmenu select');const prior=await blend.inputValue();const next=await blend.locator('option').nth(1).getAttribute('value');await blend.selectOption(next);assert.equal(await blend.inputValue(),next);await blend.selectOption(prior);
  const lock=page.locator('.lphead .mbox button').first();const before=await lock.getAttribute('class');await lock.click();assert.notEqual(await lock.getAttribute('class'),before);await lock.click();
  const opacity=page.locator('.lphead .rangedropinput input').first();await opacity.fill('65%');await opacity.press('Enter');assert((await opacity.inputValue()).startsWith('65'));await opacity.fill('100%');await opacity.press('Enter');
  assert.equal(await page.locator('.lphead .mbox img').first().getAttribute('data-editor-icon'),'trsp3');assert.equal(await page.locator('.context-taskbar .context-actions button').first().evaluate(e=>getComputedStyle(e).borderTopWidth),'0px');
  for(const width of [1440,768,390]){await page.setViewportSize({width,height:width===390?844:960});await page.waitForTimeout(200);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(output,'polished-'+width+'.png')});if(width<=900){assert(await page.locator('.workspace-ai').isHidden());await page.locator('.context-more').click();await page.evaluate(()=>OnlinePS.ai.open('settings'));}else{await page.locator('.workspace-ai').click();await page.evaluate(()=>OnlinePS.ai.open('settings'));}await page.waitForTimeout(100);assert.equal(await page.locator('#workspace-ai').getAttribute('data-tab'),'settings');const dialog=await page.locator('#workspace-ai').boundingBox();assert(dialog.x>=0&&dialog.x+dialog.width<=width+1);await page.screenshot({path:path.join(output,'ai-settings-'+width+'.png')});await close();}
  await page.setViewportSize({width:1440,height:960});
  // Settings survive reload only when requested; no image requests run by themselves.
  const oldRequests=requests.length;await load();await page.locator('.workspace-ai').click();await page.evaluate(()=>OnlinePS.ai.open('settings'));assert.equal(await page.locator('#ai-key').inputValue(),'dummy-test-key');await page.locator('#ai-profile').selectOption(imagesID);assert.equal(await page.locator('#ai-key').inputValue(),'');await page.locator('#ai-profile').selectOption(chatID);await page.getByRole('button',{name:'删除配置'}).click();assert.equal((await page.evaluate(()=>localStorage.getItem('senkou.image-ai.v1'))).includes('dummy-test-key'),false);assert.equal(requests.length,oldRequests);
  await page.locator('#ai-profile').selectOption(imagesID);await page.locator('#ai-key').fill('dummy-test-key');await page.locator('#ai-use-image').check();await page.getByRole('button',{name:'保存并使用'}).click();await run('generate');assert.equal(await page.evaluate(()=>debugApp.xK().r),1024);assert.deepEqual(await pixel(await png(),500,500),[232,92,96,255]);
  await close();await page.locator('.workspace-help').click();assert((await page.locator('#workspace-help').innerText()).includes('AI 与快捷任务栏'));await page.keyboard.press('Escape');
  assert.deepEqual(errors,[]);console.log('AI editor passed: three custom API protocols, multiple profiles, Key privacy/persistence/deletion, model checks, image generation with/without canvas, masked triangular fill, composite pixels and undo, errors/cancellation/CDN, seamless draggable taskbar, native layer controls, help and 1440/768/390 layouts. All external services mocked.');
 }finally{if(release)release();await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
