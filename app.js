const platformGroups = {
  Development: ['GitHub', 'GitLab', 'Gitee', 'Hugging Face', 'Tailscale'],
  'AI & Models': ['OpenAI', 'OpenRouter', 'NVIDIA AI', 'AWS Bedrock', 'Bailian', 'BigModel', 'DeepSeek', 'Ollama'],
  Cloud: ['Cloudflare', 'AWS', 'Tencent Cloud', 'Alibaba Cloud', 'Huawei Cloud', 'DNSPod'],
  'Bots & Payments': ['Discord', 'Twitch', 'Stripe', 'QQ Bot']
};
const alphabetical = (a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' });
const platforms = [...new Set(Object.values(platformGroups).flat())].sort(alphabetical);
const platformIcons = {
  'Alibaba Cloud': 'cloud', AWS: 'aws', 'AWS Bedrock': 'aws', Bailian: 'cloud', BigModel: 'brain',
  Cloudflare: 'cloudflare', DeepSeek: 'brain', Discord: 'discord', DNSPod: 'globe',
  Gitee: 'gitee', GitHub: 'github', GitLab: 'gitlab', 'Huawei Cloud': 'cloud',
  'Hugging Face': 'hugging-face', 'NVIDIA AI': 'microchip', Ollama: 'robot',
  OpenAI: 'openai', OpenRouter: 'route', 'QQ Bot': 'qq', Stripe: 'stripe',
  Tailscale: 'network-wired', 'Tencent Cloud': 'cloud', Twitch: 'twitch'
};
const themeQuery = window.matchMedia('(prefers-color-scheme: dark)');
let themePreference = ['system', 'light', 'dark'].includes(localStorage.getItem('secret-store-theme')) ? localStorage.getItem('secret-store-theme') : 'system';
const effectiveTheme = () => themePreference === 'system' ? (themeQuery.matches ? 'dark' : 'light') : themePreference;
function applyTheme() { document.documentElement.dataset.theme = effectiveTheme(); if (window.vault?.setTheme) window.vault.setTheme(themePreference).catch(() => {}); }
const fa = name => `<span class="fa-icon fa-${name}" aria-hidden="true"></span>`;
const themeButton = () => `<button class="iconbtn theme-toggle" id="theme-toggle" type="button" aria-label="Switch to ${effectiveTheme() === 'dark' ? 'light' : 'dark'} mode" title="Switch to ${effectiveTheme() === 'dark' ? 'light' : 'dark'} mode">${fa(effectiveTheme() === 'dark' ? 'sun' : 'moon')}</button>`;
function updateThemeButton() { const button = document.getElementById('theme-toggle'); if (!button) return; button.innerHTML = fa(effectiveTheme() === 'dark' ? 'sun' : 'moon'); button.setAttribute('aria-label', `Switch to ${effectiveTheme() === 'dark' ? 'light' : 'dark'} mode`); button.title = button.getAttribute('aria-label'); }
function bindThemeToggle() { document.getElementById('theme-toggle')?.addEventListener('click', () => { themePreference = effectiveTheme() === 'dark' ? 'light' : 'dark'; localStorage.setItem('secret-store-theme', themePreference); applyTheme(); updateThemeButton(); }); }
const state = { status: null, entries: [], selected: null, category: 'All keys', tag: '', search: '', modal: false, newPlatform: '', reveal: false, toast: '', testing: false, testMessage: '', lastActive: Date.now() };
const app = document.getElementById('app');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const siteIcon = platform => fa(platformIcons[platform] || 'key');
const icon = platform => { const name = String(platform || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'); return `<span class="logo logo-${esc(name)}">${siteIcon(platform)}</span>`; };
const expiry = entry => {
  if (!entry.expiresAt) return 'No expiration set';
  const days = Math.ceil((new Date(entry.expiresAt + 'T23:59:59').getTime() - Date.now()) / 86400000);
  return days < 0 ? 'Expired' : days === 0 ? 'Expires today' : days <= 30 ? `Expires in ${days} day${days === 1 ? '' : 's'}` : `Expires ${entry.expiresAt}`;
};
const expiring = entry => entry.expiresAt && (new Date(entry.expiresAt + 'T23:59:59').getTime() - Date.now()) < 31 * 86400000;
const selected = () => state.entries.find(x => x.id === state.selected);
const brand = () => '<div class="brand"><img class="brandmark" src="assets/icon.svg" alt=""><span>secret store</span></div>';
const api = window.vault || {
  async request(path, body) {
    const response = await fetch('/api/' + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF': '1' }, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) { if (response.status === 401 && path !== 'unlock' && state.status?.unlocked) clearVaultState(); throw new Error(data.error || 'Request failed'); }
    return data;
  },
  status() { return this.request('status'); }, setup(password) { return this.request('setup', { password }); }, unlock(password) { return this.request('unlock', { password }); },
  biometricUnlock() { throw new Error('Biometric unlock is available in the desktop app'); },
  enableBiometric() { throw new Error('Biometric unlock is available in the desktop app'); },
  disableBiometric() { throw new Error('Biometric unlock is available in the desktop app'); },
  lock() { return this.request('lock', {}); }, list() { return this.request('list'); }, save(entry) { return this.request('save', entry); },
  delete(id) { return this.request('delete', { id }); }, test(entry) { return this.request('test', entry); },
  async copy(value) { await navigator.clipboard.writeText(value); setTimeout(async () => { try { if (await navigator.clipboard.readText() === value) await navigator.clipboard.writeText(''); } catch {} }, 30000); return true; },
  onLocked() { return () => {}; }
};
function renderAuth() {
  const setup = !state.status?.configured;
  app.innerHTML = `<div class="auth"><div class="auth-card"><div class="auth-top">${brand()}${themeButton()}</div><h1>${setup ? 'Create your private vault' : 'Welcome back'}</h1><p>${setup ? 'Your keys are encrypted before they are stored. Choose a strong password to get started.' : 'Enter your password to unlock your keys.'}</p>
    <form id="auth-form"><label class="formlabel" for="password">Vault password</label><input class="textinput" id="password" type="password" minlength="${setup ? 12 : 1}" autocomplete="${setup ? 'new-password' : 'current-password'}" required placeholder="${setup ? 'At least 12 characters' : 'Enter your password'}">
    ${setup ? '<label class="formlabel" for="confirm">Confirm password</label><input class="textinput" id="confirm" type="password" autocomplete="new-password" required placeholder="Enter it again">' : ''}
    ${setup && state.status?.biometricSupported ? '<label class="auth-choice"><input type="checkbox" id="setup-biometric"> Enable Touch ID after setup</label>' : ''}
    <div id="auth-error" class="error" role="alert"></div><button class="primary" type="submit">${setup ? 'Create vault' : 'Unlock vault'}</button></form>
    ${state.status?.biometricAvailable ? '<div class="auth-foot"><button id="biometric">Unlock with Touch ID</button></div>' : `<div class="auth-foot">Private by design · ${window.vault ? 'Encrypted on this device' : 'Encrypted in PostgreSQL'}</div>`}</div></div>`;
  document.getElementById('auth-form').addEventListener('submit', async event => {
    event.preventDefault();
    const password = document.getElementById('password').value;
    const error = document.getElementById('auth-error');
    if (setup && password !== document.getElementById('confirm').value) { error.textContent = 'Passwords do not match'; return; }
    try {
      if (setup) { const biometric = document.getElementById('setup-biometric')?.checked; state.status = await api.setup(password); state.entries = []; if (biometric) { try { state.status = await api.enableBiometric(); } catch (e) { showToast(e.message); } } }
      else state.entries = await api.unlock(password);
      state.status.unlocked = true; render();
    } catch (e) { error.textContent = e.message; }
  });
  document.getElementById('biometric')?.addEventListener('click', async () => { try { state.entries = await api.biometricUnlock(); state.status.unlocked = true; render(); } catch (e) { document.getElementById('auth-error').textContent = e.message; } });
  bindThemeToggle();
}
function filtered() {
  const q = state.search.toLocaleLowerCase();
  return state.entries.filter(entry => {
    if (state.category === 'Expiring soon' && !expiring(entry)) return false;
    if (state.category !== 'All keys' && state.category !== 'Expiring soon' && entry.platform !== state.category) return false;
    if (state.tag && !entry.tags.includes(state.tag)) return false;
    return !q || [entry.platform, entry.label, entry.keyId, entry.email, ...entry.tags].some(value => String(value).toLocaleLowerCase().includes(q));
  });
}
function sidebar() {
  const item = (name, glyph, count) => `<button class="sideitem ${state.category === name ? 'active' : ''}" data-category="${esc(name)}"><span class="sideicon">${glyph}</span>${esc(name)}<span class="count">${count}</span></button>`;
  const tags = [...new Set(state.entries.flatMap(x => x.tags))].sort(alphabetical).slice(0, 24);
  const counts = new Map(); state.entries.forEach(entry => counts.set(entry.platform, (counts.get(entry.platform) || 0) + 1));
  return `<aside class="sidebar"><div class="side-caption">WORKSPACE</div>${item('All keys', fa('layer-group'), state.entries.length)}${item('Expiring soon', fa('clock'), state.entries.filter(expiring).length)}
    ${Object.keys(platformGroups).sort(alphabetical).map(group => `<div class="side-caption">${esc(group.toUpperCase())}</div>${platformGroups[group].slice().sort(alphabetical).map(name => item(name, siteIcon(name), counts.get(name) || 0)).join('')}`).join('')}
    <div class="side-caption">OTHER</div>${[...new Set(state.entries.map(x => x.platform).filter(x => !platforms.includes(x)))].sort(alphabetical).map(name => item(name, siteIcon(name), counts.get(name) || 0)).join('')}
    ${tags.length ? `<div class="side-caption">TAGS</div><div class="side-tags">${tags.map(tag => `<button class="tag-filter ${state.tag === tag ? 'active' : ''}" data-tag="${esc(tag)}"># ${esc(tag)}</button>`).join('')}</div>` : ''}
    <div class="side-bottom">${state.status?.biometricSupported ? `<button class="sideitem" id="biometric-settings"><span class="sideicon">${fa('fingerprint')}</span>Touch ID settings</button>` : ''}<div class="side-note">${window.vault ? 'Encrypted on this device.' : 'Encrypted before PostgreSQL storage.'} Clipboard clears after 30 seconds when permitted.</div></div></aside>`;
}
function listPane() {
  const entries = filtered();
  const heading = state.search ? 'Search results' : state.category;
  const suggestions = state.search ? platforms.filter(name => name.toLocaleLowerCase().includes(state.search.toLocaleLowerCase()) && !entries.some(entry => entry.platform === name)).slice(0, 5) : [];
  return `<section class="list-pane"><div class="list-head"><div><p class="eyebrow">YOUR VAULT</p><h1>${esc(heading)}</h1><p class="subhead">${entries.length} key${entries.length === 1 ? '' : 's'}${state.tag ? ' · #' + esc(state.tag) : ''}</p></div><button class="addbtn" id="add">+ New key</button></div>
    <div class="sectionline">SAVED KEYS</div><div class="entry-list">${entries.length ? entries.map(entry => `<button class="entry ${state.selected === entry.id ? 'active' : ''}" data-entry="${esc(entry.id)}">${icon(entry.platform)}<span class="entry-main"><span class="entry-title">${esc(entry.label)}</span><span class="entry-sub">${esc(entry.platform)} · ${esc(entry.email || entry.keyId || 'API key')}</span></span>${expiring(entry) ? '<span class="entry-expiry"></span>' : ''}<span class="entry-arrow">›</span></button>`).join('') : !suggestions.length ? '<div class="empty"><div class="empty-icon">◇</div><h2>No keys here yet</h2><p>Add a key or try a different search.</p><button class="addbtn" id="empty-add">+ Add your first key</button></div>' : ''}${suggestions.length ? `<div class="sectionline suggestion-caption">APPLICATIONS · QUICK ADD</div>${suggestions.map(name => `<button class="entry" data-new-platform="${esc(name)}">${icon(name)}<span class="entry-main"><span class="entry-title">${esc(name)}</span><span class="entry-sub">Add a new key</span></span><span class="entry-arrow">＋</span></button>`).join('')}` : ''}</div>
    <div class="list-footer">All secrets are encrypted at rest</div></section>`;
}
function detailPane() {
  const entry = selected();
  if (!entry) return '<main class="detail"><div class="empty"><div class="empty-icon">✦</div><h2>Your keys, in one quiet place</h2><p>Select a key to see its details, or add one to get started.</p><button class="addbtn" id="detail-add">+ New key</button></div></main>';
  const expiryText = expiry(entry);
  const expiryClass = expiryText === 'Expired' ? 'bad' : expiring(entry) ? 'warn' : '';
  return `<main class="detail"><div class="detail-wrap"><div class="detail-top"><div class="detail-identity">${icon(entry.platform)}<div><h2 class="detail-title">${esc(entry.label)}</h2><p class="detail-sub">${esc(entry.platform)} · Updated ${new Date(entry.updatedAt).toLocaleDateString()}</p></div></div><div class="detail-actions"><button class="outlined" id="edit">Edit</button></div></div>
    <div class="status-row"><span class="pill ${expiryClass}">● ${esc(expiryText)}</span>${entry.tags.map(tag => `<span class="tag"># ${esc(tag)}</span>`).join('')}</div>
    <section class="detail-section"><h3>KEY DETAILS</h3><div class="fields"><div><span class="field-label">Platform</span><span class="field-value">${esc(entry.platform)}</span></div><div><span class="field-label">Key ID</span><span class="field-value">${esc(entry.keyId || '—')}</span></div><div><span class="field-label">Email / Account</span><span class="field-value">${esc(entry.email || '—')}</span></div><div><span class="field-label">Environment variable</span><span class="field-value">${esc(envName(entry))}</span></div></div></section>
    <section class="detail-section"><h3>SECRET KEY</h3><div class="secretbox"><code>${state.reveal ? esc(entry.secret) : '•••• •••• •••• •••• •••• ••••'}</code><button id="reveal">${state.reveal ? 'Hide' : 'Show'}</button><button id="copy-plain">Copy</button></div><div class="copy-options"><button id="copy-env">⎘ Copy as .env</button><button id="copy-json">⎘ Copy as JSON</button></div></section>
    <section class="detail-section"><h3>LIFECYCLE</h3><div class="lifecycle"><div><strong>${esc(expiryText)}</strong><p>${entry.expiresAt ? 'Expiration reminder appears 30 days before expiry.' : 'Add an expiration date to track rotation.'}</p></div><button class="outlined" id="edit-expiry">Manage</button></div></section>
    <section class="detail-section"><h3>CONNECTION TEST</h3><div class="test-row"><button class="outlined" id="test" ${state.testing ? 'disabled' : ''}>${state.testing ? 'Testing…' : 'Test API key'}</button><span class="test-message">${esc(state.testMessage || 'A read-only request checks this key when supported.')}</span></div></section>
    ${entry.note ? `<section class="detail-section"><h3>NOTES</h3><div class="field-value">${esc(entry.note)}</div></section>` : ''}</div></main>`;
}
function envName(entry) { if (/^[A-Z_][A-Z0-9_]*$/.test(entry.envName)) return entry.envName; const base = String(entry.platform || 'API').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, ''); return (base && /^[A-Z_]/.test(base) ? base : 'API_' + base) + '_API_KEY'; }
function showToast(message) { state.toast = message; document.querySelector('.toast')?.remove(); const el = document.createElement('div'); el.className = 'toast'; el.textContent = message; document.body.append(el); setTimeout(() => el.remove(), 2700); }
function clearVaultState() { state.status.unlocked = false; state.entries = []; state.selected = null; state.reveal = false; state.modal = false; state.search = ''; state.testMessage = ''; render(); }
async function copy(format) {
  const entry = selected(); if (!entry) return;
  const value = format === 'env' ? `${envName(entry)}=${JSON.stringify(entry.secret)}` : format === 'json' ? JSON.stringify({ [envName(entry)]: entry.secret }, null, 2) : entry.secret;
  try { await api.copy(value); showToast(format === 'plain' ? 'Key copied. Clipboard clears in 30 seconds.' : `Copied as ${format.toUpperCase()}`); } catch (e) { showToast(e.message); }
}
function render() {
  if (!state.status?.unlocked) { renderAuth(); return; }
  const current = filtered();
  if (!current.some(x => x.id === state.selected)) state.selected = current[0]?.id || null;
  app.innerHTML = `<div class="shell"><header class="top">${brand()}<label class="search">${fa('magnifying-glass')}<input id="search" placeholder="Search apps, keys, accounts, tags…" value="${esc(state.search)}" autocomplete="off"><kbd>⌘ K</kbd></label><div class="top-right">${themeButton()}<button class="iconbtn" id="lock" title="Lock vault" aria-label="Lock vault">${fa('lock')}</button><span class="avatar">SS</span></div></header>${sidebar()}${listPane()}${detailPane()}</div>${state.modal ? editorMarkup() : ''}`;
  bind();
  bindThemeToggle();
}
function editorMarkup() {
  const entry = state.modal === 'new' ? { platform: state.newPlatform } : selected() || {};
  const option = name => `<option value="${esc(name)}" ${entry.platform === name ? 'selected' : ''}>${esc(name)}</option>`;
  return `<div class="modal-backdrop" id="backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><div><h2 id="modal-title">${state.modal === 'new' ? 'Add a key' : 'Edit key'}</h2><p>Keep the details you need, right where you need them.</p></div><button class="iconbtn" id="close-modal">✕</button></div><form id="key-form"><div class="formgrid">
    <div><label class="formlabel" for="platform">Platform</label><select class="select" id="platform"><option value="Custom">Custom application</option>${platforms.map(option).join('')}</select></div>
    <div><label class="formlabel" for="custom-platform">Custom application name</label><input class="textinput" id="custom-platform" maxlength="80" placeholder="Optional" value="${platforms.includes(entry.platform) ? '' : esc(entry.platform || '')}"></div>
    <div class="span2"><label class="formlabel" for="label">Key name *</label><input class="textinput" id="label" maxlength="120" required placeholder="e.g. Production API key" value="${esc(entry.label || '')}"></div>
    <div><label class="formlabel" for="key-id">Key ID</label><input class="textinput" id="key-id" value="${esc(entry.keyId || '')}" placeholder="Optional"></div>
    <div><label class="formlabel" for="email">Email / Account</label><input class="textinput" id="email" value="${esc(entry.email || '')}" placeholder="Optional"></div>
    <div class="span2"><label class="formlabel" for="secret">Secret key *</label><input class="textinput" id="secret" type="password" required value="${esc(entry.secret || '')}" placeholder="Paste your key"></div>
    <div><label class="formlabel" for="env-name">Environment variable</label><input class="textinput" id="env-name" value="${esc(entry.envName || '')}" placeholder="e.g. OPENAI_API_KEY"></div>
    <div><label class="formlabel" for="expires">Expiration date</label><input class="textinput" id="expires" type="date" value="${esc(entry.expiresAt || '')}"></div>
    <div class="span2"><label class="formlabel" for="tags">Tags</label><input class="textinput" id="tags" value="${esc((entry.tags || []).join(', '))}" placeholder="e.g. China, production, DNS (comma separated)"></div>
    <div class="span2"><label class="formlabel" for="note">Notes</label><textarea class="textarea" id="note" placeholder="Optional notes">${esc(entry.note || '')}</textarea></div></div>
    <div class="modal-actions">${state.modal === 'edit' ? '<button class="danger" type="button" id="delete">Delete key</button>' : '<span></span>'}<div class="modal-right"><button class="outlined" type="button" id="cancel">Cancel</button><button class="primary" type="submit">Save key</button></div></div><div id="form-error" class="error" role="alert"></div></form></div></div>`;
}
function bind() {
  document.querySelectorAll('[data-category]').forEach(el => el.addEventListener('click', () => { state.category = el.dataset.category; state.tag = ''; state.search = ''; state.reveal = false; render(); }));
  document.querySelectorAll('[data-tag]').forEach(el => el.addEventListener('click', () => { state.tag = state.tag === el.dataset.tag ? '' : el.dataset.tag; render(); }));
  document.querySelectorAll('[data-entry]').forEach(el => el.addEventListener('click', () => { state.selected = el.dataset.entry; state.reveal = false; state.testMessage = ''; render(); }));
  document.getElementById('search')?.addEventListener('input', event => { const start = event.target.selectionStart; state.search = event.target.value; state.category = 'All keys'; state.tag = ''; render(); const input = document.getElementById('search'); input.focus(); input.setSelectionRange(start, start); });
  ['add', 'empty-add', 'detail-add'].forEach(id => document.getElementById(id)?.addEventListener('click', () => { state.newPlatform = platforms.includes(state.category) ? state.category : ''; state.modal = 'new'; render(); document.getElementById('label')?.focus(); }));
  document.querySelectorAll('[data-new-platform]').forEach(el => el.addEventListener('click', () => { state.newPlatform = el.dataset.newPlatform; state.modal = 'new'; render(); document.getElementById('label')?.focus(); }));
  ['edit', 'edit-expiry'].forEach(id => document.getElementById(id)?.addEventListener('click', () => { state.modal = 'edit'; render(); }));
  document.getElementById('reveal')?.addEventListener('click', () => { state.reveal = !state.reveal; render(); });
  document.getElementById('copy-plain')?.addEventListener('click', () => copy('plain'));
  document.getElementById('copy-env')?.addEventListener('click', () => copy('env'));
  document.getElementById('copy-json')?.addEventListener('click', () => copy('json'));
  document.getElementById('test')?.addEventListener('click', async () => { state.testing = true; state.testMessage = ''; render(); try { state.testMessage = (await api.test(selected())).message; } catch (e) { state.testMessage = e.message; } state.testing = false; render(); });
  document.getElementById('lock')?.addEventListener('click', async () => { await api.lock(); clearVaultState(); });
  document.getElementById('biometric-settings')?.addEventListener('click', async () => { try { state.status = state.status.biometricAvailable ? await api.disableBiometric() : await api.enableBiometric(); showToast(state.status.biometricAvailable ? 'Touch ID enabled' : 'Touch ID disabled'); } catch (e) { showToast(e.message); } });
  document.getElementById('close-modal')?.addEventListener('click', closeModal);
  document.getElementById('cancel')?.addEventListener('click', closeModal);
  document.getElementById('backdrop')?.addEventListener('click', e => { if (e.target.id === 'backdrop') closeModal(); });
  document.getElementById('key-form')?.addEventListener('submit', saveEntry);
  document.getElementById('delete')?.addEventListener('click', async () => { if (!confirm('Delete this key? This cannot be undone.')) return; try { await api.delete(state.selected); state.entries = state.entries.filter(x => x.id !== state.selected); state.selected = null; closeModal(); showToast('Key deleted'); } catch (e) { showToast(e.message); } });
}
function closeModal() { state.modal = false; render(); }
async function saveEntry(event) {
  event.preventDefault();
  const value = id => document.getElementById(id).value.trim();
  const prior = state.modal === 'edit' ? selected() : {};
  const entry = { ...prior, platform: value('platform') === 'Custom' ? value('custom-platform') || 'Custom' : value('platform'), label: value('label'), keyId: value('key-id'), email: value('email'), secret: document.getElementById('secret').value, envName: value('env-name'), tags: value('tags').split(',').map(x => x.trim()).filter(Boolean), expiresAt: value('expires'), note: value('note') };
  try { const saved = await api.save(entry); state.entries = [saved, ...state.entries.filter(x => x.id !== saved.id)]; state.category = 'All keys'; state.search = ''; state.tag = ''; state.selected = saved.id; state.modal = false; render(); showToast('Key saved securely'); }
  catch (e) { document.getElementById('form-error').textContent = e.message; }
}
document.addEventListener('keydown', event => {
  state.lastActive = Date.now();
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); document.getElementById('search')?.focus(); }
  if (event.key === 'Escape' && state.modal) closeModal();
});
document.addEventListener('pointerdown', () => { state.lastActive = Date.now(); }, { passive: true });
setInterval(async () => { if (state.status?.unlocked && Date.now() - state.lastActive > 15 * 60 * 1000) { await api.lock(); clearVaultState(); } }, 30000);
api.onLocked?.(() => { if (state.status) clearVaultState(); });
themeQuery.addEventListener('change', () => { if (themePreference === 'system') { applyTheme(); updateThemeButton(); } });
applyTheme();
(async () => { try { state.status = await api.status(); document.body.dataset.platform = state.status.platform || 'web'; if (state.status.unlocked) state.entries = await api.list(); render(); } catch (e) { app.textContent = e.message; } })();
