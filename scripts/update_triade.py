"""Cours quotidiens des 18 marchés de l'application Triade (moteur M1 : repli dosé + suivi de tendance + indices dosés).

Écrit deux fichiers : data/triade-histo.json (séances jusqu'au 31 décembre de l'an dernier, réécrit une fois par an : le
téléphone ne le recharge donc presque jamais) et data/triade.json (séances de l'année en cours, réécrit à chaque passage).
Chacun contient le calendrier des séances de New York (S&P 500 et Nasdaq-100 cotés), et pour chaque marché ouverture,
plus haut, plus bas, clôture, en nombres entiers compacts :
  c : écart de clôture avec la séance précédente (la première valeur est la clôture elle-même), en unités de 10^-k
  o : ouverture - clôture ; h : plus haut - clôture (>= 0) ; l : clôture - plus bas (>= 0)
Un jour sans cotation (jour férié local) reprend la clôture précédente (écarts nuls), comme dans le labo.
Source : Yahoo (devises au comptant, or et argent en contrats à terme, indices au comptant).
'i0' est le rang de la première séance du fichier dans le calendrier du labo qui démarre le 2 janvier 1990 (le 2 janvier 2008
y est la séance 4538) : il cale la révision hebdomadaire (une séance sur cinq) exactement comme dans la recherche."""
import sys
import datetime as dt
import json
import pathlib
import time
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT, HISTO = ROOT / 'data' / 'triade.json', ROOT / 'data' / 'triade-histo.json'
UA = {'User-Agent': 'Mozilla/5.0 (pea-app)'}
START, I0 = dt.date(2008, 1, 1), 4538
MARKETS = [  # code FundedNext, ticker Yahoo, nom, décimales gardées
    ('SPX500', '^GSPC', 'S&P 500', 1), ('NDX100', '^NDX', 'Nasdaq-100', 1), ('US30', '^DJI', 'Dow Jones', 1),
    ('GER30', '^GDAXI', 'DAX 40', 1), ('UK100', '^FTSE', 'FTSE 100', 1), ('FRA40', '^FCHI', 'CAC 40', 1),
    ('AUS200', '^AXJO', 'ASX 200', 1), ('HK50', '^HSI', 'Hang Seng', 1), ('JP225', '^N225', 'Nikkei 225', 1),
    ('EURUSD', 'EURUSD=X', 'Euro / dollar', 5), ('GBPUSD', 'GBPUSD=X', 'Livre / dollar', 5), ('USDJPY', 'JPY=X', 'Dollar / yen', 3),
    ('AUDUSD', 'AUDUSD=X', 'Dollar australien / dollar', 5), ('USDCAD', 'CAD=X', 'Dollar / dollar canadien', 5),
    ('USDCHF', 'CHF=X', 'Dollar / franc suisse', 5), ('NZDUSD', 'NZDUSD=X', 'Dollar néo-zélandais / dollar', 5),
    ('XAUUSD', 'GC=F', 'Or', 1), ('XAGUSD', 'SI=F', 'Argent', 3)]


def get(url):
    last = None
    for k in range(4):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read().decode()
        except Exception as e:
            last = e
            time.sleep(2 + 3 * k)
    raise last


def daily(sym):
    p1 = int(dt.datetime(START.year, START.month, START.day, tzinfo=dt.timezone.utc).timestamp())
    j = json.loads(get(f'https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sym)}?period1={p1}&period2={int(time.time())}&interval=1d'))
    r = j['chart']['result'][0]
    q = r['indicators']['quote'][0]
    out = {}
    for t, o, h, l, c in zip(r['timestamp'], q['open'], q['high'], q['low'], q['close']):
        if c:
            d = dt.datetime.fromtimestamp(t, dt.timezone.utc).date()
            out[d] = (o or c, max(h or c, c), min(l or c, c), c)
    return out


def main():
    data = {}
    for code, sym, name, k in MARKETS:
        data[code] = daily(sym)
        time.sleep(0.4)
    ny = dt.datetime.now(ZoneInfo('America/New_York'))
    cal = sorted(d for d in set(data['SPX500']) & set(data['NDX100']) if d >= START)
    if cal and cal[-1] == ny.date() and (ny.hour, ny.minute) < (16, 30):
        cal.pop()                                                    # séance du jour pas encore terminée
    if cal[0] != dt.date(2008, 1, 2):
        raise SystemExit('calendrier inattendu : la première séance devrait être le 2 janvier 2008')
    days = [(d - dt.date(1970, 1, 1)).days for d in cal]
    full = {}
    for code, sym, name, k in MARKETS:                              # cours entiers, jours sans cotation repris de la veille
        f = 10 ** k
        first = next(d for d in cal if d in data[code])             # un marché sans cours au départ reprend sa première cotation
        prev = round(data[code][first][3] * f)
        rows = []
        for d in cal:
            v = data[code].get(d)
            if v is None:
                rows.append((prev, 0, 0, 0))
            else:
                cc = round(v[3] * f)
                rows.append((cc, round(v[0] * f) - cc, max(0, round(v[1] * f) - cc), max(0, cc - round(v[2] * f))))
            prev = rows[-1][0]
        full[code] = rows
    stamp = dt.datetime.now(dt.timezone.utc).isoformat(timespec='minutes')

    def write(path, a, b):
        m = {}
        for code, sym, name, k in MARKETS:
            rows = full[code][a:b]
            m[code] = {'n': name, 'k': k, 'c': [r[0] - (rows[n - 1][0] if n else 0) for n, r in enumerate(rows)],
                       'o': [r[1] for r in rows], 'h': [r[2] for r in rows], 'l': [r[3] for r in rows]}
        dd = days[a:b]
        path.write_text(json.dumps({'updated': stamp, 'i0': I0 + a, 'd': [dd[n] - (dd[n - 1] if n else 0) for n in range(len(dd))], 'm': m},
                                   separators=(',', ':'), ensure_ascii=False), encoding='utf8')
        print(f'écrit {path.name} : {b - a} séances' + (f' du {cal[a]} au {cal[b - 1]}' if b > a else '') + f', {path.stat().st_size // 1024} Ko')

    cut = next((n for n, d in enumerate(cal) if d.year >= ny.year), len(cal))   # premières séances de l'année en cours
    old = None
    if HISTO.exists():
        try:
            h = json.loads(HISTO.read_text(encoding='utf8')); old = h['i0'] + len(h['d'])
        except Exception:
            old = None
    if old != I0 + cut or '--histo' in sys.argv:                    # nouvelle année (ou fichier absent) : historique réécrit
        write(HISTO, 0, cut)
    write(OUT, cut, len(cal))

if __name__ == '__main__':
    main()
