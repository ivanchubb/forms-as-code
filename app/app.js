/* forms-as-code's shared application: trusted HTML resolution, rendering, data, and bulk workflows. */
(() => {
  const FORMAT_VERSION = '0.1.0';
  const FALLBACK_CONFIG = {
    siteName: 'forms-as-code',
    tagline: 'Portable form data, rendered with its versioned HTML template.',
    footer: 'Local prototype. Add a public template catalog or select local templates to begin.',
    sourceUrl: 'https://github.com/ivanchubb/forms-as-code',
    sourceLabel: 'View source on GitHub',
    favicon: './branding/favicon.svg',
    catalogs: []
  };
  const CATALOG_URL_KEY = 'forms-as-code:catalog-url';
  const SOURCES_KEY = 'forms-as-code:template-sources:v1';
  const THEME_KEY = 'forms-as-code:theme';
  const LOCAL_SOURCE_DB = 'forms-as-code-local-sources';
  const LOCAL_SOURCE_STORE = 'sources';
  const CATALOG_CACHE_PREFIX = 'forms-as-code:template-catalog:v1:';
  const LABEL_ROW_MARKER = 'FIELD LABELS - DO NOT EDIT';
  const EXAMPLE_ROW_MARKER = 'EXAMPLE - REPLACE OR DELETE';
  const templates = new Map();
  const launcher = document.querySelector('#launcher');
  const workspace = document.querySelector('#workspace');
  const templateSourceLabel = document.querySelector('#template-source-label');
  const sourceIndicator = document.querySelector('#source-indicator');
  const settingsButton = document.querySelector('#settings-button');
  const settingsPanel = document.querySelector('#settings-panel');
  const closeSettingsButton = document.querySelector('#close-settings');
  const sourceList = document.querySelector('#source-list');
  const addRemoteSourceButton = document.querySelector('#add-remote-source');
  const addLocalDirectoryButton = document.querySelector('#add-local-directory');
  const remoteSourceForm = document.querySelector('#remote-source-form');
  const newSourceUrl = document.querySelector('#new-source-url');
  const cancelRemoteSourceButton = document.querySelector('#cancel-remote-source');
  const themeToggle = document.querySelector('#theme-toggle');
  const catalogStatus = document.querySelector('#catalog-status');
  const localTemplateDirectory = document.querySelector('#local-template-directory');
  const templateSearch = document.querySelector('#template-search');
  const templateOptions = document.querySelector('#template-options');
  const templateHost = document.querySelector('#template-host');
  const toolbar = document.querySelector('#app-toolbar');
  const notice = document.querySelector('#template-notice');
  const appStatus = document.querySelector('#app-status');
  const submissionFile = document.querySelector('#submission-file');
  const dropZone = document.querySelector('#drop-zone');
  const siteName = document.querySelector('#site-name');
  const siteTagline = document.querySelector('#site-tagline');
  const siteFooter = document.querySelector('#site-footer');
  const sourceLinkWrap = document.querySelector('#source-link-wrap');
  const sourceLink = document.querySelector('#source-link');
  const siteFavicon = document.querySelector('#site-favicon');
  const encoder = new TextEncoder();
  let activeTemplate = null;
  let activeForm = null;
  let pendingWindow = null;
  let pendingSubmission = null;
  let catalogTemplates = [];
  let selectedTemplateKey = null;
  let sources = [];
  let siteConfig = FALLBACK_CONFIG;
  let draggedSourceId = null;

  function setAppState(state) { document.documentElement.dataset.appState = state; }
  function setStatus(message) {
    appStatus.textContent = message;
    const formStatus = document.querySelector('#form-status');
    if (formStatus) formStatus.textContent = message;
  }
  function setTemplateSourceLabel(label) {
    templateSourceLabel.textContent = label;
  }
  function setSourceHealth(state, message) {
    sourceIndicator.className = `source-indicator is-${state}`;
    sourceIndicator.title = message;
    sourceIndicator.setAttribute('aria-label', message);
  }
  function templateKey(reference) { return `${reference?.uri}@${reference?.version}`; }
  function normalizedFormCode(code) { return String(code || '').replace(/[\s-]+/g, '').toLocaleUpperCase(); }
  function formDesignation(code) { return code; }
  function templateDisplayName(template) {
    return `${formDesignation(template.code)} - ${template.title}${template.edition ? ` (${template.edition})` : ''}`;
  }
  function sourceId() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`; }
  function remoteSource(catalog, index) {
    const url = new URL(catalog.url, document.baseURI);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(`Catalog ${index + 1} must use a public HTTP(S) URL.`);
    return { id: sourceId(), type: 'remote', label: typeof catalog.label === 'string' && catalog.label.trim() ? catalog.label.trim() : url.hostname, url: url.href, status: 'loading', templates: [] };
  }
  function configuredSources() {
    if (!Array.isArray(siteConfig.catalogs)) throw new Error('site.config.json catalogs must be an array.');
    return siteConfig.catalogs.map(remoteSource);
  }
  async function loadSiteConfig() {
    try {
      const response = await fetch('./site.config.json', { credentials: 'same-origin', cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const config = await response.json();
      if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Configuration must be a JSON object.');
      siteConfig = { ...FALLBACK_CONFIG, ...config };
      configuredSources();
    } catch (error) {
      siteConfig = FALLBACK_CONFIG;
      console.warn(`Could not load site.config.json; using built-in defaults: ${error.message}`);
    }
    const name = typeof siteConfig.siteName === 'string' && siteConfig.siteName.trim() ? siteConfig.siteName.trim() : FALLBACK_CONFIG.siteName;
    siteName.textContent = name;
    siteTagline.textContent = typeof siteConfig.tagline === 'string' ? siteConfig.tagline : FALLBACK_CONFIG.tagline;
    siteFooter.textContent = typeof siteConfig.footer === 'string' ? siteConfig.footer : FALLBACK_CONFIG.footer;
    if (siteConfig.sourceUrl === false) sourceLinkWrap.hidden = true;
    else {
      try {
        const sourceUrl = new URL(typeof siteConfig.sourceUrl === 'string' ? siteConfig.sourceUrl : FALLBACK_CONFIG.sourceUrl);
        if (!['http:', 'https:'].includes(sourceUrl.protocol) || sourceUrl.username || sourceUrl.password) throw new Error('Source URL must use HTTP(S) without credentials.');
        sourceLink.href = sourceUrl.href;
        sourceLink.textContent = typeof siteConfig.sourceLabel === 'string' && siteConfig.sourceLabel.trim() ? siteConfig.sourceLabel.trim() : FALLBACK_CONFIG.sourceLabel;
      } catch (error) { sourceLinkWrap.hidden = true; console.warn(`Ignoring invalid source link configuration: ${error.message}`); }
    }
    document.title = name;
    try {
      const favicon = new URL(typeof siteConfig.favicon === 'string' ? siteConfig.favicon : FALLBACK_CONFIG.favicon, document.baseURI);
      if (favicon.origin !== window.location.origin || favicon.username || favicon.password || !/\.(svg|png|ico)$/i.test(favicon.pathname)) throw new Error('Favicon must be a same-origin SVG, PNG, or ICO file.');
      siteFavicon.href = favicon.href;
      siteFavicon.type = favicon.pathname.toLocaleLowerCase().endsWith('.svg') ? 'image/svg+xml' : favicon.pathname.toLocaleLowerCase().endsWith('.png') ? 'image/png' : 'image/x-icon';
    } catch (error) { console.warn(`Ignoring invalid favicon configuration: ${error.message}`); }
    const colorProperties = {
      primary: '--app-primary', primaryDark: '--app-primary-dark', accent: '--app-accent', headerText: '--app-header-text',
      darkText: '--app-dark-text', darkBackground: '--app-dark-background', darkSurface: '--app-dark-surface', darkBorder: '--app-dark-border',
      darkHover: '--app-dark-hover', darkDropZone: '--app-dark-drop-zone', darkDropZoneBorder: '--app-dark-drop-zone-border', darkMuted: '--app-dark-muted'
    };
    if (siteConfig.appearance && typeof siteConfig.appearance === 'object' && !Array.isArray(siteConfig.appearance)) {
      for (const [name, property] of Object.entries(colorProperties)) {
        const value = siteConfig.appearance[name];
        if (typeof value === 'string' && CSS.supports('color', value)) document.documentElement.style.setProperty(property, value);
      }
    }
  }
  function canonicalString(value) {
    for (let index = 0; index < value.length; index++) {
      const unit = value.charCodeAt(index);
      if (unit >= 0xd800 && unit <= 0xdbff) {
        const next = value.charCodeAt(++index);
        if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error('Integrity payload contains invalid Unicode.');
      } else if (unit >= 0xdc00 && unit <= 0xdfff) throw new Error('Integrity payload contains invalid Unicode.');
    }
    return JSON.stringify(value);
  }
  function canonicalize(value) {
    if (typeof value === 'string') return canonicalString(value);
    if (value === null || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${canonicalString(key)}:${canonicalize(value[key])}`).join(',')}}`;
    throw new Error('Integrity payload contains a value that cannot be canonicalized.');
  }
  function integrityPayload(submission) {
    const templateIdentity = { uri: submission.template.uri, version: submission.template.version };
    if (submission.template.sha256) templateIdentity.sha256 = submission.template.sha256;
    return { formatVersion: submission.formatVersion, template: templateIdentity, data: submission.data };
  }
  async function makeIntegrity(submission) {
    const bytes = new TextEncoder().encode(canonicalize(integrityPayload(submission)));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return { algorithm: 'SHA-256', canonicalization: 'RFC8785', digest: [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('') };
  }
  async function verifyIntegrity(submission) {
    if (!submission.integrity) throw new Error('Submission is missing its integrity digest.');
    if (submission.integrity.algorithm !== 'SHA-256' || submission.integrity.canonicalization !== 'RFC8785' || !/^[a-f0-9]{64}$/.test(submission.integrity.digest || '')) throw new Error('Submission integrity metadata is invalid or unsupported.');
    const expected = await makeIntegrity(submission);
    if (expected.digest !== submission.integrity.digest) throw new Error('Submission integrity check failed. Its covered content changed after it was locked.');
  }
  function readSources() {
    const queryUrl = new URLSearchParams(window.location.search).get('catalog');
    if (queryUrl) return [{ id: sourceId(), type: 'remote', label: 'URL catalog', url: queryUrl, status: 'loading', templates: [] }];
    try {
      const saved = JSON.parse(localStorage.getItem(SOURCES_KEY));
      if (Array.isArray(saved) && saved.length) return saved.filter(source => source && ['remote', 'local'].includes(source.type) && typeof source.id === 'string').map(source => ({ ...source, status: 'loading', templates: [] }));
      const legacy = localStorage.getItem(CATALOG_URL_KEY);
      if (legacy) return [{ id: sourceId(), type: 'remote', label: 'Remote catalog', url: legacy, status: 'loading', templates: [] }];
    } catch { /* Use the configured sources when storage is unavailable or invalid. */ }
    return configuredSources();
  }
  function saveSources() {
    const persistent = sources.map(({ id, type, label, url }) => ({ id, type, label, ...(type === 'remote' ? { url } : {}) }));
    try { localStorage.setItem(SOURCES_KEY, JSON.stringify(persistent)); } catch { /* Storage may be unavailable in private browsing. */ }
  }
  function openLocalSourceDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(LOCAL_SOURCE_DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(LOCAL_SOURCE_STORE, { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Local template storage is unavailable.'));
    });
  }
  async function localSourceRecord(method, value) {
    const database = await openLocalSourceDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(LOCAL_SOURCE_STORE, method === 'get' ? 'readonly' : 'readwrite');
      const store = transaction.objectStore(LOCAL_SOURCE_STORE);
      const request = method === 'put' ? store.put(value) : method === 'delete' ? store.delete(value) : store.get(value);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not access local template storage.'));
      transaction.oncomplete = () => database.close();
    });
  }
  function catalogCacheKey(url) { return `${CATALOG_CACHE_PREFIX}${url}`; }
  function validateCatalog(catalog, url) {
    if (!catalog || catalog.formatVersion !== '1' || !Array.isArray(catalog.templates)) throw new Error('Invalid template catalog.');
    const templates = [];
    const warnings = [];
    catalog.templates.forEach((template, index) => {
      try {
        if (!template || typeof template.uri !== 'string' || typeof template.version !== 'string' || typeof template.code !== 'string' || typeof template.path !== 'string') throw new Error('required identity metadata is missing');
        const path = new URL(template.path, url);
        if (path.origin !== new URL(url).origin || path.username || path.password || !path.pathname.toLocaleLowerCase().endsWith('.html')) throw new Error('template path is unsafe');
        const titlePresent = typeof template.title === 'string' && template.title.trim();
        const editionPresent = typeof template.edition === 'string' && template.edition.trim();
        if (!titlePresent) warnings.push(`Entry ${index + 1} (${template.code}): title is missing`);
        if (!editionPresent) warnings.push(`Entry ${index + 1} (${template.code}): edition is missing`);
        templates.push({ ...template, title: titlePresent ? template.title.trim() : formDesignation(template.code), edition: editionPresent ? template.edition.trim() : '', path: path.href, catalogOrigin: new URL(url).origin, titleDeclared: Boolean(titlePresent), editionDeclared: Boolean(editionPresent) });
      } catch (error) { warnings.push(`Entry ${index + 1}: ${error.message}`); }
    });
    return { templates, warnings };
  }
  function setCatalogTemplates(entries) {
    catalogTemplates = entries;
    templates.clear();
    for (const template of entries) templates.set(templateKey(template), template);
    selectedTemplateKey = null;
    updateTemplateOptions();
  }
  function mergeSources() {
    const merged = new Map();
    for (const source of [...sources].reverse()) for (const template of source.templates || []) merged.set(templateKey(template), template);
    setCatalogTemplates([...merged.values()]);
    updateSourceSummary();
    renderSources();
  }
  function updateSourceSummary() {
    const failures = sources.filter(source => source.status === 'error');
    const warnings = sources.filter(source => source.status === 'warning');
    const loading = sources.filter(source => source.status === 'loading');
    const remotes = sources.filter(source => source.type === 'remote');
    setTemplateSourceLabel(`${sources.length} source${sources.length === 1 ? '' : 's'}, ${catalogTemplates.length} forms`);
    if (loading.length) setSourceHealth('loading', `Loading and validating ${loading.length} template source${loading.length === 1 ? '' : 's'}.`);
    else if (failures.length && failures.length < sources.length) setSourceHealth('warning', `${sources.length - failures.length} source${sources.length - failures.length === 1 ? '' : 's'} loaded and ${failures.length} failed. ${failures.map(source => `${source.label}: ${source.message}`).join(' ')}`);
    else if (failures.length) setSourceHealth('error', `All ${failures.length} source${failures.length === 1 ? '' : 's'} failed. ${failures.map(source => `${source.label}: ${source.message}`).join(' ')}`);
    else if (warnings.length) setSourceHealth('warning', `${warnings.length} source${warnings.length === 1 ? '' : 's'} loaded with warnings. ${warnings.map(source => `${source.label}: ${source.message}`).join(' ')}`);
    else if (remotes.length) setSourceHealth('healthy', `Connected to and validated ${remotes.length} remote catalog${remotes.length === 1 ? '' : 's'}. ${catalogTemplates.length} forms are available.`);
    else setSourceHealth('local', `${catalogTemplates.length} validated local forms are available. No network connection is required.`);
  }
  function renderSources() {
    sourceList.replaceChildren(...sources.map((source, index) => {
      const row = document.createElement('div');
      row.className = `source-row is-${source.status}`; row.draggable = true; row.dataset.sourceId = source.id;
      const handle = document.createElement('span'); handle.className = 'drag-handle'; handle.textContent = '⋮⋮'; handle.title = 'Drag to change precedence';
      const details = document.createElement('div'); details.className = 'source-details';
      const name = document.createElement('strong'); name.textContent = `${index + 1}. ${source.label}`;
      let address;
      if (source.type === 'remote') {
        address = document.createElement('input'); address.type = 'url'; address.value = source.url; address.setAttribute('aria-label', `${source.label} catalog URL`);
        address.addEventListener('change', () => {
          try {
            const url = new URL(address.value.trim());
            if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('URL must be public HTTP(S).');
            source.url = url.href; source.label = url.hostname; saveSources(); loadRemoteSource(source);
          } catch (error) { source.status = 'error'; source.message = error.message; mergeSources(); }
        });
      } else {
        address = document.createElement('span'); address.textContent = `${source.label} - stored in this browser`;
      }
      const status = document.createElement('span'); status.className = 'source-status'; status.textContent = source.status === 'healthy' ? `${source.templates.length} forms` : source.message || source.status;
      details.append(name, address, status);
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove'; remove.addEventListener('click', () => removeSource(source.id));
      row.append(handle, details, remove);
      row.addEventListener('dragstart', () => { draggedSourceId = source.id; row.classList.add('is-dragging'); });
      row.addEventListener('dragend', () => { draggedSourceId = null; row.classList.remove('is-dragging'); });
      row.addEventListener('dragover', event => event.preventDefault());
      row.addEventListener('drop', event => { event.preventDefault(); reorderSource(draggedSourceId, source.id); });
      return row;
    }));
  }
  function reorderSource(sourceIdToMove, beforeId) {
    if (!sourceIdToMove || sourceIdToMove === beforeId) return;
    const from = sources.findIndex(source => source.id === sourceIdToMove);
    const to = sources.findIndex(source => source.id === beforeId);
    if (from < 0 || to < 0) return;
    const [source] = sources.splice(from, 1);
    sources.splice(to, 0, source);
    saveSources(); mergeSources();
  }
  async function removeSource(id) {
    const source = sources.find(item => item.id === id);
    if (source?.type === 'local') {
      for (const template of source.templates) URL.revokeObjectURL(template.path);
      try { await localSourceRecord('delete', id); } catch (error) { setStatus(`Removed the source, but could not clear its browser copy: ${error.message}`); }
    }
    sources = sources.filter(item => item.id !== id);
    saveSources(); mergeSources();
  }
  function parseLocalTemplate(html) {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const uri = parsed.querySelector('meta[name="forms-as-code:template-id"]')?.content;
    const version = parsed.querySelector('meta[name="forms-as-code:template-version"]')?.content;
    const code = parsed.querySelector('meta[name="forms-as-code:form-code"]')?.content;
    const declaredTitle = parsed.querySelector('meta[name="forms-as-code:form-title"]')?.content?.trim();
    const declaredEdition = parsed.querySelector('meta[name="forms-as-code:form-edition"]')?.content?.trim();
    if (!uri || !version || !code) throw new Error('required identity metadata is missing');
    const documentTitle = parsed.title.trim().replace(/^.+?\s+Form\s+[^-]+\s+-\s+/i, '');
    const template = { uri, version, code, title: declaredTitle || documentTitle || formDesignation(code), edition: declaredEdition || '', titleDeclared: Boolean(declaredTitle), editionDeclared: Boolean(declaredEdition), path: URL.createObjectURL(new Blob([html], { type: 'text/html' })), local: true };
    try { validateTemplateDocument(parsed, template); return template; }
    catch (error) { URL.revokeObjectURL(template.path); throw error; }
  }
  async function addLocalSource(files) {
    const entries = [];
    const storedTemplates = [];
    const failures = [];
    for (const file of files) {
      if (!file.name.toLocaleLowerCase().endsWith('.html') || file.name.toLocaleLowerCase() === 'latest.html') continue;
      try {
        const html = await file.text();
        entries.push(parseLocalTemplate(html)); storedTemplates.push({ name: file.webkitRelativePath || file.name, html });
      } catch (error) { failures.push(`${file.name}: ${error.message}`); }
    }
    const directory = files[0]?.webkitRelativePath?.split('/')[0] || 'Local directory';
    const metadataWarnings = entries.filter(template => !template.titleDeclared || !template.editionDeclared).length;
    const hasWarnings = failures.length || metadataWarnings;
    const warningParts = [`${entries.length} forms`];
    if (failures.length) warningParts.push(`${failures.length} invalid file${failures.length === 1 ? '' : 's'} skipped`);
    if (metadataWarnings) warningParts.push(`${metadataWarnings} missing optional display metadata`);
    const source = { id: sourceId(), type: 'local', label: directory, status: entries.length ? hasWarnings ? 'warning' : 'healthy' : 'error', message: entries.length ? warningParts.join('; ') : failures[0] || 'No valid HTML templates found.', templates: entries };
    sources.unshift(source); saveSources(); mergeSources();
    try { await localSourceRecord('put', { id: source.id, label: source.label, templates: storedTemplates }); }
    catch (error) { source.status = 'error'; source.message = `Loaded for this session, but could not save: ${error.message}`; mergeSources(); }
    const message = `Loaded ${entries.length} local form${entries.length === 1 ? '' : 's'}${failures.length ? `; rejected ${failures.length}` : ''}.`;
    catalogStatus.textContent = message; setStatus(message);
  }
  async function restoreLocalSource(source) {
    try {
      const record = await localSourceRecord('get', source.id);
      if (!record?.templates?.length) throw new Error('Stored templates were not found. Choose the directory again.');
      const failures = [];
      source.templates = record.templates.flatMap(template => {
        try { return [parseLocalTemplate(template.html)]; }
        catch (error) { failures.push(`${template.name}: ${error.message}`); return []; }
      });
      const metadataWarnings = source.templates.filter(template => !template.titleDeclared || !template.editionDeclared).length;
      if (!source.templates.length) throw new Error(failures[0] || 'No valid templates were restored.');
      source.status = failures.length || metadataWarnings ? 'warning' : 'healthy';
      source.message = `${source.templates.length} forms${failures.length ? `; ${failures.length} invalid skipped` : ''}${metadataWarnings ? `; ${metadataWarnings} missing optional display metadata` : ''}`;
    } catch (error) { source.status = 'error'; source.message = error.message; source.templates = []; }
    mergeSources();
  }
  async function loadRemoteSource(source) {
    source.status = 'loading'; source.message = 'Connecting and validating'; renderSources(); updateSourceSummary();
    try {
      const parsedUrl = new URL(source.url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) throw new Error('URL must be public HTTP(S).');
      source.url = parsedUrl.href;
      const response = await fetch(source.url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Request failed (${response.status}).`);
      const catalog = await response.json();
      const result = validateCatalog(catalog, source.url);
      if (!result.templates.length) throw new Error(result.warnings[0] || 'Catalog contains no valid templates.');
      source.templates = result.templates;
      source.status = result.warnings.length ? 'warning' : 'healthy';
      source.message = result.warnings.length ? `${source.templates.length} forms; ${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'}: ${result.warnings[0]}` : `${source.templates.length} forms`;
      try { localStorage.setItem(catalogCacheKey(source.url), JSON.stringify(catalog)); } catch { /* Continue without a browser cache. */ }
    } catch (error) {
      source.status = 'error'; source.message = error.message; source.templates = [];
      try {
        const cached = localStorage.getItem(catalogCacheKey(source.url));
        if (cached) source.templates = validateCatalog(JSON.parse(cached), source.url).templates;
      } catch { /* Invalid or unavailable cache. */ }
    }
    mergeSources();
  }
  async function loadSources() {
    renderSources(); updateSourceSummary();
    await Promise.all(sources.map(source => source.type === 'remote' ? loadRemoteSource(source) : restoreLocalSource(source)));
    const failures = sources.filter(source => source.status === 'error');
    const warnings = sources.filter(source => source.status === 'warning');
    const message = failures.length || warnings.length ? `Loaded ${catalogTemplates.length} forms with ${warnings.length} source warning${warnings.length === 1 ? '' : 's'} and ${failures.length} source failure${failures.length === 1 ? '' : 's'}. Open settings for details.` : `Loaded ${catalogTemplates.length} forms from ${sources.length} source${sources.length === 1 ? '' : 's'}.`;
    catalogStatus.textContent = message; setStatus(message);
  }
  function resolveSubmission(submission) {
    if (!submission || typeof submission !== 'object') throw new Error('Submission must be a JSON object.');
    if (submission.formatVersion !== FORMAT_VERSION) throw new Error('Unsupported forms-as-code submission version.');
    if (typeof submission.id !== 'string') throw new Error('Submission is missing its ID.');
    if (typeof submission.locked !== 'boolean') throw new Error('Submission must contain a boolean locked field.');
    if (!submission.data || typeof submission.data !== 'object' || Array.isArray(submission.data)) throw new Error('Submission data must be a JSON object.');
    const template = templates.get(templateKey(submission.template));
    if (!template) throw new Error('This forms-as-code app does not have the referenced trusted HTML template.');
    return template;
  }
  function pathParts(path) { return path.split('.'); }
  function getAt(object, path) { return pathParts(path).reduce((value, part) => value == null ? undefined : value[part], object); }
  function arrayPaths(paths) {
    const children = new Map();
    for (const path of paths) {
      const parts = pathParts(path);
      for (let index = 0; index < parts.length - 1; index++) {
        const parent = parts.slice(0, index + 1).join('.');
        if (!children.has(parent)) children.set(parent, new Set());
        children.get(parent).add(parts[index + 1]);
      }
    }
    const arrays = new Set();
    for (const [path, names] of children) {
      if (!names.has('0') || ![...names].every(name => /^\d+$/.test(name))) continue;
      const indexes = [...names].map(Number).sort((left, right) => left - right);
      if (indexes.some((value, index) => value !== index)) throw new Error(`Array binding ${path} must use contiguous zero-based indexes.`);
      arrays.add(path);
    }
    return arrays;
  }
  function setAt(object, path, value, arrays = new Set()) {
    const parts = pathParts(path);
    let current = object;
    for (let index = 0; index < parts.length - 1; index++) {
      const part = parts[index];
      const parent = parts.slice(0, index + 1).join('.');
      if (current[part] == null) current[part] = arrays.has(parent) ? [] : {};
      current = current[part];
    }
    current[parts.at(-1)] = value;
  }
  function safeName(value) {
    return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 48) || 'unknown';
  }
  function makeId() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
      const random = Math.random() * 16 | 0;
      return (char === 'x' ? random : (random & 3 | 8)).toString(16);
    });
  }
  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function initializeForm(template, meta) {
    const form = templateHost.querySelector('form[data-forms-as-code-form]');
    let controls = [];
    const status = document.querySelector('#form-status');
    const lockButton = document.querySelector('#lock-submission');
    const groups = new Map();
    let bindingArrayPaths = new Set();
    let locked = false;

    function setDataAt(data, path, value) { setAt(data, path, value, bindingArrayPaths); }
    function rebuildBindings() {
      controls = [...form.querySelectorAll('[data-forms-as-code]')];
      groups.clear();
      for (const control of controls) {
        if (!groups.has(control.dataset.formsAsCode)) groups.set(control.dataset.formsAsCode, []);
        groups.get(control.dataset.formsAsCode).push(control);
      }
      bindingArrayPaths = arrayPaths(groups.keys());
    }
    function repeatParts(name) {
      return {
        host: form.querySelector(`[data-forms-as-code-repeat-pages="${name}"]`),
        source: form.querySelector(`template[data-forms-as-code-repeat-template="${name}"]`),
        count: form.querySelector(`[data-forms-as-code-repeat-count="${name}"]`)
      };
    }
    function setRepeatCount(name, requested) {
      const { host, source, count } = repeatParts(name);
      if (!host || !source || !count) return;
      const target = Math.max(0, Math.min(Number(source.dataset.formsAsCodeRepeatMax || 99), Number.parseInt(requested, 10) || 0));
      while (host.children.length < target) {
        const index = host.children.length;
        const fragment = source.content.cloneNode(true);
        for (const rowSource of fragment.querySelectorAll('template[data-forms-as-code-repeat-rows]')) {
          const rowCount = Number.parseInt(rowSource.dataset.formsAsCodeRepeatRows, 10);
          const rows = document.createDocumentFragment();
          for (let row = 0; row < rowCount; row++) {
            const rowFragment = rowSource.content.cloneNode(true);
            for (const element of rowFragment.querySelectorAll('*')) {
              for (const attribute of [...element.attributes]) element.setAttribute(attribute.name, attribute.value
                .replaceAll('__ROW__', String(row)).replaceAll('__ROWNUMBER__', String(row + 1)));
            }
            rows.append(rowFragment);
          }
          rowSource.replaceWith(rows);
        }
        const repeatRoots = [...fragment.children];
        for (const element of repeatRoots.flatMap(root => [root, ...root.querySelectorAll('*')])) {
          for (const attribute of [...element.attributes]) element.setAttribute(attribute.name, attribute.value
            .replaceAll('__INDEX__', String(index)).replaceAll('__ROWNUMBER__', String(index + 1)).replaceAll('__PAGE__', String(index + 2)));
        }
        const textNodes = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
        while (textNodes.nextNode()) textNodes.currentNode.nodeValue = textNodes.currentNode.nodeValue
          .replaceAll('__INDEX__', String(index)).replaceAll('__ROWNUMBER__', String(index + 1)).replaceAll('__PAGE__', String(index + 2));
        for (const root of repeatRoots) {
          root.dataset.formsAsCodeRepeatItem = name;
          root.dataset.formsAsCodeRepeatIndex = String(index);
        }
        host.append(fragment);
      }
      while (host.children.length > target) host.lastElementChild.remove();
      count.value = String(target);
      form.querySelectorAll('[data-forms-as-code-page-total]').forEach(element => { element.textContent = String(target + 1); });
      rebuildBindings();
      form.querySelectorAll('[data-forms-as-code-repeat-remove]').forEach(button => { button.disabled = locked; });
    }
    function syncRepeats(data) {
      for (const count of form.querySelectorAll('[data-forms-as-code-repeat-count]')) setRepeatCount(count.dataset.formsAsCodeRepeatCount, getAt(data, count.dataset.formsAsCode) || 0);
    }
    function reindexRepeatItems(name) {
      const { host, count } = repeatParts(name);
      if (!host || !count) return;
      [...host.children].forEach((root, index) => {
        const previous = root.dataset.formsAsCodeRepeatIndex;
        if (previous !== String(index)) {
          for (const element of [root, ...root.querySelectorAll('*')]) {
            for (const attribute of [...element.attributes]) {
              let value = attribute.value.replaceAll(`.${previous}.`, `.${index}.`)
                .replaceAll(`row ${Number(previous) + 1}`, `row ${index + 1}`);
              if (element.type === 'radio' && attribute.name === 'value' && value === previous) value = String(index);
              element.setAttribute(attribute.name, value);
            }
          }
          root.dataset.formsAsCodeRepeatIndex = String(index);
        }
      });
      count.value = String(host.children.length);
      rebuildBindings();
    }
    rebuildBindings();
    for (const count of form.querySelectorAll('[data-forms-as-code-repeat-count]')) {
      setRepeatCount(count.dataset.formsAsCodeRepeatCount, count.value || 0);
    }
    form.addEventListener('click', event => {
      const add = event.target.closest('[data-forms-as-code-repeat-add]');
      const remove = event.target.closest('[data-forms-as-code-repeat-remove]');
      const removeItem = event.target.closest('[data-forms-as-code-repeat-remove-item]');
      if (locked || (!add && !remove && !removeItem)) return;
      if (removeItem) {
        const name = removeItem.dataset.formsAsCodeRepeatRemoveItem;
        const item = removeItem.closest(`[data-forms-as-code-repeat-item="${name}"]`);
        if (item) item.remove();
        reindexRepeatItems(name);
        syncConditionalVisibility();
      } else {
        const name = add?.dataset.formsAsCodeRepeatAdd || remove.dataset.formsAsCodeRepeatRemove;
        const { host } = repeatParts(name);
        setRepeatCount(name, host.children.length + (add ? 1 : -1));
      }
      setStatus('Unsaved changes.');
    });

    function valueOf(group) {
      const visible = group.filter(control => !control.closest('.forms-as-code-hidden'));
      const active = visible.length ? visible : group;
      const first = active[0];
      if (first.type === 'radio') return active.find(control => control.checked)?.value ?? '';
      if (first.type === 'checkbox' && first.dataset.formsAsCodeMode === 'multiple') return active.filter(control => control.checked).map(control => control.value);
      if (first.type === 'checkbox') return first.checked;
      if (first instanceof HTMLSelectElement && first.multiple) return [...first.selectedOptions].map(option => option.value);
      return first.value;
    }
    function normalizeDerived(data) {
      for (const control of controls) {
        const dependency = control.dataset.formsAsCodeDerivedFrom;
        if (!dependency) continue;
        const mapping = JSON.parse(control.dataset.formsAsCodeDerivedMap || '{}');
        const source = getAt(data, dependency);
        if (control.dataset.formsAsCodeDerived === 'date-add-days') {
          const from = Date.parse(`${getAt(data, control.dataset.formsAsCodeDerivedStart) || ''}T00:00:00Z`);
          const days = Number.parseInt(getAt(data, control.dataset.formsAsCodeDerivedDays) || '', 10);
          if (Number.isNaN(from) || !Number.isInteger(days) || days < 1) setDataAt(data, control.dataset.formsAsCode, '');
          else setDataAt(data, control.dataset.formsAsCode, new Date(from + (days - 1) * 86400000).toISOString().slice(0, 10));
          continue;
        }
        if (control.dataset.formsAsCodeDerived === 'date-difference-inclusive') {
          const from = Date.parse(`${getAt(data, control.dataset.formsAsCodeDerivedStart || `${dependency}.from`) || ''}T00:00:00Z`);
          const to = Date.parse(`${getAt(data, control.dataset.formsAsCodeDerivedEnd || `${dependency}.to`) || ''}T00:00:00Z`);
          const days = Number.isNaN(from) || Number.isNaN(to) ? '' : Math.floor((to - from) / 86400000) + 1;
          setDataAt(data, control.dataset.formsAsCode, days > 0 ? String(days) : '');
          continue;
        }
        setDataAt(data, control.dataset.formsAsCode, Object.prototype.hasOwnProperty.call(mapping, source) ? mapping[source] : '');
      }
      return data;
    }
    function collectData() {
      const data = {};
      for (const [path, group] of groups) setDataAt(data, path, valueOf(group));
      return normalizeDerived(data);
    }
    function syncDerivedControls() {
      const data = collectData();
      for (const control of controls) if (control.dataset.formsAsCodeDerivedFrom) control.value = getAt(data, control.dataset.formsAsCode) ?? '';
    }
    function matchesVisibilityRule(rule, data) {
      return rule.split('||').some(clause => {
        const at = clause.indexOf('~=');
        if (at >= 0) {
          const value = getAt(data, clause.slice(0, at).trim());
          return Array.isArray(value) && value.includes(clause.slice(at + 2).trim());
        }
        const equals = clause.indexOf('=');
        if (equals >= 0) return String(getAt(data, clause.slice(0, equals).trim()) ?? '') === clause.slice(equals + 1).trim();
        return Boolean(getAt(data, clause.trim()));
      });
    }
    function syncConditionalVisibility(data = collectData()) {
      for (const element of wrapper.querySelectorAll('[data-forms-as-code-visible-when]')) {
        const hidden = !matchesVisibilityRule(element.dataset.formsAsCodeVisibleWhen, data);
        const wasHidden = element.classList.contains('forms-as-code-hidden');
        element.classList.toggle('forms-as-code-hidden', hidden);
        if (hidden) for (const control of element.querySelectorAll('[data-forms-as-code]')) {
          if (control.type === 'checkbox' || control.type === 'radio') control.checked = false;
          else control.value = '';
        }
        else if (wasHidden) for (const control of element.querySelectorAll('[data-forms-as-code-default]')) {
          if (!control.value) control.value = control.dataset.formsAsCodeDefault;
        }
      }
    }
    let automaticRemarks = '';
    function syncAutomaticRemarks(data = collectData()) {
      const remarks = form.querySelector('[data-forms-as-code-auto-remarks]');
      if (!remarks) return;
      const statements = [...wrapper.querySelectorAll('template[data-forms-as-code-auto-remark]')]
        .filter(statement => matchesVisibilityRule(statement.dataset.formsAsCodeAutoRemark, data))
        .map(statement => statement.content.textContent.trim())
        .filter(Boolean);
      const text = statements.join('\n\n');
      if (!remarks.value || remarks.value === automaticRemarks) remarks.value = text;
      automaticRemarks = text;
    }
    function syncConditionalRequired(data = collectData()) {
      for (const control of controls) {
        const rule = control.dataset.formsAsCodeRequiredWhen;
        if (!rule) continue;
        const at = rule.indexOf('=');
        const path = at < 0 ? rule : rule.slice(0, at);
        const expected = at < 0 ? 'true' : rule.slice(at + 1);
        control.required = String(getAt(data, path) ?? '') === expected;
      }
    }
    function blankData() {
      const data = {};
      for (const [path, group] of groups) {
        const first = group[0];
        setDataAt(data, path, first.type === 'checkbox' ? (first.dataset.formsAsCodeMode === 'multiple' ? [] : false)
          : first instanceof HTMLSelectElement && first.multiple ? [] : '');
      }
      return normalizeDerived(data);
    }
    function humanizePath(path) {
      const parts = path.split('.').map(part => part.replace(/([a-z])([A-Z])/g, '$1 $2'));
      return parts.map((part, index) => {
        if (!/^\d+$/.test(part)) return part;
        return String(Number(part) + 1);
      }).join(' - ').replace(/ - (\d+)$/, ' $1').replace(/\b\w/g, letter => letter.toUpperCase());
    }
    function conciseCsvLabel(value) {
      const normalized = value.replace(/\s+/g, ' ').trim().replace(/[.:;,-]+$/, '');
      return normalized.length <= 72 ? normalized : `${normalized.slice(0, 69).trimEnd()}...`;
    }
    function csvLabel(path, group) {
      const first = group[0];
      const explicit = first.dataset.formsAsCodeCsvLabel?.trim();
      const candidates = [
        first.getAttribute('aria-label')?.trim(),
        ...(first.labels ? [...first.labels].map(label => label.textContent.replace(/\s+/g, ' ').trim()) : []),
        first.getAttribute('title')?.trim()
      ];
      const inferred = candidates.find(value => value && value.length <= 40);
      const label = explicit || inferred || humanizePath(path);
      const parts = pathParts(path);
      const numeric = parts.findLastIndex(part => /^\d+$/.test(part));
      if (numeric < 0 || explicit || !inferred || /\b(?:row|item|record|attempt|test)\s+\d+\b/i.test(label)) return conciseCsvLabel(label);
      const collection = (parts[numeric - 1] || 'row').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, letter => letter.toUpperCase());
      return conciseCsvLabel(`${collection} ${Number(parts[numeric]) + 1} - ${label}`);
    }
    function exampleValue(path, group) {
      const first = group[0];
      if (first.type === 'radio') return first.value;
      if (first.type === 'checkbox') return first.dataset.formsAsCodeMode === 'multiple' ? [] : false;
      if (first instanceof HTMLSelectElement) {
        if (first.multiple) return [];
        return [...first.options].find(option => option.value !== '')?.value ?? '';
      }
      const label = [...(first.labels || [])].map(item => item.textContent).join(' ');
      const context = `${path} ${first.getAttribute('aria-label') || ''} ${first.placeholder || ''} ${label}`;
      const dateFormat = (first.dataset.formsAsCodeCsvFormat || context.match(/\b(?:YYYYMMDD|DDMMMYYYY|MMDDYYYY|DD\/MM\/YYYY|MM\/DD\/YYYY)\b/i)?.[0] || '').toUpperCase();
      if (dateFormat === 'YYYYMMDD' || (!dateFormat && /date|dob|birth/i.test(context))) return '20260131';
      if (dateFormat === 'DDMMMYYYY') return '31JAN2026';
      if (dateFormat === 'MMDDYYYY') return '01312026';
      if (dateFormat === 'DD/MM/YYYY') return '31/01/2026';
      if (dateFormat === 'MM/DD/YYYY') return '01/31/2026';
      if (path === meta.namePath) return EXAMPLE_ROW_MARKER;
      if (first.dataset.formsAsCodeRepeatCount) return '0';
      if (/initials/i.test(path)) return 'EX';
      if (/age/i.test(path)) return '30';
      if (/time/i.test(path)) return '12:34';
      if (/points/i.test(path)) return '60';
      if (/repetitions/i.test(path)) return '25';
      if (/attempt/i.test(path)) return '150';
      if (/payGrade|grade/i.test(path)) return 'E5';
      if (/aocMos/i.test(path)) return '11B';
      if (/unit|organization|address/i.test(path)) return 'EXAMPLE UNIT';
      const pattern = first.getAttribute('pattern') || '';
      const exactDigits = pattern.match(/^\[0-9\]\{(\d+)\}$/);
      if (exactDigits) return '0'.repeat(Number(exactDigits[1]));
      const digitsRange = pattern.match(/^\[0-9\]\{1,(\d+)\}$/);
      if (digitsRange) return '30'.slice(0, Number(digitsRange[1]));
      if (/name/i.test(path)) return 'Example Name';
      return 'Example';
    }
    function exampleData() {
      const data = {};
      for (const [path, group] of groups) setDataAt(data, path, exampleValue(path, group));
      setDataAt(data, meta.namePath, EXAMPLE_ROW_MARKER);
      return normalizeDerived(data);
    }
    function csvValue(value) {
      if (typeof value === 'boolean') return value ? 'true' : 'false';
      if (Array.isArray(value)) return JSON.stringify(value);
      return value == null ? '' : String(value);
    }
    function populate(data) {
      syncRepeats(data);
      normalizeDerived(data);
      for (const [path, group] of groups) {
        const value = getAt(data, path);
        const first = group[0];
        if (first.type === 'radio') for (const control of group) control.checked = control.value === value;
        else if (first.type === 'checkbox' && first.dataset.formsAsCodeMode === 'multiple') {
          const selected = Array.isArray(value) ? value : [];
          for (const control of group) control.checked = selected.includes(control.value);
        } else if (first.type === 'checkbox') first.checked = value === true;
        else if (first instanceof HTMLSelectElement && first.multiple) {
          const selected = Array.isArray(value) ? value : [];
          for (const option of first.options) option.selected = selected.includes(option.value);
        } else first.value = value == null ? '' : String(value);
      }
      syncDerivedControls(); syncConditionalVisibility(data); syncAutomaticRemarks(data); syncConditionalRequired(data);
    }
    function isLegacyPath(path) {
      return meta.legacyPaths.some(pattern => {
        const expression = pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^.]+');
        return new RegExp(`^${expression}$`).test(path);
      });
    }
    function unknownPaths(data) {
      const unknown = [];
      function isKnownPrefix(path) { return [...groups.keys()].some(key => key === path || key.startsWith(`${path}.`)); }
      function visit(value, path) {
        if (value === undefined) return;
        if (Array.isArray(value)) {
          if (path && !isKnownPrefix(path)) { unknown.push(path); return; }
          value.forEach((item, index) => {
            const itemPath = path ? `${path}.${index}` : String(index);
            if (item === null && !groups.has(itemPath) && !isKnownPrefix(itemPath)) return;
            visit(item, itemPath);
          });
        } else if (value !== null && typeof value === 'object') {
          if (path && !isKnownPrefix(path)) { unknown.push(path); return; }
          for (const [key, item] of Object.entries(value)) visit(item, path ? `${path}.${key}` : key);
        } else if (!groups.has(path) && !isLegacyPath(path)) unknown.push(path);
      }
      visit(data, ''); return unknown;
    }
    function validate(data, { allowPartial = false } = {}) {
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Submission data must be a JSON object.');
      normalizeDerived(data);
      const unknown = unknownPaths(data);
      if (unknown.length) throw new Error(`Unknown data field${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}.`);
      syncConditionalRequired(data);
      for (const [path, group] of groups) {
        const first = group[0]; const value = getAt(data, path);
        if (value === undefined) {
          if (allowPartial) continue;
          throw new Error(`Missing value for ${path}.`);
        }
        if (!allowPartial && group.some(control => control.required) && (value == null || value === '')) throw new Error(`${path} is required.`);
        if (first.type === 'radio') {
          if (value !== '' && !group.some(control => control.value === value)) throw new Error(`Invalid choice for ${path}.`);
        } else if (first.type === 'checkbox' && first.dataset.formsAsCodeMode === 'multiple') {
          if (!Array.isArray(value) || value.some(item => !group.some(control => control.value === item))) throw new Error(`Invalid checkbox values for ${path}.`);
        } else if (first.type === 'checkbox') {
          if (typeof value !== 'boolean') throw new Error(`${path} must be true or false.`);
        } else if (first instanceof HTMLSelectElement && first.multiple) {
          if (!Array.isArray(value) || value.some(item => ![...first.options].some(option => option.value === item))) throw new Error(`Invalid selection for ${path}.`);
        } else if (first instanceof HTMLSelectElement) {
          if (value !== '' && ![...first.options].some(option => option.value === value)) throw new Error(`Invalid selection for ${path}.`);
        } else if (typeof value !== 'string') throw new Error(`${path} must be a string.`);
        const pattern = first.getAttribute('pattern');
        if (pattern && value !== '' && value != null && !new RegExp(`^(?:${pattern})$`).test(String(value))) throw new Error(`Invalid format for ${path}.`);
        if (first.maxLength >= 0 && typeof value === 'string' && value.length > first.maxLength) throw new Error(`${path} is too long.`);
      }
    }
    async function makeSubmission(data, isLocked = locked) {
      const templateIdentity = { uri: template.uri, version: template.version };
      if (template.sha256) templateIdentity.sha256 = template.sha256;
      const submission = { formatVersion: FORMAT_VERSION, id: makeId(), createdAt: new Date().toISOString(), template: templateIdentity, locked: isLocked, data: JSON.parse(JSON.stringify(data)) };
      if (isLocked) submission.integrity = await makeIntegrity(submission);
      return submission;
    }
    function filenameFor(data, duplicate = 1) {
      const suffix = duplicate > 1 ? `-${duplicate}` : '';
      return `${meta.code}-${safeName(getAt(data, meta.namePath))}${suffix}.json`;
    }
    function setLocked(value) {
      locked = value;
      for (const control of controls) control.disabled = value;
      for (const button of form.querySelectorAll('[data-forms-as-code-repeat-add], [data-forms-as-code-repeat-remove]')) button.disabled = value;
      form.classList.toggle('is-locked', value);
      lockButton.disabled = false;
      lockButton.textContent = value ? 'Unlock fields' : 'Lock fields';
    }
    function prepare(data, options) { validate(data, options); return data; }
    async function loadSubmission(submission) {
      if (submission?.formatVersion !== FORMAT_VERSION || submission.template?.uri !== template.uri || submission.template?.version !== template.version) throw new Error('Submission format or template reference does not match.');
      if (typeof submission.locked !== 'boolean' || typeof submission.id !== 'string') throw new Error('Submission envelope is incomplete.');
      if (submission.integrity) await verifyIntegrity(submission);
      else if (submission.locked) throw new Error('Locked submission is missing its integrity digest.');
      if (submission.integrity && (template.sha256 || submission.template.sha256) && template.sha256 !== submission.template.sha256) throw new Error('Submission template digest does not match the trusted catalog.');
      syncRepeats(submission.data);
      prepare(JSON.parse(JSON.stringify(submission.data)), { allowPartial: true });
      populate(submission.data); setLocked(submission.locked);
      setStatus(submission.integrity ? `Integrity verified (${submission.integrity.digest.slice(0, 12)}…).${submission.locked ? ' Choose Unlock fields to edit.' : ''}` : 'Loaded submission.');
    }

    async function save() {
      if (!form.reportValidity()) return;
      const data = prepare(collectData(), { allowPartial: false });
      const submission = await makeSubmission(data);
      saveBlob(new Blob([`${JSON.stringify(submission, null, 2)}\n`], { type: 'application/json' }), filenameFor(data));
      setStatus(locked ? `Saved locked submission with SHA-256 digest ${submission.integrity.digest.slice(0, 12)}….` : 'Saved submission.');
    }
    async function readCsvData(file) {
      const records = parseCsv(await file.text());
      if (records.length < 2) throw new Error('CSV must include a header row and at least one filled row.');
      const headers = records[0];
      const expected = [...groups.keys()];
      if (new Set(headers).size !== headers.length) throw new Error('CSV contains duplicate headers.');
      const missing = expected.filter(path => !headers.includes(path));
      const extra = headers.filter(path => !groups.has(path));
      if (missing.length || extra.length) throw new Error(`CSV headers do not match. Missing: ${missing.join(', ') || 'none'}. Unknown: ${extra.join(', ') || 'none'}.`);
      const rows = records.slice(1).map((row, index) => ({ row, number: index + 2 })).filter(({ row }) => row.some(value => value.trim() !== ''));
      const referenceColumn = headers.indexOf(meta.namePath);
      const referenceRows = rows.filter(({ row }) => [LABEL_ROW_MARKER, EXAMPLE_ROW_MARKER].includes(row[referenceColumn]?.trim()));
      const submissionRows = rows.filter(({ row }) => ![LABEL_ROW_MARKER, EXAMPLE_ROW_MARKER].includes(row[referenceColumn]?.trim()));
      if (!submissionRows.length) throw new Error(referenceRows.length ? 'CSV contains only its field-label and example reference rows. Add a submission row using the machine-readable header columns.' : 'CSV has no populated submission rows.');
      if (submissionRows.length > 1000 && !window.confirm(`This CSV contains ${submissionRows.length.toLocaleString()} records. Large batches may use substantial memory or make the browser unresponsive. Continue?`)) throw new Error('Large batch canceled by user.');
      return submissionRows.map(({ row, number }) => {
        try {
          if (row.length !== headers.length) throw new Error(`Expected ${headers.length} columns but found ${row.length}.`);
          const data = blankData();
          headers.forEach((path, column) => setDataAt(data, path, csvCell(row[column], groups.get(path), path)));
          return prepare(data, { allowPartial: false });
        } catch (error) { throw new Error(`CSV record ${number}: ${error.message}`); }
      });
    }
    async function importCsv(file) {
      const rows = await readCsvData(file);
      if (rows.length > 65535) throw new Error('A bulk ZIP may contain at most 65,535 submissions.');
      setAppState('rendering');
      const files = []; const counts = new Map();
      for (const data of rows) {
        const name = safeName(getAt(data, meta.namePath));
        const count = (counts.get(name) || 0) + 1; counts.set(name, count);
        const submission = await makeSubmission(data, false);
        files.push({ name: filenameFor(data, count), content: `${JSON.stringify(submission, null, 2)}\n` });
      }
      saveBlob(createZip(files), `${meta.code}-submissions.zip`);
      setStatus(`Validated ${files.length} rows and saved ${meta.code}-submissions.zip.`);
      setAppState('ready');
    }
    function printableClone() {
      const source = templateHost.querySelector('.forms-as-code-template');
      const clone = source.cloneNode(true);
      const sourceControls = source.querySelectorAll('input, textarea, select');
      const cloneControls = clone.querySelectorAll('input, textarea, select');
      sourceControls.forEach((control, index) => {
        const copy = cloneControls[index];
        if (control instanceof HTMLInputElement) {
          copy.value = control.value;
          copy.setAttribute('value', control.value);
          copy.checked = control.checked;
          copy.toggleAttribute('checked', control.checked);
        } else if (control instanceof HTMLTextAreaElement) {
          copy.value = control.value;
          copy.textContent = control.value;
        } else {
          [...copy.options].forEach((option, optionIndex) => {
            option.selected = control.options[optionIndex].selected;
            option.toggleAttribute('selected', option.selected);
          });
        }
      });
      return clone;
    }
    async function printCsv(file) {
      const rows = await readCsvData(file);
      setAppState('rendering');
      const originalData = collectData();
      const originalLocked = locked;
      const batch = document.createElement('div');
      batch.id = 'bulk-print-root';
      batch.className = 'bulk-print-root';
      batch.setAttribute('aria-hidden', 'true');
      try {
        for (let index = 0; index < rows.length; index++) {
          populate(rows[index]);
          const record = document.createElement('section');
          record.className = 'bulk-print-record';
          record.dataset.record = String(index + 1);
          record.append(printableClone());
          batch.append(record);
          if ((index + 1) % 10 === 0) {
            setStatus(`Preparing ${index + 1} of ${rows.length} forms for printing…`);
            await new Promise(resolve => requestAnimationFrame(resolve));
          }
        }
      } finally {
        populate(originalData);
        setLocked(originalLocked);
      }
      document.querySelector('#bulk-print-root')?.remove();
      document.body.append(batch);
      document.body.classList.add('is-bulk-printing');
      setStatus(`Prepared ${rows.length} forms. Choose Save as PDF in the print dialog.`);
      const cleanup = () => { batch.remove(); document.body.classList.remove('is-bulk-printing'); setAppState('ready'); };
      window.addEventListener('afterprint', cleanup, { once: true });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.print();
    }
    document.querySelector('#save-submission').addEventListener('click', async () => {
      try { await save(); } catch (error) { setStatus(`Could not save: ${error.message}`); }
    });
    function downloadBulkCsv() {
      setAppState('downloading');
      const headers = [...groups.keys()];
      const labels = headers.map(path => csvLabel(path, groups.get(path)));
      labels[headers.indexOf(meta.namePath)] = LABEL_ROW_MARKER;
      const example = exampleData();
      const row = headers.map(path => csvEscape(csvValue(getAt(example, path))));
      const csv = `\uFEFF${headers.map(csvEscape).join(',')}\r\n${labels.map(csvEscape).join(',')}\r\n${row.join(',')}\r\n`;
      saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${meta.code}-bulk-template.csv`);
      setStatus('Downloaded CSV with stable machine headers, human-readable field labels, and an example row. Reference rows are ignored on import.');
      setAppState('ready');
    }
    document.querySelector('#bulk-csv').addEventListener('click', downloadBulkCsv);
    document.querySelector('#lock-submission').addEventListener('click', async () => {
      if (locked) { setLocked(false); setStatus('Fields are unlocked. Save to persist locked: false.'); return; }
      if (!form.reportValidity()) return;
      try {
        const data = prepare(collectData(), { allowPartial: false });
        const preview = await makeSubmission(data, true);
        setLocked(true);
        setStatus(`Fields are locked. SHA-256 ${preview.integrity.digest.slice(0, 12)}…. Save to persist the digest.`);
      } catch (error) { setStatus(error.message); }
    });
    document.querySelector('#new-submission').addEventListener('click', () => {
      form.reset();
      for (const count of form.querySelectorAll('[data-forms-as-code-repeat-count]')) setRepeatCount(count.dataset.formsAsCodeRepeatCount, 0);
      setLocked(false); syncDerivedControls(); syncConditionalVisibility(); syncConditionalRequired(); setStatus('Started a blank submission.');
    });
    document.querySelector('#print-csv').addEventListener('click', () => document.querySelector('#print-csv-file').click());
    document.querySelector('#print-csv-file').addEventListener('change', async event => {
      const file = event.target.files?.[0]; event.target.value = '';
      if (!file) return;
      try { await printCsv(file); } catch (error) { setAppState('error'); setStatus(`Could not print CSV: ${error.message}`); }
    });
    document.querySelector('#print-form').addEventListener('click', () => window.print());
    form.addEventListener('input', () => { syncDerivedControls(); syncConditionalVisibility(); syncAutomaticRemarks(); syncConditionalRequired(); setStatus('Unsaved changes.'); });
    form.addEventListener('change', () => { syncDerivedControls(); syncConditionalVisibility(); syncAutomaticRemarks(); syncConditionalRequired(); setStatus('Unsaved changes.'); });
    syncDerivedControls(); syncConditionalVisibility(); syncConditionalRequired();
    return { form, loadSubmission, importCsv, collectData, downloadBulkCsv };
  }

  function csvEscape(value) {
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }
  function csvCell(rawValue, group, path) {
    const first = group[0]; const text = rawValue.trim();
    if (first.type === 'radio') {
      if (text !== '' && !group.some(control => control.value === text)) throw new Error(`Invalid choice for ${path}: ${text}`);
      return text;
    }
    if (first.type === 'checkbox' && first.dataset.formsAsCodeMode === 'multiple') {
      const selected = text === '' ? [] : JSON.parse(text);
      if (!Array.isArray(selected) || selected.some(item => typeof item !== 'string' || !group.some(control => control.value === item))) throw new Error(`Invalid checkbox values for ${path}; use a JSON array.`);
      return selected;
    }
    if (first.type === 'checkbox') {
      if (text === '' || text.toLowerCase() === 'false') return false;
      if (text.toLowerCase() === 'true') return true;
      throw new Error(`Use true or false for ${path}.`);
    }
    if (first instanceof HTMLSelectElement && first.multiple) {
      const selected = text === '' ? [] : JSON.parse(text);
      if (!Array.isArray(selected) || selected.some(item => typeof item !== 'string' || ![...first.options].some(option => option.value === item))) throw new Error(`Invalid selection list for ${path}; use a JSON array.`);
      return selected;
    }
    if (first instanceof HTMLSelectElement && text !== '' && ![...first.options].some(option => option.value === text)) throw new Error(`Invalid selection for ${path}: ${text}`);
    return rawValue;
  }
  function parseCsv(inputText) {
    const input = inputText.replace(/^\uFEFF/, ''); const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < input.length; i++) {
      const char = input[i];
      if (quoted) {
        if (char === '"' && input[i + 1] === '"') { field += '"'; i++; }
        else if (char === '"') quoted = false;
        else field += char;
      } else if (char === '"') {
        if (field.length) throw new Error('Unexpected quote in CSV field.');
        quoted = true;
      } else if (char === ',') { row.push(field); field = ''; }
      else if (char === '\n' || char === '\r') {
        if (char === '\r' && input[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += char;
    }
    if (quoted) throw new Error('CSV contains an unterminated quoted field.');
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows;
  }
  function createZip(files) {
    if (files.length > 65535) throw new Error('A bulk ZIP may contain at most 65,535 submissions.');
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
    const dosDate = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const localParts = [], centralParts = []; let localOffset = 0;
    for (const file of files) {
      const name = encoder.encode(file.name), data = encoder.encode(file.content), crc = crc32(data);
      const localHeader = new Uint8Array([
        ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosTime), ...u16(dosDate),
        ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)
      ]);
      localParts.push(localHeader, name, data);
      const centralHeader = new Uint8Array([
        ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosTime), ...u16(dosDate),
        ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0),
        ...u16(0), ...u16(0), ...u32(0), ...u32(localOffset)
      ]);
      centralParts.push(centralHeader, name);
      localOffset += localHeader.length + name.length + data.length;
    }
    const central = concat(centralParts);
    const end = new Uint8Array([
      ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
      ...u32(central.length), ...u32(localOffset), ...u16(0)
    ]);
    return new Blob([concat([...localParts, central, end])], { type: 'application/zip' });
  }
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
    return (crc ^ 0xffffffff) >>> 0;
  }
  function u16(value) { return [value & 0xff, (value >>> 8) & 0xff]; }
  function u32(value) { return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]; }
  function concat(parts) {
    const result = new Uint8Array(parts.reduce((n, part) => n + part.length, 0)); let offset = 0;
    for (const part of parts) { result.set(part, offset); offset += part.length; }
    return result;
  }

  async function fetchTemplate(template) {
    setStatus(`Fetching ${templateDisplayName(template)}…`);
    const url = new URL(template.path, document.baseURI);
    const trustedCatalogOrigin = template.catalogOrigin || window.location.origin;
    if (!template.local && url.origin !== window.location.origin && url.origin !== trustedCatalogOrigin) throw new Error('Template must be served from its catalog origin.');
    const response = await fetch(url, { credentials: url.origin === window.location.origin ? 'same-origin' : 'omit', cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not fetch the HTML template (${response.status}).`);
    const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
    validateTemplateDocument(parsed, template);
    return parsed;
  }
  function validateTemplateDocument(parsed, expected) {
    const metadataMatches = parsed.querySelector('meta[name="forms-as-code:template-id"]')?.content === expected.uri
      && parsed.querySelector('meta[name="forms-as-code:template-version"]')?.content === expected.version
      && parsed.querySelector('meta[name="forms-as-code:form-code"]')?.content === expected.code;
    if (!metadataMatches) throw new Error('Template identity metadata does not match the trusted registry.');
    const declaredTitle = parsed.querySelector('meta[name="forms-as-code:form-title"]')?.content?.trim();
    const declaredEdition = parsed.querySelector('meta[name="forms-as-code:form-edition"]')?.content?.trim();
    if (expected.titleDeclared !== false && declaredTitle !== expected.title) throw new Error('Template title does not match the trusted registry.');
    if (expected.editionDeclared !== false && declaredEdition !== expected.edition) throw new Error('Template edition does not match the trusted registry.');
    if (parsed.querySelector('script, iframe, object, embed, link[rel~="stylesheet"], img[src], audio[src], video[src]') || parsed.body.querySelector('[src]')) throw new Error('Template HTML cannot load executable code or external assets.');
    for (const element of parsed.querySelectorAll('*')) {
      for (const attribute of element.attributes) {
        if (/^on/i.test(attribute.name) || (/^(href|action|formaction)$/i.test(attribute.name) && /^\s*javascript:/i.test(attribute.value))) throw new Error('Template HTML cannot contain executable event handlers or links.');
        if (attribute.name === 'style' && /url\s*\(/i.test(attribute.value)) throw new Error('Template inline styles cannot load external assets.');
      }
    }
    for (const style of parsed.querySelectorAll('style')) if (/@import\b|url\s*\(/i.test(style.textContent)) throw new Error('Template styles cannot load external assets.');
    if (!parsed.body.querySelector('form[data-forms-as-code-form]')) throw new Error('Template HTML must contain a form marked data-forms-as-code-form.');
  }
  async function renderTemplate(template) {
    setAppState('rendering');
    const parsed = await fetchTemplate(template);
    document.head.querySelectorAll('style[data-forms-as-code-template]').forEach(style => style.remove());
    for (const sourceStyle of parsed.querySelectorAll('head style')) {
      const style = document.createElement('style'); style.dataset.formsAsCodeTemplate = 'true'; style.textContent = sourceStyle.textContent; document.head.append(style);
    }
    templateHost.replaceChildren();
    const code = parsed.querySelector('meta[name="forms-as-code:form-code"]')?.content || template.code;
    const namePath = parsed.querySelector('meta[name="forms-as-code:name-path"]')?.content || 'name';
    const legacyPaths = (parsed.querySelector('meta[name="forms-as-code:legacy-paths"]')?.content || '').split(';').filter(Boolean);
    const wrapper = document.createElement('div'); wrapper.className = `forms-as-code-template forms-as-code-template-${code.toLowerCase()}`;
    for (const node of parsed.body.childNodes) {
      if (node.nodeType === Node.ELEMENT_NODE && node.matches('.demo-banner, .toolbar')) continue;
      wrapper.append(document.importNode(node, true));
    }
    templateHost.append(wrapper);
    document.title = `${templateDisplayName(template)} - ${siteConfig.siteName}`;
    notice.textContent = parsed.querySelector('meta[name="forms-as-code:notice"]')?.content || '';
    templateToolbar();
    const boundPaths = new Set([...wrapper.querySelectorAll('[data-forms-as-code]')].map(control => control.dataset.formsAsCode));
    if (!boundPaths.size) throw new Error('Template contains no data-forms-as-code fields.');
    const form = wrapper.querySelector('form[data-forms-as-code-form]');
    const controls = [...form.querySelectorAll('[data-forms-as-code]')];
    activeTemplate = { ...template, code, namePath };
    activeForm = initializeForm(activeTemplate, { code, namePath, legacyPaths });
    document.querySelector('#load-submission').addEventListener('change', onWorkspaceFile);
    launcher.hidden = true; workspace.hidden = false;
    setAppState('ready');
    return activeForm;
  }
  function templateToolbar() {
    toolbar.innerHTML = `<button type="button" id="new-submission">Clear form</button>
      <button type="button" id="save-submission">Save</button>
      <button type="button" id="lock-submission">Lock fields</button>
      <button type="button" id="bulk-csv">Bulk CSV</button>
      <button type="button" id="print-csv">Print CSV</button>
      <input id="print-csv-file" type="file" accept="text/csv,.csv">
      <label class="button-label" for="load-submission">Load</label>
      <input id="load-submission" type="file" accept="application/json,.json,text/csv,.csv">
      <button type="button" id="print-form">Print</button><output id="form-status" aria-live="polite">Ready.</output>`;
  }
  async function renderSubmission(submission) {
    const template = resolveSubmission(submission);
    await renderTemplate(template);
    await activeForm.loadSubmission(submission);
    return template;
  }
  async function loadJsonFile(file) {
    const tab = window.open('about:blank', '_blank');
    if (tab) { tab.document.write('<!doctype html><title>forms-as-code</title><p>Opening the submission in forms-as-code…</p>'); tab.document.close(); }
    try {
      const submission = JSON.parse(await file.text());
      const template = resolveSubmission(submission);
      if (!tab) { await renderSubmission(submission); setStatus('Popup was blocked; opened the form in this tab.'); return; }
      pendingWindow = tab; pendingSubmission = submission;
      const url = new URL('./index.html', document.baseURI); url.searchParams.set('handoff', String(Date.now()));
      tab.location.replace(url.href); setStatus(`Opening ${template.title} in a new forms-as-code tab…`);
    } catch (error) { if (tab && !tab.closed) tab.close(); setStatus(`Could not open submission: ${error.message}`); }
  }
  async function onWorkspaceFile(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv') {
      try { await activeForm.importCsv(file); } catch (error) { setAppState('error'); setStatus(`Could not load CSV: ${error.message}`); }
    } else await loadJsonFile(file);
  }
  async function loadLinkedJson(path) {
    const url = new URL(path, window.location.href);
    if (url.origin !== window.location.origin || url.username || url.password) throw new Error('JSON links must be same-origin.');
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`Could not read linked JSON (${response.status}).`);
    const template = await renderSubmission(await response.json());
    setStatus(`Opened ${template.title} from its same-origin JSON link.`);
  }

  function updateTemplateUrl(template) {
    const url = new URL(window.location.href);
    url.searchParams.set('template', template.code);
    url.searchParams.set('version', template.version);
    url.searchParams.delete('action');
    url.searchParams.delete('submission');
    url.searchParams.delete('handoff');
    history.replaceState(null, '', url);
  }
  function linkedTemplate(parameters) {
    const requestedCode = parameters.get('template');
    if (!parameters.has('template')) return null;
    if (!requestedCode?.trim()) throw new Error('The template query parameter cannot be empty.');
    const code = normalizedFormCode(requestedCode);
    const hasVersion = parameters.has('version');
    const version = parameters.get('version');
    if (hasVersion && !version) throw new Error('The version query parameter cannot be empty.');
    const matches = catalogTemplates.filter(template => normalizedFormCode(template.code) === code && (!hasVersion || template.version === version));
    if (!matches.length) throw new Error(`No trusted template matches ${requestedCode}${hasVersion ? ` version ${version}` : ''}.`);
    if (matches.length > 1) throw new Error(`Multiple trusted versions match ${requestedCode}. Add the version query parameter.`);
    return matches[0];
  }
  async function openLinkedTemplate(parameters) {
    const action = parameters.get('action');
    if (action && action !== 'bulk-csv') throw new Error(`Unsupported action: ${action}.`);
    if (parameters.has('version') && !parameters.has('template')) throw new Error('The version query parameter requires a template query parameter.');
    const template = linkedTemplate(parameters);
    if (!template) {
      if (action) throw new Error('The action query parameter requires a template query parameter.');
      return false;
    }
    await renderTemplate(template);
    selectedTemplateKey = templateKey(template);
    templateSearch.value = templateDisplayName(template);
    if (action === 'bulk-csv') activeForm.downloadBulkCsv();
    else setStatus(`Started a blank ${template.title} submission.`);
    return true;
  }
  function selectedTemplate() {
    if (selectedTemplateKey) return templates.get(selectedTemplateKey) || null;
    const matches = matchingTemplates(templateSearch.value);
    return matches.length === 1 ? matches[0] : null;
  }
  function matchingTemplates(query) {
    const normalized = query.trim().toLocaleLowerCase();
    return catalogTemplates.filter(template => `${templateDisplayName(template)} ${template.title} ${template.code} ${template.version}`.toLocaleLowerCase().includes(normalized));
  }
  function updateTemplateOptions() {
    const matches = matchingTemplates(templateSearch.value);
    templateOptions.replaceChildren(...matches.map(template => {
      const option = document.createElement('button');
      option.type = 'button'; option.role = 'option'; option.dataset.templateKey = templateKey(template);
      option.textContent = templateDisplayName(template);
      option.addEventListener('click', () => {
        selectedTemplateKey = option.dataset.templateKey;
        templateSearch.value = option.textContent;
        templateOptions.hidden = true;
        templateSearch.setAttribute('aria-expanded', 'false');
      });
      return option;
    }));
    templateOptions.hidden = !matches.length;
    templateSearch.setAttribute('aria-expanded', String(matches.length > 0));
  }
  templateSearch.addEventListener('input', () => { selectedTemplateKey = null; updateTemplateOptions(); });
  templateSearch.addEventListener('focus', updateTemplateOptions);
  document.addEventListener('click', event => {
    if (!event.target.closest('.form-search')) { templateOptions.hidden = true; templateSearch.setAttribute('aria-expanded', 'false'); }
  });
  document.querySelector('#create-form').addEventListener('click', async () => {
    const template = selectedTemplate();
    if (!template) { setStatus('Choose a form from the search suggestions first.'); return; }
    try { await renderTemplate(template); updateTemplateUrl(template); setStatus(`Started a blank ${template.title} submission.`); }
    catch (error) { setAppState('error'); setStatus(`Could not start form: ${error.message}`); }
  });
  submissionFile.addEventListener('change', async event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) await loadJsonFile(file); });
  dropZone.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); submissionFile.click(); } });
  for (const name of ['dragenter', 'dragover']) dropZone.addEventListener(name, event => { event.preventDefault(); dropZone.classList.add('drag-over'); });
  for (const name of ['dragleave', 'drop']) dropZone.addEventListener(name, event => { event.preventDefault(); dropZone.classList.remove('drag-over'); });
  dropZone.addEventListener('drop', event => { event.preventDefault(); const file = event.dataTransfer.files?.[0]; if (file) loadJsonFile(file); });

  window.addEventListener('message', async event => {
    if (event.origin !== window.location.origin) return;
    if (pendingWindow && event.source === pendingWindow && event.data?.type === 'forms-as-code:app-ready') {
      pendingWindow.postMessage({ type: 'forms-as-code:load-submission', submission: pendingSubmission }, window.location.origin); return;
    }
    if (pendingWindow && event.source === pendingWindow && event.data?.type === 'forms-as-code:submission-loaded') {
      setStatus(event.data.ok ? 'Loaded the submission in a new forms-as-code tab. The local file was not sent to a server.' : `Could not render submission: ${event.data.error}`);
      pendingWindow = null; pendingSubmission = null; return;
    }
    if (window.opener && event.source === window.opener && event.data?.type === 'forms-as-code:load-submission') {
      let submissionId = null;
      try {
        const submission = event.data.submission; submissionId = submission?.id ?? null;
        await renderSubmission(submission);
        event.source.postMessage({ type: 'forms-as-code:submission-loaded', ok: true, submissionId }, event.origin);
      } catch (error) { event.source.postMessage({ type: 'forms-as-code:submission-loaded', ok: false, error: error.message, submissionId }, event.origin); }
    }
  });
  function setTheme(theme) {
    const selected = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = selected;
    themeToggle.checked = selected === 'dark';
    try { localStorage.setItem(THEME_KEY, selected); } catch { /* Storage may be unavailable. */ }
  }
  try { setTheme(localStorage.getItem(THEME_KEY) || 'light'); } catch { setTheme('light'); }
  themeToggle.addEventListener('change', () => setTheme(themeToggle.checked ? 'dark' : 'light'));
  async function initialize() {
    await loadSiteConfig();
    sources = readSources();
    await loadSources();
    const parameters = new URLSearchParams(window.location.search);
    const linked = parameters.get('submission');
    if (linked) await loadLinkedJson(linked);
    else if (window.opener && parameters.has('handoff')) window.opener.postMessage({ type: 'forms-as-code:app-ready' }, window.location.origin);
    else if (!await openLinkedTemplate(parameters)) setAppState('ready');
  }
  initialize().catch(error => { setAppState('error'); setStatus(`Could not initialize forms-as-code: ${error.message}`); });
  function openSettings() {
    settingsPanel.hidden = false;
    document.body.classList.add('has-modal');
    settingsButton.setAttribute('aria-expanded', 'true');
    closeSettingsButton.focus();
  }
  function closeSettings() {
    settingsPanel.hidden = true;
    document.body.classList.remove('has-modal');
    settingsButton.setAttribute('aria-expanded', 'false');
    settingsButton.focus();
  }
  settingsButton.addEventListener('click', openSettings);
  closeSettingsButton.addEventListener('click', closeSettings);
  settingsPanel.addEventListener('click', event => { if (event.target === settingsPanel) closeSettings(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !settingsPanel.hidden) closeSettings(); });
  addRemoteSourceButton.addEventListener('click', () => { remoteSourceForm.hidden = false; newSourceUrl.focus(); });
  cancelRemoteSourceButton.addEventListener('click', () => { remoteSourceForm.hidden = true; newSourceUrl.value = ''; });
  remoteSourceForm.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const url = new URL(newSourceUrl.value.trim());
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('URL must be public HTTP(S).');
      const source = { id: sourceId(), type: 'remote', label: url.hostname, url: url.href, status: 'loading', templates: [] };
      sources.unshift(source); saveSources(); remoteSourceForm.hidden = true; newSourceUrl.value = ''; loadRemoteSource(source);
    } catch (error) { const message = `Could not add source: ${error.message}`; catalogStatus.textContent = message; setStatus(message); }
  });
  addLocalDirectoryButton.addEventListener('click', () => localTemplateDirectory.click());
  localTemplateDirectory.addEventListener('change', async () => {
    const files = [...localTemplateDirectory.files]; localTemplateDirectory.value = '';
    if (files.length) await addLocalSource(files);
  });
})();
