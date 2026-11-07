# Mon PEA

Application pour iPhone (web, installable sur l'écran d'accueil) qui accompagne un PEA investi en ETF actions mondiales.

- **Semaine** : part conseillée en actions selon la règle de dosage (volatilité acceptée 20 %, mesure sur 60 séances, réajustement seulement si l'écart dépasse 20 points), et ce qu'il faut faire cette semaine à partir de la valeur de tes ETF et de tes liquidités.
- **Objectif** : chances d'atteindre un montant à un âge donné, et versement mensuel nécessaire, d'après toutes les dates de départ possibles depuis 2000.
- **Suivi** : relevés mensuels de la valeur du PEA, gain et progression vers l'objectif.
- **Repères** : le plan, la routine, les règles du PEA et ce que la recherche a montré.

Tout est calculé sur le téléphone. Les montants que tu saisis restent dans le téléphone et ne sont envoyés nulle part.

## Installer sur l'iPhone

1. Ouvre l'adresse de l'application dans **Safari**.
2. Touche le bouton **Partager** (le carré avec une flèche).
3. Choisis **Sur l'écran d'accueil**, puis **Ajouter**.

L'application s'ouvre ensuite en plein écran depuis son icône, comme une application normale.

## Mise à jour des cours

Chaque soir de semaine, GitHub Actions récupère les cours et republie l'application (`.github/workflows/deploy.yml`) :

- ETF **CW8** (Amundi MSCI World, éligible PEA, en euros), cours quotidiens via Yahoo Finance ;
- indice **MSCI World dividendes nets réinvestis en euros**, mensuel, via MSCI ;
- **inflation française** (IPCH), mensuelle, via FRED.

Si une source ne répond pas, l'ancienne donnée est conservée. Pour forcer une mise à jour : onglet **Actions** du dépôt, workflow « Mise à jour des cours et publication », bouton **Run workflow**.

## Publication sur GitHub Pages

Dans le dépôt : **Settings → Pages → Source : GitHub Actions**. L'adresse de l'application s'affiche ensuite sur cette même page.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `app.css`, `app.js` | l'application |
| `manifest.webmanifest`, `sw.js`, `icons/` | installation sur l'écran d'accueil et fonctionnement hors ligne |
| `data/market.json` | cours utilisés par l'application |
| `scripts/update_data.py` | récupération des cours |
| `.github/workflows/deploy.yml` | mise à jour automatique et publication |

Ce n'est pas un conseil d'investissement : l'application applique des règles mécaniques testées sur le passé.
