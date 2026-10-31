# Metastro — météo astro

Metastro est un site statique de prévisions météo pour l'astronomie amateur. Pour un lieu donné, il indique nuit par nuit si le ciel vaudra la peine de sortir le télescope.

## Fonctionnalités

- **Note d'observation de 0 à 100** pour chaque heure et chaque nuit. Elle combine les nuages, l'obscurité, la transparence, le seeing, le vent et les précipitations.
- **7 nuits de prévisions**, avec le meilleur créneau d'observation de chaque nuit.
- **Tableau heure par heure** : nuages bas, moyens et hauts, transparence, seeing, hauteur de la Lune, humidité, écart au point de rosée, vent, rafales, courant-jet et précipitations.
- **Frise de 24 h** : jour, crépuscules civil, nautique et astronomique, nuit noire et présence de la Lune.
- **Éphémérides** calculées dans le navigateur : coucher et lever du Soleil, nuit astronomique, lever et coucher de la Lune, phase, illumination, prochaines pleine et nouvelle lune.
- **Recherche de lieu**, géolocalisation et lien partageable (`?lat=…&lon=…&name=…`). Le dernier lieu consulté est mémorisé.
- **Mode vision nocturne** (rouge) pour préserver l'adaptation de l'œil à l'obscurité.

## Sources de données

| Donnée | Source |
| --- | --- |
| Prévisions météo horaires | [Open-Meteo](https://open-meteo.com/) (gratuit, sans clé, CC BY 4.0) |
| Recherche de lieux | API de géocodage d'Open-Meteo |
| Nom du lieu après géolocalisation | BigDataCloud (reverse geocoding côté client) |
| Soleil et Lune | Calcul local (`assets/js/astro.js`) |

Le seeing et la transparence sont des **estimations**. Le seeing vient du courant-jet à 250 hPa et des rafales au sol. La transparence vient de l'humidité, de la visibilité et des nuages hauts.

## Lancer en local

Aucune dépendance ni étape de build.

```bash
npm start          # ou : python3 -m http.server 8080
# puis ouvrir http://localhost:8080
```

On peut aussi ouvrir directement `index.html` dans un navigateur.

## Tests

```bash
npm test           # Node.js 18 ou plus récent
```

Les tests vérifient les éphémérides contre des valeurs connues (équinoxe 2024 à Paris, phases d'avril 2024). Ils couvrent aussi les indices et le découpage des prévisions en nuits.

## Releases

Chaque tag `vX.Y.Z` poussé déclenche le workflow `Publication de release`. Il vérifie que le tag correspond à la version de `package.json` et lance les tests. Il publie ensuite la release GitHub avec les notes de `RELEASE_NOTES.md` et le paquet `metastro-vX.Y.Z.zip`, prêt à déposer sur un hébergement statique.

```bash
git tag -a v1.0.0 -m "Metastro v1.0.0"
git push origin v1.0.0
```

On peut aussi lancer le workflow à la main (onglet **Actions**, *Run workflow*) en indiquant le tag. S'il n'existe pas encore, il est créé sur le commit de la branche choisie.

## Publier avec GitHub Pages

Dans **Settings → Pages**, choisissez **Deploy from a branch**, puis la branche `main` et le dossier `/ (root)`. Le site est entièrement statique.

## Structure

```
index.html
assets/
  css/style.css
  js/astro.js      éphémérides Soleil / Lune
  js/forecast.js   appels API et calcul des notes
  js/app.js        interface
  favicon.svg
tests/metastro.test.js
RELEASE_NOTES.md
.github/workflows/release.yml
```
