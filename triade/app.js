/* Triade : ordres du soir du moteur à trois branches (repli dosé, tendance sur 18 marchés, indices dosés) avec la règle
   FundedNext des 3 %, positions, trades, bilan et compte Stellar 1-Step simulé. Tout est calculé sur l'appareil (engine.js). */
(function () {
  'use strict';
  var E = window.TriadeEngine;
  var VERSION = 'version du 12/11 19:49';
  var $ = function (id) { return document.getElementById(id); };
  var DAY = 86400000;
  var MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  var MOIS_L = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  var nf = function (v, d) { return v.toLocaleString('fr-FR', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); };
  var usd = function (v, d) { return (v < 0 ? '−' : '') + nf(Math.abs(v), d || 0) + ' $'; };
  var sUsd = function (v) { return (v >= 0 ? '+' : '−') + nf(Math.abs(v), 0) + ' $'; };
  var pct = function (v, d) { return (v >= 0 ? '+' : '−') + nf(Math.abs(v * 100), d === undefined ? 1 : d) + ' %'; };
  var upct = function (v, d) { return nf(v * 100, d === undefined ? 1 : d) + ' %'; };
  var ds = function (d) { return new Date(d * DAY).toISOString().slice(0, 10); };
  var dn = function (s) { return Math.floor(Date.parse(s + 'T00:00:00Z') / DAY); };
  var shortDay = function (d) { var x = new Date(d * DAY); return x.getUTCDate() + ' ' + MOIS[x.getUTCMonth()]; };
  var longDay = function (d) { var x = new Date(d * DAY); return JOURS[x.getUTCDay()] + ' ' + x.getUTCDate() + ' ' + MOIS[x.getUTCMonth()]; };
  var fullDay = function (d) { var x = new Date(d * DAY); return x.getUTCDate() + ' ' + MOIS[x.getUTCMonth()] + ' ' + x.getUTCFullYear(); };
  var yearOf = function (d) { return new Date(d * DAY).getUTCFullYear(); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var sgn = function (v) { return v > 0 ? 1 : v < 0 ? -1 : 0; };

  /* icônes au trait (aucune emoji dans l'application) */
  var ICONS = {
    buy: '<path d="M7 17 17 7"/><path d="M9 7h8v8"/>',
    sell: '<path d="M7 7l10 10"/><path d="M17 9v8H9"/>',
    close: '<path d="M9 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3"/><path d="m15 16 4-4-4-4"/><path d="M19 12H9"/>',
    flip: '<path d="M4 8h13l-3-3"/><path d="M20 16H7l3 3"/>',
    stop: '<path d="M12 3 4.5 6v5.5c0 4.4 3.1 8.1 7.5 9.5 4.4-1.4 7.5-5.1 7.5-9.5V6z"/><path d="M9 12h6"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    cross: '<path d="m6.5 6.5 11 11M17.5 6.5l-11 11"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><path d="M12 16.3v.2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><path d="M12 7.8v.2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
    cash: '<path d="M15.5 8.5c-.6-1.2-1.9-2-3.5-2-2 0-3.5 1.1-3.5 2.6 0 3.5 7 1.9 7 5.4 0 1.5-1.5 2.6-3.5 2.6-1.6 0-3-.8-3.6-2"/><path d="M12 4.5v2M12 17.1v2.4"/>',
    cart: '<path d="M3.5 4.5h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h7.6a1.5 1.5 0 0 0 1.5-1.1l1.5-6.3H6.4"/><circle cx="9.5" cy="19.5" r="1.2"/><circle cx="16.5" cy="19.5" r="1.2"/>',
    flame: '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.4 2.4-5.4 3.6-8.3.4 1.9 1.4 3 2.6 3.6-.1-2.7.9-5.2 3.1-7.1-.2 3.1 4.7 5.5 4.7 11.8 0 3.6-3 6.2-7.5 6.2z"/>',
    sync: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16"/><path d="M20 20v-4h-4"/>',
    wave: '<path d="M3 12c2.5-5 5-5 7.5 0s5 5 7.5 0"/><path d="M18 12h3"/>',
    flat: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>'
  };
  var ico = function (n, cls) { return '<svg class="ico' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[n] || '') + '</svg>'; };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('triade:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('triade:' + k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } }
  };

  /* ---------- calendrier de la Bourse de New York (règles du NYSE, 2025 à 2045) ---------- */
  var HOLIDAYS = [], EARLY = [];
  (function () {
    var iso = function (t) { return new Date(t).toISOString().slice(0, 10); };
    var U = function (y, m, d) { return Date.UTC(y, m - 1, d); };
    var wd = function (y, m, d) { return new Date(U(y, m, d)).getUTCDay(); };
    var nth = function (y, m, w, n) { return U(y, m, 1 + (w - wd(y, m, 1) + 7) % 7 + 7 * (n - 1)); };
    var lastMon = function (y, m) { var t = U(y, m + 1, 0); return t - ((new Date(t).getUTCDay() + 6) % 7) * DAY; };
    var obs = function (y, m, d) { var w = wd(y, m, d); return U(y, m, d) + (w === 6 ? -DAY : w === 0 ? DAY : 0); };
    var easter = function (y) {
      var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
      var h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
      return U(y, Math.floor((h + l - 7 * m + 114) / 31), (h + l - 7 * m + 114) % 31 + 1);
    };
    for (var y = 2025; y <= 2045; y++) {
      if (wd(y, 1, 1) !== 6) HOLIDAYS.push(iso(obs(y, 1, 1)));
      [nth(y, 1, 1, 3), nth(y, 2, 1, 3), easter(y) - 2 * DAY, lastMon(y, 5), obs(y, 6, 19), obs(y, 7, 4), nth(y, 9, 1, 1), nth(y, 11, 4, 4), obs(y, 12, 25)]
        .forEach(function (t) { HOLIDAYS.push(iso(t)); });
      if (wd(y, 7, 4) >= 2 && wd(y, 7, 4) <= 5) EARLY.push(iso(U(y, 7, 3)));
      EARLY.push(iso(nth(y, 11, 4, 4) + DAY));
      if (wd(y, 12, 24) >= 1 && wd(y, 12, 24) <= 4) EARLY.push(iso(U(y, 12, 24)));
    }
  })();
  var isTrading = function (d) { var w = new Date(d * DAY).getUTCDay(); return w > 0 && w < 6 && HOLIDAYS.indexOf(ds(d)) < 0; };
  var nextTrading = function (d) { d++; while (!isTrading(d)) d++; return d; };
  var nyHour = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' });
  var nyYMD = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
  var parisHM = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
  var parisYMD = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });
  function closeUTC(d) {                                              // instant (ms) de la clôture de New York le jour d
    var target = EARLY.indexOf(ds(d)) >= 0 ? 13 : 16;
    for (var h = 15; h <= 23; h++) { var t = d * DAY + h * 3600000; if (+nyHour.format(new Date(t)) === target) return t; }
    return d * DAY + 21 * 3600000;
  }
  var openUTC = function (d) { return closeUTC(d) - (EARLY.indexOf(ds(d)) >= 0 ? 3.5 : 6.5) * 3600000; };
  var hm = function (t) { return parisHM.format(new Date(t)).replace(':', ' h '); };
  var qaShift = 0, nowMs = function () { return Date.now() + qaShift; };
  var nyToday = function () { return dn(nyYMD.format(new Date(nowMs()))); };
  var parisToday = function () { return dn(parisYMD.format(new Date(nowMs()))); };
  function dur(ms) { var mn = Math.max(1, Math.ceil(ms / 60000)); if (mn < 60) return mn + ' min'; var h = Math.floor(mn / 60); return h >= 36 ? Math.round(h / 24) + ' jours' : h + ' h ' + String(mn % 60).padStart(2, '0'); }

  /* ---------- marchés ---------- */
  var CODES = E.CODES, NI = CODES.length, IX = {};
  CODES.forEach(function (c, j) { IX[c] = j; });
  var MK = {
    SPX500: { n: 'S&P 500', f: 'idx', cur: 'USD', tv: 'SP:SPX' }, NDX100: { n: 'Nasdaq-100', f: 'idx', cur: 'USD', tv: 'NASDAQ:NDX' },
    US30: { n: 'Dow Jones', f: 'idx', cur: 'USD', tv: 'DJ:DJI' }, GER30: { n: 'DAX 40', f: 'idx', cur: 'EUR', tv: 'XETR:DAX' },
    UK100: { n: 'FTSE 100', f: 'idx', cur: 'GBP', tv: 'TVC:UKX' }, FRA40: { n: 'CAC 40', f: 'idx', cur: 'EUR', tv: 'EURONEXT:PX1' },
    AUS200: { n: 'ASX 200', f: 'idx', cur: 'AUD', tv: 'SP:XJO' }, HK50: { n: 'Hang Seng', f: 'idx', cur: 'HKD', tv: 'TVC:HSI' },
    JP225: { n: 'Nikkei 225', f: 'idx', cur: 'JPY', tv: 'TVC:NI225' },
    EURUSD: { n: 'Euro / dollar', f: 'fx', tv: 'FX_IDC:EURUSD', pip: 0.0001, d: 5 }, GBPUSD: { n: 'Livre / dollar', f: 'fx', tv: 'FX_IDC:GBPUSD', pip: 0.0001, d: 5 },
    USDJPY: { n: 'Dollar / yen', f: 'fx', tv: 'FX_IDC:USDJPY', pip: 0.01, d: 3, base: true }, AUDUSD: { n: 'Dollar australien', f: 'fx', tv: 'FX_IDC:AUDUSD', pip: 0.0001, d: 5 },
    USDCAD: { n: 'Dollar / canadien', f: 'fx', tv: 'FX_IDC:USDCAD', pip: 0.0001, d: 5, base: true }, USDCHF: { n: 'Dollar / franc suisse', f: 'fx', tv: 'FX_IDC:USDCHF', pip: 0.0001, d: 5, base: true },
    NZDUSD: { n: 'Dollar néo-zélandais', f: 'fx', tv: 'FX_IDC:NZDUSD', pip: 0.0001, d: 5 },
    XAUUSD: { n: 'Or', f: 'met', tv: 'COMEX:GC1!', spot: 'FX_IDC:XAUUSD', d: 2 }, XAGUSD: { n: 'Argent', f: 'met', tv: 'COMEX:SI1!', spot: 'TVC:SILVER', d: 3 }
  };
  var ORDER = ['SPX500', 'NDX100', 'US30', 'GER30', 'UK100', 'FRA40', 'AUS200', 'HK50', 'JP225', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'XAUUSD', 'XAGUSD'];
  var FAM = { idx: 'Indices', fx: 'Devises', met: 'Métaux' };
  var DEF_CT = {}; ORDER.forEach(function (c) { DEF_CT[c] = MK[c].f === 'idx' ? 10 : MK[c].f === 'fx' ? 100000 : c === 'XAUUSD' ? 100 : 5000; });
  var PRICE = { 6000: 65.99, 15000: 129.99, 25000: 219.99, 50000: 329.99, 100000: 569.99, 200000: 1099.99 };   // Stellar 1-Step, prix publics (nov. 2026)
  var cfg = store.get('cfg', null) || { size: 50000, swap: true, vol: 0.06, step: 0.01, ct: {} };
  if (!PRICE[cfg.size]) cfg.size = 50000;                           // ancien réglage Instant : passage au 1-Step 50 000 $
  ORDER.forEach(function (c) { if (!(cfg.ct[c] > 0)) cfg.ct[c] = DEF_CT[c]; });
  var fee = function () { return Math.round(PRICE[cfg.size] * (cfg.swap ? 1.1 : 1) * 100) / 100; };
  var BUDGET = 0.0285, CAP = 0.029, LIMIT = 0.03, TRIM = 0.0297, COST = 0.00015;
  /* étape du compte : pendant le challenge, volatilité visée 8 % (9e lot du labo) ; sur le compte financé, réglage choisi (6 % ou 4 %) */
  if (cfg.phase !== 'finance') cfg.phase = 'challenge';
  var CH_VOL = 0.08;
  var curVol = function () { return cfg.phase === 'challenge' ? CH_VOL : cfg.vol; };
  var engineOpts = function (v) { return { target: v || curVol(), band: true, cost: COST, budget: BUDGET, cap: CAP, riskFrom: 'entry' }; };
  function getRun(v) { S.runs = S.runs || {}; if (!S.runs[v]) S.runs[v] = E.run(S.D, engineOpts(v)); return S.runs[v]; }
  var pxf = function (code, v) {
    var m = MK[code];
    if (m.f === 'idx') return nf(v, v < 1000 ? 2 : 1);
    return nf(v, m.d);
  };

  /* ---------- état ---------- */
  var S = { D: null, off: null, prov: null, quotes: null, qTime: 0, qErr: false, updated: '', view: store.get('view', 'soir'), byear: store.get('byear', 2020), bmode: store.get('bmode', 'avec'), tyear: store.get('tyear', 0), tfam: 'all', tmax: 40, loadedAt: 0 };
  var done = store.get('done', {});

  /* ---------- données ---------- */
  function loadData() {
    return Promise.all(['../data/triade-histo.json', '../data/triade.json'].map(function (u) {
      return fetch(u, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(u); return r.json(); });
    })).then(function (files) {
      S.D = E.decode(files); S.updated = files[1].updated || files[0].updated; S.loadedAt = Date.now();
      S.runs = {}; S.off = getRun(curVol()); S.bil = null; S.prov = null;
    });
  }
  var TICKERS = (function () { var t = ['FX_IDC:USDHKD']; ORDER.forEach(function (c) { t.push(MK[c].tv); if (MK[c].spot) t.push(MK[c].spot); }); return t; })();
  function fetchQuotes() {
    if (S.qaQuotes) { S.quotes = S.qaQuotes; S.qTime = nowMs(); return Promise.resolve(); }
    return fetch('https://scanner.tradingview.com/global/scan', { method: 'POST', body: JSON.stringify({ symbols: { tickers: TICKERS }, columns: ['close', 'open', 'high', 'low', 'close[1]', 'close[2]'] }) })
      .then(function (r) { return r.json(); }).then(function (j) {
        var q = {};
        (j.data || []).forEach(function (x) { var d = x.d; if (d && d[0] > 0) q[x.s] = { c: d[0], o: d[1], h: d[2], l: d[3], c1: d[4], c2: d[5] }; });
        if (Object.keys(q).length < 15) throw new Error('cours incomplets');
        S.quotes = q; S.qTime = nowMs(); S.qErr = false;
      }).catch(function () { S.qErr = true; });
  }

  /* séance du moment construite avec les cours du moment, sur la base des derniers cours officiels */
  function liveRow() {
    var q = S.quotes; if (!q) return null;
    var row = {}, last = S.D.days.length - 1, ok = 0;
    ORDER.forEach(function (code) {
      var m = MK[code], x = q[m.tv], Lc = S.D.m[code].c[last];
      if (!x) return;
      var near = function (a, b) { return a > 0 && b > 0 && Math.abs(a / b - 1) < 0.0005; };
      if (m.f === 'idx') {
        if (near(x.c1, Lc) || (!near(x.c, Lc) && !near(x.c1, Lc) && Math.abs(x.c / Lc - 1) < 0.12 && !near(x.c2, x.c))) {
          row[code] = { o: x.o, h: x.h, l: x.l, c: x.c }; ok++;
        }                                                             // sinon : séance locale pas encore commencée (ou jour férié local) -> cours repris
      } else if (m.f === 'fx') {
        if (Math.abs(x.c / Lc - 1) < 0.1) { row[code] = { o: x.o, h: x.h, l: x.l, c: x.c }; ok++; }
      } else if (x.c1 > 0 && Math.abs(x.c / x.c1 - 1) < 0.15) {
        var k = Lc / x.c1;                                            // contrat à terme : variation du jour appliquée au dernier cours officiel
        row[code] = { o: x.o * k, h: x.h * k, l: x.l * k, c: x.c * k }; ok++;
      }
    });
    return ok >= 12 ? row : null;
  }

  /* où en est-on : séances manquantes, phase de la soirée */
  function moment() {
    var D = S.D, L = D.days[D.days.length - 1], today = nyToday(), t = nowMs(), m = { now: t, L: L, today: today, pend: [] };
    for (var d = nextTrading(L); d <= today; d = nextTrading(d)) m.pend.push(d);
    if (m.pend.length) {
      m.day = m.pend[m.pend.length - 1]; m.cl = closeUTC(m.day); m.win = m.cl - 20 * 60000;
      m.ph = m.day < today ? 'apres' : t < m.win ? 'jour' : t < m.cl ? 'fenetre' : 'apres';
      m.late = m.pend.length > 1;
    } else {
      m.day = L; m.cl = closeUTC(L);
      m.ph = L === today ? 'officiel' : 'repos';
    }
    m.next = m.ph === 'repos' || m.ph === 'officiel' ? nextTrading(Math.max(L, today)) : m.day;
    return m;
  }
  function currentRun(m) {
    if (!m.pend.length) return S.off;
    var row = liveRow();
    if (!row) return null;
    var key = m.pend.join(',') + '|' + S.qTime + '|' + curVol();
    if (S.prov && S.provKey === key) return S.prov;
    var extra = m.pend.map(function (d, i) { return i === m.pend.length - 1 ? row : null; });
    S.prov = E.run(S.D, Object.assign({ extra: extra }, engineOpts())); S.provKey = key;
    return S.prov;
  }
  var dayOf = function (run, t) { return t < S.D.days.length ? S.D.days[t] : S.mom.pend[t - S.D.days.length]; };

  /* ---------- lots ---------- */
  function vpl(run, code, t) {                                        // valeur d'un lot en dollars
    var c = run.C[IX[code]][t], ct = cfg.ct[code], m = MK[code];
    if (m.f === 'fx') return m.base ? ct : ct * c;
    if (m.f === 'met') return ct * c;
    var fx = { USD: 1, EUR: run.C[IX.EURUSD][t], GBP: run.C[IX.GBPUSD][t], AUD: run.C[IX.AUDUSD][t], JPY: 1 / run.C[IX.USDJPY][t],
      HKD: 1 / ((S.quotes && S.quotes['FX_IDC:USDHKD'] && S.quotes['FX_IDC:USDHKD'].c) || 7.8) }[m.cur];
    return ct * c * fx;
  }
  var roundStep = function (v) { var s = cfg.step; return Math.round(v / s + 1e-9) * s; };
  function lastReset(run, j, t) { var r = t; while (r > 0 && !run.RESET[j][r]) r--; return r; }
  function riskUnit(run, j, t) {                                      // perte si le stop est touché, par unité de position (depuis l'entrée)
    var h = run.HELD[j][t], e = run.ENTRY[j][t], rf = run.REF[j][t], d = run.DIST[j][t];
    if (!h || e !== e) return 0;
    var sl = h > 0 ? rf * (1 - d) : rf * (1 + d);
    return Math.max(0, (h > 0 ? e - sl : sl - e) / e);
  }
  function lotsAt(run, t) {
    run._lots = run._lots || {};
    if (run._lots[t]) return run._lots[t];
    var out = [], j;
    for (j = 0; j < NI; j++) {
      var h = run.HELD[j][t];
      if (!h || t < 1) { out.push(0); continue; }
      if (run.RESET[j][t]) out.push(sgn(h) * roundStep(Math.abs(h) * cfg.size / vpl(run, CODES[j], t)));
      else out.push(lotsAt(run, lastReset(run, j, t))[j]);
    }
    var risk = function () { var s = 0; for (var q = 0; q < NI; q++) if (out[q]) s += Math.abs(out[q]) * vpl(run, CODES[q], lastReset(run, q, t)) / cfg.size * riskUnit(run, q, t); return s; };
    var guard = 0, r0 = risk();
    while (r0 > TRIM && guard++ < 300) {                               // arrondi des lots : on retire un pas là où le risque est le plus gros (positions recalées ce soir)
      var best = -1, bv = 0;
      for (j = 0; j < NI; j++) if (out[j] && run.RESET[j][t]) { var v = Math.abs(out[j]) * vpl(run, CODES[j], t) * riskUnit(run, j, t); if (v > bv) { bv = v; best = j; } }
      if (best < 0) break;
      out[best] = sgn(out[best]) * Math.max(0, roundStep(Math.abs(out[best]) - cfg.step));
      r0 = risk();
    }
    run._lots[t] = out;
    run._risk = run._risk || {}; run._risk[t] = r0;
    return out;
  }
  function riskAt(run, t) { lotsAt(run, t); return run._risk[t]; }
  function stopOf(run, j, t) {
    var h = run.HELD[j][t], rf = run.REF[j][t], d = run.DIST[j][t], code = CODES[j], m = MK[code];
    var lvl = h > 0 ? rf * (1 - d) : rf * (1 + d), gap = rf * d;
    if (m.f === 'met' && S.quotes && S.quotes[m.spot] && S.quotes[m.tv]) lvl = lvl * S.quotes[m.spot].c / S.quotes[m.tv].c;
    var unit = m.f === 'fx' ? nf(gap / m.pip, 0) + ' pips' : m.f === 'met' ? nf(gap, 2) + ' $' : nf(gap, 1) + ' points';
    return { lvl: lvl, gap: gap, unit: unit, pct: d };
  }

  /* ordres du soir t : passage des lots d'hier soir aux lots de ce soir */
  function ordersAt(run, t) {
    var prev = lotsAt(run, t - 1), cur = lotsAt(run, t), out = [], notes = [];
    var hit = {}; run.events.forEach(function (e) { if (e.t === t && e.type === 'stop') hit[e.j] = e; });
    ORDER.forEach(function (code) {
      var j = IX[code], b = hit[j] ? 0 : prev[j], a = cur[j], o = { code: code, j: j, from: b, to: a };
      if (hit[j]) notes.push({ code: code, held: prev[j] });
      if (a === b) { if (a && run.RESET[j][t]) { o.type = 'stop'; out.push(o); } return; }
      if (!b) o.type = 'open';
      else if (!a) o.type = 'close';
      else if (sgn(a) !== sgn(b)) o.type = 'flip';
      else o.type = Math.abs(a) > Math.abs(b) ? 'add' : 'cut';
      out.push(o);
    });
    var rank = { close: 0, cut: 1, flip: 2, open: 3, add: 4, stop: 5 };
    out.sort(function (x, y) { return rank[x.type] - rank[y.type] || ORDER.indexOf(x.code) - ORDER.indexOf(y.code); });
    return { list: out, hits: notes };
  }

  /* ---------- vues ---------- */
  var TITLES = { soir: 'Ce soir', pos: 'Positions', trades: 'Trades', bilan: 'Bilan', compte: 'Compte' };
  function show(v) {
    if (!TITLES[v]) v = 'soir';
    S.view = v; store.set('view', v);
    document.querySelectorAll('.view').forEach(function (s) { s.hidden = s.id !== 'v-' + v; });
    document.querySelectorAll('.nav button').forEach(function (b) { if (b.dataset.v === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    $('title').textContent = TITLES[v];
    if (location.hash !== '#' + v) history.replaceState(null, '', '#' + v);
    render();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.nav button').forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.v); }); });

  function render() {
    if (!S.D) return;
    $('boot').hidden = true;
    var x = new Date(nowMs());
    $('today').textContent = JOURS[x.getDay()] + ' ' + x.getDate() + ' ' + MOIS_L[x.getMonth()];
    S.mom = moment();
    S.run = currentRun(S.mom);
    stamp();
    if (S.view === 'soir') renderSoir();
    else if (S.view === 'pos') renderPos();
    else if (S.view === 'bilan') renderBilan();
    else if (S.view === 'trades') renderTrades();
    else renderCompte();
  }
  function stamp() {
    var m = S.mom, live = m.pend.length && S.run && S.run !== S.off, dot = $('live-dot');
    dot.className = 'live-dot' + (live ? ' on' : S.qErr && m.pend.length ? ' warn' : '');
    $('stamp').textContent = live ? 'Cours du moment · ' + hm(S.qTime) : 'Clôture du ' + shortDay(S.D.days[S.D.days.length - 1]);
  }

  /* ---- Ce soir ---- */
  function nextRevision(run, t, day) {
    var k = 0; while ((run.g(t) + k) % 5 !== 0 || k === 0) k++;
    var d = day; for (var i = 0; i < k; i++) d = nextTrading(d);
    return { k: k, day: d };
  }
  function orderCard(run, t, o, dkey) {
    var m = MK[o.code], j = o.j, st = run.HELD[j][t] ? stopOf(run, j, t) : null, a = Math.abs(o.to), b = Math.abs(o.from);
    var lots = function (v) { return nf(v, cfg.step < 0.1 ? 2 : 1) + ' lot' + (v >= 2 ? 's' : ''); };
    var dir = o.to > 0 || (!o.to && o.from < 0) ? 'Achat' : 'Vente';
    var cls, icon, title, l2;
    if (o.type === 'open') { cls = o.to > 0 ? 'buy' : 'sell'; icon = cls; title = (o.to > 0 ? 'Acheter ' : 'Vendre ') + lots(a); l2 = 'Nouvelle position ' + (o.to > 0 ? 'acheteuse' : 'vendeuse'); }
    else if (o.type === 'close') { cls = 'close'; icon = 'close'; title = 'Fermer la position'; l2 = (o.from > 0 ? 'Position acheteuse' : 'Position vendeuse') + ' de ' + lots(b) + ' : croix sur la ligne dans MT5'; }
    else if (o.type === 'flip') { cls = o.to > 0 ? 'buy' : 'sell'; icon = 'flip'; title = 'Retourner : ' + (o.to > 0 ? 'acheteur ' : 'vendeur ') + lots(a); l2 = 'Fermer les ' + lots(b) + ' ' + (o.from > 0 ? 'achetés' : 'vendus') + ', puis ' + (o.to > 0 ? 'acheter ' : 'vendre ') + lots(a); }
    else if (o.type === 'add') { cls = o.to > 0 ? 'buy' : 'sell'; icon = cls; title = (o.to > 0 ? 'Acheter ' : 'Vendre ') + lots(roundStep(a - b)) + ' de plus'; l2 = 'Position portée de ' + lots(b) + ' à ' + lots(a); }
    else if (o.type === 'cut') { cls = 'close'; icon = 'close'; title = 'Alléger de ' + lots(roundStep(b - a)); l2 = 'Fermer une partie : position ramenée de ' + lots(b) + ' à ' + lots(a); }
    else { cls = 'stop'; icon = 'stop'; title = 'Déplacer le stop'; l2 = (o.to > 0 ? 'Position acheteuse' : 'Position vendeuse') + ' de ' + lots(a) + ' gardée'; }
    var l3 = st ? 'Stop ' + (o.type === 'close' ? '' : '<b>' + pxf(o.code, st.lvl) + '</b> · à ' + st.unit + ' (' + upct(st.pct, 2) + ') du prix') : '';
    if (o.type === 'close') l3 = '';
    var key = dkey + ':' + o.code, isDone = !!done[key];
    return '<div class="ord ' + cls + (isDone ? ' done' : '') + '"><div class="tag">' + ico(icon) + '</div><div class="what">' +
      '<div class="l1">' + esc(title) + ' <span class="sym">' + o.code + '</span></div>' +
      '<div class="l2">' + esc(m.n) + ' · ' + esc(l2) + '</div>' + (l3 ? '<div class="l3">' + l3 + '</div>' : '') + '</div>' +
      '<button class="check" data-done="' + key + '" aria-label="' + (isDone ? 'Marquer comme non fait' : 'Marquer comme fait') + '" aria-pressed="' + isDone + '">' + ico('check') + '</button></div>';
  }
  function renderSoir() {
    var m = S.mom, run = S.run;
    if (!run) {                                                       // séance en cours mais cours du moment indisponibles
      $('s-hero').innerHTML = '<h3>' + longDay(m.day) + '</h3><div class="big">' + (S.qErr ? 'Cours du moment indisponibles' : 'Chargement des cours du moment…') + '</div><p>' + (S.qErr ? 'Les ordres de ce soir s\'afficheront dès que les cours arriveront (nouvel essai chaque minute). ' : '') + 'Vos positions et leurs stops restent valables.</p>' +
        '<div class="chips"><span class="chip">' + ico('clock') + 'Clôture à ' + hm(m.cl) + '</span></div>';
      $('s-risk').innerHTML = '<div class="empty">' + ico('sync') + 'En attente des cours…</div>'; $('s-orders').innerHTML = '<div class="empty">' + ico('sync') + 'En attente des cours…</div>'; $('s-info').innerHTML = '';
      return;
    }
    var t = run.T - 1, day = dayOf(run, t), od = ordersAt(run, t), n = od.list.length, dkey = ds(day);
    var rev = run.isRevision(t), nr = nextRevision(run, t, day), nd = od.list.filter(function (o) { return done[dkey + ':' + o.code]; }).length;
    var big, sub, chips = [];
    var cnt = function (k) { return k === 0 ? 'Rien à faire' : k + ' ordre' + (k > 1 ? 's' : ''); };
    if (m.ph === 'jour') {
      big = n ? 'Ce soir : ' + cnt(n) + ' à passer' : 'Ce soir : rien à faire';
      sub = 'Aperçu avec les cours du moment (différés de 10 à 20 min) : la liste peut encore changer. Ordres définitifs à partir de ' + hm(m.win) + ', à passer avant ' + hm(m.cl) + '.';
      chips.push('<span class="chip">' + ico('clock') + 'Dans ' + dur(m.win - m.now) + '</span>');
    } else if (m.ph === 'fenetre') {
      big = n ? 'C\'est l\'heure : ' + cnt(n) : 'C\'est l\'heure : rien à faire';
      sub = n ? 'Passez ces ordres sur MT5 avec leur stop avant ' + hm(m.cl) + ' (clôture de New York), puis cochez-les.' : 'Aucune position à changer ce soir. Les stops en place restent valables.';
      chips.push('<span class="chip">' + ico('clock') + 'Clôture dans ' + dur(m.cl - m.now) + '</span>');
    } else if (m.ph === 'apres') {
      big = n ? 'Clôture passée : ' + cnt(n) : 'Clôture passée : rien à faire';
      sub = n ? 'Si ce n\'est pas fait, passez-les maintenant : les CFD restent ouverts jusqu\'à 23 h environ. Les cours officiels arrivent dans la soirée et confirment la liste.' : 'Rien à changer ce soir. Les cours officiels arrivent dans la soirée.';
    } else if (m.ph === 'officiel') {
      big = n ? 'Ordres du soir : ' + cnt(n) : 'Ce soir : rien à faire';
      sub = 'Calculés avec les cours de clôture officiels. ' + (n ? 'S\'ils sont passés, rien d\'autre à faire jusqu\'à la prochaine séance (' + longDay(m.next) + ').' : 'Prochaine séance : ' + longDay(m.next) + '.');
    } else {
      big = 'Pas de séance aujourd\'hui';
      sub = 'Prochaine séance : ' + longDay(m.next) + ', ordres à passer avant ' + hm(closeUTC(m.next)) + '. Ci-dessous, les ordres du dernier soir (' + longDay(day) + ') : vérifiez qu\'ils ont bien été passés.';
    }
    chips.unshift('<span class="chip">' + ico(cfg.phase === 'challenge' ? 'flag' : 'check') + (cfg.phase === 'challenge' ? 'Challenge · volatilité 8 %' : 'Compte financé · volatilité ' + upct(cfg.vol, 0)) + '</span>');
    if (rev) chips.push('<span class="chip">' + ico('sync') + 'Soir de révision : tous les stops replacés</span>');
    else chips.push('<span class="chip">' + ico('sync') + 'Révision ' + (nr.k === 1 ? 'au prochain soir' : 'dans ' + nr.k + ' séances') + ' (' + shortDay(nr.day) + ')</span>');
    if (m.late) chips.push('<span class="chip">' + ico('alert') + 'Cours officiels en retard</span>');
    $('s-hero').innerHTML = '<div class="card-head"><h3>' + (m.ph === 'repos' ? 'Dernier soir · ' + longDay(day) : longDay(day)) + '</h3><span class="tri" aria-hidden="true"><i></i><i></i><i></i></span></div>' +
      '<div class="big">' + esc(big) + '</div><p>' + esc(sub) + '</p><div class="chips">' + chips.join('') + '</div>';

    // jauge de risque
    var rk = riskAt(run, t), lots = lotsAt(run, t), npos = lots.filter(function (v) { return v; }).length, gross = 0;
    var dr = 0;                                                         // perte du jour si tous les stops sont touchés, depuis le cours de ce soir
    lots.forEach(function (v, j) {
      if (!v) return;
      var val = Math.abs(v) * vpl(run, CODES[j], lastReset(run, j, t)), c = run.C[j][t], rf = run.REF[j][t], d = run.DIST[j][t], sl = v > 0 ? rf * (1 - d) : rf * (1 + d);
      gross += val; dr += val / cfg.size * Math.max(0, (v > 0 ? c - sl : sl - c) / c);
    });
    var frac = Math.min(1, rk / LIMIT), arc = function (f) { var a = Math.PI * (1 - f); return [100 + 80 * Math.cos(a), 100 - 80 * Math.sin(a)]; }, p1 = arc(frac);
    var col = rk > LIMIT ? 'var(--crit)' : rk > 0.0295 ? 'var(--warn)' : 'var(--accent)';
    $('s-risk').innerHTML = '<div class="card-head"><h2>Risque engagé</h2><span class="small">plafond FundedNext 3 %</span></div>' +
      '<div class="gauge"><svg viewBox="0 0 200 112" aria-hidden="true"><path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="var(--field)" stroke-width="14" stroke-linecap="round"/>' +
      (frac > 0.005 ? '<path d="M20 100 A80 80 0 0 1 ' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1) + '" fill="none" stroke="' + col + '" stroke-width="14" stroke-linecap="round"/>' : '') + '</svg>' +
      '<div class="v">' + upct(rk, 2) + '</div><div class="l">du compte si tous les stops sont touchés</div></div>' +
      '<dl class="rows"><div><dt>Perte maximale</dt><dd>' + usd(rk * cfg.size) + '</dd></div><div><dt>Si tout touche son stop demain</dt><dd class="' + (dr > 0.03 ? 'neg' : '') + '">' + upct(dr, 2) + ' <span class="small">(limite du jour 3 %)</span></dd></div><div><dt>Positions ouvertes</dt><dd>' + npos + ' sur 18</dd></div>' +
      '<div><dt>Exposition</dt><dd>' + nf(gross / cfg.size, 2) + ' fois le compte</dd></div></dl>';

    // ordres
    var head = '<div class="card-head"><h2>' + (m.ph === 'repos' ? 'Ordres du ' + longDay(day) : 'Ordres à passer') + '</h2>' + (n ? '<span class="small">' + nd + ' sur ' + n + ' fait' + (nd > 1 ? 's' : '') + '</span>' : '') + '</div>';
    var body = n ? '<div class="orders">' + od.list.map(function (o) { return orderCard(run, t, o, dkey); }).join('') + '</div><div class="prog"><i style="width:' + (nd / n * 100).toFixed(0) + '%"></i></div>'
      : '<div class="empty">' + ico('check') + '<span>Aucun ordre ce soir. Les positions et leurs stops restent en place.</span></div>';
    $('s-orders').innerHTML = head + body;

    // informations utiles
    var notes = [];
    od.hits.forEach(function (h) {
      notes.push(['warn', 'stop', '<b>' + h.code + ' : stop touché aujourd\'hui.</b> MT5 a fermé la position. ' + (lots[IX[h.code]] ? 'Le soir de révision la relance (voir les ordres).' : 'Elle reste fermée jusqu\'à la prochaine révision (' + longDay(nr.day) + ').')]);
    });
    if (cfg.phaseSince && dn(cfg.phaseSince) >= day - 7) notes.push(['warn', 'alert', cfg.phase === 'finance'
      ? '<b>Nouveau compte financé :</b> il démarre vide. Ouvrez toutes les positions de l\'onglet Positions avec leurs stops, puis suivez les ordres du soir.'
      : '<b>Nouveau challenge :</b> il démarre vide. Ouvrez toutes les positions de l\'onglet Positions avec leurs stops, puis suivez les ordres du soir.']);
    if (rev) notes.push(['', 'sync', '<b>Soir de révision.</b> Le suivi de tendance revoit ses 18 marchés et tous les stops sont replacés depuis le cours de ce soir. Les positions dont la taille ne change pas n\'ont qu\'un stop à déplacer.']);
    var zero = []; ORDER.forEach(function (c) { var j = IX[c]; if (run.HELD[j][t] && !lots[j]) zero.push(c); });
    if (zero.length) notes.push(['', 'info', '<b>Trop petit pour ce compte :</b> ' + zero.join(', ') + '. La position voulue fait moins d\'un demi-pas de ' + nf(cfg.step, 2) + ' lot : elle est laissée de côté.']);
    if (m.late) notes.push(['warn', 'alert', '<b>Cours officiels en retard</b> (dernier : ' + longDay(m.L) + '). Les ordres sont calculés avec les cours du moment ; ils seront confirmés à l\'arrivée des cours officiels.']);
    if (m.pend.length && !S.quotes) notes.push(['warn', 'alert', '<b>Cours du moment indisponibles.</b> Nouvel essai chaque minute.']);
    var cl = closeUTC(m.next), early = EARLY.indexOf(ds(m.next)) >= 0;
    if (hm(cl) !== '22 h 00') notes.push([early ? 'warn' : '', 'clock', '<b>Clôture de New York à ' + hm(cl) + '</b> (heure de Paris) le ' + longDay(m.next) + (early ? ' : séance courte.' : ' : décalage d\'heure d\'été entre l\'Europe et les États-Unis.')]);
    for (var d = m.next + 1, k = 0; k < 7; d++, k++) {
      var w = new Date(d * DAY).getUTCDay();
      if (w > 0 && w < 6 && HOLIDAYS.indexOf(ds(d)) >= 0) { notes.push(['', 'info', '<b>Bourse de New York fermée le ' + longDay(d) + '.</b> Pas d\'ordre ce soir-là ; les positions restent en place.']); break; }
    }
    notes.push(['', 'info', 'Chaque ordre se passe <b>au marché</b> sur MT5 avec son <b>stop</b> (niveau indiqué, ou la distance depuis votre prix d\'exécution). Les cours affichés sont ceux des marchés au comptant ; ceux de MT5 peuvent différer un peu.']);
    $('s-info').innerHTML = '<h2>À savoir ce soir</h2><ul class="notes">' + notes.map(function (x) { return '<li class="' + x[0] + '">' + ico(x[1]) + '<span>' + x[2] + '</span></li>'; }).join('') + '</ul>';
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-done]');
    if (!b) return;
    var k = b.dataset.done;
    if (done[k]) delete done[k]; else done[k] = 1;
    var keep = {}, lim = ds(parisToday() - 40);                       // on oublie les coches de plus de 40 jours
    Object.keys(done).forEach(function (x) { if (x.slice(0, 10) >= lim) keep[x] = 1; });
    done = keep; store.set('done', done); render();
  });

  /* ---- Positions ---- */
  function renderPos() {
    var run = S.run || S.off, t = run.T - 1, lots = lotsAt(run, t), day = dayOf(run, t), rows = [], tot = { risk: 0, pnl: 0, gross: 0, n: 0, long: 0, short: 0 };
    var fam = { idx: [0, 0], fx: [0, 0], met: [0, 0] };
    ORDER.forEach(function (code) {
      var j = IX[code], v = lots[j];
      if (!v) { if (run.STOPPED[j][t]) rows.push({ code: code, flat: 'stop' }); return; }
      var r = lastReset(run, j, t), val = Math.abs(v) * vpl(run, code, r), fr = val / cfg.size, st = stopOf(run, j, t);
      var risk = fr * riskUnit(run, j, t) * cfg.size, pnl = sgn(v) * fr * (run.C[j][t] / run.ENTRY[j][t] - 1) * cfg.size;
      rows.push({ code: code, v: v, st: st, risk: risk, pnl: pnl, val: val, since: r });
      tot.risk += risk; tot.pnl += pnl; tot.gross += val; tot.n++; if (v > 0) tot.long++; else tot.short++;
      fam[MK[code].f][v > 0 ? 0 : 1] += val / cfg.size;
    });
    var l2 = function (v) { return nf(Math.abs(v), cfg.step < 0.1 ? 2 : 1); };
    $('p-sum').innerHTML = '<div class="card-head"><h2>Après les ordres du ' + longDay(day) + '</h2><span class="small">' + (run === S.off ? 'cours officiels' : 'cours du moment') + '</span></div>' +
      '<div class="stat4 q4"><div><span>Positions</span><b>' + tot.n + '</b><small>' + tot.long + ' achat' + (tot.long > 1 ? 's' : '') + ', ' + tot.short + ' vente' + (tot.short > 1 ? 's' : '') + '</small></div>' +
      '<div><span>Exposition</span><b>' + nf(tot.gross / cfg.size, 2) + ' ×</b><small>' + usd(tot.gross) + '</small></div>' +
      '<div><span>Risque aux stops</span><b>' + upct(tot.risk / cfg.size, 2) + '</b><small>' + usd(tot.risk) + ' sur 3 % max</small></div>' +
      '<div><span>Latent (estimé)</span><b class="' + (tot.pnl >= 0 ? 'pos' : 'neg') + '">' + sUsd(tot.pnl) + '</b><small>depuis l\'entrée</small></div></div>';
    var tr = rows.map(function (x) {
      if (x.flat) return '<tr><td class="m"><b>' + x.code + '</b><span>' + esc(MK[x.code].n) + '</span></td><td><span class="side f">Stoppé</span></td><td colspan="5" style="text-align:left;color:var(--ink-3)">À plat jusqu\'à la prochaine révision</td></tr>';
      return '<tr><td class="m"><b>' + x.code + '</b><span>' + esc(MK[x.code].n) + '</span></td><td><span class="side ' + (x.v > 0 ? 'l">Achat' : 's">Vente') + '</span></td><td>' + l2(x.v) + '</td>' +
        '<td>' + pxf(x.code, x.st.lvl) + '</td><td>' + x.st.unit + '</td><td>' + usd(x.risk) + '</td><td class="' + (x.pnl >= 0 ? 'pos' : 'neg') + '">' + sUsd(x.pnl) + '</td></tr>';
    }).join('');
    var cards = rows.map(function (x) {
      if (x.flat) return '<div class="pc"><div class="h"><b>' + x.code + '</b><span class="side f">Stoppé</span></div><div class="small" style="margin-top:6px">À plat jusqu\'à la prochaine révision</div></div>';
      return '<div class="pc"><div class="h"><span><b>' + x.code + '</b> <span class="small">' + esc(MK[x.code].n) + '</span></span><span class="side ' + (x.v > 0 ? 'l">Achat ' : 's">Vente ') + l2(x.v) + '</span></div>' +
        '<div class="g"><div><span>Stop</span><b>' + pxf(x.code, x.st.lvl) + '</b></div><div><span>Risque</span><b>' + usd(x.risk) + '</b></div><div><span>Latent</span><b class="' + (x.pnl >= 0 ? 'pos' : 'neg') + '">' + sUsd(x.pnl) + '</b></div></div></div>';
    }).join('');
    $('p-list').innerHTML = '<h2>Positions et stops</h2>' + (rows.length ? '<div class="ptable-wrap scroll"><table class="ptable"><thead><tr><th>Marché</th><th>Sens</th><th>Lots</th><th>Stop</th><th>Distance</th><th>Risque</th><th>Latent</th></tr></thead><tbody>' + tr + '</tbody></table></div><div class="pcards">' + cards + '</div>'
      : '<div class="empty">' + ico('flat') + 'Aucune position.</div>') + '<p class="muted">Latent : estimation depuis le prix d\'entrée du moteur ; votre MT5 fait foi.</p>';
    var mx = Math.max(0.01, fam.idx[0] + fam.idx[1], fam.fx[0] + fam.fx[1], fam.met[0] + fam.met[1]);
    $('p-fam').innerHTML = '<h2>Exposition par famille</h2><div class="fam">' + ['idx', 'fx', 'met'].map(function (f) {
      var a = fam[f][0] / mx * 100, b = fam[f][1] / mx * 100;
      return '<div class="r"><span>' + FAM[f] + '</span><div class="bar"><i style="left:0;width:' + a.toFixed(1) + '%;background:var(--good)"></i><i style="left:' + a.toFixed(1) + '%;width:' + b.toFixed(1) + '%;background:var(--crit)"></i></div><span class="v">' + nf(fam[f][0] + fam[f][1], 2) + ' ×</span></div>';
    }).join('') + '</div><div class="legend"><span><i class="dot" style="background:var(--good)"></i>achat</span><span><i class="dot" style="background:var(--crit)"></i>vente</span><span>en fois le compte</span></div>';
    // les trois moteurs ce soir
    var spx = IX.SPX500, ndx = IX.NDX100, tr0 = run.trades.filter(function (x) { return x.j === null || x.j === undefined ? x.i <= t : x.i <= t && x.j > t; });
    var rep = [spx, ndx].map(function (col) { var a = run.trades.filter(function (x) { return x.col === col && x.i <= t && (x.j === null || x.j > t); })[0]; return a ? (col === spx ? 'S&P 500' : 'Nasdaq-100') + ' depuis ' + (t - a.i) + ' séance' + (t - a.i > 1 ? 's' : '') : null; }).filter(Boolean);
    var tn = 0, tl = 0; for (var j = 0; j < NI; j++) if (run.HT[j][t]) { tn++; if (run.HT[j][t] > 0) tl++; }
    var v1 = [spx, ndx].filter(function (c) { return run.HV[c][t] > 0; }).map(function (c) { return c === spx ? 'S&P 500' : 'Nasdaq-100'; });
    var nr = nextRevision(run, t, day);
    $('p-next').innerHTML = '<h2>Les trois moteurs ce soir</h2><div class="method">' +
      '<div class="m"><i style="background:var(--e1)"></i><span><b>Repli</b> · ' + (rep.length ? 'en trade : ' + rep.join(', ') : 'pas de trade en cours (il attend une baisse de 2 jours au-dessus de la moyenne 200 jours)') + '</span></div>' +
      '<div class="m"><i style="background:var(--e2)"></i><span><b>Tendance</b> · ' + tn + ' marchés suivis, ' + tl + ' à l\'achat et ' + (tn - tl) + ' à la vente ; prochaine révision ' + longDay(nr.day) + '</span></div>' +
      '<div class="m"><i style="background:var(--e3)"></i><span><b>Indices</b> · ' + (v1.length ? v1.join(' et ') + ' au-dessus de leur moyenne 200 jours : exposés' : 'S&P 500 et Nasdaq-100 sous leur moyenne 200 jours : à l\'écart') + '</span></div>' +
      '</div><p class="muted">Poids des moteurs ce soir : repli ' + nf(run.W[0][t], 2) + ', tendance ' + nf(run.W[1][t], 2) + ', indices ' + nf(run.W[2][t], 2) + ' (réglés pour viser ' + upct(cfg.vol, 0) + ' de volatilité par an).</p>';
  }

  /* ---- Bilan ---- */
  function bilanData() {
    if (S.bil && S.bil.key === cfg.size + '|' + cfg.swap + '|' + cfg.vol) return S.bil;
    var run = getRun(cfg.vol), CHR = getRun(CH_VOL), ch = { r: CHR.R, rl: CHR.RL }, days = S.D.days, n = days.length, R = run.R, RL = run.RL, first = days.findIndex(function (d) { return yearOf(d) >= 2012; });
    var years = {}, months = {};
    for (var t = first; t < n; t++) {
      var y = yearOf(days[t]), mo = new Date(days[t] * DAY).getUTCMonth();
      years[y] = (years[y] || 0) + R[t]; months[y + '-' + mo] = (months[y + '-' + mo] || 0) + R[t];
    }
    var starts = [], f = fee();
    for (var s = first; s < n; s += 5) {
      var e = days.findIndex(function (d) { return d >= days[s] + 1461; });
      if (e < 0) break;
      starts.push(E.onestep(R, RL, s, e, cfg.size, f, false, 0, ch).net);
    }
    S.bil = { key: cfg.size + '|' + cfg.swap + '|' + cfg.vol, first: first, years: years, months: months, starts: starts };
    return S.bil;
  }
  function median(a) { var b = a.slice().sort(function (x, y) { return x - y; }), k = b.length; return k ? (k % 2 ? b[(k - 1) / 2] : (b[k / 2 - 1] + b[k / 2]) / 2) : 0; }
  function renderBilan() {
    var B = bilanData(), run = getRun(cfg.vol), CHR = getRun(CH_VOL), days = S.D.days, n = days.length, R = run.R, RL = run.RL, Y0 = 2012, Yn = yearOf(days[n - 1]);
    if (S.byear < Y0 || S.byear > Yn) S.byear = 2020;
    var Y = S.byear, yrs = [];
    for (var y = Y0; y <= Yn; y++) yrs.push(y);
    $('b-years').innerHTML = yrs.map(function (y) { return '<button data-byear="' + y + '" aria-pressed="' + (y === Y) + '">' + y + '</button>'; }).join('');
    var chip = $('b-years').querySelector('[aria-pressed="true"]');
    if (chip) $('b-years').scrollLeft = chip.offsetLeft - $('b-years').clientWidth / 2 + chip.clientWidth / 2;
    var sans = S.bmode === 'sans';
    $('b-mode').innerHTML = '<button data-bmode="avec" aria-pressed="' + !sans + '">Avec retraits</button><button data-bmode="sans" aria-pressed="' + sans + '">Sans retraits</button>';
    var s0 = days.findIndex(function (d) { return yearOf(d) >= Y; }), sim = E.onestep(R, RL, Math.max(0, s0 - 1), n - 1, cfg.size, fee(), sans, 0, { r: CHR.R, rl: CHR.RL });
    var span = (n - s0) / 252, x = Array.prototype.slice.call(R, s0), sum = 0, mean, sd = 0, eq = [], dd = [], pk = 0, mdd = 0;
    x.forEach(function (v) { sum += v; eq.push(sum); pk = Math.max(pk, sum); dd.push(sum - pk); mdd = Math.min(mdd, sum - pk); });
    mean = sum / x.length; x.forEach(function (v) { sd += (v - mean) * (v - mean); }); sd = Math.sqrt(sd / (x.length - 1));
    var pays = sim.events.filter(function (e) { return e.type === 'paiement'; }), buys = sim.events.filter(function (e) { return e.type === 'achat'; });
    var acc = sim.account;
    var kpis = '<div class="kpis"><div><span>Moteur, par an</span><b>' + pct(mean * 252) + '</b></div><div><span>Pire recul</span><b>' + pct(mdd) + '</b></div>' +
      '<div><span>Rapport gain / risque</span><b>' + nf(mean / sd * Math.sqrt(252), 2) + '</b></div><div><span>Sur la période</span><b>' + nf(span, 1) + ' ans</b></div></div>';
    var size = cfg.size, floor = 0.94 * size, pl = function (k, w) { return k + ' ' + w + (k > 1 ? 's' : ''); };
    var buyTxt = pl(buys.length, 'challenge') + ' acheté' + (buys.length > 1 ? 's' : '') + ' (' + usd(sim.fees) + '), ' + sim.passed + ' réussi' + (sim.passed > 1 ? 's' : '') + ', ' + sim.burnt + ' cramé' + (sim.burnt > 1 ? 's' : '');
    var state = acc.ph === 1 ? 'challenge en cours, solde ' + usd(acc.eq) + ' (objectif ' + usd(1.1 * size) + ', seuil de perte ' + usd(floor) + ')'
      : 'compte financé, solde ' + usd(acc.eq) + (sans ? '' : ' depuis le dernier retrait') + ', seuil de perte ' + usd(floor) + ' (marge ' + usd(acc.eq - floor) + ')';
    var head = '<div class="card-head"><h3>Stellar 1-Step ' + nf(size) + ' $ démarré en janvier ' + Y + (sans ? ', sans aucun retrait' : '') + '</h3><span class="tri" aria-hidden="true"><i></i><i></i><i></i></span></div>';
    if (sans) {
      var take = acc.ph === 3 ? Math.max(0, acc.eq - size) * 0.8 : 0;
      $('b-hero').innerHTML = head + '<div class="count">' + usd(acc.eq) + '</div><p class="sub">solde au ' + fullDay(days[n - 1]) + (acc.ph === 3 ? ', soit ' + sUsd(acc.eq - size) + ' de gains sur le compte financé' : ' (challenge en cours)') + '</p>' +
        '<p>' + buyTxt + '. En cours : ' + state + '. ' + (acc.ph === 3 ? 'Tout retirer aujourd’hui vous rapporterait ' + usd(take) + ' (80 %), soit ' + sUsd(take - sim.fees) + ' net des achats.' : 'Rien à retirer tant que le challenge n’est pas réussi.') + '</p>' + kpis;
    } else
    $('b-hero').innerHTML = head + '<div class="count">' + sUsd(sim.net) + '</div><p class="sub">net après achats, au ' + fullDay(days[n - 1]) + '</p>' +
      '<p>' + buyTxt + ' ; ' + pl(pays.length, 'retrait') + ' pour ' + usd(sim.paid) + ' reçus (prix du challenge remboursé au 3e). En cours : ' + state + '.</p>' + kpis;

    // courbe du moteur
    if (sans) {
      $('b-curve').innerHTML = '<div class="card-head"><h2>Solde du compte depuis janvier ' + Y + '</h2><span class="small">en dollars, challenge puis compte financé</span></div><div class="chart" id="b-chart"></div>' +
        '<div class="legend"><span><i style="background:var(--accent)"></i>solde</span><span><i style="background:var(--crit)"></i>seuil de perte</span><span><i style="background:var(--ink-3)"></i>solde de départ</span></div>';
      balanceChart($('b-chart'), days.slice(s0), sim.bal, sim.mll);
    } else {
      $('b-curve').innerHTML = '<div class="card-head"><h2>Le moteur depuis janvier ' + Y + '</h2><span class="small">gain cumulé, en % du compte</span></div><div class="chart" id="b-chart"></div>' +
        '<div class="legend"><span><i style="background:var(--accent)"></i>gain cumulé</span><span><i style="background:var(--crit);opacity:.5;height:8px"></i>recul depuis le plus haut</span></div>';
      curveChart($('b-chart'), days.slice(s0), eq, dd);
    }

    // parcours du compte
    var ev = sim.events.slice().reverse();
    var evHtml = function (e) {
      var d = days[Math.min(n - 1, e.t + (e.type === 'achat' && e.t === s0 - 1 ? 1 : 0))];
      if (e.type === 'paiement') return '<div class="e pay"><span class="i">' + ico('cash') + '</span><span>Retrait n° ' + e.n + '<small>' + fullDay(d) + ' · 80 % de ' + usd(e.gross) + (e.refund ? ' + challenge remboursé' : '') + '</small></span><span class="a pos">' + sUsd(e.v) + '</span></div>';
      if (e.type === 'achat') return '<div class="e buy"><span class="i">' + ico('cart') + '</span><span>Achat du challenge<small>' + fullDay(d) + '</small></span><span class="a">' + sUsd(e.v) + '</span></div>';
      if (e.type === 'reussite') return '<div class="e ok"><span class="i">' + ico('check') + '</span><span>Challenge réussi<small>' + fullDay(d) + ' · objectif +10 % en ' + e.days + ' séances : compte financé</small></span><span class="a">' + usd(cfg.size) + '</span></div>';
      return '<div class="e burn"><span class="i">' + ico('flame') + '</span><span>' + (e.ph === 1 ? 'Challenge raté' : 'Compte financé cramé') + '<small>' + fullDay(d) + ' · ' + (e.why === 'jour' ? 'perte du jour au-delà de 3 %' : 'solde sous ' + usd(0.94 * cfg.size)) + '</small></span><span class="a neg">0 $</span></div>';
    };
    $('b-journey').innerHTML = '<div class="card-head"><h2>Parcours du compte</h2><span class="small">du plus récent au plus ancien</span></div><div class="jr">' + ev.slice(0, 7).map(evHtml).join('') + '</div>' +
      (ev.length > 7 ? '<details class="jr-more"><summary>Voir tout le parcours (' + ev.length + ' étapes)</summary><div class="jr">' + ev.slice(7).map(evHtml).join('') + '</div></details>' : '');

    // années
    var mxY = 0.01; yrs.forEach(function (y) { mxY = Math.max(mxY, Math.abs(B.years[y] || 0)); });
    var perY = {}; sim.events.forEach(function (e) { var yy = yearOf(days[Math.min(n - 1, e.t + 1)]); perY[yy] = (perY[yy] || 0) + e.v; });
    var endY = {}; sim.bal.forEach(function (b, k) { endY[yearOf(days[s0 + k])] = b; });
    var col = function (y, top) { var v = B.years[y] || 0, h = Math.abs(v) / mxY * (top ? 82 : 40), dim = y < Y ? ' dim' : '';
      if (top) return '<div class="c' + dim + '" data-byear="' + y + '">' + (v >= 0 ? '<span class="yb-v">' + nf(v * 100, 1) + '</span><i class="b" style="height:' + h.toFixed(1) + 'px"></i>' : '') + '</div>';
      return '<div class="c' + dim + '" data-byear="' + y + '">' + (v < 0 ? '<i class="b" style="height:' + h.toFixed(1) + 'px"></i><span class="yb-v">' + nf(v * 100, 1) + '</span>' : '') + '</div>'; };
    $('b-annees').innerHTML = '<div class="card-head"><h2>Année par année</h2><span class="small">moteur en % du compte · touchez une année pour y démarrer</span></div>' +
      '<div class="yb-wrap"><div class="yb-top">' + yrs.map(function (y) { return col(y, true); }).join('') + '</div><div class="yb-bot">' + yrs.map(function (y) { return col(y, false); }).join('') + '</div>' +
      '<div class="yb-y">' + yrs.map(function (y) { return '<span>' + String(y).slice(2) + '</span>'; }).join('') + '</div></div>' +
      '<div class="scroll"><table class="ptable" style="margin-top:12px"><thead><tr><th>Année</th><th>Moteur</th><th>' + (sans ? 'Solde en fin d’année' : 'Compte : retraits − achats') + '</th></tr></thead><tbody>' +
      yrs.filter(function (y) { return y >= Y; }).reverse().map(function (y) {
        var v = perY[y] || 0, last = sans ? '<td>' + usd(endY[y] || cfg.size) + '</td>' : '<td class="' + (v >= 0 ? 'pos' : 'neg') + '">' + sUsd(v) + '</td>';
        return '<tr><td>' + y + (y === Yn ? ' (en cours)' : '') + '</td><td class="' + ((B.years[y] || 0) >= 0 ? 'pos' : 'neg') + '">' + pct(B.years[y] || 0) + '</td>' + last + '</tr>'; }).join('') + '</tbody></table></div>';

    // risque
    var worst = 0, wd = 0, mpos = 0, mtot = 0, stops = 0, rmax = 0;
    for (var t = s0; t < n; t++) { if (RL[t] < worst) { worst = RL[t]; wd = days[t]; } rmax = Math.max(rmax, run.RISK[t]); }
    Object.keys(B.months).forEach(function (k) { if (+k.slice(0, 4) >= Y) { mtot++; if (B.months[k] > 0) mpos++; } });
    run.events.forEach(function (e) { if (e.t >= s0 && e.type === 'stop') stops++; });
    $('b-risk').innerHTML = '<h2>Risque</h2><div class="stat4">' +
      '<div><span>Pire journée (au plus bas)</span><b class="neg">' + pct(worst, 2) + '</b><small>' + (wd ? fullDay(wd) : '') + ' · ' + usd(worst * cfg.size) + '</small></div>' +
      '<div><span>Pire recul</span><b class="neg">' + pct(mdd) + '</b><small>' + usd(mdd * cfg.size) + ' sur ' + nf(cfg.size) + ' $</small></div>' +
      '<div><span>Mois gagnants</span><b>' + (mtot ? Math.round(mpos / mtot * 100) : 0) + ' %</b><small>' + mpos + ' sur ' + mtot + '</small></div>' +
      '<div><span>Stops touchés</span><b>' + nf(stops / Math.max(span, 0.1), 0) + ' par an</b><small>risque engagé max ' + upct(rmax, 2) + '</small></div></div>';

    // tous les départs
    var st = B.starts, med = median(st), lose = st.filter(function (v) { return v < 0; }).length, lo = Math.min.apply(null, st), hi = Math.max.apply(null, st);
    var bins = 18, hist = []; for (var i = 0; i < bins; i++) hist.push(0);
    st.forEach(function (v) { hist[Math.min(bins - 1, Math.floor((v - lo) / Math.max(1, hi - lo) * bins))]++; });
    var hm2 = Math.max.apply(null, hist);
    $('b-starts').innerHTML = '<div class="card-head"><h2>Tous les départs possibles</h2><span class="small">' + st.length + ' départs (un par semaine depuis 2012), 4 ans chacun</span></div>' +
      '<div class="stat4"><div><span>Résultat médian</span><b class="' + (med >= 0 ? 'pos' : 'neg') + '">' + sUsd(med) + '</b><small>en 4 ans, net des achats</small></div>' +
      '<div><span>Départs perdants</span><b>' + Math.round(lose / st.length * 100) + ' %</b><small>' + lose + ' sur ' + st.length + '</small></div></div>' +
      '<div class="dist" aria-hidden="true">' + hist.map(function (h, k) { var mid = lo + (k + 0.5) / bins * (hi - lo); return '<i class="' + (mid < 0 ? 'neg' : '') + '" style="height:' + (h / hm2 * 100).toFixed(0) + '%"></i>'; }).join('') + '</div>' +
      '<div class="legend"><span>du pire ' + sUsd(lo) + '</span><span style="margin-left:auto">au meilleur ' + sUsd(hi) + '</span></div>';

    // marchés
    var cont = ORDER.map(function (code) { var j = IX[code], s = 0; for (var t2 = s0; t2 < n; t2++) s += run.PNL[j][t2]; return [code, s]; });
    var fees = 0; for (var t3 = s0; t3 < n; t3++) fees -= COST * run.TURN[t3];
    cont.push(['Frais', fees]);
    cont.sort(function (a, b) { return b[1] - a[1]; });
    var mc = Math.max.apply(null, cont.map(function (c) { return Math.abs(c[1]); })) || 0.01;
    $('b-mkts').innerHTML = '<div class="card-head"><h2>Ce que chaque marché a rapporté</h2><span class="small">depuis janvier ' + Y + ', en % du compte</span></div><div class="mk">' + cont.map(function (c) {
      var w = Math.abs(c[1]) / mc * 50;
      return '<div class="r"><span class="n">' + c[0] + '</span><div class="bar"><i style="' + (c[1] >= 0 ? 'left:50%;background:var(--accent)' : 'right:50%;background:var(--crit)') + ';width:' + w.toFixed(1) + '%"></i></div><span class="v ' + (c[1] >= 0 ? 'pos' : 'neg') + '">' + pct(c[1]) + '</span></div>';
    }).join('') + '</div>';

    // mois
    $('b-month').innerHTML = '<div class="card-head"><h2>Mois par mois en ' + Y + '</h2><span class="small">moteur, en % du compte</span></div><div class="months">' + MOIS.map(function (mn, k) {
      var v = B.months[Y + '-' + k];
      if (v === undefined) return '<div class="na"><span>' + mn + '</span><b>—</b></div>';
      var a = Math.min(1, Math.abs(v) / 0.03);
      return '<div style="background:color-mix(in srgb,' + (v >= 0 ? 'var(--accent)' : 'var(--crit)') + ' ' + Math.round(8 + a * 30) + '%,transparent)"><span>' + mn + '</span><b class="' + (v >= 0 ? 'pos' : 'neg') + '">' + pct(v) + '</b></div>';
    }).join('') + '</div>';

    $('b-method').innerHTML = '<ul>' +
      '<li>Le moteur est rejoué séance par séance depuis 2008 avec les cours quotidiens de Yahoo (indices au comptant, devises, or et argent en contrats à terme), exactement comme l\'appli calcule les ordres du soir.</li>' +
      '<li>Règle des 3 % respectée chaque soir : stops placés pour que la perte possible de toutes les positions, mesurée depuis le prix d\'entrée, reste sous 2,9 % du compte. Taille gardée entre deux recalages du stop.</li>' +
      '<li>Frais : 0,015 % de chaque montant échangé, plus 0,02 % sur chaque stop touché. Pas de frais de nuit (option Swap-Free). Arrondi des lots non compté.</li>' +
      '<li>Compte Stellar 1-Step : challenge à +10 % en 2 jours de trading au moins, puis compte financé qui repart du solde de départ. Perte du jour limitée à 3 % et perte maximale à 6 % sous le solde de départ (fixe), vérifiées au plus bas de chaque journée. Retrait tous les 5 jours de bourse, 80 % des gains, prix du challenge remboursé au 3e retrait. Compte cramé : nouveau challenge acheté ' + usd(fee(), 2) + '.</li>' +
      '<li>Pendant le challenge, le moteur vise 8 % de volatilité au lieu de ' + upct(cfg.vol, 0) + ' (9e lot du labo : challenge réussi en 8 à 11 mois au lieu de 14 à 17, valeur médiane sur 4 ans +28 à +38 %, mais plus de challenges ratés). Les stops et le plafond de 2,9 % restent appliqués partout.</li>' +
      '<li>Le laboratoire (2009-2026) avait oublié les frais de rééquilibrage et laissait le risque dépasser 3 % un soir sur trois : l\'appli corrige les deux, ses chiffres sont donc plus bas et plus réalistes.</li>' +
      '<li>Résultats passés simulés : ils ne garantissent rien pour l\'avenir. Je ne suis pas conseiller financier.</li></ul>';
  }
  function curveChart(el, xd, eq, dd) {
    var W = Math.max(280, el.clientWidth || 600), H = 220, padL = 40, padR = 8, padT = 10, padB = 22, n = eq.length;
    var mx = Math.max(0.01, Math.max.apply(null, eq)), mn = Math.min(0, Math.min.apply(null, dd), Math.min.apply(null, eq));
    var X = function (i) { return padL + i / Math.max(1, n - 1) * (W - padL - padR); }, Yv = function (v) { return padT + (mx - v) / (mx - mn) * (H - padT - padB); };
    var step = Math.max(1, Math.floor(n / 600)), line = '', area = '';
    for (var i = 0; i < n; i += step) line += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Yv(eq[i]).toFixed(1);
    area = 'M' + X(0).toFixed(1) + ' ' + Yv(0).toFixed(1);
    for (i = 0; i < n; i += step) area += 'L' + X(i).toFixed(1) + ' ' + Yv(dd[i]).toFixed(1);
    area += 'L' + X(n - 1).toFixed(1) + ' ' + Yv(0).toFixed(1) + 'Z';
    var ticks = '', range = mx - mn, st = range > 0.6 ? 0.2 : range > 0.3 ? 0.1 : range > 0.12 ? 0.05 : 0.02;
    for (var v = Math.ceil(mn / st) * st; v <= mx + 1e-9; v += st) ticks += '<line class="gl" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + Yv(v).toFixed(1) + '" y2="' + Yv(v).toFixed(1) + '"/><text class="ax" x="' + (padL - 6) + '" y="' + (Yv(v) + 4).toFixed(1) + '" text-anchor="end">' + nf(v * 100, 0) + '</text>';
    var yl = '', lastY = null;
    for (i = 0; i < n; i++) { var yy = yearOf(xd[i]); if (yy !== lastY) { if (lastY !== null && (n < 1500 || yy % 2 === 0)) yl += '<text class="ax" x="' + X(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + yy + '</text>'; lastY = yy; } }
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Gain cumulé du moteur">' + ticks + yl +
      '<path d="' + area + '" fill="var(--crit)" opacity=".18"/><path class="ln" d="' + line + '" stroke="var(--accent)"/><line class="cross" id="b-cross" y1="' + padT + '" y2="' + (H - padB) + '" style="display:none"/></svg><div class="tip" id="b-tip" hidden></div>';
    var svg = el.querySelector('svg'), tip = el.querySelector('.tip'), cross = el.querySelector('.cross');
    var move = function (ev) {
      var r = svg.getBoundingClientRect(), px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left, k = Math.round((px * W / r.width - padL) / (W - padL - padR) * (n - 1));
      if (k < 0 || k >= n) { tip.hidden = true; cross.style.display = 'none'; return; }
      var xx = X(k) * r.width / W; cross.setAttribute('x1', X(k)); cross.setAttribute('x2', X(k)); cross.style.display = '';
      tip.hidden = false; tip.style.left = xx + 'px'; tip.style.top = (Yv(eq[k]) * r.height / H - 8) + 'px';
      tip.innerHTML = fullDay(xd[k]) + '<br>Cumul <b>' + pct(eq[k]) + '</b> · recul <b>' + pct(dd[k]) + '</b>';
    };
    svg.addEventListener('mousemove', move); svg.addEventListener('touchmove', move, { passive: true });
    svg.addEventListener('mouseleave', function () { tip.hidden = true; cross.style.display = 'none'; });
  }
  function balanceChart(el, xd, bal, mll) {
    var W = Math.max(280, el.clientWidth || 600), H = 220, padL = 52, padR = 8, padT = 10, padB = 22, n = bal.length;
    var mx = Math.max(cfg.size * 1.02, Math.max.apply(null, bal)), mn = Math.min(cfg.size * 0.93, Math.min.apply(null, mll));
    var X = function (i) { return padL + i / Math.max(1, n - 1) * (W - padL - padR); }, Yv = function (v) { return padT + (mx - v) / (mx - mn) * (H - padT - padB); };
    var step = Math.max(1, Math.floor(n / 600)), lb = '', lm = '';
    for (var i = 0; i < n; i += step) { lb += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Yv(bal[i]).toFixed(1); lm += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Yv(mll[i]).toFixed(1); }
    var range = mx - mn, st = [500, 1000, 2000, 5000, 10000, 20000, 50000].filter(function (v) { return range / v <= 6; })[0] || 100000, ticks = '';
    for (var v = Math.ceil(mn / st) * st; v <= mx; v += st) ticks += '<line class="gl" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + Yv(v).toFixed(1) + '" y2="' + Yv(v).toFixed(1) + '"/><text class="ax" x="' + (padL - 6) + '" y="' + (Yv(v) + 4).toFixed(1) + '" text-anchor="end">' + nf(v / 1000, v % 1000 ? 1 : 0) + ' k</text>';
    var yl = '', lastY = null;
    for (i = 0; i < n; i++) { var yy = yearOf(xd[i]); if (yy !== lastY) { if (lastY !== null && (n < 1500 || yy % 2 === 0)) yl += '<text class="ax" x="' + X(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + yy + '</text>'; lastY = yy; } }
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Solde du compte">' + ticks + yl +
      '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + Yv(cfg.size).toFixed(1) + '" y2="' + Yv(cfg.size).toFixed(1) + '" stroke="var(--ink-3)" stroke-dasharray="4 4"/>' +
      '<path class="ln" d="' + lm + '" stroke="var(--crit)" stroke-width="1.5"/><path class="ln" d="' + lb + '" stroke="var(--accent)"/><line class="cross" y1="' + padT + '" y2="' + (H - padB) + '" style="display:none"/></svg><div class="tip" hidden></div>';
    var svg = el.querySelector('svg'), tip = el.querySelector('.tip'), cross = el.querySelector('.cross');
    var move = function (ev) {
      var r = svg.getBoundingClientRect(), px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left, k = Math.round((px * W / r.width - padL) / (W - padL - padR) * (n - 1));
      if (k < 0 || k >= n) { tip.hidden = true; cross.style.display = 'none'; return; }
      cross.setAttribute('x1', X(k)); cross.setAttribute('x2', X(k)); cross.style.display = '';
      tip.hidden = false; tip.style.left = (X(k) * r.width / W) + 'px'; tip.style.top = (Yv(bal[k]) * r.height / H - 8) + 'px';
      tip.innerHTML = fullDay(xd[k]) + '<br>Solde <b>' + usd(bal[k]) + '</b> · seuil <b>' + usd(mll[k]) + '</b>';
    };
    svg.addEventListener('mousemove', move); svg.addEventListener('touchmove', move, { passive: true });
    svg.addEventListener('mouseleave', function () { tip.hidden = true; cross.style.display = 'none'; });
  }
  document.addEventListener('click', function (e) {
    var m = e.target.closest('[data-bmode]');
    if (m) { S.bmode = m.dataset.bmode; store.set('bmode', S.bmode); renderBilan(); }
  });
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-byear]');
    if (!b) return;
    S.byear = +b.dataset.byear; store.set('byear', S.byear); renderBilan();
  });

  /* ---- Trades : chaque position du moteur, de son ouverture à sa fermeture ---- */
  function buildTrades(run) {
    if (run._trades) return run._trades;
    var out = [], T = run.T, hits = {};
    run.events.forEach(function (e) { if (e.type === 'stop') (hits[e.j] = hits[e.j] || {})[e.t] = e; });
    var open = function (j, t, h) {
      var c = [run.W[0][t] * run.HR[j][t], run.W[1][t] * run.HT[j][t], run.W[2][t] * run.HV[j][t]];
      return { j: j, code: CODES[j], side: sgn(h), t0: t, px0: run.C[j][t], h0: Math.abs(h), max: Math.abs(h), adj: 0, pnl: 0, cost: COST * Math.abs(h), eng: c,
        ref: run.REF[j][t], dist: run.DIST[j][t] };
    };
    var close = function (tr, t, px, why) { tr.t1 = t; tr.px1 = px; tr.why = why; out.push(tr); };
    for (var j = 0; j < NI; j++) {
      var cur = null;
      for (var t = 1; t < T; t++) {
        var h0 = run.HELD[j][t - 1], h1 = run.HELD[j][t], st = hits[j] && hits[j][t];
        if (cur) cur.pnl += run.PNL[j][t];
        if (cur && st) { close(cur, t, st.px, 'stop'); cur = null; h0 = 0; }
        if (cur && (!h1 || sgn(h1) !== sgn(h0))) { cur.cost += COST * Math.abs(h0); close(cur, t, run.C[j][t], h1 ? 'flip' : 'fin'); cur = null; h0 = 0; }
        if (!cur && h1) cur = open(j, t, h1);
        else if (cur && h1 !== h0) { cur.adj++; cur.max = Math.max(cur.max, Math.abs(h1)); cur.cost += COST * Math.abs(h1 - h0); }
      }
      if (cur) { cur.t1 = T - 1; cur.px1 = run.C[j][T - 1]; cur.why = 'live'; out.push(cur); }
    }
    out.forEach(function (tr) { tr.net = tr.pnl - tr.cost; });
    out.sort(function (a, b) { return b.t0 - a.t0 || ORDER.indexOf(a.code) - ORDER.indexOf(b.code); });
    run._trades = out;
    return out;
  }
  var WHY = { stop: 'Stop touché', fin: 'Fermée par le moteur', flip: 'Retournée', live: 'En cours' };
  function renderTrades() {
    var run = S.off, days = S.D.days, n = days.length, all = buildTrades(run), Yn = yearOf(days[n - 1]);
    var Y = S.tyear || Yn, yrs = ['Tout'];
    for (var y = 2012; y <= Yn; y++) yrs.push(y);
    $('t-years').innerHTML = yrs.map(function (y) { var v = y === 'Tout' ? -1 : y; return '<button data-tyear="' + v + '" aria-pressed="' + (v === Y) + '">' + y + '</button>'; }).join('');
    var chip = $('t-years').querySelector('[aria-pressed="true"]');
    if (chip) $('t-years').scrollLeft = chip.offsetLeft - $('t-years').clientWidth / 2 + chip.clientWidth / 2;
    var F = S.tfam;
    $('t-fam').innerHTML = [['all', 'Tous'], ['idx', 'Indices'], ['fx', 'Devises'], ['met', 'Métaux']].map(function (f) { return '<button data-tfam="' + f[0] + '" aria-pressed="' + (f[0] === F) + '">' + f[1] + '</button>'; }).join('');
    var L = all.filter(function (tr) { var yy = yearOf(days[tr.t0]); return (Y === -1 || yy === Y) && yy >= 2012 && (F === 'all' || MK[tr.code].f === F); });
    var closed = L.filter(function (tr) { return tr.why !== 'live'; }), win = closed.filter(function (tr) { return tr.net > 0; }), lose = closed.filter(function (tr) { return tr.net <= 0; });
    var sum = function (a) { return a.reduce(function (x, tr) { return x + tr.net; }, 0); }, size = cfg.size;
    var best = L.slice().sort(function (a, b) { return b.net - a.net; })[0], worst = L.slice().sort(function (a, b) { return a.net - b.net; })[0];
    var dur = closed.length ? closed.reduce(function (x, tr) { return x + tr.t1 - tr.t0; }, 0) / closed.length : 0;
    var stops = closed.filter(function (tr) { return tr.why === 'stop'; }).length;
    var when = function (tr) { return tr.code + ' · ' + shortDay(days[tr.t0]) + ' ' + yearOf(days[tr.t0]); };
    var label = Y === -1 ? 'depuis 2012' : 'ouverts en ' + Y;
    $('t-sum').innerHTML = '<div class="card-head"><h2>' + L.length + ' trade' + (L.length > 1 ? 's' : '') + ' ' + label + '</h2><span class="small">moteur ' + (cfg.phase === 'challenge' ? 'du challenge (8 %)' : 'du compte financé (' + upct(cfg.vol, 0) + ')') + ', montants pour ' + nf(size) + ' $, frais compris</span></div>' +
      '<div class="stat4 q6">' +
      '<div><span>Résultat total</span><b class="' + (sum(L) >= 0 ? 'pos' : 'neg') + '">' + sUsd(sum(L) * size) + '</b><small>' + pct(sum(L)) + ' du compte</small></div>' +
      '<div><span>Trades gagnants</span><b>' + (closed.length ? Math.round(win.length / closed.length * 100) : 0) + ' %</b><small>' + win.length + ' sur ' + closed.length + ' fermés</small></div>' +
      '<div><span>Gain moyen / perte moyenne</span><b>' + (win.length ? sUsd(sum(win) / win.length * size) : '—') + ' / ' + (lose.length ? sUsd(sum(lose) / lose.length * size) : '—') + '</b><small>par trade fermé</small></div>' +
      '<div><span>Meilleur</span><b class="pos">' + (best ? sUsd(best.net * size) : '—') + '</b><small>' + (best ? when(best) : '') + '</small></div>' +
      '<div><span>Pire</span><b class="neg">' + (worst ? sUsd(worst.net * size) : '—') + '</b><small>' + (worst ? when(worst) : '') + '</small></div>' +
      '<div><span>Durée moyenne</span><b>' + nf(dur, 0) + ' séances</b><small>' + (closed.length ? Math.round(stops / closed.length * 100) : 0) + ' % fermés par le stop</small></div></div>';
    var lotsTxt = function (tr) {
      var v = Math.abs(lotsAt(run, tr.t0)[tr.j]);
      return v ? nf(v, cfg.step < 0.1 ? 2 : 1) + ' lot' + (v >= 2 ? 's' : '') : 'sous ' + nf(cfg.step / 2, 3) + ' lot : non pris';
    };
    var row = function (tr) {
      var d0 = days[tr.t0], d1 = days[tr.t1], ns = tr.t1 - tr.t0, cls = tr.side > 0 ? 'buy' : 'sell', amt = tr.net * size;
      var eng = tr.eng.map(Math.abs), es = eng[0] + eng[1] + eng[2] || 1;
      var engTxt = ['Repli', 'Tendance', 'Indices'].map(function (nm, k) { return eng[k] / es >= 0.005 ? nm + ' ' + Math.round(eng[k] / es * 100) + ' %' : null; }).filter(Boolean).join(' · ');
      var stp = tr.side > 0 ? tr.ref * (1 - tr.dist) : tr.ref * (1 + tr.dist), mv = tr.px1 / tr.px0 - 1;
      return '<details class="tr ' + cls + '"><summary><span class="i">' + ico(cls) + '</span><span class="w"><b>' + tr.code + '</b> <span class="small">' + (tr.side > 0 ? 'Achat' : 'Vente') + '</span>' +
        '<span class="tag2' + (tr.why === 'stop' ? ' stop' : tr.why === 'live' ? ' live' : '') + '">' + WHY[tr.why] + '</span>' +
        '<small>' + shortDay(d0) + (yearOf(d0) !== yearOf(d1) || tr.why === 'live' ? ' ' + yearOf(d0) : '') + ' → ' + (tr.why === 'live' ? 'aujourd\'hui' : shortDay(d1) + ' ' + yearOf(d1)) + ' · ' + ns + ' séance' + (ns > 1 ? 's' : '') + '</small></span>' +
        '<span class="r"><b class="' + (amt >= 0 ? 'pos' : 'neg') + '">' + sUsd(amt) + '</b><small>' + pct(tr.net, 2) + '</small></span></summary>' +
        '<div class="td"><div><span>Entrée · ' + fullDay(d0) + '</span><b>' + pxf(tr.code, tr.px0) + '</b></div>' +
        '<div><span>' + (tr.why === 'live' ? 'Dernier cours' : 'Sortie · ' + fullDay(d1)) + '</span><b>' + pxf(tr.code, tr.px1) + '</b></div>' +
        '<div><span>Lots à l\'entrée (compte ' + nf(size / 1000) + 'k)</span><b>' + lotsTxt(tr) + '</b></div>' +
        '<div><span>Stop de départ</span><b>' + pxf(tr.code, stp) + ' (' + upct(tr.dist, 2) + ')</b></div>' +
        '<div><span>Taille</span><b>' + upct(tr.h0, 0) + ' du compte' + (tr.max > tr.h0 * 1.01 ? ', jusqu\'à ' + upct(tr.max, 0) : '') + '</b></div>' +
        '<div><span>Ajustements de taille</span><b>' + tr.adj + '</b></div>' +
        '<div><span>Variation du prix</span><b class="' + (mv * tr.side >= 0 ? 'pos' : 'neg') + '">' + pct(mv, 2) + '</b></div>' +
        '<div><span>Frais estimés</span><b>' + usd(tr.cost * size, 2) + '</b></div>' +
        '<div class="full"><span>D\'où vient la position (' + esc(MK[tr.code].n) + ')</span><b>' + engTxt + '</b><div class="eng">' +
        ['var(--e1)', 'var(--e2)', 'var(--e3)'].map(function (c, k) { return '<i style="width:' + (eng[k] / es * 100).toFixed(1) + '%;background:' + c + '"></i>'; }).join('') + '</div></div></div></details>';
    };
    var shown = L.slice(0, S.tmax);
    $('t-list').innerHTML = '<div class="card-head"><h2>Détail des trades</h2><span class="small">du plus récent au plus ancien · touchez un trade</span></div>' +
      (L.length ? '<div class="trs">' + shown.map(row).join('') + '</div>' +
        (L.length > S.tmax ? '<button class="more-btn" data-tmore>Afficher ' + Math.min(40, L.length - S.tmax) + ' trades de plus (' + (L.length - S.tmax) + ' restants)</button>' : '')
        : '<div class="empty">' + ico('flat') + 'Aucun trade.</div>') +
      '<p class="muted">Un trade va de l\'ouverture d\'une position à sa fermeture (stop, fin du signal ou retournement) ; les ajustements de taille entre les deux en font partie. Montants calculés sur la taille voulue par le moteur, avant arrondi des lots, aux cours officiels de clôture.</p>';
  }
  document.addEventListener('click', function (e) {
    var y = e.target.closest('[data-tyear]'), f = e.target.closest('[data-tfam]'), m = e.target.closest('[data-tmore]');
    if (y) { S.tyear = +y.dataset.tyear; store.set('tyear', S.tyear); S.tmax = 40; renderTrades(); }
    else if (f) { S.tfam = f.dataset.tfam; S.tmax = 40; renderTrades(); }
    else if (m) { S.tmax += 40; renderTrades(); }
  });

  /* ---- Compte ---- */
  function renderCompte() {
    $('c-phase').value = cfg.phase; $('c-size').value = String(cfg.size); $('c-swap').checked = !!cfg.swap; $('c-vol').value = String(cfg.vol); $('c-step').value = String(cfg.step);
    $('c-price').innerHTML = 'Prix du compte : <b>' + usd(fee(), 2) + '</b>' + (cfg.swap ? ' (dont 10 % pour l\'option Swap-Free)' : '') + ', remboursé au 3e retrait. Prix publics de novembre 2026 : vérifiez sur le site de FundedNext avant d\'acheter.' +
      (cfg.size < 25000 ? '<br>Sur un petit compte, beaucoup de positions voulues tombent sous 0,01 lot et sont laissées de côté : le résultat réel s\'écarte du bilan. 50 000 $ conseillé.' : '');
    if (!$('c-ct').dataset.built) {
      $('c-ct').innerHTML = ORDER.map(function (c) { return '<label>' + c + '<input type="number" inputmode="decimal" min="0" step="any" data-ct="' + c + '"></label>'; }).join('');
      $('c-ct').dataset.built = 1;
    }
    document.querySelectorAll('[data-ct]').forEach(function (i) { i.value = cfg.ct[i.dataset.ct]; });
    $('c-method').innerHTML = [
      ['var(--e1)', 'Repli', 'Sur le S&P 500 et le Nasdaq-100 : achat après une forte baisse de deux jours quand l\'indice reste au-dessus de sa moyenne de 200 jours, revente au premier rebond (10 séances au plus). Taille dosée selon l\'agitation du marché.'],
      ['var(--e2)', 'Tendance', 'Sur 18 marchés (indices, devises, or, argent) : à l\'achat si le marché a monté sur 12 mois, à la vente s\'il a baissé. Révisé une séance sur cinq, chaque marché pesant selon sa propre agitation.'],
      ['var(--e3)', 'Indices', 'S&P 500 et Nasdaq-100 tenus quand ils sont au-dessus de leur moyenne de 200 jours, d\'autant moins que le marché est agité.'],
      ['var(--accent)', 'Combinaison et règle des 3 %', 'Les trois moteurs pèsent à risque égal pour viser ' + upct(cfg.vol, 0) + ' de volatilité par an sur le compte financé, 8 % pendant le challenge pour le réussir plus vite. Chaque position a un stop ; ensemble, les stops ne peuvent pas coûter plus de 2,9 % du compte, pertes en cours comprises (règle FundedNext : 3 % au plus à tout moment).']
    ].map(function (x) { return '<div class="m"><i style="background:' + x[0] + '"></i><span><b>' + x[1] + '.</b> ' + x[2] + '</span></div>'; }).join('');
    $('c-gloss').innerHTML = [
      ['Lot', 'Unité de taille dans MT5. Un lot d\'indice vaut 10 fois l\'indice ; un lot de devise 100 000 unités ; un lot d\'or 100 onces.'],
      ['Stop', 'Ordre de sortie automatique placé avec la position. Il fixe la perte maximale du trade.'],
      ['Soir de révision', 'Une séance sur cinq : le suivi de tendance revoit ses marchés et tous les stops sont replacés depuis le cours du soir.'],
      ['Risque engagé', 'Ce que coûteraient tous les stops touchés en même temps, depuis le prix d\'entrée. FundedNext l\'interdit au-delà de 3 % du compte.'],
      ['Challenge', 'Première étape du 1-Step : gagner 10 % en au moins 2 jours de trading, sans toucher les limites de perte. Réussi, il donne un compte financé qui repart du solde de départ.'],
      ['Seuil de perte', 'Sur le 1-Step, le compte est perdu si le solde passe sous 94 % du solde de départ (seuil fixe) ou si une journée coûte plus de 3 %.'],
      ['Cramé', 'Compte perdu après avoir touché le seuil de perte. Le bilan suppose qu\'on en rachète un aussitôt.']
    ].map(function (g) { return '<dt>' + g[0] + '</dt><dd>' + g[1] + '</dd>'; }).join('');
    $('c-version').textContent = 'Triade · ' + VERSION + ' · cours officiels mis à jour le ' + (S.updated ? new Date(S.updated).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
  }
  ['c-phase', 'c-size', 'c-swap', 'c-vol', 'c-step'].forEach(function (id) {
    $(id).addEventListener('change', function () {
      if ($('c-phase').value !== cfg.phase) cfg.phaseSince = ds(nyToday());
      cfg.phase = $('c-phase').value; cfg.size = +$('c-size').value; cfg.swap = $('c-swap').checked; cfg.vol = +$('c-vol').value; cfg.step = +$('c-step').value;
      store.set('cfg', cfg); S.bil = null; S.prov = null;
      Object.keys(S.runs || {}).forEach(function (k) { S.runs[k]._lots = null; S.runs[k]._risk = null; });
      S.off = getRun(curVol());
      render(); toast('Réglage enregistré');
    });
  });
  document.addEventListener('change', function (e) {
    var i = e.target.closest('[data-ct]'); if (!i) return;
    var v = +i.value; if (v > 0) { cfg.ct[i.dataset.ct] = v; store.set('cfg', cfg); S.prov = null; S.off._lots = null; toast('Taille du contrat ' + i.dataset.ct + ' : ' + nf(v, v < 10 ? 2 : 0)); }
    else i.value = cfg.ct[i.dataset.ct];
  });
  var tt = null;
  function toast(msg) { var el = $('toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(tt); tt = setTimeout(function () { el.classList.remove('on'); }, 1800); }

  /* ---------- thème ---------- */
  function isDark() { var t = document.documentElement.dataset.theme; return t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches; }
  function applyTheme() {
    var dark = isDark();
    $('theme-btn').setAttribute('aria-label', dark ? 'Passer en thème clair' : 'Passer en thème sombre');
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) { m.setAttribute('content', dark ? '#0c0d18' : '#eef0fa'); });
  }
  $('theme-btn').addEventListener('click', function () { var next = isDark() ? 'light' : 'dark'; document.documentElement.dataset.theme = next; store.set('theme', next); applyTheme(); render(); });
  applyTheme();

  /* ---------- démarrage et mises à jour ---------- */
  function refresh(force) {
    var m = S.D ? moment() : null, needQ = !m || m.pend.length;
    var jobs = [];
    if (force || !S.D || Date.now() - S.loadedAt > 10 * 60000) jobs.push(loadData());
    return Promise.all(jobs).then(function () { return moment().pend.length || needQ ? fetchQuotes() : null; }).then(render).catch(function (e) {
      if (!S.D) $('boot').innerHTML = '<p>Impossible de charger les cours (' + esc(e.message || e) + '). Vérifiez la connexion puis rouvrez l\'appli.</p>';
      else render();
    });
  }
  window.addEventListener('hashchange', function () { show(location.hash.slice(1)); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') refresh(false); });
  setInterval(function () { if (document.visibilityState === 'visible' && S.D && moment().pend.length) fetchQuotes().then(render); else if (S.D) render(); }, 60000);
  var resizeT = null;
  window.addEventListener('resize', function () { clearTimeout(resizeT); resizeT = setTimeout(function () { if (S.view === 'bilan') renderBilan(); }, 200); });
  var first = (location.hash || '#' + S.view).slice(1);
  refresh(true).then(function () { show(first); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('../sw.js', { scope: '../' }).catch(function () { /* hors ligne non disponible */ });

  /* outils de vérification (console) */
  window.__qa = {
    heure: function (iso) { qaShift = iso ? Date.parse(iso) - Date.now() : 0; S.prov = null; render(); return moment(); },
    cours: function (q) { S.qaQuotes = q || null; S.prov = null; return fetchQuotes().then(render); },
    etat: function () { var m = moment(), run = currentRun(m); return { phase: m.ph, pend: m.pend.map(ds), dernier: ds(m.L), soir: run ? ds(dayOf(run, run.T - 1)) : null, ordres: run ? ordersAt(run, run.T - 1).list.map(function (o) { return o.type + ' ' + o.code + ' ' + o.from + '>' + o.to; }) : null, risque: run ? riskAt(run, run.T - 1) : null }; },
    run: function () { return S.run; }, data: function () { return S.D; }
  };
})();
