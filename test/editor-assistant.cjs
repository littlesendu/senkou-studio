// Offline integration checks: API replies and all user images are synthetic.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),sharp=require('sharp');
const root=path.resolve(__dirname,'../source/ps'),output=path.resolve(__dirname,'../work/editor-ai');
const mime={'.html':'text/html;charset=utf-8','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.wasm':'application/wasm'};
const server=http.createServer(async(req,res)=>{try{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(root+path.sep))throw Error('path');let data=await fs.readFile(file);if(file.endsWith('pp1753360222.js'))data=Buffer.from(data.toString().replace('OnlinePS.install({','OnlinePS.install(window.debugNative={').replace('OnlinePS.start(senkouApp)','window.debugApp=senkouApp;OnlinePS.start(senkouApp)'));res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(data);}catch{res.writeHead(404).end();}});
(async()=>{
 await fs.mkdir(output,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});let release,round=0,phase='workflow',lastState;const errors=[],requests=[];
 try{
  const context=await browser.newContext({viewport:{width:1440,height:960},locale:'zh-CN'});
  await context.route('**/*',async route=>{
   const request=route.request();if(request.url().startsWith(origin))return route.continue();if(!request.url().startsWith('https://assistant.test/'))return route.abort();
   if(request.method()==='GET')return route.fulfill({json:{data:[{id:'test-model',output_modalities:['text']}]}});
   const body=request.postDataJSON();requests.push(body);assert(Array.isArray(body.tools));assert.equal(body.model,'test-model');
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
  const split=await page.evaluate(()=>JSON.parse(localStorage.getItem('senkou.image-ai.v1')));assert.equal(split.profiles.length,2);assert.equal(split.assistant,storage.assistant);assert.notEqual(split.image,split.assistant);assert.equal(await page.locator('#ai-tool-profile').inputValue(),split.image);
  await page.getByRole('button',{name:'AI 对话',exact:true}).click();assert.equal(await page.locator('#ai-assistant-profile').inputValue(),storage.image);
  async function run(task){await page.locator('#ai-task').fill(task);await page.getByRole('button',{name:'执行任务',exact:true}).click();}
  await run('Create a white canvas and add a title.');await page.locator('.ai-status').filter({hasText:'已完成，可在画布查看结果'}).waitFor({timeout:20000});
  assert.deepEqual(await page.evaluate(()=>[debugApp.xK().r,debugApp.xK().B]),[240,400]);assert.equal(await page.evaluate(()=>debugApp.xK().U.filter(l=>l.add.TySh).length),2);
  assert((await page.locator('.assistant-log').innerText()).includes('添加文字 · 完成'));assert.equal(await page.evaluate(()=>window.hacked),undefined);
  const lastText=await page.evaluate(()=>debugApp.xK().U.filter(l=>l.add.TySh).map(l=>({name:l.getName(),opacity:l.xC})));assert(lastText.some(l=>l.name.includes('window.hacked')));assert(lastText.some(l=>l.opacity===204));
  await page.screenshot({path:path.join(output,'assistant-1440.png')});
  phase='invalid';round=0;await run('Try unsupported actions.');await page.locator('.ai-status').filter({hasText:'已完成，可在画布查看结果'}).waitFor();assert((await page.locator('.assistant-log').innerText()).includes('不支持此操作'));assert.equal(await page.locator('.assistant-log img').count(),0);assert.equal(await page.evaluate(()=>window.hacked),undefined);assert.deepEqual(await page.evaluate(()=>[debugApp.xK().r,debugApp.xK().B]),[240,400]);
  phase='hold';round=0;await run('Wait before resizing.');while(!release)await new Promise(r=>setTimeout(r,10));await page.getByRole('button',{name:'停止',exact:true}).click();release();release=null;await page.locator('.ai-status').filter({hasText:'已停止等待'}).waitFor();assert.equal(await page.evaluate(()=>debugApp.xK().r),240);
  phase='hold';round=0;await run('Wait while switching platform.');while(!release)await new Promise(r=>setTimeout(r,10));await page.locator('#ai-assistant-profile').selectOption('');release();release=null;await page.locator('.ai-status').filter({hasText:'已切换平台'}).waitFor();await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>debugApp.xK().r),240);assert(await page.getByRole('button',{name:'执行任务',exact:true}).isEnabled());await page.locator('#ai-assistant-profile').selectOption(storage.assistant);
  phase='switch';round=0;await run('Resize this.');while(!release)await new Promise(r=>setTimeout(r,10));await page.evaluate(()=>debugNative.AI.script(debugApp,'app.documents.add(200,100,72,"Other",null,0)'));release();release=null;await page.locator('.ai-status').filter({hasText:'画布已在助手之外被修改或切换'}).waitFor();assert.equal(await page.evaluate(()=>debugApp.xK().r),200);
  await page.locator('.ai-close').click();await page.keyboard.press('Control+z');await page.waitForTimeout(100);
  await page.setViewportSize({width:390,height:844});assert(await page.locator('.workspace-ai').isHidden());await page.locator('.context-actions').getByRole('button',{name:'AI 对话',exact:true}).click();assert(await page.locator('#ai-task').isVisible());await page.screenshot({path:path.join(output,'assistant-390.png')});
  assert.deepEqual(errors,[]);assert(requests.every(r=>!JSON.stringify(r).includes('synthetic-key')));
  console.log('Assistant passed: shared/split profiles, text-only model feedback, tool loop, actual canvas/text/layer edits, literal escaping, unsupported/invalid tools, cancellation, stale document protection, mobile help entry. All model responses mocked.');
 }finally{if(release)release();await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
