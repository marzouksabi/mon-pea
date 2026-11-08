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
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('repli:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('repli:' + k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } }
  };

  /* ---------- calendrier de la Bourse de New York ---------- */
  var HOLIDAYS = ['2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
    '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24'];
  var EARLY = ['2026-11-27', '2026-12-24', '2027-11-26'];           // fermeture a 13 h (New York)
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
  var parisToday = function () { return dn(parisYMD.format(new Date())); };

  /* ---------- reglages et journal ---------- */
  var VERSION = 'version du 08/11 13:36';
  var DEF = { size: 50000, lev: 0.5, phase: 1, start: '', bal: '', ct: { spx: 1, ndx: 1 }, step: 0.01 };
  var cfg = Object.assign({}, DEF, store.get('cfg', {}));
  cfg.ct = Object.assign({}, DEF.ct, cfg.ct || {});
  var trades = store.get('trades', []);
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

  function analyze(k) {
    var I = IDX[k], c = I.c, n = c.length, st = replay(c), P = c[n - 1], F = 0, q;
    for (q = n - 199; q < n; q++) F += c[q];
    F /= 199;
    var r = { k: k, name: I.name, sym: I.sym, P: P, last: I.days[n - 1], rsi: st.rsi, sma200: st.sma200[n - 1], st: st, F: F };
    if (st.open !== null) {
      var e = st.open;
      r.mode = 'pos'; r.e = e; r.entry = c[e]; r.entryDay = I.days[e]; r.held = n - e; r.forced = r.held >= 10;
      r.Y = (c[n - 4] + c[n - 3] + c[n - 2] + c[n - 1]) / 4; r.pnl = P / c[e] - 1;
    } else {
      r.mode = 'flat';
      r.X = st.ad > 9 * st.au ? P + (st.ad - 9 * st.au) / 9 : P - (9 * st.au - st.ad);
      r.possible = r.X > F;
    }
    var lastE = st.open !== null ? I.days[st.open] : (st.trades.length ? I.days[st.trades[st.trades.length - 1][0]] : null);
    r.lastEntry = lastE;
    return r;
  }

  /* prix du moment : saisi dans MT5 pour la seance du soir, sinon releve automatique recent */
  function nowPrice(k, session) {
    var m = manual[k];
    if (m && m.day === session && m.p > 0) return { p: m.p, src: 'MT5 (saisi)' };
    var L = LIVE && LIVE[k];
    if (L && L.t) {
      var age = Date.now() - L.t * 1000, nyDay = dn(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(L.t * 1000)));
      if (nyDay === session && age < 75 * 60000) return { p: L.p, src: 'relevé de ' + hm(L.t * 1000), auto: true };
    }
    return null;
  }

  function lotsFor(k, price) {
    var units = cfg.size * cfg.lev / price, ct = +cfg.ct[k] || 1, step = +cfg.step || 0.01;
    var lots = Math.floor(units / ct / step + 1e-9) * step;
    return { lots: +lots.toFixed(6), notional: lots * ct * price };
  }
  var stopPct = function () { return 0.015 / cfg.lev; };
  var levMax = function () { return cfg.phase == 3 ? 15 : 25; };
  function margeTxt(notional) { var m = notional / levMax(); return usd(m) + ' (' + nf(m / cfg.size * 100, 0) + ' %)'; }
  /* date de vente obligatoire : 10e jour de Bourse apres l'achat */
  function deadline(a) { var d = session; for (var q = a.held; q < 10; q++) d = nextTrading(d); return d; }

  /* ---------- compte ---------- */
  function pnlOf(t) {
    var ct = +cfg.ct[t.idx] || 1, out = t.p2 > 0 ? t.p2 : (A[t.idx] ? A[t.idx].P : t.p1);
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
    trades.forEach(function (t) { if (!t.d2) risk += t.p1 * stopPct() * t.lots * (+cfg.ct[t.idx] || 1); });
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
    var a = A[k], I = IDX[k], np = nowPrice(k, session), live = np ? np.p : null, ct = +cfg.ct[k] || 1;
    var jt = trades.filter(function (t) { return t.idx === k && !t.d2; })[0] || null;
    var o = { k: k, a: a, I: I, np: np, step: 1, tone: 'idle', title: '', sub: '', check: null, how: null, trade: null };
    var lastClose = I.c[I.c.length - 1], cur = live || lastClose;
    if (a.mode === 'pos') {
      var tr = { real: !!jt, d1: jt ? dn(jt.d1) : a.entryDay, p1: jt ? jt.p1 : a.entry, lots: jt ? jt.lots : lotsFor(k, a.entry).lots, fee: jt ? (+jt.fee || 0) : 0 };
      tr.cur = cur; tr.pnl = (cur - tr.p1) * tr.lots * ct - tr.fee; tr.r = cur / tr.p1 - 1; tr.stop = cfg.phase == 3 ? tr.p1 * (1 - stopPct()) : null;
      tr.hit = null;
      if (tr.stop) for (var q = 0; q < I.days.length; q++) if (I.days[q] > tr.d1 && I.l[q] <= tr.stop) { tr.hit = I.days[q]; break; }
      tr.deadline = deadline(a);
      o.trade = tr; o.step = 2;
      if (tr.hit) {
        o.step = 3; o.tone = 'alert';
        o.title = 'Trade terminé par le stop le ' + longDay(tr.hit);
        o.sub = 'Le prix est tombé sous ' + px(tr.stop) + ' : MT5 a fermé le trade tout seul (perte d\'environ ' + usd(tr.p1 * stopPct() * tr.lots * ct) + '). Note la sortie dans le Journal.';
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
      o.tone = 'alert'; o.step = 2;
      o.title = 'Un trade est ouvert alors que la règle n\'en a pas';
      o.sub = 'Si c\'est un trade d\'entretien (contre l\'inactivité), sors-en et note la sortie dans le Journal.';
      o.how = 'exit';
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
      var lt = lotsFor(o.k, o.np ? o.np.p : o.a.X), stop = (o.np ? o.np.p : o.a.X) * (1 - stopPct());
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
    var cl = closeUTC(session), now = Date.now(), early = EARLY.indexOf(ds(session)) >= 0;
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
      (todo.length ? 'Décide vers ' + hm(cl - 600000) + ', juste avant la fin de journée à New York (' + hm(cl) + ').' : 'Aucun indice ne peut donner d\'entrée ce soir.');
    $('hero').innerHTML = '<h3>' + cap(longDay(session)) + ' · fin de journée à ' + hm(cl) + '</h3><div class="big">' + esc(big) + '</div><p>' + esc(sub) + '</p>' +
      '<div class="chips"><span class="chip">Compte ' + nf(cfg.size / 1000) + 'k · ' + (cfg.phase == 3 ? 'financé' : 'phase ' + cfg.phase) + '</span><span class="chip">' + nf(cfg.lev, 1) + ' × par indice</span>' +
      (cfg.phase == 3 ? '<span class="chip">Stop ' + nf(stopPct() * 100, 1) + ' %</span>' : '') + '</div>' +
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
      : '<div class="stats"><div><span>Prix d\'hier soir</span><b>' + px(a.P) + '</b></div><div><span>Moyenne 200 jours</span><b>' + px(a.sma200) + '</b></div>' +
        '<div><span>Écart à la moyenne</span><b>' + pct(a.P / a.sma200 - 1) + '</b></div><div><span>Trade en cours</span><b>aucun</b></div></div>';
    $('idx-' + k).innerHTML = '<div class="head"><div><div class="name">' + I.name + '</div><div class="sym">' + I.sym + ' dans MT5</div></div></div>' +
      trackerHtml(o) + planHtml(o) + (o.check ? '<div class="verdict ' + o.check.cls + '">' + esc(o.check.txt) + '<small>' + esc(o.check.sub) + ' Prix : ' + esc(o.np.src) + '.</small></div>' : '') + res +
      '<div class="chart" id="ch-' + k + '"></div>';
    var from = Math.max(0, n - 130);
    lineChart($('ch-' + k), {
      x: I.days.slice(from), height: 160, label: I.name + ' sur 6 mois',
      series: [{ name: 'Prix du ' + I.name, v: I.c.slice(from), c: '--s1' }, { name: 'Moyenne des 200 derniers jours', v: a.st.sma200.slice(from), c: '--s2' }],
      refs: a.mode === 'pos' ? [{ v: a.Y, label: px(a.Y), cls: 'ref-sell', tail: true }] : (a.possible ? [{ v: a.X, label: px(a.X), cls: 'ref-buy', tail: true }] : []),
      note: (a.mode === 'pos' ? 'Trait vert à droite : niveau de sortie de ce soir (' + px(a.Y) + '). ' : (a.possible ? 'Trait gris à droite : niveau d\'entrée de ce soir (' + px(a.X) + '). ' : '')) +
        'La règle ne cherche des entrées que quand le prix est au-dessus de la courbe orange.',
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
    var stale = parisToday() > nextTrading(Math.max(A.spx.last, A.ndx.last)) && Date.now() > closeUTC(nextTrading(Math.max(A.spx.last, A.ndx.last))) + 3 * 3600000;
    if (stale) out.push(['crit', '!', '<b>Prix en retard.</b> Le dernier prix de fin de journée date du ' + shortDay(Math.max(A.spx.last, A.ndx.last)) + '. Rouvre l\'application plus tard.']);
    if (s.inactive >= 45) out.push([s.inactive >= 55 ? 'crit' : 'warn', '!', '<b>Inactivité : ' + s.inactive + ' jours sans trade.</b> Le compte est désactivé à 60 jours (' + shortDay(s.deadline) + '). Ouvre et ferme un tout petit trade.']);
    if (cfg.phase == 3) out.push(['', 'i', '<b>Stop obligatoire</b> sur chaque trade : ' + nf(stopPct() * 100, 1) + ' % sous le prix d\'entrée (risque total ≤ 3 %).']);
    if (s.payout !== null) out.push(['ok', '$', '<b>Prochain paiement possible le ' + shortDay(s.payout) + '</b> · environ ' + usd(Math.max(0, (s.bal - s.size) * 0.8)) + ' à ce jour (80 %).']);
    for (var d = today; d <= today + 10; d++) {
      if (HOLIDAYS.indexOf(ds(d)) >= 0 && new Date(d * DAY).getUTCDay() % 6) { out.push(['', 'i', '<b>Bourse de New York fermée le ' + longDay(d) + '.</b> Rien à faire ce jour-là.']); break; }
      if (EARLY.indexOf(ds(d)) >= 0) { out.push(['warn', '!', '<b>La Bourse ferme plus tôt le ' + longDay(d) + '</b> : fin de journée à ' + hm(closeUTC(d)) + ' (heure de Paris).']); break; }
    }
    if (s.target && s.bal >= s.target) out.push(['ok', '✓', '<b>Objectif de la phase atteint.</b> Vérifie les 5 jours de trading, puis passe à l\'étape suivante dans Compte.']);
    if (!out.length) out.push(['ok', '✓', '<b>Rien à signaler.</b> Compte actif, prix à jour.']);
    return out;
  }
  function renderAlerts() {
    $('mini-alerts').innerHTML = '<h3>À surveiller</h3><ul class="alerts" style="margin-top:10px">' + alertList().map(function (a) {
      return '<li class="' + a[0] + '"><span class="ic">' + a[1] + '</span><span>' + a[2] + '</span></li>';
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
  var otab = store.get('otab', 'cours'), sheetId = null;
  var BUY = '<span class="side buy">BUY ↑</span>';

  /* jauge : ou est le prix par rapport aux niveaux (entree, sortie, stop) */
  function thermo(marks, cur, zone) {
    var vs = marks.map(function (m) { return m.v; }).concat([cur]), lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs), pad = (hi - lo) * 0.18 || cur * 0.01;
    lo -= pad; hi += pad;
    var X = function (v) { return Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100)).toFixed(2) + '%'; };
    var z = zone ? '<i class="zn ' + zone.cls + '" style="' + (zone.side === 'right' ? 'left:' + X(zone.v) + ';right:0' : 'left:0;width:' + X(zone.v)) + '"></i>' : '';
    return '<div class="thermo"><div class="tc"><span class="now" style="left:' + X(cur) + '">maintenant<br><b>' + px(cur) + '</b></span></div>' +
      '<div class="tt">' + z + marks.map(function (m) { return '<i class="tk ' + m.cls + '" style="left:' + X(m.v) + '"></i>'; }).join('') + '<b class="dot" style="left:' + X(cur) + '"></b></div>' +
      '<div class="tl">' + marks.map(function (m) { return '<span class="' + m.cls + '" style="left:' + X(m.v) + '">' + m.label + '<br><b>' + px(m.v) + '</b></span>'; }).join('') + '</div>' +
      (zone ? '<div class="tz ' + zone.cls + '">' + zone.label + '</div>' : '') + '</div>';
  }
  var tile = function (l, v, cls) { return '<div><span>' + l + '</span><b class="' + (cls || '') + '">' + v + '</b></div>'; };
  var chip = function (txt, cls) { return '<span class="chipx ' + cls + '">' + txt + '</span>'; };

  /* trades termines : ceux du journal, puis ceux de la regle sur 12 mois */
  function doneList() {
    var out = [], pos = cfg.size * cfg.lev;
    trades.filter(function (t) { return t.d2; }).forEach(function (t) {
      out.push({ id: 'j:' + t.id, k: t.idx, e: dn(t.d1), x: dn(t.d2), pe: t.p1, px: t.p2, g: t.p2 / t.p1 - 1, usd: pnlOf(t), src: 'journal', lots: t.lots });
    });
    var last = IDX.spx.days[IDX.spx.days.length - 1];
    legs(null).filter(function (t) { return !t.open && t.x >= last - 365; }).forEach(function (t) {
      out.push({ id: 'r:' + t.k + ':' + t.e, k: t.k, e: t.e, x: t.x, pe: t.pe, px: t.px, g: t.gross, usd: pos * t.net, src: 'regle' });
    });
    return out.sort(function (a, b) { return b.x - a.x || b.e - a.e; });
  }

  function renderOrdres() {
    var cl = closeUTC(session), P = ['spx', 'ndx'].map(plan);
    var att = P.filter(function (o) { return !o.trade; }), cours = P.filter(function (o) { return o.trade && !o.trade.hit; }), done = doneList(), tot = 0;
    cours.forEach(function (o) { tot += o.trade.pnl; });
    $('o-when').textContent = hm(cl - 600000);
    $('o-head').innerHTML = '<div class="oh"><div><h2 style="margin:0">' + cap(longDay(session)) + '</h2><p class="muted" style="margin:2px 0 0">Décision à <b>' + hm(cl - 600000) + '</b> · fin de journée ' + hm(cl) + '</p></div>' +
      '<div class="oh-k"><span>En cours</span><b class="' + (tot >= 0 ? 'pos' : 'neg') + '">' + (cours.length ? sUsd(tot) : '—') + '</b></div></div>';
    var tabs = [['attente', 'En attente', att.length], ['cours', 'En cours', cours.length], ['termines', 'Terminés', done.length]];
    $('o-seg').innerHTML = tabs.map(function (t) { return '<button role="tab" data-otab="' + t[0] + '" aria-selected="' + (otab === t[0]) + '">' + t[1] + ' <em>' + t[2] + '</em></button>'; }).join('');
    var rows = '';
    if (otab === 'attente') {
      rows = att.map(function (o) {
        var a = o.a, ok = o.tone === 'watch';
        return '<button class="row" data-sheet="att:' + o.k + '">' + (ok ? BUY : '<span class="side none">—</span>') + '<span class="rm"><b>' + o.I.name + '</b><small>' +
          (ok ? 'Entrée si prix &lt; ' + px(a.X) : (a.P <= a.F ? 'Sous la moyenne 200 j' : 'Baisse trop forte nécessaire')) + '</small></span>' +
          '<span class="rr">' + (ok ? chip('Possible ce soir', 'watch') + '<small>' + pct(a.X / a.P - 1) + '</small>' : chip('Pas ce soir', 'idle')) + '</span><span class="chev">›</span></button>';
      }).join('') || '<p class="empty">Les deux indices ont un trade en cours.</p>';
    } else if (otab === 'cours') {
      rows = cours.map(function (o) {
        var tr = o.trade, last = o.I.days[o.I.days.length - 1], day = jours(last - tr.d1), st = o.tone === 'act' || o.step === 3 ? chip('Sortir ce soir', 'act') : chip('Garder', 'ok');
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
    $('o-list').innerHTML = rows;
    if (sheetId) openSheet(sheetId, true);
  }

  /* fiche detaillee */
  function inputBox(o) {
    return '<label class="field"><span>Prix ' + o.I.sym + ' dans MT5</span><input type="number" inputmode="decimal" step="any" data-manual="' + o.k + '" value="' +
      (manual[o.k] && manual[o.k].day === session ? manual[o.k].p : '') + '" placeholder="' + (o.np && o.np.auto ? px(o.np.p) : px(o.a.P)) + '"></label>';
  }
  function openSheet(id, refresh) {
    var parts = id.split(':'), type = parts[0], html = '', chart = null, k, o;
    if (type === 'att') {
      o = plan(parts[1]); var a = o.a, cur = o.np ? o.np.p : a.P, ok = o.tone === 'watch';
      var lt = lotsFor(o.k, ok ? (o.np ? o.np.p : a.X) : a.P), stop = (o.np ? o.np.p : a.X) * (1 - stopPct());
      html = '<div class="sh-head">' + (ok ? BUY : '<span class="side none">—</span>') + '<div><h2>' + o.I.name + '</h2><small>' + o.I.sym + ' · en attente d\'une entrée</small></div></div>';
      if (ok) {
        var go = o.check ? o.check.cls === 'act' : null;
        html += '<div class="big-state ' + (go ? 'act' : 'watch') + '">' + (go ? '✓ Entrer ce soir' : go === false ? '✋ Pas d\'entrée à ce prix' : '👀 Entrée possible ce soir') + '</div>' +
          thermo([{ v: a.X, label: 'entrée', cls: 'k-in' }], cur, { side: 'left', v: a.X, cls: 'z-in', label: '← zone d\'entrée : prix de 22 h sous ' + px(a.X) }) +
          '<div class="tiles">' + tile('Niveau d\'entrée', px(a.X)) + tile('Prix d\'hier soir', px(a.P)) + tile('Baisse nécessaire', pct(a.X / a.P - 1)) +
          tile('Lots à acheter', nf(lt.lots, 2)) + tile('Montant', usd(lt.notional)) + tile('Stop', cfg.phase == 3 ? px(stop) : 'aucun') +
          tile('Marge bloquée', margeTxt(lt.notional)) + tile('Levier max', '1:' + levMax()) + tile('Les 2 indices', margeTxt(2 * cfg.size * cfg.lev)) + '</div>' + inputBox(o) +
          '<div class="act-line">' + BUY + ' MT5 → <b>' + o.I.sym + '</b> → Ordre au marché → <b>' + nf(lt.lots, 2) + ' lots</b> → <b>Buy</b></div>';
      } else {
        html += '<div class="big-state idle">Pas d\'entrée ce soir</div>' +
          (a.P <= a.F
            ? thermo([{ v: a.F, label: 'moyenne 200 j', cls: 'k-stop' }], a.P, { side: 'left', v: a.F, cls: 'z-no', label: '← sous la moyenne des 200 jours : la règle n\'entre pas' })
            : thermo([{ v: a.X, label: 'entrée', cls: 'k-in' }, { v: a.F, label: 'moyenne 200 j', cls: 'k-stop' }], a.P, { side: 'left', v: a.F, cls: 'z-no', label: '← l\'entrée tomberait sous la moyenne 200 j : interdit' })) +
          '<div class="tiles">' + tile('Prix d\'hier soir', px(a.P)) + (a.P > a.F ? tile('Niveau d\'entrée', px(a.X)) : '') + tile('Moyenne 200 jours', px(a.F)) + '</div>';
      }
      k = o.k; chart = { k: k, from: IDX[k].c.length - 60, refs: ok ? [{ v: a.X, label: 'entrée ' + px(a.X), cls: 'ref-buy', tail: true }] : [] };
    } else if (type === 'cours') {
      o = plan(parts[1]); var tr = o.trade, a2 = o.a, last = o.I.days[o.I.days.length - 1], prog = Math.max(0, Math.min(1, (last - tr.d1) / Math.max(1, tr.deadline - tr.d1)));
      var exitNow = o.tone === 'act' || o.step === 3;
      html = '<div class="sh-head">' + BUY + '<div><h2>' + o.I.name + '</h2><small>' + o.I.sym + ' · ' + nf(tr.lots, 2) + ' lots · ' + (tr.real ? 'noté au journal' : 'selon la règle') + '</small></div></div>' +
        '<div class="sh-pl ' + (tr.pnl >= 0 ? 'pos' : 'neg') + '">' + sUsd(tr.pnl) + '<small>' + pct(tr.pnl / cfg.size) + ' du compte</small></div>' +
        '<div class="big-state ' + (exitNow ? 'act' : 'ok') + '">' + (a2.forced ? '⏱ Dernier jour : sortir ce soir' : exitNow ? '✓ Sortir ce soir' : '✋ Garder le trade') + '</div>' +
        thermo([{ v: tr.p1, label: 'entrée', cls: 'k-buy' }, { v: a2.Y, label: 'sortie', cls: 'k-out' }].concat(tr.stop ? [{ v: tr.stop, label: 'stop', cls: 'k-stop' }] : []), tr.cur,
          { side: 'right', v: a2.Y, cls: 'z-out', label: 'zone de sortie : prix de 22 h au-dessus de ' + px(a2.Y) + ' →' }) +
        '<div class="days"><div class="track"><div class="fill" style="width:' + prog * 100 + '%"></div></div><div class="labels"><span>entrée ' + shortDay(tr.d1) + '</span><span><b>' + jours(last - tr.d1) + '</b></span><span>sortie max ' + shortDay(tr.deadline) + '</span></div></div>' +
        '<div class="tiles">' + tile('Prix d\'entrée', px(tr.p1)) + tile('Prix actuel', px(tr.cur)) + tile('Niveau de sortie', px(a2.Y)) +
        tile('Variation de l\'indice', pct(tr.r), tr.r >= 0 ? 'pos' : 'neg') + tile('Hausse nécessaire pour sortir', a2.Y > tr.cur ? pct(a2.Y / tr.cur - 1) : 'atteinte', a2.Y > tr.cur ? '' : 'pos') + tile('Lots', nf(tr.lots, 2)) + tile('Stop', tr.stop ? px(tr.stop) : 'aucun') + tile('Valeur du trade', usd(tr.cur * tr.lots * (+cfg.ct[o.k] || 1))) +
          tile('Marge bloquée', margeTxt(tr.cur * tr.lots * (+cfg.ct[o.k] || 1))) + tile('Levier max', '1:' + levMax()) + '</div>' +
        inputBox(o) + (exitNow ? '<div class="act-line"><span class="side out">SORTIR</span> MT5 → onglet Trade → <b>croix ×</b> sur ' + o.I.sym + ' (pas « Sell »)</div>' : '');
      k = o.k; var ei = IDX[k].days.findIndex(function (d) { return d >= tr.d1; });
      chart = { k: k, from: Math.max(0, ei - 5), entry: ei, exitLine: true, refs: [{ v: tr.p1, label: 'entrée ' + px(tr.p1), cls: 'ref-buy' }].concat(tr.stop ? [{ v: tr.stop, label: 'stop', cls: 'ref-stop', zone: 'below' }] : []), y: a2.Y };
    } else {
      var t = doneList().filter(function (x) { return x.id === id.slice(5); })[0];
      if (!t) { closeSheet(); return; }
      k = t.k;
      html = '<div class="sh-head">' + BUY + '<div><h2>' + IDX[k].name + '</h2><small>' + IDX[k].sym + ' · ' + (t.src === 'journal' ? 'mon trade (journal)' : 'trade de la règle') + '</small></div></div>' +
        '<div class="sh-pl ' + (t.usd >= 0 ? 'pos' : 'neg') + '">' + sUsd(t.usd) + '<small>' + pct(t.usd / cfg.size) + ' du compte</small></div>' +
        '<div class="big-state ' + (t.usd >= 0 ? 'ok' : 'idle') + '">' + (t.usd >= 0 ? '✓ Trade gagnant' : '✗ Trade perdant') + '</div>' +
        '<div class="tiles">' + tile('Entrée', shortDay(t.e) + ' · ' + px(t.pe)) + tile('Sortie', shortDay(t.x) + ' · ' + px(t.px)) + tile('Durée', jours(t.x - t.e)) +
        tile('Variation de l\'indice', pct(t.g), t.g >= 0 ? 'pos' : 'neg') + tile('Résultat', sUsd(t.usd), t.usd >= 0 ? 'pos' : 'neg') + tile('Lots', t.lots ? nf(t.lots, 2) : nf(lotsFor(k, t.pe).lots, 2)) + '</div>' +
        (t.src === 'regle' ? '<p class="muted">Calculé sur ton compte de ' + usd(cfg.size) + ' à ' + nf(cfg.lev, 1) + ' ×, frais estimés compris.</p>' : '');
      var I = IDX[k], ie = I.days.findIndex(function (d) { return d >= t.e; }), ix = I.days.findIndex(function (d) { return d >= t.x; });
      chart = { k: k, from: Math.max(0, ie - 5), to: Math.min(I.days.length, ix + 4), refs: [{ v: t.pe, label: 'entrée ' + px(t.pe), cls: 'ref-buy' }, { v: t.px, label: 'sortie ' + px(t.px), cls: 'ref-sell' }] };
    }
    $('sheet-body').innerHTML = html + '<h3 style="margin:16px 0 0">Graphique</h3><div class="chart" id="sheet-ch"></div>';
    $('sheet').hidden = false; document.body.classList.add('noscroll'); sheetId = id;
    if (!refresh) $('sheet').querySelector('.sheet').scrollTop = 0;
    var I2 = IDX[chart.k], to = chart.to || I2.days.length, xs = I2.days.slice(chart.from, to), ys = I2.c.slice(chart.from, to), series = [{ name: 'Prix de fin de journée', v: ys, c: '--s1' }];
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
  function legs(stop) {
    var out = [];
    ['spx', 'ndx'].forEach(function (k) {
      var I = IDX[k], c = I.c, l = I.l, d = I.days, st = A[k].st;
      var all = st.trades.slice(); if (st.open !== null) all.push([st.open, c.length - 1, true]);
      all.forEach(function (t) {
        var i = t[0], j = t[1], sp = stop ? c[i] * (1 - stop) : null, days = [], exitIdx = j, stopped = false;
        for (var q = i + 1; q <= j; q++) {
          var f = FIN * (d[q] - d[q - 1]) + (q === i + 1 ? COST : 0);
          if (sp && l[q] <= sp) { var rr = sp / c[q - 1] - 1 - f; days.push({ d: d[q], r: rr, rl: rr }); exitIdx = q; stopped = true; break; }
          days.push({ d: d[q], r: c[q] / c[q - 1] - 1 - f, rl: Math.min(l[q], c[q]) / c[q - 1] - 1 - f });
        }
        var gross = (stopped ? sp : c[exitIdx]) / c[i] - 1, net = days.reduce(function (s, x) { return (1 + s) * (1 + x.r) - 1; }, 0);
        out.push({ k: k, e: d[i], x: d[exitIdx], pe: c[i], px: stopped ? sp : c[exitIdx], n: exitIdx - i, gross: gross, net: net, open: !!t[2] && !stopped, stopped: stopped, days: days });
      });
    });
    return out;
  }
  function byDay(L) { var b = {}; L.forEach(function (t) { t.days.forEach(function (x) { (b[x.d] = b[x.d] || []).push({ e: t.e, r: x.r, rl: x.rl }); }); }); return b; }

  /* compte FundedNext Stellar 2-Step simule depuis s0, compte crame remplace aussitot */
  function simAccount(s0, e0) {
    var size = +cfg.size, lev = +cfg.lev, fee = FEES[size] || 299.99, Bns = byDay(legs(null)), Bs = byDay(legs(stopPct()));
    var days = Object.keys(Bns).concat(Object.keys(Bs)).map(Number).concat(IDX.spx.days).filter(function (d) { return d > s0 && d <= e0; });
    days = days.filter(function (d, i) { return days.indexOf(d) === i; }).sort(function (a, b) { return a - b; });
    var ev = [], fees = fee, paid = 0, blown = 0, curve = [], a = { ph: 1, bal: size, since: s0, due: null, ref: false, n: 1 };
    ev.push([days[0] || s0, 'Achat du compte ' + a.n + ' (' + usd(fee, 2) + ')', '']);
    days.forEach(function (d) {
      var B = a.ph < 3 ? Bns : Bs, mine = (B[d] || []).filter(function (x) { return x.e >= a.since; });
      var pnl = 0, worst = 0; mine.forEach(function (x) { pnl += size * lev * x.r; worst += size * lev * x.rl; });
      if (worst <= -0.05 * size || a.bal + worst <= 0.9 * size || pnl <= -0.05 * size) {
        blown++; ev.push([d, 'Compte ' + a.n + ' cramé en ' + (a.ph < 3 ? 'phase ' + a.ph : 'compte financé') + ' (perte ' + usd(Math.min(worst, pnl)) + ' dans la journée)', 'bad']);
        a = { ph: 1, bal: size, since: d, due: null, ref: false, n: a.n + 1 }; fees += fee; ev.push([d, 'Achat du compte ' + a.n + ' (' + usd(fee, 2) + ')', '']);
      } else {
        a.bal += pnl;
        if (a.ph === 1 && a.bal >= size * 1.08) { ev.push([d, 'Phase 1 réussie (+8 %)', 'ok']); a.ph = 2; a.bal = size; a.since = d; }
        else if (a.ph === 2 && a.bal >= size * 1.05) { ev.push([d, 'Phase 2 réussie : compte financé', 'ok']); a.ph = 3; a.bal = size; a.since = d; a.due = d + 21; }
        else if (a.ph === 3 && d >= a.due) {
          a.due = d + 14;
          if (a.bal > size) { var amt = 0.8 * (a.bal - size) + (a.ref ? 0 : fee); paid += amt; ev.push([d, 'Paiement ' + usd(amt) + (a.ref ? '' : ' (prix du compte remboursé)'), 'ok']); a.ref = true; a.bal = size; }
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
      '<div class="legend"><span><i style="background:var(--s1);height:8px"></i>Gain</span><span><i style="background:var(--s2);height:8px"></i>Perte</span></div>';
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

  function renderBilan() {
    var sel = $('b-year'), lastDay = Math.max(A.spx.last, A.ndx.last), lastY = new Date(lastDay * DAY).getUTCFullYear(), firstY = new Date(IDX.spx.days[0] * DAY).getUTCFullYear() + 1;
    if (!sel.options.length) {
      for (var y = lastY; y >= Math.max(firstY, 2023); y--) sel.add(new Option(y === lastY ? y + ' · en cours' : String(y), y));
      sel.value = String(store.get('year', lastY)); if (!sel.value) sel.value = String(lastY);
    }
    var Y0 = +sel.value, s0 = dn(Y0 + '-01-01') - 1, e0 = Math.min(lastDay, dn(Y0 + '-12-31')), size = +cfg.size, lev = +cfg.lev, pos = size * lev;
    $('b-conf').textContent = 'Compte FundedNext Stellar 2-Step de ' + usd(size) + ', ' + nf(lev, 1) + ' × par indice (' + usd(pos) + ' par position), du 2 janvier au ' +
      (e0 === lastDay ? shortDay(lastDay) + ' (dernière clôture)' : '31 décembre') + '. Change la taille dans Compte.';

    /* trades de l'annee (sans stop : performance brute de la regle) */
    var T = legs(null).filter(function (t) { return t.e > s0 && t.e <= e0; }).sort(function (a, b) { return a.e - b.e; });
    var closed = T.filter(function (t) { return !t.open; }), win = 0, sumG = 0, sumN = 0, dur = 0, best = -1, worst = 1;
    closed.forEach(function (t) { if (t.net > 0) win++; sumG += t.gross; sumN += t.net; dur += t.x - t.e; best = Math.max(best, t.net); worst = Math.min(worst, t.net); });

    /* courbe : performance cumulee en % du compte (jour par jour, frais compris) */
    var bd = byDay(T), days = IDX.spx.days.filter(function (d) { return d > s0 && d <= e0; }), cum = 0, peak = 0, mdd = 0, xs = [], ys = [];
    days.forEach(function (d) { (bd[d] || []).forEach(function (x) { cum += lev * x.r; }); peak = Math.max(peak, cum); mdd = Math.min(mdd, cum - peak); xs.push(d); ys.push(cum * 100); });
    var sim = simAccount(s0, e0), net = sim.paid - sim.fees;

    $('b-kpis').innerHTML = [
      ['Trades', closed.length + (T.length > closed.length ? ' + 1 ouvert' : ''), ''],
      ['Gagnants', closed.length ? Math.round(win / closed.length * 100) + ' %' : '—', ''],
      ['Gain moyen', closed.length ? pct(sumN / closed.length, 2) : '—', 'par trade, indice'],
      ['Durée moyenne', closed.length ? nf(dur / closed.length, 1) + ' jours' : '—', ''],
      ['Performance', pct(cum, 1), 'du compte à ' + nf(lev, 1) + ' ×'],
      ['Pire recul', pct(mdd, 1), 'du compte'],
      ['Comptes cramés', String(sim.blown), sim.blown ? 'remplacés aussitôt' : ''],
      ['Bilan FundedNext', sUsd(net), 'paiements − frais']
    ].map(function (k) { return '<div><span>' + k[0] + '</span><b>' + k[1] + '</b>' + (k[2] ? '<small>' + k[2] + '</small>' : '') + '</div>'; }).join('');

    $('b-perf-sub').textContent = 'Gain cumulé en % du compte, frais de nuit et spread estimés compris, sans stop.';
    if (xs.length >= 2) lineChart($('b-perf'), { x: xs, series: [{ name: 'Performance', v: ys, c: '--s1' }], height: 210, label: 'Performance cumulée de la règle en ' + Y0, fmt: function (v) { return nf(v, 1) + ' %'; } });
    else $('b-perf').innerHTML = '<p class="empty">Pas encore assez de données.</p>';

    var st = sim.a, now = st.ph < 3 ? 'Compte ' + st.n + ' en phase ' + st.ph + ', ' + pct((st.bal - size) / size) + ' sur l\'étape' : 'Compte ' + st.n + ' financé, ' + usd(st.bal - size) + ' de gain en cours';
    $('b-acct').innerHTML = '<h2>Compte FundedNext simulé</h2><div class="signal" style="margin-top:0">' + sUsd(net) + '<small>' + usd(sim.paid) + ' de paiements, ' + usd(sim.fees, 0) + ' de frais. ' + esc(now) + '.</small></div>' +
      '<ul class="timeline">' + sim.ev.map(function (e) { return '<li><time>' + shortDay(e[0]) + '</time><span class="' + e[2] + '">' + esc(e[1]) + '</span></li>'; }).join('') + '</ul>' +
      '<p class="muted">Limite de perte vérifiée sur le plus bas du jour ; stop de ' + nf(stopPct() * 100, 1) + ' % une fois financé.</p>';

    var money = function (t) { return pos * t.net; };
    barChart($('b-bars'), {
      v: closed.map(money), label: 'Résultat de chaque trade en ' + Y0, height: 200, fmtAxis: function (v) { return nf(v, 0); },
      xl: closed.length ? [[0, shortDay(closed[0].e)], [closed.length - 1, shortDay(closed[closed.length - 1].e)]] : null,
      tip: function (i) { var t = closed[i]; return '<div>' + IDX[t.k].name + ' · ' + shortDay(t.e) + ' → ' + shortDay(t.x) + '</div><div><b>' + sUsd(money(t)) + '</b> · indice ' + pct(t.gross) + ' · ' + jours(t.x - t.e) + '</div>'; }
    });
    var months = [], mv = [];
    for (var m = 0; m < 12; m++) { var md = dn(Y0 + '-' + String(m + 1).padStart(2, '0') + '-01'); if (md > e0) break; months.push(m); mv.push(0); }
    closed.forEach(function (t) { var m = new Date(t.x * DAY).getUTCMonth(); if (new Date(t.x * DAY).getUTCFullYear() === Y0 && m < mv.length) mv[m] += money(t); });
    barChart($('b-month'), {
      v: mv, label: 'Résultat par mois en ' + Y0, height: 200, fmtAxis: function (v) { return nf(v, 0); },
      xl: months.map(function (m) { return [m, MOIS[m]]; }).filter(function (p, i) { return mv.length <= 6 || i % 2 === 0; }),
      tip: function (i) { var n = closed.filter(function (t) { return new Date(t.x * DAY).getUTCMonth() === i && new Date(t.x * DAY).getUTCFullYear() === Y0; }).length; return '<div>' + MOIS[i] + ' ' + Y0 + '</div><div><b>' + sUsd(mv[i]) + '</b> · ' + n + ' trade' + (n > 1 ? 's' : '') + '</div>'; }
    });

    $('b-list').innerHTML = T.length ? T.slice().reverse().map(function (t) {
      return '<tr><td>' + IDX[t.k].name + '</td><td>' + shortDay(t.e) + '</td><td>' + px(t.pe) + '</td><td>' + (t.open ? '<b>en cours</b>' : shortDay(t.x)) + '</td><td>' + (t.open ? px(IDX[t.k].c[IDX[t.k].c.length - 1]) : px(t.px)) +
        '</td><td>' + jours((t.open ? IDX[t.k].days[IDX[t.k].days.length - 1] : t.x) - t.e) + '</td><td class="' + (t.gross >= 0 ? 'pos' : 'neg') + '">' + pct(t.gross) + '</td><td class="' + (t.net >= 0 ? 'pos' : 'neg') + '">' + sUsd(money(t)) + (t.open ? ' *' : '') + '</td></tr>';
    }).join('') : '<tr><td colspan="8" class="empty">Aucun signal sur la période.</td></tr>';
  }

  function renderAll() {
    if (!A.spx) return;
    renderBord(); renderOrdres(); renderCompte(); renderJournal(); renderBilan();
  }

  /* ---------- navigation ---------- */
  var VIEWS = ['bord', 'ordres', 'compte', 'journal', 'regle'];
  function show(v) {
    if (VIEWS.indexOf(v) < 0) v = 'bord';
    VIEWS.forEach(function (k) { $('v-' + k).hidden = k !== v; });
    document.querySelectorAll('.nav button').forEach(function (b) { if (b.dataset.v === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    if (sheetId) closeSheet();
    $('title').textContent = $('v-' + v).dataset.title;
    store.set('tab', v); window.scrollTo(0, 0);
    if (A.spx) { if (v === 'bord') renderBord(); if (v === 'journal') renderJournal(); if (v === 'regle') renderBilan(); if (v === 'ordres') renderOrdres(); }
  }
  document.querySelectorAll('.nav button').forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.v); }); });
  document.addEventListener('click', function (ev) {
    var go = ev.target.closest('[data-go]'); if (go) { show(go.dataset.go); return; }
    var ot = ev.target.closest('[data-otab]'); if (ot) { otab = ot.dataset.otab; store.set('otab', otab); renderOrdres(); return; }
    var sh = ev.target.closest('[data-sheet]'); if (sh) { openSheet(sh.dataset.sheet); return; }
    if (ev.target.closest('[data-close]')) { closeSheet(); return; }
    var ed = ev.target.closest('[data-edit]'); if (ed) { fillForm(trades.filter(function (t) { return t.id === ed.dataset.edit; })[0]); $('j-form-title').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    var del = ev.target.closest('[data-del]');
    if (del && confirm('Supprimer ce trade du journal ?')) { trades = trades.filter(function (t) { return t.id !== del.dataset.del; }); store.set('trades', trades); renderAll(); }
  });
  document.addEventListener('input', function (ev) {
    var k = ev.target.dataset && ev.target.dataset.manual; if (!k) return;
    var v = parseFloat(String(ev.target.value).replace(',', '.'));
    manual[k] = v > 0 ? { p: v, day: session } : null; store.set('manual', manual);
    clearTimeout(ev.target._t); ev.target._t = setTimeout(function () { renderOrdres(); renderIdxCard(k); var el = document.querySelector('#sheet [data-manual="' + k + '"]') || document.querySelector('[data-manual="' + k + '"]'); if (el) el.focus(); }, 500);
  });

  $('b-year').addEventListener('change', function () { store.set('year', +$('b-year').value); renderBilan(); });

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
    document.documentElement.dataset.theme = next; store.set('theme', next); applyTheme();
  });
  applyTheme();

  /* ---------- reglages ---------- */
  function loadCfg() {
    $('c-size').value = String(cfg.size); $('c-lev').value = String(cfg.lev); $('c-phase').value = String(cfg.phase); $('c-start').value = cfg.start || '';
    $('c-bal').value = cfg.bal || ''; $('c-ct-spx').value = cfg.ct.spx; $('c-ct-ndx').value = cfg.ct.ndx; $('c-step').value = cfg.step;
  }
  ['c-size', 'c-lev', 'c-phase', 'c-start', 'c-bal', 'c-ct-spx', 'c-ct-ndx', 'c-step'].forEach(function (id) {
    $(id).addEventListener('change', function () {
      cfg.size = +$('c-size').value; cfg.lev = +$('c-lev').value; cfg.phase = +$('c-phase').value; cfg.start = $('c-start').value; cfg.bal = $('c-bal').value;
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
  loadCfg(); fillForm(null); show(store.get('tab', 'bord'));
  var tr; window.addEventListener('resize', function () { clearTimeout(tr); tr = setTimeout(renderAll, 200); });

  function load() {
    return Promise.all([
      fetch('../data/market.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }),
      fetch('../data/live.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    ]).then(function (res) {
      var D = res[0]; LIVE = res[1];
      Object.keys(IDX).forEach(function (k) { var d = 0; IDX[k].c = D.idx[k].c; IDX[k].l = D.idx[k].l || D.idx[k].c; IDX[k].days = D.idx[k].d.map(function (x) { d += x; return d; }); A[k] = analyze(k); });
      var lu = LIVE && LIVE.updated ? ' · relevé auto ' + hm(Date.parse(LIVE.updated)) : '';
      $('stamp').textContent = 'Clôtures au ' + shortDay(Math.max(A.spx.last, A.ndx.last)) + ' ' + new Date(A.spx.last * DAY).getUTCFullYear() + lu;
      renderAll();
    }).catch(function () { $('stamp').textContent = 'Cours indisponibles : vérifie ta connexion puis rouvre l\'application.'; });
  }
  load();
  setInterval(function () { if (document.visibilityState === 'visible') load(); }, 5 * 60000);   // nouveaux releves pendant la soiree
  setInterval(function () { if (A.spx && !$('v-bord').hidden) renderBord(); }, 30000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') load(); });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('../sw.js', { scope: '../' }).catch(function () { /* hors ligne non disponible */ });
})();
