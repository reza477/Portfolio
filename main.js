(() => {
  'use strict';

  const SELECTORS = {
    chips: (key) => `.chips[data-section="${key}"]`,
    body: (key) => `#${key}-body`,
  };

  const THEME_KEY = 'portfolio.theme';
  const FILTER_KEY_PREFIX = 'portfolio.galleryFilter.';
  const MFILTER_PREFIX = 'portfolio.multiFilter.';

  const state = {
    data: null,
    query: '',
    // per-section tag filter (single tag for simplicity)
    tagFilters: new Map(),
    cards: [], // {el, section, title, tags}
    observer: null,
    audio: null,
    currentTrackId: null,
    lightbox: { open: false, items: [], idx: 0 },
    sectionQuery: new Map(),
    multiFilters: new Map(), // section -> Set of selected tags
    detailsCtx: null,
  };

  function $(sel, root = document) { return root.querySelector(sel); }
  function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  // Theme
  function initTheme() {
    let theme = localStorage.getItem(THEME_KEY);
    if (!theme) {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      theme = prefersDark ? 'dark' : 'light';
    }
    applyTheme(theme);
    const btn = $('#theme-toggle');
    if (btn) {
      btn.addEventListener('click', () => {
        const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        applyTheme(next);
      });
    }
  }
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
    localStorage.setItem(THEME_KEY, theme);
    const btn = $('#theme-toggle');
    if (btn) btn.textContent = theme === 'dark' ? '🌙' : '☀️';
  }

  // Search
  function initSearch() {
    const input = $('#search');
    const clear = $('#clear-search');
    let t = 0;
    input?.addEventListener('input', () => {
      clearHidden(clear, !input.value);
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        state.query = (input.value || '').toLowerCase().trim();
        applyFilters();
      }, 120);
    });
    clear?.addEventListener('click', () => {
      input.value = '';
      state.query = '';
      clearHidden(clear, true);
      applyFilters();
      input.focus();
    });
  }
  function clearHidden(el, cond) { if (el) el.classList.toggle('hidden', !!cond); }

  function fetchJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then((r) => r.json());
  }

  function toSearchStr({ title, tags }) {
    return `${(title||'').toLowerCase()} ${(tags||[]).join(' ').toLowerCase()}`.trim();
  }

  function addCard(el, section, title, tags = []) {
    el.classList.add('card');
    el.setAttribute('data-section', section);
    el.setAttribute('data-title', (title||''));
    el.setAttribute('data-tags', tags.join(','));
    state.cards.push({ el, section, title: (title||''), tags: tags.map(String) });
  }

  function applyFilters() {
    const q = state.query;
    for (const c of state.cards) {
      const tagActive = state.tagFilters.get(c.section);
      const sectionQ = (state.sectionQuery && state.sectionQuery.get(c.section)) || '';
      const matchQ = (!q || toSearchStr(c).includes(q)) && (!sectionQ || toSearchStr(c).includes(sectionQ));
      const multi = state.multiFilters.get(c.section);
      const matchMulti = !multi || multi.size === 0 || c.tags.some(t => multi.has(String(t)));
      const matchTag = (!tagActive || c.tags.includes(tagActive)) && matchMulti;
      c.el.classList.toggle('hidden', !(matchQ && matchTag));
    }
    renderClearChips();
  }

  function renderClearChips() {
    // show clear chip per section if tag filter active
    for (const [sec, tag] of state.tagFilters.entries()) {
      if (sec === 'art' || sec === 'photography') continue; // galleries use explicit 'All' chip
      const chipsRow = document.querySelector(SELECTORS.chips(sec));
      if (!chipsRow) continue;
      let clear = chipsRow.querySelector('[data-clear="1"]');
      if (tag) {
        if (!clear) {
          clear = document.createElement('button');
          clear.className = 'chip active';
          clear.textContent = 'Clear filters';
          clear.setAttribute('data-clear','1');
          clear.addEventListener('click', () => {
            state.tagFilters.set(sec, '');
            chipsRow.querySelectorAll('.chip').forEach(ch => ch.classList.remove('active'));
            applyFilters();
          });
          chipsRow.prepend(clear);
        }
      } else if (clear) {
        clear.remove();
      }
    }
  }

  // Intersection observer for reveal
  function initObserver() {
    const prefersReduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduce) {
      state.cards.forEach(c => c.el.classList.add('reveal'));
      return;
    }
    state.observer = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('reveal'); state.observer.unobserve(e.target); }
    }, { rootMargin: '0px 0px -10% 0px' });
    state.cards.forEach(c => state.observer.observe(c.el));
  }

  // Tag chip creation
  function makeTagChip(section, tag) {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.textContent = tag;
    chip.addEventListener('click', () => {
      const row = document.querySelector(SELECTORS.chips(section));
      row?.querySelectorAll('.chip').forEach(ch => ch.classList.remove('active'));
      chip.classList.add('active');
      state.tagFilters.set(section, tag);
      applyFilters();
    });
    return chip;
  }

  // Lightbox
  function initLightbox() {
    const lb = $('#lightbox');
    const stage = lb.querySelector('.lightbox-stage');
    const img = lb.querySelector('.lightbox-img');
    const caption = lb.querySelector('.lightbox-caption');
    const closeBtn = lb.querySelector('.lightbox-close');
    const prev = lb.querySelector('.lightbox-prev');
    const next = lb.querySelector('.lightbox-next');
    const zoomBtn = lb.querySelector('.lightbox-zoom');
    const download = lb.querySelector('.lightbox-download');
    let focusables = [];
    let lastFocused = null;
    function open(idx) {
      state.lightbox.idx = idx;
      const item = state.lightbox.items[idx];
      if (!item) return;
      img.src = item.src;
      img.alt = item.alt || '';
      caption.textContent = `${item.title || ''}${item.year ? ' · ' + item.year : ''}${item.filename ? ' · ' + item.filename : ''}`.trim();
      download.href = item.src;
      download.setAttribute('download', item.filename || 'image');
      lb.classList.add('open');
      lb.setAttribute('aria-hidden','false');
      state.lightbox.open = true;
      // default zoom fit
      lb.classList.remove('zoom-100'); lb.classList.add('zoom-fit');
      zoomBtn.textContent = '1:1';
      // focus trap
      lastFocused = document.activeElement;
      focusables = [zoomBtn, prev, next, closeBtn, download].filter(Boolean);
      (zoomBtn || prev || next || closeBtn)?.focus();
    }
    function close() {
      lb.classList.remove('open');
      lb.setAttribute('aria-hidden','true');
      state.lightbox.open = false;
      if (lastFocused) lastFocused.focus();
    }
    function show(delta) {
      const len = state.lightbox.items.length;
      if (!len) return;
      state.lightbox.idx = (state.lightbox.idx + delta + len) % len;
      open(state.lightbox.idx);
    }
    closeBtn.addEventListener('click', close);
    prev.addEventListener('click', () => show(-1));
    next.addEventListener('click', () => show(1));
    zoomBtn.addEventListener('click', () => toggleZoom());
    document.addEventListener('keydown', (e) => {
      if (!state.lightbox.open) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') show(-1);
      else if (e.key === 'ArrowRight') show(1);
      else if (e.key === '+' || e.key === '=') { setZoom100(); }
      else if (e.key === '-' || e.key === '_') { setZoomFit(); }
      else if (e.key === 'Tab') { // trap focus
        if (!focusables.length) return;
        e.preventDefault();
        const dir = e.shiftKey ? -1 : 1;
        const idx = (focusables.indexOf(document.activeElement) + dir + focusables.length) % focusables.length;
        focusables[idx].focus();
      }
    });
    // Basic touch swipe
    let startX = 0; let startY = 0;
    lb.addEventListener('touchstart', (e) => { const t = e.touches[0]; startX = t.clientX; startY = t.clientY; }, { passive: true });
    lb.addEventListener('touchend', (e) => {
      const t = e.changedTouches[0];
      const dx = t.clientX - startX; const dy = Math.abs(t.clientY - startY);
      if (Math.abs(dx) > 40 && dy < 60) { if (dx > 0) show(-1); else show(1); }
    });

    function setZoom100() { lb.classList.remove('zoom-fit'); lb.classList.add('zoom-100'); zoomBtn.textContent = 'Fit'; stage.focus(); }
    function setZoomFit() { lb.classList.remove('zoom-100'); lb.classList.add('zoom-fit'); zoomBtn.textContent = '1:1'; stage.focus(); }
    function toggleZoom() { if (lb.classList.contains('zoom-100')) setZoomFit(); else setZoom100(); }

    return { open, close };
  }

  const lightboxApi = initLightbox();

  function collectLightboxItems() {
    state.lightbox.items = $all('img[data-lightbox]')
      .map(img => ({
        src: img.getAttribute('data-large') || img.src,
        alt: img.alt || '',
        title: img.getAttribute('data-title') || img.getAttribute('data-caption') || '',
        year: img.getAttribute('data-year') || '',
        filename: (img.getAttribute('data-large') || img.src).split('/').pop()
      }));
  }

  // Playlist
  const AUDIO_KEY = 'portfolio.audioState';
  function ensureAudio() { if (!state.audio) { state.audio = new Audio(); state.audio.preload = 'metadata'; } return state.audio; }

  function formatTime(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  function saveAudioState() {
    try {
      const a = ensureAudio();
      if (!state.playlist || !state.playlist.tracks) return;
      const payload = { index: state.playlist.index || 0, time: a.currentTime || 0 };
      localStorage.setItem(AUDIO_KEY, JSON.stringify(payload));
    } catch {}
  }

  function loadAudioState() {
    try {
      const raw = localStorage.getItem(AUDIO_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (typeof obj.index === 'number' && obj.index >= 0 && typeof obj.time === 'number') return obj;
      return null;
    } catch { return null; }
  }

  function renderMusician(musician) {
    const body = $(SELECTORS.body('musician'));
    body.innerHTML = '';
    const bioCard = document.createElement('div');
    addCard(bioCard, 'musician', 'Musician', []);
    bioCard.innerHTML = `<p class="meta">${escapeHTML(musician.bio || '')}</p>`;
    body.appendChild(bioCard);

    // Player UI card
    const playerCard = document.createElement('div');
    playerCard.className = 'player';
    playerCard.setAttribute('role', 'group');
    playerCard.setAttribute('aria-label', 'Audio player');
    playerCard.setAttribute('tabindex', '0');
    playerCard.innerHTML = `
      <div class="player-title" id="player-title">—</div>
      <div class="time"><span id="elapsed">0:00</span> / <span id="duration">0:00</span></div>
      <div class="player-row">
        <div class="transport">
          <button class="btn icon" id="prev-btn" aria-label="Previous">⏮</button>
          <button class="btn icon" id="play-btn" aria-label="Play">▶</button>
          <button class="btn icon" id="next-btn" aria-label="Next">⏭</button>
        </div>
        <input class="seek" type="range" id="seek" min="0" max="100" step="0.1" value="0" aria-label="Seek" />
        <div class="vol">
          <label for="volume" class="sr-only">Volume</label>
          <input class="volume" type="range" id="volume" min="0" max="1" step="0.01" value="1" aria-label="Volume" />
        </div>
      </div>
      <div class="link-group">
        <label for="link-select" class="sr-only">Open link</label>
        <select id="link-select" aria-label="Open link"></select>
        <button id="open-link" class="btn" aria-label="Open selected link">Open Link</button>
      </div>`;
    body.appendChild(playerCard);

    // Tag row (years)
    const tags = new Set();
    (musician.tracks || []).forEach(t => { if (t.year) tags.add(String(t.year)); });
    const chipsRow = document.querySelector(SELECTORS.chips('musician'));
    chipsRow.innerHTML = '';
    Array.from(tags).sort().forEach(tag => chipsRow.appendChild(makeTagChip('musician', tag)));

    // Build track list
    const trackEls = [];
    let pIndex = 0; // playable index
    (musician.tracks || []).forEach((track, idx) => {
      const card = document.createElement('div');
      const tagList = [String(track.year || '')].filter(Boolean).concat((track.links || []).map(l => l.label || ''));
      addCard(card, 'musician', track.title, tagList);
      card.classList.add('track-card');
      const hasDrive = !!track.driveId;
      const hasFile = !!track.file;
      const needsUpload = hasDrive || !hasFile;
      if (hasDrive) {
        console.warn(`[media pipeline] Music track "${track.title || `Track ${idx + 1}`}" requires a CDN file and removal of driveId.`);
      } else if (!hasFile) {
        console.warn(`[media pipeline] Music track "${track.title || `Track ${idx + 1}`}" is missing an audio file path.`);
      }
      if (needsUpload) card.classList.add('needs-upload');
      card.innerHTML = `
        <div class="track" data-index="${idx}" role="listitem" aria-selected="false">
          ${needsUpload ? `<div class="missing-placeholder" role="status">MISSING: upload to CDN</div>` : `<button class="play" aria-label="Play or pause ${escapeHTML(track.title)}">▶</button>`}
          <div class="title">${escapeHTML(track.title)}<div class="meta">${escapeHTML(String(track.year || ''))}</div></div>
          <div class="links"></div>
        </div>`;
      const row = card.querySelector('.track');
      const links = card.querySelector('.links');
      (track.links || []).forEach(link => {
        const a = document.createElement('a');
        a.href = link.url || '#';
        a.textContent = link.label || 'Link';
        a.className = 'btn';
        a.target = '_blank';
        a.rel = 'noopener';
        links.appendChild(a);
      });
      if (!needsUpload && hasFile) {
        const thisP = pIndex++;
        row.addEventListener('click', () => selectTrack(thisP));
        row.addEventListener('dblclick', () => playByIndex(thisP));
        const playBtn = row.querySelector('.play');
        playBtn?.addEventListener('click', (e) => { e.stopPropagation(); togglePlayForIndex(thisP); });
        trackEls.push(row);
      }
      body.appendChild(card);
    });

    const playable = (musician.tracks || []).filter(t => t.file && !t.driveId);
    state.playlist = { tracks: playable, index: 0, trackEls };
    setupPlayerBindings(playerCard);
    // Restore previous state if available and valid
    const saved = loadAudioState();
    if (saved && saved.index < state.playlist.tracks.length) {
      loadTrack(saved.index, false, saved.time);
    } else {
      loadTrack(0, false, 0);
    }
  }

  function setupPlayerBindings(playerCard) {
    const audio = ensureAudio();
    const titleEl = playerCard.querySelector('#player-title');
    const playBtn = playerCard.querySelector('#play-btn');
    const prevBtn = playerCard.querySelector('#prev-btn');
    const nextBtn = playerCard.querySelector('#next-btn');
    const seek = playerCard.querySelector('#seek');
    const elapsed = playerCard.querySelector('#elapsed');
    const duration = playerCard.querySelector('#duration');
    const vol = playerCard.querySelector('#volume');
    const linkSel = playerCard.querySelector('#link-select');
    const openLink = playerCard.querySelector('#open-link');

    function updateTitle() {
      const t = state.playlist.tracks[state.playlist.index];
      titleEl.textContent = t ? (t.title || '—') : '—';
      // links
      linkSel.innerHTML = '';
      const links = (t && t.links) ? t.links : [];
      const opt0 = document.createElement('option'); opt0.value = ''; opt0.textContent = links.length ? 'Select link…' : 'No links'; linkSel.appendChild(opt0);
      for (const l of links) { const o = document.createElement('option'); o.value = l.url || '#'; o.textContent = l.label || 'Link'; linkSel.appendChild(o); }
      openLink.disabled = !links.length;
    }

    playBtn.addEventListener('click', () => togglePlay());
    prevBtn.addEventListener('click', () => prevTrack());
    nextBtn.addEventListener('click', () => nextTrack());

    openLink.addEventListener('click', () => {
      const url = linkSel.value;
      if (url) window.open(url, '_blank', 'noopener');
    });

    seek.addEventListener('input', () => {
      if (!isFinite(audio.duration)) return;
      const pct = Number(seek.value) / 100;
      audio.currentTime = Math.max(0, Math.min(audio.duration * pct, audio.duration - 0.25));
    });

    vol.addEventListener('input', () => { audio.volume = Number(vol.value); });

    let lastSave = 0;
    audio.addEventListener('timeupdate', () => {
      if (isFinite(audio.duration)) {
        const pct = (audio.currentTime / audio.duration) * 100;
        seek.value = String(pct);
        elapsed.textContent = formatTime(audio.currentTime);
        duration.textContent = formatTime(audio.duration);
      } else {
        elapsed.textContent = formatTime(audio.currentTime);
      }
      const now = Date.now();
      if (now - lastSave > 1000) { saveAudioState(); lastSave = now; }
    });
    audio.addEventListener('loadedmetadata', () => {
      duration.textContent = formatTime(audio.duration);
    });
    audio.addEventListener('ended', () => { nextTrack(true); });

    // Keyboard controls when focused
    playerCard.addEventListener('keydown', (e) => {
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); seekBy(-5); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); seekBy(5); }
    });

    function seekBy(delta) {
      if (!isFinite(audio.duration)) return;
      audio.currentTime = Math.max(0, Math.min(audio.currentTime + delta, audio.duration - 0.1));
    }

    function togglePlay() {
      if (audio.paused) audio.play().catch(()=>{}); else audio.pause();
      refreshPlayButtons();
    }

    function refreshPlayButtons() {
      const playing = !audio.paused && !audio.ended;
      playBtn.textContent = playing ? '⏸' : '▶';
      // update list buttons
      $all('.track .play').forEach((b, i) => { b.textContent = (playing && i === state.playlist.index) ? '⏸' : '▶'; });
    }

    function updateCurrentHighlight() {
      (state.playlist.trackEls||[]).forEach((el, i) => {
        const curr = i === state.playlist.index;
        el.classList.toggle('current', curr);
        el.setAttribute('aria-selected', curr ? 'true' : 'false');
      });
    }

    function setSourceForIndex(i) {
      const t = state.playlist.tracks[i];
      if (!t) return;
      const a = ensureAudio();
      a.src = t.file;
      state.currentTrackId = t.file;
      updateTitle();
      updateCurrentHighlight();
      refreshPlayButtons();
    }

    // expose helpers
    state.player = {
      updateTitle, refreshPlayButtons, updateCurrentHighlight,
      setSourceForIndex,
      seekBy, togglePlay,
    };
  }

  function loadTrack(index, autoplay = false, startTime = 0) {
    const a = ensureAudio();
    state.playlist.index = Math.max(0, Math.min(index, (state.playlist.tracks.length - 1)));
    state.player.setSourceForIndex(state.playlist.index);
    a.currentTime = Math.max(0, startTime || 0);
    if (autoplay) a.play().catch(()=>{});
  }

  function playByIndex(index) { loadTrack(index, true, 0); state.player.refreshPlayButtons(); }
  function togglePlayForIndex(index) {
    const a = ensureAudio();
    if (index !== state.playlist.index || a.src === '') { playByIndex(index); return; }
    if (a.paused) { a.play().catch(()=>{}); } else { a.pause(); }
    state.player.refreshPlayButtons();
  }
  function selectTrack(index) { state.playlist.index = index; state.player.setSourceForIndex(index); saveAudioState(); }
  function prevTrack(autoplay = true) {
    const i = (state.playlist.index - 1 + state.playlist.tracks.length) % state.playlist.tracks.length;
    loadTrack(i, autoplay, 0);
  }
  function nextTrack(autoplay = true) {
    const i = (state.playlist.index + 1) % state.playlist.tracks.length;
    loadTrack(i, autoplay, 0);
  }

  function renderPosts(sectionKey, items, introText) {
    const body = $(SELECTORS.body(sectionKey));
    body.innerHTML = '';
    if (introText) {
      const intro = document.createElement('div');
      addCard(intro, sectionKey, 'Intro', []);
      intro.innerHTML = `<p class="meta">${escapeHTML(introText)}</p>`;
      body.appendChild(intro);
    }
    // tags from all items
    const tagSet = new Set();
    items.forEach(i => (i.tags||[]).forEach(t => tagSet.add(t)));
    const chipsRow = document.querySelector(SELECTORS.chips(sectionKey));
    chipsRow.innerHTML = '';
    Array.from(tagSet).sort().forEach(tag => chipsRow.appendChild(makeTagChip(sectionKey, tag)));

    // Per-section search input
    addSectionSearch(sectionKey);

    items.forEach((item, idx) => {
      const c = document.createElement('div');
      addCard(c, sectionKey, item.title, (item.tags||[]));
      const excerpt = makeExcerpt(item.html || '', 200);
      c.innerHTML = `
        <h3>${escapeHTML(item.title)}</h3>
        <div class="meta">${escapeHTML(item.date||'')}</div>
        <p>${escapeHTML(excerpt)}</p>
        <div class="tag-row"></div>
        <button class="btn" data-read>Read</button>`;
      const tagRow = c.querySelector('.tag-row');
      (item.tags||[]).forEach(t => { const b = document.createElement('button'); b.className='tag'; b.textContent=t; b.addEventListener('click',()=>{state.tagFilters.set(sectionKey,t); applyFilters();}); tagRow.appendChild(b); });
      const readBtn = c.querySelector('[data-read]');
      readBtn.addEventListener('click', () => openReader(sectionKey, items, item));
      body.appendChild(c);
    });
  }

  // Per-section search input
  function addSectionSearch(sectionKey) {
    const section = document.getElementById(sectionKey);
    if (!section) return;
    const head = section.querySelector('.section-head');
    if (!head) return;
    if (head.querySelector('.mini-search')) return;
    const wrap = document.createElement('div');
    wrap.className = 'mini-search';
    wrap.innerHTML = `
      <div class="search">
        <input type="search" placeholder="Search ${sectionKey}…" aria-label="Search ${sectionKey}">
        <button class="icon-btn" aria-label="Clear">×</button>
      </div>`;
    head.appendChild(wrap);
    const input = wrap.querySelector('input');
    const clear = wrap.querySelector('.icon-btn');
    input.addEventListener('input', () => {
      state.sectionQuery.set(sectionKey, (input.value||'').toLowerCase().trim());
      clear.classList.toggle('hidden', !input.value);
      applyFilters();
    });
    clear.addEventListener('click', () => { input.value=''; input.dispatchEvent(new Event('input')); input.focus(); });
  }

  function makeExcerpt(html, n) {
    const el = document.createElement('div');
    el.innerHTML = html;
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    return text.length > n ? text.slice(0, n).trimEnd() + '…' : text;
  }

  function renderGallery(sectionKey, works, introText) {
    const body = $(SELECTORS.body(sectionKey));
    body.innerHTML = '';
    if (introText) {
      const intro = document.createElement('div');
      addCard(intro, sectionKey, 'Intro', []);
      intro.innerHTML = `<p class="meta">${escapeHTML(introText)}</p>`;
      body.appendChild(intro);
    }
    const tagSet = new Set();
    works.forEach(w => { (w.tags||[]).forEach(t => tagSet.add(t)); if (w.year) tagSet.add(String(w.year)); });
    const chipsRow = document.querySelector(SELECTORS.chips(sectionKey));
    chipsRow.innerHTML = '';
    // Persisted filter
    const saved = localStorage.getItem(FILTER_KEY_PREFIX + sectionKey) || '';
    state.tagFilters.set(sectionKey, saved);
    // 'All' chip first
    const allChip = document.createElement('button');
    allChip.className = 'chip';
    allChip.textContent = 'All';
    if (!saved) allChip.classList.add('active');
    allChip.addEventListener('click', () => { state.tagFilters.set(sectionKey, ''); localStorage.setItem(FILTER_KEY_PREFIX + sectionKey, ''); chipsRow.querySelectorAll('.chip').forEach(c=>c.classList.remove('active')); allChip.classList.add('active'); applyFilters(); });
    chipsRow.appendChild(allChip);
    Array.from(tagSet).sort().forEach(tag => {
      const chip = makeTagChip(sectionKey, tag);
      if (saved && tag === saved) chip.classList.add('active');
      chip.addEventListener('click', () => { localStorage.setItem(FILTER_KEY_PREFIX + sectionKey, tag); });
      chipsRow.appendChild(chip);
    });

    works.forEach((w, idx) => {
      const c = document.createElement('div');
      const tags = (w.tags || []).concat([String(w.year || '')]).filter(Boolean);
      addCard(c, sectionKey, w.title, tags);
      const hasDrive = !!w.driveId;
      const hasSrc = !!w.src;
      if (hasDrive) {
        console.warn(`[media pipeline] ${sectionKey} item "${w.title || `Item ${idx + 1}`}" requires a CDN image and removal of driveId.`);
      } else if (!hasSrc) {
        console.warn(`[media pipeline] ${sectionKey} item "${w.title || `Item ${idx + 1}`}" is missing an image source.`);
      }
      if (hasDrive || !hasSrc) c.classList.add('needs-upload');
      const alt = `${w.title} — ${sectionKey}`;
      let mediaMarkup = '';
      if (!hasDrive && hasSrc) {
        const srcsetArray = Array.isArray(w.srcset) ? w.srcset.filter(entry => entry && entry.src && entry.w) : [];
        const srcAttr = escapeAttr(w.src || '');
        const srcsetAttr = srcsetArray.length
          ? ` srcset="${srcsetArray.map(entry => `${escapeAttr(entry.src)} ${entry.w}w`).join(', ')}"`
          : '';
        const sizesAttr = srcsetArray.length ? ' sizes="(min-width: 900px) 33vw, 90vw"' : '';
        const largestSrcRaw = srcsetArray.length ? srcsetArray[srcsetArray.length - 1].src : (w.src || '');
        const largestSrc = escapeAttr(largestSrcRaw || '');
        mediaMarkup = `<img class="thumb" data-lightbox data-large="${largestSrc}" data-title="${escapeAttr(w.title)}" data-year="${escapeAttr(String(w.year || ''))}" data-caption="${escapeAttr(w.title)}" src="${srcAttr}"${srcsetAttr}${sizesAttr} alt="${escapeAttr(alt)}" loading="lazy" />`;
      } else {
        mediaMarkup = `<div class="missing-placeholder" role="status">MISSING: upload to CDN</div>`;
      }
      c.innerHTML = `
        ${mediaMarkup}
        <h3>${escapeHTML(w.title)}</h3>
        <div class="meta">${escapeHTML(String(w.year || ''))}</div>
        <div class="tag-row"></div>`;
      const row = c.querySelector('.tag-row');
      tags.forEach(t => {
        const b = document.createElement('button');
        b.className = 'tag';
        b.textContent = t;
        b.addEventListener('click', () => {
          state.tagFilters.set(sectionKey, t);
          localStorage.setItem(FILTER_KEY_PREFIX + sectionKey, t);
          applyFilters();
        });
        row.appendChild(b);
      });
      body.appendChild(c);
    });
  }

  function renderProjects(sectionKey, items, introText) {
    const body = $(SELECTORS.body(sectionKey));
    body.innerHTML = '';
    if (introText) {
      const intro = document.createElement('div');
      addCard(intro, sectionKey, 'Intro', []);
      intro.innerHTML = `<p class="meta">${escapeHTML(introText)}</p>`;
      body.appendChild(intro);
    }
    const tagSet = new Set();
    items.forEach(p => { (p.tags||[]).forEach(t => tagSet.add(t)); if (p.year) tagSet.add(String(p.year)); });
    const chipsRow = document.querySelector(SELECTORS.chips(sectionKey));
    chipsRow.innerHTML='';
    // Load persisted multi-select
    let saved = [];
    try { saved = JSON.parse(localStorage.getItem(MFILTER_PREFIX + sectionKey) || '[]'); } catch {}
    const sel = new Set((saved || []).map(String));
    state.multiFilters.set(sectionKey, sel);
    // Clear chip
    const clear = document.createElement('button');
    clear.className = 'chip';
    clear.textContent = 'Clear filters';
    clear.addEventListener('click', () => {
      sel.clear();
      localStorage.setItem(MFILTER_PREFIX + sectionKey, JSON.stringify([]));
      chipsRow.querySelectorAll('.chip').forEach(ch => ch.classList.remove('active'));
      applyFilters();
    });
    chipsRow.appendChild(clear);
    // Tag chips
    Array.from(tagSet).sort().forEach(tag => {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.textContent = tag;
      if (sel.has(String(tag))) chip.classList.add('active');
      chip.addEventListener('click', () => {
        const key = String(tag);
        if (sel.has(key)) sel.delete(key); else sel.add(key);
        chip.classList.toggle('active');
        localStorage.setItem(MFILTER_PREFIX + sectionKey, JSON.stringify(Array.from(sel)));
        applyFilters();
      });
      chipsRow.appendChild(chip);
    });

    items.forEach((p, idx) => {
      const c = document.createElement('div');
      addCard(c, sectionKey, p.title, (p.tags||[]).concat(String(p.year||'')).filter(Boolean));
      c.dataset.idx = String(idx);
      c.classList.add('project');
      const hasDriveEmbed = !!(p.embed && p.embed.type === 'gdrive');
      if (hasDriveEmbed) {
        console.warn(`[media pipeline] ${sectionKey} project "${p.title || `Project ${idx + 1}`}" requires a YouTube or Vimeo embed.`);
        c.classList.add('needs-upload');
      }
      const alt = `${p.title} — ${sectionKey}`;
      c.innerHTML = `
        <img class="thumb" src="${escapeAttr(p.thumb||'')}" alt="${escapeAttr(alt)}" loading="lazy" />
        <h3>${escapeHTML(p.title)}</h3>
        <div class="meta">${escapeHTML(String(p.year||''))}</div>
        <div class="tag-row"></div>
        <div class="actions"></div>
        <button class="btn" data-details>Details</button>`;
      const row = c.querySelector('.tag-row');
      (p.tags||[]).forEach(t => { const b = document.createElement('button'); b.className='tag'; b.textContent=t; b.addEventListener('click',()=>{ const set = state.multiFilters.get(sectionKey) || new Set(); if (set.has(t)) set.delete(t); else set.add(t); state.multiFilters.set(sectionKey, set); localStorage.setItem(MFILTER_PREFIX + sectionKey, JSON.stringify(Array.from(set))); applyFilters();}); row.appendChild(b); });
      const actions = c.querySelector('.actions');
      (p.links||[]).forEach(l => { const a = document.createElement('a'); a.href=l.url||'#'; a.textContent=l.label||'Link'; a.className='btn'; a.target='_blank'; a.rel='noopener'; actions.appendChild(a); });
      if (hasDriveEmbed) {
        const replaceBtn = document.createElement('button');
        replaceBtn.type = 'button';
        replaceBtn.className = 'btn missing-action';
        replaceBtn.textContent = 'Replace with YouTube/Vimeo';
        replaceBtn.disabled = true;
        replaceBtn.setAttribute('aria-disabled', 'true');
        actions.appendChild(replaceBtn);
      }
      const btn = c.querySelector('[data-details]');
      btn.addEventListener('click', () => openProjectDetails(sectionKey, items, idx));
      body.appendChild(c);
    });
  }

  function openProjectDetails(sectionKey, items, startIndex) {
    const modal = $('#details-modal');
    const list = visibleProjectIndices(sectionKey);
    let pos = Math.max(0, list.indexOf(startIndex));
    state.detailsCtx = { sectionKey, items, list, pos };
    function render() {
      const idx = state.detailsCtx.list[state.detailsCtx.pos];
      const p = state.detailsCtx.items[idx];
      const body = modal.querySelector('.modal-body');
      const embed = p.embed ? embedHTML(p.embed, p.title) : '';
      body.innerHTML = `
        ${embed}
        <img class="modal-img" src="${escapeAttr(p.thumb||'')}" alt="${escapeAttr(p.title)}" loading="lazy" />
        <h3>${escapeHTML(p.title)}</h3>
        <p class="meta">${escapeHTML(String(p.year||''))}</p>
        <p>${escapeHTML(p.summary||'')}</p>
        <div class="actions"></div>`;
      const actions = body.querySelector('.actions');
      (p.links||[]).forEach(l => { const a = document.createElement('a'); a.href=l.url||'#'; a.textContent=l.label||'Link'; a.className='btn'; a.target='_blank'; a.rel='noopener'; actions.appendChild(a); });
    }
    function keyHandler(e){
      if (!modal.classList.contains('open')) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); state.detailsCtx.pos = (state.detailsCtx.pos - 1 + state.detailsCtx.list.length) % state.detailsCtx.list.length; render(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); state.detailsCtx.pos = (state.detailsCtx.pos + 1) % state.detailsCtx.list.length; render(); }
    }
    document.addEventListener('keydown', keyHandler);
    const cleanup = () => document.removeEventListener('keydown', keyHandler);
    modal.querySelector('.modal-close').addEventListener('click', cleanup, { once: true });
    modal.addEventListener('click', (e) => { if (e.target === modal) cleanup(); }, { once: true });
    render();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden','false');
  }

  function visibleProjectIndices(sectionKey) {
    const container = document.querySelector(SELECTORS.body(sectionKey));
    return Array.from(container.querySelectorAll('.card'))
      .filter(el => !el.classList.contains('hidden'))
      .map(el => Number(el.dataset.idx));
  }

  function embedHTML(embed, title) {
    const t = (embed && embed.type) || '';
    if (t === 'youtube' && embed.id) {
      const src = `https://www.youtube.com/embed/${encodeURIComponent(embed.id)}`;
      return `<div class="embed"><iframe src="${src}" title="${escapeAttr(title||'YouTube video')}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
    }
    if (t === 'vimeo' && embed.id) {
      const src = `https://player.vimeo.com/video/${encodeURIComponent(embed.id)}`;
      return `<div class="embed"><iframe src="${src}" title="${escapeAttr(title||'Vimeo video')}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
    }
    if (t === 'cfstream') {
      const id = embed.id || '';
      const src = embed.url || `https://iframe.videodelivery.net/${encodeURIComponent(id)}`;
      return `<div class="embed"><iframe src="${src}" title="${escapeAttr(title||'Cloudflare Stream')}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
    }
    if (t === 'gdrive') {
      return `<div class="missing-placeholder" role="status">Replace with YouTube/Vimeo</div>`;
    }
    return '';
  }

  function initModal() {
    const modal = $('#details-modal');
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    modal.querySelector('.modal-close').addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
    function closeModal() { modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); }
  }

  // Reader modal
  const reader = { section: '', index: 0, items: [], scroll: new Map() };
  function openReader(sectionKey, items, item) {
    reader.section = sectionKey;
    reader.items = items;
    reader.index = Math.max(0, items.indexOf(item));
    showReaderIndex(reader.index);
    const modal = $('#reader-modal');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden','false');
    bindReaderKeys();
  }
  function showReaderIndex(idx) {
    reader.index = (idx + reader.items.length) % reader.items.length;
    const modal = $('#reader-modal');
    const titleEl = $('#reader-title');
    const bodyEl = $('#reader-body');
    const post = reader.items[reader.index];
    titleEl.textContent = post.title || '';
    bodyEl.innerHTML = sanitizeHTML(post.html || '');
    // Restore scroll pos
    const key = reader.section + ':' + reader.index;
    const pos = reader.scroll.get(key) || 0;
    bodyEl.scrollTop = pos;
    // Buttons
    $('#reader-prev').onclick = () => { saveReaderScroll(); showReaderIndex(reader.index - 1); };
    $('#reader-next').onclick = () => { saveReaderScroll(); showReaderIndex(reader.index + 1); };
    modal.querySelector('.modal-close').onclick = () => { saveReaderScroll(); closeReader(); };
  }
  function saveReaderScroll() {
    const bodyEl = $('#reader-body');
    const key = reader.section + ':' + reader.index;
    reader.scroll.set(key, bodyEl.scrollTop);
  }
  function closeReader() {
    const modal = $('#reader-modal');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden','true');
    unbindReaderKeys();
  }
  function bindReaderKeys() {
    document.addEventListener('keydown', readerKeyHandler);
  }
  function unbindReaderKeys() {
    document.removeEventListener('keydown', readerKeyHandler);
  }
  function readerKeyHandler(e) {
    const modal = $('#reader-modal');
    if (!modal.classList.contains('open')) return;
    if (e.key === 'Escape') { e.preventDefault(); saveReaderScroll(); closeReader(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); saveReaderScroll(); showReaderIndex(reader.index - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); saveReaderScroll(); showReaderIndex(reader.index + 1); }
  }

  function sanitizeHTML(html) {
    const allowed = new Set(['A','P','H1','H2','H3','UL','OL','LI','BLOCKQUOTE','CODE','PRE','STRONG','EM','BR']);
    const div = document.createElement('div');
    div.innerHTML = html;
    (function walk(node){
      const children = Array.from(node.childNodes);
      for (const n of children) {
        if (n.nodeType === Node.ELEMENT_NODE) {
          if (n.tagName === 'SCRIPT' || n.tagName === 'STYLE') { n.remove(); continue; }
          if (!allowed.has(n.tagName)) { n.replaceWith(...Array.from(n.childNodes)); continue; }
          if (n.tagName === 'A') {
            const href = n.getAttribute('href') || '#';
            n.setAttribute('href', href);
            n.setAttribute('target','_blank');
            n.setAttribute('rel','noopener');
            for (const a of Array.from(n.attributes)) { if (a.name !== 'href' && a.name !== 'target' && a.name !== 'rel') n.removeAttribute(a.name); }
          } else {
            for (const a of Array.from(n.attributes)) n.removeAttribute(a.name);
          }
          walk(n);
        } else if (n.nodeType === Node.COMMENT_NODE) {
          n.remove();
        }
      }
    })(div);
    return div.innerHTML;
  }

  function renderContact(contact) {
    const body = $(SELECTORS.body('contact'));
    body.innerHTML = '';
    const card = document.createElement('div');
    addCard(card, 'contact', 'Contact', []);
    const email = contact.email || 'you@example.com';
    const subject = encodeURIComponent('Hello from your portfolio');
    card.innerHTML = `
      <div class="email-row">
        <code class="email-text">${escapeHTML(email)}</code>
        <button class="btn" id="copy-email" aria-label="Copy email">Copy</button>
        <a class="btn primary" id="compose-email" href="mailto:${escapeAttr(email)}?subject=${subject}">Compose Email</a>
      </div>
      <div class="tag-row links"></div>`;
    const links = card.querySelector('.links');
    (contact.links||[]).forEach(l => { const a = document.createElement('a'); a.href=l.url||'#'; a.textContent=l.label||'Link'; a.className='btn'; a.target='_blank'; a.rel='noopener'; links.appendChild(a); });
    const copyBtn = card.querySelector('#copy-email');
    copyBtn.addEventListener('click', async () => {
      const text = email;
      try {
        if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); }
        else {
          const ta = document.createElement('textarea');
          ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
        }
        showToast('Copied!');
      } catch {
        showToast('Copy failed');
      }
    });
    body.appendChild(card);
    // Footer wiring
    updateFooter(contact.email);
  }

  function updateFooter(email) {
    const name = (state.data?.site?.name) || 'YOUR NAME';
    const year = new Date().getFullYear();
    const nameEl = document.getElementById('footer-name');
    const yearEl = document.getElementById('footer-year');
    const emailEl = document.getElementById('footer-email');
    if (nameEl) nameEl.textContent = name;
    if (yearEl) yearEl.textContent = String(year);
    if (emailEl) emailEl.href = `mailto:${(email||'you@example.com')}?subject=${encodeURIComponent('Hello from your portfolio')}`;
  }

  function ensureToastEl() {
    let el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
    return el;
  }
  function showToast(message) {
    const el = ensureToastEl();
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(el._hideT);
    el._hideT = setTimeout(() => el.classList.remove('show'), 1400);
  }

  function renderSiteHeader(site) {
    const siteName = site.name || 'YOUR NAME';
    const siteDesc = site.tagline || '';
    $('#hero-title').textContent = siteName;
    $('#hero-tagline').textContent = siteDesc;
    const title = `${siteName} — Portfolio`;
    document.title = title;
    const siteTitleEl = document.querySelector('.site-title');
    siteTitleEl.textContent = siteName;

    // Canonical + URLs
    const origin = window.location.origin || '';
    const url = (origin ? origin + window.location.pathname : window.location.href);
    const canonical = document.getElementById('canonical');
    if (canonical) canonical.setAttribute('href', url);

    // Meta description
    const metaDesc = document.getElementById('meta-description');
    if (metaDesc) metaDesc.setAttribute('content', siteDesc || siteName);
    const mt = document.getElementById('meta-title'); if (mt) mt.textContent = title;

    // OG/Twitter
    const ogTitle = document.getElementById('og-title'); if (ogTitle) ogTitle.setAttribute('content', title);
    const ogDesc = document.getElementById('og-description'); if (ogDesc) ogDesc.setAttribute('content', siteDesc || siteName);
    const ogUrl = document.getElementById('og-url'); if (ogUrl) ogUrl.setAttribute('content', url);
    const ogImg = document.getElementById('og-image');
    const twTitle = document.getElementById('twitter-title'); if (twTitle) twTitle.setAttribute('content', title);
    const twDesc = document.getElementById('twitter-description'); if (twDesc) twDesc.setAttribute('content', siteDesc || siteName);
    const twImg = document.getElementById('twitter-image');
    const ogPath = new URL('assets/images/og/og.svg', window.location.href).href;
    if (ogImg) ogImg.setAttribute('content', ogPath);
    if (twImg) twImg.setAttribute('content', ogPath);

    // JSON-LD Person (with sameAs)
    const ld = $('#ld-person');
    try {
      const data = JSON.parse(ld.textContent);
      data.name = siteName;
      data.headline = siteDesc || data.headline;
      const links = (state.data?.contact?.links || []).map(l => l.url).filter(Boolean);
      if (links.length) data.sameAs = links;
      ld.textContent = JSON.stringify(data);
    } catch {}

    // JSON-LD WebSite with SearchAction
    const ldw = document.getElementById('ld-website');
    if (ldw) {
      try {
        const w = JSON.parse(ldw.textContent);
        w.url = url;
        w.name = title;
        if (!w.potentialAction) w.potentialAction = {};
        w.potentialAction['@type'] = 'SearchAction';
        w.potentialAction.target = url + '#search';
        w.potentialAction['query-input'] = 'required name=search_term_string';
        ldw.textContent = JSON.stringify(w);
      } catch {}
    }
  }

  // Responsive nav labels (long/short)
  function initResponsiveNav() {
    const NAV = [
      { id: 'home', long: 'Home', short: 'Home' },
      { id: 'musician', long: 'Musician', short: 'Music' },
      { id: 'writer', long: 'Writer', short: 'Writer' },
      { id: 'analysis', long: 'Game Design Analysis', short: 'GDA' },
      { id: 'art', long: 'Art', short: 'Art' },
      { id: 'games', long: 'Video Games', short: 'Games' },
      { id: 'photography', long: 'Street Photography', short: 'Photo' },
      { id: 'apps', long: 'Vibe Coding Apps', short: 'VCA' },
      { id: 'contact', long: 'Contact', short: 'Contact' }
    ];
    const nav = document.querySelector('.site-nav');
    if (!nav) return;
    const admin = nav.querySelector('a[href="admin.html"]');
    nav.innerHTML = '';
    for (const item of NAV) {
      const a = document.createElement('a');
      a.href = `#${item.id}`;
      a.title = item.long;
      a.setAttribute('aria-label', item.long);
      a.innerHTML = `<span class="nav-long">${escapeHTML(item.long)}</span><span class="nav-short" aria-hidden="true">${escapeHTML(item.short)}</span>`;
      nav.appendChild(a);
    }
    if (admin) nav.appendChild(admin);
    function setCurrent() {
      const id = (location.hash || '#home').slice(1);
      nav.querySelectorAll('a').forEach(a => {
        const is = a.getAttribute('href') === `#${id}`;
        if (is) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      });
    }
    setCurrent();
    window.addEventListener('hashchange', setCurrent);
  }

  function collectGalleryAndBind() {
    collectLightboxItems();
    $all('img[data-lightbox]').forEach((img, idx) => {
      img.addEventListener('click', () => lightboxApi.open(idx));
    });
  }

  function escapeHTML(str) { return (str||'').replace(/[&<>"']/g, s=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[s])); }
  function escapeAttr(str) { return escapeHTML(str); }

  async function init() {
    initTheme();
    initSearch();
    initModal();
    initResponsiveNav();
    try {
      state.data = await fetchJSON('content/content.json');
    } catch (e) {
      console.error('Failed to load content.json', e);
      state.data = { site: { name: 'YOUR NAME', tagline: '' } };
    }
    const d = state.data;
    renderSiteHeader(d.site || {});
    renderMusician(d.musician || { tracks: [] });
    renderPosts('writer', (d.writer?.posts)||[], d.writer?.intro||'');
    renderPosts('analysis', (d.analysis?.essays)||[], d.analysis?.intro||'');
    renderGallery('art', (d.art?.works)||[], d.art?.intro||'');
    renderProjects('games', (d.games?.projects)||[], d.games?.intro||'');
    renderGallery('photography', (d.photography?.photos)||[], d.photography?.intro||'');
    renderProjects('apps', (d.apps?.projects)||[], d.apps?.intro||'');
    renderContact(d.contact || {});

    // After all cards exist
    initObserver();
    applyFilters();
    collectGalleryAndBind();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
