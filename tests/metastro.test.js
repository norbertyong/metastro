// Tests : node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const Astro = require('../assets/js/astro.js');
const Forecast = require('../assets/js/forecast.js');

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

test('découpage des prévisions en nuits de midi à midi', () => {
  const start = Date.UTC(2024, 2, 19, 23); // minuit à Paris (UTC+1)
  const n = 24 * 4;
  const fill = (v) => Array(n).fill(v);
  const data = {
    timezone: 'Europe/Paris',
    hourly: {
      time: Array.from({ length: n }, (_, i) => start / 1000 + i * 3600),
      temperature_2m: fill(8), dew_point_2m: fill(2), relative_humidity_2m: fill(55),
      cloud_cover: fill(0), cloud_cover_low: fill(0), cloud_cover_mid: fill(0), cloud_cover_high: fill(0),
      visibility: fill(40000), wind_speed_10m: fill(5), wind_gusts_10m: fill(10),
      wind_speed_250hPa: fill(40), precipitation_probability: fill(0),
    },
  };
  const { nights } = Forecast.buildNights(data, PARIS.lat, PARIS.lon, start);
  assert.equal(nights.length, 3);
  assert.equal(nights[0].start, Date.UTC(2024, 2, 20, 11));
  for (const night of nights) {
    assert.ok(night.score > 40, `note ${night.score}`);
    assert.ok(night.bestWindow, 'un créneau favorable est attendu par ciel clair');
    assert.ok(night.hours.length >= 10 && night.hours.length <= 16);
  }
});
