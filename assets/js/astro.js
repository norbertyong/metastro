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

  const api = {
    sunPosition,
    moonPosition,
    moonIllumination,
    moonPhaseName,
    nightEphemeris,
    nextPhase,
    findCrossings,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MetastroAstro = api;
})(typeof window !== 'undefined' ? window : globalThis);
