(() => {
  'use strict';

  const STORE = {
    cloud: 'portfolio.cloudinary',
  };

  const state = {
    cloudName: '',
    uploadPreset: '',
    widgetAudio: null,
    widgetImages: null,
    content: null,
    changed: false,
    locked: false,
  };

  function $(s,r=document){return r.querySelector(s)}
  function el(tag, attrs={}){ const e=document.createElement(tag); for(const k in attrs){ if(k==='text') e.textContent=attrs[k]; else e.setAttribute(k, attrs[k]); } return e; }

  function loadCloud() {
    try { const o = JSON.parse(localStorage.getItem(STORE.cloud)||'{}'); state.cloudName=o.cloudName||''; state.uploadPreset=o.uploadPreset||''; } catch {}
  }
  function saveCloud() {
    localStorage.setItem(STORE.cloud, JSON.stringify({ cloudName: state.cloudName, uploadPreset: state.uploadPreset }));
  }

  async function loadContent() {
    try { const r = await fetch('content/content.json',{cache:'no-cache'}); state.content = await r.json(); } catch(e) { console.error('content load fail', e); state.content = { site:{name:'YOUR NAME',tagline:''} }; }
  }

  function initSettingsUI() {
    $('#cloud-name').value = state.cloudName;
    $('#upload-preset').value = state.uploadPreset;
    $('#save-settings').addEventListener('click', () => {
      state.cloudName = $('#cloud-name').value.trim();
      state.uploadPreset = $('#upload-preset').value.trim();
      saveCloud();
      $('#settings-status').textContent = 'Saved.';
      createWidgets();
    });
    const params = new URLSearchParams(location.search);
    if (params.get('preview') !== '1') {
      $('#preview-warning').hidden = false;
    }
  }

  function createWidgets() {
    if (!(window.cloudinary && state.cloudName && state.uploadPreset)) return;
    // Audio widget
    state.widgetAudio = cloudinary.createUploadWidget({
      cloudName: state.cloudName,
      uploadPreset: state.uploadPreset,
      sources: ['local','url','google_drive','dropbox'],
      clientAllowedFormats: ['mp3','m4a'],
      multiple: true,
      resourceType: 'auto'
    }, onUpload);
    // Images widget
    state.widgetImages = cloudinary.createUploadWidget({
      cloudName: state.cloudName,
      uploadPreset: state.uploadPreset,
      sources: ['local','url','google_drive','dropbox','camera'],
      multiple: true,
      resourceType: 'image'
    }, onUpload);
  }

  function onUpload(err, res) {
    if (err) { console.error(err); return; }
    if (res && res.event === 'success') {
      const info = res.info || {};
      renderPending(info);
    }
  }

  function renderPending(info) {
    const wrap = $('#pending');
    const item = el('div', { class: 'pending-item' });
    const isImage = (info.resource_type === 'image') || /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(info.secure_url||'');
    const isAudio = (info.resource_type === 'video' || info.resource_type === 'raw' || info.resource_type === 'auto') && /\.(mp3|m4a)$/i.test((info.original_filename||'') + (info.format?'.'+info.format:''));
    const title = el('input', { type:'text', placeholder:'Title' });
    const year = el('input', { type:'number', min:'1900', max:'2100', value:String(new Date().getFullYear()) });
    const tags = el('input', { type:'text', placeholder:'tags (comma)' });
    const select = el('select');
    if (isAudio) {
      select.appendChild(new Option('Musician • Tracks','musician.tracks'));
    }
    if (isImage) {
      select.appendChild(new Option('Art • Works','art.works'));
      select.appendChild(new Option('Photography • Photos','photography.photos'));
    }
    const preview = isImage ? el('img', { class:'thumb', src: info.secure_url }) : el('code', { text: info.secure_url });
    const saveBtn = el('button', { class:'btn primary', text:'Save to content' });
    const row1 = el('div'); row1.append(preview);
    const row2 = el('div', { class:'pending-actions' });
    row2.append(select, title, year, tags, saveBtn);
    item.append(row1, row2);
    wrap.prepend(item);

    saveBtn.addEventListener('click', () => {
      const dest = select.value;
      const tagList = (tags.value||'').split(',').map(s=>s.trim()).filter(Boolean);
      if (dest === 'musician.tracks') {
        const track = { title: title.value||info.original_filename||'Track', file: info.secure_url, year: Number(year.value)||new Date().getFullYear(), links: [] };
        state.content.musician = state.content.musician || { bio:'', tracks:[] };
        state.content.musician.tracks = state.content.musician.tracks || [];
        state.content.musician.tracks.push(track);
      } else if (dest === 'art.works') {
        state.content.art = state.content.art || { intro:'', works:[] };
        state.content.art.works = state.content.art.works || [];
        state.content.art.works.push({ title: title.value||info.original_filename||'Art', src: info.secure_url, year: Number(year.value)||new Date().getFullYear(), tags: tagList });
      } else if (dest === 'photography.photos') {
        state.content.photography = state.content.photography || { intro:'', photos:[] };
        state.content.photography.photos = state.content.photography.photos || [];
        state.content.photography.photos.push({ title: title.value||info.original_filename||'Photo', src: info.secure_url, year: Number(year.value)||new Date().getFullYear(), tags: tagList });
      }
      state.changed = true;
      updateDownloadState();
      saveBtn.disabled = true; saveBtn.textContent = 'Saved';
    });
  }

  function parseVideo(type, input) {
    const str = (input||'').trim();
    if (type === 'youtube') {
      const m = str.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{6,})/); return { type, id: m ? m[1] : str };
    }
    if (type === 'vimeo') {
      const m = str.match(/vimeo\.com\/(?:video\/)?(\d+)/); return { type, id: m ? m[1] : str };
    }
    if (type === 'cfstream') {
      // accept id or full url
      const id = str.split('/').pop();
      return { type, id, url: str };
    }
    return null;
  }

  function initVideoImporter() {
    $('#video-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const section = $('#video-section').value;
      const type = $('#video-type').value;
      const link = $('#video-input').value;
      const title = $('#video-title-input').value || 'Project';
      const year = Number($('#video-year').value)||new Date().getFullYear();
      const tags = ($('#video-tags').value||'').split(',').map(s=>s.trim()).filter(Boolean);
      const thumb = $('#video-thumb').value||'';
      const embed = parseVideo(type, link);
      if (!embed) { $('#video-status').textContent = 'Invalid video link'; return; }
      const obj = { title, year, tags, thumb, summary:'', links:[], embed };
      const key = section === 'apps' ? 'apps' : 'games';
      state.content[key] = state.content[key] || { intro:'', projects:[] };
      state.content[key].projects = state.content[key].projects || [];
      state.content[key].projects.push(obj);
      state.changed = true;
      updateDownloadState();
      $('#video-status').textContent = 'Added to content (not saved to disk).';
      e.target.reset();
    });
  }

  function updateDownloadState() {
    const btn = $('#download-json');
    btn.disabled = !state.changed || !state.content;
  }

  function initDownload() {
    $('#download-json').addEventListener('click', () => {
      try {
        const data = JSON.stringify(state.content, null, 2);
        const blob = new Blob([data], { type:'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'content.json';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        $('#download-status').textContent = 'Downloaded content.json';
        state.changed = false; updateDownloadState();
      } catch(err) {
        $('#download-status').textContent = 'JSON error: ' + err.message;
      }
    });
  }

  function initUploadButtons() {
    $('#upload-audio').addEventListener('click', () => { if (state.widgetAudio) state.widgetAudio.open(); else alert('Set Cloudinary settings first.'); });
    $('#upload-images').addEventListener('click', () => { if (state.widgetImages) state.widgetImages.open(); else alert('Set Cloudinary settings first.'); });
  }

  async function init(){
    // Lock admin in non-localhost environments
    if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      state.locked = true;
      const banner = document.getElementById('local-only-banner');
      if (banner) banner.hidden = false;
      // Disable all interactive controls
      document.querySelectorAll('button, input, select, textarea').forEach(el => { el.disabled = true; });
      document.querySelectorAll('form').forEach(f => f.addEventListener('submit', (e) => e.preventDefault()));
    }

    loadCloud();
    initSettingsUI();
    await loadContent();
    if (!state.locked) createWidgets();
    if (!state.locked) initUploadButtons();
    if (!state.locked) initVideoImporter();
    initDownload();
    updateDownloadState();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
