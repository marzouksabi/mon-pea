"""Notifications du soir de l'application Repli (Web Push), envoyées par GitHub Actions.

Deux moments par jour de Bourse à New York :
  - « decision » : de 35 à 3 minutes avant la fin de journée. Verdict de chaque indice avec le prix du moment.
    Envoyée tous les jours de Bourse, même quand il n'y a rien à faire.
  - « bilan »    : de 15 minutes à 2 h 30 après la fin de journée. Ce que la règle a fait à la clôture
    (entrée, sortie) ; envoyée seulement s'il s'est passé quelque chose.
Le workflow tourne toutes les 10 minutes ; il garde en cache ce qui a déjà été envoyé (un envoi par moment et par jour).

Utilisation :
  python scripts/notify.py --slot          -> écrit slot=... et day=... (pour GITHUB_OUTPUT)
  python scripts/notify.py --send decision -> calcule et envoie
  FORCE=oui : moment « decision » forcé (notification de test).
Secrets : VAPID_PRIVATE (clé privée, base64url) et PUSH_SUBS (abonnement(s) copiés depuis l'application, JSON).
"""
import datetime as dt
import json
import os
import pathlib
import sys
import urllib.request
from zoneinfo import ZoneInfo

ROOT = pathlib.Path(__file__).resolve().parent.parent
NY, PARIS = ZoneInfo('America/New_York'), ZoneInfo('Europe/Paris')
def _nyse_calendar(y0=2025, y1=2045):
    """Jours fériés et fermetures à 13 h de la Bourse de New York, d'après les règles du NYSE."""
    def wd(y, m, d):
        return dt.date(y, m, d).weekday()            # lundi = 0 ... dimanche = 6

    def nth(y, m, w, n):                             # n-ième jour w (lundi = 0) du mois
        first = dt.date(y, m, 1)
        return first + dt.timedelta(days=(w - first.weekday()) % 7 + 7 * (n - 1))

    def last_monday(y, m):
        d = dt.date(y, m + 1, 1) - dt.timedelta(days=1)
        return d - dt.timedelta(days=d.weekday())

    def observed(y, m, d):
        x = dt.date(y, m, d)
        return x - dt.timedelta(days=1) if x.weekday() == 5 else x + dt.timedelta(days=1) if x.weekday() == 6 else x

    def easter(y):
        a, b, c = y % 19, y // 100, y % 100
        d, e, f = b // 4, b % 4, (b + 8) // 25
        g = (b - f + 1) // 3
        h = (19 * a + b - d - g + 15) % 30
        i, k = c // 4, c % 4
        l = (32 + 2 * e + 2 * i - h - k) % 7
        m = (a + 11 * h + 22 * l) // 451
        return dt.date(y, (h + l - 7 * m + 114) // 31, (h + l - 7 * m + 114) % 31 + 1)

    hol, early = set(), set()
    for y in range(y0, y1 + 1):
        if wd(y, 1, 1) != 5:                         # 1er janvier un samedi : pas de report au vendredi
            hol.add(observed(y, 1, 1))
        hol.update({nth(y, 1, 0, 3), nth(y, 2, 0, 3), easter(y) - dt.timedelta(days=2), last_monday(y, 5),
                    observed(y, 6, 19), observed(y, 7, 4), nth(y, 9, 0, 1), nth(y, 11, 3, 4), observed(y, 12, 25)})
        if 1 <= wd(y, 7, 4) <= 4:                    # veille du 4 juillet (du lundi au jeudi)
            early.add(dt.date(y, 7, 3))
        early.add(nth(y, 11, 3, 4) + dt.timedelta(days=1))   # lendemain de Thanksgiving
        if wd(y, 12, 24) <= 3:                       # veille de Noël (du lundi au jeudi)
            early.add(dt.date(y, 12, 24))
    return {d.isoformat() for d in hol}, {d.isoformat() for d in early}


HOLIDAYS, EARLY = _nyse_calendar()
NAMES = {'spx': ('S&P 500', '%5EGSPC'), 'ndx': ('Nasdaq-100', '%5ENDX')}
UA = {'User-Agent': 'Mozilla/5.0 (pea-app notifications)'}
FORCE = os.environ.get('FORCE', '').strip().lower() in ('oui', 'yes', 'true', '1')


def fr(v, d=0):
    return f'{v:,.{d}f}'.replace(',', ' ').replace('.', ',')


def pct(v):
    return ('+' if v >= 0 else '−') + fr(abs(v) * 100, 1) + ' %'


def close_time(day):
    h = 13 if day.isoformat() in EARLY else 16
    return dt.datetime.combine(day, dt.time(h, 0), NY)


def slot_now():
    now = dt.datetime.now(NY)
    day = now.date()
    if os.environ.get('MOMENT') in ('decision', 'bilan'):
        return os.environ['MOMENT'], day
    if FORCE:
        return 'decision', day
    if now.weekday() >= 5 or day.isoformat() in HOLIDAYS:
        return 'none', day
    c = close_time(day)
    if c - dt.timedelta(minutes=35) <= now < c - dt.timedelta(minutes=3):
        return 'decision', day
    if c + dt.timedelta(minutes=15) <= now < c + dt.timedelta(minutes=150):
        return 'bilan', day
    return 'none', day


def yahoo(sym, rng, interval):
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{sym}?interval={interval}&range={rng}'
    return json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read().decode())['chart']['result'][0]


