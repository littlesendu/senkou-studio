// MDZ P2P (round 26; the user 2026-10-23: "similarly to among us multiplayer thingy peerjs or something" - "Build our own P2P").
// docs/native-mp/P2P-FEASIBILITY.md, P2P.md
//
// A session with no relay: the host's page IS the hub. Players connect straight to it over WebRTC data channels.
//   - signaling: the PeerJS server protocol (a WebSocket: OPEN / OFFER / ANSWER / CANDIDATE / LEAVE / EXPIRE / HEARTBEAT) with a
//     client of our own - PeerJS Cloud (0.peerjs.com) by default, any peerjs-server, or the tests' tools/test/p2p-signal.cjs
//     (localStorage "mdz_p2p_signal" = its address, "mdz_p2p_key" = its key)
//   - a room is the peer id "mdz-room-<slug of the server name>"; a player is "mdz-c-<random>"; the player makes the offer
//   - the in-page hub: server/hub.cjs's room logic (np1: hello / welcome / refused / joined / left / msg / kick / queue / ping,
//     unique names, the far-pose folding and the backpressure of round 9, the flood limit), one room
//   - MDZNet opens "p2p:<name>" (join) or "p2p-host:<name>" (the host's own loopback) through MDZP2P.open: an object with a
//     WebSocket's shape (send, close, onopen, onmessage, onclose, onerror, readyState, bufferedAmount)
//   - a message over 16000 characters goes in parts ("C<id>,<i>,<n>,<part>"; whole ones "M<text>")
//   - the room list (optional): the host announces its room to the registry (server/registry/worker-d1.js) every 30 s and
//     removes it on close; TURN servers from its /ice when it has them (localStorage "mdz_registry" overrides REGISTRY_URL;
//     "mdz_p2p_list" = "0" keeps a room unlisted)
// Keep the hub part in step with server/hub.cjs and the APK's MDZHost.java.
(function () {
    "use strict";
    var VERSION = "np1", PREFIX = "mdz-room-";
    var REGISTRY_URL = "https://mdzreimagined-rooms.civertzero.workers.dev";   // the user's registry Worker (server/registry/worker-d1.js, deployed 2026-10-24)
    var SIGNAL_URL = "wss://0.peerjs.com:443/peerjs", SIGNAL_KEY = "peerjs";
    var STUN = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }];
    var CHUNK = 16000, HEARTBEAT_MS = 5000, DIAL_MS = 20000, LIST_MS = 30000;
    var MAX_PLAYERS = 120, QUEUE_MAX = 50, FLOOD_MSGS = 900, FLOOD_BYTES = 6 * 1024 * 1024, BP_SOFT = 64 * 1024;

    function ls(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
    function slug(name) { var s = String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").slice(0, 40).replace(/-+$/, ""); return s || "room"; }
    function roomId(name) { return PREFIX + slug(name); }
    function rand(n) { var a = new Uint8Array(n || 8), s = ""; (window.crypto || window.msCrypto).getRandomValues(a); for (var i = 0; i < a.length; i++) s += ("0" + a[i].toString(16)).slice(-2); return s; }
    function signalUrl() { return String(ls("mdz_p2p_signal") || SIGNAL_URL).replace(/\/+$/, ""); }
    function registryUrl() { return String(ls("mdz_registry") || REGISTRY_URL || "").replace(/\/+$/, ""); }
    function later(f) { Promise.resolve().then(f); }
    function plain(x) { return x && typeof x.toJSON === "function" ? x.toJSON() : x; }

    // ---- TURN / STUN ------------------------------------------------------------------------------------------------
    var ICE = null, ICE_AT = 0;
    function iceLoad() {
        var base = registryUrl(); if (!base || (ICE && Date.now() - ICE_AT < 18000000) || !window.fetch) return;
        try { fetch(base + "/ice", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
            if (j && Array.isArray(j.iceServers) && j.iceServers.length) { ICE = j.iceServers; ICE_AT = Date.now(); }
        }).catch(function () { }); } catch (e) { }
    }
    function iceServers() { return (ICE || []).concat(STUN); }

    // ---- signaling (the PeerJS server protocol) ---------------------------------------------------------------------
    // h: open(), msg(m) for OFFER / ANSWER / CANDIDATE / LEAVE / EXPIRE, fail(reason) before or instead of OPEN, lost() after
    function Signal(id, h) {
        var self = this; this.id = id; this.h = h; this.closed = false; this.isOpen = false;
        var url = signalUrl() + "?key=" + encodeURIComponent(ls("mdz_p2p_key") || SIGNAL_KEY) + "&id=" + encodeURIComponent(id) + "&token=" + rand(6) + "&version=1.5.4";
        try { this.ws = new WebSocket(url); } catch (e) { later(function () { h.fail("signal: " + e.message); }); return; }
        this.ws.onmessage = function (ev) {
            var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
            if (m.type === "OPEN") { if (!self.isOpen) { self.isOpen = true; if (h.open) h.open(); } }
            else if (m.type === "ID-TAKEN") { self.close(); h.fail("taken"); }
            else if (m.type === "ERROR") { self.close(); h.fail("signal: " + (m.payload && m.payload.msg || "error")); }
            else if (h.msg) h.msg(m);
        };
        this.ws.onerror = function () { };
        this.ws.onclose = function () { if (self.closed) return; self.closed = true; clearInterval(self.hb); if (self.isOpen) { if (h.lost) h.lost(); } else h.fail("signal: no answer"); };
        this.hb = setInterval(function () { self.raw({ type: "HEARTBEAT" }); }, HEARTBEAT_MS);
    }
    Signal.prototype.raw = function (o) { try { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); } catch (e) { } };
    Signal.prototype.send = function (type, dst, payload) { this.raw({ type: type, dst: dst, payload: payload }); };
    Signal.prototype.close = function () { if (this.closed) return; this.closed = true; clearInterval(this.hb); try { this.ws.close(); } catch (e) { } };

    // ---- a data channel with framing ----------------------------------------------------------------------------------
    // h: open(), msg(text), close()
    function Pipe(pc, dc, h) {
        var self = this; this.pc = pc; this.dc = dc; this.h = h; this.parts = {}; this.seq = 0; this.closed = false;
        try { dc.bufferedAmountLowThreshold = BP_SOFT / 2; } catch (e) { }
        dc.onopen = function () { if (h.open) h.open(); };
        dc.onmessage = function (ev) {
            var s = String(ev.data), k = s.charAt(0);
            if (k === "M") { h.msg(s.slice(1)); return; }
            if (k !== "C") return;
            var a = s.indexOf(","), b = s.indexOf(",", a + 1), c = s.indexOf(",", b + 1); if (a < 0 || b < 0 || c < 0) return;
            var id = s.slice(1, a), i = Number(s.slice(a + 1, b)), n = Number(s.slice(b + 1, c));
            var e = self.parts[id] || (self.parts[id] = { n: n, got: 0, p: [] });
            if (e.p[i] === undefined) { e.p[i] = s.slice(c + 1); e.got++; }
            if (e.got >= e.n) { delete self.parts[id]; h.msg(e.p.join("")); }
        };
        dc.onbufferedamountlow = function () { if (h.drain) h.drain(); };
        dc.onclose = function () { self.end(); };
        dc.onerror = function () { };
        pc.onconnectionstatechange = function () { if (/^(failed|closed)$/.test(pc.connectionState)) self.end(); };
    }
    Pipe.prototype.send = function (s) {
        var dc = this.dc; if (this.closed || !dc || dc.readyState !== "open") return;
        try {
            if (s.length <= CHUNK) { dc.send("M" + s); return; }
            var id = (++this.seq).toString(36), n = Math.ceil(s.length / CHUNK);
            for (var i = 0; i < n; i++) dc.send("C" + id + "," + i + "," + n + "," + s.slice(i * CHUNK, (i + 1) * CHUNK));
        } catch (e) { this.end(); }      // (the channel's buffer full: the link is lost, as a WebSocket that cannot keep up)
    };
    Pipe.prototype.buffered = function () { return this.dc ? Number(this.dc.bufferedAmount) || 0 : 0; };
    Pipe.prototype.end = function () {
        if (this.closed) return; this.closed = true;
        try { this.dc.close(); } catch (e) { } try { this.pc.close(); } catch (e) { }
        if (this.h.close) this.h.close();
    };

    // an RTCPeerConnection's candidates that come before its remote description wait
    function Rtc(sig, dst, cid) {
        var self = this; this.sig = sig; this.dst = dst; this.cid = cid; this.remote = false; this.pend = [];
        this.pc = new RTCPeerConnection({ iceServers: iceServers() });
        this.pc.onicecandidate = function (e) { if (e.candidate) sig.send("CANDIDATE", dst, { candidate: plain(e.candidate), type: "data", connectionId: cid }); };
    }
    Rtc.prototype.remoteSet = function (sdp) {
        var self = this;
        return this.pc.setRemoteDescription(sdp).then(function () { self.remote = true; var p = self.pend; self.pend = []; p.forEach(function (c) { self.pc.addIceCandidate(c).catch(function () { }); }); });
    };
    Rtc.prototype.candidate = function (c) { if (!c) return; if (this.remote) this.pc.addIceCandidate(c).catch(function () { }); else this.pend.push(c); };

    // ---- a player's connection: "p2p:<name>" ------------------------------------------------------------------------------
    function ClientSocket(name) {
        var self = this; this.readyState = 0; this.url = "p2p:" + name; this.onopen = this.onmessage = this.onclose = this.onerror = null;
        var dst = roomId(name), rtc = null, done = false, timer = 0;
        var fail = function (why) {
            if (done) return; done = true; clearTimeout(timer); self.reason = why;
            if (self.sig) self.sig.close(); if (self.pipe) { self.pipe.h = {}; self.pipe.end(); } else if (rtc) try { rtc.pc.close(); } catch (e) { }
            self.readyState = 3; if (self.onerror) self.onerror({ message: why }); if (self.onclose) self.onclose({ code: 1006, reason: why });
        };
        iceLoad();
        timer = setTimeout(function () { if (self.readyState === 0) fail("no answer from the room \"" + name + "\""); }, DIAL_MS);
        this.sig = new Signal("mdz-c-" + rand(8), {
            open: function () {
                var cid = "dc_" + rand(6);
                try { rtc = new Rtc(self.sig, dst, cid); } catch (e) { fail("WebRTC: " + e.message); return; }
                var dc = rtc.pc.createDataChannel("mdz", { ordered: true });
                self.pipe = new Pipe(rtc.pc, dc, {
                    open: function () { if (done) return; clearTimeout(timer); self.readyState = 1; self.sig.close(); if (self.onopen) self.onopen({}); },
                    msg: function (text) { if (self.readyState === 1 && self.onmessage) self.onmessage({ data: text }); },
                    close: function () { if (self.readyState === 1) { self.readyState = 3; done = true; if (self.onclose) self.onclose({ code: 1000 }); } else fail("WebRTC link failed"); }
                });
                rtc.pc.createOffer().then(function (o) { return rtc.pc.setLocalDescription(o); }).then(function () {
                    self.sig.send("OFFER", dst, { sdp: plain(rtc.pc.localDescription), type: "data", connectionId: cid, label: "mdz", reliable: true, serialization: "raw" });
                }).catch(function (e) { fail("WebRTC: " + e.message); });
            },
            msg: function (m) {
                var p = m.payload || {};
                if (m.type === "EXPIRE" || (m.type === "LEAVE" && m.src === dst)) { if (self.readyState === 0) fail("no room \"" + name + "\" is open"); return; }
                if (!rtc || p.connectionId !== rtc.cid) return;
                if (m.type === "ANSWER") rtc.remoteSet(p.sdp).catch(function (e) { fail("WebRTC: " + e.message); });
                else if (m.type === "CANDIDATE") rtc.candidate(p.candidate);
            },
            fail: function (why) { if (self.readyState === 0) fail(why === "taken" ? "try again" : why); }
        });
    }
    ClientSocket.prototype.send = function (s) { if (this.readyState === 1 && this.pipe) this.pipe.send(String(s)); };
    ClientSocket.prototype.close = function () {
        if (this.readyState === 3) return; var self = this; this.readyState = 3;
        if (this.sig) this.sig.close(); if (this.pipe) { this.pipe.h = {}; this.pipe.end(); }
        setTimeout(function () { if (self.onclose) self.onclose({ code: 1000 }); }, 0);
    };
    Object.defineProperty(ClientSocket.prototype, "bufferedAmount", { get: function () { return this.pipe ? this.pipe.buffered() : 0; } });

    // ---- the in-page hub (server/hub.cjs, one room) ------------------------------------------------------------------------
    var hub = null;
    function Hub(name) {
        this.name = name; this.peerId = roomId(name); this.room = null; this.links = {}; this.conns = [];
        var self = this; this.flushT = setInterval(function () { self.conns.forEach(function (c) { self.flushPoses(c); }); }, 100);
    }
    // a connection: { open, out(text), end(), buffered(), ip, uid, ... } as hub.cjs's
    Hub.prototype.send = function (c, obj) { if (c && c.open) c.out(JSON.stringify(obj)); };
    Hub.prototype.wsClose = function (c) { if (!c || !c.open) return; c.open = false; this.onClose(c); c.end(); };
    Hub.prototype.refuse = function (c, reason, text) { var self = this; this.send(c, text ? { t: "refused", reason: reason, text: text } : { t: "refused", reason: reason }); setTimeout(function () { self.wsClose(c); }, 50); };
    Hub.prototype.clientsOf = function (r) { var a = []; r.clients.forEach(function (x) { a.push(x); }); return a; };
    Hub.prototype.everyone = function (r) { return [r.host].concat(this.clientsOf(r)); };
    Hub.prototype.roomInfo = function (r) {
        var m = r.meta || {};
        return { id: r.id, name: r.name, max: r.ded ? r.max - 1 : r.max, pvp: r.pvp, locked: !!r.pw, players: r.ded ? r.clients.size : 1 + r.clients.size, since: r.at,
            host: m.host || (r.host && r.host.name) || "", lvl: m.lvl === undefined ? null : m.lvl, rows: m.rows || 0, time: m.time === undefined ? null : m.time,
            region: m.region || "", entry: r.entry || 0, queue: r.queue.length, ded: !!r.ded, itemAck: r.itemAck ? 1 : 0, secureRelay: r.secureRelay ? 1 : 0, gv: r.gv || "", p2p: 1 };
    };
    Hub.prototype.playersOf = function (r) { return [{ id: r.host.id, name: r.host.name }].concat(this.clientsOf(r).map(function (c) { return { id: c.id, name: c.name }; })); };
    Hub.prototype.stateFor = function (source, target, data, at) {
        if (target.role === "host" || !source.xy || !target.xy || Math.hypot(source.xy[0] - target.xy[0], source.xy[1] - target.xy[1]) <= 2200) return true;
        var look = String(data).split("|").slice(2).join("|"), cache = target.farState || (target.farState = {}), last = cache[source.id];
        if (!last || at - last[0] >= 1000 || last[1] !== look) { cache[source.id] = [at, look]; return true; }
        return false;
    };
    Hub.prototype.behind = function (x) { return x.buffered() > BP_SOFT; };
    Hub.prototype.flushPoses = function (x) { var p = x.stPend; if (!p || !x.open || this.behind(x)) return; x.stPend = null; for (var k in p) x.out(p[k]); };
    Hub.prototype.onHello = function (c, m) {
        if (m.ver !== VERSION) return this.refuse(c, "version");
        var name = String(m.name || "Survivor").slice(0, 24), self = this;
        if (m.role === "host") {
            if (!c.loop || this.room) return this.refuse(c, "host_exists");
            var info = m.info || {};
            var r = { id: "r1", name: String(info.name || "MiniDayZ server").slice(0, 90), pw: String(m.pw || ""), max: Math.max(2, Math.min(MAX_PLAYERS, Number(info.max) || 10)), pvp: !!info.pvp,
                host: c, clients: new Map(), seq: 0, at: Date.now(), entry: Math.max(0, Math.min(120, Number(info.entry) || 0)), gv: String(m.gv || "").slice(0, 24),
                meta: { region: String(info.region || "").slice(0, 40) }, queue: [], ded: !!info.ded, itemAck: !!info.itemAck, secureRelay: !!info.secureRelay };
            this.room = r; c.id = "h"; c.name = name; c.room = r; c.role = "host";
            this.send(c, { t: "welcome", id: c.id, host: true, room: this.roomInfo(r), players: this.playersOf(r), now: Date.now() });
            this.listStart();
            return;
        }
        if (m.role !== "client" || c.loop) return this.refuse(c, "bad_hello");
        var r2 = this.room; if (!r2) return this.refuse(c, "no_host");
        if (String(m.gv || "") !== String(r2.gv || "")) return this.refuse(c, "version", "server " + (r2.gv || "older") + ", this game " + (m.gv || "older"));
        if (r2.pw && String(m.pw || "") !== r2.pw) return this.refuse(c, "password");
        c.wantName = name; c.uid = String(m.uid || "").slice(0, 64);
        if (1 + r2.clients.size >= r2.max) {
            if (r2.queue.length >= QUEUE_MAX) return this.refuse(c, "full");
            c.queued = r2; r2.queue.push(c); this.queueTell(r2); return;
        }
        this.admit(c, r2);
    };
    Hub.prototype.queueTell = function (r) { var self = this; r.queue.forEach(function (q, i) { self.send(q, { t: "queue", pos: i + 1, of: r.queue.length }); }); };
    Hub.prototype.admitQueued = function (r) {
        while (r.queue.length && 1 + r.clients.size < r.max) { var q = r.queue.shift(); q.queued = null; if (q.open) this.admit(q, r); }
        this.queueTell(r);
    };
    Hub.prototype.uniqueName = function (r, want) {
        var taken = {}; this.everyone(r).forEach(function (x) { taken[String(x.name || "").toLowerCase()] = 1; });
        if (!taken[want.toLowerCase()]) return want;
        for (var k = 2; ; k++) { var suf = "(" + k + ")", nm = want.slice(0, 24 - suf.length) + suf; if (!taken[nm.toLowerCase()]) return nm; }
    };
    Hub.prototype.admit = function (c, r) {
        var self = this, name = this.uniqueName(r, c.wantName);
        c.id = "p" + (++r.seq); c.name = name; c.room = r; c.role = "client";
        r.clients.set(c.id, c);
        this.send(c, { t: "welcome", id: c.id, host: false, room: this.roomInfo(r), players: this.playersOf(r), name: name, now: Date.now() });
        this.everyone(r).forEach(function (x) { if (x !== c) self.send(x, x === r.host ? { t: "joined", id: c.id, name: name, uid: c.uid, ip: c.ip || "" } : { t: "joined", id: c.id, name: name }); });
        this.listPost("announce");
    };
    Hub.prototype.onMessage = function (c, text) {
        var m; try { m = JSON.parse(text); } catch (e) { return; }
        if (!c.open) return;
        if (c.queued) { if (m.t === "ping") this.send(c, { t: "pong", ts: m.ts }); return; }
        if (!c.room) { if (m.t === "hello") this.onHello(c, m); else this.refuse(c, "bad_hello"); return; }
        var r = c.room, self = this;
        if (c.role === "client" && !c.flooded) {
            var t = Date.now();
            if (!c.fw || t - c.fw > 3000) { c.fw = t; c.fm = 0; c.fb = 0; }
            c.fm++; c.fb += text.length;
            if (c.fm > FLOOD_MSGS || c.fb > FLOOD_BYTES) { c.flooded = true; this.refuse(c, "flood"); return; }
        }
        if (c.flooded) return;
        if (m.t === "ping") return this.send(c, { t: "pong", ts: m.ts });
        if (m.t === "kick" && c.role === "host") { var x = r.clients.get(String(m.id)); if (x) { this.send(x, { t: "refused", reason: m.reason === "banned" ? "banned" : "kicked", text: String(m.text || "").slice(0, 120) }); setTimeout(function () { self.wsClose(x); }, 80); } return; }
        if (m.t === "meta" && c.role === "host") { var d = m.data || {}; r.meta = { lvl: d.lvl === null || d.lvl === undefined ? undefined : Number(d.lvl), rows: Number(d.rows) || 0,
            time: d.time === null || d.time === undefined ? undefined : Number(d.time), region: String(d.region || "").slice(0, 40), host: String(d.host || "").slice(0, 24) }; return; }
        if (m.t === "state" || m.t === "icons") return;      // (for a relay's admin web page: there is none here)
        if (m.t !== "msg") return;
        var out = { t: "msg", from: c.id, tag: String(m.tag), data: m.data };
        var to = String(m.to || (c.role === "host" ? "all" : "host"));
        if (out.tag === "st") { var a = String(m.data).split("|"), px = Number(a[0]), py = Number(a[1]); if (a.length >= 6 && isFinite(px) && isFinite(py)) c.xy = [px, py]; }
        if (to === "all") {
            var wire = JSON.stringify(out), at = Date.now();
            this.everyone(r).forEach(function (y) { if (y !== c && y.open && (out.tag !== "st" || self.stateFor(c, y, m.data, at))) {
                if (out.tag === "st" && (y.stPend || self.behind(y))) (y.stPend || (y.stPend = {}))[c.id] = wire;
                else y.out(wire); } });
        }
        else if (to === "host" || to === "h") this.send(r.host, out);
        else this.send(r.clients.get(to), out);
    };
    Hub.prototype.onClose = function (c) {
        var self = this; this.conns = this.conns.filter(function (x) { return x !== c; });
        if (c.queued) { var qr = c.queued; qr.queue = qr.queue.filter(function (x) { return x !== c; }); c.queued = null; this.queueTell(qr); return; }
        var r = c.room; if (!r) return;
        if (c.role === "host") {
            this.clientsOf(r).forEach(function (x) { self.send(x, { t: "host_left" }); setTimeout(function () { self.wsClose(x); }, 50); });
            r.queue.forEach(function (x) { x.queued = null; self.send(x, { t: "host_left" }); setTimeout(function () { self.wsClose(x); }, 50); }); r.queue = [];
            this.room = null; setTimeout(function () { self.stop(); }, 200);
        } else if (r.clients.delete(c.id)) {
            this.everyone(r).forEach(function (x) { if (x.farState) delete x.farState[c.id]; if (x.stPend) delete x.stPend[c.id]; self.send(x, { t: "left", id: c.id }); });
            this.admitQueued(r); this.listPost("announce");
        }
    };
    Hub.prototype.addConn = function (c) { c.open = true; this.conns.push(c); return c; };
    // a player's offer (through the signaling server): a peer connection and its data channel
    Hub.prototype.onSignal = function (m) {
        var self = this, p = m.payload || {}, key = m.src + "|" + p.connectionId, L = this.links[key];
        if (m.type === "OFFER" && !L) {
            var rtc; try { rtc = new Rtc(this.sig, m.src, p.connectionId); } catch (e) { return; }
            this.links[key] = rtc;
            rtc.pc.ondatachannel = function (ev) {
                var c = self.addConn({ ip: "", peer: m.src });
                var pipe = new Pipe(rtc.pc, ev.channel, {
                    msg: function (text) { self.onMessage(c, text); },
                    close: function () { delete self.links[key]; if (c.open) { c.open = false; self.onClose(c); } },
                    drain: function () { self.flushPoses(c); }
                });
                c.out = function (text) { pipe.send(text); }; c.end = function () { pipe.h.close = null; pipe.end(); delete self.links[key]; }; c.buffered = function () { return pipe.buffered(); };
            };
            rtc.remoteSet(p.sdp).then(function () { return rtc.pc.createAnswer(); }).then(function (a) { return rtc.pc.setLocalDescription(a); }).then(function () {
                self.sig.send("ANSWER", m.src, { sdp: plain(rtc.pc.localDescription), type: "data", connectionId: p.connectionId });
            }).catch(function () { try { rtc.pc.close(); } catch (e) { } delete self.links[key]; });
            // (a link that never opens is dropped)
            setTimeout(function () { var x = self.links[key]; if (x && x.pc.connectionState !== "connected") { try { x.pc.close(); } catch (e) { } delete self.links[key]; } }, DIAL_MS + 5000);
        }
        else if (m.type === "CANDIDATE" && L) L.candidate(p.candidate);
    };
    Hub.prototype.stop = function () {
        if (this.stopped) return; this.stopped = true;
        clearInterval(this.flushT); this.listStop();
        var self = this; this.conns.slice().forEach(function (c) { self.wsClose(c); });
        for (var k in this.links) try { this.links[k].pc.close(); } catch (e) { }
        this.links = {}; if (this.sig) this.sig.close();
        if (hub === this) hub = null;
    };
    // ---- the room list (registry) ----
    function listingOn() { return ls("mdz_p2p_list") !== "0"; }
    Hub.prototype.listStart = function () {
        if (this.listT || !listingOn() || !registryUrl()) return;
        var self = this; this.listKey = rand(16);
        this.listPost("announce"); this.listT = setInterval(function () { self.listPost("announce"); }, LIST_MS);
    };
    Hub.prototype.listPost = function (what) {
        var base = registryUrl(), r = this.room; if (!base || !this.listKey || (what === "announce" && !r)) return;
        var body = { room: slug(this.name), key: this.listKey };
        if (what === "announce") { var ri = this.roomInfo(r); body.name = r.name; body.players = ri.players; body.max = ri.max; body.pvp = !!r.pvp; body.locked = !!r.pw;
            body.region = (r.meta && r.meta.region) || ""; body.ver = VERSION; body.gv = r.gv; body.host = ri.host; body.lvl = ri.lvl; body.time = ri.time; }
        try { fetch(base + "/" + what, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "text/plain" }, keepalive: true }).catch(function () { }); } catch (e) { }
    };
    Hub.prototype.listStop = function () { if (!this.listT) return; clearInterval(this.listT); this.listT = null; this.listPost("remove"); };

    // the host's own MDZNet: "p2p-host:<name>", a loopback into the hub (messages in order, never synchronous)
    function LoopSocket(h) {
        var self = this; this.readyState = 0; this.bufferedAmount = 0; this.onopen = this.onmessage = this.onclose = this.onerror = null;
        this.c = h.addConn({ ip: "", loop: true });
        this.c.out = function (text) { later(function () { if (self.readyState === 1 && self.onmessage) self.onmessage({ data: text }); }); };
        this.c.end = function () { if (self.readyState !== 3) { self.readyState = 3; setTimeout(function () { if (self.onclose) self.onclose({ code: 1000 }); }, 0); } };
        this.c.buffered = function () { return 0; };
        this.hub = h;
        later(function () { if (self.readyState === 0) { self.readyState = 1; if (self.onopen) self.onopen({}); } });
    }
    LoopSocket.prototype.send = function (s) { var self = this, t = String(s); if (this.readyState === 1) later(function () { self.hub.onMessage(self.c, t); }); };
    LoopSocket.prototype.close = function () { if (this.readyState === 3) return; this.readyState = 3; var c = this.c; if (c.open) { c.open = false; this.hub.onClose(c); } var self = this; setTimeout(function () { if (self.onclose) self.onclose({ code: 1000 }); }, 0); };

    // ---- the API -------------------------------------------------------------------------------------------------------------
    // startHub(name, cb): the room's peer id taken at the signaling server -> cb(null, id); cb(reason) otherwise
    function startHub(name, cb) {
        if (hub) hub.stop();
        var h = hub = new Hub(name), answered = false;
        iceLoad();
        var t = setTimeout(function () { if (!answered) { answered = true; h.stop(); cb("the signaling server did not answer"); } }, DIAL_MS);
        // the room's signaling connection; lost later (a network blip, the server restarting): the players in stay connected, and
        // it is opened again (every 5 s, the room's own id - the server may still hold it for a while) so new players can join
        var connect = function (retry) {
            h.sig = new Signal(h.peerId, {
                open: function () { h.sigLost = false; if (answered) return; answered = true; clearTimeout(t); cb(null, h.peerId); },
                msg: function (m) { h.onSignal(m); },
                fail: function (why) {
                    if (!answered) { answered = true; clearTimeout(t); h.stop(); cb(why === "taken" ? "a room named \"" + slug(name) + "\" is already open" : why); return; }
                    if (retry && !h.stopped) setTimeout(function () { if (!h.stopped) connect(true); }, 5000);
                },
                lost: function () { h.sigLost = true; if (!h.stopped) setTimeout(function () { if (!h.stopped) connect(true); }, 3000); }
            });
        };
        connect(false);
    }
    function open(url) {
        var u = String(url || ""), m = /^p2p(-host)?:(.*)$/i.exec(u); if (!m) throw new Error("not a P2P address: " + u);
        if (m[1]) { if (!hub || hub.peerId !== roomId(m[2])) throw new Error("no P2P room started"); return new LoopSocket(hub); }
        return new ClientSocket(m[2]);
    }
    window.MDZP2P = {
        version: VERSION, roomId: roomId, slug: slug, isRoom: function (a) { return /^p2p:/i.test(String(a || "")); },
        open: open, startHub: startHub, stopHub: function () { if (hub) hub.stop(); }, hosting: function () { return !!(hub && hub.room); },
        registry: registryUrl, signal: signalUrl, iceLoad: iceLoad,
        players: function () { return hub && hub.room ? 1 + hub.room.clients.size : 0; }
    };
})();
