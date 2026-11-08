"""Notification du soir de l'application Repli (Web Push).

Lancé par GitHub Actions plusieurs fois l'après-midi ; n'envoie que pendant la fenêtre de 15 h 20 à 16 h à New York
(12 h 20 – 13 h les jours de fermeture anticipée), donc une seule fois par jour de Bourse, environ 30 minutes avant
la fin de journée. Rien n'est envoyé si aucun indice n'a de trade en cours ni d'entrée possible.

Secrets : VAPID_PRIVATE (clé privée, base64url) et PUSH_SUBS (abonnement(s) copiés depuis l'application, JSON).
FORCE=oui envoie quand même (notification de test).
"""
import datetime as dt
import json
import os
import pathlib
import urllib.request
from zoneinfo import ZoneInfo

ROOT = pathlib.Path(__file__).resolve().parent.parent
NY, PARIS = ZoneInfo('America/New_York'), ZoneInfo('Europe/Paris')
HOLIDAYS = {'2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
            '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24'}
EARLY = {'2026-11-27', '2026-12-24', '2027-11-26'}
NAMES = {'spx': ('S&P 500', '%5EGSPC'), 'ndx': ('Nasdaq-100', '%5ENDX')}


def fr(v):
    return f'{v:,.0f}'.replace(',', ' ')


def live_price(sym):
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{sym}?interval=5m&range=1d'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (pea-app notifications)'})
    j = json.loads(urllib.request.urlopen(req, timeout=30).read().decode())['chart']['result'][0]
    closes = [c for c in j['indicators']['quote'][0].get('close') or [] if c]
    return closes[-1] if closes else j['meta']['regularMarketPrice']


def analyze(c):
    """Même règle que l'application : RSI 2 < 10 au-dessus de la moyenne 200, sortie au-dessus de la moyenne 5, 10 jours de Bourse au plus."""
    n = len(c)
    au, ad = [0.0] * n, [0.0] * n
    for i in range(1, n):
        d = c[i] - c[i - 1]
        au[i] = (au[i - 1] + max(d, 0)) / 2
        ad[i] = (ad[i - 1] + max(-d, 0)) / 2
    sma200 = [sum(c[i - 199:i + 1]) / 200 if i >= 199 else float('nan') for i in range(n)]
    rsi = lambda k: 100.0 if ad[k] == 0 else 100 - 100 / (1 + au[k] / ad[k])
    sma5 = lambda k: sum(c[k - 4:k + 1]) / 5
    open_i, i = None, 199
    while i < n:
        if c[i] > sma200[i] and rsi(i) < 10:
            j = i + 1
            while j < n and not (c[j] > sma5(j)) and j - i < 10:
                j += 1
            if j >= n:
                open_i = i
                break
            i = j
        i += 1
    P, F = c[-1], sum(c[-199:]) / 199
    if open_i is not None:
        return {'mode': 'pos', 'held': n - open_i, 'Y': sum(c[-4:]) / 4, 'entry': c[open_i]}
    X = P + (ad[-1] - 9 * au[-1]) / 9 if ad[-1] > 9 * au[-1] else P - (9 * au[-1] - ad[-1])
    return {'mode': 'flat', 'X': X, 'possible': X > F}


def message():
    data = json.loads((ROOT / 'data' / 'market.json').read_text(encoding='utf8'))['idx']
    lines, watch = [], False
    for k, (name, sym) in NAMES.items():
        a = analyze(data[k]['c'])
        try:
            p = live_price(sym)
        except Exception:  # noqa: BLE001 - la notification part quand même, sans prix du moment
            p = None
        now = f' Maintenant {fr(p)}' if p else ''
        if a['mode'] == 'pos':
            watch = True
            if a['held'] >= 10:
                lines.append(f'{name} : dernier jour, sortir ce soir.')
            else:
                verdict = (' → sortir.' if p > a['Y'] else ' → garder.') if p else '.'
                lines.append(f"{name} : trade en cours. Sortir si le prix de fin de journée dépasse {fr(a['Y'])}.{now}{verdict}")
        elif a['possible']:
            watch = True
            verdict = (' → entrer.' if p < a['X'] else ' → pas d\'entrée.') if p else '.'
            lines.append(f"{name} : entrée possible si le prix de fin de journée est sous {fr(a['X'])}.{now}{verdict}")
        else:
            lines.append(f'{name} : rien à faire.')
    return watch, lines


def main():
    force = os.environ.get('FORCE', '').strip().lower() in ('oui', 'yes', 'true', '1')
    now = dt.datetime.now(NY)
    day = now.date().isoformat()
    close_h = 13 if day in EARLY else 16
    in_window = now.weekday() < 5 and day not in HOLIDAYS and dt.time(close_h - 1, 20) <= now.time() < dt.time(close_h, 0)
    if not in_window and not force:
        print(f'Hors fenêtre ({now:%Y-%m-%d %H:%M} à New York) : rien à envoyer.')
        return
    watch, lines = message()
    close_paris = now.replace(hour=close_h, minute=0, second=0, microsecond=0).astimezone(PARIS)
    decide = (close_paris - dt.timedelta(minutes=10)).strftime('%H h %M')
    if not watch and not force:
        print('Aucun indice à surveiller ce soir : pas de notification.')
        return
    payload = {'title': f'Repli · décision à {decide}' + (' (test)' if force and not in_window else ''),
               'body': '\n'.join(lines), 'url': './repli/'}
    print(json.dumps(payload, ensure_ascii=False, indent=1))

    from pywebpush import WebPushException, webpush
    key, subs = os.environ.get('VAPID_PRIVATE', '').strip(), os.environ.get('PUSH_SUBS', '').strip()
    if not key or not subs:
        print('Secrets VAPID_PRIVATE ou PUSH_SUBS absents : notification non envoyée.')
        return
    subs = json.loads(subs)
    subs = subs if isinstance(subs, list) else [subs]
    for s in subs:
        try:
            webpush(subscription_info=s, data=json.dumps(payload, ensure_ascii=False), vapid_private_key=key,
                    vapid_claims={'sub': 'https://marzouksabi.github.io/mon-pea/'}, ttl=3600)
            print('envoyée :', s['endpoint'][:40] + '…')
        except WebPushException as e:
            print('échec :', e)


if __name__ == '__main__':
    main()
