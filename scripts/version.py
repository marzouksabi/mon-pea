"""Numéro de version des applications Repli et Triade : à lancer avant chaque publication.
Met la date dans le code (affichée dans Compte) et dans le nom des fichiers chargés par la page,
pour que les téléphones chargent toujours la dernière version au lieu d'une copie gardée en mémoire."""
import datetime as dt
import pathlib
import re

BASE = pathlib.Path(__file__).resolve().parent.parent
now = dt.datetime.now()
v = now.strftime('%Y%m%d%H%M')
for app in ('repli', 'triade'):
    root = BASE / app
    js = root / 'app.js'
    s = js.read_text(encoding='utf8')
    s = re.sub(r"var VERSION = 'version du [^']*';", "var VERSION = 'version du " + now.strftime('%d/%m %H:%M') + "';", s)
    js.write_text(s, encoding='utf8')
    html = root / 'index.html'
    t = html.read_text(encoding='utf8')
    t = re.sub(r'href="app\.css(\?v=\d+)?"', f'href="app.css?v={v}"', t)
    for name in ('app.js', 'engine.js'):
        t = re.sub(r'src="' + re.escape(name) + r'(\?v=\d+)?"', f'src="{name}?v={v}"', t)
    html.write_text(t, encoding='utf8')
print('version', v)
