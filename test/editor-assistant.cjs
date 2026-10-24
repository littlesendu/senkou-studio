// Offline integration checks: API replies and all user images are synthetic.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),sharp=require('sharp');
const root=path.resolve(__dirname,'../source/ps'),output=path.resolve(__dirname,'../work/editor-ai');
const mime={'.html':'text/html;charset=utf-8','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.wasm':'application/wasm'};
const server=http.createServer(async(req,res)=>{try{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(root+path.sep))throw Error('path');let data=await fs.readFile(file);if(file.endsWith('pp1753360222.js'))data=Buffer.from(data.toString().replace('OnlinePS.install({','OnlinePS.install(window.debugNative={').replace('OnlinePS.start(senkouApp)','window.debugApp=senkouApp;OnlinePS.start(senkouApp)'));res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(data);}catch{res.writeHead(404).end();}});
(async()=>{
 await fs.mkdir(output,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});let release,round=0,phase='workflow',lastState;const errors=[],requests=[],imageRequests=[];
 try{
  const context=await browser.newContext({viewport:{width:1440,height:960},locale:'zh-CN'});
  await context.route('**/*',async route=>{
   const request=route.request();if(request.url().startsWith(origin))return route.continue();if(request.url().startsWith('https://images.test/')){imageRequests.push({url:request.url(),headers:request.headers(),body:request.postDataBuffer()});const red=await sharp({create:{width:320,height:240,channels:4,background:'#e85c60'}}).png().toBuffer();return route.fulfill({json:{data:[{b64_json:red.toString('base64')}]}});}if(!request.url().startsWith('https://assistant.test/'))return route.abort();
   if(request.method()==='GET')return route.fulfill({json:{data:[{id:'test-model',output_modalities:['text']}]}});
   const body=request.postDataJSON();if(!body.tools){imageRequests.push({url:request.url(),headers:request.headers(),body:request.postDataBuffer()});const red=await sharp({create:{width:320,height:240,channels:4,background:'#e85c60'}}).png().toBuffer();return route.fulfill({json:{data:[{b64_json:red.toString('base64')}]}});}requests.push(body);assert(Array.isArray(body.tools));assert.equal(body.model,'test-model');
   for(const m of body.messages)if(m.role==='tool'){const r=JSON.parse(m.content);if(r.state)lastState=r.state;else if(r.width)lastState=r;}
   const fn=(name,args)=>({id:'call-'+round+'-'+name,type:'function',function:{name,arguments:JSON.stringify(args)}});let calls,content=null;
   if(phase==='workflow'){
    if(round===0)calls=[fn('get_document',{})];
    if(round===1)calls=[fn('create_document',{width:600,height:400,name:'Assistant fixture',background:'white'})];
    if(round===2)calls=[fn('add_text',{text:'Hello',name:'Title',x:40,y:100,size:40,color:'#173e32'})];
    if(round===3){const id=lastState.layers.find(l=>l.text).id;calls=[fn('edit_layer',{layer_id:id,name:'Title ";window.hacked=true;//',opacity:80,visible:true}),fn('move_layer',{layer_id:id,dx:20,dy:10}),fn('duplicate_layer',{layer_id:id}),fn('select_rectangle',{x:10,y:10,width:150,height:100}),fn('change_selection',{action:'deselect'}),fn('crop_document',{x:0,y:0,width:500,height:300}),fn('resize_document',{width:400,height:240}),fn('rotate_document',{angle:90}),fn('flip_document',{axis:'horizontal'})];}
    if(round>=4)content='已完成画布和文字设置。';
   }else if(phase==='invalid'){
    if(round===0)calls=[fn('run_javascript',{code:'window.hacked=true'}),fn('resize_document',{width:0,height:10}),fn('get_document',{})];
    else content='<img src=x onerror=window.hacked=true> 不支持的操作已跳过。';
   }else if(phase==='draw'){
    if(round===0)calls=[fn('get_document',{})];
    if(round===1)calls=[fn('create_document',{width:320,height:240,name:'Stick figure',background:'white'}),fn('draw_shape',{name:'Head',shape:'ellipse',x:140,y:25,width:40,height:40,stroke:'#173e32',stroke_width:5}),fn('draw_paths',{name:'Body',color:'#173e32',width:5,paths:[{points:[{x:160,y:65},{x:160,y:150}]},{points:[{x:115,y:90},{x:160,y:105},{x:205,y:90}]},{points:[{x:120,y:205},{x:160,y:150},{x:200,y:205}]}]})];
    if(round>=2)content='火柴人已绘制。';
   }else if(phase==='large'){
    if(round===0)calls=[fn('create_document',{width:5000,height:3400,name:'Large',background:'white'}),fn('add_text',{name:'Large title',text:'Large',x:100,y:150,size:40,color:'#173e32'}),fn('draw_shape',{name:'Large shape',shape:'rectangle',x:4500,y:3000,width:100,height:100,fill:'#e85c60'})];
    if(round>=1)content='大画布完成。';
   }else if(phase==='handoff'){
    if(round===0)calls=[fn('get_document',{})];
    if(round===1)calls=[fn('select_rectangle',{x:10,y:10,width:80,height:60}),fn('generate_image',{mode:'fill',prompt:'Red flowers in this area'})];
    if(round>=2)content='已调用图像模型完成填充。';
    }else if(phase==='large-handoff'){
    if(round===0)calls=[fn('get_document',{})];
    if(round===1)calls=[fn('select_rectangle',{x:4400,y:2800,width:200,height:300}),fn('generate_image',{mode:'fill',prompt:'Paint this area red'})];
    if(round>=2)content='大画布选区已填充。';
   }else if(phase==='hold'||phase==='switch'){
    await new Promise(r=>release=r);calls=[fn('resize_document',{width:8,height:8})];
   }
   round++;try{await route.fulfill({json:{choices:[{message:{role:'assistant',content,...(calls?{tool_calls:calls}:{})}}]}});}catch(e){if(!/handled|closed/i.test(e.message))throw e;}
  });
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
  await page.goto(origin,{waitUntil:'networkidle'});await page.waitForFunction(()=>document.body.dataset.editorVersion);
  await page.locator('.workspace-ai').click();assert(await page.locator('#ai-task').isVisible());await page.locator('.ai-close').click();await page.locator('.topbar > span:first-of-type > button').filter({hasText:/^编辑$/}).click();await page.locator('.contextpanel:visible .label').filter({hasText:/首选项/}).click();await page.getByRole('button',{name:'AI 设置',exact:true}).click();assert.equal(await page.locator('#workspace-ai').getAttribute('data-tab'),'settings');assert.equal(await page.locator('.ai-settings').innerText().then(t=>t.includes('DeepSeek')),false);
  await page.locator('#ai-name').fill('Shared platform');await page.locator('#ai-protocol').selectOption('chat');await page.locator('#ai-endpoint').fill('https://assistant.test/v1');await page.locator('#ai-model').fill('test-model');await page.locator('#ai-key').fill('synthetic-key');await page.locator('#ai-use-image').check();
  await page.getByRole('button',{name:'测试连接',exact:true}).click();await page.locator('.ai-status').filter({hasText:'只输出文字'}).waitFor();await page.getByRole('button',{name:'保存并使用'}).click();
  const storage=await page.evaluate(()=>JSON.parse(localStorage.getItem('senkou.image-ai.v1')));assert.equal(storage.profiles.length,1);assert.equal(storage.image,storage.assistant);assert(!JSON.stringify(storage).includes('synthetic-key'));
  await page.evaluate(()=>OnlinePS.ai.open('settings'));await page.locator('#ai-profile').selectOption('');await page.locator('#ai-name').fill('Image platform');await page.locator('#ai-endpoint').fill('https://images.test/v1');await page.locator('#ai-model').fill('image-model');await page.getByRole('button',{name:'保存并使用'}).click();
  const split=await page.evaluate(()=>JSON.parse(localStorage.getItem('senkou.image-ai.v1')));assert.equal(split.profiles.length,2);assert.equal(split.assistant,storage.assistant);assert.notEqual(split.image,split.assistant);assert.equal(await page.locator('#ai-route-image').inputValue(),split.image);
  await page.evaluate(()=>OnlinePS.ai.open('assistant'));
  async function run(task){await page.locator('#ai-task').fill(task);await page.getByRole('button',{name:'发送',exact:true}).click();assert.equal(await page.locator('#ai-task').inputValue(),'');}
  await run('Create a white canvas and add a title.');await page.locator('.ai-status').filter({hasText:'已完成，可在画布查看结果'}).waitFor({timeout:20000});
  assert.deepEqual(await page.evaluate(()=>[debugApp.xK().r,debugApp.xK().B]),[240,400]);assert.equal(await page.evaluate(()=>debugApp.xK().U.filter(l=>l.add.TySh).length),2);
  assert((await page.locator('.assistant-log').innerText()).includes('添加文字 · 完成'));assert.equal(await page.evaluate(()=>window.hacked),undefined);
  const lastText=await page.evaluate(()=>debugApp.xK().U.filter(l=>l.add.TySh).map(l=>({name:l.getName(),opacity:l.xC})));assert(lastText.some(l=>l.name.includes('window.hacked')));assert(lastText.some(l=>l.opacity===204));
  await page.screenshot({path:path.join(output,'assistant-1440.png')});
  phase='invalid';round=0;await run('Try unsupported actions.');await page.locator('.ai-status').filter({hasText:'已完成，可在画布查看结果'}).waitFor();assert((await page.locator('.assistant-log').innerText()).includes('不支持此操作'));assert.equal(await page.locator('.assistant-log img').count(),0);assert.equal(await page.evaluate(()=>window.hacked),undefined);assert.deepEqual(await page.evaluate(()=>[debugApp.xK().r,debugApp.xK().B]),[240,400]);
  phase='hold';round=0;await run('Wait before resizing.');while(!release)await new Promise(r=>setTimeout(r,10));await page.getByRole('button',{name:'停止',exact:true}).click();release();release=null;await page.locator('.ai-status').filter({hasText:'已停止等待'}).waitFor();assert.equal(await page.evaluate(()=>debugApp.xK().r),240);
  phase='hold';round=0;await run('Wait while switching platform.');while(!release)await new Promise(r=>setTimeout(r,10));await page.evaluate(()=>OnlinePS.ai.open('settings'));await page.locator('#ai-route-assistant').selectOption('');release();release=null;await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>debugApp.xK().r),240);await page.locator('#ai-route-assistant').selectOption(storage.assistant);await page.evaluate(()=>OnlinePS.ai.open('assistant'));
  phase='switch';round=0;await run('Resize this.');while(!release)await new Promise(r=>setTimeout(r,10));await page.evaluate(()=>debugNative.AI.script(debugApp,'app.documents.add(200,100,72,"Other",null,0)'));release();release=null;await page.locator('.ai-status').filter({hasText:'画布已在助手之外被修改或切换'}).waitFor();assert.equal(await page.evaluate(()=>debugApp.xK().r),200);
  phase='draw';round=0;await run('画一个火柴人');await page.locator('.ai-status').filter({hasText:'已完成，可在画布查看结果'}).waitFor();
  const stick=Buffer.from(await page.evaluate(()=>Array.from(new Uint8Array(OnlinePS.ai.native.png(debugApp,debugApp.xK())))));await fs.writeFile(path.join(output,'stickman.png'),stick);
  const pix=await sharp(stick).ensureAlpha().raw().toBuffer();for(const [x,y] of [[160,25],[160,100],[120,204],[200,204]])assert.deepEqual([...pix.subarray((y*320+x)*4,(y*320+x)*4+3)],[23,62,50],'Real brush pixels required');
  assert.equal(await page.evaluate(()=>debugApp.xK().U.filter(l=>l.add.TySh).length),0);
  phase='handoff';round=0;await run('把选中的地方改成红色花朵');await page.locator('.ai-status').filter({hasText:'已完成，可在画布查看结果'}).waitFor();assert((await page.locator('.assistant-log').innerText()).includes('调用生图 AI · 完成'));assert.equal(await page.evaluate(()=>debugApp.xK().U.at(-1).getName()),'生成式填充');
  await page.evaluate(()=>OnlinePS.ai.open('settings'));await page.locator('#ai-route-image').selectOption(storage.assistant);await page.evaluate(()=>OnlinePS.ai.open('assistant'));
  phase='handoff';round=0;await run('同一配置同时完成操控与图像任务');await page.locator('.ai-status').filter({hasText:'已完成，可在画布查看结果'}).waitFor();assert(imageRequests.at(-1).url.startsWith('https://assistant.test/'));assert.equal(imageRequests.at(-1).headers.authorization,'Bearer synthetic-key');
  await page.evaluate(()=>OnlinePS.ai.open('settings'));await page.locator('#ai-route-image').selectOption(split.image);await page.evaluate(()=>OnlinePS.ai.open('assistant'));
  phase='large';round=0;await run('Create and draw on a 17 million pixel canvas.');await page.locator('.ai-status').filter({hasText:'已完成，可在画布查看结果'}).waitFor({timeout:30000});assert.deepEqual(await page.evaluate(()=>[debugApp.xK().r,debugApp.xK().B]),[5000,3400]);assert(await page.evaluate(()=>debugApp.xK().U.some(l=>l.getName()==='Large shape')));
  await page.locator('.ai-chat-options summary').click();await page.locator('#ai-assistant-preview').check();phase='large-handoff';round=0;await run('填充大画布的选区');await page.locator('.ai-status').filter({hasText:'已完成，可在画布查看结果'}).waitFor({timeout:30000});
  const imageRequest=imageRequests.at(-1),form=await new Request(imageRequest.url,{method:'POST',headers:{'content-type':imageRequest.headers['content-type']},body:imageRequest.body}).formData();const imageMeta=await sharp(Buffer.from(await form.get('image').arrayBuffer())).metadata();assert.deepEqual([imageMeta.width,imageMeta.height],[2048,1393],'Upload only a scaled reference of the 17MP canvas');
  assert.deepEqual(await page.evaluate(()=>{const l=debugApp.xK().U.at(-1);return [l.S.x,l.S.y,l.S.r,l.S.B]}),[4400,2800,200,300],'Restore the original-resolution selection position');
  const largePNG=Buffer.from(await page.evaluate(()=>Array.from(new Uint8Array(OnlinePS.ai.native.png(debugApp,debugApp.xK())))));const {data:largePixels}=await sharp(largePNG).ensureAlpha().raw().toBuffer({resolveWithObject:true});for(const [x,y,color] of [[4450,2850,[232,92,96]],[4300,2700,[255,255,255]]])assert.deepEqual([...largePixels.subarray((y*5000+x)*4,(y*5000+x)*4+3)],color);
  await page.locator('.ai-close').click();await page.keyboard.press('Control+z');await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>debugApp.xK().U.at(-1).getName()),'Large shape','One undo removes the complete fill');await page.evaluate(()=>OnlinePS.ai.open('assistant'));
  const countBeforeEnter=requests.length;await page.locator('#ai-task').fill('多行任务');await page.locator('#ai-task').press('Shift+Enter');assert.equal(requests.length,countBeforeEnter);assert((await page.locator('#ai-task').inputValue()).includes('\n'));
  await page.locator('#ai-task').dispatchEvent('compositionstart');await page.locator('#ai-task').press('Enter');assert.equal(requests.length,countBeforeEnter,'IME confirmation must not send');await page.locator('#ai-task').dispatchEvent('compositionend');
  phase='invalid';round=0;await page.locator('#ai-task').press('Enter');assert.equal(await page.locator('#ai-task').inputValue(),'');await page.locator('.ai-status').filter({hasText:'已完成，可在画布查看结果'}).waitFor();await page.keyboard.press('Escape');assert(await page.locator('#workspace-ai').isHidden());
  await page.evaluate(()=>OnlinePS.ai.open('settings'));const input=page.locator('#ai-endpoint');await input.fill('https://example.invalid/v1');const box=await input.boundingBox();await page.mouse.move(box.x+box.width-15,box.y+box.height/2);await page.mouse.down();const dialog=await page.locator('#workspace-ai').boundingBox();await page.mouse.move(dialog.x-20,box.y+box.height/2,{steps:10});await page.mouse.up();assert(await page.locator('#workspace-ai').isVisible(),'Dragging outside must not close settings');await page.evaluate(()=>OnlinePS.ai.open('assistant'));
  await page.locator('.ai-close').click();await page.keyboard.press('Control+z');await page.waitForTimeout(100);
  await page.setViewportSize({width:390,height:844});assert(await page.locator('.workspace-ai').isHidden());await page.locator('.context-actions').getByRole('button',{name:'AI 对话',exact:true}).click();assert(await page.locator('#ai-task').isVisible());await page.screenshot({path:path.join(output,'assistant-390.png')});assert.equal(await page.locator('.context-actions button').filter({hasText:/AI/}).count(),1);assert.equal(await page.locator('.ai-tabs').count(),0);
  assert.deepEqual(errors,[]);assert(requests.every(r=>!JSON.stringify(r).includes('synthetic-key')));
  console.log('Assistant passed: real stickman pixels; 17MP drawing and masked image handoff with scaled preview, original coordinates and one-step undo; shared/split model handoff; Enter/Shift+Enter/IME; drag-select settings; compact chat;  shared/split profiles, text-only model feedback, tool loop, actual canvas/text/layer edits, literal escaping, unsupported/invalid tools, cancellation, stale document protection, mobile help entry. All model responses mocked.');
 }finally{if(release)release();await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
