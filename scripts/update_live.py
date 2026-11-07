"""Relève le dernier cours connu du S&P 500 et du Nasdaq-100 (bougies de 5 minutes) pour l'application Repli.

Exécuté toutes les 15 minutes autour de la clôture de New York. Le fichier data/live.json n'est pas
enregistré dans le dépôt : il est seulement publié avec le site.
"""
import datetime as dt
import json
import pathlib
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'live.json'
UA = {'User-Agent': 'Mozilla/5.0 (pea-app live quotes)'}


def last_price(sym):
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{sym}?interval=5m&range=1d'
    j = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read().decode())['chart']['result'][0]
    meta = j['meta']
    rows = [(t, c) for t, c in zip(j.get('timestamp') or [], j['indicators']['quote'][0].get('close') or []) if c]
    if rows:
        t, c = rows[-1]
    else:
        t, c = meta['regularMarketTime'], meta['regularMarketPrice']
    return {'p': round(float(c), 2), 't': int(t), 'prev': round(float(meta.get('chartPreviousClose') or meta.get('previousClose') or 0), 2)}


def main():
    out = {'updated': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}
    for key, sym in (('spx', '%5EGSPC'), ('ndx', '%5ENDX')):
        try:
            out[key] = last_price(sym)
            print(f'{key} : {out[key]}')
        except Exception as e:  # noqa: BLE001 - un relevé manqué n'empêche pas la publication
            print(f'{key} : échec ({e})')
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(',', ':')), encoding='utf8')


if __name__ == '__main__':
    main()
