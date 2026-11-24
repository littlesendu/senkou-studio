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

  function configureChooser(events) {
    for (const group of events) {
      for (const event of group[7] || []) {
        if (!Array.isArray(event[6])) continue;
        // Redraw the menu on the next tick after the choice. Otherwise the
        // release that selects a card can activate the menu button underneath.
        const saved = event[6].some(a => a[5]?.[0]?.[1]?.[1] === 'ctl_prompt' && a[0] === 1451);
        if (!saved) continue;
        for (const child of event[7] || []) {
          const actions = child[6];
          if (actions?.[0]?.[5]?.[0]?.[1]?.[1] === 'menu_draw_main') {
            actions.unshift([-1, 54, null, 8135000 + actions[0][3] % 1000000, false, [[0, [1, 0.12]]]]);
          }
        }
      }
    }
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
