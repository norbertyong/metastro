# Metastro — météo astro

Metastro est un site statique de prévisions météo pour l'astronomie amateur. Pour un lieu donné, il indique nuit par nuit si le ciel vaudra la peine de sortir le télescope.

## Fonctionnalités

- **Note d'observation de 0 à 100** pour chaque heure et chaque nuit. Elle combine les nuages, l'obscurité, la transparence, le seeing, le vent et les précipitations.
- **7 nuits de prévisions**, avec le meilleur créneau d'observation de chaque nuit.
- **Fiabilité de la prévision** : la nébulosité de quatre modèles (ECMWF, ICON, GFS, Météo-France) est comparée nuit par nuit et heure par heure.
- **Quoi observer** : planètes visibles avec horaires, hauteur et direction ; environ 70 objets du ciel profond classés pour la nuit selon la hauteur, la Lune et le ciel prévu ; fenêtre du cœur de la Voie lactée.
- **Tableau heure par heure** : nuages bas, moyens et hauts, transparence, seeing, hauteur de la Lune, humidité, écart au point de rosée, vent, rafales, courant-jet et précipitations.
- **Frise de 24 h** : jour, crépuscules civil, nautique et astronomique, nuit noire et présence de la Lune.
- **Éphémérides** calculées dans le navigateur : coucher et lever du Soleil, nuit astronomique, lever et coucher de la Lune, phase, illumination, prochaines pleine et nouvelle lune.
- **Recherche de lieu**, géolocalisation et lien partageable (`?lat=…&lon=…&name=…`). Le dernier lieu consulté est mémorisé.
- **Mode vision nocturne** (rouge) pour préserver l'adaptation de l'œil à l'obscurité.

## Sources de données

| Donnée | Source |
| --- | --- |
| Prévisions météo horaires | [Open-Meteo](https://open-meteo.com/) (gratuit, sans clé, CC BY 4.0) |
| Comparaison des modèles | Open-Meteo, paramètre `models` (ECMWF IFS, ICON, GFS, Météo-France) |
| Recherche de lieux | API de géocodage d'Open-Meteo |
| Nom du lieu après géolocalisation | BigDataCloud (reverse geocoding côté client) |
| Soleil, Lune et planètes | Calcul local (`assets/js/astro.js`), éléments orbitaux du JPL (E. M. Standish) |
| Catalogue du ciel profond | Coordonnées J2000 intégrées (`assets/js/sky.js`) |

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

Les tests vérifient les éphémérides contre des événements connus : équinoxe 2024 à Paris, phases d'avril 2024, oppositions de Jupiter, Saturne et Mars, élongations de Vénus et Mercure. Ils couvrent aussi les indices, la fiabilité multi-modèles, le classement du ciel profond et la Voie lactée.

## Releases

Chaque tag `vX.Y.Z` poussé déclenche le workflow `Publication de release`. Il vérifie que le tag correspond à la version de `package.json` et lance les tests. Il publie ensuite la release GitHub avec les notes de `RELEASE_NOTES.md` et l'archive `metastro-vX.Y.Z.zip`. Celle-ci contient tout le code du dépôt ; pour héberger le site, il suffit d'y prendre `index.html` et le dossier `assets/`.

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
  js/astro.js      éphémérides Soleil, Lune et planètes
  js/forecast.js   appels API, notes et fiabilité
  js/sky.js        quoi observer : planètes, ciel profond, Voie lactée
  js/app.js        interface
  favicon.svg
tests/metastro.test.js
RELEASE_NOTES.md
.github/workflows/release.yml
```
