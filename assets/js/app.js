/* Metastro — interface. */
(function () {
  'use strict';

  const Astro = window.MetastroAstro;
  const Forecast = window.MetastroForecast;

  const STORAGE_KEY = 'metastro.place';
  const NIGHT_KEY = 'metastro.night';
  const DEFAULT_PLACE = { name: 'Paris', detail: 'Île-de-France, France', lat: 48.8566, lon: 2.3522 };
  const LEVELS = { excellent: 5, good: 4, fair: 3, poor: 2, bad: 1, none: 0 };

  const $ = (id) => document.getElementById(id);
  const state = { place: null, data: null, selected: 0, request: 0 };

  // ---------- Utilitaires ----------
  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const storage = {
    get(key) {
      try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* navigation privée */ }
    },
  };

  function formatter(options) {
    return new Intl.DateTimeFormat('fr-FR', { timeZone: state.data.timezone, ...options });
  }
  const fmtTime = (ms) => (ms == null ? '—' : formatter({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms));
  const fmtHour = (ms) => formatter({ hour: '2-digit', hourCycle: 'h23' }).format(ms).replace(/\D/g, '') + 'h';
  const fmtDay = (ms) => formatter({ weekday: 'short', day: 'numeric', month: 'short' }).format(ms);
  const fmtLongDay = (ms) => formatter({ weekday: 'long', day: 'numeric', month: 'long' }).format(ms);
  const fmtDuration = (min) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
  const round = (v) => (v == null || Number.isNaN(v) ? '—' : Math.round(v));

  const fmtDate = (ms) => formatter({ year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);

  /** « Cette nuit » si la nuit est en cours, puis « Ce soir », « Demain soir »… */
  function nightName(night, short) {
    const now = Date.now();
    if (now >= night.start && now < night.start + 86400000) return 'Cette nuit';
    const day = fmtDate(night.start);
    if (day === fmtDate(now)) return 'Ce soir';
    if (day === fmtDate(now + 86400000)) return 'Demain soir';
    return short ? fmtDay(night.start) : `Nuit du ${fmtLongDay(night.start)}`;
  }

  function setStatus(html, isError) {
    const el = $('status');
    el.innerHTML = html;
    el.classList.toggle('error', !!isError);
  }

  // ---------- Graphismes ----------
  function scoreRing(score, level, size) {
    const r = size / 2 - 6;
    const c = 2 * Math.PI * r;
    const pct = score == null ? 0 : score / 100;
    const color = level ? `var(--lvl-${level})` : 'var(--muted)';
    const fontSize = size * 0.3;
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Note ${score == null ? 'indisponible' : score + ' sur 100'}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="7"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round"
        stroke-dasharray="${(c * pct).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
      <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" fill="currentColor"
        font-size="${fontSize}" font-weight="700">${score == null ? '–' : score}</text>
    </svg>`;
  }

  /** Lune dessinée selon sa phase ; inversée dans l'hémisphère sud. */
  function moonSvg(phase, size, south) {
    const r = size / 2 - 2;
    const c = size / 2;
    const rx = (r * Math.abs(Math.cos(2 * Math.PI * phase))).toFixed(2);
    let d;
    if (phase < 0.5) {
      d = `M${c},${c - r} A${r},${r} 0 0 1 ${c},${c + r} A${rx},${r} 0 0 ${phase < 0.25 ? 0 : 1} ${c},${c - r}Z`;
    } else {
      d = `M${c},${c - r} A${r},${r} 0 0 0 ${c},${c + r} A${rx},${r} 0 0 ${phase > 0.75 ? 1 : 0} ${c},${c - r}Z`;
    }
    const flip = south ? ` transform="translate(${size} 0) scale(-1 1)"` : '';
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle cx="${c}" cy="${c}" r="${r}" fill="#1c2448"/>
      <g${flip}><path d="${d}" fill="#f3e7c4"/></g>
      <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="rgba(243,231,196,.25)"/>
    </svg>`;
  }

  /** Frise de 24 h (midi → midi) : bandes de crépuscule et présence de la Lune. */
  function timelineSvg(night) {
    const W = 1000;
    const start = night.start;
    const span = 86400000;
    const step = 10 * 60000;
    const x = (t) => ((t - start) / span) * W;
    const { lat, lon } = state.place;
    const sunColor = (alt) =>
      alt > -0.833 ? '#4f7bd9' : alt > -6 ? '#35529b' : alt > -12 ? '#233366' : alt > -18 ? '#171f48' : '#080c20';

    let rects = '';
    for (let t = start; t < start + span; t += step) {
      const sun = Astro.sunPosition(t + step / 2, lat, lon).altitude;
      rects += `<rect x="${x(t).toFixed(1)}" y="0" width="${(x(t + step) - x(t) + 0.6).toFixed(1)}" height="34" fill="${sunColor(sun)}"/>`;
      const moon = Astro.moonPosition(t + step / 2, lat, lon).altitude;
      if (moon > 0) {
        const op = (0.25 + 0.75 * night.ephemeris.moon.fraction) * Math.min(1, 0.4 + moon / 40);
        rects += `<rect x="${x(t).toFixed(1)}" y="40" width="${(x(t + step) - x(t) + 0.6).toFixed(1)}" height="10" fill="#f5c76b" fill-opacity="${op.toFixed(2)}"/>`;
      }
    }

    let ticks = '';
    for (let k = 0; k <= 12; k++) {
      const t = start + k * 2 * 3600000;
      ticks += `<span class="${k % 2 ? 'odd' : ''}${k === 12 ? ' last' : ''}" style="left:${((x(t) / W) * 100).toFixed(2)}%">${fmtHour(t)}</span>`;
    }

    const now = Date.now();
    const inside = now > start && now < start + span;
    const nowLine = inside
      ? `<line x1="${x(now)}" x2="${x(now)}" y1="0" y2="50" stroke="#fff" stroke-width="2" vector-effect="non-scaling-stroke"/>`
      : '';
    const nowLabel = inside ? `<span class="now" style="left:${((x(now) / W) * 100).toFixed(2)}%">maintenant</span>` : '';

    const best = night.bestWindow
      ? `<rect x="${x(night.bestWindow.start)}" y="1.5" width="${x(night.bestWindow.end) - x(night.bestWindow.start)}" height="31" fill="none" stroke="var(--lvl-5)" stroke-width="2" vector-effect="non-scaling-stroke"/>`
      : '';

    return `<div class="tl">
      <svg viewBox="0 0 ${W} 50" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="Frise de la nuit : crépuscules, nuit astronomique et présence de la Lune">
        <rect x="0" y="40" width="${W}" height="10" fill="rgba(255,255,255,.04)"/>
        ${rects}${best}${nowLine}
      </svg>
      <div class="tl-ticks">${ticks}${nowLabel}</div>
    </div>
    <ul class="legend">
      <li><span class="sw" style="background:#4f7bd9"></span>Jour</li>
      <li><span class="sw" style="background:#35529b"></span>Crépuscule civil</li>
      <li><span class="sw" style="background:#233366"></span>Nautique</li>
      <li><span class="sw" style="background:#171f48"></span>Astronomique</li>
      <li><span class="sw" style="background:#080c20;border:1px solid #334"></span>Nuit noire</li>
      <li><span class="sw" style="background:#f5c76b"></span>Lune levée</li>
      ${night.bestWindow ? '<li><span class="sw" style="border:2px solid var(--lvl-5)"></span>Meilleur créneau</li>' : ''}
    </ul>`;
  }

  // ---------- Rendu ----------
  function renderHero() {
    const night = state.data.nights[state.selected];
    const eph = night.ephemeris;
    const level = LEVELS[night.label.level];

    $('nightName').textContent = nightName(night);
    $('placeName').textContent = state.place.name;
    $('placeDetail').textContent = [state.place.detail, state.data.elevation != null ? `${Math.round(state.data.elevation)} m` : null]
      .filter(Boolean).join(' · ');

    $('scoreRing').innerHTML = scoreRing(night.score, level, 120);
    const lbl = $('verdictLabel');
    lbl.textContent = night.label.text;
    lbl.className = `lbl ${night.label.level}`;

    const parts = [];
    if (night.cloud != null) parts.push(`Nuages ${Math.round(night.cloud)} % en moyenne`);
    if (night.seeing != null) parts.push(`seeing ${night.seeing.toFixed(1)}/5`);
    if (night.transparency != null) parts.push(`transparence ${night.transparency.toFixed(1)}/5`);
    if (night.dewRisk) parts.push('risque de rosée');
    $('verdictSummary').textContent = parts.length ? parts.join(' · ') : 'Le Soleil ne descend pas assez sous l\'horizon cette nuit.';

    $('bestWindow').textContent = night.bestWindow
      ? `Meilleur créneau : ${fmtTime(night.bestWindow.start)} → ${fmtTime(night.bestWindow.end)} (note ${night.bestWindow.score})`
      : 'Aucun créneau favorable cette nuit.';

    const south = state.place.lat < 0;
    $('moonVisual').innerHTML = moonSvg(eph.moon.phase, 96, south);
    $('moonName').textContent = eph.moon.name;
    $('moonFraction').textContent = `${Math.round(eph.moon.fraction * 100)} % éclairée`;
    const now = Date.now();
    const full = Astro.nextPhase(now, 0.5);
    const fresh = Astro.nextPhase(now, 0);
    $('moonFacts').innerHTML = [
      ['Lever', fmtTime(eph.moonrise)],
      ['Coucher', fmtTime(eph.moonset)],
      ['Pleine lune', full ? fmtDay(full) : '—'],
      ['Nouvelle lune', fresh ? fmtDay(fresh) : '—'],
    ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');

    let sunRows;
    if (eph.polarDay) sunRows = [['Soleil', 'Jour polaire']];
    else if (eph.polarNight) sunRows = [['Soleil', 'Nuit polaire']];
    else {
      sunRows = [
        ['Coucher du Soleil', fmtTime(eph.sunset)],
        ['Fin du crépuscule civil', fmtTime(eph.civilDusk)],
        ['Début de nuit astro.', eph.astroDusk ? fmtTime(eph.astroDusk) : 'Pas de nuit astro.'],
        ['Fin de nuit astro.', eph.astroDawn ? fmtTime(eph.astroDawn) : '—'],
        ['Lever du Soleil', fmtTime(eph.sunrise)],
      ];
    }
    sunRows.push(['Nuit noire sans Lune', eph.darkMinutes ? fmtDuration(eph.darkMinutes) : 'aucune']);
    $('sunFacts').innerHTML = sunRows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  }

  function renderNights() {
    const south = state.place.lat < 0;
    $('nights').innerHTML = state.data.nights.map((n, i) => {
      const level = LEVELS[n.label.level];
      const title = nightName(n, true);
      return `<button type="button" class="night" data-index="${i}" aria-pressed="${i === state.selected}">
        <span class="day">${escapeHtml(title)}</span>
        ${scoreRing(n.score, level, 64)}
        <span class="lbl ${n.label.level}">${n.label.text}</span>
        <span class="meta">
          ${moonSvg(n.ephemeris.moon.phase, 16, south)} ${Math.round(n.ephemeris.moon.fraction * 100)} %
          · ☁ ${n.cloud == null ? '—' : Math.round(n.cloud) + ' %'}
        </span>
      </button>`;
    }).join('');
  }

  function cloudCell(v) {
    if (v == null) return '<td class="dim">—</td>';
    const p = v / 100;
    const light = 18 + p * 62;
    const sat = 65 - p * 55;
    const color = light > 55 ? '#0b1020' : '#dfe6ff';
    return `<td style="background:hsl(222 ${sat}% ${light}%);color:${color}">${Math.round(v)}</td>`;
  }

  const levelCell = (v) => `<td class="lvl-${v}">${v}</td>`;

  function darknessText(h) {
    if (h.sunAlt > -0.833) return { text: '☀', title: 'Jour' };
    if (h.sunAlt > -6) return { text: 'Civ.', title: 'Crépuscule civil' };
    if (h.sunAlt > -12) return { text: 'Naut.', title: 'Crépuscule nautique' };
    if (h.sunAlt > -18) return { text: 'Astro', title: 'Crépuscule astronomique' };
    return { text: 'Nuit', title: 'Nuit astronomique' };
  }

  function renderTable() {
    const night = state.data.nights[state.selected];
    const hours = night.hours;
    $('detailTitle').textContent = `Heure par heure — ${nightName(night).toLowerCase()}`;

    const rows = [
      ['Note', (h) => {
        if (h.score == null) return '<td class="dim">—</td>';
        const lvl = LEVELS[Forecast.scoreLabel(h.score).level];
        return `<td class="score lvl-${lvl}">${h.score}</td>`;
      }],
      ['Nuages (total) %', (h) => cloudCell(h.cloud), 'sep'],
      ['Nuages bas %', (h) => cloudCell(h.cloudLow)],
      ['Nuages moyens %', (h) => cloudCell(h.cloudMid)],
      ['Nuages hauts %', (h) => cloudCell(h.cloudHigh)],
      ['Transparence /5', (h) => levelCell(h.transparency), 'sep'],
      ['Seeing /5', (h) => levelCell(h.seeing)],
      ['Ciel', (h) => {
        const d = darknessText(h);
        return `<td title="${d.title}" class="${h.sunAlt > -18 ? 'dim' : ''}">${d.text}</td>`;
      }, 'sep'],
      ['Lune (hauteur)', (h) => (h.moonAlt > 0 ? `<td>${Math.round(h.moonAlt)}°</td>` : '<td class="dim">·</td>')],
      ['Humidité %', (h) => `<td>${round(h.humidity)}</td>`, 'sep'],
      ['Écart rosée °C', (h) => {
        const v = h.dewSpread;
        if (Number.isNaN(v)) return '<td class="dim">—</td>';
        return `<td class="${v < 2 ? 'warn' : ''}">${v.toFixed(1)}</td>`;
      }],
      ['Température °C', (h) => `<td>${round(h.temp)}</td>`],
      ['Vent km/h', (h) => `<td class="${h.wind > 25 ? 'warn' : ''}">${round(h.wind)}</td>`],
      ['Rafales km/h', (h) => `<td class="${h.gust > 40 ? 'warn' : ''}">${round(h.gust)}</td>`],
      ['Courant-jet km/h', (h) => `<td>${round(h.jet)}</td>`],
      ['Précipitations %', (h) => `<td class="${h.precip > 30 ? 'warn' : ''}">${round(h.precip)}</td>`],
    ];

    const head = `<thead><tr><th scope="col"><span class="visually-hidden">Indicateur</span></th>${hours
      .map((h) => `<th scope="col">${fmtHour(h.time)}</th>`).join('')}</tr></thead>`;
    const body = rows.map(([label, cell, cls]) =>
      `<tr${cls ? ` class="${cls}"` : ''}><th scope="row">${label}</th>${hours.map(cell).join('')}</tr>`).join('');
    $('hourly').innerHTML = head + `<tbody>${body}</tbody>`;

    $('timeline').innerHTML = timelineSvg(night);
  }

  function render() {
    renderHero();
    renderNights();
    renderTable();
    $('hero').hidden = false;
    $('nightsBlock').hidden = false;
    $('detailBlock').hidden = false;
    document.title = `${state.place.name} — Metastro, météo astro`;
  }

  // ---------- Chargement ----------
  async function loadPlace(place) {
    state.place = place;
    storage.set(STORAGE_KEY, place);
    const url = new URL(location.href);
    url.searchParams.set('lat', place.lat.toFixed(4));
    url.searchParams.set('lon', place.lon.toFixed(4));
    url.searchParams.set('name', place.name);
    if (place.detail) url.searchParams.set('detail', place.detail); else url.searchParams.delete('detail');
    history.replaceState(null, '', url);

    const request = ++state.request;
    setStatus(`<span class="spinner"></span>Chargement des prévisions pour ${escapeHtml(place.name)}…`);
    try {
      const data = await Forecast.fetchForecast(place.lat, place.lon);
      if (request !== state.request) return;
      if (!data.nights.length) throw new Error('Aucune nuit dans les prévisions');
      state.data = data;
      state.selected = 0;
      setStatus('');
      render();
    } catch (err) {
      if (request !== state.request) return;
      setStatus(`Impossible de charger les prévisions : ${escapeHtml(err.message)}. <button class="btn" id="retry" type="button">Réessayer</button>`, true);
      $('retry').addEventListener('click', () => loadPlace(place));
    }
  }

  function initialPlace() {
    const q = new URLSearchParams(location.search);
    const lat = parseFloat(q.get('lat'));
    const lon = parseFloat(q.get('lon'));
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      return { name: q.get('name') || 'Lieu partagé', detail: q.get('detail') || '', lat, lon };
    }
    const saved = storage.get(STORAGE_KEY);
    if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lon)) return saved;
    return DEFAULT_PLACE;
  }

  // ---------- Recherche ----------
  function initSearch() {
    const input = $('search');
    const list = $('suggestions');
    let results = [];
    let active = -1;
    let timer = null;
    let seq = 0;

    const close = () => {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      active = -1;
    };

    const paint = () => {
      list.innerHTML = results.length
        ? results.map((r, i) => `<li role="option" id="opt-${i}" data-i="${i}" aria-selected="${i === active}">
            ${escapeHtml(r.name)}<small>${escapeHtml(r.detail)}</small></li>`).join('')
        : '<li class="muted" aria-disabled="true">Aucun lieu trouvé</li>';
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      if (active >= 0) input.setAttribute('aria-activedescendant', `opt-${active}`);
      else input.removeAttribute('aria-activedescendant');
    };

    const choose = (i) => {
      const r = results[i];
      if (!r) return;
      input.value = '';
      close();
      input.blur();
      loadPlace(r);
    };

    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) { close(); return; }
      timer = setTimeout(async () => {
        const mine = ++seq;
        try {
          const found = await Forecast.searchPlaces(q);
          if (mine !== seq) return;
          results = found;
          active = found.length ? 0 : -1;
          paint();
        } catch (_) {
          if (mine === seq) { results = []; paint(); }
        }
      }, 250);
    });

    input.addEventListener('keydown', (e) => {
      if (list.hidden) return;
      if (e.key === 'ArrowDown') { active = Math.min(results.length - 1, active + 1); paint(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); paint(); e.preventDefault(); }
      else if (e.key === 'Enter') { choose(active); e.preventDefault(); }
      else if (e.key === 'Escape') close();
    });

    list.addEventListener('mousedown', (e) => {
      const li = e.target.closest('li[data-i]');
      if (li) { e.preventDefault(); choose(Number(li.dataset.i)); }
    });
    input.addEventListener('blur', () => setTimeout(close, 120));
  }

  function initLocate() {
    const btn = $('locate');
    if (!('geolocation' in navigator)) { btn.hidden = true; return; }
    btn.addEventListener('click', () => {
      setStatus('<span class="spinner"></span>Recherche de votre position…');
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude: lat, longitude: lon } = pos.coords;
          const info = await Forecast.reverseGeocode(lat, lon);
          loadPlace({ ...info, lat, lon });
        },
        (err) => setStatus(`Position indisponible : ${escapeHtml(err.message || 'accès refusé')}.`, true),
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
      );
    });
  }

  function initNightMode() {
    const btn = $('nightMode');
    const apply = (on) => {
      document.documentElement.classList.toggle('night', on);
      btn.setAttribute('aria-pressed', String(on));
      storage.set(NIGHT_KEY, on);
    };
    apply(storage.get(NIGHT_KEY) === true);
    btn.addEventListener('click', () => apply(btn.getAttribute('aria-pressed') !== 'true'));
  }

  function initNights() {
    $('nights').addEventListener('click', (e) => {
      const card = e.target.closest('.night');
      if (!card) return;
      state.selected = Number(card.dataset.index);
      renderHero();
      renderNights();
      renderTable();
      $('hero').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // ---------- Ciel étoilé ----------
  function drawSky() {
    const canvas = $('sky');
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    let seed = 42;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const count = Math.round((w * h) / 4500);
    for (let i = 0; i < count; i++) {
      const r = rand() < 0.92 ? rand() * 0.9 + 0.2 : rand() * 1.2 + 0.9;
      ctx.globalAlpha = 0.25 + rand() * 0.6;
      ctx.fillStyle = rand() < 0.15 ? '#ffd9a8' : rand() < 0.3 ? '#bcd0ff' : '#ffffff';
      ctx.beginPath();
      ctx.arc(rand() * w, rand() * h, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function init() {
    drawSky();
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(drawSky, 200);
    });
    initNightMode();
    initSearch();
    initLocate();
    initNights();
    loadPlace(initialPlace());
  }

  init();
})();
