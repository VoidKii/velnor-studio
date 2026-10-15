'use strict';
(() => {
  // ---------- tiny helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  function h(tag, props, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'value') n.value = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      n.append(kid.nodeType ? kid : document.createTextNode(kid));
    }
    return n;
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

  // ---------- storage (browser only) ----------
  const KEY_PROJECTS = 'velnor.projects.v1';
  const KEY_HISTORY = 'velnor.history.v1';
  const KEY_PREFS = 'velnor.prefs.v1';
  const HISTORY_MAX = 40;

  function load(key, fallback = []) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v == null ? fallback : v;
    } catch (_) { return fallback; }
  }
  function store(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (_) { toast('Could not save. Browser storage is full or blocked.'); return false; }
  }

  // ---------- state ----------
  const state = {
    status: null,
    view: 'empty',            // empty | loading | error | result
    current: null,            // { id, name, input, pack, mode, variant, edited }
    error: null,              // { message, retry }
    tab: 'projects',
    query: '',
    abort: null,
    lastInput: null,
  };
  const ui = {};

  const EXAMPLES = [
    'Why old film cameras are making a comeback with Gen Z',
    'Three DaVinci Resolve tricks that make cheap footage look expensive',
    'A night-shift baker\'s morning, shot like a movie trailer',
  ];

  // ---------- toast + clipboard ----------
  let toastTimer;
  function toast(message) {
    const t = $('#toast');
    t.textContent = message;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }
  async function copyText(text, btn, label = 'Copied') {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; }
    catch (_) {
      const ta = h('textarea', { 'aria-hidden': 'true' });
      ta.value = text;
      ta.className = 'sr-only';
      document.body.append(ta);
      ta.select();
      try { ok = document.execCommand('copy'); } catch (__) { ok = false; }
      ta.remove();
    }
    if (!ok) { toast('Copy was blocked by your browser. Select the text and copy it manually.'); return; }
    toast(label);
    if (btn) {
      const old = btn.textContent;
      btn.textContent = 'Copied';
      btn.classList.add('done');
      setTimeout(() => { btn.textContent = old; btn.classList.remove('done'); }, 1400);
    }
  }

  // ---------- pack -> text ----------
  const toText = {
    hook: (p) => p.hook,
    script: (p) => p.script.map((r) => `[${r.time}]\nOn screen: ${r.visual}\nVoiceover: ${r.voiceover}`).join('\n\n'),
    titles: (p) => p.titles.map((t, i) => `${i + 1}. ${t}`).join('\n'),
    caption: (p) => p.caption,
    hashtags: (p) => p.hashtags.join(' '),
    music: (p) => p.music.map((m) => `- ${m}`).join('\n'),
    sfx: (p) => p.sfx.map((s) => `- ${s.time ? `[${s.time}] ` : ''}${s.sound}`).join('\n'),
    editing: (p) => p.editing.map((s, i) => `${i + 1}. ${s.page ? `[${s.page}] ` : ''}${s.title}\n   ${s.detail}`).join('\n'),
  };
  function allText(c) {
    const p = c.pack;
    return [
      `VELNOR STUDIO creator pack`,
      `Idea: ${c.input.idea}`,
      `${c.input.platform}, ${c.input.tone}, ${c.input.language}, ${c.input.duration}s`,
      '',
      'OPENING HOOK', toText.hook(p), '',
      'SCRIPT', toText.script(p), '',
      'TITLE OPTIONS', toText.titles(p), '',
      'CAPTION', toText.caption(p), '',
      'HASHTAGS', toText.hashtags(p), '',
      'MUSIC', toText.music(p), '',
      'SOUND EFFECTS', toText.sfx(p), '',
      'DAVINCI RESOLVE EDITING BLUEPRINT', toText.editing(p),
    ].join('\n');
  }

  // ---------- form ----------
  function chipGroup(container, name, values, selected, format = (v) => v) {
    container.replaceChildren(...values.map((v) => {
      const id = `${name}-${String(v).replace(/\W+/g, '_')}`;
      return h('label', { class: 'chip', for: id },
        h('input', { type: 'radio', name, id, value: String(v), checked: String(v) === String(selected) ? true : null }),
        h('span', { text: format(v) }));
    }));
  }
  function readForm() {
    const val = (name) => { const r = document.querySelector(`input[name="${name}"]:checked`); return r ? r.value : ''; };
    return {
      idea: $('#idea').value.trim().replace(/\s+/g, ' '),
      platform: val('platform'), tone: val('tone'),
      duration: Number(val('duration')), language: $('#language').value,
    };
  }
  function writeForm(input) {
    $('#idea').value = input.idea;
    for (const [name, value] of [['platform', input.platform], ['tone', input.tone], ['duration', input.duration]]) {
      const r = document.querySelector(`input[name="${name}"][value="${value}"]`);
      if (r) r.checked = true;
    }
    $('#language').value = input.language;
    updateIdeaCount();
    updateDemoNote();
  }
  function updateIdeaCount() {
    $('#ideaCount').textContent = `${$('#idea').value.length} / 800`;
  }
  function updateDemoNote() {
    const note = $('#demoNote');
    if (!state.status || state.status.mode !== 'demo') { note.textContent = ''; return; }
    note.textContent = $('#language').value !== 'English'
      ? 'Demo mode: results come from templates, in English only.'
      : 'Demo mode: results come from templates, not AI.';
  }
  function savePrefs() {
    const f = readForm();
    store(KEY_PREFS, { platform: f.platform, tone: f.tone, duration: f.duration, language: f.language });
  }
  function setIdeaError(message) {
    $('#ideaError').textContent = message || '';
    $('#idea').setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  // ---------- server status ----------
  async function loadStatus() {
    const badge = $('#modeBadge');
    try {
      const res = await fetch('/api/status', { cache: 'no-store' });
      if (!res.ok) throw new Error('status ' + res.status);
      state.status = await res.json();
    } catch (_) {
      state.status = null;
      badge.dataset.mode = 'offline';
      badge.textContent = 'Server unreachable';
      return false;
    }
    const s = state.status;
    badge.dataset.mode = s.mode;
    badge.textContent = s.mode === 'ai' ? `AI mode: ${s.provider}, ${s.model}` : 'Demo mode: templates, not AI';
    $('#codeField').hidden = !s.requiresAccessCode;
    if (s.requiresAccessCode) $('#accessCode').value = sessionStorage.getItem('velnor.code') || '';
    updateDemoNote();
    return true;
  }

  // ---------- generating ----------
  async function generate(input, { variant = 0, regenerate = false } = {}) {
    setIdeaError('');
    if (input.idea.length < 5) {
      setIdeaError('Describe your video idea in at least a few words.');
      $('#idea').focus();
      return;
    }
    if (state.abort) state.abort.abort();
    const controller = new AbortController();
    state.abort = controller;
    const timer = setTimeout(() => controller.abort('timeout'), 90_000);
    state.lastInput = { input, variant, regenerate };
    state.view = 'loading';
    render();

    try {
      const headers = { 'content-type': 'application/json' };
      const code = $('#accessCode').value;
      if (state.status && state.status.requiresAccessCode) {
        headers['x-access-code'] = code;
        try { sessionStorage.setItem('velnor.code', code); } catch (_) { /* ignore */ }
      }
      let res;
      try {
        res = await fetch('/api/generate', { method: 'POST', headers, body: JSON.stringify({ ...input, variant }), signal: controller.signal });
      } catch (err) {
        if (controller.signal.aborted) {
          if (controller.signal.reason === 'timeout') throw new Error('This is taking too long. Check your connection and try again.');
          return; // cancelled by the user; view already updated
        }
        throw new Error('Could not reach the server. Check that it is running and your connection is working.');
      }
      let data = null;
      try { data = await res.json(); } catch (_) { /* non-JSON error page */ }
      if (!res.ok || !data || !data.pack) {
        const err = new Error((data && data.error) || `The server answered with an error (${res.status}).`);
        err.code = data && data.code;
        throw err;
      }
      const prev = state.current;
      const keepProject = regenerate && prev;
      state.current = {
        id: keepProject ? prev.id : null,
        name: keepProject ? prev.name : clip(input.idea, 56),
        input, pack: data.pack, mode: data.mode, variant,
        edited: Boolean(keepProject && prev.id),   // a saved project now differs from its saved copy
      };
      pushHistory(state.current);
      state.view = 'result';
      savePrefs();
      render();
      if (!regenerate) $('#output').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      state.error = { message: err.message || 'Something went wrong.', code: err.code };
      state.view = 'error';
      render();
      if (err.code === 'ACCESS_CODE') $('#accessCode').focus();
    } finally {
      clearTimeout(timer);
      if (state.abort === controller) state.abort = null;
    }
  }

  function confirmDiscard() {
    const c = state.current;
    if (state.view === 'result' && c && c.edited) {
      return window.confirm('You have edits that are not saved. Continue and lose them?');
    }
    return true;
  }

  function onSubmit(e) {
    e.preventDefault();
    if (state.view === 'loading') return;
    if (!confirmDiscard()) return;
    generate(readForm(), { variant: 0 });
  }
  function regenerate() {
    const c = state.current;
    if (!c || state.view === 'loading') return;
    if (c.edited && !window.confirm('Regenerating replaces your edits. Continue?')) return;
    generate(c.input, { variant: (c.variant || 0) + 1 + Math.floor(Math.random() * 50), regenerate: true });
  }

  // ---------- library ----------
  function pushHistory(c) {
    const hist = load(KEY_HISTORY);
    hist.unshift({ id: uid(), name: clip(c.input.idea, 56), input: c.input, pack: clone(c.pack), mode: c.mode, at: Date.now() });
    store(KEY_HISTORY, hist.slice(0, HISTORY_MAX));
    renderLibrary();
  }
  function searchable(rec) {
    return [rec.name, rec.input.idea, rec.input.platform, rec.input.tone, rec.input.language,
      rec.pack.hook, ...rec.pack.titles].join(' ').toLowerCase();
  }
  function fmtDate(ts) {
    return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function renderLibrary() {
    const projects = load(KEY_PROJECTS);
    const history = load(KEY_HISTORY);
    $('#countProjects').textContent = projects.length;
    $('#countHistory').textContent = history.length;
    const isProjects = state.tab === 'projects';
    const items = (isProjects ? projects : history);
    const q = state.query.trim().toLowerCase();
    const shown = q ? items.filter((r) => searchable(r).includes(q)) : items;
    const list = $('#libList');
    list.replaceChildren();

    if (!shown.length) {
      let msg;
      if (q) msg = `No ${isProjects ? 'saved projects' : 'history'} match "${state.query.trim()}".`;
      else msg = isProjects ? 'Nothing saved yet. Generate a pack, edit it, then press Save project.' : 'Every pack you generate shows up here.';
      list.append(h('li', { class: 'lib-empty', text: msg }));
      return;
    }
    for (const rec of shown) {
      const active = isProjects && state.current && state.current.id === rec.id;
      list.append(h('li', { class: 'lib-item' + (active ? ' active' : '') },
        h('button', { class: 'lib-open', type: 'button', onclick: () => openRecord(rec, isProjects) },
          h('span', { class: 'lib-name', text: rec.name }),
          h('span', { class: 'lib-meta', text: `${rec.input.platform}, ${rec.input.duration}s, ${fmtDate(isProjects ? rec.updatedAt : rec.at)}` })),
        h('button', { class: 'lib-del', type: 'button', 'aria-label': `Delete ${rec.name}`, title: 'Delete',
          onclick: () => deleteRecord(rec, isProjects) },
          h('svg', { viewBox: '0 0 24 24', width: '16', height: '16', 'aria-hidden': 'true' }))));
    }
    // inline SVG needs the SVG namespace, so set the icon via markup
    list.querySelectorAll('.lib-del').forEach((b) => {
      b.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    });
    if (!isProjects && !q) {
      list.append(h('li', {}, h('button', { class: 'btn btn-small btn-danger', type: 'button', onclick: clearHistory, text: 'Clear history' })));
    }
  }
  function openRecord(rec, isProject) {
    if (!confirmDiscard()) return;
    if (state.abort) state.abort.abort();
    state.current = {
      id: isProject ? rec.id : null, name: rec.name, input: clone(rec.input), pack: clone(rec.pack),
      mode: rec.mode, variant: 0, edited: false,
    };
    state.view = 'result';
    writeForm(state.current.input);
    render();
    closeRail();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function deleteRecord(rec, isProject) {
    if (isProject && !window.confirm(`Delete the saved project "${rec.name}"?`)) return;
    const key = isProject ? KEY_PROJECTS : KEY_HISTORY;
    if (store(key, load(key).filter((r) => r.id !== rec.id))) {
      if (isProject && state.current && state.current.id === rec.id) { state.current.id = null; updateStatusLabel(); }
      renderLibrary();
      toast(isProject ? 'Project deleted' : 'Removed from history');
    }
  }
  function clearHistory() {
    if (!window.confirm('Clear all history? Saved projects are not affected.')) return;
    if (store(KEY_HISTORY, [])) { renderLibrary(); toast('History cleared'); }
  }
  function saveProject() {
    const c = state.current;
    if (!c) return;
    const projects = load(KEY_PROJECTS);
    const now = Date.now();
    let rec = projects.find((p) => p.id === c.id);
    if (!rec) { rec = { id: uid(), createdAt: now }; projects.unshift(rec); }
    Object.assign(rec, { name: c.name.trim() || clip(c.input.idea, 56), input: clone(c.input), pack: clone(c.pack), mode: c.mode, updatedAt: now });
    if (!store(KEY_PROJECTS, projects)) return;
    c.id = rec.id; c.name = rec.name; c.edited = false;
    renderLibrary(); updateStatusLabel();
    toast('Project saved');
  }
  function newPack() {
    if (!confirmDiscard()) return;
    if (state.abort) state.abort.abort();
    state.current = null; state.view = 'empty';
    $('#idea').value = ''; updateIdeaCount(); setIdeaError('');
    render(); closeRail();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    $('#idea').focus();
  }

  // ---------- rendering the output area ----------
  function render() {
    const out = $('#output');
    out.setAttribute('aria-busy', state.view === 'loading' ? 'true' : 'false');
    $('#generateBtn').disabled = state.view === 'loading';
    $('#generateBtn').textContent = state.view === 'loading' ? 'Generating…' : 'Generate creator pack';
    if (state.view === 'empty') out.replaceChildren(renderEmpty());
    else if (state.view === 'loading') out.replaceChildren(renderLoading());
    else if (state.view === 'error') out.replaceChildren(renderError());
    else out.replaceChildren(renderResult());
    renderLibrary();
    requestAnimationFrame(autosizeAll);
  }

  function ruler(loading) {
    return h('div', { class: 'ruler', 'aria-hidden': 'true' }, h('div', { class: 'playhead' }));
  }
  function renderEmpty() {
    return h('div', { class: 'state' },
      h('h2', { text: 'Nothing generated yet' }),
      h('p', { text: 'Write your idea above and press Generate creator pack. Or start from one of these:' }),
      h('div', { class: 'examples' }, EXAMPLES.map((ex) =>
        h('button', { class: 'example', type: 'button', text: ex, onclick: () => { $('#idea').value = ex; updateIdeaCount(); setIdeaError(''); $('#idea').focus(); } }))),
      ruler());
  }
  function renderLoading() {
    const demo = state.status && state.status.mode === 'demo';
    return h('div', { class: 'state loading' },
      h('h2', { text: demo ? 'Building your demo pack' : 'Writing your creator pack' }),
      h('p', { text: demo ? 'Filling templates with your idea. This is instant.' : 'The AI is drafting the hook, script, titles and edit plan. This usually takes 10 to 40 seconds.' }),
      ruler(true),
      h('div', {}, h('div', { class: 'skel' }), h('div', { class: 'skel' }), h('div', { class: 'skel' }), h('div', { class: 'skel' })),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: cancelGeneration })));
  }
  function cancelGeneration() {
    if (state.abort) state.abort.abort('user');
    state.view = state.current ? 'result' : 'empty';
    render();
  }
  function renderError() {
    const retry = state.lastInput;
    return h('div', { class: 'state state-error', role: 'alert' },
      h('h2', { text: 'The pack could not be generated' }),
      h('p', { text: state.error ? state.error.message : 'Something went wrong.' }),
      h('div', { class: 'btn-row' },
        retry && (!state.error || state.error.code !== 'ACCESS_CODE') && h('button', { class: 'btn btn-primary', type: 'button', text: 'Try again',
          onclick: () => generate(retry.input, { variant: retry.variant, regenerate: retry.regenerate }) }),
        h('button', { class: 'btn', type: 'button', text: 'Edit my idea', onclick: () => { state.view = state.current ? 'result' : 'empty'; render(); $('#idea').focus(); } })));
  }

  // ----- result view -----
  function autosize(t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 2 + 'px'; }
  function autosizeAll() { document.querySelectorAll('#output textarea.edit').forEach(autosize); }

  function markEdited() {
    if (!state.current) return;
    state.current.edited = true;
    updateStatusLabel();
  }
  function updateStatusLabel() {
    if (!ui.status || !state.current) return;
    const c = state.current;
    ui.status.textContent = c.id == null ? 'Not saved' : c.edited ? 'Unsaved changes' : 'Saved';
  }

  // an editable multi-line text bound to obj[key]
  function bindText(obj, key, cls, { onChange, label } = {}) {
    const t = h('textarea', { class: 'edit ' + (cls || ''), rows: '1', spellcheck: 'true', 'aria-label': label || null });
    t.value = obj[key] || '';
    t.addEventListener('input', () => { obj[key] = t.value; autosize(t); markEdited(); if (onChange) onChange(); });
    return t;
  }
  function copyBtn(getText, label = 'Copy', aria) {
    const b = h('button', { class: 'btn btn-small copy', type: 'button', text: label, 'aria-label': aria || null });
    b.addEventListener('click', () => copyText(getText(), b));
    return b;
  }
  function block(id, title, sub, copy, ...body) {
    return h('section', { class: 'block', 'aria-labelledby': id },
      h('div', { class: 'block-head' },
        h('h2', { id }, title, sub ? h('span', { class: 'sub', text: sub }) : null),
        copy),
      ...body);
  }

  function parseRange(time) {
    const m = /(\d+):(\d{2})\s*[-\u2013\u2014]\s*(\d+):(\d{2})/.exec(time || '');
    if (!m) return null;
    const a = Number(m[1]) * 60 + Number(m[2]);
    const b = Number(m[3]) * 60 + Number(m[4]);
    return b > a ? [a, b] : null;
  }

  function renderResult() {
    const c = state.current;
    const p = c.pack;
    const root = h('div', { class: 'result' });

    // toolbar
    const nameInput = h('input', { type: 'text', class: 'name', maxlength: '80', 'aria-label': 'Project name' });
    nameInput.value = c.name;
    nameInput.addEventListener('input', () => { c.name = nameInput.value; markEdited(); });
    ui.status = h('span', { class: 'dirty', 'aria-live': 'polite' });
    root.append(h('div', { class: 'result-bar' },
      nameInput, ui.status,
      h('button', { class: 'btn', type: 'button', text: 'Save project', onclick: saveProject }),
      h('button', { class: 'btn', type: 'button', text: 'Regenerate', onclick: regenerate }),
      copyBtn(() => allText(c), 'Copy all', 'Copy the whole pack')));
    updateStatusLabel();

    if (c.mode === 'demo') {
      root.append(h('p', { class: 'notice', text: c.input.language !== 'English'
        ? 'Demo result: built from templates, not AI, and written in English only. Ask the server owner to add an API key to get real AI in your language.'
        : 'Demo result: built from templates, not AI. Treat it as a starting structure. Add an API key on the server to switch to real AI.' }));
    }

    // hook
    root.append(block('s-hook', 'Opening hook', null, copyBtn(() => toText.hook(p), 'Copy', 'Copy hook'),
      bindText(p, 'hook', 'edit-hook', { label: 'Opening hook' })));

    // script with proportional timeline
    const beats = [];
    const strip = h('div', { class: 'strip', role: 'group', 'aria-label': 'Script timeline. Select a section to jump to it.' });
    function rebuildStrip() {
      const ranges = p.script.map((r) => parseRange(r.time));
      const ok = ranges.every(Boolean);
      strip.replaceChildren(...p.script.map((r, i) => {
        const dur = ok ? ranges[i][1] - ranges[i][0] : 1;
        const b = h('button', { type: 'button', text: r.time.split(/[-\u2013\u2014]/)[0], title: r.time + ' ' + clip(r.voiceover, 60),
          'aria-label': `Jump to ${r.time}`, onclick: () => {
            const el = beats[i]; if (!el) return;
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
          } });
        b.style.flex = `${dur} 1 0`;
        return b;
      }));
    }
    const scriptRows = p.script.map((row, i) => {
      const el = h('div', { class: 'beat' },
        bindText(row, 'time', 'edit-time', { label: 'Time range', onChange: rebuildStrip }),
        h('div', { class: 'beat-body' },
          h('span', { class: 'labels', text: 'On screen' }), bindText(row, 'visual', '', { label: 'On-screen action' }),
          h('span', { class: 'labels', text: 'Voiceover' }), bindText(row, 'voiceover', '', { label: 'Voiceover' })));
      beats[i] = el;
      return el;
    });
    rebuildStrip();
    root.append(block('s-script', 'Script', `${c.input.duration} seconds`, copyBtn(() => toText.script(p), 'Copy', 'Copy script'),
      strip, ...scriptRows));

    // titles
    root.append(block('s-titles', 'Title options', 'five to test', copyBtn(() => toText.titles(p), 'Copy all', 'Copy all titles'),
      h('div', {}, p.titles.map((_, i) => h('div', { class: 'title-row' },
        bindText(p.titles, i, '', { label: `Title option ${i + 1}` }),
        copyBtn(() => p.titles[i], 'Copy', `Copy title ${i + 1}`))))));

    // caption + hashtags
    const hashArea = h('textarea', { class: 'edit', rows: '1', 'aria-label': 'Hashtags' });
    hashArea.value = p.hashtags.join(' ');
    hashArea.addEventListener('input', () => {
      p.hashtags = hashArea.value.split(/[\s,]+/).filter(Boolean).map((t) => (t.startsWith('#') ? t : '#' + t));
      autosize(hashArea); markEdited();
    });
    root.append(block('s-caption', 'Caption and hashtags', c.input.platform,
      copyBtn(() => `${p.caption}\n\n${p.hashtags.join(' ')}`, 'Copy both', 'Copy caption and hashtags'),
      h('div', { class: 'split' },
        h('div', {}, h('div', { class: 'sub-head' }, h('h3', { text: 'Caption' }), copyBtn(() => p.caption, 'Copy', 'Copy caption')),
          bindText(p, 'caption', '', { label: 'Caption' })),
        h('div', {}, h('div', { class: 'sub-head' }, h('h3', { text: 'Hashtags' }), copyBtn(() => p.hashtags.join(' '), 'Copy', 'Copy hashtags')),
          hashArea))));

    // music + sfx
    const musicArea = h('textarea', { class: 'edit', rows: '1', 'aria-label': 'Music suggestions, one per line' });
    musicArea.value = p.music.join('\n');
    musicArea.addEventListener('input', () => { p.music = musicArea.value.split('\n').map((s) => s.trim()).filter(Boolean); autosize(musicArea); markEdited(); });
    root.append(block('s-sound', 'Music and sound effects', null,
      copyBtn(() => `Music:\n${toText.music(p)}\n\nSound effects:\n${toText.sfx(p)}`, 'Copy both', 'Copy music and sound effects'),
      h('div', { class: 'split' },
        h('div', {}, h('div', { class: 'sub-head' }, h('h3', { text: 'Music' }), copyBtn(() => toText.music(p), 'Copy', 'Copy music')), musicArea),
        h('div', {}, h('div', { class: 'sub-head' }, h('h3', { text: 'Sound effects' }), copyBtn(() => toText.sfx(p), 'Copy', 'Copy sound effects')),
          h('div', {}, p.sfx.map((s) => h('div', { class: 'sfx-row' },
            bindText(s, 'time', 'edit-time', { label: 'Sound effect time' }), bindText(s, 'sound', '', { label: 'Sound effect' }))))))));

    // editing blueprint
    root.append(block('s-edit', 'Editing blueprint', 'for DaVinci Resolve', copyBtn(() => toText.editing(p), 'Copy', 'Copy editing blueprint'),
      h('div', {}, p.editing.map((s) => h('div', { class: 'step' },
        bindText(s, 'page', 'page', { label: 'DaVinci Resolve page' }),
        h('div', { class: 'step-body' },
          bindText(s, 'title', 'edit-title', { label: 'Step title' }),
          bindText(s, 'detail', '', { label: 'Step detail' })))))));

    return root;
  }

  // ---------- rail (mobile drawer) ----------
  function openRail() {
    $('#rail').classList.add('open'); $('#scrim').hidden = false;
    $('#menuBtn').setAttribute('aria-expanded', 'true');
    $('#searchInput').focus();
  }
  function closeRail() {
    $('#rail').classList.remove('open'); $('#scrim').hidden = true;
    $('#menuBtn').setAttribute('aria-expanded', 'false');
  }
  function setTab(tab) {
    state.tab = tab;
    $('#tabProjects').setAttribute('aria-selected', String(tab === 'projects'));
    $('#tabHistory').setAttribute('aria-selected', String(tab === 'history'));
    renderLibrary();
  }

  // ---------- boot ----------
  async function init() {
    const reachable = await loadStatus();
    const opts = (state.status && state.status.options) || {
      platforms: ['TikTok', 'Instagram Reels', 'YouTube Shorts', 'Facebook Reels'],
      tones: ['Cinematic', 'Energetic', 'Educational', 'Funny', 'Emotional', 'Mysterious', 'Professional'],
      languages: ['English'], durations: [15, 30, 45, 60, 90],
    };
    const prefs = load(KEY_PREFS, {});
    const pick = (v, list, d) => (list.map(String).includes(String(v)) ? v : d);
    chipGroup($('#platformChips'), 'platform', opts.platforms, pick(prefs.platform, opts.platforms, opts.platforms[0]));
    chipGroup($('#toneChips'), 'tone', opts.tones, pick(prefs.tone, opts.tones, opts.tones[0]));
    chipGroup($('#durationChips'), 'duration', opts.durations, pick(prefs.duration, opts.durations, 30), (d) => `${d}s`);
    $('#language').replaceChildren(...opts.languages.map((l) => h('option', { value: l, text: l })));
    $('#language').value = pick(prefs.language, opts.languages, 'English');
    updateDemoNote();
    updateIdeaCount();

    $('#briefForm').addEventListener('submit', onSubmit);
    $('#idea').addEventListener('input', () => { updateIdeaCount(); if ($('#ideaError').textContent) setIdeaError(''); });
    $('#idea').addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') $('#briefForm').requestSubmit(); });
    $('#language').addEventListener('change', updateDemoNote);
    $('#newBtn').addEventListener('click', newPack);
    $('#tabProjects').addEventListener('click', () => setTab('projects'));
    $('#tabHistory').addEventListener('click', () => setTab('history'));
    $('#searchInput').addEventListener('input', (e) => { state.query = e.target.value; renderLibrary(); });
    $('#menuBtn').addEventListener('click', openRail);
    $('#railClose').addEventListener('click', closeRail);
    $('#scrim').addEventListener('click', closeRail);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeRail(); });
    window.addEventListener('resize', autosizeAll);

    render();
    if (!reachable) {
      state.error = { message: 'The VELNOR STUDIO server did not answer. Start it with "npm start" and reload this page.' };
      state.view = 'error';
      state.lastInput = null;
      render();
    }
  }
  init();
})();
