"""Met à jour data/market.json : cours quotidiens de l'ETF CW8 (MSCI World éligible PEA, en euros),
indice MSCI World dividendes nets réinvestis en euros (mensuel) et inflation française (IPCH, mensuel).

Exécuté chaque soir de semaine par GitHub Actions. En cas d'échec d'une source, l'ancienne donnée est conservée.
"""
import datetime as dt
import json
import pathlib
import subprocess
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'market.json'
UA = {'User-Agent': 'Mozilla/5.0 (pea-app data update)'}


def get(url, tries=3):
    last = None
    for k in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=45).read().decode()
        except Exception as e:  # noqa: BLE001 - on retente puis on garde l'ancienne donnée
            last = e
            time.sleep(5 * (k + 1))
    raise last


def etf(ticker='CW8.PA'):
    j = json.loads(get(f'https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=20y'))['chart']['result'][0]
    rows = [(t // 86400, round(c, 4)) for t, c in zip(j['timestamp'], j['indicators']['adjclose'][0]['adjclose']) if c]
    days = [r[0] for r in rows]
    if len(rows) < 1000:
        raise ValueError('historique trop court')
    return {'ticker': ticker, 'name': 'Amundi MSCI World (CW8)',
            'd': [days[0]] + [days[i] - days[i - 1] for i in range(1, len(days))],
            'c': [r[1] for r in rows]}


def msci():
    end = dt.date.today().strftime('%Y%m%d')
    j = json.loads(get('https://app2.msci.com/products/service/index/indexmaster/getLevelDataForGraph?currency_symbol=EUR'
                       f'&index_variant=NETR&start_date=19970101&end_date={end}&data_frequency=END_OF_MONTH&index_codes=990100'))
    lv = j['indexes']['INDEX_LEVELS']
    if len(lv) < 200:
        raise ValueError('historique trop court')
    return {'start': str(lv[0]['calc_date'])[:6], 'v': [round(x['level_eod'], 4) for x in lv]}


def curl(url):
    # FRED coupe souvent les requetes faites en Python ; curl passe
    return subprocess.run(['curl', '-s', '-f', '--max-time', '60', '--retry', '3', url], check=True, capture_output=True, text=True).stdout


def hicp():
    rows = [r.split(',') for r in curl('https://fred.stlouisfed.org/graph/fredgraph.csv?id=CP0000FRM086NEST').strip().splitlines()[1:]]
    rows = [(d[:7].replace('-', ''), float(v)) for d, v in rows if v not in ('.', '')]
    return {'start': rows[0][0], 'v': [v for _, v in rows]}


def index_series(sym):
    """Clotures et plus bas quotidiens d'un indice sur 5 ans ; la seance du jour est retiree tant qu'elle n'est pas terminee."""
    from zoneinfo import ZoneInfo
    j = json.loads(get(f'https://query1.finance.yahoo.com/v8/finance/chart/{sym}?interval=1d&range=5y'))['chart']['result'][0]
    ny = ZoneInfo('America/New_York')
    q = j['indicators']['quote'][0]
    rows = [(dt.datetime.fromtimestamp(t, ny).date(), round(c, 2), round(min(lo or c, c), 2), round(o or c, 2), round(max(hi or c, c, o or c), 2))
            for t, c, lo, o, hi in zip(j['timestamp'], q['close'], q['low'], q['open'], q['high']) if c]
    now = dt.datetime.now(ny)
    if rows and rows[-1][0] == now.date() and (now.hour, now.minute) < (16, 30):
        rows.pop()
    if len(rows) < 300:
        raise ValueError('historique trop court')
    days = [(r[0] - dt.date(1970, 1, 1)).days for r in rows]
    return {'d': [days[0]] + [days[i] - days[i - 1] for i in range(1, len(days))], 'c': [r[1] for r in rows], 'l': [r[2] for r in rows], 'o': [r[3] for r in rows], 'h': [r[4] for r in rows]}


def indices():
    return {'spx': index_series('%5EGSPC'), 'ndx': index_series('%5ENDX')}


def main():
    old = json.loads(OUT.read_text(encoding='utf8')) if OUT.exists() else {}
    new = dict(old)
    for key, fn in (('etf', etf), ('msci', msci), ('hicp', hicp), ('idx', indices)):
        try:
            new[key] = fn()
            print(f'{key} : ok')
        except Exception as e:  # noqa: BLE001
            print(f'{key} : échec ({e}), ancienne donnée conservée')
    if not all(k in new for k in ('etf', 'msci', 'hicp')):  # les indices sont facultatifs
        raise SystemExit('données incomplètes et aucune version précédente')
    new['updated'] = dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%MZ')
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(new, separators=(',', ':')), encoding='utf8')
    print('écrit', OUT, OUT.stat().st_size // 1024, 'Ko')


if __name__ == '__main__':
    main()
