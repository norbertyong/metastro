/*
 * Metastro — calendrier du ciel : étoiles filantes, éclipses, phases de la Lune,
 * oppositions, plus grandes élongations et rapprochements.
 * Les événements planétaires et lunaires sont calculés ; les essaims et les
 * éclipses viennent de tables (dates des maxima et des éclipses publiées).
 */
(function (root) {
  'use strict';

  const Astro = root.MetastroAstro || (typeof require === 'function' ? require('./astro.js') : null);

  const DAY = 86400000;
  const HOUR = 3600000;

  const NAMES = {
    mercury: 'Mercure', venus: 'Vénus', mars: 'Mars', jupiter: 'Jupiter',
    saturn: 'Saturne', uranus: 'Uranus', neptune: 'Neptune',
  };
  // « de Mercure » mais « d’Uranus ».
  const ofName = (id) => (/^[AEIOUÉÈ]/.test(NAMES[id]) ? `d’${NAMES[id]}` : `de ${NAMES[id]}`);
  const OUTER = ['mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
  const INNER = ['mercury', 'venus'];
  const BRIGHT = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];
  const MOON_TARGETS = ['venus', 'mars', 'jupiter', 'saturn'];

  // Essaims d'étoiles filantes : [nom, mois, jour du soir du maximum, THZ, AD du radiant (°), Déc (°)].
  const SHOWERS = [
    ['Quadrantides', 1, 3, 80, 230, 49],
    ['Lyrides', 4, 22, 18, 271, 34],
    ['Êta Aquarides', 5, 5, 50, 338, -1],
    ['Delta Aquarides du Sud', 7, 29, 25, 340, -16],
    ['Perséides', 8, 12, 100, 48, 58],
    ['Draconides', 10, 8, 10, 262, 54],
    ['Orionides', 10, 21, 20, 95, 16],
    ['Léonides', 11, 17, 15, 152, 22],
    ['Géminides', 12, 13, 150, 112, 33],
    ['Ursides', 12, 21, 10, 217, 76],
  ];

  // Éclipses à venir : [date (UTC), type, zone de visibilité pour les éclipses de Soleil].
  const ECLIPSES = [
    ['2027-02-06', 'annular', 'Amérique du Sud, Atlantique et Afrique de l’Ouest'],
    ['2027-02-20', 'penumbral'],
    ['2027-07-18', 'penumbral'],
    ['2027-08-02', 'total', 'Sud de l’Espagne, Afrique du Nord, Égypte et péninsule Arabique ; partielle dans toute l’Europe'],
    ['2027-08-17', 'penumbral'],
    ['2028-01-12', 'partial-lunar'],
    ['2028-01-26', 'annular', 'Amérique du Sud ; partielle en Espagne et au Portugal au coucher du Soleil'],
    ['2028-07-06', 'partial-lunar'],
    ['2028-07-22', 'total', 'Australie et Nouvelle-Zélande'],
    ['2028-12-31', 'total-lunar'],
  ];

  const ECLIPSE_TITLES = {
    annular: 'Éclipse annulaire de Soleil',
    total: 'Éclipse totale de Soleil',
    penumbral: 'Éclipse de Lune par la pénombre',
    'partial-lunar': 'Éclipse partielle de Lune',
    'total-lunar': 'Éclipse totale de Lune',
  };

  const fmtDeg = (v) => `${v.toFixed(1).replace('.', ',')}°`;

  /** Indices des maxima (ou minima) locaux stricts d'une série. */
  function extrema(values, wantMax) {
    const out = [];
    for (let i = 1; i < values.length - 1; i++) {
      const v = values[i];
      if (wantMax ? v >= values[i - 1] && v > values[i + 1] : v <= values[i - 1] && v < values[i + 1]) out.push(i);
    }
    return out;
  }

  function sample(from, to, step, fn) {
    const out = [];
    for (let t = from; t <= to; t += step) out.push({ t, ...fn(t) });
    return out;
  }

  function planetEvents(from, to) {
    const events = [];
    const daily = {};
    for (const id of Object.keys(NAMES)) daily[id] = sample(from - DAY, to + DAY, DAY, (t) => Astro.planetPosition(t, id, 0, 0));

    for (const id of OUTER) {
      const s = daily[id];
      for (const i of extrema(s.map((p) => p.elongation), true)) {
        if (s[i].elongation < 170) continue;
        events.push({
          time: s[i].t, kind: 'planets', icon: '☉',
          title: `Opposition ${ofName(id)}`,
          detail: `Au plus près de la Terre et visible toute la nuit (magnitude ${s[i].magnitude.toFixed(1).replace('.', ',').replace('-', '−')}) : la meilleure période pour l'observer.`,
        });
      }
    }
    for (const id of INNER) {
      const s = daily[id];
      for (const i of extrema(s.map((p) => p.elongation), true)) {
        if (s[i].elongation < 15) continue;
        const evening = s[i].east;
        events.push({
          time: s[i].t, kind: 'planets', icon: evening ? '☾' : '☀',
          title: `Plus grande élongation ${evening ? 'est' : 'ouest'} ${ofName(id)}`,
          detail: `${fmtDeg(s[i].elongation)} du Soleil : à chercher ${evening ? 'le soir, après le coucher du Soleil, à l’ouest' : 'le matin, avant le lever du Soleil, à l’est'}.`,
        });
      }
    }
    for (let a = 0; a < BRIGHT.length; a++) {
      for (let b = a + 1; b < BRIGHT.length; b++) {
        const pa = daily[BRIGHT[a]];
        const pb = daily[BRIGHT[b]];
        const sep = pa.map((p, i) => Astro.angularSeparation(p.ra, p.dec, pb[i].ra, pb[i].dec));
        for (const i of extrema(sep, false)) {
          if (sep[i] > 3 || pa[i].elongation < 15 || pb[i].elongation < 15) continue;
          events.push({
            time: pa[i].t, kind: 'planets', icon: '✦',
            title: `Rapprochement ${NAMES[BRIGHT[a]]} – ${NAMES[BRIGHT[b]]}`,
            detail: `Les deux planètes ne sont séparées que de ${fmtDeg(sep[i])}.`,
          });
        }
      }
    }
    return events.filter((e) => e.time >= from && e.time <= to);
  }

  function moonEvents(from, to) {
    const events = [];
    // Phases principales.
    for (const [target, title, detail, icon] of [
      [0, 'Nouvelle lune', 'Les nuits les plus noires du mois : idéal pour le ciel profond.', '●'],
      [0.5, 'Pleine lune', 'Ciel très éclairé toute la nuit : place à la Lune, aux planètes et aux étoiles doubles.', '○'],
    ]) {
      let t = from;
      for (;;) {
        const next = Astro.nextPhase(t, target);
        if (next == null || next > to) break;
        events.push({ time: next, kind: 'moon', icon, title, detail });
        t = next + 2 * DAY;
      }
    }
    // Rapprochements Lune – planètes brillantes (coordonnées géocentriques).
    const step = 3 * HOUR;
    const moon = sample(from - DAY, to + DAY, step, (t) => Astro.moonPosition(t, 0, 0));
    for (const id of MOON_TARGETS) {
      const pl = moon.map((m) => Astro.planetPosition(m.t, id, 0, 0));
      const sep = moon.map((m, i) => Astro.angularSeparation(m.ra, m.dec, pl[i].ra, pl[i].dec));
      for (const i of extrema(sep, false)) {
        if (sep[i] > 3 || pl[i].elongation < 15 || moon[i].t < from || moon[i].t > to) continue;
        const frac = Math.round(Astro.moonIllumination(moon[i].t).fraction * 100);
        events.push({
          time: moon[i].t, kind: 'moon', icon: '☾',
          title: `La Lune près ${ofName(id)}`,
          detail: `Environ ${fmtDeg(sep[i])} entre la Lune (éclairée à ${frac} %) et ${NAMES[id]} ; l'écart vu depuis votre lieu peut varier d'un degré.`,
        });
      }
    }
    return events;
  }

  /** Midi solaire moyen approximatif (ms) du jour civil donné, pour la longitude. */
  const localNoon = (y, m, d, lon) => Date.UTC(y, m - 1, d, 12) - (lon / 15) * HOUR;

  function showerEvents(from, to, lat, lon) {
    const events = [];
    const years = [new Date(from).getUTCFullYear(), new Date(to).getUTCFullYear()];
    for (let y = years[0]; y <= years[1]; y++) {
      for (const [name, month, day, zhr, ra, dec] of SHOWERS) {
        const noon = localNoon(y, month, day, lon);
        if (noon < from - DAY || noon > to) continue;
        let radiantMax = -90;
        let moonFrac = 0;
        let darkSamples = 0;
        for (let t = noon; t < noon + DAY; t += 20 * 60000) {
          if (Astro.sunPosition(t, lat, lon).altitude > -12) continue;
          darkSamples++;
          radiantMax = Math.max(radiantMax, Astro.horizontalPosition(t, ra, dec, lat, lon).altitude);
          const moon = Astro.moonPosition(t, lat, lon);
          if (moon.altitude > 0) moonFrac = Math.max(moonFrac, Astro.moonIllumination(t).fraction);
        }
        const nextDay = new Date(noon + DAY);
        const nightLabel = `nuit du ${day} au ${nextDay.getUTCDate()}`;
        let detail;
        if (!darkSamples) detail = 'Pas de nuit assez sombre à cette date sous votre latitude.';
        else if (radiantMax < 10) detail = 'Le radiant reste trop bas sous votre latitude : essaim peu visible.';
        else {
          const moonText = moonFrac < 0.35 ? 'Lune discrète : bonnes conditions'
            : moonFrac < 0.65 ? 'Lune gênante une partie de la nuit'
              : 'Lune très gênante';
          detail = `Jusqu'à ${zhr} météores par heure en ciel idéal, maximum la ${nightLabel}. ${moonText} ; radiant à ${Math.round(radiantMax)}° au plus haut.`;
        }
        events.push({
          time: noon, kind: 'meteors', icon: '☄',
          title: name,
          detail,
          quality: !darkSamples || radiantMax < 10 ? 'poor' : moonFrac < 0.35 ? 'good' : moonFrac < 0.65 ? 'fair' : 'poor',
        });
      }
    }
    return events;
  }

  function eclipseEvents(from, to, lat, lon) {
    const events = [];
    for (const [date, type, where] of ECLIPSES) {
      const day = Date.parse(`${date}T00:00:00Z`);
      if (day + DAY < from || day > to) continue;
      const solar = type === 'annular' || type === 'total';
      let detail;
      let time = day + 12 * HOUR;
      if (solar) {
        detail = `Visible depuis : ${where}.`;
      } else {
        // Le maximum d'une éclipse de Lune coïncide à moins d'une heure près avec la pleine lune.
        const full = Astro.nextPhase(day - DAY, 0.5);
        if (full != null && Math.abs(full - day) < 2 * DAY) time = full;
        const alt = Astro.moonPosition(time, lat, lon).altitude;
        detail = alt > 0
          ? `Visible depuis votre lieu : la Lune sera à ${Math.round(alt)}° au moment du maximum.`
          : 'Non visible depuis votre lieu : la Lune sera sous l’horizon au moment du maximum.';
        if (type === 'penumbral') detail += ' Assombrissement léger, difficile à remarquer.';
      }
      events.push({ time, kind: 'eclipses', icon: solar ? '◐' : '◑', title: ECLIPSE_TITLES[type], detail, dateOnly: solar });
    }
    return events;
  }

  /** Événements entre `from` et `from + days`, triés par date. */
  function events(from, days, lat, lon) {
    const to = from + days * DAY;
    return [
      ...planetEvents(from, to),
      ...moonEvents(from, to),
      ...showerEvents(from, to, lat, lon),
      ...eclipseEvents(from, to, lat, lon),
    ].sort((a, b) => a.time - b.time);
  }

  const api = { events, SHOWERS, ECLIPSES };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MetastroCalendar = api;
})(typeof window !== 'undefined' ? window : globalThis);
