(() => {
  'use strict';
  const desktop = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const entries = new Map();
  let pack;
  // Start the project transfer alongside the engine scripts. Keep the
  // original Construct loader as the fallback for older browsers and caches.
  let projectDownload = typeof DecompressionStream === 'function'
    ? fetch('project-v1.bin').then(async response => {
        if (!response.ok) return null;
        const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
        const model = await new Response(stream).json();
        return Array.isArray(model?.project) ? model : null;
      }).catch(() => null)
    : null;
  async function fetchPack() {
    const controller = new AbortController();
    // Fall back on a stalled download, but let a slow, progressing one finish.
    let timeout;
    const watchProgress = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => controller.abort(), 12000);
    };
    watchProgress();
    try {
      const response = await fetch('sprites-v1.bin', { signal: controller.signal });
      if (!response.ok) return;
      const reader = response.body.getReader();
      const chunks = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        watchProgress();
      }
      const file = new Blob(chunks);
      const indexSize = new DataView(await file.slice(0, 4).arrayBuffer()).getUint32(0, true);
      const index = JSON.parse(await file.slice(4, 4 + indexSize).text());
      let offset = 4 + indexSize;
      for (const [name, size] of index) {
        if (!Number.isSafeInteger(size) || size <= 0 || offset + size > file.size) throw Error('Invalid sprite pack');
        entries.set(name, [offset, size]);
        offset += size;
      }
      pack = file;
    } catch { entries.clear(); } finally { clearTimeout(timeout); }
  }
  // These edits apply to the 2.3.9 Construct export in memory. Stored
  // controls/language still load through the game's own preferences events.
  function configureLoader(events, chinese) {
    for (const event of events) {
      if (event[0] !== 0) continue;
      const actions = event[6];
      const completed = actions.some(a => a[5]?.[0]?.[1] === 'Menu');
      for (const action of actions) {
        const params = action[5];
        if (chinese && params?.[0]?.[1] === 'Language' && params[1]?.[1]?.[1] === 'EN') {
          params[1][1][1] = 'ZH';
        }
        // Only shorten the logo holds in the "all assets loaded" transition.
        if (completed && action[0] === -1 && action[1] === 54) params[0][1][1] = 0.08;
      }
    }
  }

  // The export draws the chooser on shared menu layers. Storage callbacks can
  // call menu_clear / menu_draw_main after its three pictures already exist.
  // Give the chooser ownership until its original choice handler has finished.
  let eventSid = 761500000;
  const nextSid = () => ++eventSid;
  const choosing = 'web_ctl_choosing';
  const setChoosing = value => [-1, 41, null, nextSid(), false, [[11, choosing], [7, [0, value]]]];
  function visitEvents(events, visit) {
    for (const event of events) {
      if (event[0] !== 0) continue;
      visit(event);
      if (Array.isArray(event[7])) visitEvents(event[7], visit);
    }
  }
  function protectMenu(events) {
    visitEvents(events, event => {
      const fn = event[5].find(c => c[0] === 189 && c[1] === 40)?.[9]?.[0]?.[1]?.[1];
      if (['menu_clear', 'menu_draw_main', 'ui_clear'].includes(fn)) {
        event[5].push([-1, 46, null, 0, false, false, false, nextSid(), false,
          [[11, choosing], [8, 0], [7, [0, 0]]]]);
      }
    });
  }

  function configureChooser(events) {
    for (const group of events) {
      for (const event of group[7] || []) {
        if (!Array.isArray(event[6])) continue;
        // Redraw the menu on the next tick after the choice. Otherwise the
        // release that selects a card can activate the menu button underneath.
        const fn = event[5].find(c => c[0] === 189 && c[1] === 40)?.[9]?.[0]?.[1]?.[1];
        if (fn === 'mdz_ctl_prompt_draw') {
          event[6].unshift(setChoosing(0));
          event[6].push(setChoosing(1));
        }
        const saved = event[6].some(a => a[5]?.[0]?.[1]?.[1] === 'ctl_prompt' && a[0] === 1451);
        if (!saved) continue;
        for (const child of event[7] || []) {
          const actions = child[6];
          if (actions?.[0]?.[5]?.[0]?.[1]?.[1] === 'menu_draw_main') {
            actions.unshift(setChoosing(0));
            actions.unshift([-1, 54, null, 8135000 + actions[0][3] % 1000000, false, [[0, [1, 0.12]]]]);
          }
        }
      }
    }
  }

  function configureViewZoom(events) {
    // Reuse the same distance limits and zoom animation as the two HUD buttons.
    const shortcuts = [];
    visitEvents(events, event => {
      const zoom = event[6].find(a => a[1] === 122 && a[5]?.[0]?.[1] === 'Current_zoom_lvl');
      if (!zoom) return;
      const name = zoom[5][1][1][1] > 0 ? 'web_view_in' : 'web_view_out';
      const trigger = [189, 40, null, 2, false, false, false, nextSid(), false, [[1, [2, name]]]];
      const guards = structuredClone(event[5].filter(c => c[0] === -1 && c[1] === 46));
      guards.forEach(c => { c[7] = nextSid(); });
      const actions = structuredClone(event[6]);
      actions.forEach(a => { a[3] = nextSid(); });
      shortcuts.push([0, null, false, null, nextSid(), [trigger, ...guards], actions]);
    });
    events.push(...shortcuts);
  }

  function configureInteraction(events) {
    // The native pickup handler already checks movement mode, modal inputs and
    // player state. Refresh the nearby use button before deciding what to do.
    let pickup, interact;
    visitEvents(events, event => {
      if (!event[5].some(condition => condition[0] === 180 && condition[1] === 406)) return;
      const call = event[6].at(-1)?.[5]?.[0]?.[1]?.[1];
      if (call === 'mp_key_pickup') pickup = event;
      if (call === 'mp_key_interact') interact = event;
    });
    if (!pickup || !interact) return;
    const [refresh, wait] = structuredClone(interact[6]);
    refresh[3] = nextSid();
    wait[3] = nextSid();
    pickup[6] = [refresh, wait, [231, 289, null, nextSid(), false, [[7, [2, 'MDZNet.inst.webContextAction()']]]]];
  }

  let chineseTables, loadingChinese;
  async function readTable(name) {
    const response = await fetch(name);
    if (!response.ok) throw Error(name);
    const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
    if (xml.querySelector('parsererror')) throw Error(name);
    return new Map(Array.from(xml.documentElement.children, row => [
      Number(row.querySelector('id').textContent), row.querySelector('name').textContent
    ]));
  }
  const ready = fetchPack();
  window.MDZWebPort = {
    desktop,
    takeProject() {
      const download = projectDownload;
      projectDownload = null;
      return download;
    },
    configure(project) {
      // Scale the design viewport as one unit. The chooser is 760 logical
      // pixels wide even when the user's window is smaller.
      project[12] = 3;
      // Hundreds of effects (in two codecs) are available on first use. The
      // title screen does not need to fetch and decode the entire sound bank.
      project[25] = false;
      if (desktop) project[23] = false;
      const chinese = /^zh/i.test(navigator.language);
      for (const sheet of project[6]) {
        if (sheet[0] === 'Menu_Events') sheet[1].push([1, choosing, 0, 0, false, false, nextSid(), false]);
        if (sheet[0] === 'Menu_Events' || sheet[0] === 'MDZ_UI_kit') protectMenu(sheet[1]);
        if (sheet[0] === 'Game_events') configureViewZoom(sheet[1]);
        if (sheet[0] === 'MDZ_MP_round6') configureInteraction(sheet[1]);
        if (sheet[0] === 'Loading_events') configureLoader(sheet[1], chinese);
        if (sheet[0] === 'MDZ_round49_menu') configureChooser(sheet[1]);
        for (const event of sheet[1]) {
          if (event[0] !== 1) continue;
          // The game's saved preferences are applied after these defaults.
          if (desktop && event[1] === 'GUI_control_type') event[3] = 2;
          if (event[1] === 'Language' && chinese) event[3] = 'ZH';
        }
      }
    },
    chineseItemTables() {
      if (!loadingChinese) {
        loadingChinese = Promise.all([readTable('l_zh_items.xml'), readTable('l_zh_new.xml')])
          .then(tables => { chineseTables = tables; })
          .catch(() => { loadingChinese = null; });
      }
      return chineseTables;
    },
    assignSprite(image, name) {
      ready.then(() => {
        const entry = entries.get(name);
        if (!pack || !entry) { image.src = name; return; }
        const url = URL.createObjectURL(pack.slice(entry[0], entry[0] + entry[1], 'image/png'));
        const loaded = () => {
          URL.revokeObjectURL(url);
          image.removeEventListener('error', retry, true);
        };
        const retry = event => {
          event.stopImmediatePropagation();
          loaded();
          image.src = name;
        };
        image.addEventListener('error', retry, true);
        image.addEventListener('load', loaded, { once: true });
        image.src = url;
      });
    }
  };
})();
