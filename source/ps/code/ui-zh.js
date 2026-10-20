/* Chinese interface and visual shell for the bundled editor.
   UI captions are translated at their source; document and layer text are not rewritten. */
(function () {
  'use strict';
  var words = {
    "Absolute":"绝对",
    "Account types":"账户类型",
    "Anti-alias":"消除锯齿",
    "Buy: $":"购买：$",
    "Colors":"颜色",
    "Demos:":"示例：",
    "Distributor Account":"分销账户",
    "Drag to choose":"拖动选择",
    "Family Name ▼":"字体系列 ▼",
    "Go Premium":"高级服务",
    "Gradient ":"渐变 ",
    "Hello":"你好",
    "I accept":"我同意",
    "Insert into current project":"插入当前文档",
    "Interpolate":"插值",
    "Join a team":"加入团队",
    "Knockout":"挖空",
    "Old Way":"旧版方式",
    "Open as new projects":"作为新文档打开",
    "Orientation:":"方向：",
    "Path":"路径",
    "Preserve Luminosity":"保留明度",
    "Ruler units":"标尺单位",
    "Smart Object":"智能对象",
    "Snap to Pixels":"对齐像素",
    "Sponsor links open in a new window.":"赞助链接将在新窗口打开。",
    "Start a team":"创建团队",
    "SubFamily Name ▼":"字形样式 ▼",
    "Team Settings":"团队设置",
    "Y (out)":"Y（输出）",
    "add hidden layers":"包含隐藏图层",
    "add layer names":"包含图层名称",
    "add raster graphics":"包含位图图形",
    "don't use palettes":"不使用调色板",
    "pretty-print":"格式化输出",
    "rasterize all":"全部栅格化",
    "rasterize text":"栅格化文字",
    "reverse frames":"反转帧顺序",
    "vectorize text":"将文字转为矢量",
    "Convert to Paragraph text":"转换为段落文字",
    "Convert to Point text":"转换为点文字",
    'Normal':'正常','Dissolve':'溶解','Darken':'变暗','Multiply':'正片叠底','Color Burn':'颜色加深','Linear Burn':'线性加深','Darker Color':'深色',
    'Lighten':'变亮','Screen':'滤色','Color Dodge':'颜色减淡','Linear Dodge':'线性减淡（添加）','Lighter Color':'浅色',
    'Overlay':'叠加','Soft Light':'柔光','Hard Light':'强光','Vivid Light':'亮光','Linear Light':'线性光','Pin Light':'点光','Hard Mix':'实色混合',
    'Difference':'差值','Exclusion':'排除','Subtract':'减去','Divide':'划分','Hue':'色相','Saturation':'饱和度','Color':'颜色','Luminosity':'明度','Pass Through':'穿透',
    'Create a new document':'新建画布','Save ...':'保存…','Save for Adobe Photoshop':'保存为 Photoshop 文档','New Smart Obj. via Copy':'通过拷贝新建智能对象',
    'Scale Output':'导出倍率','Thumbnail / List':'缩略图 / 列表','Load Font':'加载字体','Enable/Disable':'启用 / 禁用','enab/disab':'启用 / 禁用',
    'Apply':'应用','Again':'再次执行','Repeat':'重复','Reset':'重置','Run':'运行','Yes':'是','No':'否','Cancel':'取消','OK':'确定','Menu':'菜单','More':'更多','None':'无',
    'Silver':'银灰','Black':'黑色','Iron Blue':'铁蓝','Snow White':'雪白','Danish Purple':'深紫','Social':'社交媒体','Extras':'显示额外内容',
    'Brightness/Contrast':'亮度 / 对比度','Levels':'色阶','Curves':'曲线','Exposure':'曝光度','Vibrance':'自然饱和度','Hue/Saturation':'色相 / 饱和度',
    'Color Balance':'色彩平衡','Black & White':'黑白','Photo Filter':'照片滤镜','Channel Mixer':'通道混合器','Gradient Map':'渐变映射','Selective Color':'可选颜色','Threshold':'阈值',
    'Gaussian Blur':'高斯模糊','Box Blur':'方框模糊','Motion Blur':'动感模糊','Radial Blur':'径向模糊','Surface Blur':'表面模糊','Lens Blur':'镜头模糊',
    'Average':'平均','Blur':'模糊','Blur More':'进一步模糊','Sharpen':'锐化','Sharpen More':'进一步锐化','Sharpen Edges':'锐化边缘','Unsharp Mask':'USM 锐化','Smart Sharpen':'智能锐化',
    'Add Noise':'添加杂色','Reduce Noise':'减少杂色','Dust & Scratches':'蒙尘与划痕','Median':'中间值','Despeckle':'去斑',
    'Liquify':'液化','Lens Correction':'镜头校正','Displace':'置换','Pinch':'挤压','Polar Coordinates':'极坐标','Ripple':'波纹','Shear':'切变','Spherize':'球面化','Twirl':'旋转扭曲','Wave':'波浪','ZigZag':'水波',
    'Color Halftone':'彩色半调','Mezzotint':'铜版雕刻','Mosaic':'马赛克','Crystallize':'晶格化','Facet':'彩块化','Fragment':'碎片','Pointillize':'点状化',
    'High Pass':'高反差保留','Maximum':'最大值','Minimum':'最小值','Offset':'位移','Custom':'自定','Emboss':'浮雕效果','Find Edges':'查找边缘','Solarize':'曝光过度',
    'Corner Radius':'圆角半径','Inner Radius':'内半径','Length':'长度','Smoothness:':'平滑度：','Gaps':'间距','Anchor Type':'锚点类型','Align with':'对齐到',
    'Caps':'端点','Butt':'平头','Round':'圆头','Square':'方头','Corners':'拐角','Miter':'尖角','Bevel':'斜角','H-scal':'水平缩放','V-scal':'垂直缩放',
    'Hex':'十六进制','DPI':'分辨率','URL':'网址','Color mode ':'颜色模式 ','Bitmap':'位图','Grayscale':'灰度','Indexed':'索引颜色','Multichannel':'多通道','Duotone':'双色调',
    'Content Aware':'内容识别','Artboard Background':'画板背景','Straighten Layer':'拉直图层','Clipping Mask':'剪贴蒙版','Clone Layers':'复制图层','Custom Brush':'自定画笔','Custom Shape':'自定形状','Custom Style':'自定样式',
    'Move Tool':'移动工具','Rectangular Marquee':'矩形选框','Ellipse Select':'椭圆选框','Lasso Select':'套索选区','Direct Select':'直接选择',
    'Brush Tool':'画笔工具','Blur Tool':'模糊工具','Burn Tool':'加深工具','Clone Tool':'仿制图章工具','Crop Tool':'裁剪工具','Dodge Tool':'减淡工具',
    'Eraser Tool':'橡皮擦工具','Gradient Tool':'渐变工具','Hand Tool':'抓手工具','Zoom Tool':'缩放工具','Pen Tool':'钢笔工具','Type Tool':'文字工具',
    'Add Anchor Point':'添加锚点','Add Handles':'添加控制柄','Close the Path':'闭合路径','Cut Paths':'剪切路径','Delete Anchors':'删除锚点','Delete Paths':'删除路径','Drag Anchors':'拖动锚点',
    'Default Colors':'默认前景色和背景色','Decrease Brush Size':'减小画笔','Increase Brush Size':'增大画笔','Decrease Hardness':'降低硬度','Increase Hardness':'增加硬度',
    'Delete Layer Comp':'删除图层复合','Edit Style':'编辑样式','JS Reference':'脚本参考',
    'Open a document first.':'请先打开一张图片或新建画布。','Close the current window first.':'请先关闭当前对话框。',
    'Escape or Confirm the current action (in the top menu).':'请先取消或确认当前操作（顶部工具栏）。',
    'No layer selected.':'请先选择图层。','More than one layer selected.':'当前选择了多个图层。','The layer is empty.':'当前图层为空。',
    'No selection!':'请先创建选区。','There is no selection.':'当前没有选区。','Selected area is empty.':'所选区域为空。','Copied area is empty':'拷贝区域为空。',
    'Project must have at least 1 layer':'文档必须至少保留一个图层。','Select an area to heal first.':'请先选择需要修复的区域。',
    'Paths can be added to existing shapes only.':'路径只能添加到已有的形状中。','Unlink masks before transforming Smart Object':'变换智能对象前，请先取消蒙版链接。',
    'Target layer is not a smart object!':'目标图层不是智能对象。','Smart Object updated':'智能对象已更新。','Select an Action first':'请先选择动作。','Select a target action first.':'请先选择目标动作。',
    'You can not apply actions while recording actions':'录制动作时无法执行其他动作。','You can not ransform the whole artboard':'无法对整个画板进行该变换。',
    'Pressure is not a number':'压力值必须为数字。','Maximum ICO size is 256x256 px.':'ICO 图标最大尺寸为 256 × 256 像素。',
    'Unsupported image format, not RGB!':'不支持此图像的颜色模式，请使用 RGB 图像。','Error in Photoshop file: wrong signature.':'PSD 文件标识无效，文件可能已损坏。',
    'A bug occured (see console).':'处理出现错误，请尝试重新打开文件。','Unknown JSON file opened. See the content in the console.':'无法识别此 JSON 文件。',
    'Saved!':'已保存。','Saving ...':'正在保存…','Loading ...':'正在加载…','Loading':'正在加载','Saving to Imgur ...':'正在发布到 Imgur…','Loading files from Google Drive ...':'正在从谷歌云端硬盘加载文件…',
    'Re-arranging artboards':'正在重新排列画板…','Disabling WebGL':'正在关闭 WebGL…','function is disabled':'该功能已停用。',
    'You have to log in first.':'请先登录。','You already have premium.':'当前账户已开通高级服务。','You must accept Terms of Service':'请先同意服务条款。','You must log in before buying Premium':'请先登录账户。',
    'Domain is empty.':'请输入域名。','Domain name (e.g. domain.com)':'域名（例如 domain.com）','Save Domain Settings':'保存域名设置','Save Team Settings':'保存团队设置',
    'Email of a leader':'负责人邮箱','Emails of other members:':'其他成员的邮箱：','Too long email address':'邮箱地址过长。','Too many team members':'团队成员数量超出限制。',
    'Order a distributor account first.':'请先开通分销账户。','More about Distributors':'了解分销账户','More about Teams':'了解团队账户',
    'Loading fonts':'正在加载字体','Saving':'正在保存','Open':'打开','New':'新建','Layer':'图层','Background':'背景','Transparent':'透明','White':'白色',
    'Px / Inch':'像素 / 英寸','FB Page Cover':'FB 主页封面','FB Shared Image':'FB 分享图片','FB Event Image':'FB 活动图片','FB Group Header':'FB 小组封面','Youtube Profile':'YouTube 头像','Youtube Cover':'YouTube 封面','Twitter Profile':'Twitter 头像','Twitter Header':'Twitter 封面','Business Card':'名片','Wallet':'钱包照片','Enprint':'标准照片','Small Square':'小正方形','Medium Rect':'中矩形','Large Rect':'大矩形','Mobile Leaderboard':'移动横幅','Large Mobile':'移动大横幅','Banner':'横幅','Leaderboard':'通栏广告','Large Leaderboard':'大通栏广告','Billboard':'广告牌','Vertical Rect':'竖向矩形','Skyscraper':'竖幅广告','Wide Skyscraper':'宽竖幅广告','Half Page':'半页广告','Ratio:':'宽高比：','Relative':'相对','Pixels':'像素','Inches':'英寸','Centimeters':'厘米','Millimeters':'毫米','Points':'点','Percent':'百分比','Portrait':'纵向','Landscape':'横向'
  };
  function translate(value) {
    if (typeof value !== 'string') return value;
    if (Object.prototype.hasOwnProperty.call(words, value)) return words[value];
    var key=value.trim();
    if (Object.prototype.hasOwnProperty.call(words,key)) return value.replace(key,words[key]);
    if (key.charAt(0)==='<') return value;
    var prefixes = [
      ['Unknown file format: ','无法识别的文件格式：'],['Unsupported format: ','不支持的格式：'],
      ['Unsupported format of the smart object (','不支持此智能对象的格式（'],['Unknown Linked Layer type: ','未知的链接图层类型：'],
      ['Unsupported BMP compression: ','不支持的 BMP 压缩方式：'],['Unsupported BMP format: ','不支持的 BMP 格式：'],
      ['Unsupported BMP header format: ','不支持的 BMP 文件头格式：'],['Unknown camera ','无法识别的相机：'],
      ['Unsupported CDR version','不支持此 CDR 版本'],['Unknown XCF version: ','不支持的 XCF 版本：'],
      ['Unknown compression ','不支持的压缩方式：'],['Not enough RAM! (need ','内存不足，需要：'],
      ['File scaled down ','图像已缩小：'],['Project will be converted from ','文档颜色模式将从以下模式转换：'],
      ['Will be applied to ','将应用于：'],['Saved. Response: ','保存完成，返回信息：'],['Error: ','错误：']
    ];
    for(var i=0;i<prefixes.length;i++) if(value.indexOf(prefixes[i][0])===0) return prefixes[i][1]+value.slice(prefixes[i][0].length);
    return value;
  }
  var paths={
    open:'M3 7h6l2 2h10v11H3z M3 7V4h7l2 3',
    layers:'m3 8 9-5 9 5-9 5z M3 12l9 5 9-5 M3 16l9 5 9-5'
  };
  function icon(name){return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+paths[name]+'"/></svg>';}
  function make(tag,cls,text){var node=document.createElement(tag);if(cls)node.className=cls;if(text)node.textContent=text;return node;}
  var toolPaths={
    ruler:'m3 16 13-13 5 5L8 21z M7 13l2 2 M10 10l3 3 M14 6l2 2',
    pencil:'m4 15 12-12 5 5L9 20l-7 2z M13 6l5 5 M4 15l5 5 M3 19l2 2',
    bucket:'m4 9 8-7 8 8-9 9-8-8z M6 6l10 10 M5 12h12 M20 13c-4 5-3 8 0 8s4-3 0-8',
    sharpen:'m12 3 9 18H3z M12 3v18',
    sponge:'m3 9 4-5h13l1 13-5 4H4z M7 4l1 12 13 1 M8 16l-4 5 M11 9h.01 M16 7h.01 M15 12h.01 M7 19h.01 M18 19h.01',
    polygonShape:'m12 2 10 7-4 12H6L2 9z',
    star:'m12 2 3 7 8 1-6 5 2 8-7-5-7 5 2-8-6-5 8-1z',
    line:'M3 21 21 3 M18 3h3v3',
    transform:'M5 5h14v14H5z M3 3h4v4H3z M17 3h4v4h-4z M3 17h4v4H3z M17 17h4v4h-4z',
    move:'M4 3v14l4-4 3 6 2-1-3-6h6z M16 5v5 M13.5 7.5h5 M17 15v5 M14.5 17.5h5',
    marquee:'M3 6V3h3 M10 3h4 M18 3h3v3 M21 10v4 M21 18v3h-3 M14 21h-4 M6 21H3v-3 M3 14v-4',
    ellipse:'M5 5 7 4 M11 3h2 M17 4l2 2 M21 10v3 M20 17l-2 2 M14 21h-3 M7 20l-2-2 M3 14v-3',
    lasso:'M6 17c-8-4-3-13 6-13 12 0 12 12 1 13-5 1-8-1-8-3 0-3 5-2 5 1 1 4-1 7-5 7',
    polygon:'m5 17-2-9 15-5 3 11-11 5 M10 19c1-5-5-6-5-2 0 3 5 3 5 0',
    quick:'M5 15c-7-8 6-15 10-8 M18 5l2 2-9 10-4 1 1-4z M2 18l2 2 M8 22h3 M16 20l2-2 M20 13v-2',
    wand:'m7 17 10-10 2 2-10 10z M4 4v4 M2 6h4 M17 2v3 M20 15v4 M18 17h4',
    crop:'M6 2v16h16 M2 6h16v16 M9 6h9v9 M8 18h10',
    eyedropper:'m14 3 7 7 M16 2l6 6-3 3-6-6z M14 7 4 17v3h3L17 10 M3 21l-1 1',
    heal:'m4 12 8-8a5 5 0 0 1 7 7l-8 8a5 5 0 0 1-7-7z M7 9l8 8 M10 6l8 8 M10 12h.01 M12 10h.01 M12 14h.01 M14 12h.01',
    brush:'m13 12 6-9c2-2 4 0 2 2l-7 9z M12 12c-7-2-4 8-10 8 6 2 12-1 12-6z',
    stamp:'M4 16h16v5H4z M6 16v-3h3v-3c-4-5-1-8 3-8s7 3 3 8v3h3v3 M3 22h18',
    eraser:'m3 14 10-10a2 2 0 0 1 3 0l5 5a2 2 0 0 1 0 3L11 22H8z M8 9l9 9 M11 22h11',
    gradient:'M3 5h18v14H3z M6 6v12 M9 6v12 M12 6v12 M15 6v12',
    blur:'M12 2c-2 5-8 10-8 14a8 8 0 0 0 16 0c0-4-6-9-8-14z M8 15c0 3 1 4 4 4',
    dodge:'M16 13a6 6 0 1 0-9-8 6 6 0 0 0 9 8z M7 13l-5 9 2 1 5-9',
    burn:'M7 12 4 9c-2-2 0-4 2-2l3 3-1-7c0-2 3-2 3 0l1 7 1-7c0-2 3-2 3 0v8l2-5c1-2 3-1 2 1l-2 10c-1 7-12 7-13 0',
    text:'M4 5V3h16v2 M12 3v18 M8 21h8',
    pen:'m13 3 8 8 M12 4 5 8 3 21l13-2 4-7z M3 21l7-7 M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4',
    path:'M5 3v17l5-5 6 6 3-3-6-6 6-2z',
    rect:'M3 5h18v14H3z',
    ellipseShape:'M21 12a9 7 0 1 1-18 0 9 7 0 0 1 18 0',
    hand:'M6 12V6c0-2 3-2 3 0v5 M9 11V3c0-2 3-2 3 0v8 M12 10V4c0-2 3-2 3 0v8 M15 11V7c0-2 3-2 3 0v9c0 8-10 8-12 3L2 13c-1-2 1-3 2-2l3 4',
    zoom:'M16 16l6 6 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0 M6 10h8 M10 6v8'
  };
  var toolAliases={move:'move',rselect:'marquee',eselect:'ellipse',lasso:'lasso',plasso:'polygon',mlasso:'polygon',qselect:'quick',mwand:'wand',crop:'crop',eyedropper:'eyedropper',ruler:'ruler',shbrush:'heal',hbrush:'heal',patch:'heal',brush:'brush',pencil:'pencil',clone:'stamp',eraser:'eraser',gradient:'gradient',pbucket:'bucket',blur:'blur',sharpen:'sharpen',smudge:'hand',dodge:'dodge',burn:'burn',sponge:'sponge',htype:'text',pen:'pen',fpen:'pen',pselect:'path',dselect:'path',rect:'rect',ellipse:'ellipseShape',pshape:'polygonShape',cshape:'star',line:'line',hand:'hand',zoom:'zoom',transform:'transform'};
  function renderToolIcon(key){return '<svg class="editor-tool-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+toolPaths[key]+'"/></svg>';}
  function toolIcon(caption,shortcut,asset){
    var key=toolAliases[(asset||'').replace(/^tools\//,'')];if(key)return renderToolIcon(key);
    if(caption==="矩形")caption=shortcut==="M"?"矩形选框":"矩形形状";
    var rules=[[/移动|Move Tool/,'move'],[/椭圆.*选|Ellipse Select/,'ellipse'],[/选框|矩形选择|Rectangular Marquee/,'marquee'],[/多边形.*套索/,'polygon'],[/套索|Lasso/,'lasso'],[/快速选择|快速选中|Quick Selection/,'quick'],[/魔棒|Magic Wand/,'wand'],[/裁剪|剪切工具|Crop/,'crop'],[/吸管|Eyedropper/,'eyedropper'],[/修复|Healing|Patch Tool/,'heal'],[/仿制|克隆|图章|Clone|Stamp/,'stamp'],[/橡皮|Eraser/,'eraser'],[/画笔|笔刷|铅笔|Brush|Pencil/,'brush'],[/渐变|Gradient/,'gradient'],[/模糊|涂抹|锐化|Blur|Smudge|Sharpen/,'blur'],[/加深|Burn/,'burn'],[/减淡|海绵|Dodge|Sponge/,'dodge'],[/文字|文本|Type Tool/,'text'],[/钢笔|锚点|Pen Tool|Anchor/,'pen'],[/路径选择|直接选择|Direct Select|Path Select/,'path'],[/椭圆|Ellipse/,'ellipseShape'],[/矩形|形状|Rectangle|Shape/,'rect'],[/抓手|手型|Hand Tool/,'hand'],[/缩放|放大镜|Zoom Tool/,'zoom']];
    for(var i=0;i<rules.length;i++)if(rules[i][0].test(caption))return renderToolIcon(rules[i][1]);
    return '';
  }
  function sizeTools(toolbar,height){
    toolbar.N.style.cssText='height:'+Math.max(0,height-2)+'px;width:45px;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;';
    toolbar.rY.style.cssText='width:44px;min-height:0;flex:1;overflow-y:auto;overflow-x:hidden;box-sizing:border-box;';
  }
  function mountColors(toolbar){
    if(!toolbar.colorControls){
      var controls=make('div','color-controls');controls.setAttribute('role','group');controls.setAttribute('aria-label','前景色和背景色');
      toolbar.colorControls=controls;
      toolbar.zX.N.classList.add('foreground-color');toolbar.qg.N.classList.add('background-color');
      [[toolbar.zX.N,'前景色：点击更改'],[toolbar.qg.N,'背景色：点击更改']].forEach(function(pair){
        pair[0].title=pair[1];pair[0].setAttribute('aria-label',pair[1]);pair[0].setAttribute('role','button');pair[0].tabIndex=0;
        pair[0].addEventListener('keydown',function(event){if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();pair[0].click();}});
      });
      toolbar.Nd.classList.add('color-swap');toolbar.hg.classList.add('color-reset');
      toolbar.Nd.innerHTML='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true"><path d="M3 3h9v9 M9 9l3 3 3-3 M6 0 3 3l3 3"/></svg>';
      toolbar.hg.innerHTML='<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path fill="#f3f3f3" stroke="#8c929b" d="M6.5 6.5h8v8h-8z"/><path fill="#151618" stroke="#b9bec5" d="M1.5 1.5h8v8h-8z"/></svg>';
      controls.appendChild(toolbar.qg.N);controls.appendChild(toolbar.zX.N);controls.appendChild(toolbar.Kn);
    }
    toolbar.N.appendChild(toolbar.colorControls);
  }
  function mount(app){
    document.body.classList.add('ui-ready');
    app.N.setAttribute('aria-label','图片编辑工作台');
    var top=app.NN.N;
    var brand=make('div','workspace-brand');
    brand.innerHTML='<svg viewBox="0 0 28 28" width="26" height="26" fill="none" aria-hidden="true"><path d="M5 10V5h5 M18 5h5v5 M23 18v5h-5 M10 23H5v-5" stroke="currentColor" stroke-width="1.6"/><path d="m9 18 4-5 3 3 3-4" stroke="currentColor" stroke-width="1.6"/></svg><span>在线图片编辑</span>';
    top.insertBefore(brand,top.firstChild);
    var actions=make('div','workspace-actions');
    var help=make('button','workspace-help','使用帮助');help.type='button';help.title='查看常用快捷键与使用方法';
    actions.appendChild(help);
    var panelToggle=make('button','workspace-panels');panelToggle.type='button';panelToggle.innerHTML=icon('layers');panelToggle.title='显示图层与面板';panelToggle.setAttribute('aria-label','显示图层与面板');panelToggle.setAttribute('aria-expanded','false');
    actions.appendChild(panelToggle);
    var reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
    var panelMotion=null,panelsExpanded=false;
    function setPanels(expanded){
      if(expanded===panelsExpanded)return;
      var wasVisible=app.N.classList.contains('panels-open');
      var current=wasVisible?getComputedStyle(app.AK.N):null;
      var fromOpacity=current?current.opacity:'0',fromTranslate=current?current.translate:'20px 0';
      if(panelMotion){panelMotion.cancel();panelMotion=null;}
      panelsExpanded=expanded;panelToggle.setAttribute('aria-expanded',String(expanded));
      if(expanded){app.N.classList.add('panels-open');app.AK.PM[1].ss();app.UN();}
      app.AK.N.style.pointerEvents=expanded?'':'none';
      if(window.innerWidth>900||!app.AK.N.animate){if(!expanded)app.N.classList.remove('panels-open');app.AK.N.style.pointerEvents='';return;}
      panelMotion=app.AK.N.animate([
        {opacity:fromOpacity,translate:reduceMotion.matches?'none':fromTranslate},
        {opacity:expanded?1:0,translate:reduceMotion.matches?'none':expanded?'0 0':'14px 0'}
      ],{duration:reduceMotion.matches?70:expanded?240:140,easing:'cubic-bezier(.16,1,.3,1)'});
      panelMotion.onfinish=function(){if(!panelsExpanded)app.N.classList.remove('panels-open');app.AK.N.style.pointerEvents='';panelMotion=null;};
    }
    function closePanels(){setPanels(false);}
    panelToggle.addEventListener('click',function(){setPanels(!panelsExpanded);});
    document.addEventListener('pointerdown',function(event){if(app.N.classList.contains('panels-open')&&!app.AK.N.contains(event.target)&&!panelToggle.contains(event.target))closePanels();});
    document.addEventListener('keydown',function(event){if(event.key==='Escape'&&app.N.classList.contains('panels-open'))closePanels();});
    var open=document.getElementById('local-open-button');
    open.innerHTML=icon('open')+'<span>打开文件</span>';open.removeAttribute('style');open.title='打开本地图片或 PSD 文档（Ctrl+O）';
    actions.appendChild(open);top.appendChild(actions);
    var oldTool=document.getElementById('local-open-tool');oldTool.hidden=true;
    var fileInput=document.getElementById('local-open-input');
    function openFile(){fileInput.click();}
    open.addEventListener('click',openFile);
    fileInput.addEventListener('change',function(){
      var files=Array.prototype.slice.call(fileInput.files||[]);if(!files.length)return;
      app.uI.O$(files);fileInput.value='';
    });

    // Keep the original new/open button objects so their editor events remain intact.
    var intro=app.ui.Pk;
    intro.replaceChildren();intro.setAttribute('aria-label','开始创作');
    app.ui.H$.classList.add('workspace-canvas');
    var content=make('section','welcome-content');
    content.innerHTML='<div class="welcome-art" aria-hidden="true"><svg viewBox="0 0 112 88" width="112" height="88" fill="none"><path d="M20 7h75v58H20z" stroke="currentColor" opacity=".25"/><path d="M9 19h75v58H9z" fill="var(--ui-ground)" stroke="currentColor" opacity=".65"/><path d="M9 30V19h11 M73 19h11v11 M84 66v11H73 M20 77H9V66" stroke="var(--ui-accent)" stroke-width="1.5"/><path d="m24 60 16-19 13 14 9-10 11 15H24z" stroke="currentColor"/><circle cx="62" cy="34" r="4" stroke="currentColor"/></svg></div><h1>让想法，在这里成像。</h1><p class="welcome-description">从一张图片开始，裁剪、调色、设计，自由创作。</p>';
    var row=make('div','welcome-actions');
    var openWelcome=make('button','welcome-open');openWelcome.type='button';openWelcome.innerHTML=icon('open')+'打开本地文件';openWelcome.addEventListener('click',openFile);
    var create=app.ui.ko[0].N;create.classList.add('welcome-create');
    // Its caption is also used when the original engine refreshes its language.
    app.ui.ko[0].iu='新建画布';create.textContent='新建画布';
    row.appendChild(openWelcome);row.appendChild(create);content.appendChild(row);
    var drop=make('p','welcome-drop','也可以将文件直接拖到这里');content.appendChild(drop);
    var formats=make('p','welcome-formats','支持 PSD、JPG、PNG、WebP、SVG 等格式');content.appendChild(formats);
    var shortcuts=make('div','welcome-shortcuts');shortcuts.innerHTML='<span><kbd>Ctrl</kbd> + <kbd>O</kbd> 打开文件</span><span><kbd>Alt</kbd> + <kbd>Ctrl</kbd> + <kbd>N</kbd> 新建画布</span>';content.appendChild(shortcuts);
    intro.appendChild(content);
    var canvasOutline=content.querySelector('.welcome-art svg > path:nth-child(3)');
    canvasOutline.setAttribute('pathLength','1');
    if(!reduceMotion.matches){document.body.classList.add('ui-entering');window.setTimeout(function(){document.body.classList.remove('ui-entering');},900);}

    var status=make('footer','workspace-status');
    var statusText=make('span','status-document','就绪 · 打开文件，开始创作');
    var statusHint=make('span','status-hint','支持拖放文件 · 在浏览器中编辑');
    status.appendChild(statusText);status.appendChild(statusHint);document.body.appendChild(status);

    var dialog=make('dialog','workspace-help-dialog');
    dialog.setAttribute('aria-labelledby','help-title');
    dialog.innerHTML='<div class="help-heading"><div><p>在线图片编辑</p><h2 id="help-title">开始你的第一张作品</h2></div><button type="button" class="help-close" aria-label="关闭使用帮助">×</button></div><p class="help-intro">打开本地图片，或新建一张空白画布。左侧选择工具，右侧管理图层，完成后通过「文件 → 导出为」保存作品。</p><dl class="help-shortcuts"><div><dt>打开文件</dt><dd>Ctrl + O</dd></div><div><dt>新建画布</dt><dd>Alt + Ctrl + N</dd></div><div><dt>撤销</dt><dd>Ctrl + Z</dd></div><div><dt>移动工具</dt><dd>V</dd></div><div><dt>画笔工具</dt><dd>B</dd></div><div><dt>文字工具</dt><dd>T</dd></div><div><dt>适合屏幕</dt><dd>Ctrl + 0</dd></div></dl><p class="help-note">需要保留图层时，使用「文件 → 另存为 PSD」。</p><button type="button" class="help-done">开始创作</button>';
    document.body.appendChild(dialog);
    var helpMotion=null,helpClosing=false;
    function closeHelp(){
      if(!dialog.open||helpClosing)return;
      helpClosing=true;dialog.classList.add('is-closing');
      var current=getComputedStyle(dialog),fromOpacity=current.opacity,fromTranslate=current.translate;
      if(helpMotion)helpMotion.cancel();
      if(!dialog.animate){dialog.close();helpClosing=false;dialog.classList.remove('is-closing');return;}
      helpMotion=dialog.animate([{opacity:fromOpacity,translate:fromTranslate},{opacity:0,translate:reduceMotion.matches?'none':'0 6px'}],{duration:reduceMotion.matches?70:140,easing:'cubic-bezier(.4,0,1,1)'});
      helpMotion.onfinish=function(){dialog.close();helpClosing=false;dialog.classList.remove('is-closing');helpMotion=null;};
    }
    help.addEventListener('click',function(){
      if(helpMotion)helpMotion.cancel();helpClosing=false;dialog.classList.remove('is-closing');
      if(!dialog.open)dialog.showModal();
      if(dialog.animate)helpMotion=dialog.animate([{opacity:0,translate:reduceMotion.matches?'none':'0 10px'},{opacity:1,translate:'none'}],{duration:reduceMotion.matches?70:220,easing:'cubic-bezier(.16,1,.3,1)'});
    });
    dialog.querySelector('.help-close').addEventListener('click',closeHelp);
    dialog.querySelector('.help-done').addEventListener('click',closeHelp);
    dialog.addEventListener('cancel',function(event){event.preventDefault();closeHelp();});
    dialog.addEventListener('click',function(event){if(event.target===dialog){var box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)closeHelp();}});
    dialog.addEventListener('keydown',function(event){event.stopPropagation();});

    var frame=0,lastDocument='';
    function polishTitles(root){
      if(root.nodeType!==1)return;
      var nodes=[root].concat(Array.prototype.slice.call(root.querySelectorAll('[title]')));
      nodes.forEach(function(node){
        var title=node.getAttribute('title');if(title){var translated=translate(title);if(title!==translated)node.setAttribute('title',translated);
          if(node.tagName==='BUTTON'&&!node.getAttribute('aria-label'))node.setAttribute('aria-label',translated);}
      });
    }
    function update(){
      frame=0;var doc=app.cD(),hasDoc=app.NJ.length>0;
      if(app.N.classList.contains('has-document')!==hasDoc)app.N.classList.toggle('has-document',hasDoc);
      var text=doc?doc.name+' · '+doc.m+' × '+doc.Q+' 像素':'就绪 · 打开文件，开始创作';
      if(lastDocument!==text){statusText.textContent=text;lastDocument=text;}
    }
    polishTitles(app.N);
    var observer=new MutationObserver(function(records){
      records.forEach(function(record){if(record.type==='attributes')polishTitles(record.target);else record.addedNodes.forEach(polishTitles);});
      if(!frame)frame=requestAnimationFrame(update);
    });
    observer.observe(app.N,{childList:true,subtree:true,attributes:true,attributeFilter:['title']});
    mountColors(app.zs);update();app.UN();
  }
  window.OnlinePS={t:translate,mount:mount,colors:mountColors,sizeTools:sizeTools,toolIcon:toolIcon};
}());