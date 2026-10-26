(function () {
  var TABLE_COUNT = 3;
  var THEME = "billiard160.theme";
  var root = document.documentElement;
  var themeBtn = document.getElementById("themeSwitch");
  function effectiveTheme() {
    var a = root.getAttribute("data-theme");
    if (a === "dark" || a === "light") return a;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  function syncTheme() { themeBtn.setAttribute("aria-checked", String(effectiveTheme() === "dark")); }
  try { var savedTheme = localStorage.getItem(THEME); if (savedTheme === "light" || savedTheme === "dark") root.setAttribute("data-theme", savedTheme); } catch (e) { }
  syncTheme();
  themeBtn.addEventListener("click", function () {
    var next = effectiveTheme() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next); syncTheme();
    try { localStorage.setItem(THEME, next); } catch (e) { }
  });

  var KEY = "billiard160.v1";
  var META = "billiard160.meta.v1";
  var PAYS = { naqd: "Naqd", karta: "Karta", otkazma: "O'tkazma" };

  function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " "); }
  function som(n) { return fmt(n) + " <small>so'm</small>"; }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function clock(ms) {
    var s = Math.floor(ms / 1000);
    return pad(Math.floor(s / 3600)) + ":" + pad(Math.floor((s % 3600) / 60)) + ":" + pad(s % 60);
  }
  function timeCost(ms, rate) { return Math.round((ms / 3600000) * rate / 100) * 100; }
  function esc(t) { return String(t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function dayKey(d) { d = d || new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function dayLabel(d) { d = d || new Date(); return pad(d.getDate()) + "." + pad(d.getMonth() + 1) + "." + d.getFullYear(); }
  function hm(ts) { var d = new Date(ts); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }

  function blank(i) { return { id: i, status: "idle", start: 0, elapsed: 0, rate: 0, items: [], gid: 0, pay: "naqd" }; }
  function loadTables() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) { var d = JSON.parse(raw); if (Array.isArray(d) && d.length === TABLE_COUNT) return d; }
    } catch (e) { }
    var a = []; for (var i = 1; i <= TABLE_COUNT; i++) a.push(blank(i)); return a;
  }
  function loadMeta() {
    try {
      var raw = localStorage.getItem(META);
      if (raw) { var m = JSON.parse(raw); if (m && m.rate > 0 && Array.isArray(m.history)) return m; }
    } catch (e) { }
    return { rate: 40000, history: [] };
  }
  var tables = loadTables();
  var meta = loadMeta();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(tables)); localStorage.setItem(META, JSON.stringify(meta)); } catch (e) { }
  }

  var STATUS = { idle: "Bo'sh", running: "O'ynalmoqda", done: "Yakunlandi" };
  var grid = document.getElementById("grid");
  var rateInput = document.getElementById("rateInput");
  rateInput.value = meta.rate;

  function itemsTotal(t) { return t.items.reduce(function (s, x) { return s + x.price; }, 0); }
  function elapsedOf(t) { return t.status === "running" ? Date.now() - t.start : t.elapsed; }
  function rateOf(t) { return t.rate || meta.rate; }

  function itemsHtml(t) {
    if (!t.items.length) return '<p class="empty">Hali mahsulot qo\'shilmagan.</p>';
    return '<ul class="items">' + t.items.map(function (x, i) {
      return '<li><span class="nm">' + esc(x.name) + '</span><span class="pr">' + fmt(x.price) + '</span>' +
        '<button type="button" data-act="remove" data-i="' + i + '" aria-label="' + esc(x.name) + ' ni o\'chirish">×</button></li>';
    }).join("") + '</ul>';
  }

  function payHtml(t) {
    return '<div><div class="label" style="margin-bottom:6px">To\'lov turi</div><div class="pay" role="radiogroup" aria-label="To\'lov turi">' +
      Object.keys(PAYS).map(function (k) {
        return '<button type="button" role="radio" data-act="pay" data-pay="' + k + '" aria-checked="' + (t.pay === k) + '">' + PAYS[k] + '</button>';
      }).join("") + '</div></div>';
  }


  var Anim = (function () {
    var W = 320, H = 160, R = 5.5, L = 14, T = 14, RT = 306, B = 146;
    var S = Math.min(3, Math.max(2, window.devicePixelRatio || 2));
    var POCKETS = [[L, T, 10], [160, T, 9], [RT, T, 10], [L, B, 10], [160, B, 9], [RT, B, 10]];
    var COLORS = ["#e8c23a", "#2f6fd0", "#d9453d", "#7b4bb0", "#e87d2b", "#2f9a5a", "#8a2a2a", "#1c1c1c", "#e8c23a", "#2f6fd0"];
    var AIM = 1.15;
    var reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    var sims = {}, raf = 0, last = 0;

    function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
    function dot(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); }
    function rr(ctx, x, y, w, h, r) {
      ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
    }
    function ball(x, y, c, cue) { return { x: x, y: y, vx: 0, vy: 0, c: c, cue: cue, st: 0, t: 0, px: 0, py: 0 }; }
    function rack() {
      var bs = [ball(80, 80, "#f6f5ee", true)], n = 0;
      for (var row = 0; row < 4; row++) {
        for (var i = 0; i <= row; i++) {
          bs.push(ball(215 + row * 9.8, 80 + (i - row / 2) * 11.3, COLORS[n++ % COLORS.length], false));
        }
      }
      return bs;
    }

    function Sim() { this.cv = null; this.ctx = null; this.active = false; this.mode = ""; this.reset(); }
    Sim.prototype.reset = function () { this.balls = rack(); this.phase = "idle"; this.pt = 0; this.brk = true; this.shot = null; };
    Sim.prototype.start = function () { this.reset(); this.phase = reduce ? "idle" : "rest"; this.pt = 0.3; };
    Sim.prototype.attach = function (cv) {
      this.cv = cv; this.ctx = null;
      if (cv) { cv.width = W * S; cv.height = H * S; this.ctx = cv.getContext("2d"); }
    };
    Sim.prototype.moving = function () {
      for (var i = 0; i < this.balls.length; i++) {
        var b = this.balls[i];
        if (b.st === 1 || (b.st === 0 && (b.vx !== 0 || b.vy !== 0))) return true;
      }
      return false;
    };
    Sim.prototype.plan = function () {
      var cue = this.balls[0];
      var live = this.balls.slice(1).filter(function (b) { return b.st === 0; });
      if (live.length < 3) { this.balls = rack(); this.brk = true; cue = this.balls[0]; live = this.balls.slice(1); }
      if (cue.st !== 0) { cue.x = 80; cue.y = 80; cue.vx = 0; cue.vy = 0; cue.st = 0; cue.t = 0; }
      var tg = this.brk ? this.balls[1] : live[Math.floor(Math.random() * live.length)];
      var a = Math.atan2(tg.y - cue.y, tg.x - cue.x) + (this.brk ? 0 : (Math.random() - 0.5) * 0.16);
      this.shot = { a: a, p: this.brk ? 560 : 190 + Math.random() * 250 };
      this.phase = "aim"; this.pt = 0;
    };
    Sim.prototype.step = function (dt) {
      var n = Math.min(8, Math.ceil(dt / 0.006)), h = dt / n, bs = this.balls;
      for (var s = 0; s < n; s++) {
        for (var i = 0; i < bs.length; i++) {
          var b = bs[i];
          if (b.st === 1) {
            b.t += h;
            b.x += (b.px - b.x) * Math.min(1, h * 14); b.y += (b.py - b.y) * Math.min(1, h * 14);
            if (b.t > 0.3) b.st = 2;
            continue;
          }
          if (b.st !== 0) continue;
          b.x += b.vx * h; b.y += b.vy * h;
          var f = 1 - 0.9 * h; b.vx *= f; b.vy *= f;
          if (b.vx * b.vx + b.vy * b.vy < 25) { b.vx = 0; b.vy = 0; }
          for (var k = 0; k < 6; k++) {
            var P = POCKETS[k], px = b.x - P[0], py = b.y - P[1];
            if (px * px + py * py < P[2] * P[2]) { b.st = 1; b.t = 0; b.px = P[0]; b.py = P[1]; b.vx = 0; b.vy = 0; break; }
          }
          if (b.st !== 0) continue;
          if (b.x < L + R) { b.x = L + R; b.vx = Math.abs(b.vx) * 0.85; }
          else if (b.x > RT - R) { b.x = RT - R; b.vx = -Math.abs(b.vx) * 0.85; }
          if (b.y < T + R) { b.y = T + R; b.vy = Math.abs(b.vy) * 0.85; }
          else if (b.y > B - R) { b.y = B - R; b.vy = -Math.abs(b.vy) * 0.85; }
        }
        for (var i2 = 0; i2 < bs.length; i2++) {
          var a = bs[i2]; if (a.st !== 0) continue;
          for (var j = i2 + 1; j < bs.length; j++) {
            var c = bs[j]; if (c.st !== 0) continue;
            var dx = c.x - a.x, dy = c.y - a.y, d2 = dx * dx + dy * dy;
            if (d2 >= 4 * R * R || d2 === 0) continue;
            var d = Math.sqrt(d2), nx = dx / d, ny = dy / d, ov = (2 * R - d) / 2;
            a.x -= nx * ov; a.y -= ny * ov; c.x += nx * ov; c.y += ny * ov;
            var dvn = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;
            if (dvn > 0) {
              var imp = dvn * 0.98;
              a.vx -= imp * nx; a.vy -= imp * ny; c.vx += imp * nx; c.vy += imp * ny;
            }
          }
        }
      }
    };
    Sim.prototype.update = function (dt) {
      this.pt += dt;
      if (this.phase === "rest") {
        if (this.pt >= 0.9) this.plan();
      } else if (this.phase === "aim") {
        if (this.pt >= AIM) {
          var c = this.balls[0], sh = this.shot;
          c.vx = Math.cos(sh.a) * sh.p; c.vy = Math.sin(sh.a) * sh.p;
          this.phase = "roll"; this.pt = 0; this.brk = false;
        }
      } else if (this.phase === "roll") {
        this.step(dt);
        if (this.pt > 14) { this.balls.forEach(function (b) { b.vx = 0; b.vy = 0; }); }
        if (this.pt > 0.5 && !this.moving()) { this.phase = "rest"; this.pt = 0; }
      }
    };
    function drawCue(ctx, x, y, a, pull, alpha) {
      var ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
      var tx = x - ux * (R + 2 + pull), ty = y - uy * (R + 2 + pull);
      var ex = tx - ux * 105, ey = ty - uy * 105;
      ctx.globalAlpha = alpha;
      var g = ctx.createLinearGradient(tx, ty, ex, ey);
      g.addColorStop(0, "#f1dfb8"); g.addColorStop(0.55, "#c99a5b"); g.addColorStop(0.56, "#2a1a10"); g.addColorStop(1, "#150c07");
      ctx.beginPath();
      ctx.moveTo(tx + nx * 0.9, ty + ny * 0.9); ctx.lineTo(ex + nx * 2.4, ey + ny * 2.4);
      ctx.lineTo(ex - nx * 2.4, ey - ny * 2.4); ctx.lineTo(tx - nx * 0.9, ty - ny * 0.9);
      ctx.closePath(); ctx.fillStyle = g; ctx.fill();
      ctx.fillStyle = "#7fb6d9"; dot(ctx, tx, ty, 1.3);
      ctx.globalAlpha = 1;
    }
    Sim.prototype.draw = function () {
      var ctx = this.ctx; if (!ctx) return;
      ctx.setTransform(S, 0, 0, S, 0, 0);
      ctx.clearRect(0, 0, W, H);
      var g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#7a4d2e"); g.addColorStop(1, "#47291a");
      rr(ctx, 0, 0, W, H, 14); ctx.fillStyle = g; ctx.fill();
      var f = ctx.createRadialGradient(160, 80, 10, 160, 80, 170); f.addColorStop(0, "#2b8260"); f.addColorStop(1, "#185a40");
      ctx.fillStyle = f; ctx.fillRect(L, T, RT - L, B - T);
      ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 2; ctx.strokeRect(L + 1, T + 1, RT - L - 2, B - T - 2);
      ctx.fillStyle = "rgba(240,226,190,.85)";
      var k, x, y;
      for (k = 1; k < 8; k++) { if (k === 4) continue; x = L + (RT - L) * k / 8; dot(ctx, x, 7, 1.5); dot(ctx, x, H - 7, 1.5); }
      for (k = 1; k < 4; k++) { if (k === 2) continue; y = T + (B - T) * k / 4; dot(ctx, 7, y, 1.5); dot(ctx, W - 7, y, 1.5); }
      ctx.fillStyle = "rgba(255,255,255,.18)"; dot(ctx, 215, 80, 1.4);
      ctx.strokeStyle = "rgba(255,255,255,.10)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(100, T + 2); ctx.lineTo(100, B - 2); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.10)"; ctx.font = "800 24px 'Bricolage Grotesque', system-ui, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("160", 160, 80);
      for (var p = 0; p < 6; p++) {
        var P = POCKETS[p];
        ctx.beginPath(); ctx.arc(P[0], P[1], P[2] - 0.5, 0, 6.2832); ctx.fillStyle = "#060b08"; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = "#2b1a10"; ctx.stroke();
      }
      var bs = this.balls;
      for (var i = 0; i < bs.length; i++) {
        var b = bs[i]; if (b.st === 2) continue;
        var s = b.st === 1 ? Math.max(0, 1 - b.t / 0.3) : 1;
        ctx.globalAlpha = s;
        ctx.beginPath(); ctx.arc(b.x + 1, b.y + 1.6, R * s, 0, 6.2832); ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.fill();
        ctx.beginPath(); ctx.arc(b.x, b.y, R * s, 0, 6.2832); ctx.fillStyle = b.c; ctx.fill();
        var hg = ctx.createRadialGradient(b.x - 1.8 * s, b.y - 2 * s, 0.2, b.x - 1.8 * s, b.y - 2 * s, R * 1.6 * s + 0.01);
        hg.addColorStop(0, "rgba(255,255,255,.75)"); hg.addColorStop(0.35, "rgba(255,255,255,0)"); hg.addColorStop(1, "rgba(0,0,0,.4)");
        ctx.fillStyle = hg; ctx.fill();
      }
      ctx.globalAlpha = 1;
      var cue = bs[0];
      if (cue.st === 0) {
        var a = 0, pull = -1, alpha = 1, line = false, sh = this.shot;
        if (this.phase === "idle") { pull = 7; line = true; }
        else if (this.phase === "aim" && sh) {
          var u = this.pt / AIM; a = sh.a;
          pull = u < 0.62 ? 22 * ease(u / 0.62) : (u < 0.8 ? 22 : 22 * (1 - (u - 0.8) / 0.2));
          line = u < 0.8;
        } else if (this.phase === "roll" && sh && this.pt < 0.3) { a = sh.a; pull = 0; alpha = 1 - this.pt / 0.3; }
        if (line) {
          ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = "rgba(255,255,255,.3)"; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(cue.x + Math.cos(a) * (R + 2), cue.y + Math.sin(a) * (R + 2));
          ctx.lineTo(cue.x + Math.cos(a) * 75, cue.y + Math.sin(a) * 75); ctx.stroke(); ctx.restore();
        }
        if (pull >= 0) drawCue(ctx, cue.x, cue.y, a, pull, alpha);
      }
    };

    function frame(now) {
      raf = 0;
      var dt = Math.min(0.033, (now - last) / 1000); last = now;
      var any = false;
      for (var k in sims) {
        var s = sims[k];
        if (s.active && s.cv && s.cv.isConnected) { s.update(dt); s.draw(); any = true; }
      }
      if (any) raf = requestAnimationFrame(frame);
    }
    function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }

    function sync(t) {
      var s = sims[t.id] || (sims[t.id] = new Sim());
      var el = document.getElementById("t" + t.id);
      s.attach(el ? el.querySelector("canvas.felt") : null);
      if (s.mode !== t.status) {
        s.mode = t.status;
        if (t.status === "idle") { s.reset(); s.active = false; }
        else if (t.status === "running") { s.start(); s.active = !reduce; }
        else { s.active = false; }
      } else if (t.status === "running" && !reduce) { s.active = true; }
      s.draw();
      if (s.active) kick();
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { for (var k in sims) { if (!sims[k].active) sims[k].draw(); } });
    }
    return { sync: sync, html: '<canvas class="felt" aria-hidden="true"></canvas>' };
  })();

  function cardHtml(t) {


    var head = '<div class="cloth"><div class="num"><small>Stol</small>' + t.id + '</div><span class="pill">' + STATUS[t.status] + '</span></div>';
    var body;
    if (t.status === "idle") {
      body = Anim.html + '<div><div class="clock-label">Vaqt</div><div class="clock">00:00:00</div></div>' +
        '<button type="button" class="btn-start" data-act="start">Bosing</button>' +
        '<p class="hint">Tugmani bosganingizda vaqt boshlanadi. Narx: ' + fmt(meta.rate) + ' So\'m / soat.</p>';


    } else if (t.status === "running") {
      var ms = elapsedOf(t);
      body = Anim.html + '<div><div class="clock-label">O\'tgan vaqt</div><div class="clock" data-role="clock">' + clock(ms) + '</div></div>' +
        '<div class="sums"><div><div class="label">Stol</div><div class="money" data-role="tcost">' + som(timeCost(ms, rateOf(t))) + '</div></div>' +
        '<div><div class="label">Mahsulot</div><div class="money">' + som(itemsTotal(t)) + '</div></div></div>' +
        '<form class="add" autocomplete="off">' +
        '<input type="text" name="name" id="name' + t.id + '" placeholder="Mahsulot" aria-label="Mahsulot nomi" required>' +
        '<input type="number" name="price" id="price' + t.id + '" placeholder="Narxi" aria-label="Narxi (so\'m)" inputmode="numeric" min="0" step="100" required>' +
        '<button type="submit" class="btn-add">Qo\'shish</button></form>' +
        itemsHtml(t) +
        '<button type="button" class="btn-stop" data-act="stop">To\'xtatish</button>';
    } else {
      var tc = timeCost(t.elapsed, rateOf(t)), it = itemsTotal(t);
      var rows = t.items.map(function (x) { return '<div class="row"><span>' + esc(x.name) + '</span><span>' + fmt(x.price) + '</span></div>'; }).join("");
      body = '<div class="receipt">' +
        '<div class="row"><span>Vaqt</span><span>' + clock(t.elapsed) + '</span></div>' +
        '<div class="row"><span>Stol (' + fmt(rateOf(t)) + ' / soat)</span><span>' + fmt(tc) + '</span></div>' +
        (rows ? '<hr>' + rows : '') +
        '<hr><div class="row"><span>Mahsulotlar</span><span>' + fmt(it) + '</span></div>' +
        '<div class="row total"><span>Jami</span><span>' + fmt(tc + it) + ' so\'m</span></div></div>' +
        payHtml(t) +
        '<button type="button" class="btn-ghost" data-act="reset">Yangi O\'yin</button>';
    }
    return head + '<div class="body">' + body + '</div>';
  }

  function renderCard(t) {
    var el = document.getElementById("t" + t.id);
    if (!el) {
      el = document.createElement("section"); el.id = "t" + t.id; el.dataset.id = t.id;
      grid.appendChild(el);
    }
    el.className = "card " + t.status;
    el.innerHTML = cardHtml(t);
    Anim.sync(t);
  }

  var confirmClear = false;
  function renderSummary() {
    var today = dayKey();
    var list = meta.history.filter(function (h) { return h.day === today; });
    var total = 0, byPay = { naqd: 0, karta: 0, otkazma: 0 };
    list.forEach(function (h) { total += h.total; byPay[h.pay] = (byPay[h.pay] || 0) + h.total; });
    var recent = list.slice(-8).reverse();
    var hist = recent.length ? '<ul class="history">' + recent.map(function (h) {
      return '<li><span>Stol ' + h.table + ' <span class="meta">· ' + hm(h.gid) + ' · ' + clock(h.ms) + ' · ' + PAYS[h.pay] + '</span></span><span class="m">' + fmt(h.total) + ' so\'m</span></li>';
    }).join("") + '</ul>' : '<p class="empty">Bugun hali Hech qanday O\'yin Tugallangani yo\'q.</p>';
    var actions = list.length ? (confirmClear
      ? '<span class="hint">Bugungi barcha yozuvlar o\'chiriladi.</span><button type="button" class="danger" data-sum="clear-yes">Ha, tozalash</button><button type="button" data-sum="clear-no">Bekor qilish</button>'
      : '<button type="button" data-sum="clear">Kunlik hisobni tozalash</button>') : '';
    document.getElementById("summary").innerHTML =
      '<div class="sum-head"><div><div class="label">Bugun, ' + dayLabel() + '</div><h2>Kunlik jami</h2></div>' +
      '<div class="sum-total">' + fmt(total) + ' <small>so\'m · ' + list.length + ' ta o\'yin</small></div></div>' +
      '<div class="paygrid">' + Object.keys(PAYS).map(function (k) {
        return '<div><div class="label">' + PAYS[k] + '</div><div class="money">' + som(byPay[k] || 0) + '</div></div>';
      }).join("") + '</div>' + hist +
      (actions ? '<div class="sum-actions">' + actions + '</div>' : '');
    if (typeof renderMonthly === "function") renderMonthly();
  }

  var MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentyabr", "Oktyabr", "Noyabr", "Dekabr"];
  var now0 = new Date();
  var view = { y: now0.getFullYear(), m: now0.getMonth() };
  function renderMonthly() {
    var prefix = view.y + "-" + pad(view.m + 1) + "-";
    var list = meta.history.filter(function (h) { return h.day.indexOf(prefix) === 0; });
    var total = 0, byPay = { naqd: 0, karta: 0, otkazma: 0 }, days = {};
    list.forEach(function (h) {
      total += h.total; byPay[h.pay] = (byPay[h.pay] || 0) + h.total;
      var d = days[h.day] || (days[h.day] = { total: 0, n: 0 }); d.total += h.total; d.n++;
    });
    var keys = Object.keys(days).sort().reverse();
    var max = keys.reduce(function (mx, k) { return Math.max(mx, days[k].total); }, 1);
    var avg = keys.length ? Math.round(total / keys.length / 100) * 100 : 0;
    var isNow = view.y === now0.getFullYear() && view.m === now0.getMonth();
    var rows = keys.length ? '<ul class="days">' + keys.map(function (k) {
      var p = k.split("-");
      return '<li><span class="bar" style="width:' + Math.round(days[k].total / max * 100) + '%"></span>' +
        '<span>' + p[2] + "." + p[1] + "." + p[0] + ' <span class="meta">· ' + days[k].n + ' ta o\'yin</span></span><span class="m">' + fmt(days[k].total) + ' so\'m</span></li>';
    }).join("") + '</ul>' : '<p class="empty">Bu oyda tushum yozuvlari yo\'q.</p>';
    document.getElementById("monthly").innerHTML =
      '<div class="sum-head"><div><div class="label">Oylik tushum</div>' +
      '<div class="month-nav"><button type="button" data-mon="-1" aria-label="Oldingi oy">‹</button><span class="mname">' + MONTHS[view.m] + ' ' + view.y + '</span>' +
      '<button type="button" data-mon="1" aria-label="Keyingi oy"' + (isNow ? ' disabled' : '') + '>›</button></div></div>' +
      '<div class="sum-total">' + fmt(total) + ' <small>so\'m · ' + list.length + ' ta o\'yin</small></div></div>' +
      '<div class="paygrid">' +
      '<div><div class="label">O\'rtacha kun</div><div class="money">' + som(avg) + '</div></div>' +
      Object.keys(PAYS).map(function (k) {
        return '<div><div class="label">' + PAYS[k] + '</div><div class="money">' + som(byPay[k] || 0) + '</div></div>';
      }).join("") + '</div>' + rows;
  }
  document.getElementById("monthly").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-mon]"); if (!b || b.disabled) return;
    var m = view.m + Number(b.dataset.mon), y = view.y;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    view = { y: y, m: m }; renderMonthly();
  });

  tables.forEach(renderCard);
  renderSummary();
  renderMonthly();

  function find(id) { return tables.filter(function (t) { return t.id === id; })[0]; }

  grid.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-act]"); if (!b) return;
    var card = b.closest(".card"); var t = find(Number(card.dataset.id)); var act = b.dataset.act;
    if (act === "start") { t.status = "running"; t.start = Date.now(); t.elapsed = 0; t.rate = meta.rate; t.items = []; t.pay = "naqd"; }
    else if (act === "stop") {
      t.elapsed = Date.now() - t.start; t.status = "done"; t.gid = Date.now(); t.pay = "naqd";
      var tc = timeCost(t.elapsed, rateOf(t)), it = itemsTotal(t);
      meta.history.push({ gid: t.gid, day: dayKey(), table: t.id, ms: t.elapsed, tc: tc, it: it, total: tc + it, pay: t.pay });
      renderSummary();
    }
    else if (act === "pay") {
      t.pay = b.dataset.pay;
      meta.history.forEach(function (h) { if (h.gid === t.gid && h.table === t.id) h.pay = t.pay; });
      renderSummary();
    }
    else if (act === "reset") { Object.assign(t, blank(t.id)); }
    else if (act === "remove") { t.items.splice(Number(b.dataset.i), 1); }
    save(); renderCard(t);
  });

  grid.addEventListener("submit", function (e) {
    e.preventDefault();
    var form = e.target; var card = form.closest(".card"); var t = find(Number(card.dataset.id));
    var name = form.elements.name.value.trim(); var price = Math.round(Number(form.elements.price.value));
    if (!name || !isFinite(price) || price < 0) return;
    t.items.push({ name: name, price: price });
    save(); renderCard(t);
    var n = document.getElementById("name" + t.id); if (n) n.focus();
  });

  document.getElementById("summary").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-sum]"); if (!b) return;
    var a = b.dataset.sum;
    if (a === "clear") { confirmClear = true; }
    else if (a === "clear-no") { confirmClear = false; }
    else if (a === "clear-yes") {
      var today = dayKey();
      meta.history = meta.history.filter(function (h) { return h.day !== today; });
      confirmClear = false; save();
    }
    renderSummary();
  });

  rateInput.addEventListener("change", function () {
    var v = Math.round(Number(rateInput.value));
    if (!isFinite(v) || v < 1000) { rateInput.value = meta.rate; return; }
    meta.rate = v; rateInput.value = v; save();
    tables.forEach(function (t) { if (t.status === "idle") renderCard(t); });
  });

  setInterval(function () {
    tables.forEach(function (t) {
      if (t.status !== "running") return;
      var el = document.getElementById("t" + t.id); if (!el) return;
      var ms = Date.now() - t.start;
      var c = el.querySelector('[data-role="clock"]'); if (c) c.textContent = clock(ms);
      var m = el.querySelector('[data-role="tcost"]'); if (m) m.innerHTML = som(timeCost(ms, rateOf(t)));
    });
  }, 1000);
})();
