// Tests : node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const Astro = require('../assets/js/astro.js');
const Forecast = require('../assets/js/forecast.js');
const Sky = require('../assets/js/sky.js');

const PARIS = { lat: 48.8566, lon: 2.3522 };
const minutes = (a, b) => Math.abs(a - b) / 60000;

test('coucher et lever du Soleil à Paris à l’équinoxe de printemps 2024', () => {
  const eph = Astro.nightEphemeris(Date.UTC(2024, 2, 20, 11), PARIS.lat, PARIS.lon);
  assert.ok(minutes(eph.sunset, Date.UTC(2024, 2, 20, 18, 6)) < 5, new Date(eph.sunset).toISOString());
  assert.ok(minutes(eph.sunrise, Date.UTC(2024, 2, 21, 5, 54)) < 5, new Date(eph.sunrise).toISOString());
  assert.ok(eph.astroDusk > eph.nauticalDusk && eph.nauticalDusk > eph.civilDusk && eph.civilDusk > eph.sunset);
  assert.ok(eph.astroDawn < eph.sunrise);
});

test('pas de nuit astronomique à Paris au solstice d’été', () => {
  const eph = Astro.nightEphemeris(Date.UTC(2024, 5, 21, 10), PARIS.lat, PARIS.lon);
  assert.equal(eph.astroDusk, null);
  assert.equal(eph.astroMinutes, 0);
});

test('phases de la Lune d’avril 2024', () => {
  const from = Date.UTC(2024, 3, 1);
  const newMoon = Astro.nextPhase(from, 0);
  const fullMoon = Astro.nextPhase(from, 0.5);
  assert.ok(minutes(newMoon, Date.UTC(2024, 3, 8, 18, 21)) < 12 * 60, new Date(newMoon).toISOString());
  assert.ok(minutes(fullMoon, Date.UTC(2024, 3, 23, 23, 49)) < 12 * 60, new Date(fullMoon).toISOString());
  assert.ok(Astro.moonIllumination(Date.UTC(2024, 3, 23, 23)).fraction > 0.98);
  assert.ok(Astro.moonIllumination(Date.UTC(2024, 3, 8, 18)).fraction < 0.02);
  assert.equal(Astro.moonPhaseName(0.5), 'Pleine lune');
  assert.equal(Astro.moonPhaseName(0.98), 'Nouvelle lune');
});

test('indices de seeing, transparence et obscurité', () => {
  assert.equal(Forecast.seeingIndex(20, 10), 5);
  assert.equal(Forecast.seeingIndex(180, 70), 1);
  assert.equal(Forecast.transparencyIndex(40, 40000, 0), 5);
  assert.equal(Forecast.transparencyIndex(95, 5000, 80), 1);
  assert.equal(Forecast.darknessIndex(10, -10, 0.5), 0);
  assert.equal(Forecast.darknessIndex(-25, -10, 1), 1);
  assert.ok(Forecast.darknessIndex(-25, 45, 1) < 0.4);
});

test('note horaire : ciel parfait contre ciel couvert', () => {
  const perfect = { cloud: 0, wind: 5, precip: 0, darkness: 1, transparency: 5, seeing: 5 };
  assert.equal(Forecast.hourScore(perfect), 100);
  assert.equal(Forecast.hourScore({ ...perfect, cloud: 100 }), 0);
  assert.ok(Forecast.hourScore({ ...perfect, cloud: 50 }) < 50);
  assert.equal(Forecast.scoreLabel(80).level, 'excellent');
  assert.equal(Forecast.scoreLabel(null).level, 'none');
});

function fakeForecast(n, start) {
  const fill = (v) => Array(n).fill(v);
  return {
    timezone: 'Europe/Paris',
    hourly: {
      time: Array.from({ length: n }, (_, i) => start / 1000 + i * 3600),
      temperature_2m: fill(8), dew_point_2m: fill(2), relative_humidity_2m: fill(55),
      cloud_cover: fill(0), cloud_cover_low: fill(0), cloud_cover_mid: fill(0), cloud_cover_high: fill(0),
      visibility: fill(40000), wind_speed_10m: fill(5), wind_gusts_10m: fill(10),
      wind_speed_250hPa: fill(40), precipitation_probability: fill(0),
    },
  };
}

function fakeModels(n, start, values) {
  const hourly = { time: Array.from({ length: n }, (_, i) => start / 1000 + i * 3600) };
  for (const [id, v] of Object.entries(values)) hourly[`cloud_cover_${id}`] = Array(n).fill(v);
  return { hourly };
}

test('découpage des prévisions en nuits de midi à midi', () => {
  const start = Date.UTC(2024, 2, 19, 23); // minuit à Paris (UTC+1)
  const n = 24 * 4;
  const { nights } = Forecast.buildNights(fakeForecast(n, start), PARIS.lat, PARIS.lon, start);
  assert.equal(nights.length, 3);
  assert.equal(nights[0].start, Date.UTC(2024, 2, 20, 11));
  for (const night of nights) {
    assert.ok(night.score > 40, `note ${night.score}`);
    assert.ok(night.bestWindow, 'un créneau favorable est attendu par ciel clair');
    assert.ok(night.hours.length >= 10 && night.hours.length <= 16);
  }
});

