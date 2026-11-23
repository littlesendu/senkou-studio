// MDZ+ Reimagined - main menu extras (round 18, user 2026-10-14):
//   - the CHANGELOG panel: shown once at the start (until "Do not show again" for this changelog), and from its button on the
//     main menu (images/mdz_r18/UI_game_Buttons_eyefree.png, above the Character button). The text is changelog.txt next to
//     index.html (plain text: edit it for a new build; its first line is the panel's title, and a changed first line shows the
//     panel again to everyone who hid the old one). Its frame: images/mdz_r18/UI_Window_lable_bg.png.
//   (the credit line under the Credits button is the game's own text since round 20: patch 97b A)
// Drawn over the game's canvas (DOM), placed from the game's own menu buttons every half second; shown only on the main menu.
(function () {
    "use strict";
    var HIDE_KEY = "mdz_changelog_hidden", BG = "images/mdz_r18/UI_Window_lable_bg.png", BTN = "images/mdz_r18/UI_game_Buttons_eyefree.png";
    var text = null, title = "", panel = null, button = null, shownOnce = false;

    // the runtime, looked up once (the anti-cheat checks every read of cr_getC2Runtime)
    var RT = null;
    function rt() { if (RT) return RT; try { var f = window.cr_getC2Runtime; RT = f ? f() || null : null; } catch (e) { RT = null; } return RT; }
    function glob(r, name) { var v = (r && r.tD || []).find(function (q) { return q && q.name === name; }); return v ? v.data : undefined; }
    function tr(en) { var r = rt(), lang = glob(r, "Language"); try { return typeof mdzTr === "function" ? mdzTr(lang, en) : en; } catch (e) { return en; } }
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
    // a menu object's box on the page (its layer's view)
    function boxOf(q) {
        var cv = document.getElementById("c2canvas"); if (!cv || !q || !q.C) return null;
        if (q.la) q.la();
        var L = q.C, z = L.Lc(), k = q.ka, rc = cv.getBoundingClientRect();
        var X = function (v) { return rc.left + ((v - (L.Ca + L.Ha) / 2) * z + cv.width / 2) * rc.width / cv.width; };
        var Y = function (v) { return rc.top + ((v - (L.Da + L.Ga) / 2) * z + cv.height / 2) * rc.height / cv.height; };
        return { l: X(k.left), t: Y(k.top), r: X(k.right), b: Y(k.bottom) };
    }
    function load(done) {
        if (text !== null) { done(); return; }
        var x = new XMLHttpRequest();
        x.overrideMimeType("text/plain; charset=utf-8");
        x.open("GET", "changelog.txt", true);
        x.onreadystatechange = function () {
            if (x.readyState !== 4) return;
            text = (x.status === 200 || x.status === 0) ? String(x.responseText || "").replace(/\r\n/g, "\n") : "";
            title = (text.split("\n")[0] || "").trim();
            done();
        };
        x.onerror = function () { text = ""; done(); };
        x.send(null);
    }
    function css() {
        if (document.getElementById("mdz-menu-extras-css")) return;
        var s = document.createElement("style"); s.id = "mdz-menu-extras-css";
        s.textContent =
            "#mdz-cl{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(680px,92vw);height:min(470px,86vh);z-index:9000;" +
            "box-sizing:border-box;padding:18px 20px 14px;border:14px solid transparent;border-image:url(" + BG + ") 14 fill stretch;image-rendering:pixelated;" +
            "display:flex;flex-direction:column;font-family:'Times New Roman',serif;color:#231f18;box-shadow:0 6px 24px rgba(0,0,0,.6)}" +
            "#mdz-cl h1{margin:0 0 8px;font-size:clamp(15px,2.6vh,22px);text-align:center;font-weight:bold}" +
            "#mdz-cl pre{flex:1;margin:0;overflow:auto;white-space:pre-wrap;font-family:inherit;font-size:clamp(11px,2vh,15px);line-height:1.35;" +
            "padding:6px 8px;background:rgba(0,0,0,.06);border:1px solid rgba(35,31,24,.25);-webkit-overflow-scrolling:touch}" +
            "#mdz-cl .row{display:flex;align-items:center;justify-content:space-between;margin-top:10px;gap:10px}" +
            "#mdz-cl label{display:flex;align-items:center;gap:6px;font-size:clamp(12px,2vh,15px);cursor:pointer;user-select:none}" +
            "#mdz-cl input{width:18px;height:18px}" +
            "#mdz-cl button{font-family:inherit;font-size:clamp(13px,2.2vh,16px);padding:5px 22px;color:#f1e7d4;background:#5a4632;border:2px solid #2d2217;border-radius:3px;cursor:pointer}" +
            "#mdz-cl-btn{position:fixed;z-index:8999;width:40px;height:40px;background:url(" + BTN + ") center/contain no-repeat;image-rendering:pixelated;cursor:pointer;display:none}";
        document.head.appendChild(s);
    }
    function open() {
        css();
        load(function () {
            if (panel) panel.remove();
            panel = document.createElement("div"); panel.id = "mdz-cl";
            var h = document.createElement("h1"); h.textContent = title || tr("What's new");
            var pre = document.createElement("pre"); pre.textContent = text ? text.split("\n").slice(1).join("\n").replace(/^\n+/, "") : tr("No changelog in this build.");
            var row = document.createElement("div"); row.className = "row";
            var lab = document.createElement("label"), cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = lsGet(HIDE_KEY) === title;
            lab.appendChild(cb); lab.appendChild(document.createTextNode(tr("Do not show again")));
            var close = document.createElement("button"); close.textContent = tr("Close");
            close.onclick = function () { if (cb.checked) lsSet(HIDE_KEY, title); else lsSet(HIDE_KEY, ""); panel.remove(); panel = null; };
            row.appendChild(lab); row.appendChild(close);
            panel.appendChild(h); panel.appendChild(pre); panel.appendChild(row);
            // every part of a press stays in the panel (the game also acts on the release: pointerup / touchend on the document)
            ["pointerdown", "pointerup", "pointermove", "pointercancel", "touchstart", "touchend", "touchmove", "touchcancel", "mousedown", "mouseup", "mousemove",
                "click", "dblclick", "contextmenu", "wheel"].forEach(function (t) { panel.addEventListener(t, function (e) { e.stopPropagation(); }, { passive: true }); });
            document.body.appendChild(panel);
        });
    }
    window.MDZChangelog = { open: open };
    // every half second: on the main menu the button (above the Character button);
    // the first time the main menu shows: the panel, unless hidden for this changelog
    setInterval(function () {
        var r = rt(); if (!r || !r.wa) return;
        var onMain = r.wa.name === "Menu" && glob(r, "menu_section") === "main";
        css();
        if (!button) { button = document.createElement("div"); button.id = "mdz-cl-btn"; button.title = tr("Changelog"); button.onclick = open;
            ["pointerdown", "pointerup", "touchstart", "touchend", "mousedown", "mouseup", "click"].forEach(function (t) { button.addEventListener(t, function (e) { e.stopPropagation(); }, { passive: true }); });
            document.body.appendChild(button); }
        var plates = (r.S[630] && r.S[630].q) || [], ch = null, wiki = null, i;
        for (i = 0; i < plates.length; i++) if (plates[i].visible) { if (Number(plates[i].cc[0]) === 7600) ch = plates[i]; else if (Number(plates[i].cc[0]) === 159) wiki = plates[i]; }
        var cb = ch ? boxOf(ch) : null;
        // the Character plate hidden (multiplayer turned off: "Continue Singleplayer"): the same spot, one plate above MDZ+ WIKI
        if (!cb && wiki) { var wb = boxOf(wiki); if (wb) { var up = (wb.b - wb.t) * 40 / 39; cb = { l: wb.l, r: wb.r, t: wb.t - up, b: wb.b - up }; } }
        if (onMain && cb) { var sz = Math.max(28, Math.min(48, (cb.b - cb.t) * 1.15)); button.style.width = button.style.height = sz + "px"; button.style.left = (Math.min(cb.r, window.innerWidth) - sz - 6) + "px"; button.style.top = (cb.t - sz - 8) + "px"; button.style.display = "block"; }
        else button.style.display = "none";
        if (onMain && !shownOnce) {
            shownOnce = true;
            if (!navigator.webdriver) load(function () { if (title && lsGet(HIDE_KEY) !== title) open(); });   // (not under test automation: the probes tap the canvas)
        }
        if (!onMain && panel && r.wa.name !== "Menu") { panel.remove(); panel = null; }
    }, 500);
})();
