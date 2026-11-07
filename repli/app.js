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

  function verdict(a, p) {
    if (a.mode === 'flat') {
      if (!a.possible) return { cls: 'none', txt: 'Pas d\'achat ce soir', sub: 'Le seuil d\'achat passerait sous la moyenne 200 jours.' };
      if (p == null) return null;
      if (p < a.X && p > a.F) return { cls: 'buy', txt: 'Achat à la clôture', sub: 'Le prix (' + px(p) + ') est sous le seuil ' + px(a.X) + '. Si ça tient jusqu\'à la clôture, on achète.' };
      return { cls: 'none', txt: 'Pas d\'achat pour l\'instant', sub: 'Le prix (' + px(p) + ') est ' + pct(p / a.X - 1) + ' au-dessus du seuil ' + px(a.X) + '.' };
    }
    if (a.forced) return { cls: 'sell', txt: 'Vendre à la clôture', sub: 'Durée maximale atteinte (environ 2 semaines) : on sort quoi qu\'il arrive.' };
    if (p == null) return null;
    if (p > a.Y) return { cls: 'sell', txt: 'Vendre à la clôture', sub: 'Le prix (' + px(p) + ') dépasse ' + px(a.Y) + ' : le rebond est là.' };
    return { cls: 'ok', txt: 'On garde la position', sub: 'Le prix (' + px(p) + ') est sous ' + px(a.Y) + ' (' + pct(a.Y / p - 1) + ' à faire).' };
  }

  function lotsFor(k, price) {
    var units = cfg.size * cfg.lev / price, ct = +cfg.ct[k] || 1, step = +cfg.step || 0.01;
    var lots = Math.floor(units / ct / step + 1e-9) * step;
    return { lots: +lots.toFixed(6), notional: lots * ct * price };
  }
  var stopPct = function () { return 0.015 / cfg.lev; };
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
    refs.slice().sort(function (a, b) { return b.v - a.v; }).forEach(function (r, q, arr) {
      var y = Y(r.v), prev = q ? Y(arr[q - 1].v) : -99, below = y - prev < 16 && q > 0;
      g += '<line class="' + (r.cls || 'ref') + '" x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '"/><text class="reflab" x="' + (W - R) + '" y="' + (below ? y + 14 : y - 5) + '" text-anchor="end">' + esc(r.label) + '</text>';
    });
    o.series.forEach(function (s) {
      var d = ''; s.v.forEach(function (v, i) { if (isFinite(v)) d += (d ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); });
      g += '<path class="ln" d="' + d + '" stroke="var(' + s.c + ')"/>';
    });
    g += '<g class="hov" style="display:none"><line class="cross" y1="' + T + '" y2="' + (H - B) + '"/>' + o.series.map(function (s) { return '<circle class="dot" r="4" fill="var(' + s.c + ')"/>'; }).join('') + '</g>';
    g += '<rect x="' + L + '" y="0" width="' + (W - L - R) + '" height="' + H + '" fill="transparent" class="hit"/>';
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.label || '') + '">' + g + '</svg><div class="tip" hidden></div>' +
      (o.series.length > 1 ? '<div class="legend">' + o.series.map(function (s) { return '<span><i style="background:var(' + s.c + ')"></i>' + esc(s.name) + '</span>'; }).join('') + '</div>' : '');
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

  function renderBord() {
    var today = parisToday(), lastDay = Math.max(A.spx.last, A.ndx.last);
    session = nextTrading(lastDay);
    var cl = closeUTC(session), now = Date.now(), early = EARLY.indexOf(ds(session)) >= 0;
    $('today').textContent = longDay(today) + ' ' + new Date(today * DAY).getUTCFullYear();

    /* carte principale */
    var acts = [], pos = [];
    ['spx', 'ndx'].forEach(function (k) {
      var a = A[k];
      if (a.mode === 'pos') pos.push(a.name + (a.forced ? ' (vente ce soir)' : ''));
      else if (a.possible) acts.push(a.name);
    });
    var when = session === today ? 'Ce soir' : (session === today + 1 ? 'Demain soir' : longDay(session).replace(/^./, function (c) { return c.toUpperCase(); }));
    var big, sub;
    if (acts.length && pos.length) { big = when + ' : achat possible sur le ' + acts.join(' et le ') + ', position ouverte sur le ' + pos.join(' et le '); }
    else if (acts.length) { big = when + ' : achat possible sur le ' + acts.join(' et le '); }
    else if (pos.length) { big = when + ' : position ouverte sur le ' + pos.join(' et le '); }
    else { big = when + ' : rien à faire'; }
    sub = acts.length || pos.length ? 'Les seuils exacts et le nombre de lots sont dans Ordres. Agis dans les 10 dernières minutes avant la clôture.' :
      'Aucun indice ne peut donner de signal à la prochaine clôture. Profites-en.';
    $('hero').innerHTML = '<h3>Prochaine clôture · ' + longDay(session) + '</h3><div class="big">' + esc(big) + '</div><p>' + sub + '</p>' +
      '<div class="chips"><span class="chip">Compte ' + nf(cfg.size / 1000) + 'k · ' + (cfg.phase == 3 ? 'financé' : 'phase ' + cfg.phase) + '</span><span class="chip">Taille ' + nf(cfg.lev, 1) + ' × par indice</span>' +
      (cfg.phase == 3 ? '<span class="chip">Stop ' + nf(stopPct() * 100, 1) + ' %</span>' : '') + '</div>' +
      (acts.length || pos.length ? '<button class="btn" data-go="ordres">Voir les ordres</button>' : '');

    /* horloge */
    var left = cl - now, total = 6.5 * 3600000, done = Math.max(0, Math.min(1, 1 - left / total));
    var clockTxt = left > 0 ? (left > 36 * 3600000 ? longDay(session) : 'dans ' + Math.floor(left / 3600000) + ' h ' + String(Math.floor(left % 3600000 / 60000)).padStart(2, '0')) : 'clôture passée';
    $('clock').className = 'card s4 clock';
    $('clock').innerHTML = '<h3>Clôture de New York</h3><div class="when">' + hm(cl) + '</div><div class="muted" style="margin:0">' + esc(clockTxt) +
      (early ? ' · la Bourse ferme plus tôt ce jour-là' : '') + '</div><div class="bar"><i style="width:' + (left > 0 && left < total ? done * 100 : 0) + '%"></i></div>' +
      '<div class="muted" style="margin:0">Fenêtre d\'action : <b>' + hm(cl - 600000) + ' – ' + hm(cl) + '</b> (heure de Paris).' +
      (left <= 0 && session === today ? ' Les nouveaux seuils arrivent vers ' + hm(cl + 45 * 60000) + '.' : '') + '</div>';

    ['spx', 'ndx'].forEach(function (k) { renderIdxCard(k); });
    renderMiniAcct(); renderAlerts(); renderMiniJournal();
  }

  function renderIdxCard(k) {
    var a = A[k], I = IDX[k], c = I.c, n = c.length, np = nowPrice(k, session), v = verdict(a, np ? np.p : null), pill, sig, small;
    if (a.mode === 'pos') {
      pill = a.forced ? '<span class="pill sell"><i></i>Vente ce soir</span>' : '<span class="pill hold"><i></i>En position</span>';
      sig = a.forced ? 'Vendre à la clôture (durée maximale atteinte)' : 'Vendre si la clôture dépasse ' + px(a.Y);
      small = 'Acheté le ' + shortDay(a.entryDay) + ' à ' + px(a.entry) + ' · ' + pct(a.pnl) + ' à la dernière clôture · ouvert depuis ' + jours(a.last - a.entryDay) + ' · vente au plus tard le ' + longDay(deadline(a));
    } else if (a.possible) {
      pill = '<span class="pill buy"><i></i>Achat possible</span>';
      sig = 'Acheter si la clôture est sous ' + px(a.X);
      small = 'Soit ' + pct(a.X / a.P - 1) + ' par rapport à la dernière clôture (' + px(a.P) + '), et au-dessus de ' + px(a.F) + '.';
    } else {
      pill = '<span class="pill none"><i></i>Pas de signal</span>';
      sig = 'Pas d\'achat possible ce soir';
      small = a.P <= a.F ? 'L\'indice est sous sa moyenne 200 jours (' + px(a.F) + ') : la règle reste à l\'écart.' : 'Il faudrait passer sous ' + px(a.X) + ', donc sous la moyenne 200 jours.';
    }
    var live = np ? '<div class="verdict ' + (v ? v.cls : '') + '">' + (v ? esc(v.txt) : '') + '<small>' + (v ? esc(v.sub) + ' ' : '') + 'Prix : ' + esc(np.src) + '.</small></div>' : '';
    $('idx-' + k).innerHTML = '<div class="head"><div><div class="name">' + I.name + '</div><div class="sym">' + I.sym + ' chez FundedNext</div></div>' + pill + '</div>' +
      '<div class="signal">' + esc(sig) + '<small>' + esc(small) + '</small></div>' + live +
      '<div class="stats"><div><span>Dernière clôture</span><b>' + px(a.P) + '</b></div><div><span>RSI 2 jours</span><b>' + nf(a.rsi, 0) + '</b></div>' +
      '<div><span>Moyenne 200 j</span><b>' + px(a.sma200) + '</b></div><div><span>Écart</span><b>' + pct(a.P / a.sma200 - 1) + '</b></div></div>' +
      '<div class="chart" id="ch-' + k + '"></div>';
    var from = Math.max(0, n - 130);
    lineChart($('ch-' + k), {
      x: I.days.slice(from), height: 170, label: I.name + ', clôtures et moyenne 200 jours',
      series: [{ name: 'Clôture', v: c.slice(from), c: '--s1' }, { name: 'Moyenne 200 jours', v: a.st.sma200.slice(from), c: '--s2' }],
      ref: a.mode === 'pos' ? { v: a.Y, label: 'seuil de vente ' + px(a.Y) } : (a.possible ? { v: a.X, label: 'seuil d\'achat ' + px(a.X) } : null),
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
    if (stale) out.push(['crit', '!', '<b>Cours en retard.</b> La dernière clôture date du ' + shortDay(Math.max(A.spx.last, A.ndx.last)) + '. Rouvre l\'application plus tard.']);
    if (s.inactive >= 45) out.push([s.inactive >= 55 ? 'crit' : 'warn', '!', '<b>Inactivité : ' + s.inactive + ' jours sans trade.</b> Le compte est désactivé à 60 jours (' + shortDay(s.deadline) + '). Ouvre et ferme une mini-position.']);
    if (cfg.phase == 3) out.push(['', 'i', '<b>Stop obligatoire</b> sur chaque position : ' + nf(stopPct() * 100, 1) + ' % sous le prix d\'achat (risque total ≤ 3 %).']);
    if (s.payout !== null) out.push(['ok', '$', '<b>Prochain paiement possible le ' + shortDay(s.payout) + '</b> · environ ' + usd(Math.max(0, (s.bal - s.size) * 0.8)) + ' à ce jour (80 %).']);
    var ns = nextTrading(today - 1);
    for (var d = today; d <= today + 10; d++) {
      if (HOLIDAYS.indexOf(ds(d)) >= 0 && new Date(d * DAY).getUTCDay() % 6) { out.push(['', 'i', '<b>Bourse de New York fermée le ' + longDay(d) + '.</b> Pas de clôture ce jour-là.']); break; }
      if (EARLY.indexOf(ds(d)) >= 0) { out.push(['warn', '!', '<b>La Bourse ferme plus tôt le ' + longDay(d) + '</b> : clôture à ' + hm(closeUTC(d)) + ' (heure de Paris).']); break; }
    }
    if (s.target && s.bal >= s.target) out.push(['ok', '✓', '<b>Objectif de la phase atteint.</b> Vérifie les 5 jours de trading, puis passe à l\'étape suivante dans Compte.']);
    if (!out.length) out.push(['ok', '✓', '<b>Rien à signaler.</b> Compte actif, cours à jour.']);
    void ns;
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
    $('mini-journal').innerHTML = '<h3>Journal</h3><div class="signal" style="margin-top:6px">' + sUsd(tot) + '<small>' + closedT.length + ' trades clôturés' +
      (closedT.length ? ' · ' + Math.round(win / closedT.length * 100) + ' % gagnants' : '') + '</small></div>' +
      (last.length ? '<dl class="rows">' + last.map(function (t) { var p = pnlOf(t); return '<div><dt>' + IDX[t.idx].name + ' · ' + shortDay(dn(t.d1)) + (t.d2 ? '' : ' (ouvert)') + '</dt><dd class="' + (p >= 0 ? 'pos' : 'neg') + '">' + sUsd(p) + '</dd></div>'; }).join('') + '</dl>'
        : '<p class="empty">Aucun trade noté. Ajoute tes trades démo dans Journal.</p>') +
      '<button class="btn ghost small" data-go="journal">Ouvrir le journal</button>';
  }

  /* positions ouvertes : celles du journal, sinon celles de la regle (theoriques) */
  function positions() {
    var out = [];
    ['spx', 'ndx'].forEach(function (k) {
      var a = A[k], mine = trades.filter(function (t) { return t.idx === k && !t.d2; });
      if (mine.length) mine.forEach(function (t) { out.push({ k: k, real: true, d1: dn(t.d1), p1: t.p1, lots: t.lots, fee: +t.fee || 0, kind: t.kind, rule: a.mode === 'pos' ? a : null }); });
      else if (a.mode === 'pos') out.push({ k: k, real: false, d1: a.entryDay, p1: a.entry, lots: lotsFor(k, a.entry).lots, fee: 0, rule: a });
    });
    return out;
  }

  function renderPositions() {
    var P = positions(), box = $('o-pos'), tot = 0;
    $('o-sec2').textContent = P.length ? (P.length === 1 ? 'Une position ouverte.' : P.length + ' positions ouvertes.') + ' Les chiffres se mettent à jour avec le prix du moment.' :
      'Aucune position ouverte pour l\'instant.';
    if (!P.length) { box.innerHTML = '<article class="card s12"><p class="empty" style="padding:0">Rien en cours. Quand la règle achète, la position apparaîtra ici avec son résultat et son graphique.</p></article>'; return 0; }
    box.innerHTML = P.map(function (p, i) { return '<article class="card ' + (P.length > 1 ? 's6' : 's12') + ' posc" id="pos-' + i + '"></article>'; }).join('');
    P.forEach(function (p, i) {
      var I = IDX[p.k], a = p.rule, np = nowPrice(p.k, session), cur = np ? np.p : I.c[I.c.length - 1], ct = +cfg.ct[p.k] || 1;
      var pnl = (cur - p.p1) * p.lots * ct - p.fee, r = cur / p.p1 - 1, stop = cfg.phase == 3 ? p.p1 * (1 - stopPct()) : null; tot += pnl;
      var pill = !p.real ? '<span class="pill none"><i></i>Selon la règle</span>' : '<span class="pill hold"><i></i>Noté au journal</span>';
      var html = '<div class="head"><div><div class="name">' + I.name + '</div><div class="sym">' + I.sym + ' · ' + nf(p.lots, 2) + ' lots achetés le ' + shortDay(p.d1) + ' à ' + px(p.p1) + '</div></div>' + pill + '</div>' +
        '<div class="pl ' + (pnl >= 0 ? 'pos' : 'neg') + '">' + sUsd(pnl) + '<small>' + pct(r) + '</small></div>' +
        '<div class="src">' + (np ? 'Au prix ' + esc(np.src) + ' : ' + px(cur) : 'À la clôture du ' + shortDay(I.days[I.days.length - 1]) + ' : ' + px(cur)) + (p.real ? '' : ' · position théorique, pas encore notée dans le journal') + '</div>';
      var hit = null;
      if (stop) for (var q = 0; q < I.days.length; q++) if (I.days[q] > p.d1 && I.l[q] <= stop) { hit = I.days[q]; break; }
      if (hit) {
        html += '<div class="verdict sell">Stop touché le ' + longDay(hit) + '<small>Le cours est descendu sous ' + px(stop) + ' : MT5 a fermé la position automatiquement, avec une perte d\'environ ' +
          usd(p.p1 * stopPct() * p.lots * ct) + '. Note la vente dans le journal avec le prix obtenu.</small></div>';
      } else if (a) {
        var dl = deadline(a), last = I.days[I.days.length - 1], prog = Math.max(0, Math.min(1, (last - p.d1) / Math.max(1, dl - p.d1)));
        var need = a.Y / cur - 1;
        html += '<div class="verdict ' + (a.forced ? 'sell' : need <= 0 ? 'sell' : 'ok') + '">' +
          (a.forced ? 'Dernier jour : vendre à la clôture du ' + longDay(session) : need <= 0 ? 'Le prix dépasse le seuil de vente : vendre à la clôture' : 'On garde · il manque ' + pct(need) + ' pour vendre') +
          '<small>Seuil de vente pour la prochaine clôture (' + longDay(session) + ') : ' + px(a.Y) + '. Il est recalculé chaque soir.</small></div>' +
          '<div class="gauge"><div class="track"><div class="fill" style="width:' + prog * 100 + '%"></div></div><div class="labels"><span>Acheté le <b>' + shortDay(p.d1) + '</b></span><span>ouvert depuis <b>' + jours(last - p.d1) + '</b></span><span>vente au plus tard le <b>' + shortDay(dl) + '</b></span></div></div>';
      } else {
        html += '<div class="verdict sell">La règle n\'est pas en position sur cet indice<small>Si c\'est un trade d\'entretien, ferme-le et note la vente dans le journal.</small></div>';
      }
      html += '<div class="stats"><div><span>Prix d\'achat</span><b>' + px(p.p1) + '</b></div><div><span>Prix actuel</span><b>' + px(cur) + '</b></div>' +
        '<div><span>Valeur</span><b>' + usd(cur * p.lots * ct) + '</b></div><div><span>' + (stop ? 'Stop' : 'Stop') + '</span><b>' + (stop ? px(stop) : 'aucun') + '</b></div></div>' +
        '<h3 style="margin-top:14px">Évolution depuis l\'achat</h3><div class="chart" id="pos-ch-' + i + '"></div>';
      $('pos-' + i).innerHTML = html;
      var from = Math.max(0, I.days.findIndex(function (d) { return d >= p.d1; }) - 5), xs = I.days.slice(from), ys = I.c.slice(from), refs = [{ v: p.p1, label: 'achat ' + px(p.p1), cls: 'ref-buy' }];
      if (a && !a.forced) refs.push({ v: a.Y, label: 'seuil de vente ' + px(a.Y), cls: 'ref-sell' });
      if (stop) refs.push({ v: stop, label: 'stop ' + px(stop), cls: 'ref-stop' });
      lineChart($('pos-ch-' + i), { x: xs, series: [{ name: I.name, v: ys, c: '--s1' }], refs: refs, height: 170, label: I.name + ' depuis l\'achat', fmt: function (v) { return nf(v, 0); } });
    });
    return tot;
  }

  /* ordres */
  function renderOrdres() {
    var cl = closeUTC(session), nOrd = 0;
    $('o-when').textContent = hm(cl - 600000);
    ['spx', 'ndx'].forEach(function (k) { if (A[k].mode === 'pos' || A[k].possible) nOrd++; });
    var tot = renderPositions(), nPos = positions().length;
    $('o-intro').innerHTML = '<h2>' + longDay(session).replace(/^./, function (c) { return c.toUpperCase(); }) + ' · clôture à ' + hm(cl) + '</h2><p class="muted" style="margin:0">Compte ' + usd(cfg.size) + ', ' +
      nf(cfg.lev, 1) + ' × par indice (' + usd(cfg.size * cfg.lev) + ' par position)' + (cfg.phase == 3 ? ', stop obligatoire à ' + nf(stopPct() * 100, 1) + ' %' : ', pas de stop pendant le challenge') + '.</p>' +
      '<div class="sum-row"><div><span>À surveiller ce soir</span><b>' + (nOrd ? nOrd + ' indice' + (nOrd > 1 ? 's' : '') : 'rien') + '</b></div><div><span>Positions en cours</span><b>' + (nPos || 'aucune') + '</b></div>' +
      '<div><span>Résultat en cours</span><b class="' + (tot >= 0 ? 'pos' : 'neg') + '">' + (nPos ? sUsd(tot) : '—') + '</b></div></div>';
    $('o-sec1').textContent = 'Vers ' + hm(cl - 600000) + ', entre le prix vu dans MT5 : le verdict et le nombre de lots se recalculent.';
    ['spx', 'ndx'].forEach(function (k) {
      var a = A[k], I = IDX[k], np = nowPrice(k, session), p = np ? np.p : (a.mode === 'flat' ? (a.possible ? a.X : a.P) : a.P), v = verdict(a, np ? np.p : null);
      var head = '<div class="head"><div><div class="name">' + I.name + '</div><div class="sym">' + I.sym + '</div></div></div>', body;
      var input = '<label class="field" style="margin-top:12px"><span>Prix ' + I.sym + ' dans MT5</span><input type="number" inputmode="decimal" step="any" data-manual="' + k + '" value="' +
        (manual[k] && manual[k].day === session ? manual[k].p : '') + '" placeholder="' + (np && np.auto ? px(np.p) : 'ex. ' + px(a.P)) + '"></label>';
      if (a.mode === 'flat' && !a.possible) {
        body = '<div class="big-act">Aucun ordre</div><p class="muted">' + (a.P <= a.F ? 'L\'indice est sous sa moyenne 200 jours.' : 'Le seuil passerait sous la moyenne 200 jours.') + ' Rien à faire ce soir.</p>';
      } else if (a.mode === 'flat') {
        var lt = lotsFor(k, p), stop = p * (1 - stopPct());
        body = '<div class="big-act buy">Acheter si le prix est sous ' + px(a.X) + '</div><p class="muted" style="margin:0">' + pct(a.X / a.P - 1) + ' par rapport à la dernière clôture. Sinon, rien.</p>' +
          '<div class="order"><div><span>Ordre</span><b>Buy au marché</b></div><div><span>Volume</span><b>' + nf(lt.lots, 2) + ' lots</b></div><div><span>Valeur</span><b>' + usd(lt.notional) + '</b></div>' +
          (cfg.phase == 3 ? '<div><span>Stop loss</span><b>' + px(stop) + '</b></div><div><span>Perte si stop</span><b>' + usd(lt.notional * stopPct()) + '</b></div>' : '') + '</div>';
      } else {
        var mine = trades.filter(function (t) { return t.idx === k && !t.d2; });
        var lotsOpen = mine.reduce(function (s, t) { return s + t.lots; }, 0);
        body = (a.forced ? '<div class="big-act sell">Fermer la position à la clôture</div><p class="muted" style="margin:0">Durée maximale atteinte (environ 2 semaines) : sortie obligatoire.</p>' :
          '<div class="big-act sell">Fermer si le prix dépasse ' + px(a.Y) + '</div><p class="muted" style="margin:0">' + pct(a.Y / a.P - 1) + ' par rapport à la dernière clôture. Sinon, on garde (au plus tard jusqu\'au ' + longDay(deadline(a)) + ').</p>') +
          '<div class="order"><div><span>Ordre</span><b>Fermer (Sell)</b></div><div><span>Volume</span><b>' + (lotsOpen ? nf(lotsOpen, 2) + ' lots' : 'toute la position') + '</b></div><div><span>Achat</span><b>' + px(a.entry) + ' · ' + shortDay(a.entryDay) + '</b></div></div>';
      }
      var vb = v && (a.mode === 'pos' || a.possible) ? '<div class="verdict ' + v.cls + '">' + esc(v.txt) + '<small>' + esc(v.sub) + (np ? ' Prix : ' + esc(np.src) + '.' : '') + '</small></div>' : '';
      $('o-' + k).className = 'card s6 ticket';
      $('o-' + k).innerHTML = head + body + ((a.mode === 'pos' || a.possible) ? input + vb : '');
    });
  }

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
      rows.push(['Risque des positions ouvertes', usd(s.risk) + ' / ' + usd(s.size * 0.03) + ' autorisés']);
    }
    rows.push(['Plancher de perte maximale', usd(s.maxFloor) + ' · marge ' + usd(s.equity - s.maxFloor)]);
    rows.push(['Plancher de perte du jour', usd(s.dayFloor) + ' (≈ solde − 5 %)']);
    rows.push(['Positions ouvertes (latent)', sUsd(s.open)]);
    rows.push(['Dernière activité', s.inactive + ' jours · limite le ' + longDay(s.deadline)]);
    var prog = s.target ? Math.max(0, Math.min(1, (s.bal - s.size) / (s.target - s.size))) : null;
    $('acct-status').innerHTML = '<h2>' + (cfg.phase == 3 ? 'Compte financé' : 'Phase ' + cfg.phase) + ' · ' + usd(s.size) + '</h2>' +
      '<div class="signal" style="margin-top:0">' + usd(s.bal) + '<small>' + (s.est ? 'Solde estimé : capital de départ + trades clôturés du journal depuis le début de l\'étape.' : 'Solde saisi depuis MT5.') + '</small></div>' +
      (prog !== null ? '<div class="bar"><i style="width:' + prog * 100 + '%"></i></div><p class="muted" style="margin:0 0 8px">' + nf(prog * 100, 0) + ' % de l\'objectif</p>' : '') +
      '<dl class="rows">' + rows.map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>'; }).join('') + '</dl>';
  }

  /* journal */
  function renderJournal() {
    var list = trades.slice().sort(function (a, b) { return b.d1.localeCompare(a.d1); });
    $('j-list').innerHTML = list.length ? list.map(function (t) {
      var p = pnlOf(t);
      return '<tr><td>' + IDX[t.idx].name + (t.kind === 'entretien' ? ' <span class="muted">· entretien</span>' : '') + '</td><td>' + shortDay(dn(t.d1)) + ' · ' + px(t.p1) + '</td><td>' +
        (t.d2 ? shortDay(dn(t.d2)) + ' · ' + px(t.p2) : '<b>ouvert</b>') + '</td><td>' + nf(t.lots, 2) + '</td><td class="' + (p >= 0 ? 'pos' : 'neg') + '">' + sUsd(p) + (t.d2 ? '' : ' *') +
        '</td><td><div class="act"><button data-edit="' + t.id + '">Modifier</button><button class="del" data-del="' + t.id + '">Suppr.</button></div></td></tr>';
    }).join('') : '<tr><td colspan="6" class="empty">Aucun trade. Note chaque trade démo avec le prix obtenu.</td></tr>';
    var closed = trades.filter(function (t) { return t.d2; }).sort(function (a, b) { return a.d2.localeCompare(b.d2); }), tot = 0, win = 0, best = 0, worst = 0;
    var xs = [], ys = [];
    closed.forEach(function (t) { var p = pnlOf(t); tot += p; if (p > 0) win++; best = Math.max(best, p); worst = Math.min(worst, p); xs.push(dn(t.d2)); ys.push(tot); });
    $('j-kpis').innerHTML = '<div><span>Résultat total</span><b class="' + (tot >= 0 ? 'pos' : 'neg') + '">' + sUsd(tot) + '</b></div><div><span>Trades clôturés</span><b>' + closed.length + '</b></div>' +
      '<div><span>Gagnants</span><b>' + (closed.length ? Math.round(win / closed.length * 100) + ' %' : '—') + '</b></div><div><span>Pire trade</span><b>' + (closed.length ? sUsd(worst) : '—') + '</b></div>';
    if (xs.length >= 2) lineChart($('j-chart'), { x: xs, series: [{ name: 'Résultat cumulé', v: ys, c: '--s1' }], height: 190, label: 'Résultat cumulé du journal', fmt: function (v) { return nf(v, 0); } });
    else $('j-chart').innerHTML = '<p class="empty">La courbe apparaît après 2 trades clôturés.</p>';
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
    $('title').textContent = $('v-' + v).dataset.title;
    store.set('tab', v); window.scrollTo(0, 0);
    if (A.spx) { if (v === 'bord') renderBord(); if (v === 'journal') renderJournal(); if (v === 'regle') renderBilan(); }
  }
  document.querySelectorAll('.nav button').forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.v); }); });
  document.addEventListener('click', function (ev) {
    var go = ev.target.closest('[data-go]'); if (go) { show(go.dataset.go); return; }
    var ed = ev.target.closest('[data-edit]'); if (ed) { fillForm(trades.filter(function (t) { return t.id === ed.dataset.edit; })[0]); $('j-form-title').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    var del = ev.target.closest('[data-del]');
    if (del && confirm('Supprimer ce trade du journal ?')) { trades = trades.filter(function (t) { return t.id !== del.dataset.del; }); store.set('trades', trades); renderAll(); }
  });
  document.addEventListener('input', function (ev) {
    var k = ev.target.dataset && ev.target.dataset.manual; if (!k) return;
    var v = parseFloat(String(ev.target.value).replace(',', '.'));
    manual[k] = v > 0 ? { p: v, day: session } : null; store.set('manual', manual);
    clearTimeout(ev.target._t); ev.target._t = setTimeout(function () { renderOrdres(); renderIdxCard(k); var el = document.querySelector('[data-manual="' + k + '"]'); if (el) { el.focus(); el.setSelectionRange && el.type === 'text' && el.setSelectionRange(99, 99); } }, 400);
  });

  $('b-year').addEventListener('change', function () { store.set('year', +$('b-year').value); renderBilan(); });

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
