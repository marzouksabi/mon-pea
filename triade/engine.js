/* Moteur M1 de Triade : copie fidèle du labo (recherche-trading/atelier/m1_stops.py, variante B des stops, SETUPS_INSTANT_6.md).
   Trois moteurs : repli dosé (S&P 500, Nasdaq-100), T1 tendance sur 18 marchés (révision une séance sur cinq), V1 indices dosés
   (au-dessus de la moyenne de 200 séances) ; combinés à risque égal (volatilité visée), puis règle FundedNext des 3 % :
   stop de chaque marché à c x volatilité du marché, c réglé pour que la somme des risques fasse 3 % du compte.
   Utilisable dans le navigateur (window.TriadeEngine) et sous Node (module.exports) pour la vérification. */
(function (root) {
  'use strict';
  var CODES = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'XAUUSD', 'XAGUSD',
    'SPX500', 'NDX100', 'US30', 'GER30', 'UK100', 'FRA40', 'AUS200', 'HK50', 'JP225'];      // ordre du labo
  var NI = CODES.length, SPX = CODES.indexOf('SPX500'), NDX = CODES.indexOf('NDX100');

  function decode(files) {
    /* fichiers triade-histo.json + triade.json -> séries de prix ; renvoie aussi le rang de chaque séance dans le calendrier du labo */
    var days = [], g0 = null, M = {};
    CODES.forEach(function (c) { M[c] = { o: [], h: [], l: [], c: [], n: '', k: 0 }; });
    files.forEach(function (f) {
      if (!f || !f.d || !f.d.length) return;
      if (g0 === null) g0 = f.i0;
      else if (f.i0 !== g0 + days.length) throw new Error('fichiers de cours non contigus');
      var x = 0;
      f.d.forEach(function (v, n) { x = n ? x + v : v; days.push(x); });
      CODES.forEach(function (c) {
        var s = f.m[c], m = M[c], p = Math.pow(10, s.k), cc = 0;
        m.n = s.n; m.k = s.k; if (s.f !== undefined && m.f === undefined) m.f = s.f;
        for (var n = 0; n < s.c.length; n++) {
          cc = n ? cc + s.c[n] : s.c[n];
          m.c.push(cc / p); m.o.push((cc + s.o[n]) / p); m.h.push((cc + s.h[n]) / p); m.l.push((cc - s.l[n]) / p);
        }
      });
    });
    return { days: days, g0: g0 || 0, m: M };
  }

  function std(a, i0, i1) {        // écart type (ddof = 1) de a[i0..i1-1]
    var n = i1 - i0, s = 0, q = 0, k;
    if (n < 2) return 0;
    for (k = i0; k < i1; k++) s += a[k];
    var mu = s / n;
    for (k = i0; k < i1; k++) q += (a[k] - mu) * (a[k] - mu);
    return Math.sqrt(q / (n - 1));
  }
  function median(a) {
    var b = a.filter(function (v) { return v === v; }).sort(function (x, y) { return x - y; }), n = b.length;
    if (!n) return NaN;
    return n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2;
  }
  function sign(v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }

  /* Calcul complet. opts : target (volatilité visée, 0.06), budget (0.03), extra (séance provisoire du soir :
     {CODE: {o, h, l, c}}), stops (true : variante B ; false : sans stop). Les tableaux renvoyés vont de 0 à T-1. */
  function run(D, opts) {
    opts = opts || {};
    var target = opts.target || 0.06, budget = opts.budget || 0.03, useStops = opts.stops !== false;
    // extra : séances ajoutées après les cours officiels (cours du moment ; null = séance sans nouveau cours, reprise de la veille)
    var EX = opts.extra ? (Array.isArray(opts.extra) ? opts.extra : [opts.extra]) : [];
    var T0 = D.days.length, T = T0 + EX.length, g0 = D.g0;
    var O = [], H = [], L = [], C = [], j, t, k;
    for (j = 0; j < NI; j++) {
      var m = D.m[CODES[j]];
      O.push(m.o.slice()); H.push(m.h.slice()); L.push(m.l.slice()); C.push(m.c.slice());
      EX.forEach(function (row) {
        var x = row && row[CODES[j]], pc = C[j][C[j].length - 1];
        if (x && x.c > 0) { C[j].push(x.c); O[j].push(x.o || x.c); H[j].push(Math.max(x.h || x.c, x.c)); L[j].push(Math.min(x.l || x.c, x.c)); }
        else { C[j].push(pc); O[j].push(pc); H[j].push(pc); L[j].push(pc); }
      });
    }
    // rendements et volatilité de 20 séances de chaque marché
    var RET = [], SIG20 = [];
    for (j = 0; j < NI; j++) {
      var r = new Float64Array(T), s20 = new Float64Array(T);
      for (t = 1; t < T; t++) r[t] = C[j][t - 1] > 0 ? C[j][t] / C[j][t - 1] - 1 : 0;
      for (t = 21; t < T; t++) s20[t] = std(r, t - 19, t + 1);
      RET.push(r); SIG20.push(s20);
    }
    // ---- 1) repli dosé : trades sur S&P 500 et Nasdaq-100, taille 0,75 x volatilité de référence / volatilité du moment
    var HR = [], trades = [];
    for (j = 0; j < NI; j++) HR.push(new Float64Array(T));
    [SPX, NDX].forEach(function (col) {
      var c = C[col], n = T, lr = new Float64Array(n), s = new Float64Array(n).fill(NaN), ref = new Float64Array(n).fill(NaN);
      var sma200 = new Float64Array(n).fill(Infinity), sma5 = new Float64Array(n), rsi = new Float64Array(n), au = 0, ad = 0, i, q;
      for (i = 1; i < n; i++) lr[i] = Math.log(c[i] / c[i - 1]);
      for (i = 20; i < n; i++) s[i] = std(lr, i - 19, i + 1);
      var win = [];                                                      // médiane glissante des 750 dernières volatilités
      function ins(v) { if (v !== v) return; var lo = 0, hi = win.length; while (lo < hi) { var md = (lo + hi) >> 1; if (win[md] < v) lo = md + 1; else hi = md; } win.splice(lo, 0, v); }
      function del(v) { if (v !== v) return; var lo = 0, hi = win.length; while (lo < hi) { var md = (lo + hi) >> 1; if (win[md] < v) lo = md + 1; else hi = md; } win.splice(lo, 1); }
      for (i = 20; i < n; i++) {
        if (i >= 770) { var L2 = win.length; ref[i] = L2 % 2 ? win[(L2 - 1) / 2] : (win[L2 / 2 - 1] + win[L2 / 2]) / 2; }
        ins(s[i]); if (i - 750 >= 0) del(s[i - 750]);
      }
      var acc = 0;
      for (i = 0; i < n; i++) {
        acc += c[i]; if (i >= 200) acc -= c[i - 200];
        if (i >= 199) sma200[i] = acc / 200;
        var a5 = 0, w = Math.min(5, i + 1);
        for (q = i - w + 1; q <= i; q++) a5 += c[q];
        sma5[i] = a5 / 5;                                                 // comme le labo : les 4 premières valeurs sont partielles
        var dd = i ? c[i] - c[i - 1] : 0;
        au = (au + Math.max(dd, 0)) / 2; ad = (ad + Math.max(-dd, 0)) / 2;
        rsi[i] = 100 - 100 / (1 + au / (ad === 0 ? 1e-12 : ad));
      }
      i = 0;
      while (i < n - 1) {
        if (c[i] > sma200[i] && rsi[i] < 10) {
          var lev = (ref[i] !== ref[i] || !(s[i] > 0)) ? 0.75 : Math.min(1.5, Math.max(0.375, 0.75 * ref[i] / s[i]));
          var e = i + 1;
          while (e < n - 1 && !(c[e] > sma5[e]) && e - i < 10) e++;
          var open = e === n - 1 && !(c[e] > sma5[e]) && e - i < 10;   // trade toujours en cours au dernier soir
          for (q = i; q < (open ? n : e); q++) HR[col][q] += lev;
          trades.push({ col: col, i: i, j: open ? null : e, lev: lev });
          i = e;
        }
        i++;
      }
      if (opts.signals) opts.signals[col] = { rsi: rsi, sma5: sma5, sma200: sma200, s20: s, ref: ref };
    });
    // ---- 3) V1 : indices dosés au-dessus de la moyenne de 200 séances
    var HV = [];
    for (j = 0; j < NI; j++) HV.push(new Float64Array(T));
    [SPX, NDX].forEach(function (col) {
      var c = C[col], lr = new Float64Array(T);
      for (t = 1; t < T; t++) lr[t] = c[t - 1] > 0 ? Math.log(c[t] / c[t - 1]) : 0;
      for (t = 220; t < T; t++) {
        var mean = 0;
        for (k = t - 199; k <= t; k++) mean += c[k];
        mean /= 200;
        var vol = std(lr, t - 19, t + 1) * Math.sqrt(252);
        HV[col][t] = c[t] > mean ? Math.min(1, 0.5 * 0.15 / vol) : 0;
      }
    });
    // ---- 2) T1 : signe du rendement sur 12 mois, 10 % de volatilité par marché, portefeuille ramené à 6 %
    var HT = [], w = new Float64Array(NI), revisions = [], skip = {};
    (opts.t1Exclude || []).forEach(function (c) { skip[CODES.indexOf(c)] = 1; });
    var FIRST = CODES.map(function (c) { return D.m[c].f || 0; });
    for (j = 0; j < NI; j++) HT.push(new Float64Array(T));
    for (t = 1; t < T; t++) {
      if ((g0 + t) % 5 === 0 && t >= 260) {
        var nw = new Float64Array(NI), any = false;
        for (j = 0; j < NI; j++) {
          if (skip[j] || t - FIRST[j] < 260) continue;
          var v60 = std(RET[j], t - 59, t + 1) * Math.sqrt(252);
          if (v60 > 0) { nw[j] = sign(C[j][t] / C[j][t - 252] - 1) * 0.10 / v60; if (nw[j]) any = true; }
        }
        if (any) {
          var mu = new Float64Array(NI), a, b, pv = 0;
          for (j = 0; j < NI; j++) { for (k = t - 59; k <= t; k++) mu[j] += RET[j][k]; mu[j] /= 60; }
          for (a = 0; a < NI; a++) for (b = 0; b < NI; b++) {
            if (!nw[a] || !nw[b]) continue;
            var cv = 0;
            for (k = t - 59; k <= t; k++) cv += (RET[a][k] - mu[a]) * (RET[b][k] - mu[b]);
            pv += nw[a] * nw[b] * cv / 59;
          }
          pv = Math.sqrt(Math.max(pv, 1e-12) * 252);
          var gsum = 0;
          for (j = 0; j < NI; j++) { nw[j] = Math.max(-1.5, Math.min(1.5, nw[j] * 0.06 / pv)); gsum += Math.abs(nw[j]); }
          if (gsum > 4) for (j = 0; j < NI; j++) nw[j] *= 4 / gsum;
        }
        w = nw; revisions.push(t);
      }
      for (j = 0; j < NI; j++) HT[j][t] = w[j];
    }
    // ---- rendement quotidien de chaque moteur (frais de rotation compris), puis poids de combinaison de M1
    function engineRet(Hh, cost) {
      var out = new Float64Array(T);
      for (t = 1; t < T; t++) {
        var s = 0;
        for (j = 0; j < NI; j++) s += Hh[j][t - 1] * RET[j][t] - cost * Math.abs(Hh[j][t] - Hh[j][t - 1]);
        out[t] = s;
      }
      return out;
    }
    var X = [engineRet(HR, 0.00015), engineRet(HT, 0.0002), engineRet(HV, 0.0002)];
    var W = [new Float64Array(T), new Float64Array(T), new Float64Array(T)], hist = [[], [], []];
    var w0 = opts.weightsFrom || 520;                               // poids calculés une fois les trois moteurs rodés (un an d'historique chacun)
    for (t = Math.max(251, w0); t < T; t++) {
      var vol = [0, 0, 0], ww = [0, 0, 0], mus = [0, 0, 0];
      for (k = 0; k < 3; k++) {
        vol[k] = std(X[k], t - 250, t) * Math.sqrt(252);
        if ((g0 + t) % 21 === 0 || !hist[k].length) hist[k].push(vol[k]);
        vol[k] = Math.max(vol[k], 0.5 * median(hist[k]));
        ww[k] = vol[k] > 0 ? (1 / 3) / vol[k] : 0;
        for (var q = t - 250; q < t; q++) mus[k] += X[k][q];
        mus[k] /= 250;
      }
      var pv2 = 0;
      for (var a2 = 0; a2 < 3; a2++) for (var b2 = 0; b2 < 3; b2++) {
        var cv2 = 0;
        for (q = t - 250; q < t; q++) cv2 += (X[a2][q] - mus[a2]) * (X[b2][q] - mus[b2]);
        pv2 += ww[a2] * ww[b2] * cv2 / 249;
      }
      pv2 = Math.sqrt(Math.max(pv2, 1e-12) * 252);
      var sc = Math.min(target / pv2, 3);
      for (k = 0; k < 3; k++) W[k][t] = ww[k] * sc;
    }
    // ---- positions voulues, stops (variante B), rendement du compte à la clôture et au plus bas du jour
    var P = [];
    for (j = 0; j < NI; j++) {
      var pj = new Float64Array(T);
      for (t = 0; t < T; t++) pj[t] = W[0][t] * HR[j][t] + W[1][t] * HT[j][t] + W[2][t] * HV[j][t];
      P.push(pj);
    }
    var R = new Float64Array(T), RL = new Float64Array(T), PNL = [], HELD = [], REF = [], DIST = [], STOPPED = [], EVENTS = [];
    for (j = 0; j < NI; j++) { PNL.push(new Float64Array(T)); HELD.push(new Float64Array(T)); REF.push(new Float64Array(T).fill(NaN)); DIST.push(new Float64Array(T)); STOPPED.push(new Uint8Array(T)); }
    var ref = new Float64Array(NI).fill(NaN), dist = new Float64Array(NI), stopped = new Uint8Array(NI), held = new Float64Array(NI), last = new Float64Array(NI);
    var Cbud = new Float64Array(T), TURN = new Float64Array(T), override = opts.override || {};
    var band = !!opts.band, cost = opts.cost || 0, cap = opts.cap || 0, scl = new Float64Array(NI).fill(1), RESET = [];
    var fromEntry = opts.riskFrom === 'entry', entry = new Float64Array(NI).fill(NaN), ENTRY = [], RISK = new Float64Array(T);
    for (j = 0; j < NI; j++) { RESET.push(new Uint8Array(T)); ENTRY.push(new Float64Array(T).fill(NaN)); }
    function newEntry(h0, e0, h1, px) {          // prix moyen d'entrée de la position réelle après passage de h0 à h1
      if (!h1) return NaN;
      if (!h0 || sign(h0) !== sign(h1) || e0 !== e0) return px;
      if (Math.abs(h1) > Math.abs(h0)) return (Math.abs(h0) * e0 + (Math.abs(h1) - Math.abs(h0)) * px) / Math.abs(h1);
      return e0;
    }
    function riskOf(h, e, rf, d) {               // perte si le stop est touché, mesurée depuis le prix d'entrée (en fraction du compte)
      if (!h || e !== e) return 0;
      var sl = h > 0 ? rf * (1 - d) : rf * (1 + d);
      return Math.max(0, Math.abs(h) * (h > 0 ? (e - sl) : (sl - e)) / e);
    }     // band : taille gardée entre deux recalages du stop ; cost : frais par unité échangée
    for (t = 1; t < T; t++) {
      var pnl = 0, low = 0;
      for (j = 0; j < NI; j++) {
        var p = held[j];
        if (!p) continue;
        var pc = C[j][t - 1];
        if (useStops && ref[j] === ref[j]) {
          var stp = p > 0 ? ref[j] * (1 - dist[j]) : ref[j] * (1 + dist[j]);
          var hit = p > 0 ? L[j][t] <= stp : H[j][t] >= stp;
          if (override[t] && override[t][CODES[j]]) hit = true;          // stop déclaré touché sur MT5
          if (hit) {
            var px = p > 0 ? Math.min(O[j][t], stp) : Math.max(O[j][t], stp);
            var v = p * (px / pc - 1) - Math.abs(p) * 0.0002;
            pnl += v; low += v; PNL[j][t] = v; held[j] = 0; stopped[j] = 1; entry[j] = NaN;
            EVENTS.push({ t: t, j: j, type: 'stop', p: p, px: px });
            continue;
          }
        }
        var vv = p * RET[j][t];
        pnl += vv; PNL[j][t] = vv;
        low += p * ((p > 0 ? L[j][t] : H[j][t]) / pc - 1);
      }
      R[t] = pnl; RL[t] = Math.min(low, pnl);
      if (!useStops) { for (j = 0; j < NI; j++) { held[j] = P[j][t]; HELD[j][t] = held[j]; } continue; }
      var tot = 0;
      for (j = 0; j < NI; j++) tot += Math.abs(P[j][t]) * SIG20[j][t];
      var cc = tot > 0 ? budget / tot : 0;
      Cbud[t] = cc;
      var turn = 0, before = held.slice(), resetJ = [], Rnr = 0, Rr = 0;
      for (j = 0; j < NI; j++) {
        var tg = P[j][t];
        if (tg === 0) { held[j] = 0; ref[j] = NaN; stopped[j] = 0; HELD[j][t] = 0; continue; }
        var reset = ref[j] !== ref[j] || sign(tg) !== sign(last[j]) || Math.abs(tg - last[j]) > 0.1 * Math.abs(last[j]) || (g0 + t) % 5 === 0;
        if (stopped[j] && !reset) { held[j] = 0; STOPPED[j][t] = 1; REF[j][t] = ref[j]; DIST[j][t] = dist[j]; continue; }
        if (reset) { resetJ.push(j); Rr += Math.abs(tg) * Math.max(cc * SIG20[j][t], 1e-4); continue; }
        held[j] = band ? last[j] * scl[j] : tg * scl[j]; HELD[j][t] = held[j]; REF[j][t] = ref[j]; DIST[j][t] = dist[j];
        if (fromEntry) { entry[j] = newEntry(before[j], entry[j], held[j], C[j][t]); Rnr += riskOf(held[j], entry[j], ref[j], dist[j]); }
        else Rnr += Math.abs(held[j]) * dist[j];
      }
      // cap : le risque total (positions gardées + positions recalées) ne dépasse jamais le plafond ; s'il manque de la place,
      // les positions recalées ce soir sont réduites (le stop garde sa distance normale) jusqu'au prochain recalage.
      // fromEntry : risque compté comme FundedNext, du prix d'entrée réel au stop (perte en cours comprise)
      var sc = 1, ndist = {};
      for (k = 0; k < resetJ.length; k++) ndist[resetJ[k]] = Math.max(cc * SIG20[resetJ[k]][t], 1e-4);
      function riskAt(f) {
        var r = Rnr;
        for (var q = 0; q < resetJ.length; q++) {
          var jj = resetJ[q], h = P[jj][t] * f;
          r += riskOf(h, newEntry(before[jj], entry[jj], h, C[jj][t]), C[jj][t], ndist[jj]);
        }
        return r;
      }
      if (cap && resetJ.length) {
        if (!fromEntry) sc = Math.max(0, Math.min(1, Rr > 0 ? (cap - Rnr) / Rr : 1));
        else if (riskAt(1) > cap) {
          var lo = 0, hi = 1;
          for (var it = 0; it < 30; it++) { var md = (lo + hi) / 2; if (riskAt(md) > cap) hi = md; else lo = md; }
          sc = lo;
        }
      }
      for (k = 0; k < resetJ.length; k++) {
        j = resetJ[k];
        ref[j] = C[j][t]; dist[j] = ndist[j]; stopped[j] = 0; last[j] = P[j][t]; scl[j] = sc; RESET[j][t] = 1;
        held[j] = P[j][t] * sc; HELD[j][t] = held[j]; REF[j][t] = ref[j]; DIST[j][t] = dist[j];
        entry[j] = newEntry(before[j], entry[j], held[j], C[j][t]);
      }
      var rk = 0;
      for (j = 0; j < NI; j++) {
        if (!held[j]) entry[j] = NaN;
        ENTRY[j][t] = entry[j];
        rk += held[j] ? (fromEntry ? riskOf(held[j], entry[j], ref[j], dist[j]) : Math.abs(held[j]) * dist[j]) : 0;
      }
      RISK[t] = rk;
      for (j = 0; j < NI; j++) turn += Math.abs(held[j] - before[j]);
      TURN[t] = turn; R[t] -= cost * turn; RL[t] -= cost * turn;
    }
    return {
      T: T, T0: T0, provisional: EX.length, codes: CODES, C: C, O: O, H: H, L: L, RET: RET, SIG20: SIG20,
      HR: HR, HT: HT, HV: HV, X: X, W: W, P: P, R: R, RL: RL, PNL: PNL, HELD: HELD, REF: REF, DIST: DIST, STOPPED: STOPPED,
      events: EVENTS, trades: trades, revisions: revisions, budgetC: Cbud, TURN: TURN, RESET: RESET, ENTRY: ENTRY, RISK: RISK,
      isRevision: function (tt) { return (g0 + tt) % 5 === 0; }, g: function (tt) { return g0 + tt; }
    };
  }

  /* Compte FundedNext Stellar Instant (règles officielles, comme m1_stops_prop.py) : perte max 6 % suiveuse sur le plus haut
     solde (bloquée au solde de départ), pas de limite du jour, retrait dès +5 % sur le cycle ou après 10 séances (14 jours) avec
     au moins +1 %, en gardant 4 % au-dessus du seuil ; part 70 % aux deux premiers retraits puis 80 % ; compte cramé = racheté.
     r, rl : rendements quotidiens du compte (clôture, plus bas) ; s0, e0 : bornes (le compte démarre la séance après s0). */
  function instant(r, rl, s0, e0, size, fee, noWithdraw) {          // noWithdraw : aucun retrait, les gains restent sur le compte
    var paid = 0, fees = fee, burnt = 0, ev = [{ t: s0, type: 'achat', v: -fee }], bal = [], mll = [];
    function fresh(i) { return { bal: size, mll: 0.94 * size, b0: size, m0: 0.94 * size, hi: size, c0: i, n: 0 }; }
    var a = fresh(s0), worst = 0;
    for (var i = s0 + 1; i <= e0; i++) {
      var lowBal = a.bal + size * rl[i];
      worst = Math.min(worst, (lowBal - a.mll) / size);
      if (lowBal < a.mll) {
        burnt++; fees += fee; ev.push({ t: i, type: 'crame', v: 0, bal: a.bal }); ev.push({ t: i, type: 'achat', v: -fee });
        a = fresh(i); bal.push(a.bal); mll.push(a.mll); continue;
      }
      a.bal += size * r[i];
      if (a.bal > a.hi) { a.hi = a.bal; a.mll = Math.min(size, Math.max(a.mll, a.m0 + (a.hi - a.b0))); }
      var gg = a.bal - a.b0;
      if (!noWithdraw && (gg >= 0.05 * size || (i - a.c0 >= 10 && gg >= 0.01 * size))) {
        var wd = a.bal - Math.max(a.b0, a.mll + 0.04 * size);
        if (wd > 0) {
          var x = (a.n < 2 ? 0.70 : 0.80) * wd;
          paid += x; a.n++; a.bal -= wd; ev.push({ t: i, type: 'paiement', v: x, gross: wd, n: a.n });
          a.b0 = a.bal; a.m0 = a.mll; a.hi = a.bal; a.c0 = i;
        }
      }
      bal.push(a.bal); mll.push(a.mll);
    }
    return { net: paid - fees, paid: paid, fees: fees, burnt: burnt, events: ev, account: a, bal: bal, mll: mll };
  }

  /* Compte FundedNext Stellar 1-Step : challenge (objectif +10 %, au moins 2 jours de trading), puis compte financé qui repart
     du solde de départ ; perte du jour 3 % et perte maximale 6 % fixe sous le solde de départ, vérifiées au plus bas du jour ;
     retrait tous les 5 jours de bourse à 80 %, prix du challenge remboursé au 3e retrait ; compte cramé = nouveau challenge.
     noWithdraw : aucun retrait, les gains restent sur le compte financé. */
  function onestep(r, rl, s0, e0, size, fee, noWithdraw, margin, ch, every) {   // margin : part gardée avant de retirer ; ch : {r, rl} du mode challenge ; every : séances entre deux retraits (5)
    every = every || 5;
    var paid = 0, fees = fee, burnt = 0, passed = 0, ev = [{ t: s0, type: 'achat', v: -fee }], bal = [], floor = [], phase = [], cash = [];
    var fresh = function () { return { ph: 1, eq: size, days: 0, next: 0, n: 0 }; }, a = fresh();
    for (var i = s0 + 1; i <= e0; i++) {
      var rr = a.ph === 1 && ch ? ch.r : r, rrl = a.ph === 1 && ch ? ch.rl : rl, pnl = size * rr[i], low = size * rrl[i];
      a.days++;
      if (low <= -0.03 * size || a.eq + low <= 0.94 * size) {
        burnt++; fees += fee;
        ev.push({ t: i, type: 'crame', v: 0, bal: a.eq, ph: a.ph, why: low <= -0.03 * size ? 'jour' : 'max' }); ev.push({ t: i, type: 'achat', v: -fee });
        a = fresh(); bal.push(a.eq); floor.push(0.94 * size); phase.push(1); cash.push(paid - fees); continue;
      }
      a.eq += pnl;
      if (a.ph === 1 && a.eq >= 1.10 * size && a.days >= 2) {
        passed++; ev.push({ t: i, type: 'reussite', v: 0, bal: a.eq, days: a.days });
        a = { ph: 3, eq: size, days: 0, next: i + every, n: 0 };
      } else if (a.ph === 3 && !noWithdraw && i >= a.next) {
        a.next = i + every;
        var g = a.eq - size * (1 + (margin || 0));
        if (g > 0) { a.n++; var x = 0.8 * g + (a.n === 3 ? fee : 0); paid += x; ev.push({ t: i, type: 'paiement', v: x, gross: g, n: a.n, refund: a.n === 3 ? fee : 0 }); a.eq -= g; }
      }
      bal.push(a.eq); floor.push(0.94 * size); phase.push(a.ph); cash.push(paid - fees);
    }
    var rest = a.ph === 3 ? Math.max(0, a.eq - size) * 0.8 + (a.eq > size && a.n === 2 ? fee : 0) : 0;   // tout retiré au dernier jour
    return { net: paid - fees, paid: paid, fees: fees, burnt: burnt, passed: passed, events: ev, account: a, bal: bal, mll: floor, phase: phase, cash: cash, rest: rest };
  }

  var api = { CODES: CODES, decode: decode, run: run, instant: instant, onestep: onestep, median: median, std: std };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TriadeEngine = api;
})(this);
