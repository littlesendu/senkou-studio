/* Senkou UI adapter for the user-provided editor bundle. Vendor licensing is unchanged. */
(function () {
  'use strict';
  var ui = window.OnlinePS;
  var installed = false;

  ui.nativeColors = function (toolbar) {
    if (!toolbar.colorControls) {
      var controls = document.createElement('div');
      controls.className = 'color-controls native-color-controls';
      controls.setAttribute('role', 'group');
      controls.setAttribute('aria-label', '前景色和背景色');
      toolbar.colorControls = controls;
      var canvas = toolbar.GJ._;
      canvas.setAttribute('aria-hidden', 'true');
      controls.appendChild(canvas);
      toolbar.GJ.senkouCompact = true;
      toolbar.GJ.du();
      [
        ['foreground-hit', '设置前景色', 0, ''],
        ['background-hit', '设置背景色', 1, ''],
        ['color-swap', '交换前景色和背景色', 2, '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3h9v9m-3-3 3 3 3-3M6 0 3 3l3 3"/></svg>'],
        ['color-reset', '恢复默认黑白色', 3, '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path fill="#d7dcda" d="M6 6h8v8H6z"/><path fill="#191a1d" d="M2 2h8v8H2z"/></svg>']
      ].forEach(function (item) {
        var button = document.createElement('button');
        button.className = 'switch ' + item[0]; button.type = 'button'; button.title = item[1];
        button.setAttribute('aria-label', item[1]); button.innerHTML = item[3];
        button.addEventListener('pointerdown', function (event) { event.stopPropagation(); });
        button.addEventListener('click', function (event) { event.stopPropagation(); toolbar.GJ.zu(item[2]); });
        controls.appendChild(button);
      });
    }
    // Tool changes rebuild the group; retain one set of native color actions.
    toolbar.colorControls.prepend(toolbar.GJ._);
    toolbar._.appendChild(toolbar.colorControls);
  };

  ui.install = function (native) {
    if (installed) return;
    installed = true;
    ui.installIcons(native);
    ui.installSelection(native);
    ui.installAI(native.AI);
    var applyTheme = native.Theme.aEM;
    native.Theme.aEM = function (index) {
      var result = applyTheme.apply(this, arguments);
      document.documentElement.dataset.editorTheme = String(index);
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--ui-surface').trim();
      return result;
    };
    // Remove vendor website / installation entries before menu objects and shortcuts are built.
    function cleanMenus(items, actions) {
      for (var i = items.length - 1; i >= 0; i--) {
        var item = items[i], action = actions && actions[i], data = action && action.d;
        var caption = ui.t(native.Language.get(item.name));
        if (/Photopea|Vectorpea|PeaMark/i.test(caption) || data && (data.G3 === 'aboutpp' || data.G3 === 'peamark' || /photopea\.com|vectorpea\.com/i.test(data.link || ''))) {
          items.splice(i, 1); if (actions) actions.splice(i, 1); continue;
        }
        if (item.sub) cleanMenus(item.sub, action && action.sub);
      }
    }
    native.Topbar.data.forEach(function (group) { cleanMenus(group.items, group.dJ); if (group.items.length) group.items[group.items.length - 1].hy = false; });
    var drawColors = native.Color.prototype.du;
    native.Color.prototype.du = function () {
      drawColors.apply(this, arguments);
      if (!this.senkouCompact) return;
      var context = this._.getContext("2d"), edge = this.mb - this.a7G;
      // Remove the engine's tiny swap/reset drawings underneath our accessible buttons.
      context.clearRect(this.a7G, 0, edge, edge);
      context.clearRect(0, this.a7G, edge, edge);
    };
    var menu = native.ContextMenu.prototype;
    var enter = menu.Y$, leave = menu.aGK, expand = menu.a1m;
    menu.Y$ = function (event) {
      if (event.relatedTarget && event.currentTarget.contains(event.relatedTarget)) return;
      var index = this.Z5.indexOf(event.currentTarget);
      if (this.kF && this.kF === this._J[index] && this.kF._.isConnected) { this.HZ(); return; }
      return enter.call(this, event);
    };
    menu.aGK = function (event) {
      if (event.relatedTarget && event.currentTarget.contains(event.relatedTarget)) return;
      return leave.call(this, event);
    };
    menu.a1m = function () {
      if (this.kF && this.kF === this._J[this.ao7] && this.kF._.isConnected) { this.HZ(); return; }
      return expand.call(this);
    };

    var tool = native.ToolButton.prototype, title = tool.T;
    tool.T = function () {
      title.call(this);
      var caption = native.Language.get(this._h), key = this.Bs ? this.Bs.t7 : '';
      var svg = ui.toolIcon(caption, key, this.Tg);
      if (svg && !this._.querySelector('.editor-tool-icon')) {
        var holder = document.createElement('span'); holder.innerHTML = svg;
        if (this._.firstChild) this._.replaceChild(holder.firstChild, this._.firstChild);
      }
      this._.setAttribute('aria-label', this._.title);
      this._.dataset.tool = this.Tg;
    };

    var toolbar = native.Toolbar.prototype, rebuild = toolbar._N;
    toolbar._N = function () {
      var result = rebuild.apply(this, arguments);
      if (this.GJ) ui.nativeColors(this);
      return result;
    };
    toolbar.Ru = function (width, height) {
      this.gK = height;
      if (this.agj.Jo && !this.senkouSized) { this.aIa(); this._N(); this.senkouSized = true; }
      this._.style.cssText = 'height:' + Math.max(0, height - 2) + 'px;width:45px;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;';
      this.PD.style.cssText = 'width:44px;min-height:0;flex:1;overflow-y:auto;overflow-x:hidden;box-sizing:border-box;';
    };
    toolbar.wG = function () { return 45; };

    // Every brush-based tool uses this native preset control, including erasers and retouching tools.
    var preset = native.Preset.prototype, presetTitle = preset.T, showPreset = preset.vZ;
    preset.T = function () {
      presetTitle.call(this);
      var button = this.t;
      if (!button || button.senkouPreset) return;
      button.senkouPreset = true;
      button.setAttribute('aria-label', '调整大小、硬度与预设');
      button.setAttribute('aria-haspopup', 'dialog');
      var control = this;
      button.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
          event.preventDefault(); event.stopPropagation(); control.vZ(event);
        }
      });
    };
    preset.vZ = function () {
      var result = showPreset.apply(this, arguments);
      if (this.B7._.isConnected) {
        this.B7._.setAttribute('role', 'dialog');
        this.B7._.setAttribute('aria-label', '工具大小与预设');
      }
      return result;
    };
    var lookupText = native.Language.Cw;
    native.Language.Cw = function () { return ui.t(lookupText.apply(this, arguments)); };
    var getText = native.Language.get;
    native.Language.get = function () { return ui.t(getText.apply(this, arguments)); };
  };

  ui.start = function (app) {
    var attempts = 0;
    function ready() {
      if (window.editorBootFailed) return;
      if (!app.rw || !app.XS.Sr) {
        if (++attempts < 1200) window.setTimeout(ready, 50);
        else if (window.editorBootFail) window.editorBootFail();
        return;
      }
      // Older saved workspaces may predate the native channels / paths panels.
      if (window.locStor.getItem('senkouPanelTabs') !== '2') {
        [2, 16, 17].forEach(function (id) { if (app.j.Mc.indexOf(id) < 0) app.j.Mc.push(id); });
        app.CP.du();
        window.locStor.setItem('senkouPanelTabs', '2');
      }
      var panelWidth = app.CP.wG;
      app.CP.wG = function () { return window.innerWidth <= 900 ? 0 : panelWidth.apply(this, arguments); };
      app._.classList.add('photopea');
      app.qn._.parentElement.classList.add('workspace-header-content');
      app.XS.BF.classList.add('intro');
      app.XS.BF.classList.remove('storageset', 'flexrow');
      var create = document.createElement('button'); create.type = 'button';
      create.addEventListener('click', function () { app.XS.Sr.newProject(); });
      var adapter = {
        N: app._, NN: {N: app.qn._},
        AK: {N: app.CP._, PM: [null, {ss: function () { app.CP.EV[1].Fo(); }}]},
        UN: function () { app.hb(); }, uI: {O$: function (files) { app.xk.pA(files); }},
        ui: {Pk: app.XS.BF, H$: app.XS.u4, ko: [{N: create, iu: '新建画布'}]},
        cD: function () { var doc = app.xK(); return doc ? {name: doc.name, m: doc.r, Q: doc.B} : null; },
        zs: app.Hs
      };
      Object.defineProperty(adapter, 'NJ', {get: function () { return app.r9; }});
      ui.mount(adapter);
      ui.startAI(app);
      app.Hs.T();
      document.documentElement.style.setProperty('--workspace-top', '84px');
      app.hb();
      ui.polishControls(app._);
      document.body.dataset.editorVersion = '20261025-ai9';
      var boot = document.getElementById('editor-boot');
      if (boot) {
        boot.setAttribute('aria-hidden', 'true');
        boot.style.pointerEvents = 'none';
        requestAnimationFrame(function () { boot.style.opacity = '0'; });
        window.setTimeout(function () { boot.hidden = true; }, 180);
      }
    }
    ready();
  };
}());