test('fiabilité : modèles concordants, divergents ou absents', () => {
  const start = Date.UTC(2024, 2, 19, 23);
  const n = 24 * 3;
  const agree = Forecast.buildNights(fakeForecast(n, start), PARIS.lat, PARIS.lon, start,
    fakeModels(n, start, { ecmwf_ifs025: 5, icon_seamless: 10, gfs_seamless: 0, meteofrance_seamless: 8 }));
  const conf = agree.nights[0].confidence;
  assert.equal(conf.level, 'high');
  assert.equal(conf.models.length, 4);

  const split = Forecast.buildNights(fakeForecast(n, start), PARIS.lat, PARIS.lon, start,
    fakeModels(n, start, { ecmwf_ifs025: 5, icon_seamless: 90, gfs_seamless: 70 }));
  assert.equal(split.nights[0].confidence.level, 'low');
  assert.equal(split.nights[0].hours[0].modelSpread, 85);

  // Un seul modèle disponible : pas d'indice, sans casser les prévisions.
  const lone = Forecast.buildNights(fakeForecast(n, start), PARIS.lat, PARIS.lon, start,
    fakeModels(n, start, { ecmwf_ifs025: 5 }));
  assert.equal(lone.nights[0].confidence, null);
  const none = Forecast.buildNights(fakeForecast(n, start), PARIS.lat, PARIS.lon, start, null);
  assert.equal(none.nights[0].confidence, null);
  assert.ok(none.nights[0].score > 40);
});

test('planètes : oppositions et élongations connues', () => {
  const at = (name, iso) => Astro.planetPosition(Date.parse(iso), name, PARIS.lat, PARIS.lon);
  assert.ok(at('jupiter', '2024-12-07T00:00Z').elongation > 176);
  assert.ok(at('saturn', '2024-09-08T00:00Z').elongation > 176);
  assert.ok(at('mars', '2025-01-16T00:00Z').elongation > 174);
  const venus = at('venus', '2025-01-10T00:00Z');
  assert.ok(Math.abs(venus.elongation - 47.2) < 1, venus.elongation);
  assert.ok(venus.magnitude < -4);
  assert.ok(Math.abs(at('mercury', '2024-12-25T00:00Z').elongation - 22) < 1.5);
});

test('planètes visibles la nuit de l’opposition de Jupiter', () => {
  const planets = Sky.planetsForNight(Date.UTC(2024, 11, 6, 11), PARIS.lat, PARIS.lon);
  const jupiter = planets.find((p) => p.id === 'jupiter');
  assert.ok(jupiter.visible);
  assert.ok(jupiter.best.altitude > 55, `hauteur ${jupiter.best.altitude}`);
  assert.equal(jupiter.best.direction, 'S');
  const mercury = Sky.planetsForNight(Date.UTC(2024, 9, 16, 10), PARIS.lat, PARIS.lon).find((p) => p.id === 'mercury');
  assert.equal(mercury.visible, false); // conjonction supérieure le 30 sept. 2024, encore noyée dans le crépuscule
});

test('ciel profond : saison, Lune et filtres', () => {
  const start = Date.UTC(2024, 0, 9, 23); // nouvelle lune du 11 janvier 2024
  const { nights } = Forecast.buildNights(fakeForecast(24 * 3, start), PARIS.lat, PARIS.lon, start);
  const list = Sky.deepSkyForNight(nights[0].hours, PARIS.lat, PARIS.lon);
  const ids = list.map((o) => o.id);
  assert.ok(ids.includes('M42') && ids.includes('M45'), 'Orion et les Pléiades en hiver');
  assert.ok(!ids.includes('M8'), 'la Lagune est sous l’horizon en hiver');
  assert.ok(!ids.includes('LMC'), 'le Grand Nuage de Magellan est invisible depuis Paris');
  assert.ok(ids.indexOf('M45') < 10, 'les Pléiades sont en tête de liste');
  for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].score >= list[i].score);
  assert.ok(Sky.CATALOG.every((o) => Sky.TYPES[o.type] && o.ra >= 0 && o.ra < 360 && Math.abs(o.dec) <= 90));
});

test('cœur de la Voie lactée : été contre hiver', () => {
  const summer = Sky.milkyWayForNight(Date.UTC(2024, 7, 3, 10), 43.6, 3.9); // Montpellier, août
  assert.ok(summer.visible);
  assert.ok(summer.maxAlt > 15 && summer.maxAlt < 20, `hauteur ${summer.maxAlt}`);
  const winter = Sky.milkyWayForNight(Date.UTC(2024, 11, 20, 11), 43.6, 3.9);
  assert.equal(winter.visible, false);
  assert.equal(winter.reason, 'Pas visible de nuit en cette saison');
  assert.equal(Sky.milkyWayForNight(Date.UTC(2024, 7, 3, 10), 70, 25).reason, 'Trop bas sous cette latitude');
});
