/* anunag.com — Quiet precision
   Vanilla JS, no dependencies. Everything here is progressive enhancement:
   without it the page still reads top to bottom, every link works, and day/night still follows the clock. */
(() => {
  'use strict';

  const doc = document.documentElement;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.prototype.slice.call((el || document).querySelectorAll(s));
  const reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const touchDevice = !!(window.matchMedia && matchMedia('(hover: none)').matches);
  const q = new URLSearchParams(location.search);

  /* Canvas colours per theme (CSS handles everything else through variables). */
  const PALETTE = {
    light: {
      accent: '#2F7A5A', pop: '#E5484D', frag: 'rgba(17,18,20,0.045)', fragLine: 'rgba(17,18,20,0.2)', dot: 'rgba(17,18,20,0.28)', fdot: 'rgba(17,18,20,0.14)', knob: '#FFFFFF',
      snow: '#FFFFFF', snowSh: 'rgba(70,95,140,0.5)', cap: '255,255,255', flake: '255,255,255', halo: '50,75,120', haloA: 0.26,
      wire: '#4E5A70', meta: '#F6F6F4', metaSnow: '#E1E9F4'
    },
    dark: {
      accent: '#86C0A0', pop: '#FF6B57', frag: 'rgba(255,255,255,0.04)', fragLine: 'rgba(255,255,255,0.2)', dot: 'rgba(255,255,255,0.32)', fdot: 'rgba(255,255,255,0.16)', knob: '#1A1C20',
      snow: '#E4EAF6', snowSh: 'rgba(120,140,190,0.45)', cap: '240,244,252', flake: '236,241,250', halo: '150,170,220', haloA: 0.12,
      wire: '#3A4256', meta: '#0B0C0E', metaSnow: '#0A0F1F'
    }
  };
  const isDark = () => doc.getAttribute('data-theme') === 'dark';
  const snowOn = () => doc.getAttribute('data-snow') === 'on';
  const blueprintOn = () => doc.getAttribute('data-blueprint') === 'on';
  const pal = () => PALETTE[isDark() ? 'dark' : 'light'];

  /* ---------- layout geometry ---------- */
  const hero = $('.hero');
  const heroCv = $('.hero__canvas');
  const heroCtx = heroCv && heroCv.getContext('2d');
  const fieldCv = $('.field');
  const fieldCtx = fieldCv && fieldCv.getContext('2d');
  const snowCv = $('.snow-canvas');
  const snowCtx = snowCv && snowCv.getContext('2d');
  const h1 = $('.hero__title');
  const meter = $('.hero__meter');
  const wash = $('.hero__wash');
  const tiles = { ds: $('.hero__tile[data-tile="ds"]'), ul: $('.hero__tile[data-tile="ul"]') };
  let W = doc.clientWidth, H = innerHeight, dpr = Math.min(2, devicePixelRatio || 1), G = null;

  function geo() {
    const narrow = W < 760;
    const padX = Math.round(clamp(W * 0.05, 20, 64));
    const cL = Math.max(0, (W - 1200) / 2) + padX;
    const cW = Math.min(1200, W) - padX * 2;
    let x0 = Math.max(cL + 660, W * 0.55), x1 = cL + cW;
    const below = narrow || x1 - x0 < 300;
    hero.classList.toggle('hero--below', below);
    hero.style.minHeight = '';
    let heroH = hero.offsetHeight;
    let y0 = heroH * 0.22, y1 = heroH * 0.8, cols = 7, rows = 7, cellsDs = [2, 3], cellsUl = [4, 3];
    if (below) {
      x0 = cL; x1 = cL + cW; y0 = heroH * (narrow ? 0.72 : 0.76); y1 = heroH * 0.9;
      cols = narrow ? 8 : 12; rows = 3; cellsDs = [2, 1]; cellsUl = [narrow ? 5 : 9, 1];
    }
    const sp = Math.min((x1 - x0) / (cols - 1), (y1 - y0) / (rows - 1), 66);
    const gx = (x0 + x1) / 2 - sp * (cols - 1) / 2;
    let gy = (y0 + y1) / 2 - sp * (rows - 1) / 2;
    if (below) {
      /* keep the grid clear of the text and buttons above it; grow the hero when they run long (small phones) */
      const col = $('.hero__col');
      const clear = col ? col.getBoundingClientRect().bottom - hero.getBoundingClientRect().top + 48 : 0;
      if (gy < clear) gy = clear;
      const need = Math.ceil(gy + sp * (rows - 1) + 84);
      if (need > heroH) { hero.style.minHeight = need + 'px'; heroH = hero.offsetHeight; }
    }
    const edge = Math.max(14, padX * 0.5);
    doc.style.setProperty('--edge-l', Math.round(Math.max(6, cL - edge)) + 'px');
    doc.style.setProperty('--edge-r', Math.round(Math.min(W - 6, cL + cW + edge)) + 'px');
    doc.style.setProperty('--col-l', Math.round(cL) + 'px');
    doc.style.setProperty('--col-w', Math.round(cW) + 'px');
    return { narrow, padX, cL, cW, heroH, cols, rows, sp, gx, gy, cellsDs, cellsUl, below };
  }

  /* ---------- day / night ---------- */
  let userTheme = q.get('theme') === 'dark' || q.get('theme') === 'light';
  const clockDark = () => { const d = new Date(); const h = d.getHours() + d.getMinutes() / 60; return h >= 18.5 || h < 6; };
  const metaTheme = $('meta[name="theme-color"]');
  function syncUi() {
    const dark = isDark(), snow = snowOn(), bp = blueprintOn();
    $$('[data-action="theme"]').forEach((b) => { const l = dark ? 'Switch to light mode' : 'Switch to dark mode'; b.setAttribute('aria-label', l); b.setAttribute('title', l); });
    $$('[data-action="snow"]').forEach((b) => { b.setAttribute('aria-pressed', snow ? 'true' : 'false'); const l = snow ? 'Stop the snow' : 'Let it snow'; b.setAttribute('aria-label', l); b.setAttribute('title', l); });
    $$('.dock__btn[data-action="blueprint"]').forEach((b) => b.setAttribute('aria-pressed', bp ? 'true' : 'false'));
    const st = { dark, snow, blueprint: bp };
    $$('[data-state]').forEach((el) => { el.textContent = st[el.getAttribute('data-state')] ? el.getAttribute('data-on') : el.getAttribute('data-off'); });
    if (metaTheme) metaTheme.setAttribute('content', snow ? pal().metaSnow : pal().meta);
  }
  function setTheme(dark) {
    doc.setAttribute('data-theme', dark ? 'dark' : 'light');
    syncUi();
    paintCaps();
    buildGarland();
  }
  setInterval(() => {
    if (userTheme) return;
    const d = clockDark();
    if (d !== isDark()) setTheme(d);
  }, 60000);

  /* ---------- reveal on scroll ---------- */
  const rvs = $$('.rv');
  if ('IntersectionObserver' in window && !reduced) {
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
      if (e.target.closest('#sec-end')) nudgeDock();
    }), { threshold: 0.12 });
    rvs.forEach((el) => io.observe(el));
  } else rvs.forEach((el) => el.classList.add('is-in'));

  /* ---------- snow caps on headings ---------- */
  const capEls = $$('[data-cap]');
  const caps = new Map();
  const capVis = new Map();
  capEls.forEach((el) => caps.set(el, 0.6));
  function capShadow(c, rgb) {
    return '0 -' + (0.012 + 0.05 * c).toFixed(3) + 'em 0 rgba(' + rgb + ',' + (0.55 + 0.45 * c).toFixed(2) + '), 0 -' + (0.02 + 0.06 * c).toFixed(3) + 'em ' + (0.01 + 0.03 * c).toFixed(3) + 'em rgba(' + rgb + ',' + (0.6 * c).toFixed(2) + ')';
  }
  function paintCaps() {
    const on = snowOn(), rgb = pal().cap;
    capEls.forEach((el) => { el.style.textShadow = on ? capShadow(caps.get(el), rgb) : ''; });
  }
  if ('IntersectionObserver' in window) {
    const cio = new IntersectionObserver((es) => es.forEach((e) => capVis.set(e.target, e.isIntersecting)), { threshold: 0.4 });
    capEls.forEach((el) => cio.observe(el));
  }
  setInterval(() => {
    if (!snowOn()) return;
    let ch = false;
    capEls.forEach((el) => {
      const c = caps.get(el);
      if (c < 0.5) { caps.set(el, Math.min(0.5, c + 0.035)); ch = true; }
      else if (!reduced && capVis.get(el) && c < 1) { caps.set(el, Math.min(1, c + 0.012)); ch = true; }
    });
    if (ch) paintCaps();
  }, 450);

  /* ---------- noise fragments: hero + whole page ---------- */
  const KINDS = ['toast', 'toast', 'badge', 'dot', 'dot', 'toggle', 'bar', 'chip', 'spin', 'count', 'toast', 'badge', 'chip'];
  const FKINDS = ['dot', 'dot', 'badge', 'toggle', 'bar', 'chip', 'mini', 'mini', 'spin', 'dot'];
  const imgDs = new Image(); imgDs.src = 'assets/deadscroll-icon.png';
  const imgUl = new Image(); imgUl.src = 'assets/uplevel-logo.png';
  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function rr(ctx, x, y, w, h, r) {
    const k = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + k, y);
    ctx.arcTo(x + w, y, x + w, y + h, k);
    ctx.arcTo(x + w, y + h, x, y + h, k);
    ctx.arcTo(x, y + h, x, y, k);
    ctx.arcTo(x, y, x + w, y, k);
    ctx.closePath();
  }
  function newFrag(kind, hx, hy, r, prod, nx, ny) {
    return {
      kind, prod: prod || '', hx, hy, nx, ny,
      vx: (r() - 0.5) * 40, vy: (r() - 0.5) * 30, bvx: (r() - 0.5) * 34, bvy: (r() - 0.5) * 26,
      ang: (r() - 0.5) * 0.7, va: (r() - 0.5) * 0.6, ph: r() * 6.28, d: r() * 0.45,
      num: ['3', '12', '7', '1', '24', '5'][(r() * 6) | 0], p: 0.2 + r() * 0.7, e: 0, ox: 0, oy: 0, col: r()
    };
  }

  let frags = [], field = [], fieldSig = '';
  let S = reduced ? 1.5 : 0, SF = 1.5;
  let lastNoise = performance.now() + 700, fieldNoise = -1e9;
  let px = -9999, py = -9999;
  let washX = 0, washY = 0;

  function initFrags() {
    const r = rng(19);
    frags = [];
    for (let row = 0; row < G.rows; row++) {
      for (let col = 0; col < G.cols; col++) {
        const prod = col === G.cellsDs[0] && row === G.cellsDs[1] ? 'ds' : col === G.cellsUl[0] && row === G.cellsUl[1] ? 'ul' : '';
        frags.push(newFrag(prod ? 'toast' : KINDS[(r() * KINDS.length) | 0], G.gx + col * G.sp, G.gy + row * G.sp, r, prod, 40 + r() * (W - 80), 90 + r() * (G.heroH - 140)));
      }
    }
    const place = (el, cell) => { if (!el) return; el.style.left = Math.round(G.gx + cell[0] * G.sp - 28) + 'px'; el.style.top = Math.round(G.gy + cell[1] * G.sp - 28) + 'px'; };
    place(tiles.ds, G.cellsDs);
    place(tiles.ul, G.cellsUl);
  }

  function buildField() {
    const docH = doc.scrollHeight;
    const sig = W + 'x' + docH;
    if (sig === fieldSig) return;
    fieldSig = sig;
    const sy = scrollY;
    const ko = $$('[data-spec],[data-ledge="rule"],[data-ledge="thin"],.footer,.quiet-links').map((el) => {
      const r = el.getBoundingClientRect();
      return { x0: r.left - 22, x1: r.right + 22, y0: r.top + sy - 22, y1: r.bottom + sy + 22 };
    });
    const step = G.narrow ? 56 : 72;
    const r = rng(41);
    const out = [];
    const ox = (W % step) / 2;
    for (let y = G.heroH + step; y < docH - step * 0.5; y += step) {
      for (let x = ox + step / 2; x < W; x += step) {
        if (r() > (G.narrow ? 0.3 : 0.36)) continue;
        let blocked = false;
        for (let i = 0; i < ko.length; i++) { const k = ko[i]; if (x > k.x0 && x < k.x1 && y > k.y0 && y < k.y1) { blocked = true; break; } }
        if (blocked) continue;
        const f = newFrag(FKINDS[(r() * FKINDS.length) | 0], x, y, r, '', x + (r() - 0.5) * 60, y + (r() - 0.5) * 60);
        f.d = r() * 0.6;
        out.push(f);
      }
    }
    field = out;
  }

  function drawFrag(ctx, f, th, now, N, sc, dotR) {
    const e = f.e;
    const jx = Math.sin(now * 0.013 + f.ph) * N * 1.6;
    const jy = Math.cos(now * 0.011 + f.ph) * N * 1.6;
    const x = lerp(f.nx + jx, f.hx, e) + f.ox;
    const y = lerp(f.ny + jy, f.hy, e) + f.oy;
    const na = 1 - e;
    if (na > 0.01) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(f.ang * na);
      if (sc !== 1) ctx.scale(sc, sc);
      ctx.globalAlpha = na;
      ctx.lineWidth = 1;
      const k = f.kind;
      const tint = f.col < 0.5 ? th.accent : th.pop;
      if (k === 'toast') {
        rr(ctx, -66, -18, 132, 36, 10); ctx.fillStyle = th.frag; ctx.fill(); ctx.strokeStyle = th.fragLine; ctx.stroke();
        ctx.fillStyle = tint; ctx.globalAlpha = na * 0.55; ctx.beginPath(); ctx.arc(-47, 0, 9, 0, 6.283); ctx.fill();
        ctx.globalAlpha = na; ctx.fillStyle = th.fragLine;
        rr(ctx, -31, -8, 66, 5, 2.5); ctx.fill();
        rr(ctx, -31, 3, 42, 5, 2.5); ctx.fill();
        ctx.fillStyle = th.pop; ctx.beginPath(); ctx.arc(60, -14, 4, 0, 6.283); ctx.fill();
      } else if (k === 'mini') {
        rr(ctx, -40, -12, 80, 24, 8); ctx.fillStyle = th.frag; ctx.fill(); ctx.strokeStyle = th.fragLine; ctx.stroke();
        ctx.fillStyle = th.fragLine; rr(ctx, -30, -2.5, 44, 5, 2.5); ctx.fill();
        ctx.fillStyle = th.pop; ctx.beginPath(); ctx.arc(36, -10, 3.5, 0, 6.283); ctx.fill();
      } else if (k === 'badge') {
        ctx.fillStyle = th.pop; ctx.beginPath(); ctx.arc(0, 0, 10, 0, 6.283); ctx.fill();
        ctx.fillStyle = '#FFFFFF'; ctx.font = '600 10px Geist, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(f.num, 0, 0.5);
      } else if (k === 'count') {
        rr(ctx, -17, -9, 34, 18, 9); ctx.fillStyle = th.pop; ctx.fill();
        ctx.fillStyle = '#FFFFFF'; ctx.font = '600 10px Geist, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('99+', 0, 0.5);
      } else if (k === 'dot') {
        ctx.fillStyle = tint; ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, 6.283); ctx.fill();
      } else if (k === 'toggle') {
        rr(ctx, -15, -8.5, 30, 17, 8.5); ctx.fillStyle = th.accent; ctx.globalAlpha = na * 0.85; ctx.fill();
        ctx.globalAlpha = na; ctx.fillStyle = th.knob; ctx.beginPath(); ctx.arc(6.5, 0, 6.2, 0, 6.283); ctx.fill();
      } else if (k === 'bar') {
        rr(ctx, -42, -3, 84, 6, 3); ctx.fillStyle = th.frag; ctx.fill(); ctx.strokeStyle = th.fragLine; ctx.stroke();
        rr(ctx, -42, -3, 84 * f.p, 6, 3); ctx.fillStyle = tint; ctx.fill();
      } else if (k === 'chip') {
        rr(ctx, -30, -11, 60, 22, 11); ctx.strokeStyle = th.fragLine; ctx.stroke();
        ctx.fillStyle = tint; ctx.globalAlpha = na * 0.7; rr(ctx, -18, -2.5, 36, 5, 2.5); ctx.fill();
      } else if (k === 'spin') {
        ctx.strokeStyle = th.accent; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(0, 0, 9, now * 0.006, now * 0.006 + 4.2); ctx.stroke();
      }
      ctx.restore();
    }
    if (e > 0.01) {
      ctx.globalAlpha = e;
      if (f.prod) {
        const s = lerp(12, 56, e);
        ctx.save();
        rr(ctx, x - s / 2, y - s / 2, s, s, s * 0.25);
        ctx.fillStyle = f.prod === 'ds' ? '#20242C' : '#FFFFFF';
        ctx.shadowColor = 'rgba(10,14,28,0.22)'; ctx.shadowBlur = 14 * e; ctx.shadowOffsetY = 5 * e;
        ctx.fill();
        ctx.shadowColor = 'rgba(0,0,0,0)';
        ctx.clip();
        const img = f.prod === 'ds' ? imgDs : imgUl;
        if (img.complete && img.naturalWidth) ctx.drawImage(img, x - s / 2, y - s / 2, s, s);
        else if (f.prod === 'ul') {
          ctx.fillStyle = th.accent; ctx.fillRect(x - s / 2, y - s / 2, s, s);
          ctx.fillStyle = '#FFFFFF'; ctx.font = '700 ' + Math.round(s * 0.45) + 'px Geist, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('U', x, y + 1);
        }
        ctx.restore();
      } else {
        ctx.fillStyle = f.col > 0.86 ? th.accent : (dotR < 2 ? th.fdot : th.dot);
        ctx.beginPath(); ctx.arc(x, y, f.col > 0.86 ? dotR + 0.6 : dotR, 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  function repel(f, dt, R, pyC) {
    const x = lerp(f.nx, f.hx, f.e), y = lerp(f.ny, f.hy, f.e);
    const dx = x - px, dy = y - pyC;
    const d = Math.sqrt(dx * dx + dy * dy);
    let tx = 0, ty = 0;
    if (d < R && d > 0.01) { const push = (R - d) * 0.85; tx = dx / d * push; ty = dy / d * push; }
    const k = (tx || ty) ? Math.min(1, dt * 9) : Math.min(1, dt * 2.6);
    f.ox += (tx - f.ox) * k;
    f.oy += (ty - f.oy) * k;
  }

  function stepFrag(f, dt, N, yMin, yMax) {
    const sp = 0.35 + N * 1.4;
    f.vx += (f.bvx * sp - f.vx) * Math.min(1, dt * 1.2);
    f.vy += (f.bvy * sp - f.vy) * Math.min(1, dt * 1.2);
    f.nx += f.vx * dt;
    f.ny += f.vy * dt;
    f.ang += f.va * dt * (0.3 + N);
    if (f.e > 0.985) {
      f.nx = f.hx + (Math.random() - 0.5) * 20; f.ny = f.hy + (Math.random() - 0.5) * 20;
      const a = Math.random() * 6.28; f.vx = Math.cos(a) * 120; f.vy = Math.sin(a) * 90;
    }
    if (f.nx < -90) f.nx = W + 90; else if (f.nx > W + 90) f.nx = -90;
    if (f.ny < yMin) { f.ny = yMin; f.vy = Math.abs(f.vy); } else if (f.ny > yMax) { f.ny = yMax; f.vy = -Math.abs(f.vy); }
  }

  let meterT = 0;
  let h1Settled = false; /* the headline softens only during the first settle on load; after that it stays sharp */
  function heroFrame(now, dt, top) {
    if (!heroCtx || top > G.heroH) return;
    const th = pal();
    if (!reduced) {
      if (now - lastNoise > 900) S = Math.min(1.5, S + dt / 1.3);
      else if (now >= lastNoise - 2000) S = Math.max(0, S - dt * 3.2);
    }
    const N = 1 - clamp(S / 1.5, 0, 1);
    const pyC = py + top;
    heroCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    heroCtx.clearRect(0, 0, W, G.heroH);
    let eDs = 0, eUl = 0;
    for (let i = 0; i < frags.length; i++) {
      const f = frags[i];
      f.e = reduced ? 1 : smooth(clamp(S - f.d, 0, 1));
      if (!reduced) { stepFrag(f, dt, N, 50, G.heroH - 20); repel(f, dt, f.prod ? 70 : 130, pyC); }
      drawFrag(heroCtx, f, th, now, N, 1, 2.3);
      if (f.prod === 'ds') eDs = f.e;
      if (f.prod === 'ul') eUl = f.e;
    }
    heroCtx.globalAlpha = 1;
    if (tiles.ds) tiles.ds.style.pointerEvents = eDs > 0.9 ? 'auto' : 'none';
    if (tiles.ul) tiles.ul.style.pointerEvents = eUl > 0.9 ? 'auto' : 'none';
    if (now - meterT > 90) {
      meterT = now;
      const qn = 1 - N;
      if (h1 && !h1Settled) {
        if (qn > 0.98) {
          h1Settled = true;
          h1.style.opacity = '';
          h1.style.filter = '';
        } else {
          const op = (0.74 + 0.26 * qn).toFixed(2);
          const fl = 'blur(' + ((1 - qn) * 1.1).toFixed(1) + 'px)';
          if (h1.style.opacity !== op) h1.style.opacity = op;
          if (h1.style.filter !== fl) h1.style.filter = fl;
        }
      }
      if (meter) {
        const pct = Math.round(N * 100);
        const txt = pct <= 1 ? 'Signal clear' : 'Noise ' + pct + '%';
        if (meter.textContent !== txt) meter.textContent = txt;
      }
    }
    if (wash && !reduced) {
      const tx = px > -999 ? (px - W / 2) * 0.03 : 0;
      const ty = px > -999 ? (py - G.heroH / 2) * 0.03 : 0;
      washX += (tx - washX) * Math.min(1, dt * 2);
      washY += (ty - washY) * Math.min(1, dt * 2);
      wash.style.transform = 'translate(' + washX.toFixed(1) + 'px,' + washY.toFixed(1) + 'px)';
    }
  }

  function fieldFrame(now, dt, top) {
    if (!fieldCtx) return;
    fieldCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fieldCtx.clearRect(0, 0, W, H);
    if (!field.length) return;
    const th = pal();
    if (!reduced) {
      if (now - fieldNoise > 700) SF = Math.min(1.5, SF + dt / 1.1);
      else SF = Math.max(0, SF - dt * 3);
    }
    const N = 1 - clamp(SF / 1.5, 0, 1);
    const pyC = py + top;
    fieldCtx.translate(0, -top);
    for (let i = 0; i < field.length; i++) {
      const f = field[i];
      if (f.hy < top - 120 || f.hy > top + H + 120) continue;
      f.e = reduced ? 1 : smooth(clamp((SF - f.d) / 0.9, 0, 1));
      if (!reduced) { stepFrag(f, dt, N, f.hy - 140, f.hy + 140); repel(f, dt, 120, pyC); }
      drawFrag(fieldCtx, f, th, now, N, 0.72, 1.7);
    }
    fieldCtx.globalAlpha = 1;
  }

  function makeNoise() {
    if (reduced) return;
    const now = performance.now();
    lastNoise = now + 500;
    fieldNoise = now + 1000;
    const top = scrollY;
    const kick = (f) => { const a = Math.random() * 6.28; f.vx += Math.cos(a) * 240; f.vy += Math.sin(a) * 200; f.ox += Math.cos(a) * 46; f.oy += Math.sin(a) * 46; };
    field.forEach((f) => { if (f.hy > top - 100 && f.hy < top + H + 100) kick(f); });
    frags.forEach(kick);
  }

  function scatterAt(x, cy, R) {
    const kick = (f) => {
      const hx = lerp(f.nx, f.hx, f.e), hy = lerp(f.ny, f.hy, f.e);
      const dx = hx - x, dy = hy - cy;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d > R) return;
      const s = (1 - d / R) * 90;
      f.ox += dx / d * s; f.oy += dy / d * s;
    };
    frags.forEach(kick);
    field.forEach(kick);
  }

  /* ---------- snow ---------- */
  const COLW = 3;
  const PILE = { rule: 7, thin: 5, card: 13, pill: 6, tile: 7 };
  let flakes = [], flakeW = 0, ledges = [];
  const lmap = {};
  const powder = [];
  let wind = 0, windT = 0;
  const sprites = {};
  function sprite(th) {
    const key = th.flake + th.halo + th.haloA;
    if (sprites[key]) return sprites[key];
    const c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(' + th.flake + ',1)');
    gr.addColorStop(0.42, 'rgba(' + th.flake + ',0.95)');
    gr.addColorStop(0.62, 'rgba(' + th.flake + ',0.35)');
    gr.addColorStop(0.8, 'rgba(' + th.halo + ',' + th.haloA + ')');
    gr.addColorStop(1, 'rgba(' + th.halo + ',0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 32, 32);
    sprites[key] = c;
    return c;
  }
  function initFlakes() {
    const n = clamp(Math.round((W * H) / 6500), 50, 240);
    const LAY = [
      { r: [0.8, 1.5], v: [14, 26], sw: 6, d: 0.3, a: 0.7 },
      { r: [1.5, 2.5], v: [30, 48], sw: 12, d: 0.6, a: 0.9 },
      { r: [2.7, 4.1], v: [55, 85], sw: 18, d: 1, a: 1 }
    ];
    flakes = [];
    for (let i = 0; i < n; i++) {
      const r = Math.random();
      const P = LAY[r < 0.45 ? 0 : r < 0.8 ? 1 : 2];
      flakes.push({ x: Math.random() * W, y: Math.random() * H, r: P.r[0] + Math.random() * (P.r[1] - P.r[0]), vy: P.v[0] + Math.random() * (P.v[1] - P.v[0]), sw: P.sw * (0.6 + Math.random() * 0.8), ph: Math.random() * 6.28, sp: 0.6 + Math.random() * 0.8, d: P.d, a: P.a, vx: 0 });
    }
    flakeW = W;
  }
  function makeLedge(kind, n) {
    const P = PILE[kind] || 7;
    const mx = new Float32Array(n), h = new Float32Array(n);
    const p1 = Math.random() * 6.28, p2 = Math.random() * 6.28, p3 = Math.random() * 6.28;
    for (let i = 0; i < n; i++) {
      const e = Math.min(i, n - 1 - i) * COLW;
      const tp = Math.sqrt(clamp(e / 14, 0.1, 1));
      const nz = 0.8 + 0.11 * Math.sin(i * 0.19 + p1) + 0.06 * Math.sin(i * 0.053 + p2) + 0.04 * Math.sin(i * 0.71 + p3);
      mx[i] = P * tp * nz;
      h[i] = mx[i] * 0.74;
    }
    return { kind, n, mx, h, x: 0, y: 0, w: 0, cw: COLW, hov: false, low: false };
  }
  function spawn(x, y, vx, vy, k) {
    if (reduced) return;
    if (powder.length >= 700) powder.splice(0, 60);
    const t = k === 't';
    powder.push({ x, y, vx, vy, k, age: 0, life: t ? 3 + Math.random() * 2.5 : 1.1 + Math.random() * 1.6, r: t ? 1.4 + Math.random() * 1.8 : 0.8 + Math.random() * 1.4, g: t ? 70 : 260, ph: Math.random() * 6.28 });
  }
  function knock(L, cx, rad, frac, dirX) {
    const top = scrollY;
    let spawned = 0;
    for (let i = 0; i < L.n; i++) {
      const lx = L.x + (i + 0.5) * L.cw;
      let w = 1;
      if (cx != null) { const d = Math.abs(lx - cx); if (d > rad) continue; w = 0.5 + 0.5 * Math.cos(Math.PI * d / rad); }
      const take = L.h[i] * frac * w;
      if (take <= 0.04) continue;
      L.h[i] -= take;
      if (spawned < 200 && Math.random() < Math.min(1, take * 0.4)) {
        spawned++;
        spawn(lx, L.y - top - L.h[i] - Math.random() * take, (dirX || 0) * (110 + Math.random() * 230) + (Math.random() - 0.5) * 70, -30 - Math.random() * 130, 'p');
      }
    }
    L.low = true;
  }
  function knockCap(el) {
    const c = caps.get(el) || 0;
    caps.set(el, 0.04);
    paintCaps();
    if (reduced) return;
    let rects = [];
    try { const rg = document.createRange(); rg.selectNodeContents(el); rects = Array.prototype.slice.call(rg.getClientRects()); } catch (e) { rects = [el.getBoundingClientRect()]; }
    const n = Math.round(30 + 50 * c);
    for (let j = 0; j < n; j++) {
      const r = rects[j % rects.length];
      if (!r || r.width < 2) continue;
      spawn(r.left + Math.random() * r.width, r.top + r.height * (0.12 + Math.random() * 0.14), (Math.random() - 0.5) * 120, -40 - Math.random() * 140, 'p');
    }
  }
  function setSnow(on, fromEl) {
    doc.setAttribute('data-snow', on ? 'on' : 'off');
    if (on) {
      capEls.forEach((el) => caps.set(el, 0.6));
      Object.keys(lmap).forEach((id) => { const L = lmap[id]; for (let i = 0; i < L.n; i++) L.h[i] = L.mx[i] * 0.74; });
      if (fromEl && !reduced) {
        const b = fromEl.getBoundingClientRect();
        for (let j = 0; j < 46; j++) spawn(b.left + b.width / 2, b.top + b.height / 2, (Math.random() - 0.5) * 360, -60 - Math.random() * 200, 't');
      }
    }
    paintCaps();
    syncUi();
    buildGarland();
    setTimeout(register, 950);
  }

  /* string lights under the top bar */
  const garland = $('.garland');
  function buildGarland() {
    if (!garland) return;
    garland.textContent = '';
    if (!snowOn()) return;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    const gw = Math.max(320, W), n = Math.max(3, Math.round(gw / 220)), sw = gw / n, sag = 16;
    svg.setAttribute('viewBox', '0 0 ' + gw + ' 44');
    svg.setAttribute('preserveAspectRatio', 'none');
    const wire = document.createElementNS(NS, 'path');
    let d = '';
    const colors = ['#FFE7B0', '#FF5A47', '#4CC38A', '#FFB347', '#5BC0FF'];
    const r = rng(5);
    const bulbs = [];
    for (let k = 0; k < n; k++) {
      const x0 = k * sw, x1 = (k + 1) * sw;
      d += 'M' + x0.toFixed(1) + ' 0 Q' + ((x0 + x1) / 2).toFixed(1) + ' ' + (2 * sag) + ' ' + x1.toFixed(1) + ' 0 ';
      for (let j = 0; j < 5; j++) {
        const t = (j + 0.5) / 5, bx = x0 + t * sw, by = 4 * sag * t * (1 - t);
        bulbs.push([bx, by, colors[(k * 5 + j) % colors.length], (1.3 + r() * 1.8).toFixed(2), (r() * 2).toFixed(2)]);
      }
    }
    wire.setAttribute('d', d);
    wire.setAttribute('fill', 'none');
    wire.setAttribute('stroke', pal().wire);
    wire.setAttribute('stroke-width', '1.2');
    svg.appendChild(wire);
    bulbs.forEach((b) => {
      const glow = document.createElementNS(NS, 'ellipse');
      glow.setAttribute('cx', b[0].toFixed(1)); glow.setAttribute('cy', (b[1] + 6.5).toFixed(1));
      glow.setAttribute('rx', '9'); glow.setAttribute('ry', '9'); glow.setAttribute('fill', b[2]); glow.setAttribute('opacity', '0.2');
      const cap = document.createElementNS(NS, 'rect');
      cap.setAttribute('x', (b[0] - 1.5).toFixed(1)); cap.setAttribute('y', (b[1] - 0.5).toFixed(1));
      cap.setAttribute('width', '3'); cap.setAttribute('height', '4'); cap.setAttribute('rx', '1'); cap.setAttribute('fill', pal().wire);
      const bulb = document.createElementNS(NS, 'ellipse');
      bulb.setAttribute('cx', b[0].toFixed(1)); bulb.setAttribute('cy', (b[1] + 6.5).toFixed(1));
      bulb.setAttribute('rx', '3.2'); bulb.setAttribute('ry', '4.4'); bulb.setAttribute('fill', b[2]);
      bulb.setAttribute('class', 'bulb');
      bulb.setAttribute('style', '--d:' + b[3] + 's;--b:' + b[4] + 's');
      svg.appendChild(glow); svg.appendChild(cap); svg.appendChild(bulb);
    });
    garland.appendChild(svg);
  }

  /* ---------- registering page elements (ledges, magnets, lit cards) ---------- */
  let mags = [], lits = [];
  function register() {
    const sy = scrollY;
    const next = [];
    $$('[data-ledge]').forEach((el) => {
      const id = el.getAttribute('data-lid');
      const kind = el.getAttribute('data-ledge');
      if (!id) return;
      const r = el.getBoundingClientRect();
      if (r.width < 6) return;
      const n = Math.max(2, Math.ceil(r.width / COLW));
      let L = lmap[id];
      if (!L || L.n !== n || L.kind !== kind) { L = makeLedge(kind, n); lmap[id] = L; }
      L.x = r.left; L.y = r.top + sy; L.w = r.width; L.cw = r.width / n;
      if (kind === 'pill') {
        const host = el.closest('a,button') || el.parentElement;
        const p = host.getBoundingClientRect();
        L.hx0 = p.left; L.hx1 = p.right; L.hy0 = p.top + sy - 8; L.hy1 = p.bottom + sy;
      }
      next.push(L);
    });
    ledges = next;
    mags = $$('[data-mag]').map((el) => {
      const prev = mags.find((m) => m.el === el);
      const tf = el.style.transform;
      el.style.transform = '';
      const r = el.getBoundingClientRect();
      el.style.transform = tf;
      return { el, cx: r.left + r.width / 2, cy: r.top + sy + r.height / 2, w: r.width, h: r.height, on: prev ? prev.on : false };
    });
    lits = $$('[data-lit]').map((el) => { const r = el.getBoundingClientRect(); return { el, x: r.left, y: r.top + sy, w: r.width, h: r.height, on: false }; });
    if (G) buildField();
  }

  /* ---------- blueprint ---------- */
  const insp = $('.inspect');
  const inspBox = $('.inspect__box');
  const inspPad = $('.inspect__pad');
  const inspDim = $('.inspect__dim');
  const inspCard = $('.inspect__card');
  const inspLabel = $('.inspect__label');
  const inspLines = $('.inspect__lines');
  let insEl = null;
  function hex(c) {
    const m = /rgba?\(([^)]+)\)/.exec(c || '');
    if (!m) return c || '';
    const p = m[1].split(',').map((s) => parseFloat(s));
    const h = (n) => ('0' + Math.round(n).toString(16)).slice(-2);
    const base = ('#' + h(p[0]) + h(p[1]) + h(p[2])).toUpperCase();
    return (p.length > 3 && p[3] < 1) ? base + ' · ' + Math.round(p[3] * 100) + '%' : base;
  }
  function showSpec(el) {
    if (el === insEl) return;
    insEl = el;
    if (!el) { insp.classList.remove('has-target'); return; }
    const sy = scrollY, sx = scrollX;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const x = r.left + sx, y = r.top + sy, w = r.width, h = r.height;
    const rows = [];
    const label = el.getAttribute('data-spec');
    if (!/Image|Card|List/.test(label)) {
      const fam = (cs.fontFamily || '').split(',')[0].replace(/["']/g, '').trim();
      const lh = cs.lineHeight === 'normal' ? 'auto' : Math.round(parseFloat(cs.lineHeight));
      rows.push(['Type', fam + ' ' + cs.fontWeight]);
      rows.push(['Size / line', Math.round(parseFloat(cs.fontSize)) + ' / ' + lh]);
      const ls = parseFloat(cs.letterSpacing);
      if (!isNaN(ls) && ls !== 0) rows.push(['Tracking', (ls / parseFloat(cs.fontSize)).toFixed(3) + 'em']);
      rows.push(['Color', hex(cs.color), cs.color]);
    }
    const bg = cs.backgroundColor;
    if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) rows.push(['Fill', hex(bg), bg]);
    const rad = parseFloat(cs.borderTopLeftRadius);
    if (rad) rows.push(['Radius', String(Math.round(rad))]);
    const pt = Math.round(parseFloat(cs.paddingTop)), pr = Math.round(parseFloat(cs.paddingRight)), pb = Math.round(parseFloat(cs.paddingBottom)), pl = Math.round(parseFloat(cs.paddingLeft));
    if (pt + pr + pb + pl > 0) rows.push(['Padding', pt === pb && pl === pr ? pt + ' · ' + pl : pt + ' ' + pr + ' ' + pb + ' ' + pl]);
    Object.assign(inspBox.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
    inspPad.style.display = pt + pr + pb + pl > 0 ? 'block' : 'none';
    Object.assign(inspPad.style, { left: pl + 'px', top: pt + 'px', right: pr + 'px', bottom: pb + 'px' });
    inspDim.textContent = Math.round(w) + ' × ' + Math.round(h);
    inspLabel.textContent = label;
    inspLines.textContent = '';
    rows.forEach((row) => {
      const d = document.createElement('div'); d.className = 'inspect__row';
      const k = document.createElement('span'); k.textContent = row[0];
      const v = document.createElement('span'); v.textContent = row[1];
      if (row[2]) { const sw = document.createElement('span'); sw.className = 'inspect__sw'; sw.style.background = row[2]; v.appendChild(sw); }
      d.appendChild(k); d.appendChild(v); inspLines.appendChild(d);
    });
    let cx, cy;
    if (x + w + 14 + 236 < W - 8) { cx = x + w + 14; cy = y; }
    else if (x - 14 - 236 >= 8) { cx = x - 14 - 236; cy = y; }
    else { cx = clamp(x, 8, W - 244); cy = y + h + 36; }
    Object.assign(inspCard.style, { left: cx + 'px', top: cy + 'px' });
    insp.classList.add('has-target');
  }
  function setBlueprint(on) {
    doc.setAttribute('data-blueprint', on ? 'on' : 'off');
    insEl = null;
    insp.classList.remove('has-target');
    syncUi();
  }
  document.addEventListener('click', (e) => {
    if (!blueprintOn()) return;
    const t = e.target && e.target.closest ? e.target : null;
    if (t && t.closest('[data-action],.hud,.dock')) return;
    e.preventDefault();
  }, true);

  /* ---------- toy dock ---------- */
  const dock = $('.dock');
  const dockToggle = $('.dock__toggle');
  const dockLabel = $('.dock__toggle-label');
  let nudgeT = 0;
  function setDock(open) {
    dock.classList.toggle('is-open', open);
    dockToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    dockToggle.setAttribute('aria-label', open ? 'Close the toys' : 'Open the toys: things to play with on this page');
    dockLabel.textContent = open ? 'Close' : 'Play';
  }
  function nudgeDock() {
    if (dock.classList.contains('is-open') || reduced) return;
    clearTimeout(nudgeT);
    dock.classList.add('is-nudge');
    nudgeT = setTimeout(() => dock.classList.remove('is-nudge'), 420);
  }

  /* ---------- actions ---------- */
  document.addEventListener('click', (e) => {
    const b = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
    if (!b) return;
    const a = b.getAttribute('data-action');
    if (a === 'theme') { userTheme = true; setTheme(!isDark()); }
    else if (a === 'snow') setSnow(!snowOn(), b);
    else if (a === 'blueprint') setBlueprint(!blueprintOn());
    else if (a === 'toys') setDock(!dock.classList.contains('is-open'));
    else if (a === 'open-toys') { setDock(true); dock.classList.add('is-nudge'); setTimeout(() => dock.classList.remove('is-nudge'), 420); }
    else if (a === 'noise') makeNoise();
  });
  let progUntil = 0;
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (a) progUntil = performance.now() + 2000;
  });

  /* ---------- pointer ---------- */
  let lp = null, ptr = null;
  function moveAt(x, y, isMouse) {
    const now = performance.now();
    const sy = scrollY;
    const cy = y + sy;
    px = x; py = y;
    let vx = 0, vy = 0;
    if (lp) {
      const dt = Math.max(8, now - lp.t) / 1000;
      vx = clamp((x - lp.x) / dt, -2500, 2500);
      vy = clamp((y - lp.y) / dt, -2500, 2500);
    }
    lp = { x, y, t: now };
    const sp = Math.sqrt(vx * vx + vy * vy);
    if (!reduced && G && cy < G.heroH && sp > 900) lastNoise = now;
    if (snowOn() && !reduced) {
      windT = clamp(windT + vx * 0.12, -280, 280);
      const R = 120;
      for (let i = 0; i < flakes.length; i++) { const f = flakes[i]; const dx = f.x - x, dy = f.y - y; const d = Math.sqrt(dx * dx + dy * dy); if (d < R) f.vx += vx * 0.4 * (1 - d / R); }
      if (sp > 650) {
        for (let i = 0; i < ledges.length; i++) {
          const L = ledges[i];
          if (x >= L.x && x <= L.x + L.w && cy >= L.y - 34 && cy <= L.y + 16) knock(L, x, 46, 0.55, vx >= 0 ? 1 : -1);
        }
      }
      if (isMouse) {
        for (let i = 0; i < ledges.length; i++) {
          const L = ledges[i];
          if (L.kind !== 'pill') continue;
          const inside = x >= L.hx0 && x <= L.hx1 && cy >= L.hy0 && cy <= L.hy1;
          if (inside && !L.hov) { L.hov = true; knock(L, null, 0, 0.85, (vx >= 0 ? 1 : -1) * 0.35); }
          else if (!inside && L.hov) L.hov = false;
        }
      }
    }
    if (isMouse && !reduced) {
      for (let i = 0; i < mags.length; i++) {
        const m = mags[i];
        const dx = x - m.cx, dy = cy - m.cy;
        const reach = Math.max(m.w, m.h) / 2 + 36;
        if (Math.abs(dx) < reach && Math.abs(dy) < reach * 0.8) {
          m.on = true;
          m.el.style.transition = 'transform 0.18s ease-out';
          m.el.style.transform = 'translate(' + clamp(dx * 0.16, -6, 6).toFixed(2) + 'px,' + clamp(dy * 0.22, -5, 5).toFixed(2) + 'px)';
        } else if (m.on) {
          m.on = false;
          m.el.style.transition = 'transform 0.5s cubic-bezier(.2,.9,.25,1.4)';
          m.el.style.transform = '';
        }
      }
      for (let i = 0; i < lits.length; i++) {
        const c = lits[i];
        if (x >= c.x - 40 && x <= c.x + c.w + 40 && cy >= c.y - 40 && cy <= c.y + c.h + 40) {
          c.on = true;
          c.el.style.setProperty('--mx', (x - c.x).toFixed(0) + 'px');
          c.el.style.setProperty('--my', (cy - c.y).toFixed(0) + 'px');
        } else if (c.on) {
          c.on = false;
          c.el.style.setProperty('--mx', '-999px');
          c.el.style.setProperty('--my', '-999px');
        }
      }
    }
  }
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') {
      moveAt(e.clientX, e.clientY, true);
      if (blueprintOn()) showSpec(e.target && e.target.closest ? e.target.closest('[data-spec]') : null);
    }
    if (ptr) { const dx = e.clientX - ptr.sx, dy = e.clientY - ptr.sy; ptr.moved = Math.max(ptr.moved, Math.sqrt(dx * dx + dy * dy)); }
  }, { passive: true });
  document.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button > 0) return;
    ptr = { sx: e.clientX, sy: e.clientY, t0: performance.now(), moved: 0 };
    if (blueprintOn() && e.pointerType !== 'mouse') showSpec(e.target && e.target.closest ? e.target.closest('[data-spec]') : null);
  }, { passive: true });
  document.addEventListener('pointerup', (e) => {
    const P = ptr;
    ptr = null;
    if (!P || performance.now() - P.t0 > 320 || P.moved > 10) return;
    tap(P.sx, P.sy, e.target);
  }, { passive: true });
  document.addEventListener('pointercancel', () => { ptr = null; }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { px = -9999; py = -9999; });
  document.addEventListener('mouseout', (e) => { if (!e.relatedTarget) { px = -9999; py = -9999; } });
  document.addEventListener('touchstart', (e) => { const t = e.touches && e.touches[0]; if (!t) return; lp = { x: t.clientX, y: t.clientY, t: performance.now() }; px = t.clientX; py = t.clientY; }, { passive: true });
  document.addEventListener('touchmove', (e) => { const t = e.touches && e.touches[0]; if (t) moveAt(t.clientX, t.clientY, false); }, { passive: true });
  document.addEventListener('touchend', () => { px = -9999; py = -9999; }, { passive: true });

  function tap(x, y, target) {
    if (blueprintOn()) return;
    const el = target && target.closest ? target : null;
    const cy = y + scrollY;
    const onUi = !!(el && el.closest('a,button'));
    if (!onUi && !reduced) {
      if (G && cy < G.heroH) {
        lastNoise = performance.now() + 350;
        frags.forEach((f) => { const a = Math.atan2(f.hy - cy, f.hx - x); f.vx += Math.cos(a) * 220; f.vy += Math.sin(a) * 180; });
      } else scatterAt(x, cy, 240);
    }
    if (!snowOn()) return;
    const host = el ? el.closest('a,button') : null;
    if (host) {
      $$('[data-ledge]', host).forEach((m) => { const L = lmap[m.getAttribute('data-lid')]; if (L) knock(L, null, 0, 0.9, 0); });
      return;
    }
    const capEl = el ? el.closest('[data-cap]') : null;
    if (capEl) { knockCap(capEl); return; }
    let hit = false;
    for (let i = 0; i < ledges.length; i++) {
      const L = ledges[i];
      if (x >= L.x - 10 && x <= L.x + L.w + 10 && cy >= L.y - 28 && cy <= L.y + 34) { knock(L, x, 72, 0.9, 0); hit = true; }
    }
    if (!hit) for (let j = 0; j < 16; j++) spawn(x, y, (Math.random() - 0.5) * 300, -150 - Math.random() * 220, 't');
  }

  /* ---------- scrolling ---------- */
  let lsT = 0, lsY = scrollY, lastShake = 0;
  function setScrolled(sy) { doc.classList.toggle('is-scrolled', sy > 24); }
  addEventListener('scroll', () => {
    const now = performance.now();
    const sy = scrollY;
    const dt = Math.max(8, now - (lsT || now - 16));
    const v = ((sy - lsY) / dt) * 1000;
    lsT = now; lsY = sy;
    if (now > progUntil) {
      if (Math.abs(v) > 300 && G && sy < G.heroH) lastNoise = now;
      if (Math.abs(v) > 1300) fieldNoise = now;
    }
    if (snowOn() && Math.abs(v) > 2200 && !reduced && now - lastShake > 450 && now > progUntil) {
      lastShake = now;
      ledges.forEach((L) => { const vy = L.y - sy; if (vy > -20 && vy < H + 20) knock(L, null, 0, 0.35, (Math.random() - 0.5) * 0.6); });
      capEls.forEach((el) => caps.set(el, caps.get(el) * 0.8));
      paintCaps();
    }
    setScrolled(sy);
  }, { passive: true });

  /* ---------- sizing ---------- */
  function resize() {
    const nw = doc.clientWidth;
    const widthChanged = nw !== W || !G;
    W = nw; H = innerHeight; dpr = Math.min(2, devicePixelRatio || 1);
    if (fieldCv) { fieldCv.width = Math.round(W * dpr); fieldCv.height = Math.round(H * dpr); }
    if (snowCv) { snowCv.width = Math.round(W * dpr); snowCv.height = Math.round(H * dpr); }
    const oldH = G ? G.heroH : -1, oldGy = G ? G.gy : -1;
    G = geo();
    if (heroCv) {
      heroCv.width = Math.round(W * dpr); heroCv.height = Math.round(G.heroH * dpr);
      heroCv.style.width = W + 'px'; heroCv.style.height = G.heroH + 'px';
    }
    if (widthChanged || Math.abs(oldH - G.heroH) > 60 || Math.abs(oldGy - G.gy) > 1) initFrags();
    if (!flakes.length || Math.abs(W - flakeW) > 40) initFlakes();
    fieldSig = '';
    buildGarland();
    register();
  }
  let rzT = 0;
  addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(resize, 120); });
  addEventListener('load', register);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fieldSig = ''; resize(); });
  setInterval(register, 1000);

  /* UpLevel logo: if the file is missing, show a clean lettered tile instead of a broken image */
  $$('img.logo-ul').forEach((img) => {
    const swap = () => {
      const s = document.createElement('span');
      s.className = img.className + ' logo-fallback';
      s.setAttribute('aria-hidden', 'true');
      s.style.width = img.getAttribute('width') + 'px';
      s.style.height = img.getAttribute('width') + 'px';
      s.style.borderRadius = getComputedStyle(img).borderRadius;
      s.style.fontSize = Math.round(img.getAttribute('width') * 0.45) + 'px';
      s.textContent = 'U';
      img.replaceWith(s);
    };
    if (img.complete && !img.naturalWidth) swap(); else img.addEventListener('error', swap);
  });

  /* ---------- frame ---------- */
  let last = performance.now(), lastTop = scrollY, snowDrawn = false;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    const top = scrollY;
    const dy = top - lastTop;
    lastTop = top;
    if (G) { heroFrame(now, dt, top); fieldFrame(now, dt, top); }

    if (!snowCtx) return;
    const on = snowOn();
    if (!on && !powder.length) {
      if (snowDrawn) { snowCtx.setTransform(1, 0, 0, 1, 0, 0); snowCtx.clearRect(0, 0, snowCv.width, snowCv.height); snowDrawn = false; }
      return;
    }
    snowDrawn = true;
    const th = pal();
    const sp = sprite(th);
    const move = !reduced;
    wind += (windT - wind) * (1 - Math.exp(-dt / 0.25));
    windT *= Math.exp(-dt / 1.1);
    snowCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    snowCtx.clearRect(0, 0, W, H);

    if (on) {
      const vis = [];
      for (let i = 0; i < ledges.length; i++) { const L = ledges[i]; const vy = L.y - top; if (vy > -40 && vy < H + 40) { L.vy = vy; vis.push(L); } }
      const decay = Math.exp(-dt / 0.7);
      const canLand = move && Math.abs(dy) < 30;
      for (let i = 0; i < flakes.length; i++) {
        const f = flakes[i];
        if (move) {
          const pyy = f.y;
          f.vx *= decay;
          f.x += (Math.sin(now * 0.0006 * f.sp + f.ph) * f.sw + wind * f.d + f.vx) * dt;
          f.y += f.vy * dt - dy * f.d * 0.5;
          if (canLand && f.d >= 0.6) {
            for (let j = 0; j < vis.length; j++) {
              const L = vis[j];
              if (f.x < L.x || f.x >= L.x + L.w) continue;
              const c = Math.min(L.n - 1, ((f.x - L.x) / L.cw) | 0);
              const sy = L.vy - L.h[c];
              if (pyy - (sy + dy) < 0 && f.y - sy >= 0 && f.y - sy < 16) {
                const a = f.r * 0.34;
                for (let k = -2; k <= 2; k++) {
                  const cc = c + k;
                  if (cc < 0 || cc >= L.n) continue;
                  L.h[cc] = Math.min(L.mx[cc], L.h[cc] + a * (k === 0 ? 1 : (k === 1 || k === -1) ? 0.6 : 0.25));
                }
                f.y = -6 - Math.random() * 30; f.x = Math.random() * W; f.vx = 0;
                break;
              }
            }
          }
          if (f.y > H + 6) { f.y = -6; f.x = Math.random() * W; }
          if (f.y < -40) f.y = H + 4;
          if (f.x > W + 8) f.x = -8;
          if (f.x < -8) f.x = W + 8;
        }
        const sz = f.r * 2.6;
        snowCtx.globalAlpha = f.a;
        snowCtx.drawImage(sp, f.x - sz / 2, f.y - sz / 2, sz, sz);
      }
      for (let j = 0; j < vis.length; j++) {
        const L = vis[j];
        if (!L.low) continue;
        let any = false;
        for (let c = 0; c < L.n; c++) { const tg = L.mx[c] * 0.55; if (L.h[c] < tg) { L.h[c] += (tg - L.h[c]) * Math.min(1, dt / 10); any = true; } }
        L.low = any;
      }
      snowCtx.globalAlpha = 1;
      for (let pass = 0; pass < 2; pass++) {
        snowCtx.fillStyle = pass === 0 ? th.snowSh : th.snow;
        const off = pass === 0 ? 1.8 : 0;
        snowCtx.beginPath();
        for (let j = 0; j < vis.length; j++) {
          const L = vis[j];
          const b = L.vy + 0.6 + off;
          snowCtx.moveTo(L.x, b);
          for (let c = 0; c < L.n; c++) snowCtx.lineTo(L.x + (c + 0.5) * L.cw, b - L.h[c]);
          snowCtx.lineTo(L.x + L.w, b);
          snowCtx.closePath();
        }
        snowCtx.fill();
      }
    }

    const pd = Math.exp(-dt * 1.2);
    for (let i = powder.length - 1; i >= 0; i--) {
      const p = powder[i];
      p.age += dt;
      if (p.age > p.life || p.y > H + 30 || p.y < -400) { powder[i] = powder[powder.length - 1]; powder.pop(); continue; }
      p.vx *= pd;
      p.vy += p.g * dt;
      if (p.k === 't') { if (p.vy > 55) p.vy += (55 - p.vy) * Math.min(1, dt * 3); } else if (p.vy > 240) p.vy = 240;
      p.x += (p.vx + wind * 0.7 + (p.k === 't' ? Math.sin(now * 0.002 + p.ph) * 14 : 0)) * dt;
      p.y += p.vy * dt - dy;
      const qa = p.age / p.life;
      snowCtx.globalAlpha = (qa > 0.7 ? (1 - qa) / 0.3 : 1) * Math.min(1, p.age / 0.12) * 0.95;
      const sz = p.r * 2.6;
      snowCtx.drawImage(sp, p.x - sz / 2, p.y - sz / 2, sz, sz);
    }
    snowCtx.globalAlpha = 1;
  }

  /* ---------- start ---------- */
  resize();
  syncUi();
  paintCaps();
  setScrolled(scrollY);
  if (q.get('toys') === 'open') setDock(true);
  requestAnimationFrame(frame);
})();