def history(k, upto):
    """clôtures quotidiennes jusqu'au jour 'upto' inclus (données de l'appli + derniers jours Yahoo)."""
    d = json.loads((ROOT / 'data' / 'market.json').read_text(encoding='utf8'))['idx'][k]
    day0 = dt.date(1970, 1, 1)
    days, acc = [], 0
    for x in d['d']:
        acc += x
        days.append(day0 + dt.timedelta(days=acc))
    closes = list(d['c'])
    try:
        j = yahoo(NAMES[k][1], '1mo', '1d')
        for t, c in zip(j['timestamp'], j['indicators']['quote'][0]['close']):
            day = dt.datetime.fromtimestamp(t, NY).date()
            if c and day > days[-1] and day <= upto:
                days.append(day)
                closes.append(round(c, 2))
    except Exception as e:  # noqa: BLE001
        print('Yahoo indisponible :', e)
    return days, closes


def analyze(c):
    """Règle de repli : RSI 2 < 10 au-dessus de la moyenne 200 ; sortie au-dessus de la moyenne 5 ; 10 jours de Bourse au plus."""
    n = len(c)
    au, ad = [0.0] * n, [0.0] * n
    for i in range(1, n):
        d = c[i] - c[i - 1]
        au[i] = (au[i - 1] + max(d, 0)) / 2
        ad[i] = (ad[i - 1] + max(-d, 0)) / 2
    sma200 = lambda k: sum(c[k - 199:k + 1]) / 200
    rsi = lambda k: 100.0 if ad[k] == 0 else 100 - 100 / (1 + au[k] / ad[k])
    sma5 = lambda k: sum(c[k - 4:k + 1]) / 5
    trades, open_i, i = [], None, 199
    while i < n:
        if c[i] > sma200(i) and rsi(i) < 10:
            j = i + 1
            while j < n and not (c[j] > sma5(j)) and j - i < 10:
                j += 1
            if j >= n:
                open_i = i
                break
            trades.append((i, j))
            i = j
        i += 1
    P, F = c[-1], sum(c[-199:]) / 199
    out = {'trades': trades, 'open': open_i}
    if open_i is not None:
        out.update(mode='pos', held=n - open_i, Y=sum(c[-4:]) / 4, entry=c[open_i])
    else:
        X = P + (ad[-1] - 9 * au[-1]) / 9 if ad[-1] > 9 * au[-1] else P - (9 * au[-1] - ad[-1])
        out.update(mode='flat', X=X, F=F, possible=X > F)
    return out


