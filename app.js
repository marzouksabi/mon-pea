/* Mon PEA — consigne de dosage, objectif, suivi. Tout est calcule sur le telephone ; rien n'est envoye nulle part. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var eur = function (v) { return Math.round(v).toLocaleString('fr-FR') + ' €'; };
  var pct = function (v, d) { return (v * 100).toFixed(d || 0).replace('.', ',') + ' %'; };
  var kEur = function (v) { return v >= 1000 ? (v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: v < 10000 ? 1 : 0 }) + ' k€' : Math.round(v) + ' €'; };
  var num = function (id) { var v = parseFloat(String($(id).value).replace(',', '.')); return isNaN(v) ? NaN : v; };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('pea:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('pea:' + k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } }
  };
  var MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  var dayStr = function (d) { var x = new Date(d * 86400000); return x.getUTCDate() + ' ' + MOIS[x.getUTCMonth()] + ' ' + x.getUTCFullYear(); };

  var ETF = { days: [], px: [], r: [] };
  var MON = { lv: [], cpi: [], start: '' };

  /* ---------- onglets ---------- */
  var VIEWS = ['semaine', 'objectif', 'suivi', 'repli', 'reperes'];
  function show(v) {
    if (VIEWS.indexOf(v) < 0) v = 'semaine';
    VIEWS.forEach(function (k) { $('v-' + k).hidden = k !== v; });
    document.querySelectorAll('.tabs button').forEach(function (b) {
      if (b.dataset.v === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    $('title').textContent = $('v-' + v).dataset.title;
    store.set('tab', v);
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.tabs button').forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.v); }); });

  /* ---------- semaine : regle de dosage ---------- */
  function vol(t, w) {
    if (t < w) return NaN;
    var m = 0, s = 0, i;
    for (i = t - w + 1; i <= t; i++) m += ETF.r[i];
    m /= w;
    for (i = t - w + 1; i <= t; i++) s += (ETF.r[i] - m) * (ETF.r[i] - m);
    return Math.sqrt(s / (w - 1) * 252);
  }
  function rule() { return { tgt: +$('s-tgt').value, band: +$('s-band').value, win: +$('s-win').value }; }
  var target = function (t, S) { return Math.min(1, S.tgt / vol(t, S.win)); };

  function renderVerdict(w, S) {
    var held = num('held'), cash = num('cash');
    store.set('situation', { held: $('held').value, cash: $('cash').value });
    $('m-tgt').textContent = pct(w);
    var v = $('verdict');
    if (!(held >= 0) && !(cash >= 0)) {
      v.className = 'verdict'; v.textContent = 'Entre tes deux montants pour savoir quoi faire cette semaine.';
      $('m-cur').textContent = '—'; $('m-gap').textContent = '—'; return;
    }
    held = held > 0 ? held : 0; cash = cash > 0 ? cash : 0;
    var tot = held + cash;
    if (tot <= 0) { v.className = 'verdict'; v.textContent = 'Entre tes deux montants pour savoir quoi faire cette semaine.'; return; }
    var c = held / tot, gap = w - c;
    $('m-cur').textContent = pct(c);
    $('m-gap').textContent = (gap >= 0 ? '+' : '−') + Math.round(Math.abs(gap) * 100) + ' points';
    if (Math.abs(gap) <= S.band) {
      v.className = 'verdict ok';
      v.innerHTML = 'Ne rien faire cette semaine<small>Écart de ' + Math.round(Math.abs(gap) * 100) + ' points, sous ton seuil de ' + Math.round(S.band * 100) + '.</small>';
      return;
    }
    var amt = Math.abs(w * tot - held), short = false;
    if (gap > 0 && amt > cash) { amt = cash; short = true; }
    var after = (held + (gap > 0 ? amt : -amt)) / tot;
    v.className = 'verdict act';
    v.innerHTML = (gap > 0 ? 'Acheter ' : 'Vendre ') + eur(amt) + ' d\'ETF<small>Ta part passe de ' + pct(c) + ' à ' + pct(after) +
      '. Un ordre ponctuel coûte environ 1 €.' + (short ? ' Il te manque des liquidités pour atteindre la consigne.' : '') + '</small>';
  }

  function backtest(S) {
    var n = ETF.px.length - 1, start = S.win, B = 0, cash = 1000, H = 1000, vals = [], hold = [];
    for (var t = start; t <= n; t++) {
      if (t > start) { B *= 1 + ETF.r[t]; H *= 1 + ETF.r[t]; }
      var V = B + cash;
      if ((t - start) % 5 === 0) {
        var w = target(t, S), cur = V > 0 ? B / V : 0;
        if (t === start || Math.abs(w - cur) > S.band) { V -= Math.abs(w * V - B) * 0.001; B = w * V; cash = V - B; }
      }
      vals.push(B + cash); hold.push(H);
    }
    var st = function (a) {
      var yrs = (ETF.days[n] - ETF.days[start]) / 365.25, peak = 0, dd = 0;
      a.forEach(function (x) { peak = Math.max(peak, x); dd = Math.max(dd, 1 - x / peak); });
      return { cagr: Math.pow(a[a.length - 1] / a[0], 1 / yrs) - 1, dd: dd };
    };
    return { dose: st(vals), hold: st(hold), from: ETF.days[start] };
  }

  function renderSemaine() {
    if (!ETF.px.length) return;
    var S = rule(); store.set('rule', S);
    var n = ETF.px.length - 1, v = vol(n, S.win), w = target(n, S);
    $('w-now').textContent = pct(w);
    $('w-bar').style.width = (w * 100).toFixed(1) + '%';
    $('w-sub').textContent = (w >= 0.999 ? 'Marché calme : rester investi à 100 %. ' : 'Marché agité : la règle réduit la position. ') +
      'Volatilité récente ' + pct(v) + ' par an.';
    renderVerdict(w, S);

    var last = {}, keys = [];
    ETF.days.forEach(function (d, i) { var k = Math.floor((d + 3) / 7); if (last[k] === undefined) keys.push(k); last[k] = i; });
    $('weeks').innerHTML = keys.slice(-8).reverse().map(function (k) {
      var i = last[k];
      return '<tr><td>' + dayStr(k * 7 - 3) + '</td><td>' + pct(vol(i, S.win)) + '</td><td>' + pct(target(i, S)) + '</td></tr>';
    }).join('');

    var b = backtest(S);
    $('bt').innerHTML =
      '<div><b>Avec la règle</b><span>' + pct(b.dose.cagr, 1) + '</span><small>par an · pire recul −' + pct(b.dose.dd) + '</small></div>' +
      '<div><b>Sans la règle</b><span>' + pct(b.hold.cagr, 1) + '</span><small>par an · pire recul −' + pct(b.hold.dd) + '</small></div>';
  }

  /* ---------- objectif ---------- */
  function objParams() {
    var P = { target: num('o-target'), age: num('o-age'), goal: num('o-goal'), cap: num('o-cap'), m1: num('o-m1'),
      until: num('o-until'), m2: num('o-m2'), real: $('o-real').value === '1' };
    store.set('objectif', { target: $('o-target').value, age: $('o-age').value, goal: $('o-goal').value, cap: $('o-cap').value,
      m1: $('o-m1').value, until: $('o-until').value, m2: $('o-m2').value, real: $('o-real').value });
    return P;
  }
  function runWindow(s, Y, P, m2) {
    var M = Y * 12, lv = MON.lv, cpi = MON.cpi, study = Math.max(0, (P.until - P.age) * 12);
    var v = Math.max(0, P.cap - 1), paid = P.cap, path = [v];
    for (var k = 1; k <= M; k++) {
      v *= lv[s + k] / lv[s + k - 1] * (1 - 0.002 / 12);
      if (k < M) { var c = (k < study ? P.m1 : m2) * (P.real ? cpi[s + k] / cpi[s] : 1); v += c; paid += c; }
      path.push(P.real ? v * cpi[s] / cpi[s + k] : v);
    }
    var net = v - Math.max(0, v - paid) * (Y >= 5 ? 0.186 : 0.314);
    return { net: P.real ? net * cpi[s] / cpi[s + M] : net, path: path };
  }
  function nets(Y, P, m2) {
    var out = [];
    for (var s = 0; s + Y * 12 < MON.lv.length; s++) out.push(runWindow(s, Y, P, m2).net);
    return out.sort(function (a, b) { return a - b; });
  }
  var q = function (a, p) { return a[Math.max(0, Math.min(a.length - 1, Math.floor(p * (a.length - 1))))]; };
  function needed(Y, P, share) {
    var lo = 0, hi = 20000;
    if (q(nets(Y, P, hi), 1 - share) < P.target) return null;
    for (var i = 0; i < 26; i++) { var m = (lo + hi) / 2; if (q(nets(Y, P, m), 1 - share) < P.target) lo = m; else hi = m; }
    return hi;
  }

  function renderObjectif() {
    if (!MON.lv.length) return;
    var P = objParams();
    var maxY = Math.floor((MON.lv.length - 1) / 12) - 2;
    if (!(P.target > 0) || !(P.goal > P.age) || !(P.cap >= 0) || !(P.m1 >= 0) || !(P.m2 >= 0)) {
      $('o-prob').textContent = '—'; $('o-sub').textContent = 'Complète ton plan pour voir le résultat.'; return;
    }
    var Y = Math.round(P.goal - P.age), capped = false;
    if (Y > maxY) { Y = maxY; capped = true; }
    var runs = [];
    for (var s = 0; s + Y * 12 < MON.lv.length; s++) runs.push(runWindow(s, Y, P, P.m2));
    var finals = runs.map(function (r) { return r.net; }).sort(function (a, b) { return a - b; });
    var ok = finals.filter(function (x) { return x >= P.target; }).length / finals.length;
    var study = Math.max(0, (P.until - P.age) * 12), M = Y * 12;
    var paid = [P.cap];
    for (var k = 1; k <= M; k++) paid.push(paid[k - 1] + (k < M ? (k < study ? P.m1 : P.m2) : 0));

    $('o-k').textContent = 'Chances d\'avoir ' + eur(P.target) + ' à ' + Math.round(P.age + Y) + ' ans';
    $('o-prob').textContent = pct(ok);
    $('o-sub').textContent = capped ? 'L\'historique disponible permet de simuler au plus ' + maxY + ' ans : calcul fait sur ' + maxY + ' ans.'
      : 'Sur ' + finals.length + ' dates de départ possibles depuis 2000, après impôts du PEA.';
    $('o-paid').textContent = eur(paid[M]);
    $('o-lo').textContent = eur(q(finals, 0.1));
    $('o-med').textContent = eur(q(finals, 0.5));
    $('o-hi').textContent = eur(q(finals, 0.9));

    var lo = [], med = [], hi = [];
    for (k = 0; k <= M; k++) {
      var col = runs.map(function (r) { return r.path[k]; }).sort(function (a, b) { return a - b; });
      lo.push(q(col, 0.1)); med.push(q(col, 0.5)); hi.push(q(col, 0.9));
    }
    chart($('o-chart'), { n: M + 1, xlab: function (k) { return Math.round(P.age + k / 12) + ' ans'; },
      band: [lo, hi], lines: [{ d: paid, c: 'var(--muted)', w: 1.6, dash: true }, { d: med, c: 'var(--accent)', w: 2.6 }],
      hline: { y: P.target, c: 'var(--good)' } });

    var study2 = P.until > P.age;
    $('o-need-k').textContent = study2 ? 'Versement mensuel nécessaire après tes ' + Math.round(P.until) + ' ans, pour avoir ' + eur(P.target) + ' :'
      : 'Versement mensuel nécessaire pour avoir ' + eur(P.target) + ' :';
    var n50 = needed(Y, P, 0.5), n90 = needed(Y, P, 0.9);
    $('o-n50').textContent = n50 === null ? 'hors de portée' : eur(Math.ceil(n50 / 5) * 5) + ' / mois';
    $('o-n90').textContent = n90 === null ? 'hors de portée' : eur(Math.ceil(n90 / 5) * 5) + ' / mois';
    $('o-note').textContent = 'Actions mondiales (MSCI World, dividendes réinvestis, en euros), frais d\'ETF 0,20 % par an, impôt du PEA à la sortie' +
      (P.real ? ', montants en pouvoir d\'achat d\'aujourd\'hui, versements relevés avec l\'inflation' : '') +
      '. La courbe est avant impôt. Le dosage à 20 % réduirait le résultat d\'environ 10 à 15 %. Ce sont des simulations sur le passé, pas des garanties.';
  }

  /* ---------- graphique ---------- */
  function chart(svg, o) {
    var W = 360, H = +svg.getAttribute('viewBox').split(' ')[3], L = 46, R = 352, T = 8, B = H - 24;
    var hiV = 0;
    (o.band ? o.band[1] : []).concat.apply([], o.lines.map(function (l) { return l.d; })).forEach(function (v) { if (v > hiV) hiV = v; });
    if (o.band) o.band[1].forEach(function (v) { if (v > hiV) hiV = v; });
    if (o.hline) hiV = Math.max(hiV, o.hline.y);
    var loV = 0;
    if (o.fit) { loV = Infinity; o.lines.forEach(function (l) { l.d.forEach(function (v) { if (v < loV) loV = v; }); }); var pad = (hiV - loV) * 0.15 || hiV * 0.05; loV = Math.max(0, loV - pad); hiV += pad; }
    else hiV *= 1.08;
    var x = function (k) { return L + (o.n > 1 ? k / (o.n - 1) : 0) * (R - L); };
    var y = function (v) { return B - (v - loV) / ((hiV - loV) || 1) * (B - T); };
    var span = hiV - loV, step = Math.pow(10, Math.floor(Math.log10(span / 3 || 1)));
    [1, 2, 2.5, 5, 10].some(function (m) { if (span / (step * m) <= 4) { step *= m; return true; } return false; });
    var s = [];
    for (var v = Math.ceil(loV / step) * step; v <= hiV; v += step) {
      s.push('<line x1="' + L + '" x2="' + R + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '" stroke="var(--line)"/>');
      s.push('<text x="' + (L - 6) + '" y="' + (y(v) + 4).toFixed(1) + '" text-anchor="end" font-size="10.5" fill="var(--muted)">' + kEur(v) + '</text>');
    }
    var ticks = [0, Math.round((o.n - 1) / 2), o.n - 1];
    ticks.forEach(function (k, i) {
      s.push('<text x="' + x(k).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="' + (i === 0 ? 'start' : i === 2 ? 'end' : 'middle') + '" font-size="10.5" fill="var(--muted)">' + o.xlab(k) + '</text>');
    });
    if (o.band) {
      var top = o.band[1].map(function (v, k) { return x(k).toFixed(1) + ' ' + y(v).toFixed(1); });
      var bot = o.band[0].map(function (v, k) { return x(k).toFixed(1) + ' ' + y(v).toFixed(1); }).reverse();
      s.push('<path d="M' + top.join('L') + 'L' + bot.join('L') + 'Z" fill="var(--accent-soft)"/>');
    }
    if (o.hline) s.push('<line x1="' + L + '" x2="' + R + '" y1="' + y(o.hline.y).toFixed(1) + '" y2="' + y(o.hline.y).toFixed(1) + '" stroke="' + o.hline.c + '" stroke-width="1.6" stroke-dasharray="6 4"/>');
    o.lines.forEach(function (l) {
      if (!l.d.length) return;
      s.push('<path d="M' + l.d.map(function (v, k) { return x(k).toFixed(1) + ' ' + y(v).toFixed(1); }).join('L') + '" fill="none" stroke="' + l.c +
        '" stroke-width="' + l.w + '"' + (l.dash ? ' stroke-dasharray="4 4"' : '') + ' stroke-linejoin="round" stroke-linecap="round"/>');
    });
    svg.innerHTML = s.join('');
  }

  /* ---------- suivi ---------- */
  function releves() { return store.get('releves', []).sort(function (a, b) { return a.d < b.d ? -1 : 1; }); }
  function renderSuivi() {
    var E = releves(), goal = num('o-target') || 70000;
    if (!E.length) {
      $('t-val').textContent = '—'; $('t-sub').textContent = 'Ajoute un premier relevé pour démarrer le suivi.';
      $('t-bar').style.width = '0'; $('t-goal').textContent = 'Objectif : ' + eur(goal) + '.';
      $('t-list').innerHTML = ''; $('t-chart').innerHTML = ''; return;
    }
    var l = E[E.length - 1], g = l.v - l.p;
    $('t-val').textContent = eur(l.v);
    $('t-sub').textContent = (g >= 0 ? 'Gain de ' : 'Perte de ') + eur(Math.abs(g)) + ' (' + (g >= 0 ? '+' : '−') + pct(Math.abs(g) / (l.p || 1), 1) +
      ') pour ' + eur(l.p) + ' versés · relevé du ' + new Date(l.d).toLocaleDateString('fr-FR');
    $('t-bar').style.width = Math.min(100, l.v / goal * 100).toFixed(1) + '%';
    $('t-goal').textContent = pct(Math.min(1, l.v / goal)) + ' de ton objectif de ' + eur(goal) + '.';
    chart($('t-chart'), { n: E.length, fit: true, xlab: function (k) { return new Date(E[k].d).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }); },
      lines: [{ d: E.map(function (e) { return e.p; }), c: 'var(--muted)', w: 1.6, dash: true }, { d: E.map(function (e) { return e.v; }), c: 'var(--accent)', w: 2.6 }] });
    $('t-list').innerHTML = E.slice().reverse().map(function (e) {
      return '<tr><td>' + new Date(e.d).toLocaleDateString('fr-FR') + '</td><td>' + eur(e.p) + '</td><td>' + eur(e.v) +
        '</td><td><button class="del" type="button" data-d="' + e.d + '" aria-label="Supprimer ce relevé">Suppr.</button></td></tr>';
    }).join('');
  }
  $('t-add').addEventListener('click', function () {
    var d = $('t-date').value, p = num('t-paid'), v = num('t-value');
    if (!d || !(p >= 0) || !(v >= 0)) { $('t-add').textContent = 'Complète les trois champs'; setTimeout(function () { $('t-add').textContent = 'Enregistrer le relevé'; }, 1800); return; }
    var E = releves().filter(function (e) { return e.d !== d; });
    E.push({ d: d, p: p, v: v }); store.set('releves', E);
    $('t-paid').value = ''; $('t-value').value = '';
    renderSuivi();
  });
  $('t-list').addEventListener('click', function (ev) {
    var b = ev.target.closest('.del'); if (!b) return;
    if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Sûr ?'; return; }
    store.set('releves', releves().filter(function (e) { return e.d !== b.dataset.d; })); renderSuivi();
  });
  $('b-copy').addEventListener('click', function () {
    var txt = JSON.stringify({ releves: store.get('releves', []), objectif: store.get('objectif', null), rule: store.get('rule', null) });
    var done = function () { $('b-msg').textContent = 'Sauvegarde copiée : colle-la dans tes notes.'; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { $('b-text').value = txt; $('b-msg').textContent = 'Copie impossible : sélectionne le texte ci-dessus.'; });
    else { $('b-text').value = txt; $('b-msg').textContent = 'Sélectionne et copie le texte ci-dessus.'; }
  });
  $('b-restore').addEventListener('click', function () {
    try {
      var o = JSON.parse($('b-text').value);
      if (Array.isArray(o.releves)) store.set('releves', o.releves);
      if (o.objectif) { store.set('objectif', o.objectif); loadObjectif(); }
      if (o.rule) { store.set('rule', o.rule); loadRule(); }
      $('b-msg').textContent = 'Sauvegarde restaurée.'; renderAll();
    } catch (e) { $('b-msg').textContent = 'Ce texte n\'est pas une sauvegarde valide.'; }
  });

  /* ---------- repli : RSI 2 sous 10 au-dessus de la moyenne 200, sortie au-dessus de la moyenne 5 ---------- */
  var IDX = {}, IDX_NAMES = { spx: 'S&P 500', ndx: 'Nasdaq-100' };
  var JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  var px = function (v) { return v.toLocaleString('fr-FR', { maximumFractionDigits: 0 }); };
  var sgn = function (v) { return (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(1).replace('.', ',') + ' %'; };
  var shortDay = function (d) { var x = new Date(d * 86400000); return x.getUTCDate() + ' ' + MOIS[x.getUTCMonth()]; };

  function replay(c) {
    var n = c.length, au = [0], ad = [0], i, j, trades = [], open = null;
    for (i = 1; i < n; i++) { var d = c[i] - c[i - 1]; au[i] = (au[i - 1] + Math.max(d, 0)) / 2; ad[i] = (ad[i - 1] + Math.max(-d, 0)) / 2; }
    var sma = function (k, w) { var s = 0; for (var q = k - w + 1; q <= k; q++) s += c[q]; return s / w; };
    var rsi = function (k) { return ad[k] === 0 ? 100 : 100 - 100 / (1 + au[k] / ad[k]); };
    for (i = 199; i < n; i++) {
      if (c[i] > sma(i, 200) && rsi(i) < 10) {
        j = i + 1;
        while (j < n && !(c[j] > sma(j, 5)) && j - i < 10) j++;
        if (j >= n) { open = i; break; }
        trades.push([i, j]); i = j;
      }
    }
    return { trades: trades, open: open, au: au[n - 1], ad: ad[n - 1] };
  }

  function closeParis(day) {
    var t, h;
    for (h = 19; h <= 22; h++) {
      t = new Date(day * 86400000 + h * 3600000);
      if (+new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(t) === 16) break;
    }
    return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(t).replace(':', ' h ');
  }

  function renderRepli() {
    if (!IDX.spx) return;
    var size = num('r-size'); if (!(size > 0)) size = 10000;
    store.set('repli-size', $('r-size').value);
    var html = '', posRows = '', rows = [], lastSignal = -1, lastDay = 0, sums = [];
    Object.keys(IDX_NAMES).forEach(function (k) {
      var c = IDX[k].c, days = IDX[k].days, n = c.length, st = replay(c), P = c[n - 1], nm = IDX_NAMES[k], cls = 'sig', act, sub;
      lastDay = days[n - 1];
      if (st.open !== null) {
        var e = st.open, held = n - e, Y = (c[n - 4] + c[n - 3] + c[n - 2] + c[n - 1]) / 4;
        cls += ' hold';
        sub = 'Acheté le ' + shortDay(days[e]) + ' à ' + px(c[e]) + ' · ' + sgn(P / c[e] - 1) + ' à la dernière clôture.';
        if (held >= 10) act = 'Vendre à la clôture ce soir';
        else { act = 'En position : vendre si la clôture dépasse ' + px(Y); sub = (Y > P ? 'Soit ' + sgn(Y / P - 1) + ' par rapport à la dernière clôture. ' : 'Déjà au-dessus : vente quasi certaine. ') + sub + ' Sinon on garde (séance ' + held + ' sur 10).'; }
        lastSignal = Math.max(lastSignal, days[e]);
      } else {
        var X = st.ad > 9 * st.au ? P + (st.ad - 9 * st.au) / 9 : P - (9 * st.au - st.ad), F = 0;
        for (var q = n - 199; q < n; q++) F += c[q];
        F /= 199;
        if (X <= F) { act = 'Pas d\'achat possible ce soir'; sub = P <= F ? 'L\'indice est sous sa moyenne 200 jours (' + px(F) + ') : la règle reste à l\'écart.' : 'Il faudrait passer sous ' + px(X) + ', donc sous la moyenne 200 jours (' + px(F) + ').'; }
        else {
          cls += ' buy';
          act = 'Acheter si la clôture est sous ' + px(X);
          sub = 'Soit ' + sgn(X / P - 1) + ' par rapport à la dernière clôture (' + px(P) + '), et au-dessus de ' + px(F) + '.';
        }
      }
      html += '<div class="' + cls + '"><h3>' + nm + '</h3><div class="act">' + act + '</div><small>' + sub + '</small></div>';
      posRows += '<div><dt>' + nm + '</dt><dd>' + (size / P).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' × l\'indice</dd></div>';
      var from = days[n - 1] - 365, s = 0, cnt = 0;
      st.trades.forEach(function (t) {
        lastSignal = Math.max(lastSignal, days[t[0]]);
        if (days[t[0]] >= from) { var r = c[t[1]] / c[t[0]] - 1; s += r; cnt++; rows.push([days[t[0]], nm, shortDay(days[t[0]]), shortDay(days[t[1]]), r]); }
      });
      if (st.open !== null && days[st.open] >= from) rows.push([days[st.open], nm, shortDay(days[st.open]), 'en cours', P / c[st.open] - 1]);
      sums.push(nm + ' : ' + cnt + ' trades, ' + sgn(s) + ' cumulés');
    });
    var next = lastDay + 1; while ([0, 6].indexOf(new Date(next * 86400000).getUTCDay()) >= 0) next++;
    var wd = new Date(next * 86400000).getUTCDay(), since = lastSignal >= 0 ? lastDay - lastSignal : null;
    $('r-when').innerHTML = 'Prochaine clôture de New York : <b>' + JOURS[wd] + ' ' + shortDay(next) + ' à ' + closeParis(next) + '</b> (heure de Paris), sauf jour férié américain. ' +
      'Agis dans les 10 dernières minutes. Cours au ' + dayStr(lastDay) + '.' + (since !== null ? ' Dernier signal d\'achat il y a ' + since + ' jours.' : '');
    $('r-now').innerHTML = html;
    $('r-pos').innerHTML = posRows;
    rows.sort(function (a, b) { return b[0] - a[0]; });
    $('r-trades').innerHTML = rows.length ? rows.map(function (r) {
      return '<tr><td>' + r[1] + '</td><td>' + r[2] + '</td><td>' + r[3] + '</td><td class="' + (r[4] >= 0 ? 'pos' : 'neg') + '">' + sgn(r[4]) + '</td></tr>';
    }).join('') : '<tr><td colspan="4">Aucun trade sur 12 mois.</td></tr>';
    $('r-sum').textContent = sums.join(' · ');
  }

  /* ---------- chargement ---------- */
  function loadRule() { var r = store.get('rule', null); if (r) { $('s-tgt').value = String(r.tgt); $('s-band').value = String(r.band); $('s-win').value = String(r.win); } }
  function loadObjectif() {
    var o = store.get('objectif', null); if (!o) return;
    ['target', 'age', 'goal', 'cap', 'm1', 'until', 'm2'].forEach(function (k) { if (o[k] !== undefined) $('o-' + k).value = o[k]; });
    if (o.real !== undefined) $('o-real').value = o.real;
  }
  function renderAll() { renderSemaine(); renderObjectif(); renderSuivi(); }

  loadRule(); loadObjectif();
  var sit = store.get('situation', null); if (sit) { $('held').value = sit.held || ''; $('cash').value = sit.cash || ''; }
  $('t-date').value = new Date().toISOString().slice(0, 10);
  ['held', 'cash', 's-tgt', 's-band', 's-win'].forEach(function (id) { $(id).addEventListener('input', renderSemaine); $(id).addEventListener('change', renderSemaine); });
  var tObj;
  ['o-target', 'o-age', 'o-goal', 'o-cap', 'o-m1', 'o-until', 'o-m2', 'o-real'].forEach(function (id) {
    $(id).addEventListener('input', function () { clearTimeout(tObj); tObj = setTimeout(function () { renderObjectif(); renderSuivi(); }, 250); });
    $(id).addEventListener('change', function () { renderObjectif(); renderSuivi(); });
  });
  $('r-size').value = store.get('repli-size', '') || '';
  $('r-size').addEventListener('input', renderRepli);
  show(store.get('tab', 'semaine'));

  fetch('data/market.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (D) {
    var d = 0;
    ETF.days = D.etf.d.map(function (x) { d += x; return d; }); ETF.px = D.etf.c;
    ETF.r = ETF.px.map(function (p, i) { return i ? p / ETF.px[i - 1] - 1 : 0; });
    MON.lv = D.msci.v; MON.start = D.msci.start;
    var hs = D.hicp.start, h = D.hicp.v, y0 = +MON.start.slice(0, 4), m0 = +MON.start.slice(4, 6), hy = +hs.slice(0, 4), hm = +hs.slice(4, 6), last = h[0];
    MON.cpi = MON.lv.map(function (_, i) { var j = (y0 - hy) * 12 + (m0 - hm) + i; if (j >= 0 && j < h.length) last = h[j]; return last; });
    $('stamp').textContent = 'Cours de l\'ETF CW8 au ' + dayStr(ETF.days[ETF.days.length - 1]) + ' · MSCI World jusqu\'à fin ' +
      MOIS[(m0 - 1 + MON.lv.length - 1) % 12] + ' ' + (y0 + Math.floor((m0 - 1 + MON.lv.length - 1) / 12));
    renderAll();
    if (D.idx) {
      Object.keys(IDX_NAMES).forEach(function (k) { var dd = 0; IDX[k] = { c: D.idx[k].c, days: D.idx[k].d.map(function (x) { dd += x; return dd; }) }; });
      renderRepli();
    }
  }).catch(function () {
    $('stamp').textContent = 'Cours indisponibles : vérifie ta connexion puis rouvre l\'application.';
  });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () { /* hors ligne non disponible */ });
})();
