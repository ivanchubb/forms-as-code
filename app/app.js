/* forms-as-code's shared application: trusted HTML resolution, rendering, data, and bulk workflows. */
(() => {
  const FORMAT_VERSION = '0.1.0';
  const DEFAULT_CATALOG_URL = 'https://army-form-templates.s3.us-east-1.amazonaws.com/catalog.json';
  const CATALOG_URL_KEY = 'forms-as-code:catalog-url';
  const CATALOG_CACHE_PREFIX = 'forms-as-code:template-catalog:v1:';
  const EXAMPLE_ROW_MARKER = 'EXAMPLE - REPLACE OR DELETE';
  const templates = new Map([
    ['https://forms.example.org/forms-as-code/da-form-5304@2020-07.1', {
      uri: 'https://forms.example.org/forms-as-code/da-form-5304', version: '2020-07.1', title: 'DA Form 5304', code: 'DA5304', path: '../../forms/da/5304/JUL2020.html'
    }],
    ['https://forms.example.org/forms-as-code/da-form-1594@2019-12.1', {
      uri: 'https://forms.example.org/forms-as-code/da-form-1594', version: '2019-12.1', title: 'DA Form 1594', code: 'DA1594', path: '../../forms/da/1594/DEC2019.html'
    }],
    ['https://forms.example.org/forms-as-code/dd-form-1750@1970-09.1', {
      uri: 'https://forms.example.org/forms-as-code/dd-form-1750', version: '1970-09.1', title: 'DD Form 1750', code: 'DD1750', path: '../../forms/dd/1750/SEP70-EG.html'
    }],
    ['https://forms.example.org/forms-as-code/da-form-31@2023-10.1', {
      uri: 'https://forms.example.org/forms-as-code/da-form-31', version: '2023-10.1', title: 'DA Form 31', code: 'DA31', path: '../../forms/da/31/OCT2023.html'
    }],
    ['https://forms.example.org/forms-as-code/da-form-5960@2022-01.1', {
      uri: 'https://forms.example.org/forms-as-code/da-form-5960', version: '2022-01.1', title: 'DA Form 5960', code: 'DA5960', path: '../../forms/da/5960/OCT2026.html'
    }],
    ['https://forms.example.org/forms-as-code/da-form-705-aft@2026-04.1', {
      uri: 'https://forms.example.org/forms-as-code/da-form-705-aft', version: '2026-04.1', title: 'DA Form 705-AFT', code: 'DA705AFT', path: '../../forms/da/705-aft/APR2026.html'
    }],
    ['https://forms.example.org/forms-as-code/da-form-2062@2023-12.3', {
      uri: 'https://forms.example.org/forms-as-code/da-form-2062', version: '2023-12.3', title: 'DA Form 2062', code: 'DA2062', path: '../../forms/da/2062/DEC2023.html'
    }],
    ['https://forms.example.org/forms-as-code/da-form-4856@2023-03.1', {
      uri: 'https://forms.example.org/forms-as-code/da-form-4856', version: '2023-03.1', title: 'DA Form 4856', code: 'DA4856', path: '../../forms/da/4856/MAR2023.html'
    }],
    ['https://forms.example.org/forms-as-code/da-form-5121@2026-10.1', {
      uri: 'https://forms.example.org/forms-as-code/da-form-5121', version: '2026-10.1', title: 'DA Form 5121', code: 'DA5121', path: '../../forms/da/5121/OCT2026.html'
    }],
    ['https://forms.example.org/forms-as-code/da-form-260@2018-06.1', {
      uri: 'https://forms.example.org/forms-as-code/da-form-260', version: '2018-06.1', title: 'DA Form 260', code: 'DA260', path: '../../forms/da/260/JUN2018.html'
    }],
    ['https://forms.example.org/forms-as-code/da-form-2404@2026-08.1', {
      uri: 'https://forms.example.org/forms-as-code/da-form-2404', version: '2026-08.1', title: 'DA Form 2404', code: 'DA2404', path: '../../forms/da/2404/AUG2026.html'
    }],
    ['https://forms.example.org/forms-as-code/da-form-5500@2026-07.1', {
      uri: 'https://forms.example.org/forms-as-code/da-form-5500', version: '2026-07.1', title: 'DA Form 5500', code: 'DA5500', path: '../../forms/da/5500/JUL2026.html'
    }]
  ]);
  const launcher = document.querySelector('#launcher');
  const workspace = document.querySelector('#workspace');
  const catalogUrlInput = document.querySelector('#catalog-url');
  const loadCatalogButton = document.querySelector('#load-catalog');
  const templateSearch = document.querySelector('#template-search');
  const templateOptions = document.querySelector('#template-options');
  const templateHost = document.querySelector('#template-host');
  const toolbar = document.querySelector('#app-toolbar');
  const notice = document.querySelector('#template-notice');
  const appStatus = document.querySelector('#app-status');
  const submissionFile = document.querySelector('#submission-file');
  const dropZone = document.querySelector('#drop-zone');
  const encoder = new TextEncoder();
  let activeTemplate = null;
  let activeForm = null;
  let pendingWindow = null;
  let pendingSubmission = null;
  let catalogTemplates = [];

  function setStatus(message) {
    appStatus.textContent = message;
    const formStatus = document.querySelector('#form-status');
    if (formStatus) formStatus.textContent = message;
  }
  function templateKey(reference) { return `${reference?.uri}@${reference?.version}`; }
  function templateDisplayName(template) {
    const pathname = new URL(template.path, document.baseURI).pathname;
    const match = pathname.match(/\/([^/]+)\/([^/]+)\.html$/i);
    return match ? `${match[1].toUpperCase()} ${match[2].toUpperCase()} (${match[3].toUpperCase()})` : template.title;
  }
  function catalogUrl() { return localStorage.getItem(CATALOG_URL_KEY) || DEFAULT_CATALOG_URL; }
  function catalogCacheKey(url) { return `${CATALOG_CACHE_PREFIX}${url}`; }
  function validateCatalog(catalog, url) {
    if (!catalog || catalog.formatVersion !== '1' || !Array.isArray(catalog.templates)) throw new Error('Invalid template catalog.');
    return catalog.templates.map(template => {
      if (!template || typeof template.uri !== 'string' || typeof template.version !== 'string' || typeof template.title !== 'string' || typeof template.code !== 'string' || typeof template.path !== 'string') throw new Error('Template catalog entry is incomplete.');
      const path = new URL(template.path, url);
      if (path.origin !== new URL(url).origin || path.username || path.password || !path.pathname.endsWith('.html')) throw new Error('Template catalog contains an unsafe path.');
      return { ...template, path: path.href };
    });
  }
  function setCatalogTemplates(entries) {
    catalogTemplates = entries;
    templates.clear();
    for (const template of entries) templates.set(templateKey(template), template);
    const query = templateSearch.value.trim().toLocaleLowerCase();
    templateOptions.replaceChildren(...entries.filter(template => `${templateDisplayName(template)} ${template.title} ${template.code} ${template.version}`.toLocaleLowerCase().includes(query)).map(template => {
      const option = document.createElement('option'); option.value = templateDisplayName(template); option.dataset.templateKey = templateKey(template); return option;
    }));
  }
  async function loadCatalog(url = catalogUrl()) {
    let parsedUrl;
    try { parsedUrl = new URL(url); if (!['http:', 'https:'].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) throw new Error('Catalog URL must be a public HTTP(S) URL.'); }
    catch (error) { setStatus(`Could not load the template catalog: ${error.message}`); return; }
    catalogUrlInput.value = parsedUrl.href;
    const cached = localStorage.getItem(catalogCacheKey(parsedUrl.href));
    if (cached) {
      try { setCatalogTemplates(validateCatalog(JSON.parse(cached), parsedUrl.href)); setStatus(`Using ${catalogTemplates.length} cached templates.`); } catch { localStorage.removeItem(catalogCacheKey(parsedUrl.href)); }
    }
    try {
      const response = await fetch(parsedUrl.href, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Catalog request failed (${response.status}).`);
      const catalog = await response.json();
      setCatalogTemplates(validateCatalog(catalog, parsedUrl.href));
      localStorage.setItem(catalogCacheKey(parsedUrl.href), JSON.stringify(catalog));
      setStatus(`Loaded ${catalogTemplates.length} templates.`);
    } catch (error) {
      if (!catalogTemplates.length) setStatus(`Could not load the template catalog: ${error.message}`);
    }
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
  function pathParts(path) { return path.split('.').map(part => /^\d+$/.test(part) ? Number(part) : part); }
  function getAt(object, path) { return pathParts(path).reduce((value, part) => value == null ? undefined : value[part], object); }
  function setAt(object, path, value) {
    const parts = pathParts(path);
    let current = object;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (current[part] == null) current[part] = typeof parts[i + 1] === 'number' ? [] : {};
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
    let locked = false;

    function rebuildBindings() {
      controls = [...form.querySelectorAll('[data-forms-as-code]')];
      groups.clear();
      for (const control of controls) {
        if (!groups.has(control.dataset.formsAsCode)) groups.set(control.dataset.formsAsCode, []);
        groups.get(control.dataset.formsAsCode).push(control);
      }
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
          if (Number.isNaN(from) || !Number.isInteger(days) || days < 1) setAt(data, control.dataset.formsAsCode, '');
          else setAt(data, control.dataset.formsAsCode, new Date(from + (days - 1) * 86400000).toISOString().slice(0, 10));
          continue;
        }
        if (control.dataset.formsAsCodeDerived === 'date-difference-inclusive') {
          const from = Date.parse(`${getAt(data, control.dataset.formsAsCodeDerivedStart || `${dependency}.from`) || ''}T00:00:00Z`);
          const to = Date.parse(`${getAt(data, control.dataset.formsAsCodeDerivedEnd || `${dependency}.to`) || ''}T00:00:00Z`);
          const days = Number.isNaN(from) || Number.isNaN(to) ? '' : Math.floor((to - from) / 86400000) + 1;
          setAt(data, control.dataset.formsAsCode, days > 0 ? String(days) : '');
          continue;
        }
        setAt(data, control.dataset.formsAsCode, Object.prototype.hasOwnProperty.call(mapping, source) ? mapping[source] : '');
      }
      return data;
    }
    function collectData() {
      const data = {};
      for (const [path, group] of groups) setAt(data, path, valueOf(group));
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
      for (const element of form.querySelectorAll('[data-forms-as-code-visible-when]')) {
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
      const types = getAt(data, 'absenceTypes') || [];
      const statements = [];
      if (Array.isArray(types) && types.includes('Permanent Change of Station (PCS)')) statements.push('FOR EMERGENCIES: First try to contact your gaining and losing commanders. The Army Travel Assistance Center (ATAC) supports Soldiers in a PCS status, and Family members traveling on official orders, with emergency leave extensions and changes in port call. Contact ATAC at 1-800-833-6622, Option 5, or at 1-800-582-5552, or email ASKHRC.ARMY@US.ARMY.MIL.');
      if (getAt(data, 'absenceCategory') === 'NON-CHARGEABLE' || (Array.isArray(types) && types.some(type => type.includes('Non-Chargeable')))) statements.push('NON-CHARGEABLE ABSENCE: Is not directed by any official of the US Government. I cannot conduct public business under this authorization, and will not be reimbursed for travel, per diem, or any other expense. I may cancel this absence at any time and report back to my regular place of duty.');
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
        setAt(data, path, first.type === 'checkbox' ? (first.dataset.formsAsCodeMode === 'multiple' ? [] : false)
          : first instanceof HTMLSelectElement && first.multiple ? [] : '');
      }
      return normalizeDerived(data);
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
      for (const [path, group] of groups) setAt(data, path, exampleValue(path, group));
      setAt(data, meta.namePath, EXAMPLE_ROW_MARKER);
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
          value.forEach((item, index) => visit(item, path ? `${path}.${index}` : String(index)));
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
    function makeSubmission(data, isLocked = locked) {
      return { formatVersion: FORMAT_VERSION, id: makeId(), createdAt: new Date().toISOString(), template: { uri: template.uri, version: template.version }, locked: isLocked, data };
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
    function loadSubmission(submission) {
      if (submission?.formatVersion !== FORMAT_VERSION || submission.template?.uri !== template.uri || submission.template?.version !== template.version) throw new Error('Submission format or template reference does not match.');
      if (typeof submission.locked !== 'boolean' || typeof submission.id !== 'string') throw new Error('Submission envelope is incomplete.');
      syncRepeats(submission.data);
      prepare(submission.data, { allowPartial: true });
      populate(submission.data); setLocked(submission.locked);
      setStatus(submission.locked ? 'Loaded locked submission. Choose Unlock fields to edit.' : 'Loaded submission.');
    }

    function save() {
      if (!form.reportValidity()) return;
      const data = prepare(collectData(), { allowPartial: false });
      const submission = makeSubmission(data);
      saveBlob(new Blob([`${JSON.stringify(submission, null, 2)}\n`], { type: 'application/json' }), filenameFor(data));
      setStatus(locked ? 'Saved locked submission.' : 'Saved submission.');
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
      const referenceRows = rows.filter(({ row }) => row[referenceColumn]?.trim() === EXAMPLE_ROW_MARKER);
      const submissionRows = rows.filter(({ row }) => row[referenceColumn]?.trim() !== EXAMPLE_ROW_MARKER);
      if (!submissionRows.length) throw new Error(referenceRows.length ? `CSV contains only the reference row marked “${EXAMPLE_ROW_MARKER}”. Replace its name or delete it, then add submission rows.` : 'CSV has no populated submission rows.');
      if (submissionRows.length > 1000) throw new Error('A bulk load may contain at most 1,000 populated rows.');
      return submissionRows.map(({ row, number }) => {
        try {
          if (row.length !== headers.length) throw new Error(`Expected ${headers.length} columns but found ${row.length}.`);
          const data = blankData();
          headers.forEach((path, column) => setAt(data, path, csvCell(row[column], groups.get(path), path)));
          return prepare(data, { allowPartial: false });
        } catch (error) { throw new Error(`CSV record ${number}: ${error.message}`); }
      });
    }
    async function importCsv(file) {
      const rows = await readCsvData(file);
      const files = []; const counts = new Map();
      for (const data of rows) {
        const name = safeName(getAt(data, meta.namePath));
        const count = (counts.get(name) || 0) + 1; counts.set(name, count);
        const submission = makeSubmission(data, false);
        files.push({ name: filenameFor(data, count), content: `${JSON.stringify(submission, null, 2)}\n` });
      }
      saveBlob(createZip(files), `${meta.code}-submissions.zip`);
      setStatus(`Validated ${files.length} rows and saved ${meta.code}-submissions.zip.`);
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
      const cleanup = () => { batch.remove(); document.body.classList.remove('is-bulk-printing'); };
      window.addEventListener('afterprint', cleanup, { once: true });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.print();
    }
    document.querySelector('#save-submission').addEventListener('click', () => {
      try { save(); } catch (error) { setStatus(`Could not save: ${error.message}`); }
    });
    document.querySelector('#bulk-csv').addEventListener('click', () => {
      const headers = [...groups.keys()];
      const example = exampleData();
      const row = headers.map(path => csvEscape(csvValue(getAt(example, path))));
      const csv = `\uFEFF${headers.map(csvEscape).join(',')}\r\n${row.join(',')}\r\n`;
      saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${meta.code}-bulk-template.csv`);
      setStatus(`Downloaded CSV with a reference row. Delete it or replace the name marker “${EXAMPLE_ROW_MARKER}”; rows still carrying that marker are ignored on import.`);
    });
    document.querySelector('#lock-submission').addEventListener('click', () => {
      if (locked) { setLocked(false); setStatus('Fields are unlocked. Save to persist locked: false.'); return; }
      if (!form.reportValidity()) return;
      try { prepare(collectData(), { allowPartial: false }); setLocked(true); setStatus('Fields are locked. Save to persist locked: true.'); }
      catch (error) { setStatus(error.message); }
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
      try { await printCsv(file); } catch (error) { setStatus(`Could not print CSV: ${error.message}`); }
    });
    document.querySelector('#print-form').addEventListener('click', () => window.print());
    form.addEventListener('input', () => { syncDerivedControls(); syncConditionalVisibility(); syncAutomaticRemarks(); syncConditionalRequired(); setStatus('Unsaved changes.'); });
    form.addEventListener('change', () => { syncDerivedControls(); syncConditionalVisibility(); syncAutomaticRemarks(); syncConditionalRequired(); setStatus('Unsaved changes.'); });
    syncDerivedControls(); syncConditionalVisibility(); syncConditionalRequired();
    return { form, loadSubmission, importCsv, collectData };
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
    if (files.length > 1000) throw new Error('A bulk ZIP may contain at most 1,000 submissions.');
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
    setStatus(`Fetching the ${template.title} HTML template…`);
    const url = new URL(template.path, document.baseURI);
    if (url.origin !== window.location.origin) throw new Error('Template must be served from the forms-as-code app origin.');
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not fetch the HTML template (${response.status}).`);
    const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
    validateTemplateDocument(parsed, template);
    return parsed;
  }
  function validateTemplateDocument(parsed, expected) {
    if (parsed.querySelector('meta[name="forms-as-code:template-id"]')?.content !== expected.uri || parsed.querySelector('meta[name="forms-as-code:template-version"]')?.content !== expected.version) throw new Error('Template metadata does not match the trusted registry.');
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
    document.title = `${template.title} — forms-as-code`;
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
    document.querySelector('#change-template').hidden = false;
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
    activeForm.loadSubmission(submission);
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
      try { await activeForm.importCsv(file); } catch (error) { setStatus(`Could not load CSV: ${error.message}`); }
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

  setCatalogTemplates([...templates.values()]);
  function selectedTemplate() {
    const value = templateSearch.value.trim();
    return catalogTemplates.find(template => templateDisplayName(template) === value) || null;
  }
  templateSearch.addEventListener('input', () => {
    const query = templateSearch.value.trim().toLocaleLowerCase();
    templateOptions.replaceChildren(...catalogTemplates.filter(template => `${templateDisplayName(template)} ${template.title} ${template.code} ${template.version}`.toLocaleLowerCase().includes(query)).map(template => {
      const option = document.createElement('option'); option.value = templateDisplayName(template); option.dataset.templateKey = templateKey(template); return option;
    }));
  });
  document.querySelector('#create-form').addEventListener('click', async () => {
    const template = selectedTemplate();
    if (!template) { setStatus('Choose a form from the search suggestions first.'); return; }
    try { await renderTemplate(template); setStatus(`Started a blank ${template.title} submission.`); }
    catch (error) { setStatus(`Could not start form: ${error.message}`); }
  });
  document.querySelector('#change-template').addEventListener('click', () => { workspace.hidden = true; launcher.hidden = false; document.title = 'forms-as-code'; });
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
      setStatus(event.data.ok ? 'Opened submission in a new forms-as-code tab. Data was not uploaded.' : `Could not render submission: ${event.data.error}`);
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
  catalogUrlInput.value = catalogUrl();
  loadCatalog();
  loadCatalogButton.addEventListener('click', () => {
    const url = catalogUrlInput.value.trim();
    try { const parsed = new URL(url); if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Catalog URL must be a public HTTP(S) URL.'); localStorage.setItem(CATALOG_URL_KEY, parsed.href); loadCatalog(parsed.href); }
    catch (error) { setStatus(`Could not load the template catalog: ${error.message}`); }
  });
  const linked = new URLSearchParams(window.location.search).get('submission');
  if (linked) loadLinkedJson(linked).catch(error => setStatus(`Could not open linked submission: ${error.message}`));
  else if (window.opener && new URLSearchParams(window.location.search).has('handoff')) window.opener.postMessage({ type: 'forms-as-code:app-ready' }, window.location.origin);
})();
