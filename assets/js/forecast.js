/*
 * Metastro — récupération des prévisions (Open-Meteo) et calcul des indices
 * d'observation : seeing, transparence, obscurité du ciel et note globale.
 */
(function (root) {
  'use strict';

  const Astro = root.MetastroAstro || (typeof require === 'function' ? require('./astro.js') : null);

  const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
  const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
  const REVERSE_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

  const HOURLY_VARS = [
    'temperature_2m',
    'dew_point_2m',
    'relative_humidity_2m',
    'cloud_cover',
    'cloud_cover_low',
    'cloud_cover_mid',
    'cloud_cover_high',
    'visibility',
    'wind_speed_10m',
    'wind_gusts_10m',
    'wind_speed_250hPa',
    'precipitation_probability',
  ];

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

  /** Seeing (turbulence) de 1 (mauvais) à 5 (excellent) : courant-jet à 250 hPa et rafales au sol. */
  function seeingIndex(jetKmh, gustKmh) {
    const jet = num(jetKmh, 80);
    let s = jet <= 30 ? 5 : jet <= 60 ? 4 : jet <= 100 ? 3 : jet <= 150 ? 2 : 1;
    const gust = num(gustKmh, 0);
    if (gust > 60) s -= 2;
    else if (gust > 40) s -= 1;
    return clamp(s, 1, 5);
  }

  /** Transparence de 1 à 5 : humidité, visibilité horizontale et voile de nuages hauts. */
  function transparencyIndex(humidity, visibilityM, highCloud) {
    let t = 5;
    const rh = num(humidity, 70);
    if (rh > 90) t -= 3;
    else if (rh > 75) t -= 2;
    else if (rh > 60) t -= 1;
    const vis = num(visibilityM, 30000);
    if (vis < 10000) t -= 2;
    else if (vis < 20000) t -= 1;
    const hc = num(highCloud, 0);
    if (hc > 50) t -= 2;
    else if (hc > 20) t -= 1;
    return clamp(t, 1, 5);
  }

  /** Obscurité du ciel de 0 à 1 selon la hauteur du Soleil et la Lune. */
  function darknessIndex(sunAlt, moonAlt, moonFraction) {
    let d;
    if (sunAlt > -6) d = 0;
    else if (sunAlt > -12) d = 0.25;
    else if (sunAlt > -18) d = 0.6;
    else d = 1;
    if (moonAlt > 0) {
      const height = Math.min(1, moonAlt / 30);
      d *= 1 - moonFraction * (0.35 + 0.65 * height) * 0.7;
    }
    return d;
  }

  /** Note d'observation horaire de 0 à 100. */
  function hourScore(h) {
    const clear = 1 - clamp(num(h.cloud, 100), 0, 100) / 100;
    const wind = num(h.wind, 0);
    const windFactor = wind <= 10 ? 1 : Math.max(0, 1 - (wind - 10) / 30);
    const quality =
      0.4 * h.darkness +
      (0.25 * (h.transparency - 1)) / 4 +
      (0.2 * (h.seeing - 1)) / 4 +
      0.15 * windFactor;
    const precip = 1 - (0.8 * clamp(num(h.precip, 0), 0, 100)) / 100;
    return Math.round(100 * Math.pow(clear, 1.4) * quality * precip);
  }

  function scoreLabel(score) {
    if (score == null) return { text: 'Pas de nuit', level: 'none' };
    if (score >= 75) return { text: 'Excellent', level: 'excellent' };
    if (score >= 55) return { text: 'Bon', level: 'good' };
    if (score >= 35) return { text: 'Moyen', level: 'fair' };
    if (score >= 15) return { text: 'Médiocre', level: 'poor' };
    return { text: 'Mauvais', level: 'bad' };
  }

  function localHour(ms, timeZone) {
    const h = new Intl.DateTimeFormat('fr-FR', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(ms);
    return parseInt(h, 10);
  }

  /** Transforme la réponse Open-Meteo en heures enrichies puis en nuits (midi → midi). */
  function buildNights(data, lat, lon, now) {
    const H = data.hourly;
    const tz = data.timezone;
    const hours = H.time.map((sec, i) => {
      const t = sec * 1000;
      const sun = Astro.sunPosition(t, lat, lon);
      const moon = Astro.moonPosition(t, lat, lon);
      const moonFraction = Astro.moonIllumination(t).fraction;
      const temp = H.temperature_2m[i];
      const dew = H.dew_point_2m[i];
      const hour = {
        time: t,
        localHour: localHour(t, tz),
        temp,
        dew,
        dewSpread: num(temp, NaN) - num(dew, NaN),
        humidity: H.relative_humidity_2m[i],
        cloud: H.cloud_cover[i],
        cloudLow: H.cloud_cover_low[i],
        cloudMid: H.cloud_cover_mid[i],
        cloudHigh: H.cloud_cover_high[i],
        visibility: H.visibility[i],
        wind: H.wind_speed_10m[i],
        gust: H.wind_gusts_10m[i],
        jet: H.wind_speed_250hPa[i],
        precip: H.precipitation_probability[i],
        sunAlt: sun.altitude,
        moonAlt: moon.altitude,
        moonFraction,
      };
      hour.seeing = seeingIndex(hour.jet, hour.gust);
      hour.transparency = transparencyIndex(hour.humidity, hour.visibility, hour.cloudHigh);
      hour.darkness = darknessIndex(hour.sunAlt, hour.moonAlt, moonFraction);
      hour.score = hour.cloud == null ? null : hourScore(hour);
      return hour;
    });

    const nights = [];
    hours.forEach((h, i) => {
      if (h.localHour !== 12) return;
      const slice = hours.slice(i, i + 24);
      if (slice.length < 24) return;
      const end = h.time + 86400000;
      if (end <= now) return;
      nights.push(summarizeNight(h.time, slice, lat, lon));
    });
    return { timezone: tz, nights: nights.slice(0, 7) };
  }

  function summarizeNight(start, hours, lat, lon) {
    const eph = Astro.nightEphemeris(start, lat, lon);
    let night = hours.filter((h) => h.sunAlt < -12 && h.score != null);
    if (!night.length) night = hours.filter((h) => h.sunAlt < -6 && h.score != null);
    const score = night.length ? Math.round(night.reduce((s, h) => s + h.score, 0) / night.length) : null;
    const avg = (key) => (night.length ? night.reduce((s, h) => s + num(h[key], 0), 0) / night.length : null);

    // Meilleure fenêtre : plus longue suite d'heures nocturnes avec une note ≥ 50.
    let best = null;
    let run = [];
    const flush = () => {
      if (run.length && (!best || run.length > best.hours.length ||
          (run.length === best.hours.length && mean(run) > mean(best.hours)))) {
        best = { start: run[0].time, end: run[run.length - 1].time + 3600000, hours: run };
      }
      run = [];
    };
    for (const h of hours) {
      if (h.sunAlt < -6 && h.score != null && h.score >= 50) run.push(h);
      else flush();
    }
    flush();

    // Heures affichées dans le tableau : du coucher au lever du Soleil (± 1 h).
    let display = hours.filter((h) => h.sunAlt < 3);
    if (!display.length) display = hours.filter((h) => h.localHour >= 21 || h.localHour <= 3);

    return {
      start,
      ephemeris: eph,
      score,
      label: scoreLabel(score),
      cloud: avg('cloud'),
      seeing: avg('seeing'),
      transparency: avg('transparency'),
      dewRisk: night.some((h) => h.dewSpread < 2),
      bestWindow: best ? { start: best.start, end: best.end, score: Math.round(mean(best.hours)) } : null,
      hours: display,
    };
  }

  function mean(hours) {
    return hours.reduce((s, h) => s + h.score, 0) / hours.length;
  }

  async function fetchJson(url, retries = 1) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Erreur réseau (${res.status})`);
      return await res.json();
    } catch (err) {
      // Les API publiques échouent parfois ponctuellement : une seconde tentative suffit souvent.
      if (retries <= 0) throw err;
      await new Promise((r) => setTimeout(r, 1200));
      return fetchJson(url, retries - 1);
    }
  }

  async function fetchForecast(lat, lon) {
    const params = new URLSearchParams({
      latitude: lat.toFixed(4),
      longitude: lon.toFixed(4),
      hourly: HOURLY_VARS.join(','),
      timezone: 'auto',
      timeformat: 'unixtime',
      past_days: '1',
      forecast_days: '8',
    });
    const data = await fetchJson(`${FORECAST_URL}?${params}`);
    if (data.error) throw new Error(data.reason || 'Prévisions indisponibles');
    return { ...buildNights(data, lat, lon, Date.now()), elevation: data.elevation };
  }

  async function searchPlaces(query) {
    const params = new URLSearchParams({ name: query, count: '6', language: 'fr', format: 'json' });
    const data = await fetchJson(`${GEOCODING_URL}?${params}`);
    return (data.results || []).map((r) => ({
      name: r.name,
      detail: [r.admin1, r.country].filter(Boolean).join(', '),
      lat: r.latitude,
      lon: r.longitude,
    }));
  }

  async function reverseGeocode(lat, lon) {
    try {
      const params = new URLSearchParams({ latitude: lat, longitude: lon, localityLanguage: 'fr' });
      const data = await fetchJson(`${REVERSE_URL}?${params}`);
      const name = data.city || data.locality;
      if (name) return { name, detail: [data.principalSubdivision, data.countryName].filter(Boolean).join(', ') };
    } catch (_) {
      /* on retombe sur les coordonnées */
    }
    return { name: 'Ma position', detail: `${lat.toFixed(2)}°, ${lon.toFixed(2)}°` };
  }

  const api = {
    seeingIndex,
    transparencyIndex,
    darknessIndex,
    hourScore,
    scoreLabel,
    buildNights,
    fetchForecast,
    searchPlaces,
    reverseGeocode,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MetastroForecast = api;
})(typeof window !== 'undefined' ? window : globalThis);