def decision(day):
    lines = []
    for k, (name, sym) in NAMES.items():
        days, c = history(k, day - dt.timedelta(days=1))     # jusqu'à hier soir
        a = analyze(c)
        try:
            p = yahoo(sym, '1d', '5m')['meta']['regularMarketPrice']
        except Exception:  # noqa: BLE001
            p = None
        now = f' (maintenant {fr(p)})' if p else ''
        if a['mode'] == 'pos':
            if a['held'] >= 10:
                lines.append(f'{name} : SORTIR ce soir, dernier jour autorisé{now}.')
            elif p:
                lines.append(f"{name} : {'SORTIR' if p > a['Y'] else 'GARDER'} — sortie si fin > {fr(a['Y'])}{now}.")
            else:
                lines.append(f"{name} : trade en cours — sortie si fin > {fr(a['Y'])}.")
        elif a['possible']:
            if p:
                go = a['F'] < p < a['X']
                lines.append(f"{name} : {'ENTRER' if go else 'ATTENDRE'} — entrée si fin < {fr(a['X'])}{now}.")
            else:
                lines.append(f"{name} : entrée possible si fin < {fr(a['X'])}.")
        else:
            lines.append(f'{name} : rien à faire.')
    return lines


def bilan(day):
    lines = []
    for k, (name, _) in NAMES.items():
        days, c = history(k, day)
        if days[-1] != day:
            print(f'{name} : clôture du jour pas encore disponible')
            continue
        before, after = analyze(c[:-1]), analyze(c)
        last = len(c) - 1
        if before['mode'] == 'pos' and (after['mode'] == 'flat' or (after['open'] is not None and after['open'] != before['open'])):
            i = before['open']
            lines.append(f'{name} : la règle est SORTIE à {fr(c[-1])} (entrée {fr(c[i])}, {pct(c[-1] / c[i] - 1)} sur l\'indice). Ferme le trade et note la sortie dans le Journal.')
        elif after['mode'] == 'pos' and after['open'] == last:
            lines.append(f'{name} : la règle est ENTRÉE à {fr(c[-1])}. Note l\'entrée dans le Journal.')
    return lines


def send(title, lines):
    payload = {'title': title, 'body': '\n'.join(lines), 'url': './repli/'}
    print(json.dumps(payload, ensure_ascii=False, indent=1))
    key, subs = os.environ.get('VAPID_PRIVATE', '').strip(), os.environ.get('PUSH_SUBS', '').strip()
    if not key or not subs:
        print('Secrets VAPID_PRIVATE ou PUSH_SUBS absents : notification non envoyée.')
        return
    from pywebpush import WebPushException, webpush
    subs = json.loads(subs)
    for s in (subs if isinstance(subs, list) else [subs]):
        try:
            webpush(subscription_info=s, data=json.dumps(payload, ensure_ascii=False), vapid_private_key=key,
                    vapid_claims={'sub': 'https://marzouksabi.github.io'}, ttl=3600)
            print('envoyée :', s['endpoint'][:40] + '…')
        except WebPushException as e:
            print('échec :', e)
            raise SystemExit(1)


def main():
    if '--slot' in sys.argv:
        slot, day = slot_now()
        print(f'slot={slot}')
        print(f'day={day.isoformat()}')
        return
    which = sys.argv[sys.argv.index('--send') + 1] if '--send' in sys.argv else slot_now()[0]
    day = dt.datetime.now(NY).date()
    decide = (close_time(day).astimezone(PARIS) - dt.timedelta(minutes=10)).strftime('%H h %M')
    if which == 'decision':
        send(f'Repli · décision avant {close_time(day).astimezone(PARIS):%H h %M}' + (' (test)' if FORCE else ''), decision(day))
    elif which == 'bilan':
        lines = bilan(day)
        if lines:
            send('Repli · bilan de la clôture', lines)
        else:
            print('Ni entrée ni sortie ce soir : pas de notification de bilan.')
    else:
        print('Hors des moments de notification.')
    _ = decide


if __name__ == '__main__':
    main()
