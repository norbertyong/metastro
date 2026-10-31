/*
 * Metastro — « Quoi observer » : planètes, ciel profond et cœur de la Voie lactée
 * pour une nuit donnée, à partir des éphémérides et des conditions prévues.
 */
(function (root) {
  'use strict';

  const Astro = root.MetastroAstro || (typeof require === 'function' ? require('./astro.js') : null);

  const rad = Math.PI / 180;
  const STEP = 10 * 60000;

  const PLANETS = [
    { id: 'mercury', name: 'Mercure', color: '#b9b2a6' },
    { id: 'venus', name: 'Vénus', color: '#f2e2b0' },
    { id: 'mars', name: 'Mars', color: '#e2704a' },
    { id: 'jupiter', name: 'Jupiter', color: '#e8c79a' },
    { id: 'saturn', name: 'Saturne', color: '#e6d08a' },
    { id: 'uranus', name: 'Uranus', color: '#9fd8de', telescope: true },
    { id: 'neptune', name: 'Neptune', color: '#7b9cf0', telescope: true },
  ];

  /*
   * Types d'objets. `sensitivity` : sensibilité à la Lune et au manque de
   * transparence (0 = insensible, 1 = très exigeant). `appeal` : intérêt
   * visuel relatif, pour ne pas classer une étoile double devant M31.
   */
  const TYPES = {
    galaxy: { label: 'Galaxie', group: 'galaxies', sensitivity: 1, appeal: 1 },
    nebula: { label: 'Nébuleuse', group: 'nebulae', sensitivity: 0.85, appeal: 1 },
    planetary: { label: 'Nébuleuse planétaire', group: 'nebulae', sensitivity: 0.55, appeal: 0.9 },
    starcloud: { label: 'Nuage stellaire', group: 'clusters', sensitivity: 0.7, appeal: 0.85 },
    globular: { label: 'Amas globulaire', group: 'clusters', sensitivity: 0.45, appeal: 0.95 },
    open: { label: 'Amas ouvert', group: 'clusters', sensitivity: 0.25, appeal: 0.85 },
    double: { label: 'Étoile double', group: 'doubles', sensitivity: 0, appeal: 0.65 },
  };

  // [désignation, nom courant, type, constellation, AD (h m), Déc (° '), magnitude] — J2000.
  const CATALOG = [
    ['M1', 'Nébuleuse du Crabe', 'nebula', 'Taureau', '05 34.5', '+22 01', 8.4],
    ['M2', '', 'globular', 'Verseau', '21 33.5', '-00 49', 6.5],
    ['M3', '', 'globular', 'Chiens de Chasse', '13 42.2', '+28 23', 6.2],
    ['M4', '', 'globular', 'Scorpion', '16 23.6', '-26 32', 5.6],
    ['M5', '', 'globular', 'Serpent', '15 18.6', '+02 05', 5.6],
    ['M6', 'Amas du Papillon', 'open', 'Scorpion', '17 40.1', '-32 13', 4.2],
    ['M7', 'Amas de Ptolémée', 'open', 'Scorpion', '17 53.9', '-34 49', 3.3],
    ['M8', 'Nébuleuse de la Lagune', 'nebula', 'Sagittaire', '18 03.8', '-24 23', 6.0],
    ['M10', '', 'globular', 'Ophiuchus', '16 57.1', '-04 06', 6.6],
    ['M11', 'Amas du Canard sauvage', 'open', 'Écu de Sobieski', '18 51.1', '-06 16', 5.8],
    ['M13', "Grand amas d'Hercule", 'globular', 'Hercule', '16 41.7', '+36 28', 5.8],
    ['M15', '', 'globular', 'Pégase', '21 30.0', '+12 10', 6.2],
    ['M16', "Nébuleuse de l'Aigle", 'nebula', 'Serpent', '18 18.8', '-13 47', 6.0],
    ['M17', 'Nébuleuse Oméga', 'nebula', 'Sagittaire', '18 20.8', '-16 11', 6.0],
    ['M20', 'Nébuleuse Trifide', 'nebula', 'Sagittaire', '18 02.6', '-23 02', 6.3],
    ['M22', '', 'globular', 'Sagittaire', '18 36.4', '-23 54', 5.1],
    ['M24', 'Nuage stellaire du Sagittaire', 'starcloud', 'Sagittaire', '18 16.9', '-18 29', 4.6],
    ['M27', "Nébuleuse de l'Haltère", 'planetary', 'Petit Renard', '19 59.6', '+22 43', 7.4],
    ['M31', "Galaxie d'Andromède", 'galaxy', 'Andromède', '00 42.7', '+41 16', 3.4],
    ['M33', 'Galaxie du Triangle', 'galaxy', 'Triangle', '01 33.9', '+30 39', 5.7],
    ['M34', '', 'open', 'Persée', '02 42.0', '+42 47', 5.2],
    ['M35', '', 'open', 'Gémeaux', '06 08.9', '+24 20', 5.1],
    ['M36', '', 'open', 'Cocher', '05 36.1', '+34 08', 6.0],
    ['M37', '', 'open', 'Cocher', '05 52.4', '+32 33', 5.6],
    ['M38', '', 'open', 'Cocher', '05 28.7', '+35 50', 6.4],
    ['M39', '', 'open', 'Cygne', '21 32.2', '+48 26', 4.6],
    ['M41', '', 'open', 'Grand Chien', '06 46.0', '-20 44', 4.5],
    ['M42', "Grande nébuleuse d'Orion", 'nebula', 'Orion', '05 35.4', '-05 27', 4.0],
    ['M44', 'Amas de la Crèche', 'open', 'Cancer', '08 40.1', '+19 59', 3.7],
    ['M45', 'Pléiades', 'open', 'Taureau', '03 47.0', '+24 07', 1.6],
    ['M46', '', 'open', 'Poupe', '07 41.8', '-14 49', 6.1],
    ['M47', '', 'open', 'Poupe', '07 36.6', '-14 30', 4.4],
    ['M51', 'Galaxie du Tourbillon', 'galaxy', 'Chiens de Chasse', '13 29.9', '+47 12', 8.4],
    ['M52', '', 'open', 'Cassiopée', '23 24.2', '+61 35', 7.3],
    ['M57', "Nébuleuse de l'Anneau", 'planetary', 'Lyre', '18 53.6', '+33 02', 8.8],
    ['M63', 'Galaxie du Tournesol', 'galaxy', 'Chiens de Chasse', '13 15.8', '+42 02', 8.6],
    ['M64', "Galaxie de l'Œil noir", 'galaxy', 'Chevelure de Bérénice', '12 56.7', '+21 41', 8.5],
    ['M65', 'Triplet du Lion', 'galaxy', 'Lion', '11 18.9', '+13 05', 9.3],
    ['M66', 'Triplet du Lion', 'galaxy', 'Lion', '11 20.2', '+12 59', 8.9],
    ['M67', '', 'open', 'Cancer', '08 51.3', '+11 49', 6.1],
    ['M76', 'Petite Haltère', 'planetary', 'Persée', '01 42.4', '+51 34', 10.1],
    ['M77', '', 'galaxy', 'Baleine', '02 42.7', '-00 01', 8.9],
    ['M78', '', 'nebula', 'Orion', '05 46.7', '+00 03', 8.3],
    ['M81', 'Galaxie de Bode', 'galaxy', 'Grande Ourse', '09 55.6', '+69 04', 6.9],
    ['M82', 'Galaxie du Cigare', 'galaxy', 'Grande Ourse', '09 55.8', '+69 41', 8.4],
    ['M83', 'Galaxie du Moulinet austral', 'galaxy', 'Hydre', '13 37.0', '-29 52', 7.5],
    ['M87', 'Virgo A', 'galaxy', 'Vierge', '12 30.8', '+12 23', 8.6],
    ['M92', '', 'globular', 'Hercule', '17 17.1', '+43 08', 6.4],
    ['M94', '', 'galaxy', 'Chiens de Chasse', '12 50.9', '+41 07', 8.2],
    ['M97', 'Nébuleuse du Hibou', 'planetary', 'Grande Ourse', '11 14.8', '+55 01', 9.9],
    ['M101', 'Galaxie du Moulinet', 'galaxy', 'Grande Ourse', '14 03.2', '+54 21', 7.9],
    ['M103', '', 'open', 'Cassiopée', '01 33.2', '+60 42', 7.4],
    ['M104', 'Galaxie du Sombrero', 'galaxy', 'Vierge', '12 40.0', '-11 37', 8.0],
    ['M106', '', 'galaxy', 'Chiens de Chasse', '12 19.0', '+47 18', 8.4],
    ['NGC 869/884', 'Double amas de Persée', 'open', 'Persée', '02 20.0', '+57 08', 4.3],
    ['NGC 457', 'Amas de la Chouette', 'open', 'Cassiopée', '01 19.1', '+58 17', 6.4],
    ['NGC 7000', 'Nébuleuse North America', 'nebula', 'Cygne', '20 59.3', '+44 20', 4.0],
    ['NGC 6992', 'Dentelles du Cygne', 'nebula', 'Cygne', '20 56.4', '+31 43', 7.0],
    ['NGC 7293', "Nébuleuse de l'Hélice", 'planetary', 'Verseau', '22 29.6', '-20 50', 7.3],
    ['NGC 253', 'Galaxie du Sculpteur', 'galaxy', 'Sculpteur', '00 47.6', '-25 17', 7.1],
    ['NGC 5139', 'Oméga du Centaure', 'globular', 'Centaure', '13 26.8', '-47 29', 3.9],
    ['NGC 104', '47 Toucan', 'globular', 'Toucan', '00 24.1', '-72 05', 4.0],
    ['NGC 3372', 'Nébuleuse de la Carène', 'nebula', 'Carène', '10 45.1', '-59 52', 1.0],
    ['LMC', 'Grand Nuage de Magellan', 'galaxy', 'Dorade', '05 23.6', '-69 45', 0.9],
    ['SMC', 'Petit Nuage de Magellan', 'galaxy', 'Toucan', '00 52.7', '-72 50', 2.7],
    ['Mel 25', 'Hyades', 'open', 'Taureau', '04 27.0', '+15 52', 0.5],
    ['β Cyg', 'Albireo', 'double', 'Cygne', '19 30.7', '+27 58', 3.1],
    ['ζ UMa', 'Mizar et Alcor', 'double', 'Grande Ourse', '13 23.9', '+54 56', 2.2],
    ['ε Lyr', 'La double double', 'double', 'Lyre', '18 44.3', '+39 40', 4.7],
    ['γ And', 'Almach', 'double', 'Andromède', '02 03.9', '+42 20', 2.2],
  ].map(([id, name, type, constellation, ra, dec, mag]) => ({
    id,
    name,
    type,
    constellation,
    ra: parseSexagesimal(ra) * 15,
    dec: parseSexagesimal(dec),
    mag,
  }));

  // Centre galactique (Sagittarius A*), J2000.
  const GALACTIC_CENTER = { ra: 266.417, dec: -29.008 };

  function parseSexagesimal(s) {
    const [d, m] = s.trim().split(/\s+/).map(Number);
    const sign = s.trim().startsWith('-') ? -1 : 1;
    return sign * (Math.abs(d) + m / 60);
  }

  const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  const direction = (az) => DIRECTIONS[Math.round(az / 45) % 8];

  /** Regroupe les instants consécutifs où `test` est vrai en fenêtres [début, fin]. */
  function windows(start, end, test) {
    const out = [];
    let open = null;
    for (let t = start; t <= end; t += STEP) {
      if (test(t)) {
        if (open == null) open = t;
      } else if (open != null) {
        out.push({ start: open, end: t });
        open = null;
      }
    }
    if (open != null) out.push({ start: open, end });
    return out;
  }

  /** Visibilité des planètes entre le crépuscule civil et l'aube (Soleil < −6°). */
  function planetsForNight(start, lat, lon) {
    const end = start + 86400000;
    const dark = (t) => Astro.sunPosition(t, lat, lon).altitude < -6;
    return PLANETS.map((planet) => {
      const pos = (t) => Astro.planetPosition(t, planet.id, lat, lon);
      const minAlt = planet.telescope ? 15 : 7;
      const wins = windows(start, end, (t) => dark(t) && pos(t).altitude > minAlt);
      const ref = pos(start + 43200000);
      let best = null;
      for (const w of wins) {
        for (let t = w.start; t <= w.end; t += STEP) {
          const p = pos(t);
          if (!best || p.altitude > best.altitude) best = { time: t, altitude: p.altitude, azimuth: p.azimuth };
        }
      }
      let reason = null;
      if (!wins.length) reason = ref.elongation < 15 ? 'Trop proche du Soleil' : 'Sous l’horizon pendant la nuit';
      return {
        ...planet,
        kind: 'planet',
        magnitude: ref.magnitude,
        elongation: ref.elongation,
        windows: wins,
        best: best && { ...best, direction: direction(best.azimuth) },
        visible: wins.length > 0,
        reason,
      };
    });
  }

  /** Note d'un objet du catalogue pour une nuit, ou null s'il ne monte pas à 20°. */
  function rankObject(obj, night, lat, lon) {
    const type = TYPES[obj.type];
    const bright = Math.min(1, Math.max(0.35, (13 - obj.mag) / 9)) * type.appeal;
    let best = null;
    for (const h of night) {
      const t = h.time + 1800000;
      const pos = Astro.horizontalPosition(t, obj.ra, obj.dec, lat, lon);
      if (pos.altitude < 20) continue;
      const sky = 0.6 * h.darkness + (0.4 * (h.transparency - 1)) / 4;
      const skyFactor = 1 - type.sensitivity * (1 - sky);
      const clear = 1 - (typeof h.cloud === 'number' ? h.cloud : 50) / 100;
      const value = Math.sin(pos.altitude * rad) * skyFactor * (0.3 + 0.7 * clear) * bright;
      if (!best || value > best.value) best = { value, time: t, altitude: pos.altitude, azimuth: pos.azimuth, skyFactor };
    }
    if (!best) return null;
    return {
      ...obj,
      kind: 'deep',
      typeLabel: type.label,
      group: type.group,
      score: Math.round(best.value * 100),
      time: best.time,
      altitude: best.altitude,
      direction: direction(best.azimuth),
      demanding: type.sensitivity >= 0.55 && best.skyFactor < 0.6,
    };
  }

  /**
   * Classement des objets du ciel profond pour une nuit : hauteur, éclat,
   * nuages et qualité du ciel (obscurité, transparence) selon le type d'objet.
   */
  function deepSkyForNight(hours, lat, lon) {
    const night = hours.filter((h) => h.sunAlt < -12);
    if (!night.length) return [];
    return CATALOG.map((obj) => rankObject(obj, night, lat, lon))
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
  }

  /** Planète ou objet du catalogue désigné par son identifiant. */
  function findObject(id) {
    const planet = PLANETS.find((p) => p.id === id);
    if (planet) return { ...planet, kind: 'planet', typeLabel: 'Planète' };
    const obj = CATALOG.find((o) => o.id === id);
    return obj ? { ...obj, kind: 'deep', typeLabel: TYPES[obj.type].label, group: TYPES[obj.type].group } : null;
  }

  /** Hauteur et azimut (degrés) d'un objet trouvé par findObject. */
  function objectPosition(obj, t, lat, lon) {
    return obj.kind === 'planet'
      ? Astro.planetPosition(t, obj.id, lat, lon)
      : Astro.horizontalPosition(t, obj.ra, obj.dec, lat, lon);
  }

  /** Courbe de hauteur d'un objet entre `from` et `to`. */
  function track(obj, from, to, lat, lon, step = STEP) {
    const out = [];
    for (let t = from; t <= to; t += step) out.push({ time: t, altitude: objectPosition(obj, t, lat, lon).altitude });
    return out;
  }

  /** Lever, passage au plus haut et coucher d'un objet sur 24 h à partir de `start`. */
  function riseTransitSet(obj, start, lat, lon) {
    const alt = (t) => objectPosition(obj, t, lat, lon).altitude;
    const crossings = Astro.findCrossings(alt, 0, start, start + 86400000, STEP);
    let transit = null;
    for (let t = start; t <= start + 86400000; t += STEP) {
      const a = alt(t);
      if (!transit || a > transit.altitude) transit = { time: t, altitude: a };
    }
    const rise = crossings.find((c) => c.rising);
    const set = crossings.find((c) => !c.rising);
    return {
      rise: rise ? rise.time : null,
      set: set ? set.time : null,
      transit,
      circumpolar: !crossings.length && alt(start) > 0,
      neverRises: !crossings.length && alt(start) <= 0,
    };
  }

  /** Fenêtres où le cœur de la Voie lactée dépasse 10° en pleine nuit astronomique. */
  function milkyWayForNight(start, lat, lon) {
    const end = start + 86400000;
    const gc = (t) => Astro.horizontalPosition(t, GALACTIC_CENTER.ra, GALACTIC_CENTER.dec, lat, lon).altitude;
    const astroNight = (t) => Astro.sunPosition(t, lat, lon).altitude < -18;
    const wins = windows(start, end, (t) => astroNight(t) && gc(t) > 10);
    const culmination = 90 - Math.abs(lat - GALACTIC_CENTER.dec);
    let maxAlt = null;
    let moonFree = 0;
    for (const w of wins) {
      for (let t = w.start; t < w.end; t += STEP) {
        maxAlt = Math.max(maxAlt == null ? -90 : maxAlt, gc(t));
        if (Astro.moonPosition(t, lat, lon).altitude < 0) moonFree += 10;
      }
    }
    let reason = null;
    if (!wins.length) {
      reason = culmination < 10 ? 'Trop bas sous cette latitude' : 'Pas visible de nuit en cette saison';
    }
    return { windows: wins, maxAlt, moonFreeMinutes: moonFree, visible: wins.length > 0, reason };
  }

  const api = {
    CATALOG,
    TYPES,
    PLANETS,
    planetsForNight,
    deepSkyForNight,
    milkyWayForNight,
    direction,
    findObject,
    objectPosition,
    track,
    riseTransitSet,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MetastroSky = api;
})(typeof window !== 'undefined' ? window : globalThis);
