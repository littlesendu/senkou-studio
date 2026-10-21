/* Shared line icons and control decoration. Native editing actions remain in the engine. */
(function () {
  'use strict';
  var ui=window.OnlinePS;
  var icons={}, assetNames={};
  function path(d){return '<path d="'+d+'"/>';}
  function circle(x,y,r){return '<circle cx="'+x+'" cy="'+y+'" r="'+r+'"/>';}
  function rect(x,y,w,h,r){return '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+(r||0)+'"/>';}
  function put(name,body){icons[name]=body;}
  put('panels/info',circle(12,12,8.5)+path('M12 11v6M12 7h.01'));
  put('panels/properties',path('M3 6h5m4 0h9M3 12h11m4 0h3M3 18h3m4 0h11')+circle(10,6,2)+circle(16,12,2)+circle(8,18,2));
  put('panels/brush',path('m9 14 9-10a2 2 0 0 1 3 3L11 16M9 14c-4-1-5 2-5 4 0 1-1 2-2 2 6 2 10-1 9-4z'));
  put('panels/character',path('m3 19 6-14 6 14M5 14h8M17 9h5M19.5 9v10'));
  put('panels/paragraph',path('M14 4H9a5 5 0 0 0 0 10h3M12 4v16M17 4v16M8 4h12'));
  put('panels/css',path('m8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16'));
  put('panels/layers',path('m3 8 9-5 9 5-9 5zM3 12l9 5 9-5M3 16l9 5 9-5'));
  put('panels/paths',path('M5 17C5 5 19 19 19 7M5 17h5M19 7h-5')+rect(2.5,14.5,5,5)+rect(16.5,4.5,5,5));
  put('panels/history',path('M4 8V3M4 8h5M4 8a9 9 0 1 1-1 8M12 7v5l4 2'));
  put('panels/actions',path('m9 5 10 7-10 7z')+rect(3,5,2,14));
  put('panels/notes',path('M5 3h14v13l-5 5H5zM14 21v-5h5M8 7h8M8 11h6'));
  put('panels/navigator',rect(3,4,18,16,1.5)+rect(8,8,8,7,1)+path('M12 2v4M12 18v4M1 12h4M19 12h4'));
  put('panels/histogram',path('M3 20h18M5 17v-5M9 17V6M13 17V3M17 17V9M21 17v-3'));
  put('panels/glyphs',path('M6 20 12 4l6 16M8 15h8M3 4h3M18 4h3'));
  put('panels/guideguy',rect(4,4,16,16)+path('M9 4v16M15 4v16M4 9h16M4 15h16'));
  put('panels/layercomps',rect(7,3,14,14,1)+path('M3 7v14h14M10 7h8M10 11h6'));
  put('panels/tpreset',path('m4 20 4-9 8-8 5 5-8 8zM8 11l5 5M4 20l9-4'));
  put('panels/3D',path('m12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10'));
  put('lrs/bin',path('M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7'));
  put('lrs/newlayer',path('M5 3h10l5 5v13H5zM15 3v5h5M9 14h7M12.5 10.5v7'));
  put('lrs/folder',path('M3 6V4h7l2 3h9v13H3z'));
  put('lrs/mask',rect(3,5,18,14,1.5)+circle(12,12,4));
  put('lrs/adj',circle(12,12,9)+'<path d="M12 3a9 9 0 0 1 0 18z" fill="black" stroke="none"/>');
  put('lrs/makesel',rect(4,4,16,16,0).replace('/>',' stroke-dasharray="2 3"/>'));
  put('lrs/makepath',path('m5 18 5-12 9 6-14 6')+rect(2.5,15.5,5,5)+rect(7.5,3.5,5,5)+rect(16.5,9.5,5,5));
  put('lrs/fx',path('M16 4h-2c-2 0-3 2-3 4l-2 11c0 2-1 3-3 3H4M6 10h10m0 4 6 7m0-7-6 7'));
  var chain=path('m10 14 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0');
  put('lrs/chain',chain);put('lrs/link',chain);put('lrs/linkX',chain+path('m9 3 12 18'));
  put('lrs/lock',rect(5,10,14,11,2)+path('M8 10V7a4 4 0 0 1 8 0v3M12 14v3'));
  put('lrs/eye',path('M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z')+circle(12,12,3));
  put('lrs/square',rect(5,5,14,14));
  put('lrs/clipping',path('M4 4v9h10m-4-4 4 4-4 4M16 4h5v17H4v-4'));
  put('lrs/arrow_down',path('m6 9 6 6 6-6'));
  put('lrs/arrow_right',path('m9 6 6 6-6 6'));
  put('tools/corner',path('m10 14 4 4 4-4'));
  put('kb',rect(2,5,20,14,2)+path('M5 9h.01M9 9h.01M13 9h.01M17 9h.01M5 12h.01M9 12h.01M13 12h.01M18 12h.01M7 16h10'));
  put('cross',path('m6 6 12 12M18 6 6 18'));
  put('checkmark',path('m4 12 5 5L20 6'));
  put('bottom',path('M12 3v12m-5-5 5 5 5-5M4 18v3h16v-3'));
  put('reload',path('M20 9a8 8 0 1 0 0 7M20 3v6h-6'));
  put('rotate',path('M20 8a8 8 0 1 0 0 9M20 3v5h-5M9 9h7v7H9z'));
  put('zoomIn',circle(10,10,7)+path('m15 15 6 6M7 10h6M10 7v6'));
  put('zoomOut',circle(10,10,7)+path('m15 15 6 6M7 10h6'));
  put('sym',path('M12 2v20M8 5 3 12l5 7M16 5l5 7-5 7'));
  put('pos',path('M12 2v20M2 12h20m-13-7 3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3m14-6 3 3-3 3'));
  put('trsp3',rect(3,3,18,18)+path('M3 9h18M3 15h18M9 3v18M15 3v18'));
  put('pix_layer',rect(3,4,18,16,1)+circle(8,9,1.5)+path('m3 17 6-5 4 4 3-3 5 4'));
  put('shape_layer',rect(3,3,12,12)+circle(15,15,6));
  put('so_layer',rect(3,3,16,16)+rect(12,12,9,9)+path('m15 16 2-2 2 2m-2-2v5'));
  put('prsS',rect(3,3,18,18)+path('M3 9h18M9 9v12'));
  put('prsO',rect(3,3,18,18)+path('M3 15h18M15 3v12'));
  put('split/vh',rect(3,3,18,18)+path('M12 3v18M3 12h18'));
  put('split/v',rect(3,3,18,18)+path('M12 3v18'));
  put('split/h',rect(3,3,18,18)+path('M3 12h18'));
  put('strg/home',path('m2 11 10-8 10 8M5 9v12h5v-7h4v7h5V9'));
  put('strg/tdevice',rect(2,3,20,14,1)+path('M12 17v4M7 21h10'));
  ['front','union','difference','intersection','xor'].forEach(function(k,i){
    var body=rect(3,3,11,11)+rect(10,10,11,11);
    if(i===1)body=path('M3 3h11v7h7v11H10v-7H3z');
    if(i===2)body=path('M3 3h11v7h-4v4H3z')+rect(10,10,11,11).replace('/>',' stroke-dasharray="2 2"/>');
    if(i===3)body=rect(10,10,4,4)+path('M3 14V3h11M10 21h11V10').replace('/>',' stroke-dasharray="2 2"/>');
    if(i===4)body+=path('m10 10 4 4m0-4-4 4');
    put('set/'+k,body);
  });
  ['h0','h1','h2','hG','v0','v1','v2','vG'].forEach(function(k,i){
    var body=[path('M3 3v18M6 6h14v4H6zM6 14h9v4H6z'),path('M12 2v20M4 6h16v4H4zM7 14h10v4H7z'),path('M21 3v18M4 6h14v4H4zM9 14h9v4H9z'),path('M3 3v18M21 3v18M8 6h8v12H8z')][i%4];
    if(i>3)body='<g transform="translate(24 0) rotate(90)">'+body+'</g>';
    put('align/'+k,body);
  });
  var parLines={left:[17,12,17,10],right:[17,12,17,10],center:[17,11,17,9],jall:[17,17,17,17],jleft:[17,17,17,10],jright:[17,17,17,10],jcenter:[17,17,17,10]};
  Object.keys(parLines).forEach(function(k){put('par/'+k,parLines[k].map(function(w,i){var x=k==='right'||k==='jright'?21-w:k==='center'||k==='jcenter'?(24-w)/2:3;return path('M'+x+' '+(5+i*5)+'h'+w);}).join(''));});
  ['lind','rind','flind','bind','aind'].forEach(function(k,i){put('par/'+k,path('M9 5h12M9 10h12M3 15h18M3 20h18')+path(i%2?'m5 4-3 3 3 3':'m2 4 3 3-3 3'));});
  put('type/bold',path('M6 3v18h7a5 5 0 0 0 0-10H6h6a4 4 0 0 0 0-8H6'));
  put('type/italic',path('M10 3h10M4 21h10M15 3 9 21'));
  put('type/under',path('M6 3v9a6 6 0 0 0 12 0V3M4 22h16'));
  put('type/strike',path('M18 6c-3-5-12-3-12 2 0 4 12 4 12 8 0 5-9 7-13 2M3 12h18'));
  put('type/caps',path('m2 20 5-16 5 16M4 14h6m2 6 5-16 5 16M14 14h6'));
  put('type/scaps',path('m2 20 5-16 5 16M4 14h6m9 1c-7-3-8 8-1 5'));
  put('type/sub',path('m3 4 11 12M14 4 3 16M17 15c6-3 6 2 0 6h5'));
  put('type/sup',path('m3 9 11 12M14 9 3 21M17 3c6-3 6 2 0 6h5'));
  var adjustment={
    brit:circle(12,12,4)+path('M12 1v3M12 20v3M1 12h3M20 12h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2'),
    levl:path('M3 20h18M5 16v-3M9 16V8M13 16V4M17 16v-6M21 16v-2'),
    curv:rect(3,3,18,18)+path('M4 19c9 0 3-14 16-14'),
    expA:circle(12,12,9)+path('M7 12h10M12 7v10'),
    vibA:path('m3 4 9 16 9-16zM7 8h10l-5 9z'),
    hue2:circle(12,12,9)+path('M3 12h18M12 3c-7 5-7 13 0 18 7-5 7-13 0-18z'),
    blnc:path('M12 3v18M6 21h12M4 7h16M5 7l-4 8h8zM19 7l-4 8h8z'),
    blwh:rect(3,4,18,16)+'<path fill="black" stroke="none" d="M3 4h9v16H3z"/>',
    phfl:path('M3 3h18l-7 9v8l-4 2V12z'),
    mixr:circle(8,9,5)+circle(16,9,5)+circle(12,16,5),
    clrL:rect(3,3,18,18)+path('M3 9h18M3 15h18M9 3v18M15 3v18'),
    nvrt:circle(12,12,9)+path('m6 18 12-12M8 7h.01M16 17h.01'),
    post:path('M3 21V9h6V6h6V3h6v18z'),
    thrs:rect(3,3,18,18)+'<path fill="black" stroke="none" d="M3 3h18L3 21z"/>',
    grdm:rect(3,4,18,16)+path('M7 4v16M11 4v16M14 4v16M16 4v16M18 4v16'),
    selc:rect(3,3,18,18)+circle(12,12,4)+path('M12 3v3M12 18v3M3 12h3M18 12h3'),
    rplc:path('M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4')
  };
  Object.keys(adjustment).forEach(function(k){put('adj/'+k,adjustment[k]);});
  put('caps/butt',path('M5 5h14v14H5zM2 3v18M22 3v18'));
  put('caps/round',rect(3,5,18,14,7));
  put('caps/square',rect(3,5,18,14));
  put('joins/bevel',path('M4 21V8l5-5h12M10 21V9h11'));
  put('joins/miter',path('M4 21V3h17M10 21V9h11'));
  put('joins/round',path('M4 21V9a6 6 0 0 1 6-6h11M10 21V9h11'));
  // OpenType and liquify controls share the same stroke, scale and padding as the toolbar.
  put('lig/standard',path('M7 20V7c0-5 6-5 6-1M4 10h12M16 10v10M16 6h.01'));
  put('lig/context',path('M14 7c-6-5-12 2-6 5l5 2c6 4-3 10-8 5M17 3v14c0 4 4 4 5 2M14 8h8'));
  put('lig/discr',path('M12 8c-9-6-13 16 0 11M17 3v14c0 4 4 4 5 2M14 8h8'));
  put('lig/swash',path('M8 20V7c0-6 8-6 8-1M4 10h13M8 15c8-8 18-2 10 6'));
  put('lig/styl_alt',path('M12 20V9c0-7-10-7-10 0M12 12C-1 8-1 23 9 20M20 3v18M17 6l3-3 3 3'));
  put('lig/titling',path('m2 20 6-16 6 16M4 14h8M18 4v16M15 4h6M15 20h6'));
  put('lig/ordinals',path('M5 20V8l-3 3M15 7a3 4 0 1 0 6 0 3 4 0 1 0-6 0M14 14h8'));
  put('lig/fractions',path('M6 11V2L3 5M3 21 21 3M16 15c7-4 8 2 0 7h7'));
  put('liq/smudge',path('M3 4c7 0 1 6 8 6s4 7 10 7m-4-4 4 4-4 4M3 10c5 0 2 6 7 6'));
  put('liq/reconstruct',path('M20 8a8 8 0 1 0 0 9M20 3v5h-5M8 9h8M8 13h8M8 17h8'));
  put('liq/smooth',path('M3 15c4-16 6 16 10 0s6-7 8-6M3 21h18'));
  put('liq/twirl',path('M12 12c-5-5 7-8 7-1 0 12-18 10-16-1C5-2 24 0 22 13'));
  put('liq/shrink',circle(12,12,2)+path('M3 3l5 5M3 8V3h5M21 3l-5 5m0-5h5v5M3 21l5-5m-5 0v5h5M21 21l-5-5m0 5h5v-5'));
  put('liq/blow',circle(12,12,6)+path('M2 6V2h4m-4 0 4 4M18 2h4v4m0-4-4 4M2 18v4h4m-4 0 4-4M18 22h4v-4m0 4-4-4'));
  put('liq/pleft',path('M3 3v18M9 3c-7 6 7 12 0 18M15 3c-7 6 7 12 0 18M21 12H7m4-4-4 4 4 4'));
  var labels={'lrs/bin':'删除','lrs/newlayer':'新建图层','lrs/folder':'新建图层组','lrs/mask':'添加栅格蒙版','lrs/adj':'新建调整图层','lrs/fx':'图层效果','lrs/chain':'链接图层','lrs/link':'链接图层','lrs/lock':'锁定','lrs/eye':'显示或隐藏','kb':'虚拟键盘'};
  ui.installIcons=function(native){
    var assets=native.Assets;
    Object.keys(assets).forEach(function(key){
      var markup;
      if(key.indexOf('tools/')===0 && key!=='tools/corner')markup=ui.toolIcon('', '',key);
      if(!markup && icons[key])markup='<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">'+icons[key]+'</svg>';
      if(!markup)return;
      // Native image elements use the existing monochrome filter; toolbar SVGs use currentColor.
      markup=markup.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" ').replace(/xmlns="http:\/\/www.w3.org\/2000\/svg"\s+xmlns="http:\/\/www.w3.org\/2000\/svg"/,'xmlns="http://www.w3.org/2000/svg"').replace(/currentColor/g,'black');
      assets[key]='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(markup);
      assetNames[assets[key]]=key;
    });
    var image=native.Icons.ba;
    native.Icons.ba=function(key){
      var html=image.apply(this,arguments);
      if(assets[key] && /^data:image\/svg/.test(assets[key]))html=html.replace('<img ','<img data-editor-icon="'+key+'" ');
      return html;
    };
  };
  ui.polishControls=function(root){
    var selector='img,button,[title],.rangedropinput span,.brushbutton span,.panelhead,.contextpanel .label,.window p';
    var nodes=[root].concat(Array.prototype.slice.call(root.querySelectorAll(selector)));
    nodes.forEach(function(el){
      if(el.tagName==='IMG' && !el.dataset.editorIcon){var asset=assetNames[el.getAttribute('src')];if(asset)el.dataset.editorIcon=asset;}
      if(el.matches('button,span') && el.children.length===0 && /^[▼▾]$/.test(el.textContent.trim()) && el.closest('.photopea,.floatcont,.window,.contextpanel')){
        el.classList.add('editor-chevron');
        if(el.tagName==='BUTTON'&&!el.hasAttribute('aria-label'))el.setAttribute('aria-label','展开选项');
      }
      if(el.matches('.contextpanel .label,.window p') && el.children.length===0){var text=el.textContent,translated=ui.t(text);if(text!==translated)el.textContent=translated;}
      if(el.tagName==='BUTTON'){
        var icon=el.querySelector('[data-editor-icon]'),key=icon&&icon.dataset.editorIcon;
        if(labels[key]&&!el.title&&!el.getAttribute('aria-label')){el.title=labels[key];el.setAttribute('aria-label',labels[key]);}
        if(el.closest('.toolbar .tools') && !el.classList.contains('toolbtn'))el.classList.add('editor-utility-button');
      }
    });
  };
}());
