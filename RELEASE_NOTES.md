# Notes de version

## v1.1.0

Metastro dit désormais si la prévision est fiable, et quoi observer.

- **Fiabilité de la prévision.** La nébulosité prévue par quatre modèles (ECMWF, ICON, GFS, Météo-France) est comparée. Chaque nuit reçoit un indice élevé, moyen ou faible selon l'écart entre modèles. Le détail par modèle apparaît sous la note, et l'écart heure par heure dans le tableau. Si cette comparaison échoue, les prévisions s'affichent quand même.
- **Planètes.** De Mercure à Neptune : fenêtres de visibilité de la nuit, heure et hauteur du meilleur moment, direction et magnitude. Les positions sont calculées dans le navigateur à partir des éléments orbitaux du JPL.
- **Ciel profond.** Environ 70 objets (Messier, grands NGC, Nuages de Magellan, étoiles doubles célèbres) sont classés pour la nuit choisie. Le classement tient compte de la hauteur, de l'éclat, des nuages, de la Lune et de la transparence. On peut filtrer par type, et les objets que la Lune rend difficiles sont signalés.
- **Cœur de la Voie lactée.** Fenêtre où le centre galactique dépasse 10° en pleine nuit astronomique, avec la durée sans Lune.
- Un refus de l'API (quota dépassé, par exemple) affiche son vrai motif et n'est plus retenté inutilement.

## v1.0.0

Première version de Metastro, site statique de météo astro.

- Note d'observation de 0 à 100 par heure et par nuit. Elle combine nuages, obscurité du ciel (Soleil et Lune), transparence, seeing, vent et risque de précipitations.
- 7 nuits de prévisions avec le meilleur créneau d'observation de chaque nuit.
- Tableau heure par heure : nuages bas, moyens et hauts, transparence, seeing, hauteur de la Lune, humidité, écart au point de rosée, température, vent, rafales, courant-jet et précipitations.
- Frise de 24 h : jour, crépuscules civil, nautique et astronomique, nuit noire, Lune levée et meilleur créneau.
- Éphémérides calculées dans le navigateur : coucher et lever du Soleil, nuit astronomique, lever et coucher de la Lune, phase, illumination, prochaines pleine et nouvelle lune.
- Recherche de lieu, géolocalisation, lien partageable et mémorisation du dernier lieu.
- Mode vision nocturne (rouge).
- Données météo Open-Meteo, sans clé d'API. Aucune dépendance ni étape de build.

Le paquet `metastro-v1.0.0.zip` contient le site prêt à déposer sur n'importe quel hébergement statique (GitHub Pages, cPanel, Netlify…).
