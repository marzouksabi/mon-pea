/* Repli : signaux du soir, ordres a passer, suivi du compte FundedNext et journal.
   Tout est calcule sur l'appareil ; les donnees du journal restent dans le navigateur (localStorage). */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var DAY = 86400000;
  var MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  var nf = function (v, d) { return v.toLocaleString('fr-FR', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); };
  var usd = function (v, d) { return (v < 0 ? '−' : '') + nf(Math.abs(v), d || 0) + ' $'; };
  var sUsd = function (v) { return (v >= 0 ? '+' : '−') + nf(Math.abs(v), 0) + ' $'; };
  var pct = function (v, d) { return (v >= 0 ? '+' : '−') + nf(Math.abs(v * 100), d === undefined ? 1 : d) + ' %'; };
  var px = function (v) { return nf(v, v < 1000 ? 2 : 0); };
  var ds = function (d) { return new Date(d * DAY).toISOString().slice(0, 10); };
  var dn = function (s) { return Math.floor(Date.parse(s + 'T00:00:00Z') / DAY); };
  var shortDay = function (d) { var x = new Date(d * DAY); return x.getUTCDate() + ' ' + MOIS[x.getUTCMonth()]; };
  var longDay = function (d) { var x = new Date(d * DAY); return JOURS[x.getUTCDay()] + ' ' + x.getUTCDate() + ' ' + MOIS[x.getUTCMonth()]; };
  var jours = function (n) { return n + ' jour' + (n > 1 ? 's' : ''); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  /* icones (trait fin, couleur du texte) : aucune emoji dans l'application */
  var ICONS = {
    enter: '<path d="M7 17 17 7"/><path d="M9 7h8v8"/>',
    exit: '<path d="M9 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3"/><path d="m15 16 4-4-4-4"/><path d="M19 12H9"/>',
    hold: '<rect x="6.5" y="5" width="3.5" height="14" rx="1"/><rect x="14" y="5" width="3.5" height="14" rx="1"/>',
    none: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12h8"/>',
    stop: '<path d="M8.3 3h7.4L21 8.3v7.4L15.7 21H8.3L3 15.7V8.3z"/><path d="m9.5 9.5 5 5M14.5 9.5l-5 5"/>',
    wait: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    tight: '<path d="M12 4 21 20H3z"/><path d="M12 10v4.5"/><path d="M12 17.3v.2"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    cross: '<path d="m6.5 6.5 11 11M17.5 6.5l-11 11"/>',
    alert: '<path d="M12 6.5v7"/><path d="M12 17.3v.2"/>',
    info: '<path d="M12 10.5v7"/><path d="M12 6.8v.2"/>',
    cash: '<path d="M15.5 8.5c-.6-1.2-1.9-2-3.5-2-2 0-3.5 1.1-3.5 2.6 0 3.5 7 1.9 7 5.4 0 1.5-1.5 2.6-3.5 2.6-1.6 0-3-.8-3.6-2"/><path d="M12 4.5v2M12 17.1v2.4"/>'
  };
  var ico = function (n, cls) { return '<svg class="ico' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[n] || '') + '</svg>'; };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('repli:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('repli:' + k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } }
  };

  /* ---------- calendrier de la Bourse de New York ---------- */
  /* jours feries et fermetures a 13 h de la Bourse de New York, calcules d'apres les regles du NYSE (2025 a 2045) */
  var HOLIDAYS = [], EARLY = [];
  (function () {
    var iso = function (t) { return new Date(t).toISOString().slice(0, 10); };
    var U = function (y, m, d) { return Date.UTC(y, m - 1, d); };
    var wd = function (y, m, d) { return new Date(U(y, m, d)).getUTCDay(); };                 // dimanche = 0
    var nth = function (y, m, w, n) { return U(y, m, 1 + (w - wd(y, m, 1) + 7) % 7 + 7 * (n - 1)); };
    var lastMon = function (y, m) { var t = U(y, m + 1, 0); return t - ((new Date(t).getUTCDay() + 6) % 7) * DAY; };
    var obs = function (y, m, d) { var w = wd(y, m, d); return U(y, m, d) + (w === 6 ? -DAY : w === 0 ? DAY : 0); };
    var easter = function (y) {
      var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
      var h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
      return U(y, Math.floor((h + l - 7 * m + 114) / 31), (h + l - 7 * m + 114) % 31 + 1);
    };
    for (var y = 2025; y <= 2045; y++) {
      if (wd(y, 1, 1) !== 6) HOLIDAYS.push(iso(obs(y, 1, 1)));                                  // 1er janvier un samedi : pas de report
      [nth(y, 1, 1, 3), nth(y, 2, 1, 3), easter(y) - 2 * DAY, lastMon(y, 5), obs(y, 6, 19), obs(y, 7, 4), nth(y, 9, 1, 1), nth(y, 11, 4, 4), obs(y, 12, 25)]
        .forEach(function (t) { HOLIDAYS.push(iso(t)); });
      if (wd(y, 7, 4) >= 2 && wd(y, 7, 4) <= 5) EARLY.push(iso(U(y, 7, 3)));                    // veille du 4 juillet
      EARLY.push(iso(nth(y, 11, 4, 4) + DAY));                                                   // lendemain de Thanksgiving
      if (wd(y, 12, 24) >= 1 && wd(y, 12, 24) <= 4) EARLY.push(iso(U(y, 12, 24)));              // veille de Noel
    }
  })();
  var isTrading = function (d) { var w = new Date(d * DAY).getUTCDay(); return w > 0 && w < 6 && HOLIDAYS.indexOf(ds(d)) < 0; };
  var nextTrading = function (d) { d++; while (!isTrading(d)) d++; return d; };
  var nyHour = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' });
  var parisHM = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
  var parisYMD = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });
  function closeUTC(d) {                                              // instant (ms) de la cloture de New York le jour d
    var target = EARLY.indexOf(ds(d)) >= 0 ? 13 : 16;
    for (var h = 15; h <= 23; h++) { var t = d * DAY + h * 3600000; if (+nyHour.format(new Date(t)) === target) return t; }
    return d * DAY + 21 * 3600000;
  }
  var hm = function (t) { return parisHM.format(new Date(t)).replace(':', ' h '); };
  var qaShift = 0, qaFreeze = false, nowMs = function () { return Date.now() + qaShift; };   // decalage d'horloge : seulement en mode test (?qa)
  var parisToday = function () { return dn(parisYMD.format(new Date(nowMs()))); };

  /* ---------- reglages et journal ---------- */
  var VERSION = 'version du 12/11 12:36';
  var DEF = { size: 50000, lev: 0.5, dose: true, phase: 1, start: '', bal: '', ct: { spx: 10, ndx: 10 }, step: 0.01 };   // dose : taille dosee par la volatilite (base 0,75 x)   // FundedNext : 1 lot d'indice = 10 fois l'indice
  var cfg = Object.assign({}, DEF, store.get('cfg', {}));
  cfg.ct = Object.assign({}, DEF.ct, cfg.ct || {});
  var trades = store.get('trades', []);
  /* correction du 11 nov. 2026 : taille de contrat des indices chez FundedNext = 10 (et non 1). Les reglages restes a 1 passent a 10 ;
     les trades deja notes gardent la taille de contrat avec laquelle ils ont ete calcules. */
  var CTFIX = store.get('ctfix', null);
  if (!CTFIX) {
    var ctChanged = false;
    ['spx', 'ndx'].forEach(function (k) { if (+cfg.ct[k] === 1) { cfg.ct[k] = 10; ctChanged = true; } });
    trades.forEach(function (t) { if (!t.ct) t.ct = 1; });
    CTFIX = { at: Date.now(), changed: ctChanged }; store.set('ctfix', CTFIX); store.set('cfg', cfg); store.set('trades', trades);
  }
  var ctOf = function (t) { return +t.ct || +cfg.ct[t.idx] || 10; };
  var manual = store.get('manual', {});                              // prix MT5 saisis : {spx: {p, day}, ...}

  /* ---------- donnees ---------- */
  var IDX = { spx: { name: 'S&P 500', sym: 'SPX500' }, ndx: { name: 'Nasdaq-100', sym: 'NDX100' } };
  var LIVE = null, A = {};

  function replay(c) {
    var n = c.length, au = [0], ad = [0], sma200 = [], i, j, tr = [], open = null, s = 0;
    for (i = 1; i < n; i++) { var d = c[i] - c[i - 1]; au[i] = (au[i - 1] + Math.max(d, 0)) / 2; ad[i] = (ad[i - 1] + Math.max(-d, 0)) / 2; }
    for (i = 0; i < n; i++) { s += c[i]; if (i >= 200) s -= c[i - 200]; sma200[i] = i >= 199 ? s / 200 : NaN; }
    var sma5 = function (k) { return (c[k] + c[k - 1] + c[k - 2] + c[k - 3] + c[k - 4]) / 5; };
    var rsi = function (k) { return ad[k] === 0 ? 100 : 100 - 100 / (1 + au[k] / ad[k]); };
    for (i = 199; i < n; i++) {
      if (c[i] > sma200[i] && rsi(i) < 10) {
        j = i + 1;
        while (j < n && !(c[j] > sma5(j)) && j - i < 10) j++;
        if (j >= n) { open = i; break; }
        tr.push([i, j]); i = j;
      }
    }
    return { trades: tr, open: open, au: au[n - 1], ad: ad[n - 1], rsi: rsi(n - 1), sma200: sma200 };
  }

  function analyze(k, cut) {                                         // cut : n'utiliser que les cut premiers jours (etat de la veille)
    var I = IDX[k], c = cut ? I.c.slice(0, cut) : I.c, days = cut ? I.days.slice(0, cut) : I.days, n = c.length, st = replay(c), P = c[n - 1], F = 0, q;
    for (q = n - 199; q < n; q++) F += c[q];
    F /= 199;
    var r = { k: k, name: I.name, sym: I.sym, P: P, last: days[n - 1], rsi: st.rsi, sma200: st.sma200[n - 1], st: st, F: F };
    if (st.open !== null) {
      var e = st.open;
      r.mode = 'pos'; r.e = e; r.entry = c[e]; r.entryDay = days[e]; r.held = n - e; r.forced = r.held >= 10;
      r.Y = (c[n - 4] + c[n - 3] + c[n - 2] + c[n - 1]) / 4; r.pnl = P / c[e] - 1;
    } else {
      r.mode = 'flat';
      r.X = st.ad > 9 * st.au ? P + (st.ad - 9 * st.au) / 9 : P - (9 * st.au - st.ad);
      r.possible = r.X > F;
    }
    var lastE = st.open !== null ? days[st.open] : (st.trades.length ? days[st.trades[st.trades.length - 1][0]] : null);
    r.lastEntry = lastE;
    return r;
  }

  /* prix du moment : saisi dans MT5 pour la seance du soir, sinon releve automatique recent */
  function nowPrice(k, session) {
    var m = manual[k];
    if (m && m.day === session && m.p > 0) return { p: m.p, src: 'MT5 à ' + hm(m.at || nowMs()), t: m.at || nowMs() };
    var Q = LIVEQ[k];
    if (Q && Q.day === session && nowMs() - Q.at < 30 * 60000) return { p: Q.p, src: Q.src, auto: true, live: true, delayed: Q.delayed, t: Q.t || Q.at };
    var L = LIVE && LIVE[k];
    if (L && L.t) {
      var age = nowMs() - L.t * 1000, nyDay = dn(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(L.t * 1000)));
      if (nyDay === session && age < 75 * 60000) return { p: L.p, src: 'relevé de ' + hm(L.t * 1000), auto: true, t: L.t * 1000 };
    }
    return null;
  }

  /* taille de position dosee par la volatilite (labo, 4e lot, journal 4.21) : base 0,75 x (volatilite de reference / volatilite
     des 20 dernieres seances), entre 0,375 x et 1,5 x par indice. Reference = mediane de la volatilite 20 j sur les 750 seances
     precedentes. Taille fixe possible dans Compte. */
  var BASE = 0.75, SIGC = {};
  function sd(a) { var m = 0, v = 0, i; for (i = 0; i < a.length; i++) m += a[i]; m /= a.length; for (i = 0; i < a.length; i++) v += (a[i] - m) * (a[i] - m); return Math.sqrt(v / (a.length - 1)); }
  function sigTab(k) {
    var c = IDX[k].c, n = c.length, key = n + ':' + c[n - 1];
    if (SIGC[k] && SIGC[k].key === key) return SIGC[k];
    var lr = [NaN], s20 = [NaN], i;
    for (i = 1; i < n; i++) lr.push(Math.log(c[i] / c[i - 1]));
    for (i = 1; i < n; i++) s20.push(i >= 20 ? sd(lr.slice(i - 19, i + 1)) : NaN);
    return (SIGC[k] = { key: key, lr: lr, s20: s20, ref: {} });
  }
  function refAt(k, i) {
    var T = sigTab(k);
    if (T.ref[i] === undefined) {
      var w = i < 770 ? [] : T.s20.slice(i - 750, i).filter(function (x) { return !isNaN(x); }).sort(function (a, b) { return a - b; }), m = w.length;
      T.ref[i] = m ? (m % 2 ? w[(m - 1) / 2] : (w[m / 2 - 1] + w[m / 2]) / 2) : NaN;
    }
    return T.ref[i];
  }
  var clampLev = function (x) { return Math.max(BASE / 2, Math.min(BASE * 2, x)); };
  function levAt(k, i) {                                             // taille d'un trade entre a la cloture i
    if (!cfg.dose) return +cfg.lev;
    var s = sigTab(k).s20[i], r = refAt(k, i);
    return isNaN(s) || isNaN(r) || s <= 0 ? BASE : clampLev(BASE * r / s);
  }
  function levNow(k, p) {                                            // taille pour une entree ce soir, le prix p tenant lieu de cloture
    if (!cfg.dose) return +cfg.lev;
    var I = IDX[k], n = I.c.length, T = sigTab(k);
    if (!(p > 0)) return levAt(k, n - 1);
    var s = sd(T.lr.slice(n - 19, n).concat([Math.log(p / I.c[n - 1])])), r = refAt(k, n);
    return isNaN(r) || s <= 0 ? BASE : clampLev(BASE * r / s);
  }
  var levTxt = function (lev) { return nf(lev, 2) + ' ×'; };
  function lotsFor(k, price, lev) {
    if (lev === undefined) lev = levNow(k, price);
    var units = cfg.size * lev / price, ct = +cfg.ct[k] || 10, step = +cfg.step || 0.01;
    var lots = Math.floor(units / ct / step + 1e-9) * step;
    return { lots: +lots.toFixed(6), notional: lots * ct * price, lev: lev };
  }
  var stopFor = function (lev) { return 0.015 / lev; };             // regle des 3 % : 1,5 % du compte de risque par indice
  var levMax = function () { return cfg.phase == 3 ? 15 : 25; };
  function margeTxt(notional) { var m = notional / levMax(); return usd(m) + ' (' + nf(m / cfg.size * 100, 0) + ' %)'; }
  /* date de vente obligatoire : 10e jour de Bourse apres l'achat */
  function deadline(a) { var d = session; for (var q = a.held; q < 10; q++) d = nextTrading(d); return d; }

  /* ---------- compte ---------- */
  function pnlOf(t) {
    var ct = ctOf(t), out = t.p2 > 0 ? t.p2 : (A[t.idx] ? A[t.idx].P : t.p1);
    return (out - t.p1) * t.lots * ct - (+t.fee || 0);
  }
  function account() {
    var size = +cfg.size, start = cfg.start ? dn(cfg.start) : null, closed = 0, open = 0, days = {}, lastAct = null;
    trades.forEach(function (t) {
      var d1 = dn(t.d1), d2 = t.d2 ? dn(t.d2) : null;
      if (start === null || d1 >= start) { days[t.d1] = 1; if (d2 !== null) days[t.d2] = 1; }
      lastAct = Math.max(lastAct || 0, d1, d2 || 0);
      if (d2 !== null && (start === null || d2 >= start)) closed += pnlOf(t);
      if (d2 === null) open += pnlOf(t);
    });
    var bal = cfg.bal !== '' && +cfg.bal > 0 ? +cfg.bal : size + closed, est = !(cfg.bal !== '' && +cfg.bal > 0);
    var target = cfg.phase == 1 ? size * 1.08 : cfg.phase == 2 ? size * 1.05 : null;
    var today = parisToday(), refDay = lastAct !== null ? lastAct : (start !== null ? start : today);
    var payout = null;
    if (cfg.phase == 3 && start !== null) { payout = start + 21; while (payout < today) payout += 14; }
    var risk = 0;
    trades.forEach(function (t) { if (!t.d2) { var lv = t.p1 * t.lots * ctOf(t) / size; risk += t.p1 * stopFor(lv) * t.lots * ctOf(t); } });
    return { size: size, bal: bal, est: est, equity: bal + open, open: open, target: target, maxFloor: size * 0.9, dayFloor: bal - size * 0.05,
      tradingDays: Object.keys(days).length, inactive: today - refDay, deadline: refDay + 60, payout: payout, risk: risk };
  }

  /* ---------- graphique (lignes, survol) ---------- */
  function lineChart(el, o) {
    var W = Math.max(280, el.clientWidth || 600), H = o.height || 170, L = 50, R = 12, T = 10, B = 22, n = o.x.length;
    var vals = []; o.series.forEach(function (s) { s.v.forEach(function (v) { if (isFinite(v)) vals.push(v); }); });
    var refs = o.refs || (o.ref ? [o.ref] : []);
    refs.forEach(function (r) { vals.push(r.v); });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
    var X = function (i) { return L + (W - L - R) * (n > 1 ? i / (n - 1) : 0); }, Y = function (v) { return T + (H - T - B) * (1 - (v - lo) / (hi - lo)); };
    var ticks = [], step = Math.pow(10, Math.floor(Math.log10((hi - lo) / 3))), m = (hi - lo) / step > 6 ? 2 : 1; step *= m;
    for (var t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
    var g = '';
    ticks.forEach(function (t) { g += '<line class="gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(t) + '" y2="' + Y(t) + '"/><text class="ax" x="' + (L - 6) + '" y="' + (Y(t) + 4) + '" text-anchor="end">' + (o.fmt ? o.fmt(t) : nf(t)) + '</text>'; });
    var xl = [0, Math.floor(n / 2), n - 1];
    xl.forEach(function (i, q) { g += '<text class="ax" x="' + X(i) + '" y="' + (H - 4) + '" text-anchor="' + (q === 0 ? 'start' : q === 2 ? 'end' : 'middle') + '">' + shortDay(o.x[i]) + '</text>'; });
    refs.forEach(function (r) {
      if (r.zone === 'above') g += '<rect class="zone-good" x="' + L + '" y="' + T + '" width="' + (W - L - R) + '" height="' + Math.max(0, Y(r.v) - T) + '"/>';
      if (r.zone === 'below') g += '<rect class="zone-crit" x="' + L + '" y="' + Y(r.v) + '" width="' + (W - L - R) + '" height="' + Math.max(0, H - B - Y(r.v)) + '"/>';
    });
    refs.slice().sort(function (a, b) { return b.v - a.v; }).forEach(function (r, q, arr) {
      var y = Y(r.v), prev = q ? Y(arr[q - 1].v) : -99, below = y - prev < 16 && q > 0;
      g += '<line class="' + (r.cls || 'ref') + '" x1="' + (r.tail ? W - R - (W - L - R) * 0.14 : L) + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '"/><text class="reflab" x="' + (W - R) + '" y="' + (below ? y + 14 : y - 5) + '" text-anchor="end">' + esc(r.label) + '</text>';
    });
    o.series.forEach(function (s) {
      var d = ''; s.v.forEach(function (v, i) { if (isFinite(v)) d += (d ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); });
      g += '<path class="ln" d="' + d + '" stroke="var(' + s.c + ')"/>';
    });
    g += '<g class="hov" style="display:none"><line class="cross" y1="' + T + '" y2="' + (H - B) + '"/>' + o.series.map(function (s) { return '<circle class="dot" r="4" fill="var(' + s.c + ')"/>'; }).join('') + '</g>';
    g += '<rect x="' + L + '" y="0" width="' + (W - L - R) + '" height="' + H + '" fill="transparent" class="hit"/>';
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.label || '') + '">' + g + '</svg><div class="tip" hidden></div>' +
      (o.series.length > 1 ? '<div class="legend">' + o.series.map(function (s) { return '<span><i style="background:var(' + s.c + ')"></i>' + esc(s.name) + '</span>'; }).join('') + '</div>' : '') +
      (o.note ? '<p class="chart-note">' + esc(o.note) + '</p>' : '');
    var svg = el.querySelector('svg'), hov = el.querySelector('.hov'), tip = el.querySelector('.tip'), cross = hov.querySelector('line'), dots = hov.querySelectorAll('circle');
    function move(ev) {
      var r = svg.getBoundingClientRect(), sx = (ev.clientX - r.left) * W / r.width, i = Math.round((sx - L) / (W - L - R) * (n - 1));
      i = Math.max(0, Math.min(n - 1, i));
      hov.style.display = ''; cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i));
      var html = '<div>' + shortDay(o.x[i]) + ' ' + new Date(o.x[i] * DAY).getUTCFullYear() + '</div>';
      o.series.forEach(function (s, q) {
        var v = s.v[i]; if (!isFinite(v)) { dots[q].style.display = 'none'; return; }
        dots[q].style.display = ''; dots[q].setAttribute('cx', X(i)); dots[q].setAttribute('cy', Y(v));
        html += '<div><span class="k" style="background:var(' + s.c + ')"></span>' + esc(s.name) + ' <b>' + (o.fmt ? o.fmt(v) : nf(v)) + '</b></div>';
      });
      tip.innerHTML = html; tip.hidden = false;
      var tx = X(i) * r.width / W, ty = Math.min.apply(null, o.series.map(function (s) { return isFinite(s.v[i]) ? Y(s.v[i]) : H; })) * r.height / H - 8;
      tip.style.left = Math.max(70, Math.min(r.width - 70, tx)) + 'px'; tip.style.top = Math.max(40, ty) + 'px';
    }
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerdown', move);
    svg.addEventListener('pointerleave', function () { hov.style.display = 'none'; tip.hidden = true; });
  }

  /* ---------- rendu ---------- */
  var session = null;
  var cap = function (s) { return s.replace(/^./, function (c) { return c.toUpperCase(); }); };

  /* Etat d'un indice, avec le meme vocabulaire partout : entrer (acheter), sortir (fermer le trade),
     prix de fin de journee (22 h a Paris), niveau d'entree, niveau de sortie. */
  function plan(k) {
    var a = A[k], I = IDX[k], np = nowPrice(k, session), live = np ? np.p : null, ct = +cfg.ct[k] || 10;
    var jt = trades.filter(function (t) { return t.idx === k && !t.d2; })[0] || null;
    var o = { k: k, a: a, I: I, np: np, step: 1, tone: 'idle', title: '', sub: '', check: null, how: null, trade: null };
    var lastClose = I.c[I.c.length - 1], cur = live || lastClose;
    if (a.mode === 'pos') {
      var ltr = lotsFor(k, a.entry, levAt(k, a.e));
      var tr = { real: !!jt, d1: jt ? dn(jt.d1) : a.entryDay, p1: jt ? jt.p1 : a.entry, lots: jt ? jt.lots : ltr.lots, fee: jt ? (+jt.fee || 0) : 0 };
      if (jt) ct = ctOf(jt);
      tr.ct = ct;
      tr.lev = jt ? tr.p1 * tr.lots * ct / cfg.size : ltr.lev;
      tr.cur = cur; tr.pnl = (cur - tr.p1) * tr.lots * ct - tr.fee; tr.r = cur / tr.p1 - 1; tr.stop = cfg.phase == 3 ? tr.p1 * (1 - stopFor(tr.lev)) : null;
      tr.hit = null;
      if (tr.stop) for (var q = 0; q < I.days.length; q++) if (I.days[q] > tr.d1 && I.l[q] <= tr.stop) { tr.hit = I.days[q]; break; }
      tr.deadline = deadline(a);
      o.trade = tr; o.step = 2;
      if (tr.hit) {
        o.step = 3; o.tone = 'alert';
        o.title = 'Trade terminé par le stop le ' + longDay(tr.hit);
        o.sub = 'Le prix est tombé sous ' + px(tr.stop) + ' : MT5 a fermé le trade tout seul (perte d\'environ ' + usd(tr.p1 * stopFor(tr.lev) * tr.lots * ct) + '). Note la sortie dans le Journal.';
      } else if (a.forced) {
        o.step = 3; o.tone = 'act';
        o.title = 'Ce soir : sortir du trade, quoi qu\'il arrive';
        o.sub = 'C\'est le dernier jour autorisé (environ 2 semaines après l\'entrée), même si le prix n\'est pas remonté.';
        o.how = 'exit';
      } else {
        o.tone = 'watch';
        o.title = 'Ce soir : sortir seulement si le ' + I.name + ' finit la journée au-dessus de ' + px(a.Y);
        o.sub = 'Il doit monter d\'au moins ' + pct(a.Y / lastClose - 1) + ' par rapport à hier. Sinon, on garde le trade. Sortie obligatoire le ' + longDay(tr.deadline) + ', quoi qu\'il arrive.';
        if (live) o.check = live > a.Y ? { cls: 'act', txt: 'À ce prix, il faut sortir ce soir', sub: 'Le prix (' + px(live) + ') est au-dessus du niveau de sortie ' + px(a.Y) + '.' }
          : { cls: 'ok', txt: 'À ce prix, on garde le trade', sub: 'Le prix (' + px(live) + ') est encore sous le niveau de sortie ' + px(a.Y) + ' (il manque ' + pct(a.Y / live - 1) + ').' };
        if (live && live > a.Y) { o.step = 3; o.how = 'exit'; }
      }
    } else if (jt) {
      var lastT = a.st.trades.length ? a.st.trades[a.st.trades.length - 1] : null, ex = lastT && I.days[lastT[1]] >= dn(jt.d1) ? lastT : null;
      var ctj = ctOf(jt), pxOut = ex ? I.c[ex[1]] : cur;
      o.trade = { real: true, orphan: true, id: jt.id, d1: dn(jt.d1), p1: jt.p1, lots: jt.lots, fee: +jt.fee || 0, cur: pxOut, stop: null, hit: null,
        exitDay: ex ? I.days[ex[1]] : null, deadline: ex ? I.days[ex[1]] : dn(jt.d1) };
      o.trade.pnl = (pxOut - jt.p1) * jt.lots * ctj - o.trade.fee; o.trade.r = pxOut / jt.p1 - 1;
      o.tone = 'act'; o.step = 3; o.how = 'exit';
      if (ex) {
        o.title = 'La règle est sortie le ' + longDay(I.days[ex[1]]) + ' à ' + px(pxOut);
        o.sub = 'Ferme ton trade dans MT5, puis note la sortie avec le prix obtenu.';
      } else {
        o.title = 'Trade ouvert hors règle';
        o.sub = 'Si c\'est un trade d\'entretien (contre l\'inactivité), ferme-le et note la sortie.';
      }
    } else if (!a.possible) {
      o.title = 'Ce soir : rien à faire';
      o.sub = a.P <= a.F ? 'Le ' + I.name + ' est sous sa moyenne des 200 derniers jours : la règle attend qu\'il remonte avant de chercher une entrée.'
        : 'Il faudrait une chute si forte qu\'il passerait sous sa moyenne des 200 derniers jours : la règle n\'entrera pas ce soir.';
    } else {
      o.tone = 'watch';
      o.title = 'Ce soir : entrer seulement si le ' + I.name + ' finit la journée sous ' + px(a.X);
      o.sub = 'Il doit baisser d\'au moins ' + nf((1 - a.X / lastClose) * 100, 1) + ' % par rapport à hier. Sinon, rien à faire.';
      if (live) o.check = live < a.X && live > a.F ? { cls: 'act', txt: 'À ce prix, il faut entrer ce soir', sub: 'Le prix (' + px(live) + ') est sous le niveau d\'entrée ' + px(a.X) + '.' }
        : { cls: 'ok', txt: 'À ce prix, pas d\'entrée ce soir', sub: 'Le prix (' + px(live) + ') est au-dessus du niveau d\'entrée ' + px(a.X) + '.' };
      o.how = 'entry';
    }
    return o;
  }

  function trackerHtml(o) {
    var lab = ['En attente', 'Trade en cours', o.step === 3 ? (o.trade && o.trade.hit ? 'Terminé' : 'Sortie ce soir') : 'Sortie'];
    return '<div class="tracker">' + lab.map(function (l, i) { return '<span class="' + (i + 1 === o.step ? 'on' : i + 1 < o.step ? 'done' : '') + '">' + (i + 1) + '. ' + l + '</span>'; }).join('') + '</div>';
  }
  function planHtml(o) {
    return '<div class="plan ' + o.tone + '"><div class="t">' + esc(o.title) + '</div><div class="s">' + esc(o.sub) + '</div></div>';
  }
  function howHtml(o) {
    var I = o.I;
    if (o.how === 'entry') {
      var lt = lotsFor(o.k, o.np ? o.np.p : o.a.X), stop = (o.np ? o.np.p : o.a.X) * (1 - stopFor(lt.lev));
      return '<div class="how"><b>Pour entrer</b> (seulement si la condition est remplie vers ' + hm(closeUTC(session) - 600000) + ') : dans MT5, ordre au marché sur <b>' + I.sym + '</b> → volume <b>' + nf(lt.lots, 2) + ' lots</b> (≈ ' + usd(lt.notional) + ') → <b>Buy</b>.' +
        (cfg.phase == 3 ? ' Puis ajoute un <b>stop à ' + px(stop) + '</b> (règle des 3 % de FundedNext).' : '') + '</div>';
    }
    if (o.how === 'exit') return '<div class="how"><b>Pour sortir</b> : dans MT5, onglet « Trade », clique sur la <b>croix ×</b> au bout de la ligne <b>' + I.sym + '</b>. Ne clique pas sur « Sell » : ça ouvrirait un deuxième trade à l\'envers.</div>';
    return '';
  }
  function inputHtml(o) {
    if (!(o.how || (o.a.mode === 'pos' && !(o.trade && o.trade.hit)))) return '';
    var k = o.k;
    return '<label class="field" style="margin-top:10px"><span>Prix ' + o.I.sym + ' dans MT5 vers ' + hm(closeUTC(session) - 600000) + '</span><input type="number" inputmode="decimal" step="any" data-manual="' + k + '" value="' +
      (manual[k] && manual[k].day === session ? manual[k].p : '') + '" placeholder="' + (o.np && o.np.auto ? px(o.np.p) : 'ex. ' + px(o.a.P)) + '"></label>' +
      (o.check ? '<div class="verdict ' + o.check.cls + '">' + esc(o.check.txt) + '<small>' + esc(o.check.sub) + (o.np ? ' Prix : ' + esc(o.np.src) + '.' : '') + '</small></div>' : '');
  }

  function renderBord() {
    var today = parisToday(), lastDay = Math.max(A.spx.last, A.ndx.last);
    session = nextTrading(lastDay);
    var cl = closeUTC(session), now = nowMs(), early = EARLY.indexOf(ds(session)) >= 0;
    $('today').textContent = longDay(today) + ' ' + new Date(today * DAY).getUTCFullYear();

    var P = ['spx', 'ndx'].map(plan), when = session === today ? 'Ce soir' : (session === today + 1 ? 'Demain soir' : cap(longDay(session))), todo = [], open = [], tot = 0;
    P.forEach(function (o) {
      if (o.trade) { open.push(o.I.name + ' ' + sUsd(o.trade.pnl)); tot += o.trade.pnl; }
      if (o.tone === 'watch' && o.a.mode === 'pos') todo.push('surveiller la sortie du ' + o.I.name);
      else if (o.tone === 'watch') todo.push('surveiller une entrée sur le ' + o.I.name);
      else if (o.tone === 'act' || o.tone === 'alert') todo.push(o.title.replace(/^Ce soir : /, '').toLowerCase() + ' (' + o.I.name + ')');
    });
    var big = when + ' : ' + (todo.length ? todo.join(', et ') : 'rien à faire');
    var sub = (open.length ? 'Trade en cours : ' + open.join(' · ') + '. ' : 'Aucun trade en cours. ') +
      (todo.length ? 'Décide vers ' + hm(cl - 600000) + ', juste avant la fin de journée à New York (' + hm(cl) + ').' : 'Aucun indice ne peut donner d\'entrée ' + (when === 'Ce soir' ? 'ce soir' : when.toLowerCase()) + '.');
    $('hero').innerHTML = '<h3>' + cap(longDay(session)) + ' · fin de journée à ' + hm(cl) + '</h3><div class="big">' + esc(big) + '</div><p>' + esc(sub) + '</p>' +
      '<div class="chips"><span class="chip">Compte ' + nf(cfg.size / 1000) + 'k · ' + (cfg.phase == 3 ? 'financé' : 'phase ' + cfg.phase) + '</span><span class="chip">' + (cfg.dose ? 'Taille dosée · S&P ' + levTxt(levNow('spx', (nowPrice('spx', session) || {}).p)) + ' · Nasdaq ' + levTxt(levNow('ndx', (nowPrice('ndx', session) || {}).p)) : nf(cfg.lev, 2) + ' × par indice') + '</span>' +
      (cfg.phase == 3 ? '<span class="chip">Stop : 1,5 % du compte par indice</span>' : '') + '</div>' +
      '<button class="btn" data-go="ordres">Voir quoi faire ce soir</button>';

    var left = cl - now, total = 6.5 * 3600000, done = Math.max(0, Math.min(1, 1 - left / total));
    var clockTxt = left > 0 ? (left > 36 * 3600000 ? longDay(session) : 'dans ' + Math.floor(left / 3600000) + ' h ' + String(Math.floor(left % 3600000 / 60000)).padStart(2, '0')) : 'c\'est passé';
    $('clock').className = 'card s4 clock';
    $('clock').innerHTML = '<h3>Fin de journée à New York</h3><div class="when">' + hm(cl) + '</div><div class="muted" style="margin:0">' + esc(clockTxt) +
      (early ? ' · la Bourse ferme plus tôt ce jour-là' : '') + '</div><div class="bar"><i style="width:' + (left > 0 && left < total ? done * 100 : 0) + '%"></i></div>' +
      '<div class="muted" style="margin:0">Moment de décider : <b>' + hm(cl - 600000) + ' – ' + hm(cl) + '</b> (heure de Paris).' +
      (left <= 0 && session === today ? ' Les niveaux de demain arrivent vers ' + hm(cl + 45 * 60000) + '.' : '') + '</div>';

    P.forEach(renderIdxCardFrom);
    renderMiniAcct(); renderAlerts(); renderMiniJournal();
  }

  function renderIdxCard(k) { renderIdxCardFrom(plan(k)); }
  function renderIdxCardFrom(o) {
    var k = o.k, a = o.a, I = o.I, n = I.c.length, tr = o.trade;
    var res = tr && !tr.hit ? '<div class="stats"><div><span>Entré le</span><b>' + shortDay(tr.d1) + '</b></div><div><span>Prix d\'entrée</span><b>' + px(tr.p1) + '</b></div>' +
      '<div><span>Résultat</span><b class="' + (tr.pnl >= 0 ? 'pos' : 'neg') + '">' + sUsd(tr.pnl) + '</b></div><div><span>Sortie au plus tard</span><b>' + shortDay(tr.deadline) + '</b></div></div>'
      : '<div class="stats"><div><span>Dernière clôture</span><b>' + px(a.P) + '</b></div><div><span>Moyenne 200 jours</span><b>' + px(a.sma200) + '</b></div>' +
        '<div><span>Écart à la moyenne</span><b>' + pct(a.P / a.sma200 - 1) + '</b></div><div><span>Trade en cours</span><b>aucun</b></div></div>';
    $('idx-' + k).innerHTML = '<div class="head"><div><div class="name">' + I.name + '</div><div class="sym">' + I.sym + ' dans MT5</div></div></div>' +
      trackerHtml(o) + decisionHtml(o) + res +
      '<div class="chart" id="ch-' + k + '"></div>';
    var from = Math.max(0, n - 130);
    lineChart($('ch-' + k), {
      x: I.days.slice(from), height: 160, label: I.name + ' sur 6 mois',
      series: [{ name: 'Prix du ' + I.name, v: I.c.slice(from), c: '--s1' }, { name: 'Moyenne des 200 derniers jours', v: a.st.sma200.slice(from), c: '--s2' }],
      refs: a.mode === 'pos' ? [{ v: a.Y, label: px(a.Y), cls: 'ref-sell', tail: true }] : (a.possible ? [{ v: a.X, label: px(a.X), cls: 'ref-buy', tail: true }] : []),
      fmt: function (v) { return nf(v, 0); }
    });
  }

  function renderMiniAcct() {
    var s = account(), prog, label;
    if (s.target) { prog = Math.max(0, Math.min(1, (s.bal - s.size) / (s.target - s.size))); label = 'Objectif ' + usd(s.target) + ' · reste ' + usd(Math.max(0, s.target - s.bal)); }
    else { prog = Math.max(0, Math.min(1, (s.bal - s.size) / (s.size * 0.05))); label = 'Gain disponible : ' + usd(Math.max(0, s.bal - s.size)) + (s.payout ? ' · paiement le ' + shortDay(s.payout) : ''); }
    var room = s.equity - s.maxFloor;
    $('mini-acct').innerHTML = '<h3>Mon compte</h3><div class="signal" style="margin-top:6px">' + usd(s.bal) + '<small>' + (cfg.phase == 3 ? 'Compte financé' : 'Phase ' + cfg.phase) +
      (s.est ? ' · solde estimé d\'après le journal' : '') + '</small></div><div class="bar"><i style="width:' + prog * 100 + '%"></i></div><div class="muted" style="margin:0">' + label + '</div>' +
      '<dl class="rows" style="margin-top:8px"><div><dt>Marge avant la perte max</dt><dd>' + usd(room) + '</dd></div><div><dt>Jours de trading (étape)</dt><dd>' + s.tradingDays + (cfg.phase < 3 ? ' / 5' : '') + '</dd></div></dl>';
  }

  function alertList() {
    var s = account(), out = [], today = parisToday();
    var stale = parisToday() > nextTrading(Math.max(A.spx.last, A.ndx.last)) && nowMs() > closeUTC(nextTrading(Math.max(A.spx.last, A.ndx.last))) + 3 * 3600000;
    if (stale) out.push(['crit', '!', '<b>Prix en retard.</b> Le dernier prix de fin de journée date du ' + shortDay(Math.max(A.spx.last, A.ndx.last)) + '. Rouvre l\'application plus tard.']);
    if (s.inactive >= 45) out.push([s.inactive >= 55 ? 'crit' : 'warn', '!', '<b>Inactivité : ' + s.inactive + ' jours sans trade.</b> Le compte est désactivé à 60 jours (' + shortDay(s.deadline) + '). Ouvre et ferme un tout petit trade.']);
    if (cfg.phase == 3) out.push(['', 'i', '<b>Stop obligatoire</b> sur chaque trade, placé pour risquer 1,5 % du compte par indice (risque total ≤ 3 %) : l’appli donne le prix du stop.']);
    if (s.payout !== null) out.push(['ok', '$', '<b>Prochain paiement possible le ' + shortDay(s.payout) + '</b> · environ ' + usd(Math.max(0, (s.bal - s.size) * 0.8)) + ' à ce jour (80 %).']);
    for (var d = today; d <= today + 10; d++) {
      if (HOLIDAYS.indexOf(ds(d)) >= 0 && new Date(d * DAY).getUTCDay() % 6) { out.push(['', 'i', '<b>Bourse de New York fermée le ' + longDay(d) + '.</b> Rien à faire ce jour-là.']); break; }
      if (EARLY.indexOf(ds(d)) >= 0) { out.push(['warn', '!', '<b>La Bourse ferme plus tôt le ' + longDay(d) + '</b> : fin de journée à ' + hm(closeUTC(d)) + ' (heure de Paris).']); break; }
    }
    if (s.target && s.bal >= s.target) out.push(['ok', 'check', '<b>Objectif de la phase atteint.</b> Vérifie les 5 jours de trading, puis passe à l\'étape suivante dans Compte.']);
    if (CTFIX && CTFIX.changed && Date.now() - CTFIX.at < 21 * DAY) out.unshift(['crit', '!', '<b>Lots corrigés.</b> Chez FundedNext, 1 lot d’indice = 10 fois l’indice : l’appli affiche maintenant 10 fois moins de lots qu’avant (environ 0,33 au lieu de 3,3). Vérifie dans MT5 : clic droit sur SPX500 → Spécification → Taille du contrat.']);
    if (!out.length) out.push(['ok', 'check', '<b>Rien à signaler.</b> Compte actif, prix à jour.']);
    return out;
  }
  function renderAlerts() {
    $('mini-alerts').innerHTML = '<h3>À surveiller</h3><ul class="alerts" style="margin-top:10px">' + alertList().map(function (a) {
      return '<li class="' + a[0] + '"><span class="ic">' + ico({ '!': 'alert', i: 'info', '$': 'cash' }[a[1]] || a[1]) + '</span><span>' + a[2] + '</span></li>';
    }).join('') + '</ul>';
  }
  function renderMiniJournal() {
    var closedT = trades.filter(function (t) { return t.d2 && t.kind !== 'entretien'; }), tot = 0, win = 0;
    closedT.forEach(function (t) { var p = pnlOf(t); tot += p; if (p > 0) win++; });
    var last = trades.slice().sort(function (a, b) { return (b.d2 || b.d1).localeCompare(a.d2 || a.d1); }).slice(0, 3);
    $('mini-journal').innerHTML = '<h3>Journal</h3><div class="signal" style="margin-top:6px">' + sUsd(tot) + '<small>' + closedT.length + ' trades terminés' +
      (closedT.length ? ' · ' + Math.round(win / closedT.length * 100) + ' % gagnants' : '') + '</small></div>' +
      (last.length ? '<dl class="rows">' + last.map(function (t) { var p = pnlOf(t); return '<div><dt>' + IDX[t.idx].name + ' · ' + shortDay(dn(t.d1)) + (t.d2 ? '' : ' (en cours)') + '</dt><dd class="' + (p >= 0 ? 'pos' : 'neg') + '">' + sUsd(p) + '</dd></div>'; }).join('') + '</dl>'
        : '<p class="empty">Aucun trade noté. Note tes trades démo dans le Journal.</p>') +
      '<button class="btn ghost small" data-go="journal">Ouvrir le journal</button>';
  }

  /* ---------- onglet Ordres : 3 listes (en attente, en cours, termines) et une fiche detaillee ---------- */
  var otab = store.get('otab', 'cours') === 'termines' ? 'termines' : 'cours', sheetId = null;
  var BUY = '<span class="side buy">BUY</span>';

  /* jauge : ou est le prix par rapport aux niveaux (entree, sortie, stop) */
  function thermo(marks, cur, zone, curLabel) {
    var vs = marks.map(function (m) { return m.v; }).concat([cur]), lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs), pad = (hi - lo) * 0.18 || cur * 0.01;
    lo -= pad; hi += pad;
    var X = function (v) { return Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100)).toFixed(2) + '%'; };
    var z = zone ? '<i class="zn ' + zone.cls + '" style="' + (zone.side === 'right' ? 'left:' + X(zone.v) + ';right:0' : 'left:0;width:' + X(zone.v)) + '"></i>' : '';
    return '<div class="thermo"><div class="tc"><span class="now" style="left:' + X(cur) + '">' + (curLabel || 'maintenant') + '<br><b>' + px(cur) + '</b></span></div>' +
      '<div class="tt">' + z + marks.map(function (m) { return '<i class="tk ' + m.cls + '" style="left:' + X(m.v) + '"></i>'; }).join('') + '<b class="dot" style="left:' + X(cur) + '"></b></div>' +
      '<div class="tl">' + marks.map(function (m) { return '<span class="' + m.cls + '" style="left:' + X(m.v) + '">' + m.label + '<br><b>' + px(m.v) + '</b></span>'; }).join('') + '</div>' +
      (zone ? '<div class="tz ' + zone.cls + '">' + zone.label + '</div>' : '') + '</div>';
  }
  var tile = function (l, v, cls) { return '<div><span>' + l + '</span><b class="' + (cls || '') + '">' + v + '</b></div>'; };
  var chip = function (txt, cls) { return '<span class="chipx ' + cls + '">' + txt + '</span>'; };


  /* ---------- decision : une echelle de prix ou chaque zone est une action ---------- */
  var VERBS = { SORTIR: ['exit', 'Sortir', 'act'], GARDER: ['hold', 'Garder', 'ok'], STOP: ['stop', 'Stop touché', 'act'], ENTRER: ['enter', 'Entrer', 'watch'], ATTENDRE: ['wait', 'Attendre', 'idle'], INTERDIT: ['stop', 'Attendre', 'idle'] };
  function zonesFor(o) {
    var a = o.a, tr = o.trade, Z = [], INF = Infinity;
    if (tr && tr.hit) return { zones: [{ v: 'STOP', c: 'z-no', cond: 'le stop a fermé le trade le ' + shortDay(tr.hit), lo: -INF, hi: INF }], fixed: true };
    if (tr && tr.orphan) return { zones: [{ v: 'SORTIR', c: 'z-out', cond: tr.exitDay ? 'la règle est sortie le ' + shortDay(tr.exitDay) + ' à ' + px(tr.cur) : 'trade hors règle', lo: -INF, hi: INF }], fixed: true };
    if (tr) {
      if (a.forced) return { zones: [{ v: 'SORTIR', c: 'z-out', cond: 'dernier jour : sortir à 22 h, quel que soit le prix', lo: -INF, hi: INF }], fixed: true };
      Z.push({ v: 'SORTIR', c: 'z-out', cond: 'si le prix de 22 h finit au-dessus', lo: a.Y, hi: INF });
      Z.push({ v: 'GARDER', c: 'z-hold', cond: 's\'il finit en dessous', lo: tr.stop || -INF, hi: a.Y });
      if (tr.stop) Z.push({ v: 'STOP', c: 'z-no', cond: 'MT5 ferme le trade tout seul', lo: -INF, hi: tr.stop });
    } else if (a.possible) {
      Z.push({ v: 'ATTENDRE', c: 'z-hold', cond: 'si le prix de 22 h finit au-dessus', lo: a.X, hi: INF });
      Z.push({ v: 'ENTRER', c: 'z-in', cond: 's\'il finit en dessous', lo: a.F, hi: a.X });
      Z.push({ v: 'INTERDIT', c: 'z-no', cond: 'trop bas : sous la moyenne des 200 jours', lo: -INF, hi: a.F });
    } else {
      return { zones: [{ v: 'ATTENDRE', c: 'z-hold', cond: a.P <= a.F ? 'le prix est sous sa moyenne des 200 jours : la règle n\'entre pas' : 'il faudrait une baisse trop forte : pas d\'entrée ce soir', lo: -INF, hi: INF }], fixed: true };
    }
    return { zones: Z };
  }
  function ladder(o) {
    var cur = o.np ? o.np.p : (o.trade ? o.trade.cur : o.a.P), src = o.np ? (o.np.live ? (o.np.delayed ? 'il y a ~15 min' : 'en direct') : 'maintenant') : 'clôture ' + shortDay(o.a.last), zz = zonesFor(o), Z = zz.zones, on = 0;
    Z.forEach(function (z, i) { if (cur >= z.lo && cur < z.hi) on = i; });
    var html = '<div class="ladder">' + Z.map(function (z, i) {
      return (i > 0 ? '<div class="lb"><span>' + px(Z[i - 1].lo) + '</span></div>' : '') +
        '<div class="lz ' + z.c + (i === on ? ' on' : '') + '"><b class="verb">' + VERBS[z.v][1].toUpperCase() + '</b><span class="cond">' + esc(z.cond) + '</span>' +
        (i === on && !zz.fixed ? '<span class="here"><i class="hd"></i>' + src + '<br><b>' + px(cur) + '</b></span>' : '') + '</div>';
    }).join('') + '</div>';
    return { verb: Z[on].v, fixed: !!zz.fixed, html: html };
  }
  function verbChip(o) { var v = VERBS[ladder(o).verb]; return chip(v[1], v[2]); }
  function decisionHtml(o) {
    var L = ladder(o), V = VERBS[L.verb], cl = closeUTC(session), now = nowMs(), dec = cl - 600000, today = session === parisToday();
    var when = !today ? 'Décision ' + longDay(session) + ' à ' + hm(dec) : now < dec ? 'Décision ce soir à ' + hm(dec) + ' · peut encore changer d\'ici là' : now < cl ? 'C\'est le moment : décide avant ' + hm(cl) : 'Journée terminée';
    if (L.fixed && L.verb !== 'SORTIR') when = today ? 'Ce soir' : cap(longDay(session));
    if (o.trade && o.trade.orphan) when = 'À faire dès que possible, puis noter la sortie';
    return '<div class="decision ' + V[2] + '"><span class="dv">' + ico(V[0]) + ' ' + V[1].toUpperCase() + '</span><small>' + esc(when) + '</small></div>' + L.html;
  }


  /* ---------- conditions d'entree : ce qu'on attend et ou on en est ---------- */
  function rsiAt(a, p) { var dd = p - a.P, au = (a.st.au + Math.max(dd, 0)) / 2, ad = (a.st.ad + Math.max(-dd, 0)) / 2; return ad === 0 ? 100 : 100 - 100 / (1 + au / ad); }
  function twoDayDrop(a) {                       // baisse identique sur 2 jours qui ferait passer le RSI 2 jours sous 10
    var ok = function (x) { var p1 = a.P * (1 - x), p2 = p1 * (1 - x), au2 = a.st.au / 4, ad1 = (a.st.ad + a.P - p1) / 2, ad2 = (ad1 + p1 - p2) / 2; return ad2 > 9 * au2; };
    if (!ok(0.3)) return null;
    var lo = 0, hi = 0.3; for (var i = 0; i < 40; i++) { var m = (lo + hi) / 2; if (ok(m)) hi = m; else lo = m; }
    return hi;
  }
  function conds(o) {
    var a = o.a, I = o.I, cur = o.np ? o.np.p : a.P, live = !!o.np, rsi = live ? rsiAt(a, cur) : a.rsi;
    var ent = a.st.trades.map(function (t) { return t[0]; }), d5 = I.days[I.days.length - 1] - 5 * 365;
    var recent = ent.filter(function (i) { return I.days[i] >= d5; }), gaps = [];
    for (var q = 1; q < recent.length; q++) gaps.push(recent[q] - recent[q - 1]);
    var d2 = twoDayDrop(a), p2 = d2 !== null ? a.P * (1 - d2) * (1 - d2) : null;
    return { cur: cur, live: live, src: live ? o.np.src : 'clôture du ' + shortDay(a.last), c1: cur > a.F, c2: rsi < 10, rsi: rsi, F: a.F, X: a.X,
      lastEntry: ent.length ? I.days[ent[ent.length - 1]] : null, gap: gaps.length ? Math.round(gaps.reduce(function (x, y) { return x + y; }, 0) / gaps.length) : null,
      d2: d2, p2: p2, p2ok: p2 !== null && p2 > a.F };
  }
  function rsiGauge(rsi) {
    var x = Math.max(0, Math.min(100, rsi));
    return '<div class="rg"><div class="rg-top"><span class="rg-10">seuil 10</span>' + (Math.abs(x - 10) > 14 ? '<span class="rg-v" style="left:' + x + '%">' + nf(rsi, 0) + '</span>' : '') + '</div><div class="rg-t"><i class="rg-z"></i><i class="rg-m"></i><b class="dot" style="left:' + x + '%"></b></div>' +
      '<div class="rg-l"><span>← forte baisse</span><span>forte hausse →</span></div></div>';
  }

  /* trades termines : ceux du journal, puis ceux de la regle sur 12 mois */
  function doneList() {
    var out = [];
    trades.filter(function (t) { return t.d2; }).forEach(function (t) {
      out.push({ id: 'j:' + t.id, k: t.idx, e: dn(t.d1), x: dn(t.d2), pe: t.p1, px: t.p2, g: t.p2 / t.p1 - 1, usd: pnlOf(t), src: 'journal', lots: t.lots });
    });
    var last = IDX.spx.days[IDX.spx.days.length - 1];
    legs(null).filter(function (t) { return !t.open && t.x >= last - 365; }).forEach(function (t) {
      out.push({ id: 'r:' + t.k + ':' + t.e, k: t.k, e: t.e, x: t.x, pe: t.pe, px: t.px, g: t.gross, usd: cfg.size * t.lev * t.net, src: 'regle', lev: t.lev });
    });
    return out.sort(function (a, b) { return b.x - a.x || b.e - a.e; });
  }

  /* ---------- onglet Ce soir : l'ecran du verdict ----------
     Avant 21 h 30 : compte a rebours et ce qui peut arriver ce soir. De 21 h 30 a 22 h : un verdict par indice, avec l'ordre exact.
     Apres la cloture officielle (vers 22 h 16) : le verdict officiel et ce qu'il reste a faire avant 23 h. */
  var VD = { ENTRER: ['enter', 'Entrer', 'go'], SORTIR: ['exit', 'Sortir', 'out'], GARDER: ['hold', 'Garder', 'hold'], RIEN: ['none', 'Rien à faire', 'none'], STOP: ['stop', 'Stop touché', 'out'] };
  function dailyVol(k) {                                             // ecart-type des variations quotidiennes sur 20 jours (au moins 0,7 %)
    var c = IDX[k].c, n = c.length, s = 0, s2 = 0, m = Math.min(20, n - 1);
    for (var i = n - m; i < n; i++) { var r = Math.log(c[i] / c[i - 1]); s += r; s2 += r * r; }
    return Math.max(Math.sqrt(Math.max(s2 / m - s * s / (m * m), 0)), 0.007);
  }
  function dur(ms) { var mn = Math.max(1, Math.ceil(ms / 60000)); if (mn < 60) return mn + ' min'; var h = Math.floor(mn / 60); return h >= 36 ? Math.round(h / 24) + ' jours' : h + ' h ' + String(mn % 60).padStart(2, '0'); }
  /* ou en est-on dans la soiree : loin (autre jour), avant, verdict (21 h 30 - 22 h), cloture (22 h - officiel), officiel, retard */
  function moment() {
    var t = nowMs(), today = parisToday(), last = Math.max(A.spx.last, A.ndx.last), day = session;
    var m = { now: t, today: today };
    if (last === today && t >= closeUTC(last)) { m.ph = 'officiel'; day = last; }
    else if (session < today) m.ph = 'retard';
    else if (session > today) m.ph = 'loin';
    m.day = day; m.cl = closeUTC(day); m.open = m.cl - 1800000; m.dec = m.cl - 600000; m.off = m.cl + 16 * 60000; m.lim = m.cl + 3600000;
    if (!m.ph) m.ph = t < m.open ? 'avant' : t < m.cl ? 'verdict' : 'cloture';
    return m;
  }
  /* verdict d'un indice au prix du moment, avec la marge par rapport au niveau le plus proche */
  function verdictOf(o, m) {
    var a = o.a, L = ladder(o), verb = L.verb === 'ATTENDRE' || L.verb === 'INTERDIT' ? 'RIEN' : L.verb;
    var v = { o: o, k: o.k, verb: verb, fixed: L.fixed, cur: o.np ? o.np.p : null };
    if (L.fixed) return v;
    var cur = v.cur !== null ? v.cur : a.P, near = null;
    zonesFor(o).zones.forEach(function (z) { if (isFinite(z.lo) && (near === null || Math.abs(z.lo - cur) < Math.abs(near - cur))) near = z.lo; });
    v.level = o.trade ? a.Y : a.X; v.need = v.level / cur - 1; v.near = near; v.gap = near ? Math.abs(cur / near - 1) : 1;
    if (v.cur !== null) {                                            // incertitude : minutes de cours encore inconnues jusqu'a la cloture (retard des prix compris) ; 1,65 ecart-type = 95 % de chances de ne pas franchir le niveau
      var unk = Math.max(0, (m.cl - (o.np.t || m.now)) / 60000);
      v.thr = Math.max(0.001, 1.65 * dailyVol(o.k) * Math.sqrt(unk / 390)); v.tight = v.gap < v.thr;
    }
    return v;
  }
  /* ce que la regle a fait a la cloture officielle de ce soir */
  function officialOf(k) {
    var I = IDX[k], n = I.c.length, st = A[k].st, P = I.c[n - 1], prev = analyze(k, n - 1), lt = st.trades[st.trades.length - 1];
    var r = { k: k, I: I, P: P, ch: P / I.c[n - 2] - 1, jt: trades.filter(function (t) { return t.idx === k && !t.d2; })[0] || null };
    if (st.open === n - 1) { r.verb = 'ENTRER'; r.level = prev.X; }
    else if (st.open === null && lt && lt[1] === n - 1) { r.verb = 'SORTIR'; r.level = prev.Y; r.forced = lt[1] - lt[0] >= 10; r.g = P / I.c[lt[0]] - 1; }
    else if (st.open !== null) { r.verb = 'GARDER'; r.level = prev.Y; }
    else { r.verb = 'RIEN'; r.level = prev.mode === 'flat' && prev.possible ? prev.X : null; }
    return r;
  }
  function orderLine(verb, k, p) {
    var sym = IDX[k] ? IDX[k].sym : '';
    if (verb === 'ENTRER') { var lt = lotsFor(k, p); return '<span class="side buy">BUY</span><span><b>' + nf(lt.lots, 2) + ' lots</b> · ' + sym + (cfg.phase == 3 ? ' · stop <b>' + px(p * (1 - stopFor(lt.lev))) + '</b>' : '') + '<small> · taille ' + levTxt(lt.lev) + '</small></span>'; }
    if (verb === 'SORTIR') return '<span class="side out">' + ico('cross') + '</span><span>Croix <b>×</b> sur la ligne ' + sym + ' <small>(pas « Sell »)</small></span>';
    if (verb === 'STOP') return '<span>MT5 a fermé le trade : note la sortie au journal</span>';
    if (verb === 'GARDER') return '<span>Ne touche à rien</span>';
    return '<span>Rien à faire</span>';
  }
  var vdBox = function (verb, sub, cls) { var V = VD[verb]; return '<div class="vd ' + (cls || V[2]) + '"><span>' + ico(V[0]) + V[1].toUpperCase() + '</span>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>'; };
  var vHead = function (I, p, ch, src) {
    return '<div class="vc-h"><div><b>' + I.name + '</b><small>' + I.sym + ' dans MT5</small></div><div class="vc-p"><b>' + px(p) + '</b><small>' +
      (ch !== null ? '<span class="' + (ch >= 0 ? 'pos' : 'neg') + '">' + pct(ch) + '</span> · ' : '') + esc(src) + '</small></div></div>';
  };
  var vMore = function (o) { return '<button class="vc-more" data-sheet="' + (o.trade ? 'cours:' : 'att:') + o.k + '">Détails ›</button>'; };
  var vTrade = function (o) {
    var tr = o.trade; if (!tr || tr.hit || tr.orphan) return '';
    return '<div class="vtrade">Trade en cours · <b class="' + (tr.pnl >= 0 ? 'pos' : 'neg') + '">' + sUsd(tr.pnl) + '</b> · jour ' + o.a.held + ' sur 10</div>';
  };
  var vInput = function (o) {
    var k = o.k, mv = manual[k] && manual[k].day === session ? manual[k].p : '';
    return '<label class="field vin"><span>Prix ' + o.I.sym + ' dans MT5</span><input type="number" inputmode="decimal" step="any" data-manual="' + k + '" value="' + mv + '" placeholder="' + px(o.np ? o.np.p : o.a.P) + '"></label>';
  };
  /* frise de la soiree : agir, cloture, officiel, limite */
  function stepper(m) {
    var pts = [[m.dec, 'Agir'], [m.cl, 'Clôture'], [m.off, 'Officiel'], [m.lim, 'Limite']], cur = -1, fill = 0;
    pts.forEach(function (p, i) { if (m.now >= p[0]) cur = i; });
    if (m.ph === 'officiel' && cur < 2) cur = 2;
    if (cur >= 0) fill = cur >= 3 ? 1 : (cur + Math.min(1, Math.max(0, (m.now - pts[cur][0]) / (pts[cur + 1][0] - pts[cur][0])))) / 3;
    return '<div class="tl"><i class="tl-track"></i><i class="tl-fill" style="width:' + (fill * 100).toFixed(1) + '%"></i>' + pts.map(function (p, i) {
      return '<span class="tl-pt' + (i < cur ? ' past' : i === cur ? ' cur' : '') + '" style="left:' + (i / 3 * 100) + '%"><i></i>' + hm(p[0]) + '<b>' + p[1] + '</b></span>';
    }).join('') + '</div>';
  }

  /* carte d'un indice avant l'heure : ce qui peut arriver ce soir et ou en est le prix */
  function cardAvant(v, m) {
    var o = v.o, a = o.a, cur = v.cur !== null ? v.cur : a.P, html = vHead(o.I, cur, v.cur !== null ? cur / a.P - 1 : null, v.cur !== null ? o.np.src : 'clôture du ' + shortDay(a.last));
    if (v.fixed) {
      html += vdBox(v.verb, esc(cap(zonesFor(o).zones[0].cond).replace('ce soir', m.ph === 'loin' ? longDay(session) : 'ce soir'))) + (v.verb === 'SORTIR' ? '<div class="vorder">' + orderLine('SORTIR', o.k, cur) + '<em>à ' + hm(m.dec) + '</em></div>' : '');
    } else {
      var reached = o.trade ? cur > v.level : cur < v.level, prog = reached ? 1 : Math.max(0, Math.min(1, (cur - a.P) / (v.level - a.P))) || 0;
      html += '<div class="vgoal"><div class="vg-t"><span>' + (o.trade ? 'Niveau de sortie' : 'Niveau d\'entrée') + '</span><b>' + px(v.level) + '</b><em class="' + (reached ? 'pos' : '') + '">' +
        (reached ? 'atteint' : 'encore ' + pct(v.need)) + '</em></div><div class="vg-bar ' + (o.trade ? 'out' : 'go') + '"><i style="width:' + (prog * 100).toFixed(1) + '%"></i></div>' +
        '<small>Pour l\'instant : <b>' + VD[v.verb][1].toLowerCase() + '</b> · verdict à ' + hm(m.dec) + '</small></div>';
    }
    return '<article class="card s6 vc">' + html + vTrade(o) + vMore(o) + '</article>';
  }
  /* carte d'un indice a l'heure du verdict */
  function cardVerdict(v, m) {
    var o = v.o, a = o.a, cur = v.cur, html;
    if (v.fixed) {
      html = vHead(o.I, cur !== null ? cur : a.P, cur !== null ? cur / a.P - 1 : null, cur !== null ? o.np.src : 'clôture du ' + shortDay(a.last)) +
        vdBox(v.verb, esc(cap(zonesFor(o).zones[0].cond))) + (v.verb === 'SORTIR' ? '<div class="vorder">' + orderLine('SORTIR', o.k, cur || a.P) + '</div>' : '');
    } else if (cur === null) {
      html = vHead(o.I, a.P, null, 'clôture du ' + shortDay(a.last)) + '<div class="vd tight"><span>' + ico('tight') + 'PRIX MANQUANT</span><small>Le prix du moment n\'arrive pas : tape celui de MT5.</small></div>' + vInput(o);
    } else if (v.tight) {
      html = vHead(o.I, cur, cur / a.P - 1, o.np.src) +
        '<div class="vd tight"><span>' + ico('tight') + 'TROP SERRÉ</span><small>À ' + nf(v.gap * 100, 2) + ' % du niveau ' + px(v.near) + ' · penche vers « ' + VD[v.verb][1].toLowerCase() + ' »</small></div>' + vInput(o) +
        '<p class="vnote">Ou attends le verdict officiel à ' + hm(m.off) + ' : tu as jusqu\'à ' + hm(m.lim) + ' pour agir.</p>';
    } else {
      var jt = trades.filter(function (t) { return t.idx === o.k && !t.d2; })[0];
      html = vHead(o.I, cur, cur / a.P - 1, o.np.src) + vdBox(v.verb, 'À ' + nf(v.gap * 100, 1) + ' % du niveau ' + px(v.near) + ' · sûr') +
        '<div class="vorder">' + orderLine(v.verb, o.k, cur) + '</div>' + (manual[o.k] && manual[o.k].day === session ? vInput(o) : '') +
        (v.verb === 'ENTRER' ? '<button class="btn ghost small" data-jnote="' + o.k + '|' + cur + '|' + ds(session) + '">J\'ai acheté : noter au journal</button>' : '') +
        (v.verb === 'SORTIR' && jt ? '<button class="btn ghost small" data-closej="' + jt.id + '">J\'ai fermé : noter au journal</button>' : '');
    }
    return '<article class="card s6 vc">' + html + vTrade(o) + vMore(o) + '</article>';
  }
  /* carte d'un indice apres la cloture officielle */
  function cardOfficiel(r, m) {
    var html = vHead(r.I, r.P, r.ch, 'clôture officielle'), late = m.now > m.lim, todo = late ? '' : '<em>avant ' + hm(m.lim) + '</em>', sub;
    if (r.verb === 'ENTRER') {
      var done = r.jt && dn(r.jt.d1) >= m.day;
      html += vdBox('ENTRER', 'Clôture sous le niveau ' + px(r.level)) + (done ? '<div class="vdone">' + ico('check') + ' Entrée notée au journal</div>'
        : '<div class="vorder">' + orderLine('ENTRER', r.k, r.P) + todo + '</div><button class="btn ghost small" data-jnote="' + r.k + '|' + r.P + '|' + ds(m.day) + '">J\'ai acheté : noter au journal</button>');
    } else if (r.verb === 'SORTIR') {
      sub = (r.forced ? 'Dernier jour du trade' : 'Clôture au-dessus du niveau ' + px(r.level)) + ' · ' + pct(r.g) + ' sur l\'indice';
      html += vdBox('SORTIR', sub) + (r.jt ? '<div class="vorder">' + orderLine('SORTIR', r.k, r.P) + todo + '</div><button class="btn ghost small" data-closej="' + r.jt.id + '">J\'ai fermé : noter au journal</button>'
        : '<div class="vorder">' + orderLine('SORTIR', r.k, r.P) + todo + '</div>');
    } else if (r.verb === 'GARDER') {
      html += vdBox('GARDER', 'Clôture sous le niveau de sortie ' + px(r.level)) + '<div class="vorder">' + orderLine('GARDER', r.k) + '</div>';
    } else if (r.jt) {
      html += vdBox('SORTIR', 'Ton trade ' + r.I.sym + ' n\'est pas dans la règle ce soir') + '<div class="vorder">' + orderLine('SORTIR', r.k, r.P) + todo + '</div>' +
        '<button class="btn ghost small" data-closej="' + r.jt.id + '">J\'ai fermé : noter au journal</button>';
    } else {
      html += vdBox('RIEN', r.level ? 'Clôture au-dessus du niveau d\'entrée ' + px(r.level) : 'Pas d\'entrée possible ce soir');
    }
    return '<article class="card s6 vc">' + html + '<button class="vc-more" data-sheet="' + (A[r.k].mode === 'pos' ? 'cours:' : 'att:') + r.k + '">Détails ›</button></article>';
  }

  function renderOrdres() {
    if (!A.spx) return;
    var m = moment(), ph, big, sub, cards, steps = m.ph !== 'loin' && m.ph !== 'retard';
    if (m.ph === 'officiel') {
      var R = ['spx', 'ndx'].map(officialOf), todo = R.filter(function (r) { return r.verb === 'ENTRER' && !(r.jt && dn(r.jt.d1) >= m.day) || r.verb === 'SORTIR' || (r.verb === 'RIEN' && r.jt); });
      var nx = nextTrading(m.day), nxTxt = (nx === m.today + 1 ? 'demain' : longDay(nx)) + ' à ' + hm(closeUTC(nx) - 600000);
      ph = ['done', 'Officiel']; big = 'Verdict officiel';
      var pend = R.filter(function (r) { return r.jt && (r.verb === 'SORTIR' || r.verb === 'RIEN'); });
      sub = todo.length && m.now <= m.lim ? 'À faire avant ' + hm(m.lim) + ' : ' + todo.map(function (r) { return (r.verb === 'ENTRER' ? 'entrer sur le ' : 'sortir du ') + r.I.name; }).join(' et ') + '.'
        : (pend.length ? 'Ferme ton trade ' + pend.map(function (r) { return r.I.sym; }).join(' et ') + ' dès que possible. ' : todo.length ? '' : 'Rien à faire ce soir. ') + 'Prochain verdict ' + nxTxt + '.';
      cards = R.map(function (r) { return cardOfficiel(r, m); });
    } else {
      var V = ['spx', 'ndx'].map(function (k) { return verdictOf(plan(k), m); });
      var when = m.ph === 'loin' ? longDay(session) : 'ce soir', acts = V.filter(function (v) { return v.fixed && v.verb !== 'RIEN'; }), open = V.filter(function (v) { return !v.fixed; });
      var names = function (L) { return L.map(function (v) { return v.o.I.name; }).join(' et '); };
      if (m.ph === 'verdict' || m.ph === 'cloture') {
        var early = m.ph === 'verdict' && m.now < m.dec;
        ph = ['live', m.ph === 'verdict' ? 'En direct' : 'Bourse fermée'];
        big = m.ph === 'cloture' ? 'Officiel à ' + hm(m.off) : early ? 'Agis à ' + hm(m.dec) : 'Agis maintenant';
        sub = m.ph === 'cloture' ? 'Le verdict ci-dessous se confirme dans ' + dur(m.off - m.now) + '. Tu peux agir dans MT5 jusqu\'à ' + hm(m.lim) + '.'
          : early ? 'Verdict provisoire, il se précise jusqu\'à ' + hm(m.dec) + ' (dans ' + dur(m.dec - m.now) + ').' : 'Avant ' + hm(m.cl) + ', fin de journée à New York.';
        cards = V.map(function (v) { return cardVerdict(v, m); });
      } else {
        ph = m.ph === 'retard' ? ['', 'Mise à jour'] : m.ph === 'loin' ? ['', 'Bourse fermée'] : ['', 'Ce soir'];
        big = m.ph === 'retard' ? 'Données en retard' : 'Verdict dans ' + dur(m.dec - m.now);
        sub = m.ph === 'retard' ? 'Il manque la clôture du ' + longDay(session) + ' : pas de verdict sans elle. Rouvre l\'appli dans quelques minutes ; si ça dure, la mise à jour automatique est en panne.'
          : acts.length ? 'À faire ' + when + ' à ' + hm(m.dec) + ' : ' + acts.map(function (v) { return v.verb === 'STOP' ? 'noter la sortie du ' + v.o.I.name : 'sortir du ' + v.o.I.name; }).join(' et ') + '.'
          : !open.length ? 'Rien ne peut se passer ' + when + ' : pas besoin de revenir.'
          : 'À surveiller ' + when + ' : ' + names(open) + '. Reviens à ' + hm(m.dec) + '.';
        cards = V.map(function (v) { return cardAvant(v, m); });
      }
    }
    $('o-head').innerHTML = '<div class="vh-top"><span class="vh-day">' + cap(longDay(m.ph === 'officiel' ? m.day : session)) + '</span><span class="vh-ph ' + ph[0] + '">' + ph[1] + '</span></div>' +
      '<div class="vh-big">' + esc(big) + '</div><div class="vh-sub">' + esc(sub) + '</div>' + (steps ? stepper(m) : '');
    $('o-list').innerHTML = cards.join('');
    $('o-when').textContent = hm(m.dec);
    if (sheetId) openSheet(sheetId, true);
  }

  /* liste des trades (onglet Journal) : en cours et termines */
  function renderTrades() {
    var P = ['spx', 'ndx'].map(plan), cours = P.filter(function (o) { return o.trade && !o.trade.hit; }), done = doneList(), rows = '';
    var tabs = [['cours', 'En cours', cours.length], ['termines', 'Terminés', done.length]];
    $('t-seg').innerHTML = tabs.map(function (t) { return '<button role="tab" data-otab="' + t[0] + '" aria-selected="' + (otab === t[0]) + '">' + t[1] + ' <em>' + t[2] + '</em></button>'; }).join('');
    if (otab === 'cours') {
      rows = cours.map(function (o) {
        var tr = o.trade, last = o.I.days[o.I.days.length - 1], day = jours(last - tr.d1), st = verbChip(o);
        var prog = Math.max(0, Math.min(1, (last - tr.d1) / Math.max(1, tr.deadline - tr.d1)));
        return '<button class="row" data-sheet="cours:' + o.k + '">' + BUY + '<span class="rm"><b>' + o.I.name + '</b><small>' + day + ' · max ' + shortDay(tr.deadline) + '</small><i class="mini"><i style="width:' + prog * 100 + '%"></i></i></span>' +
          '<span class="rr"><b class="' + (tr.pnl >= 0 ? 'pos' : 'neg') + '">' + sUsd(tr.pnl) + '</b>' + st + '</span><span class="chev">›</span></button>';
      }).join('') || '<p class="empty">Aucun trade en cours.</p>';
    } else {
      rows = done.slice(0, 40).map(function (t) {
        return '<button class="row" data-sheet="done:' + t.id + '">' + BUY + '<span class="rm"><b>' + IDX[t.k].name + '</b><small>' + shortDay(t.e) + ' → ' + shortDay(t.x) + ' · ' + jours(t.x - t.e) + '</small></span>' +
          '<span class="rr"><b class="' + (t.usd >= 0 ? 'pos' : 'neg') + '">' + sUsd(t.usd) + '</b>' + chip(t.src === 'journal' ? 'Mon trade' : 'Règle', t.src === 'journal' ? 'ok' : 'idle') + '</span><span class="chev">›</span></button>';
      }).join('') || '<p class="empty">Aucun trade terminé.</p>';
      if (done.length) rows = '<p class="muted" style="margin:0 2px 8px">« Règle » : trades calculés par la règle sur 12 mois, sur ton compte de ' + usd(cfg.size) + '. « Mon trade » : ceux notés dans ton journal.</p>' + rows;
    }
    $('t-list').innerHTML = rows;
  }

  /* fiche detaillee */
  function inputBox(o) {
    return '<label class="field"><span>Prix ' + o.I.sym + ' dans MT5</span><input type="number" inputmode="decimal" step="any" data-manual="' + o.k + '" value="' +
      (manual[o.k] && manual[o.k].day === session ? manual[o.k].p : '') + '" placeholder="' + (o.np && o.np.auto ? px(o.np.p) : px(o.a.P)) + '"></label>';
  }
  function openSheet(id, refresh) {
    var parts = id.split(':'), type = parts[0], html = '', chart = null, k, o;
    if (type === 'att') {
      o = plan(parts[1]); var a = o.a, C = conds(o), ok = o.tone === 'watch', nOk = (C.c1 ? 1 : 0) + (C.c2 ? 1 : 0), go = C.c1 && C.c2 && C.cur < a.X;
      var lt = lotsFor(o.k, ok ? (o.np ? o.np.p : a.X) : a.P), stop = (o.np ? o.np.p : a.X) * (1 - stopFor(lt.lev));
      var head = go ? ['watch', ico('enter') + ' ENTRER ce soir', 'Les deux conditions sont réunies : achète vers ' + hm(closeUTC(session) - 600000) + ' si ça tient jusqu\'à la fin de journée.']
        : !C.c1 ? ['idle', ico('wait') + ' EN ATTENTE', 'On attend que le ' + o.I.name + ' repasse au-dessus de sa moyenne des 200 jours, puis une forte baisse sur 2 jours.']
        : ['idle', ico('wait') + ' EN ATTENTE', 'La tendance est bonne. On attend maintenant une forte baisse sur 2 jours.'];
      html = '<div class="sh-head">' + (go ? BUY : '<span class="side none">—</span>') + '<div><h2>' + o.I.name + ' · ' + px(C.cur) + '</h2><small>' + o.I.sym + ' · prix ' + esc(C.src) + '</small></div></div>' +
        '<div class="decision ' + head[0] + '"><span class="dv">' + head[1] + '</span><small>' + esc(head[2]) + '</small></div>' +
        '<div class="cond-head"><b>Les 2 conditions pour entrer</b><span class="chipx ' + (nOk === 2 ? 'ok' : nOk === 1 ? 'watch' : 'idle') + '">' + nOk + ' / 2 remplie' + (nOk > 1 ? 's' : '') + '</span></div>' +
        /* condition 1 : tendance */
        '<div class="cond ' + (C.c1 ? 'yes' : 'no') + '"><div class="cond-t"><span class="ck">' + ico(C.c1 ? 'check' : 'cross') + '</span><div><b>1. Tendance haussière</b><small>le prix doit être au-dessus de sa moyenne des 200 derniers jours</small></div></div>' +
        thermo([{ v: C.F, label: 'moyenne 200 j', cls: 'k-in' }], C.cur, { side: 'right', v: C.F, cls: 'z-in', label: 'zone de tendance haussière →' }, C.live ? 'maintenant' : 'clôture') +
        '<p class="cond-s">' + (C.c1 ? 'Remplie : ' + pct(C.cur / C.F - 1) + ' au-dessus de la moyenne.' : 'Pas remplie : il faut remonter de <b>' + pct(C.F / C.cur - 1) + '</b> pour repasser au-dessus de ' + px(C.F) + '.') + '</p></div>' +
        /* condition 2 : forte baisse */
        '<div class="cond ' + (C.c2 ? 'yes' : 'no') + '"><div class="cond-t"><span class="ck">' + ico(C.c2 ? 'check' : 'cross') + '</span><div><b>2. Forte baisse sur 2 jours</b><small>l\'indicateur de baisse (RSI 2 jours) doit passer sous 10</small></div></div>' +
        rsiGauge(C.rsi) +
        '<p class="cond-s">' + (C.c2 ? 'Remplie : indicateur à <b>' + nf(C.rsi, 0) + '</b>, sous 10.' : 'Pas encore : indicateur à <b>' + nf(C.rsi, 0) + '</b>. Il passerait sous 10 si le ' + o.I.name + ' finissait sous <b>' + px(a.X) + '</b> (' + pct(a.X / C.cur - 1) + ').') + '</p></div>' +
        /* scenarios */
        '<div class="cond-head"><b>Ce qui déclencherait l\'entrée</b></div><div class="scen">' +
        '<div><span>Ce soir</span><b>' + (a.possible ? (C.cur < a.X ? 'Rester sous ' + px(a.X) + ' jusqu\'à la fin de journée' : 'Fin de journée sous ' + px(a.X) + ' (' + pct(a.X / C.cur - 1) + ')') : 'Impossible') + '</b><small>' +
          (a.possible ? 'et au-dessus de ' + px(C.F) + '.' : a.P <= C.F ? 'l\'indice est sous sa moyenne 200 jours.' : 'il faudrait finir sous ' + px(a.X) + ', donc sous la moyenne 200 j (' + px(C.F) + ').') + '</small></div>' +
        '<div><span>Sur 2 jours</span><b>' + (C.d2 !== null ? '2 baisses de ' + pct(-C.d2) + ' de suite' : '—') + '</b><small>' +
          (C.d2 !== null ? 'indice vers ' + px(C.p2) + (C.p2ok ? ', toujours au-dessus de sa moyenne : entrée.' : ', mais sous sa moyenne : pas d\'entrée.') : '') + '</small></div>' +
        '<div><span>Historique</span><b>' + (C.lastEntry ? 'Dernière entrée le ' + shortDay(C.lastEntry) : 'Aucune entrée récente') + '</b><small>' +
          (C.lastEntry ? 'il y a ' + jours(a.last - C.lastEntry) + (C.gap ? ' · en moyenne une entrée tous les ' + C.gap + ' jours de Bourse' : '') : '') + '</small></div></div>';
      if (ok) {
        html += '<div class="cond-head"><b>L\'ordre à passer si la condition est remplie</b></div><div class="tiles">' + tile('Lots à acheter', nf(lt.lots, 2)) + tile('Montant', usd(lt.notional)) + tile('Stop', cfg.phase == 3 ? px(stop) : 'aucun') +
          tile('Marge bloquée', margeTxt(lt.notional)) + tile('Levier max', '1:' + levMax()) + tile('Niveau d\'entrée', px(a.X)) + '</div>' + inputBox(o) +
          '<div class="act-line">' + BUY + ' MT5 → <b>' + o.I.sym + '</b> → Ordre au marché → <b>' + nf(lt.lots, 2) + ' lots</b> → <b>Buy</b></div>';
      }
      k = o.k; chart = { k: k, from: IDX[k].c.length - 90, sma: true, refs: a.possible ? [{ v: a.X, label: 'entrée ' + px(a.X), cls: 'ref-buy', tail: true }] : [] };
    } else if (type === 'cours' && plan(parts[1]).trade && plan(parts[1]).trade.orphan) {
      o = plan(parts[1]); var to = o.trade; k = o.k;
      html = '<div class="sh-head">' + BUY + '<div><h2>' + o.I.name + '</h2><small>' + o.I.sym + ' · ' + nf(to.lots, 2) + ' lots · noté au journal</small></div></div>' +
        '<div class="sh-pl ' + (to.pnl >= 0 ? 'pos' : 'neg') + '">' + sUsd(to.pnl) + '<small>' + pct(to.pnl / cfg.size) + ' du compte</small></div>' + decisionHtml(o) +
        '<div class="tiles">' + tile('Entrée', shortDay(to.d1) + ' · ' + px(to.p1)) + tile('Sortie de la règle', to.exitDay ? shortDay(to.exitDay) + ' · ' + px(to.cur) : '—') +
        tile('Variation de l\'indice', pct(to.r), to.r >= 0 ? 'pos' : 'neg') + '</div>' +
        '<button class="btn" data-closej="' + to.id + '">Noter la sortie dans le Journal</button>' +
        '<div class="act-line" style="margin-top:10px"><span class="side out">SORTIR</span> MT5 → onglet Trade → <b>croix ×</b> sur ' + o.I.sym + ' (pas « Sell »)</div>';
      var ei2 = IDX[k].days.findIndex(function (dd) { return dd >= to.d1; });
      chart = { k: k, from: Math.max(0, ei2 - 5), refs: [{ v: to.p1, label: 'entrée ' + px(to.p1), cls: 'ref-buy' }].concat(to.exitDay ? [{ v: to.cur, label: 'sortie ' + px(to.cur), cls: 'ref-sell' }] : []) };
    } else if (type === 'cours') {
      o = plan(parts[1]); var tr = o.trade, a2 = o.a, last = o.I.days[o.I.days.length - 1], prog = Math.max(0, Math.min(1, (last - tr.d1) / Math.max(1, tr.deadline - tr.d1)));
      var exitNow = o.tone === 'act' || o.step === 3;
      html = '<div class="sh-head">' + BUY + '<div><h2>' + o.I.name + '</h2><small>' + o.I.sym + ' · ' + nf(tr.lots, 2) + ' lots · ' + (tr.real ? 'noté au journal' : 'selon la règle') + '</small></div></div>' +
        '<div class="sh-pl ' + (tr.pnl >= 0 ? 'pos' : 'neg') + '">' + sUsd(tr.pnl) + '<small>' + pct(tr.pnl / cfg.size) + ' du compte</small></div>' +
        decisionHtml(o) +
        '<div class="days"><div class="track"><div class="fill" style="width:' + prog * 100 + '%"></div></div><div class="labels"><span>entrée ' + shortDay(tr.d1) + '</span><span><b>' + jours(last - tr.d1) + '</b></span><span>sortie max ' + shortDay(tr.deadline) + '</span></div></div>' +
        '<div class="tiles">' + tile('Prix d\'entrée', px(tr.p1)) + tile('Prix actuel', px(tr.cur)) + tile('Niveau de sortie', px(a2.Y)) +
        tile('Variation de l\'indice', pct(tr.r), tr.r >= 0 ? 'pos' : 'neg') + tile('Hausse nécessaire pour sortir', a2.Y > tr.cur ? pct(a2.Y / tr.cur - 1) : 'atteinte', a2.Y > tr.cur ? '' : 'pos') + tile('Lots', nf(tr.lots, 2)) + tile('Stop', tr.stop ? px(tr.stop) : 'aucun') + tile('Valeur du trade', usd(tr.cur * tr.lots * (tr.ct || 10))) +
          tile('Marge bloquée', margeTxt(tr.cur * tr.lots * (tr.ct || 10))) + tile('Levier max', '1:' + levMax()) + '</div>' +
        inputBox(o) + (exitNow ? '<div class="act-line"><span class="side out">SORTIR</span> MT5 → onglet Trade → <b>croix ×</b> sur ' + o.I.sym + ' (pas « Sell »)</div>' : '');
      k = o.k; var ei = IDX[k].days.findIndex(function (d) { return d >= tr.d1; });
      chart = { k: k, from: Math.max(0, ei - 5), entry: ei, exitLine: true, refs: [{ v: tr.p1, label: 'entrée ' + px(tr.p1), cls: 'ref-buy' }].concat(tr.stop ? [{ v: tr.stop, label: 'stop', cls: 'ref-stop', zone: 'below' }] : []), y: a2.Y };
    } else {
      var t = doneList().filter(function (x) { return x.id === id.slice(5); })[0];
      if (!t) { closeSheet(); return; }
      k = t.k;
      html = '<div class="sh-head">' + BUY + '<div><h2>' + IDX[k].name + '</h2><small>' + IDX[k].sym + ' · ' + (t.src === 'journal' ? 'mon trade (journal)' : 'trade de la règle') + '</small></div></div>' +
        '<div class="sh-pl ' + (t.usd >= 0 ? 'pos' : 'neg') + '">' + sUsd(t.usd) + '<small>' + pct(t.usd / cfg.size) + ' du compte</small></div>' +
        '<div class="big-state ' + (t.usd >= 0 ? 'ok' : 'idle') + '">' + (t.usd >= 0 ? ico('check') + ' Trade gagnant' : ico('cross') + ' Trade perdant') + '</div>' +
        '<div class="tiles">' + tile('Entrée', shortDay(t.e) + ' · ' + px(t.pe)) + tile('Sortie', shortDay(t.x) + ' · ' + px(t.px)) + tile('Durée', jours(t.x - t.e)) +
        tile('Variation de l\'indice', pct(t.g), t.g >= 0 ? 'pos' : 'neg') + tile('Résultat', sUsd(t.usd), t.usd >= 0 ? 'pos' : 'neg') + tile('Lots', t.lots ? nf(t.lots, 2) : nf(lotsFor(k, t.pe, t.lev).lots, 2)) + '</div>' +
        (t.src === 'regle' ? '<p class="muted">Calculé sur ton compte de ' + usd(cfg.size) + ', taille ' + levTxt(t.lev) + ' sur ce trade, frais estimés compris.</p>' : '');
      var I = IDX[k], ie = I.days.findIndex(function (d) { return d >= t.e; }), ix = I.days.findIndex(function (d) { return d >= t.x; });
      chart = { k: k, from: Math.max(0, ie - 5), to: Math.min(I.days.length, ix + 4), refs: [{ v: t.pe, label: 'entrée ' + px(t.pe), cls: 'ref-buy' }, { v: t.px, label: 'sortie ' + px(t.px), cls: 'ref-sell' }] };
    }
    $('sheet-body').innerHTML = html + '<h3 style="margin:16px 0 0">Graphique</h3><div class="chart" id="sheet-ch"></div>';
    $('sheet').hidden = false; document.body.classList.add('noscroll'); sheetId = id;
    if (!refresh) $('sheet').querySelector('.sheet').scrollTop = 0;
    var I2 = IDX[chart.k], to = chart.to || I2.days.length, xs = I2.days.slice(chart.from, to), ys = I2.c.slice(chart.from, to), series = [{ name: 'Prix de fin de journée', v: ys, c: '--s1' }];
    if (chart.sma) series.push({ name: 'Moyenne 200 jours', v: A[chart.k].st.sma200.slice(chart.from, to), c: '--s2' });
    if (chart.exitLine) {
      var thr = xs.map(function (d, q) { var j = chart.from + q; return j > chart.entry ? (I2.c[j - 1] + I2.c[j - 2] + I2.c[j - 3] + I2.c[j - 4]) / 4 : NaN; });
      xs = xs.concat([session]); series[0].v = ys.concat([NaN]); series.push({ name: 'Niveau de sortie', v: thr.concat([chart.y]), c: '--s2' });
    }
    lineChart($('sheet-ch'), { x: xs, series: series, refs: chart.refs, height: 190, label: I2.name, fmt: function (v) { return nf(v, 0); } });
  }
  function closeSheet() { $('sheet').hidden = true; document.body.classList.remove('noscroll'); sheetId = null; }

  /* compte */
  function renderCompte() {
    var s = account(), rows = [];
    if (s.target) {
      rows.push(['Objectif de l\'étape', usd(s.target) + ' (' + (cfg.phase == 1 ? '+8 %' : '+5 %') + ')']);
      rows.push(['Reste à gagner', usd(Math.max(0, s.target - s.bal))]);
      rows.push(['Jours de trading', s.tradingDays + ' / 5 minimum']);
    } else {
      rows.push(['Gain au-dessus du départ', usd(Math.max(0, s.bal - s.size))]);
      rows.push(['Prochain paiement possible', s.payout !== null ? longDay(s.payout) : 'indique la date de début du compte financé']);
      rows.push(['Montant estimé (80 %)', usd(Math.max(0, (s.bal - s.size) * 0.8))]);
      rows.push(['Risque des trades en cours', usd(s.risk) + ' / ' + usd(s.size * 0.03) + ' autorisés']);
    }
    rows.push(['Plancher de perte maximale', usd(s.maxFloor) + ' · marge ' + usd(s.equity - s.maxFloor)]);
    rows.push(['Plancher de perte du jour', usd(s.dayFloor) + ' (≈ solde − 5 %)']);
    rows.push(['Trades en cours (non encaissé)', sUsd(s.open)]);
    rows.push(['Dernière activité', s.inactive + ' jours · limite le ' + longDay(s.deadline)]);
    var prog = s.target ? Math.max(0, Math.min(1, (s.bal - s.size) / (s.target - s.size))) : null;
    $('acct-status').innerHTML = '<h2>' + (cfg.phase == 3 ? 'Compte financé' : 'Phase ' + cfg.phase) + ' · ' + usd(s.size) + '</h2>' +
      '<div class="signal" style="margin-top:0">' + usd(s.bal) + '<small>' + (s.est ? 'Solde estimé : capital de départ + trades terminés du journal depuis le début de l\'étape.' : 'Solde saisi depuis MT5.') + '</small></div>' +
      (prog !== null ? '<div class="bar"><i style="width:' + prog * 100 + '%"></i></div><p class="muted" style="margin:0 0 8px">' + nf(prog * 100, 0) + ' % de l\'objectif</p>' : '') +
      '<dl class="rows">' + rows.map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>'; }).join('') + '</dl>';
  }

  /* journal */
  function renderJournal() {
    renderTrades();
    var list = trades.slice().sort(function (a, b) { return b.d1.localeCompare(a.d1); });
    $('j-list').innerHTML = list.length ? list.map(function (t) {
      var p = pnlOf(t);
      return '<tr><td>' + IDX[t.idx].name + (t.kind === 'entretien' ? ' <span class="muted">· entretien</span>' : '') + '</td><td>' + shortDay(dn(t.d1)) + ' · ' + px(t.p1) + '</td><td>' +
        (t.d2 ? shortDay(dn(t.d2)) + ' · ' + px(t.p2) : '<b>en cours</b>') + '</td><td>' + nf(t.lots, 2) + '</td><td class="' + (p >= 0 ? 'pos' : 'neg') + '">' + sUsd(p) + (t.d2 ? '' : ' *') +
        '</td><td><div class="act"><button data-edit="' + t.id + '">Modifier</button><button class="del" data-del="' + t.id + '">Suppr.</button></div></td></tr>';
    }).join('') : '<tr><td colspan="6" class="empty">Aucun trade. Note chaque trade démo avec le prix obtenu.</td></tr>';
    var closed = trades.filter(function (t) { return t.d2; }).sort(function (a, b) { return a.d2.localeCompare(b.d2); }), tot = 0, win = 0, best = 0, worst = 0;
    var xs = [], ys = [];
    closed.forEach(function (t) { var p = pnlOf(t); tot += p; if (p > 0) win++; best = Math.max(best, p); worst = Math.min(worst, p); xs.push(dn(t.d2)); ys.push(tot); });
    $('j-kpis').innerHTML = '<div><span>Résultat total</span><b class="' + (tot >= 0 ? 'pos' : 'neg') + '">' + sUsd(tot) + '</b></div><div><span>Trades terminés</span><b>' + closed.length + '</b></div>' +
      '<div><span>Gagnants</span><b>' + (closed.length ? Math.round(win / closed.length * 100) + ' %' : '—') + '</b></div><div><span>Pire trade</span><b>' + (closed.length ? sUsd(worst) : '—') + '</b></div>';
    if (xs.length >= 2) lineChart($('j-chart'), { x: xs, series: [{ name: 'Résultat cumulé', v: ys, c: '--s1' }], height: 190, label: 'Résultat cumulé du journal', fmt: function (v) { return nf(v, 0); } });
    else $('j-chart').innerHTML = '<p class="empty">La courbe apparaît après 2 trades terminés.</p>';
  }
  function fillForm(t) {
    $('j-id').value = t ? t.id : ''; $('j-idx').value = t ? t.idx : 'spx'; $('j-kind').value = t ? (t.kind || 'regle') : 'regle';
    $('j-d1').value = t ? t.d1 : ds(parisToday()); $('j-p1').value = t ? t.p1 : ''; $('j-lots').value = t ? t.lots : '';
    $('j-d2').value = t && t.d2 ? t.d2 : ''; $('j-p2').value = t && t.p2 ? t.p2 : ''; $('j-fee').value = t && t.fee ? t.fee : '';
    $('j-form-title').textContent = t ? 'Modifier le trade' : 'Noter un trade'; $('j-cancel').hidden = !t;
  }

  /* ---------- bilan de l'annee ---------- */
  var FIN = 0.089 / 360, COST = 0.0003;                                // frais de nuit (~8,9 %/an) et spread aller-retour
  var FEES = { 6000: 59.99, 15000: 119.99, 25000: 199.99, 50000: 299.99, 100000: 549.99, 200000: 1099.99 };

  /* jambes de trades : rendements quotidiens (cloture et plus bas), avec ou sans stop */
  function legs(withStop) {                                          // withStop : stop de la regle des 3 % (compte finance)
    var out = [];
    ['spx', 'ndx'].forEach(function (k) {
      var I = IDX[k], c = I.c, l = I.l, d = I.days, st = A[k].st;
      var all = st.trades.slice(); if (st.open !== null) all.push([st.open, c.length - 1, true]);
      all.forEach(function (t) {
        var i = t[0], j = t[1], lev = levAt(k, i), sp = withStop ? c[i] * (1 - stopFor(lev)) : null, days = [], exitIdx = j, stopped = false;
        for (var q = i + 1; q <= j; q++) {
          var f = FIN * (d[q] - d[q - 1]) + (q === i + 1 ? COST : 0);
          if (sp && l[q] <= sp) { var rr = sp / c[q - 1] - 1 - f; days.push({ d: d[q], r: rr, rl: rr }); exitIdx = q; stopped = true; break; }
          days.push({ d: d[q], r: c[q] / c[q - 1] - 1 - f, rl: Math.min(l[q], c[q]) / c[q - 1] - 1 - f });
        }
        var gross = (stopped ? sp : c[exitIdx]) / c[i] - 1, net = days.reduce(function (s, x) { return (1 + s) * (1 + x.r) - 1; }, 0);
        out.push({ k: k, i: i, lev: lev, e: d[i], x: d[exitIdx], pe: c[i], px: stopped ? sp : c[exitIdx], n: exitIdx - i, gross: gross, net: net, open: !!t[2] && !stopped, stopped: stopped, days: days });
      });
    });
    return out;
  }
  function byDay(L) { var b = {}; L.forEach(function (t) { var last = t.days.length ? t.days[t.days.length - 1].d : null; t.days.forEach(function (x) { (b[x.d] = b[x.d] || []).push({ e: t.e, r: x.r, rl: x.rl, lev: t.lev, id: t.k + t.e, end: !t.open && x.d === last }); }); }); return b; }

  /* compte FundedNext Stellar 2-Step simule depuis s0, compte crame remplace aussitot */
  /* compte FundedNext Stellar 2-Step simule : achete le premier jour de Bourse de la periode (trades ouverts avant exclus), compte crame
     remplace aussitot. Limites de perte sur les trades ouverts compris (au plus bas du jour) ; objectifs de phase et paiements sur les
     trades fermes seulement ; au moins 5 jours de Bourse par phase (regle officielle, completee si besoin par de tout petits trades). */
  function simAccount(s0, e0) {
    var size = +cfg.size, fee = FEES[size] || 299.99, Bns = byDay(legs(false)), Bs = byDay(legs(true));
    var days = Object.keys(Bns).concat(Object.keys(Bs)).map(Number).concat(IDX.spx.days).filter(function (d) { return d > s0 && d <= e0; });
    days = days.filter(function (d, i) { return days.indexOf(d) === i; }).sort(function (a, b) { return a - b; });
    var fresh = function (since, n) { return { ph: 1, bal: size, real: size, since: since, due: null, ref: false, n: n, open: {}, nd: 0 }; };
    var ev = [], fees = fee, paid = 0, blown = 0, curve = [], a = fresh(s0 + 1, 1);
    ev.push([days[0] || s0, 'Achat du compte ' + a.n + ' (' + usd(fee, 2) + ')', '']);
    days.forEach(function (d) {
      var B = a.ph < 3 ? Bns : Bs, mine = (B[d] || []).filter(function (x) { return x.e >= a.since; });
      var pnl = 0, worst = 0; mine.forEach(function (x) { pnl += size * x.lev * x.r; worst += size * x.lev * x.rl; });
      a.nd++;
      if (worst <= -0.05 * size || a.bal + worst <= 0.9 * size || pnl <= -0.05 * size) {
        blown++; ev.push([d, 'Compte ' + a.n + ' cramé en ' + (a.ph < 3 ? 'phase ' + a.ph : 'compte financé') + ' (perte ' + usd(Math.min(worst, pnl)) + ' dans la journée)', 'bad']);
        a = fresh(d, a.n + 1); fees += fee; ev.push([d, 'Achat du compte ' + a.n + ' (' + usd(fee, 2) + ')', '']);
      } else {
        a.bal += pnl;
        mine.forEach(function (x) { a.open[x.id] = (a.open[x.id] || 0) + size * x.lev * x.r; if (x.end) { a.real += a.open[x.id]; delete a.open[x.id]; } });
        if (a.ph === 1 && a.real >= size * 1.08 && a.nd >= 5) { ev.push([d, 'Phase 1 réussie (+8 % sur les trades fermés)', 'ok']); a = Object.assign(fresh(d, a.n), { ph: 2 }); }
        else if (a.ph === 2 && a.real >= size * 1.05 && a.nd >= 5) { ev.push([d, 'Phase 2 réussie : compte financé', 'ok']); a = Object.assign(fresh(d, a.n), { ph: 3, due: d + 21 }); }
        else if (a.ph === 3 && d >= a.due) {
          a.due = d + 14;
          if (a.real > size) {
            var g = a.real - size, amt = 0.8 * g + (a.ref ? 0 : fee); paid += amt;
            ev.push([d, 'Paiement ' + usd(amt) + (a.ref ? '' : ' (prix du compte remboursé)'), 'ok', amt]); a.ref = true; a.real = size; a.bal -= g;
          }
        }
      }
      curve.push([d, paid - fees + (a.bal - size)]);
    });
    return { fees: fees, paid: paid, blown: blown, a: a, ev: ev, curve: curve, fee: fee };
  }

  function barChart(el, o) {
    var W = Math.max(280, el.clientWidth || 600), H = o.height || 190, L = 50, R = 8, T = 10, B = 24, n = o.v.length;
    if (!n) { el.innerHTML = '<p class="empty">Aucun trade sur la période.</p>'; return; }
    var lo = Math.min(0, Math.min.apply(null, o.v)), hi = Math.max(0, Math.max.apply(null, o.v)), pad = (hi - lo) * 0.08 || 1; lo -= lo < 0 ? pad : 0; hi += pad;
    var Y = function (v) { return T + (H - T - B) * (1 - (v - lo) / (hi - lo)); }, slot = (W - L - R) / n, bw = Math.max(2, Math.min(24, slot - 2));
    var step = Math.pow(10, Math.floor(Math.log10((hi - lo) / 3))); if ((hi - lo) / step > 6) step *= 2;
    var g = '';
    for (var t = Math.ceil(lo / step) * step; t <= hi; t += step) g += '<line class="gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(t) + '" y2="' + Y(t) + '"/><text class="ax" x="' + (L - 6) + '" y="' + (Y(t) + 4) + '" text-anchor="end">' + o.fmtAxis(t) + '</text>';
    g += '<line class="zero" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(0) + '" y2="' + Y(0) + '"/>';
    o.v.forEach(function (v, i) {
      var x = L + slot * i + (slot - bw) / 2, y0 = Y(0), y1 = Y(v), h = Math.max(1, Math.abs(y1 - y0)), r = Math.min(4, bw / 2, h);
      var top = v >= 0 ? y1 : y0, cls = v >= 0 ? 'bar-pos' : 'bar-neg';
      var path = v >= 0 ? 'M' + x + ' ' + (top + h) + 'V' + (top + r) + 'Q' + x + ' ' + top + ' ' + (x + r) + ' ' + top + 'H' + (x + bw - r) + 'Q' + (x + bw) + ' ' + top + ' ' + (x + bw) + ' ' + (top + r) + 'V' + (top + h) + 'Z'
        : 'M' + x + ' ' + top + 'V' + (top + h - r) + 'Q' + x + ' ' + (top + h) + ' ' + (x + r) + ' ' + (top + h) + 'H' + (x + bw - r) + 'Q' + (x + bw) + ' ' + (top + h) + ' ' + (x + bw) + ' ' + (top + h - r) + 'V' + top + 'Z';
      g += '<rect class="bar-hl" data-i="' + i + '" x="' + (L + slot * i) + '" y="' + T + '" width="' + slot + '" height="' + (H - T - B) + '" style="opacity:0"/>';
      g += '<path class="' + cls + '" d="' + path + '"/>';
    });
    if (o.xl) o.xl.forEach(function (p) { g += '<text class="ax" x="' + (L + slot * p[0] + slot / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(p[1]) + '</text>'; });
    g += '<rect class="bar-hit" x="' + L + '" y="0" width="' + (W - L - R) + '" height="' + H + '"/>';
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.label) + '">' + g + '</svg><div class="tip" hidden></div>' +
      '<div class="legend"><span><i style="background:var(--good);height:8px"></i>Gain</span><span><i style="background:var(--crit);height:8px"></i>Perte</span></div>';
    var svg = el.querySelector('svg'), tip = el.querySelector('.tip'), hls = el.querySelectorAll('.bar-hl');
    function move(ev) {
      var rc = svg.getBoundingClientRect(), sx = (ev.clientX - rc.left) * W / rc.width, i = Math.floor((sx - L) / slot);
      if (i < 0 || i >= n) return;
      hls.forEach(function (h, q) { h.style.opacity = q === i ? 1 : 0; });
      tip.innerHTML = o.tip(i); tip.hidden = false;
      tip.style.left = Math.max(80, Math.min(rc.width - 80, (L + slot * (i + 0.5)) * rc.width / W)) + 'px'; tip.style.top = Math.max(44, Y(Math.max(0, o.v[i])) * rc.height / H - 8) + 'px';
    }
    svg.addEventListener('pointermove', move); svg.addEventListener('pointerdown', move);
    svg.addEventListener('pointerleave', function () { tip.hidden = true; hls.forEach(function (h) { h.style.opacity = 0; }); });
  }

  /* ---------- onglet Bilan : une annee de la regle, de la plus grande lecture au detail ---------- */
  var byear = null, MOIS_C = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  function yearStats(Y0, L) {
    var lastDay = Math.max(A.spx.last, A.ndx.last), s0 = dn(Y0 + '-01-01') - 1, e0 = Math.min(lastDay, dn(Y0 + '-12-31')), size = +cfg.size;
    var T = L.filter(function (t) { return t.e > s0 && t.e <= e0; }).sort(function (x, y) { return x.e - y.e; }), closed = T.filter(function (t) { return !t.open; });
    var money = function (t) { return size * t.lev * t.net; };
    var bd = byDay(T), days = IDX.spx.days.filter(function (d) { return d > s0 && d <= e0; });
    var cum = 0, peak = 0, mdd = 0, xs = [], ys = [], dd = [], inMkt = 0, wDay = 0, wDayD = null;
    days.forEach(function (d) {
      var v = bd[d] || [], r = 0, rl = 0;
      v.forEach(function (x) { r += x.lev * x.r; rl += x.lev * x.rl; });
      if (v.length) inMkt++;
      if (rl < wDay) { wDay = rl; wDayD = d; }
      cum += r; peak = Math.max(peak, cum); mdd = Math.min(mdd, cum - peak); xs.push(d); ys.push(cum * 100); dd.push((cum - peak) * 100);
    });
    var wins = closed.filter(function (t) { return t.net > 0; }), gW = 0, gL = 0, run = 0, streak = 0;
    closed.forEach(function (t) { var m = money(t); if (t.net > 0) { gW += m; run++; } else { gL += m; run = 0; } streak = Math.max(streak, run); });
    var hold = {};
    ['spx', 'ndx'].forEach(function (k) {
      var I = IDX[k], i0 = -1, i1 = -1, q;
      for (q = 0; q < I.days.length; q++) if (I.days[q] > s0) { i0 = q; break; }
      for (q = I.days.length - 1; q >= 0; q--) if (I.days[q] <= e0) { i1 = q; break; }
      hold[k] = i0 > 0 && i1 >= i0 ? I.c[i1] / I.c[i0 - 1] - 1 : null;
    });
    var sim = simAccount(s0, e0);
    return { Y0: Y0, s0: s0, e0: e0, lastDay: lastDay, size: size, T: T, closed: closed, money: money, cum: cum, mdd: mdd, xs: xs, ys: ys, dd: dd,
      inMkt: days.length ? inMkt / days.length : 0, wDay: wDay, wDayD: wDayD, wins: wins, gW: gW, gL: gL, streak: streak, hold: hold, sim: sim,
      net: sim.paid - sim.fees, avgLev: T.length ? T.reduce(function (x, t) { return x + t.lev; }, 0) / T.length : 0 };
  }
  var bMini = function (l, v, sub, cls) { return '<div class="bh-m"><span>' + l + '</span><b class="' + (cls || '') + '">' + v + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>'; };
  function ringSvg(p, label) {
    var r = 34, c = 2 * Math.PI * r, d = Math.max(0, Math.min(1, p)) * c;
    return '<svg class="ring" viewBox="0 0 84 84" role="img" aria-label="' + esc(label) + '"><circle cx="42" cy="42" r="' + r + '" class="ring-bg"/>' +
      '<circle cx="42" cy="42" r="' + r + '" class="ring-fg" stroke-dasharray="' + d.toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 42 42)"/>' +
      '<text x="42" y="48" text-anchor="middle" class="ring-t">' + Math.round(p * 100) + ' %</text></svg>';
  }
  function meter(lab, val, txt, lim, limTxt) {
    var w = Math.max(0, Math.min(100, val / lim * 100));
    return '<div class="mtr"><div class="mtr-h"><span>' + lab + '</span><b>' + txt + '</b></div><div class="mtr-t"><i class="' + (w >= 80 ? 'hot' : w >= 50 ? 'warm' : '') + '" style="width:' + w.toFixed(1) + '%"></i></div><small>' + limTxt + '</small></div>';
  }
  /* parcours du dernier compte de l'annee : achat, phase 1, phase 2, paiements */
  function journeyHtml(S) {
    var ev = S.sim.ev, a = S.sim.a, last = 0, q;
    for (q = 0; q < ev.length; q++) if (/^Achat du compte/.test(ev[q][1])) last = q;
    var mine = ev.slice(last), find = function (re) { var e = mine.filter(function (x) { return re.test(x[1]); })[0]; return e ? e[0] : null; };
    var d0 = mine[0][0], d1 = find(/^Phase 1/), d2 = find(/^Phase 2/), pays = mine.filter(function (x) { return /^Paiement/.test(x[1]); });
    var paid = pays.reduce(function (s2, x) { return s2 + (x[3] || 0); }, 0);
    var prog = function (target) { return pct((a.real - S.size) / S.size, 1) + ' sur ' + nf(target * 100, 0) + ' %'; };
    var mois = function (x, y) { var n = Math.max(1, Math.round((y - x) / 30.4)); return n + ' mois'; };
    var steps = [
      { t: 'Achat', d: shortDay(d0), s: 'done' },
      { t: 'Phase 1', d: d1 ? shortDay(d1) : a.ph === 1 ? prog(0.08) : '—', s: d1 ? 'done' : a.ph === 1 ? 'cur' : '', w: d1 ? 'en ' + mois(d0, d1) : '' },
      { t: 'Phase 2', d: d2 ? shortDay(d2) : a.ph === 2 ? prog(0.05) : '—', s: d2 ? 'done' : a.ph === 2 ? 'cur' : '', w: d2 && d1 ? 'en ' + mois(d1, d2) : '' },
      { t: 'Paiements', d: pays.length ? pays.length + ' · ' + usd(paid) : a.ph === 3 ? 'financé, en attente' : '—', s: pays.length ? 'done' : a.ph === 3 ? 'cur' : '' }
    ];
    var burnt = ev.filter(function (x) { return x[2] === 'bad'; });
    return '<div class="jr">' + steps.map(function (x, i) {
      return '<div class="jr-s ' + x.s + '"><i>' + (x.s === 'done' ? ico('check') : i + 1) + '</i><b>' + x.t + '</b><span>' + x.d + '</span>' + (x.w ? '<small>' + x.w + '</small>' : '') + '</div>';
    }).join('') + '</div>' + (burnt.length ? '<p class="jr-burn">' + ico('alert') + ' ' + burnt.length + ' compte' + (burnt.length > 1 ? 's' : '') + ' cramé' + (burnt.length > 1 ? 's' : '') +
      ' cette année (' + burnt.map(function (x) { return shortDay(x[0]); }).join(', ') + '), racheté' + (burnt.length > 1 ? 's' : '') + ' aussitôt. Le parcours ci-dessus est celui du compte ' + a.n + '.</p>' : '');
  }
  function yearBars(el, ALL, sel) {
    var W = Math.max(280, el.clientWidth || 600), H = 196, T = 24, B = 40, n = ALL.length, slot = W / n, bw = Math.min(44, slot * 0.58);
    var vals = ALL.map(function (x) { return x.cum * 100; }), hi = Math.max(2, Math.max.apply(null, vals)), lo = Math.min(0, Math.min.apply(null, vals));
    var Y = function (v) { return T + (H - T - B) * (hi - v) / (hi - lo); }, g = '<line class="zero" x1="0" x2="' + W + '" y1="' + Y(0) + '" y2="' + Y(0) + '"/>';
    ALL.forEach(function (x, i) {
      var v = vals[i], bx = slot * i + (slot - bw) / 2, y0 = Y(0), y1 = Y(v), top = Math.min(y0, y1), hh = Math.max(2, Math.abs(y1 - y0)), cx = bx + bw / 2;
      g += '<g class="yb' + (x.Y0 === sel ? ' on' : '') + '" data-byear="' + x.Y0 + '"><rect class="yb-hit" x="' + (slot * i) + '" y="0" width="' + slot + '" height="' + H + '"/>' +
        '<rect class="' + (v >= 0 ? 'bar-pos' : 'bar-neg') + '" x="' + bx.toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hh.toFixed(1) + '" rx="4"/>' +
        '<text class="yb-v' + (v < 0 ? ' neg' : '') + '" x="' + cx + '" y="' + (v >= 0 ? top - 6 : y0 - 6) + '" text-anchor="middle">' + (v >= 0 ? '+' : '−') + nf(Math.abs(v), 0) + ' %</text>' +
        '<text class="yb-y" x="' + cx + '" y="' + (H - 21) + '" text-anchor="middle">' + x.Y0 + '</text>' +
        '<text class="yb-n ' + (x.net >= 0 ? 'pos' : 'neg') + '" x="' + cx + '" y="' + (H - 5) + '" text-anchor="middle">' + (x.net >= 0 ? '+' : '−') + nf(Math.abs(x.net) / 1000, 1) + 'k $</text></g>';
    });
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Performance de la règle et bilan FundedNext chaque année">' + g + '</svg>' +
      '<div class="legend"><span>Barres : performance du compte (%)</span><span>En dessous : bilan FundedNext de l’année</span></div>';
  }
  function ddChart(el, xs, dd) {
    var W = Math.max(280, el.clientWidth || 600), H = 64, L = 50, R = 12, n = xs.length, lo = Math.min(-1, Math.min.apply(null, dd)) * 1.1;
    var X = function (i) { return L + (W - L - R) * (n > 1 ? i / (n - 1) : 0); }, Y = function (v) { return 4 + (H - 8) * v / lo; };
    var d = 'M' + L + ' ' + Y(0); dd.forEach(function (v, i) { d += 'L' + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); }); d += 'L' + X(n - 1).toFixed(1) + ' ' + Y(0) + 'Z';
    var mi = dd.indexOf(Math.min.apply(null, dd));
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Recul du compte depuis son plus haut"><line class="zero" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(0) + '" y2="' + Y(0) + '"/>' +
      '<path class="dd-area" d="' + d + '"/><text class="ax" x="' + (L - 6) + '" y="' + (Y(lo / 1.1) + 4) + '" text-anchor="end">−' + nf(Math.abs(lo / 1.1), 1) + ' %</text>' +
      (mi >= 0 && dd[mi] < 0 ? '<circle class="dd-dot" cx="' + X(mi) + '" cy="' + Y(dd[mi]) + '" r="3.5"/><text class="reflab" x="' + Math.min(W - R - 4, X(mi) + 6) + '" y="' + Math.min(H - 4, Y(dd[mi]) + 4) + '" text-anchor="' + (X(mi) > W * 0.75 ? 'end' : 'start') + '">−' + nf(Math.abs(dd[mi]), 1) + ' % le ' + shortDay(xs[mi]) + '</text>' : '') + '</svg>';
  }

  function renderBilan() {
    var lastDay = Math.max(A.spx.last, A.ndx.last), lastY = new Date(lastDay * DAY).getUTCFullYear(), years = [], y;
    for (y = Math.max(2020, new Date(IDX.spx.days[0] * DAY).getUTCFullYear() + 3); y <= lastY; y++) years.push(y);
    if (byear === null) byear = +store.get('year', lastY);
    if (years.indexOf(byear) < 0) byear = lastY;
    var L = legs(false), ALL = years.map(function (yy) { return yearStats(yy, L); }), S = ALL[years.indexOf(byear)], size = S.size, closed = S.closed, money = S.money;
    var nOpen = S.T.length - closed.length, wr = closed.length ? S.wins.length / closed.length : 0;

    $('b-years').innerHTML = years.map(function (yy) { return '<button role="tab" data-byear="' + yy + '" aria-selected="' + (yy === byear) + '">' + yy + (yy === lastY ? '<small>en cours</small>' : '') + '</button>'; }).join('');
    var yon = $('b-years').querySelector('[aria-selected="true"]'); if (yon) $('b-years').scrollLeft = Math.max(0, yon.offsetLeft - $('b-years').clientWidth / 2 + yon.clientWidth / 2);

    /* 1. le resultat de l'annee */
    var period = S.e0 === lastDay ? 'du 2 janvier au ' + shortDay(lastDay) : 'année complète';
    $('b-hero').innerHTML = '<div class="bh-top"><span class="bh-y">' + byear + '</span><span>' + period + ' · compte ' + nf(size / 1000) + 'k · ' + (cfg.dose ? 'taille dosée' : nf(cfg.lev, 2) + ' × fixe') + '</span></div>' +
      '<div class="bh-main"><div class="bh-res"><span>Bilan FundedNext</span><b class="' + (S.net >= 0 ? 'pos' : 'neg') + '">' + sUsd(S.net) + '</b><small>' + usd(S.sim.paid) + ' de paiements − ' + usd(S.sim.fees) + ' de comptes achetés</small></div>' +
      '<div class="bh-side">' + bMini('Performance', pct(S.cum, 1), 'du compte', S.cum >= 0 ? 'pos' : 'neg') + bMini('Trades', closed.length + (nOpen ? ' + ' + nOpen : ''), closed.length ? Math.round(wr * 100) + ' % gagnants' : 'aucun terminé') +
      bMini('Pire recul', pct(S.mdd, 1), 'limite 10 %', S.mdd <= -0.05 ? 'neg' : '') + '</div></div>' + journeyHtml(S);

    /* 2. chaque annee */
    yearBars($('b-annees'), ALL, byear);

    /* 3. evolution du compte */
    $('b-perf-sub').textContent = 'en % du compte, frais compris';
    if (S.xs.length >= 2) {
      lineChart($('b-perf'), { x: S.xs, series: [{ name: 'Performance', v: S.ys, c: '--s1' }], height: 200, label: 'Performance cumulée de la règle en ' + byear, fmt: function (v) { return (v < -0.05 ? '−' : '') + nf(Math.abs(v) < 0.05 ? 0 : Math.abs(v), 1) + ' %'; } });
      ddChart($('b-dd'), S.xs, S.dd);
    } else { $('b-perf').innerHTML = '<p class="empty">Pas encore assez de données.</p>'; $('b-dd').innerHTML = ''; }

    /* 4. le risque face aux limites FundedNext */
    $('b-risk').innerHTML = '<div class="b-h"><h2>Le risque</h2><span class="muted">face aux limites FundedNext</span></div>' +
      meter('Pire recul du compte', -S.mdd, pct(S.mdd, 1), 0.10, 'limite : −10 % au total') +
      meter('Pire journée, au plus bas', -S.wDay, pct(S.wDay, 1) + (S.wDayD ? ' · ' + shortDay(S.wDayD) : ''), 0.05, 'limite : −5 % dans la journée') +
      meter('Temps en position', S.inMkt, Math.round(S.inMkt * 100) + ' %', 1, 'des jours de Bourse de l’année') +
      '<dl class="b-dl"><div><dt>Taille moyenne prise</dt><dd>' + (S.T.length ? levTxt(S.avgLev) + ' par indice' : '—') + '</dd></div><div><dt>Comptes cramés</dt><dd class="' + (S.sim.blown ? 'neg' : '') + '">' + S.sim.blown + '</dd></div></dl>';

    /* 5. les trades */
    var best = closed.reduce(function (m, t) { return !m || money(t) > money(m) ? t : m; }, null), worst = closed.reduce(function (m, t) { return !m || money(t) < money(m) ? t : m; }, null);
    var dur = closed.length ? closed.reduce(function (x, t) { return x + t.x - t.e; }, 0) / closed.length : 0, tot = S.gW + S.gL, pf = S.gL < 0 ? S.gW / -S.gL : null;
    var gw = S.gW + Math.abs(S.gL) > 0 ? S.gW / (S.gW + Math.abs(S.gL)) * 100 : 50;
    $('b-trades').innerHTML = '<div class="b-h"><h2>Les trades</h2><span class="muted">' + closed.length + ' terminés' + (nOpen ? ' + ' + nOpen + ' en cours' : '') + '</span></div>' +
      (closed.length ? '<div class="b-tgrid"><div class="b-ring">' + ringSvg(wr, Math.round(wr * 100) + ' % de trades gagnants') + '<small>gagnants</small></div>' +
        '<dl class="b-dl"><div><dt>Résultat par trade</dt><dd class="' + (tot >= 0 ? 'pos' : 'neg') + '">' + sUsd(tot / closed.length) + '</dd></div>' +
        '<div><dt>Meilleur</dt><dd class="pos">' + sUsd(money(best)) + ' <small>' + shortDay(best.e) + '</small></dd></div>' +
        '<div><dt>Pire</dt><dd class="' + (money(worst) >= 0 ? 'pos' : 'neg') + '">' + sUsd(money(worst)) + ' <small>' + shortDay(worst.e) + '</small></dd></div>' +
        '<div><dt>Durée moyenne</dt><dd>' + nf(dur, 1) + ' jours</dd></div><div><dt>Série gagnante</dt><dd>' + S.streak + ' de suite</dd></div></dl></div>' +
        '<div class="pf"><div class="pf-t"><i class="pf-g" style="width:' + gw.toFixed(1) + '%"></i><i class="pf-l" style="width:' + (100 - gw).toFixed(1) + '%"></i></div>' +
        '<div class="pf-x"><span class="pos">Gains ' + sUsd(S.gW) + '</span><span>' + (pf !== null ? 'gains / pertes : <b>' + nf(pf, 1) + '</b>' : 'aucune perte') + '</span><span class="neg">Pertes ' + sUsd(S.gL) + '</span></div></div>' +
        '<div class="chart" id="b-bars"></div>' : '<p class="empty">Aucun trade terminé sur la période.</p>');
    if (closed.length) barChart($('b-bars'), {
      v: closed.map(money), label: 'Résultat de chaque trade en ' + byear, height: 170, fmtAxis: function (v) { return nf(v, 0); },
      xl: [[0, shortDay(closed[0].e)], [closed.length - 1, shortDay(closed[closed.length - 1].e)]],
      tip: function (i) { var t = closed[i]; return '<div>' + IDX[t.k].name + ' · ' + shortDay(t.e) + ' → ' + shortDay(t.x) + '</div><div><b>' + sUsd(money(t)) + '</b> · indice ' + pct(t.gross) + ' · taille ' + levTxt(t.lev) + '</div>'; }
    });

    /* 6. mois par mois */
    var mv = [], mn = [], mx = 0;
    for (var m = 0; m < 12; m++) { mv.push(0); mn.push(0); }
    closed.forEach(function (t) { var dx = new Date(t.x * DAY); if (dx.getUTCFullYear() === byear) { mv[dx.getUTCMonth()] += money(t); mn[dx.getUTCMonth()]++; } });
    mv.forEach(function (v) { mx = Math.max(mx, Math.abs(v)); });
    var lastM = S.e0 === lastDay ? new Date(lastDay * DAY).getUTCMonth() : 11;
    $('b-month').innerHTML = mv.map(function (v, i) {
      var k = mx ? Math.round(12 + 46 * Math.abs(v) / mx) : 0, bg = v > 0 ? 'color-mix(in srgb, var(--good) ' + k + '%, var(--field))' : v < 0 ? 'color-mix(in srgb, var(--crit) ' + k + '%, var(--field))' : '';
      return '<div class="mt' + (i > lastM ? ' fut' : '') + '"' + (bg ? ' style="background:' + bg + '"' : '') + '><span>' + MOIS_C[i] + '</span><b class="' + (v > 0 ? 'pos' : v < 0 ? 'neg' : '') + '">' +
        (i > lastM ? '' : mn[i] ? sUsd(v) : '—') + '</b><small>' + (i > lastM ? 'à venir' : mn[i] ? mn[i] + ' trade' + (mn[i] > 1 ? 's' : '') : 'aucun') + '</small></div>';
    }).join('');

    /* 7. S&P 500 et Nasdaq-100 */
    var idxs = ['spx', 'ndx'].map(function (k) {
      var c = closed.filter(function (t) { return t.k === k; }), tt = 0, g = 0, w = 0;
      c.forEach(function (t) { tt += money(t); g += t.gross; if (t.net > 0) w++; });
      return { k: k, n: c.length, tot: tt, w: w, g: c.length ? g / c.length : 0 };
    }), imx = Math.max(1, Math.abs(idxs[0].tot), Math.abs(idxs[1].tot));
    $('b-idx').innerHTML = '<div class="b-h"><h2>S&amp;P 500 et Nasdaq-100</h2><span class="muted">qui a rapporté quoi</span></div>' + idxs.map(function (x) {
      return '<div class="bi"><div class="bi-h"><b>' + IDX[x.k].name + '</b><b class="' + (x.tot >= 0 ? 'pos' : 'neg') + '">' + sUsd(x.tot) + '</b></div>' +
        '<div class="bi-t"><i class="' + (x.tot >= 0 ? 'g' : 'l') + '" style="width:' + (Math.abs(x.tot) / imx * 100).toFixed(1) + '%"></i></div>' +
        '<small>' + x.n + ' trade' + (x.n > 1 ? 's' : '') + (x.n ? ' · ' + Math.round(x.w / x.n * 100) + ' % gagnants · ' + pct(x.g, 2) + ' en moyenne sur l’indice' : '') + '</small></div>';
    }).join('');

    /* 8. la regle face a « acheter et garder » */
    var rows = [['La règle, sur ton compte', S.cum, 'g'], ['Garder le S&P 500', S.hold.spx, 'n'], ['Garder le Nasdaq-100', S.hold.ndx, 'n']].filter(function (r) { return r[1] !== null; });
    var vmx = Math.max.apply(null, rows.map(function (r) { return Math.abs(r[1]); }).concat([0.01]));
    $('b-vs').innerHTML = '<div class="b-h"><h2>Face à « acheter et garder »</h2><span class="muted">' + byear + '</span></div>' + rows.map(function (r) {
      return '<div class="bv"><span>' + r[0] + '</span><div class="bv-t"><i class="' + (r[1] < 0 ? 'l' : r[2]) + '" style="width:' + (Math.abs(r[1]) / vmx * 100).toFixed(1) + '%"></i></div><b class="' + (r[1] >= 0 ? 'pos' : 'neg') + '">' + pct(r[1], 1) + '</b></div>';
    }).join('') + '<p class="muted">La règle n’était en position que ' + Math.round(S.inMkt * 100) + ' % des jours. Garder un indice toute l’année n’est pas jouable chez une prop firm : une forte baisse ferait sauter la limite de perte.</p>';

    /* details : trades et journal du compte */
    $('b-list-title').textContent = 'Les ' + S.T.length + ' trade' + (S.T.length > 1 ? 's' : '') + ' de ' + byear;
    $('b-list').innerHTML = S.T.length ? S.T.slice().reverse().map(function (t) {
      var I = IDX[t.k], end = t.open ? I.days[I.days.length - 1] : t.x, v = money(t);
      return '<div class="trow"><span class="side ' + (t.open ? 'none' : v >= 0 ? 'buy' : 'out') + '">' + (t.k === 'spx' ? 'S&P' : 'NDX') + '</span><span class="rm"><b>' + shortDay(t.e) + ' → ' + (t.open ? 'en cours' : shortDay(t.x)) + '</b>' +
        '<small>' + jours(end - t.e) + ' · ' + px(t.pe) + ' → ' + px(t.open ? I.c[I.c.length - 1] : t.px) + ' · taille ' + levTxt(t.lev) + '</small></span><span class="rr"><b class="' + (v >= 0 ? 'pos' : 'neg') + '">' + sUsd(v) + (t.open ? ' *' : '') + '</b><small>indice ' + pct(t.gross) + '</small></span></div>';
    }).join('') + (nOpen ? '<p class="muted">* trade encore ouvert, au dernier prix de fin de journée.</p>' : '') : '<p class="empty">Aucun signal sur la période.</p>';
    $('b-timeline').innerHTML = S.sim.ev.map(function (e) { return '<li><time>' + shortDay(e[0]) + '</time><span class="' + e[2] + '">' + esc(e[1]) + '</span></li>'; }).join('');
  }

  function renderAll() {
    if (!A.spx) return;
    renderBord(); renderOrdres(); renderCompte(); renderJournal(); renderBilan(); if (!$('v-graph').hidden) renderGraph();
  }

  /* ---------- navigation ---------- */
  var VIEWS = ['bord', 'ordres', 'graph', 'compte', 'journal', 'regle'];
  function show(v) {
    if (VIEWS.indexOf(v) < 0) v = 'bord';
    VIEWS.forEach(function (k) { $('v-' + k).hidden = k !== v; });
    document.querySelectorAll('.nav button').forEach(function (b) { if (b.dataset.v === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    if (sheetId) closeSheet();
    $('title').textContent = $('v-' + v).dataset.title;
    store.set('tab', v); window.scrollTo(0, 0);
    if (A.spx) { if (v === 'bord') renderBord(); if (v === 'journal') renderJournal(); if (v === 'regle') renderBilan(); if (v === 'ordres') renderOrdres(); if (v === 'graph') renderGraph(); }
  }
  document.querySelectorAll('.nav button').forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.v); }); });
  document.addEventListener('click', function (ev) {
    var go = ev.target.closest('[data-go]'); if (go) { show(go.dataset.go); return; }
    var cj = ev.target.closest('[data-closej]');
    if (cj) { var tj = trades.filter(function (t) { return t.id === cj.dataset.closej; })[0], pj = tj && plan(tj.idx).trade;
      if (tj) { closeSheet(); show('journal'); fillForm(Object.assign({}, tj, { d2: pj && pj.exitDay ? ds(pj.exitDay) : ds(parisToday()), p2: pj && pj.cur ? Math.round(pj.cur * 100) / 100 : '' }));
        $('j-form-title').textContent = 'Noter la sortie (corrige le prix avec celui de MT5)'; $('j-form-title').scrollIntoView({ block: 'center' }); } return; }
    var jn = ev.target.closest('[data-jnote]');
    if (jn) { var q = jn.dataset.jnote.split('|'), pq = Math.round(+q[1] * 100) / 100; closeSheet(); show('journal');
      fillForm({ id: '', idx: q[0], kind: 'regle', d1: q[2], p1: pq, lots: lotsFor(q[0], pq).lots }); $('j-id').value = ''; $('j-cancel').hidden = false;
      $('j-form-title').textContent = 'Noter l\'entrée (corrige le prix avec celui de MT5)'; $('j-form-title').scrollIntoView({ block: 'center' }); return; }
    var ot = ev.target.closest('[data-otab]'); if (ot) { otab = ot.dataset.otab; store.set('otab', otab); renderTrades(); return; }
    var sh = ev.target.closest('[data-sheet]'); if (sh) { openSheet(sh.dataset.sheet); return; }
    if (ev.target.closest('[data-close]')) { closeSheet(); return; }
    var ed = ev.target.closest('[data-edit]'); if (ed) { fillForm(trades.filter(function (t) { return t.id === ed.dataset.edit; })[0]); $('j-form-title').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    var del = ev.target.closest('[data-del]');
    if (del && confirm('Supprimer ce trade du journal ?')) { trades = trades.filter(function (t) { return t.id !== del.dataset.del; }); store.set('trades', trades); renderAll(); }
  });
  document.addEventListener('input', function (ev) {
    var k = ev.target.dataset && ev.target.dataset.manual; if (!k) return;
    var v = parseFloat(String(ev.target.value).replace(',', '.'));
    manual[k] = v > 0 ? { p: v, day: session, at: nowMs() } : null; store.set('manual', manual);
    clearTimeout(ev.target._t); ev.target._t = setTimeout(function () { renderOrdres(); renderIdxCard(k); var el = document.querySelector('#sheet [data-manual="' + k + '"]') || document.querySelector('[data-manual="' + k + '"]'); if (el) el.focus(); }, 500);
  });

  document.addEventListener('click', function (ev) { var yb = ev.target.closest('[data-byear]'); if (yb) { byear = +yb.dataset.byear; store.set('year', byear); renderBilan(); } });

  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && sheetId) closeSheet(); });

  /* ---------- notifications (Web Push) ---------- */
  var VAPID_PUBLIC = 'BFmwNDj1FMgi5tM-exLZt8N3Pcx7ZsaHuzQvqVaLdN6NhjPLTTEXDIRk7Q6-XSgzjpiUnaeKSpKfSHeRQyy_ue8';
  function b64u(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function nStatus(m) { $('n-status').textContent = m; }
  function showSub(sub) { $('n-sub').value = JSON.stringify(sub); $('n-code').hidden = false; }
  (function initNotif() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      nStatus('Sur iPhone : ouvre Repli depuis son icône sur l\'écran d\'accueil (iOS 16.4 ou plus récent).'); $('n-on').disabled = true; return;
    }
    navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
      if (sub && Notification.permission === 'granted') { nStatus('Notifications activées sur cet appareil.'); showSub(sub); $('n-on').textContent = 'Réafficher le code'; }
    }).catch(function () { /* pas de service worker actif */ });
  })();
  $('n-on').addEventListener('click', function () {
    Notification.requestPermission().then(function (p) {
      if (p !== 'granted') { nStatus('Autorisation refusée. Pour la rétablir : Réglages de l\'iPhone → Notifications → Repli.'); throw 0; }
      return navigator.serviceWorker.ready;
    }).then(function (reg) {
      return reg.pushManager.getSubscription().then(function (s) { return s || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(VAPID_PUBLIC) }); });
    }).then(function (sub) { nStatus('Activé. Copie le code ci-dessous et envoie-le-moi pour terminer le réglage.'); showSub(sub); $('n-on').textContent = 'Réafficher le code'; })
      .catch(function (e) { if (e !== 0) nStatus('Impossible d\'activer les notifications : ' + ((e && e.message) || e)); });
  });
  $('n-copy').addEventListener('click', function () {
    var txt = $('n-sub').value;
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { nStatus('Code copié. Colle-le dans la conversation.'); },
      function () { $('n-sub').select(); nStatus('Sélectionne le code et copie-le.'); });
  });


  /* ---------- onglet Graphique : bougies en direct (TradingView, CFD OANDA) ---------- */
  var TV = { spx: 'OANDA:SPX500USD', ndx: 'OANDA:NAS100USD' }, gidx = store.get('gidx', 'ndx'), gint = store.get('gint', 'D'), gShown = '';
  var gmode = store.get('gmode', 'trades');
  function rgba(hex, al) { hex = hex.replace('#', ''); if (hex.length === 3) hex = hex.replace(/./g, '$&$&'); var n = parseInt(hex, 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + al + ')'; }
  function loadLW(cb, box) {
    if (window.LightweightCharts) return cb();
    var sc = document.createElement('script');
    sc.src = 'https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js';
    sc.onload = cb; sc.onerror = function () { box.innerHTML = '<p class="empty" style="padding:16px">Graphique indisponible : vérifie ta connexion.</p>'; gShown = ''; };
    document.head.appendChild(sc);
  }
  /* bougies quotidiennes de l'indice + un dessin par trade (fleche LONG, rectangle entree -> sortie, fleche de sortie) */
  function drawTrades(box) {
    box.innerHTML = '';
    var css = getComputedStyle(document.documentElement), col = function (n) { return css.getPropertyValue(n).trim(); };
    var good = '#089981', crit = '#f23645', I = IDX[gidx], n = I.c.length, from = Math.max(0, n - 260), a = A[gidx];
    var chart = LightweightCharts.createChart(box, {
      autoSize: true, layout: { background: { type: 'solid', color: col('--card-solid') }, textColor: col('--ink-2'), fontSize: 11 },
      grid: { vertLines: { color: col('--grid') }, horzLines: { color: col('--grid') } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.08 } }, timeScale: { borderVisible: false, barSpacing: 9, rightOffset: 3 },
      crosshair: { mode: 0 },
      localization: { locale: 'fr-FR', priceFormatter: function (p) { return nf(p, 0); } }
    });
    var candles = [];
    for (var q = from; q < n; q++) candles.push({ time: ds(I.days[q]), open: I.o[q], high: I.h[q], low: I.l[q], close: I.c[q] });
    var markers = [];
    legs(null).filter(function (t) { return t.k === gidx && t.e >= I.days[from]; }).forEach(function (t) {
      var last = I.c[n - 1], val = t.open ? last : t.px, win = val >= t.pe, ie = I.days.indexOf(t.e), ix = t.open ? n - 1 : I.days.indexOf(t.x), data = [];
      for (var q = ie; q <= ix; q++) data.push({ time: ds(I.days[q]), value: val });
      var box2 = chart.addBaselineSeries({ baseValue: { type: 'price', price: t.pe }, topFillColor1: rgba(good, 0.28), topFillColor2: rgba(good, 0.28), bottomFillColor1: rgba(crit, 0.28), bottomFillColor2: rgba(crit, 0.28),
        topLineColor: 'rgba(0,0,0,0)', bottomLineColor: 'rgba(0,0,0,0)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      box2.setData(data);
      markers.push({ time: ds(t.e), position: 'belowBar', color: col('--s1'), shape: 'arrowUp', text: 'LONG' });
      if (!t.open) markers.push({ time: ds(t.x), position: 'aboveBar', color: win ? good : crit, shape: 'arrowDown', text: pct(t.gross) });
    });
    var TVG = '#089981', TVR = '#f23645';
    var cs = chart.addCandlestickSeries({ upColor: TVG, downColor: TVR, borderUpColor: TVG, borderDownColor: TVR, wickUpColor: TVG, wickDownColor: TVR, priceLineVisible: false });
    cs.setData(candles);
    markers.sort(function (x, y) { return x.time < y.time ? -1 : x.time > y.time ? 1 : 0; });
    cs.setMarkers(markers);
    if (a.mode === 'pos') {
      cs.createPriceLine({ price: a.entry, color: col('--ink-3'), lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'entrée' });
      cs.createPriceLine({ price: a.Y, color: good, lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: 'sortie ce soir' });
      if (cfg.phase == 3) cs.createPriceLine({ price: a.entry * (1 - stopFor(levAt(gidx, a.e))), color: crit, lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: 'stop' });
    } else if (a.possible) {
      cs.createPriceLine({ price: a.X, color: col('--accent'), lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: 'entrée ce soir' });
    }
    var span = box.clientWidth < 520 ? 50 : 90;
    chart.timeScale().setVisibleLogicalRange({ from: candles.length - span, to: candles.length + 3 });
  }
  function renderGraph(force) {
    document.querySelectorAll('[data-gidx]').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.gidx === gidx); });
    document.querySelectorAll('[data-gint]').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.gint === gint); });
    if (A.spx) {
      var o = plan(gidx), a = o.a, V = VERBS[ladder(o).verb], lvl;
      if (o.trade && !o.trade.hit) lvl = a.forced ? 'Dernier jour : sortir à 22 h' : 'Sortie si &gt; <b>' + px(a.Y) + '</b> à 22 h';
      else if (!o.trade && a.possible) lvl = 'Entrée si &lt; <b>' + px(a.X) + '</b> à 22 h';
      else lvl = 'Pas d\'entrée ce soir';
      $('g-status').innerHTML = '<div class="g-line">' + chip(ico(V[0]) + ' ' + V[1], V[2]) + '<span>' + lvl + '</span></div>';
    }
    document.querySelectorAll('[data-gmode]').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.gmode === gmode); });
    $('g-int').hidden = gmode !== 'live';
    var key = gmode + gidx + gint + (isDark() ? 'd' : 'l');
    if (key === gShown && !force) return;
    gShown = key;
    var box = $('g-tv');
    if (gmode === 'trades') { if (!A.spx) { gShown = ''; return; } box.innerHTML = ''; loadLW(function () { drawTrades(box); }, box); return; }
    box.innerHTML = '<div class="tradingview-widget-container" style="height:100%;width:100%"><div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div></div>';
    var sc = document.createElement('script');
    sc.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    sc.async = true;
    sc.text = JSON.stringify({ autosize: true, symbol: TV[gidx], interval: gint, timezone: 'Europe/Paris', theme: isDark() ? 'dark' : 'light', style: '1', locale: 'fr',
      allow_symbol_change: false, hide_side_toolbar: true, hide_volume: true, save_image: false, calendar: false, support_host: 'https://www.tradingview.com' });
    sc.onerror = function () { box.innerHTML = '<p class="empty" style="padding:16px">Graphique indisponible : vérifie ta connexion.</p>'; gShown = ''; };
    box.firstChild.appendChild(sc);
  }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-gidx]'); if (b) { gidx = b.dataset.gidx; store.set('gidx', gidx); renderGraph(); return; }
    b = ev.target.closest('[data-gint]'); if (b) { gint = b.dataset.gint; store.set('gint', gint); renderGraph(); }
    b = ev.target.closest('[data-gmode]'); if (b) { gmode = b.dataset.gmode; store.set('gmode', gmode); renderGraph(); }
  });


  /* ---------- prix en direct ----------
     Avec une cle Finnhub (gratuite) : SPY et QQQ en temps reel, convertis en niveau d'indice
     (indice d'hier soir x variation du fonds depuis hier soir). Sans cle : indices officiels via TradingView, differes de 10-15 min. */
  var LIVEQ = {}, PROV = store.get('prov', {}), fhKey = store.get('fhkey', ''), liveTimer = null, liveState = '';
  /* clotures recuperees en direct, collees a la suite des donnees du serveur seulement si les jours se suivent
     (PROV[k][jour] = barre) : la regle reste juste meme si la mise a jour du serveur a 1 ou 2 jours de retard */
  function applyProvisional() {
    var changed = false;
    Object.keys(PROV).forEach(function (k) {
      var I = IDX[k], add = false, d, p;
      if (!I.c) return;
      while ((p = PROV[k][d = nextTrading(I.days[I.days.length - 1])])) {
        I.c = I.c.concat([p.c]); I.o = I.o.concat([p.o]); I.h = I.h.concat([p.h]); I.l = I.l.concat([p.l]); I.days = I.days.concat([d]); I.prov = d; add = true;
      }
      if (add) { A[k] = analyze(k); changed = true; }
    });
    return changed;
  }
  var nyDayOf = function (t) { return dn(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t))); };
  var prevTrading = function (d) { d--; while (!isTrading(d)) d--; return d; };
  /* dernier jour de Bourse dont la cloture officielle est disponible (seance finie depuis au moins 16 minutes) */
  function lastClosedDay() { var t = Date.now(), d = nyDayOf(t); return isTrading(d) && t >= closeUTC(d) + 16 * 60000 ? d : prevTrading(d); }
  var HCOLS = [];
  for (var hq = 0; hq <= 2; hq++) ['close', 'open', 'high', 'low'].forEach(function (f) { HCOLS.push(f + '[' + hq + ']'); });
  /* lit les 3 dernieres barres quotidiennes (TradingView), retrouve celle qui correspond a la derniere cloture connue
     et garde les suivantes qui sont terminees */
  function fetchMissing() {
    return fetch('https://scanner.tradingview.com/america/scan', { method: 'POST', body: JSON.stringify({ symbols: { tickers: ['SP:SPX', 'NASDAQ:NDX'] }, columns: HCOLS }) })
      .then(function (r) { return r.json(); }).then(function (j) {
        var upto = lastClosedDay();
        (j.data || []).forEach(function (x) {
          var k = x.s === 'SP:SPX' ? 'spx' : 'ndx', I = IDX[k], lastC = I.c[I.c.length - 1], m = -1, i, d;
          var bar = function (q) { var v = x.d.slice(q * 4, q * 4 + 4); return v[0] > 0 ? { c: v[0], o: v[1] || v[0], h: Math.max(v[2] || 0, v[0]), l: Math.min(v[3] || v[0], v[0]) } : null; };
          for (i = 0; i <= 2 && m < 0; i++) { var b0 = bar(i); if (b0 && Math.abs(b0.c - lastC) < 0.03) m = i; }
          for (i = m - 1, d = I.days[I.days.length - 1]; i >= 0; i--) {
            d = nextTrading(d);
            var b = bar(i);
            if (d > upto || !b) break;                                // barre du jour pas encore terminee
            PROV[k] = PROV[k] || {}; PROV[k][d] = b;
          }
          Object.keys(PROV[k] || {}).forEach(function (q) { if (+q < upto - 60) delete PROV[k][q]; });
        });
        if (!qaFreeze) store.set('prov', PROV);                       // garde sur l'appareil : la suite des jours continue meme sans le serveur
        if (applyProvisional()) { stampText(); renderAll(); }
      });
  }
  function nySessionOpen() {
    var now = new Date(), p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hourCycle: 'h23', weekday: 'short' }).formatToParts(now);
    var g = function (t) { return (p.filter(function (x) { return x.type === t; })[0] || {}).value; };
    var mins = +g('hour') * 60 + +g('minute'), wd = g('weekday'), today = dn(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now));
    if (wd === 'Sat' || wd === 'Sun' || !isTrading(today)) return null;
    var close = EARLY.indexOf(ds(today)) >= 0 ? 13 * 60 : 16 * 60;
    return mins >= 9 * 60 + 30 && mins <= close + 5 ? today : null;
  }
  function pollLive() {
    if (!A.spx || document.visibilityState !== 'visible') return;
    if (!qaFreeze && Math.min(A.spx.last, A.ndx.last) < lastClosedDay()) fetchMissing().catch(function () { /* nouvel essai au prochain passage */ });
    var day = nySessionOpen();
    if (day === null) { liveState = 'Bourse de New York fermée : prix de la dernière clôture.'; renderLiveState(); return; }
    var done = function (msg) { liveState = msg; renderLiveState(); refreshLive(); };
    if (fhKey) {
      var get = function (sym) { return fetch('https://finnhub.io/api/v1/quote?symbol=' + sym + '&token=' + encodeURIComponent(fhKey)).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); };
      Promise.all([get('SPY'), get('QQQ')]).then(function (q) {
        [['spx', q[0]], ['ndx', q[1]]].forEach(function (x) {
          var k = x[0], v = x[1];
          if (v && v.c > 0 && v.pc > 0) LIVEQ[k] = { p: A[k].P * v.c / v.pc, at: Date.now(), t: v.t > 0 ? Math.min(v.t * 1000, Date.now()) : Date.now(), day: day, src: 'en direct ' + hm(Date.now()), delayed: false };
        });
        done('Prix en direct (Finnhub), mis à jour toutes les 20 secondes.');
      }).catch(function () { fhKey = ''; done('Clé Finnhub refusée : passage aux prix différés.'); });
    } else {
      fetch('https://scanner.tradingview.com/america/scan', { method: 'POST', body: JSON.stringify({ symbols: { tickers: ['SP:SPX', 'NASDAQ:NDX'] }, columns: ['close', 'update_mode'] }) })
        .then(function (r) { return r.json(); }).then(function (j) {
          (j.data || []).forEach(function (x) {
            var k = x.s === 'SP:SPX' ? 'spx' : 'ndx', delay = /(\d+)$/.exec(x.d[1] || '');
            var dsec = delay ? +delay[1] : 900;
            LIVEQ[k] = { p: x.d[0], at: Date.now(), t: Date.now() - dsec * 1000, day: day, src: 'différé ' + Math.round(dsec / 60) + ' min', delayed: true };
          });
          done('Prix différés de 10 à 15 minutes. Ajoute une clé Finnhub gratuite (Compte) pour le temps réel.');
        }).catch(function () { done('Prix du moment indisponibles : vérifie ta connexion.'); });
    }
  }
  function refreshLive() {
    var typing = document.activeElement && document.activeElement.tagName === 'INPUT';
    if (!$('v-bord').hidden) renderBord();
    if (!$('v-ordres').hidden && !typing) renderOrdres();
    if (!$('v-journal').hidden && !typing) renderTrades();
    if (!$('v-graph').hidden) renderGraph();
  }
  function stampText() {
    var last = Math.max(A.spx.last, A.ndx.last), prov = IDX.spx.prov || IDX.ndx.prov;
    $('stamp').textContent = 'Clôtures au ' + shortDay(last) + ' ' + new Date(last * DAY).getUTCFullYear() + (prov ? ' (récupérée en direct)' : '');
  }
  function renderLiveState() {
    var el = $('live-state'); if (el) el.textContent = liveState;
    var dot = $('live-dot'); if (dot) dot.className = 'live-dot' + (nySessionOpen() !== null ? (fhKey ? ' on' : ' slow') : '');
  }
  function startLive() { clearInterval(liveTimer); pollLive(); liveTimer = setInterval(pollLive, fhKey ? 20000 : 60000); }
  $('fh-save').addEventListener('click', function () {
    fhKey = $('fh-key').value.trim(); store.set('fhkey', fhKey); startLive();
  });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') pollLive(); });

  /* ---------- mode de test (adresse terminee par ?qa) : simuler un prix pour verifier chaque situation ---------- */
  if (/[?&]qa(&|$)/.test(location.search)) window.__qa = {
    A: A, IDX: IDX, plan: plan, ladder: ladder, levAt: levAt, levNow: levNow, legs: legs,
    jusqua: function (iso) { var lim = dn(iso); PROV = {}; qaFreeze = true; clearInterval(liveTimer); liveTimer = 1; Object.keys(IDX).forEach(function (k) { var I = IDX[k], n = I.days.filter(function (d) { return d <= lim; }).length;
      ['c', 'o', 'h', 'l', 'days'].forEach(function (f) { I[f] = I[f].slice(0, n); }); A[k] = analyze(k); }); LIVEQ = {}; renderAll(); return session; },
    prix: function (k, p, retardMin) { var d = retardMin || 0; LIVEQ[k] = { p: p, at: nowMs(), t: nowMs() - d * 60000, day: session, src: d ? 'différé ' + d + ' min' : 'test', delayed: d > 0 }; refreshLive(); return ladder(plan(k)).verb; },
    heure: function (iso) { qaShift = iso ? Date.parse(iso) - Date.now() : 0; renderAll(); return moment().ph; },
    moment: function () { return moment(); },
    rattrape: function () { return fetchMissing().then(function () { return [ds(A.spx.last), ds(A.ndx.last), A.ndx.mode]; }); }
  };

  /* ---------- theme clair / sombre ---------- */
  function isDark() {
    var t = document.documentElement.dataset.theme;
    return t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function applyTheme() {
    var dark = isDark();
    $('theme-btn').setAttribute('aria-label', dark ? 'Passer en thème clair' : 'Passer en thème sombre');
    $('theme-btn').title = dark ? 'Thème clair' : 'Thème sombre';
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) { m.setAttribute('content', dark ? '#0b1211' : '#eaf3ef'); });
  }
  $('theme-btn').addEventListener('click', function () {
    var next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next; store.set('theme', next); applyTheme(); if (!$('v-graph').hidden) renderGraph(true);
  });
  applyTheme();

  /* ---------- reglages ---------- */
  function loadCfg() {
    $('c-size').value = String(cfg.size); $('c-lev').value = cfg.dose ? 'dose' : String(cfg.lev); $('c-phase').value = String(cfg.phase); $('c-start').value = cfg.start || '';
    $('c-bal').value = cfg.bal || ''; $('c-ct-spx').value = cfg.ct.spx; $('c-ct-ndx').value = cfg.ct.ndx; $('c-step').value = cfg.step;
  }
  ['c-size', 'c-lev', 'c-phase', 'c-start', 'c-bal', 'c-ct-spx', 'c-ct-ndx', 'c-step'].forEach(function (id) {
    $(id).addEventListener('change', function () {
      cfg.size = +$('c-size').value; cfg.dose = $('c-lev').value === 'dose'; if (!cfg.dose) cfg.lev = +$('c-lev').value; cfg.phase = +$('c-phase').value; cfg.start = $('c-start').value; cfg.bal = $('c-bal').value;
      cfg.ct = { spx: +$('c-ct-spx').value || 1, ndx: +$('c-ct-ndx').value || 1 }; cfg.step = +$('c-step').value || 0.01;
      store.set('cfg', cfg); renderAll();
    });
  });

  /* ---------- journal : formulaire ---------- */
  $('j-save').addEventListener('click', function () {
    var num = function (id) { var v = parseFloat(String($(id).value).replace(',', '.')); return isNaN(v) ? null : v; };
    var t = { id: $('j-id').value || String(Date.now()), idx: $('j-idx').value, kind: $('j-kind').value, d1: $('j-d1').value, p1: num('j-p1'), lots: num('j-lots'),
      d2: $('j-d2').value || null, p2: num('j-p2'), fee: num('j-fee') || 0 };
    if (!t.d1 || !(t.p1 > 0) || !(t.lots > 0)) { alert('Indique au moins la date d\'achat, le prix et le nombre de lots.'); return; }
    if (t.d2 && !(t.p2 > 0)) { alert('Indique le prix de vente.'); return; }
    if (!t.d2) t.p2 = null;
    var prevT = trades.filter(function (x) { return x.id === t.id; })[0];
    t.ct = prevT && prevT.ct ? prevT.ct : (+cfg.ct[t.idx] || 10);
    trades = trades.filter(function (x) { return x.id !== t.id; }).concat([t]); store.set('trades', trades);
    fillForm(null); renderAll();
  });
  $('j-cancel').addEventListener('click', function () { fillForm(null); });
  $('j-export').addEventListener('click', function () {
    var txt = JSON.stringify({ cfg: cfg, trades: trades });
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { alert('Sauvegarde copiée. Colle-la dans une note pour la garder.'); },
      function () { prompt('Copie ce texte et garde-le :', txt); });
  });
  $('j-import').addEventListener('click', function () {
    var txt = prompt('Colle ici ta sauvegarde :'); if (!txt) return;
    try { var o = JSON.parse(txt); if (!Array.isArray(o.trades)) throw 0; trades = o.trades; cfg = Object.assign({}, DEF, o.cfg || {}); store.set('trades', trades); store.set('cfg', cfg); loadCfg(); renderAll(); alert('Sauvegarde restaurée.'); }
    catch (e) { alert('Ce texte n\'est pas une sauvegarde valide.'); }
  });

  /* ---------- demarrage ---------- */
  $('app-ver').textContent = 'Application Repli, ' + VERSION + '.';
  $('fh-key').value = fhKey;
  loadCfg(); fillForm(null); show(store.get('tab', 'bord'));
  var tr; window.addEventListener('resize', function () { clearTimeout(tr); tr = setTimeout(renderAll, 200); });

  function load() {
    if (qaFreeze) return Promise.resolve();                         // mode test : donnees figees
    return Promise.all([
      fetch('../data/market.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }),
      fetch('../data/live.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    ]).then(function (res) {
      var D = res[0]; LIVE = res[1];
      Object.keys(IDX).forEach(function (k) { var d = 0; IDX[k].prov = null; IDX[k].c = D.idx[k].c; IDX[k].l = D.idx[k].l || D.idx[k].c; IDX[k].o = D.idx[k].o || D.idx[k].c; IDX[k].h = D.idx[k].h || D.idx[k].c; IDX[k].days = D.idx[k].d.map(function (x) { d += x; return d; }); A[k] = analyze(k); });
      applyProvisional();
      stampText();
      renderAll();
      if (!liveTimer) startLive();
    }).catch(function () { $('stamp').textContent = 'Cours indisponibles : vérifie ta connexion puis rouvre l\'application.'; });
  }
  load();
  setInterval(function () { if (document.visibilityState === 'visible') load(); }, 5 * 60000);   // nouveaux releves pendant la soiree
  setInterval(function () {
    if (!A.spx) return;
    var typing = document.activeElement && document.activeElement.tagName === 'INPUT';
    if (!$('v-bord').hidden) renderBord();
    if (!$('v-ordres').hidden && !typing) renderOrdres();                // compte a rebours et passage d'une etape a l'autre
  }, 30000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') load(); });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('../sw.js', { scope: '../' }).catch(function () { /* hors ligne non disponible */ });
})();
