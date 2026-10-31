/*
 * Metastro — éphémérides Soleil / Lune.
 * Algorithmes simplifiés (précision de l'ordre de la minute), d'après les
 * formules de l'Astronomical Almanac popularisées par SunCalc.
 * Fonctionne dans le navigateur (window.MetastroAstro) et sous Node (module.exports).
 */
(function (root) {
  'use strict';

  const PI = Math.PI;
  const rad = PI / 180;
  const DAY_MS = 86400000;
  const J1970 = 2440588;
  const J2000 = 2451545;
  const OBLIQUITY = rad * 23.4397;

  const toDays = (ms) => ms / DAY_MS - 0.5 + J1970 - J2000;

  const rightAscension = (l, b) =>
    Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY) - Math.tan(b) * Math.sin(OBLIQUITY), Math.cos(l));
  const declination = (l, b) =>
    Math.asin(Math.sin(b) * Math.cos(OBLIQUITY) + Math.cos(b) * Math.sin(OBLIQUITY) * Math.sin(l));
  const altitude = (H, phi, dec) =>
    Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const azimuth = (H, phi, dec) =>
    Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  const siderealTime = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;

  function astroRefraction(h) {
    if (h < 0) h = 0;
    return 0.0002967 / Math.tan(h + 0.00312536 / (h + 0.08901179));
  }

  function sunCoords(d) {
    const M = rad * (357.5291 + 0.98560028 * d);
    const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    const L = M + C + rad * 102.9372 + PI;
    return { dec: declination(L, 0), ra: rightAscension(L, 0) };
  }

  function moonCoords(d) {
    const L = rad * (218.316 + 13.176396 * d);
    const M = rad * (134.963 + 13.064993 * d);
    const F = rad * (93.272 + 13.22935 * d);
    const l = L + rad * 6.289 * Math.sin(M);
    const b = rad * 5.128 * Math.sin(F);
    return { ra: rightAscension(l, b), dec: declination(l, b), dist: 385001 - 20905 * Math.cos(M) };
  }

  /** Position du Soleil : altitude et azimut en degrés (azimut compté depuis le nord). */
  function sunPosition(ms, lat, lon) {
    const lw = rad * -lon;
    const phi = rad * lat;
    const d = toDays(ms);
    const c = sunCoords(d);
    const H = siderealTime(d, lw) - c.ra;
    return {
      altitude: altitude(H, phi, c.dec) / rad,
      azimuth: (azimuth(H, phi, c.dec) / rad + 180) % 360,
    };
  }

  /** Position de la Lune (altitude corrigée de la réfraction), en degrés. */
  function moonPosition(ms, lat, lon) {
    const lw = rad * -lon;
    const phi = rad * lat;
    const d = toDays(ms);
    const c = moonCoords(d);
    const H = siderealTime(d, lw) - c.ra;
    let h = altitude(H, phi, c.dec);
    h += astroRefraction(h);
    return {
      altitude: h / rad,
      azimuth: (azimuth(H, phi, c.dec) / rad + 180) % 360,
      distance: c.dist,
      ra: ((c.ra / rad) + 360) % 360,
      dec: c.dec / rad,
    };
  }

  /**
   * Illumination de la Lune.
   * fraction : 0 → 1 ; phase : 0 = nouvelle lune, 0.25 = premier quartier,
   * 0.5 = pleine lune, 0.75 = dernier quartier.
   */
  function moonIllumination(ms) {
    const d = toDays(ms);
    const s = sunCoords(d);
    const m = moonCoords(d);
    const sdist = 149598000;
    const phi = Math.acos(
      Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra)
    );
    const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
    const angle = Math.atan2(
      Math.cos(s.dec) * Math.sin(s.ra - m.ra),
      Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra)
    );
    return {
      fraction: (1 + Math.cos(inc)) / 2,
      phase: 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / PI,
    };
  }

  const PHASE_NAMES = [
    'Nouvelle lune',
    'Premier croissant',
    'Premier quartier',
    'Gibbeuse croissante',
    'Pleine lune',
    'Gibbeuse décroissante',
    'Dernier quartier',
    'Dernier croissant',
  ];

  function moonPhaseName(phase) {
    return PHASE_NAMES[Math.round(phase * 8) % 8];
  }

  /**
   * Cherche les instants où f(t) franchit `threshold` entre start et end.
   * Échantillonnage régulier puis interpolation linéaire.
   */
  function findCrossings(f, threshold, start, end, stepMs) {
    const out = [];
    let prevT = start;
    let prevV = f(start) - threshold;
    for (let t = start + stepMs; t <= end; t += stepMs) {
      const v = f(t) - threshold;
      if ((prevV < 0 && v >= 0) || (prevV >= 0 && v < 0)) {
        const ratio = prevV / (prevV - v);
        out.push({ time: Math.round(prevT + ratio * (t - prevT)), rising: v >= 0 });
      }
      prevT = t;
      prevV = v;
    }
    return out;
  }

  const firstOf = (list, rising) => {
    const hit = list.find((c) => c.rising === rising);
    return hit ? hit.time : null;
  };

  /**
   * Éphémérides d'une nuit, de `start` (midi local) à start + 24 h.
   * Renvoie couchers/levers, crépuscules, passages de la Lune et la durée
   * de nuit noire (Soleil < -18° et Lune sous l'horizon).
   */
  function nightEphemeris(start, lat, lon) {
    const end = start + DAY_MS;
    const step = 5 * 60000;
    const sunAlt = (t) => sunPosition(t, lat, lon).altitude;
    const moonAlt = (t) => moonPosition(t, lat, lon).altitude;

    const horizon = findCrossings(sunAlt, -0.833, start, end, step);
    const civil = findCrossings(sunAlt, -6, start, end, step);
    const nautical = findCrossings(sunAlt, -12, start, end, step);
    const astro = findCrossings(sunAlt, -18, start, end, step);
    const moon = findCrossings(moonAlt, 0.133, start, end, step);

    let darkMinutes = 0;
    let astroMinutes = 0;
    for (let t = start; t < end; t += step) {
      if (sunAlt(t) < -18) {
        astroMinutes += 5;
        if (moonAlt(t) < 0) darkMinutes += 5;
      }
    }

    const midnight = start + DAY_MS / 2;
    const illum = moonIllumination(midnight);

    return {
      sunset: firstOf(horizon, false),
      sunrise: firstOf(horizon, true),
      civilDusk: firstOf(civil, false),
      civilDawn: firstOf(civil, true),
      nauticalDusk: firstOf(nautical, false),
      nauticalDawn: firstOf(nautical, true),
      astroDusk: firstOf(astro, false),
      astroDawn: firstOf(astro, true),
      moonrise: firstOf(moon, true),
      moonset: firstOf(moon, false),
      moonCrossings: moon,
      astroMinutes,
      darkMinutes,
      moon: {
        fraction: illum.fraction,
        phase: illum.phase,
        name: moonPhaseName(illum.phase),
      },
      polarDay: sunAlt(midnight) > -0.833 && horizon.length === 0,
      polarNight: sunAlt(start) < -0.833 && horizon.length === 0,
    };
  }

  /** Prochaine date (ms) à laquelle la phase lunaire atteint `target` (0 = NL, 0.5 = PL). */
  function nextPhase(from, target) {
    const step = 3600000;
    let prev = moonIllumination(from).phase;
    for (let t = from + step; t < from + 31 * DAY_MS; t += step) {
      const cur = moonIllumination(t).phase;
      const crossed = target === 0 ? cur < prev - 0.5 : prev < target && cur >= target;
      if (crossed) return t;
      prev = cur;
    }
    return null;
  }

  /** Hauteur et azimut (degrés) d'un astre de coordonnées équatoriales données en degrés. */
  function horizontalPosition(ms, raDeg, decDeg, lat, lon) {
    const d = toDays(ms);
    const phi = rad * lat;
    const dec = rad * decDeg;
    const H = siderealTime(d, rad * -lon) - rad * raDeg;
    return {
      altitude: altitude(H, phi, dec) / rad,
      azimuth: (azimuth(H, phi, dec) / rad + 180) % 360,
    };
  }

  /*
   * Éléments képlériens moyens (J2000) et leurs variations par siècle, d'après
   * E. M. Standish, « Keplerian Elements for Approximate Positions of the Major
   * Planets » (JPL), valables de 1800 à 2050 :
   * [a (UA), e, I (°), L (°), longitude du périhélie (°), longitude du nœud (°)].
   */
  const ELEMENTS = {
    mercury: [[0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593],
      [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
    venus: [[0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255],
      [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418]],
    earth: [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0],
      [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0]],
    mars: [[1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
      [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
    jupiter: [[5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
      [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
    saturn: [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
      [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
    uranus: [[19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503],
      [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]],
    neptune: [[30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
      [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]],
  };

  // Magnitude visuelle : V(1,0) et coefficients de phase (Explanatory Supplement, simplifié).
  const MAGNITUDE = {
    mercury: (i) => -0.42 + 0.038 * i - 0.000273 * i * i + 0.000002 * i * i * i,
    venus: (i) => -4.4 + 0.0009 * i + 0.000239 * i * i - 0.00000065 * i * i * i,
    mars: (i) => -1.52 + 0.016 * i,
    jupiter: (i) => -9.4 + 0.005 * i,
    saturn: (i) => -8.88 + 0.044 * i,
    uranus: () => -7.19,
    neptune: () => -6.87,
  };

  /** Position héliocentrique écliptique (J2000, UA) d'une planète. */
  function heliocentric(name, ms) {
    const T = toDays(ms) / 36525;
    const [base, rate] = ELEMENTS[name];
    const [a, e, I, L, peri, node] = base.map((v, i) => v + rate[i] * T);
    const w = (peri - node) * rad;
    const O = node * rad;
    const inc = I * rad;
    let M = ((L - peri) % 360 + 540) % 360 - 180;
    M *= rad;
    let E = M + e * Math.sin(M);
    for (let k = 0; k < 8; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    const xp = a * (Math.cos(E) - e);
    const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
    const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(inc), sI = Math.sin(inc);
    return {
      x: (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
      y: (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
      z: sw * sI * xp + cw * sI * yp,
    };
  }

  const norm = (v) => Math.hypot(v.x, v.y, v.z);

  /**
   * Position d'une planète vue depuis le lieu : hauteur, azimut, magnitude,
   * élongation (angle au Soleil) et coordonnées équatoriales, en degrés.
   */
  function planetPosition(ms, name, lat, lon) {
    const p = heliocentric(name, ms);
    const earth = heliocentric('earth', ms);
    const g = { x: p.x - earth.x, y: p.y - earth.y, z: p.z - earth.z };
    const ce = Math.cos(OBLIQUITY), se = Math.sin(OBLIQUITY);
    const eq = { x: g.x, y: g.y * ce - g.z * se, z: g.y * se + g.z * ce };
    const ra = Math.atan2(eq.y, eq.x) / rad;
    const dec = Math.atan2(eq.z, Math.hypot(eq.x, eq.y)) / rad;
    const r = norm(p);
    const delta = norm(g);
    const R = norm(earth);
    const phaseAngle = Math.acos(clampUnit((r * r + delta * delta - R * R) / (2 * r * delta))) / rad;
    const elongation = Math.acos(clampUnit((R * R + delta * delta - r * r) / (2 * R * delta))) / rad;
    const pos = horizontalPosition(ms, (ra + 360) % 360, dec, lat, lon);
    // À l'est du Soleil (visible le soir) si sa longitude écliptique le précède de moins de 180°.
    const lambda = Math.atan2(g.y, g.x) / rad;
    const sunLambda = Math.atan2(-earth.y, -earth.x) / rad;
    return {
      ...pos,
      ra: (ra + 360) % 360,
      dec,
      distance: delta,
      elongation,
      east: (lambda - sunLambda + 720) % 360 < 180,
      magnitude: 5 * Math.log10(r * delta) + MAGNITUDE[name](phaseAngle),
    };
  }

  /** Distance angulaire (degrés) entre deux points de coordonnées équatoriales en degrés. */
  function angularSeparation(ra1, dec1, ra2, dec2) {
    const c = Math.sin(dec1 * rad) * Math.sin(dec2 * rad) +
      Math.cos(dec1 * rad) * Math.cos(dec2 * rad) * Math.cos((ra1 - ra2) * rad);
    return Math.acos(clampUnit(c)) / rad;
  }

  function clampUnit(v) {
    return Math.min(1, Math.max(-1, v));
  }

  const api = {
    sunPosition,
    moonPosition,
    moonIllumination,
    moonPhaseName,
    nightEphemeris,
    nextPhase,
    findCrossings,
    horizontalPosition,
    planetPosition,
    angularSeparation,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MetastroAstro = api;
})(typeof window !== 'undefined' ? window : globalThis);
