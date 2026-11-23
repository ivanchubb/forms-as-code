/* Client-certificate authentication acknowledgment for the forms-as-code app.
 *
 * When a form is submitted, this script makes one request to the mTLS-protected
 * /api/whoami endpoint. A successful TLS handshake authenticates the user's
 * login certificate. The script then places the authenticated certificate name
 * and the current date in the selected signature fields, then locks the fields
 * above the signature.
 *
 * This is an authentication acknowledgment, not a cryptographic signature over
 * the form. The browser does not expose the mTLS private key or handshake
 * signature to JavaScript, and no signed record is created or stored.
 */
(() => {
  // ---------------------------------------------------------------------------
  // mTLS service configuration and authentication state
  // ---------------------------------------------------------------------------

  const CLIENT_CERTIFICATE_API = `https://${location.hostname}:8444`;
  const EXPECTED_APP_ORIGIN = 'https://localhost:8443';

  let signingInProgress = false;

  // ---------------------------------------------------------------------------
  // Signature date formatting
  // These formats match data-forms-as-code-signature-date values.
  // ---------------------------------------------------------------------------

  const MONTHS = [
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
  ];
  const padTwoDigits = (value) => String(value).padStart(2, '0');
  const DATE_FORMATTERS = {
    'YYYYMMDD': (date) =>
      `${date.getFullYear()}${padTwoDigits(date.getMonth() + 1)}` +
      `${padTwoDigits(date.getDate())}`,
    'YYYY-MM-DD': (date) =>
      `${date.getFullYear()}-${padTwoDigits(date.getMonth() + 1)}` +
      `-${padTwoDigits(date.getDate())}`,
    'DDMMMYYYY': (date) =>
      `${padTwoDigits(date.getDate())}${MONTHS[date.getMonth()]}` +
      `${date.getFullYear()}`,
    'MMDDYYYY': (date) =>
      `${padTwoDigits(date.getMonth() + 1)}` +
      `${padTwoDigits(date.getDate())}${date.getFullYear()}`,
    'MM/DD/YYYY': (date) =>
      `${padTwoDigits(date.getMonth() + 1)}` +
      `/${padTwoDigits(date.getDate())}/${date.getFullYear()}`,
    'DD/MM/YYYY': (date) =>
      `${padTwoDigits(date.getDate())}` +
      `/${padTwoDigits(date.getMonth() + 1)}/${date.getFullYear()}`,
  };

  // ---------------------------------------------------------------------------
  // Signing progress dialog
  // ---------------------------------------------------------------------------
  const style = document.createElement('style');
  style.textContent = `
    .certificate-dialog { width:min(640px, calc(100vw - 32px)); border:1px solid #c2ccd5; border-radius:12px; padding:0; color:#17202a; background:#fff; font:15px/1.5 system-ui, Arial, sans-serif; box-shadow:0 10px 40px #0004; }
    .certificate-dialog::backdrop { background:#0f1d2a88; }
    .certificate-dialog header { padding:12px 20px; background:#15334b; color:#fff; font-weight:700; }
    .certificate-dialog .certificate-body { padding:18px 20px 20px; }
    .certificate-dialog p { margin:0 0 10px; }
    .certificate-dialog .certificate-status { font-weight:600; min-height:1.5em; }
    .certificate-dialog .certificate-ok { color:#1d7a46; } .certificate-dialog .certificate-err { color:#b42318; } .certificate-dialog .certificate-warn { color:#9a6724; }
    .certificate-dialog .certificate-row { display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; }
    .certificate-dialog button { padding:.5rem .9rem; border:1px solid #617386; border-radius:.25rem; color:#18344b; background:#fff; font:inherit; cursor:pointer; }
    .certificate-dialog button.certificate-primary { color:#fff; background:#164b75; border-color:#164b75; }
    .certificate-dialog button:disabled { opacity:.5; cursor:not-allowed; }
    .certificate-dialog a { color:#164b75; }
    @media print { .certificate-dialog { display:none !important; } }`;
  document.head.append(style);

  function createElement(tagName, properties = {}, ...children) {
    const element = Object.assign(document.createElement(tagName), properties);
    element.append(...children);
    return element;
  }

  const signingDialog = createElement(
      'dialog', {className: 'certificate-dialog'});
  const dialogStatus = createElement(
      'p', {className: 'certificate-status'});
  const dialogIntroduction = createElement('p');
  const dialogActions = createElement(
      'div', {className: 'certificate-row'});
  signingDialog.append(
      createElement(
          'header', {textContent: 'Authenticate with your certificate'}),
      createElement(
          'div', {className: 'certificate-body'}, dialogIntroduction,
          dialogStatus, dialogActions),
  );
  signingDialog.addEventListener('cancel', (event) => {
    if (signingInProgress) {
      event.preventDefault();
    }
  });
  document.body.append(signingDialog);

  function setDialogStatus(message, statusClass = '') {
    dialogStatus.textContent = message;
    dialogStatus.className = `certificate-status ${statusClass}`;
  }

  function createButton(text, onClick, primary = false) {
    const button = createElement('button', {
      type: 'button',
      textContent: text,
      className: primary ? 'certificate-primary' : ''
    });
    button.addEventListener('click', onClick);
    return button;
  }

  function createCloseButton() {
    return createButton('Close', () => signingDialog.close());
  }

  // ---------------------------------------------------------------------------
  // Single-step mTLS authentication acknowledgment
  // ---------------------------------------------------------------------------

  async function authenticateWithClientCertificate() {
    const response = await fetch(`${CLIENT_CERTIFICATE_API}/api/whoami`, {
      credentials: 'include',
      cache: 'no-store'
    });
    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok || !responseBody.present) {
      throw new Error(responseBody.error || response.statusText || 'No client certificate presented');
    }
    return responseBody;
  }

  function validateControlValue(control, value) {
    const bindingPath = control.dataset.formsAsCode;
    const pattern = control.getAttribute('pattern');
    if (control.maxLength >= 0 && value.length > control.maxLength) {
      throw new Error(`"${value}" (${value.length} characters) does not fit field ${bindingPath} (maxlength ${control.maxLength})`);
    }
    if (pattern && !new RegExp(`^(?:${pattern})$`).test(value)) {
      throw new Error(`"${value}" does not match the pattern of field ${bindingPath}`);
    }
  }

  function applyAuthenticationAcknowledgment(form, signatureGroup, certificateIdentity, signatureTrigger) {
    const signerName = certificateIdentity.subject?.CN || '';
    if (!signerName) throw new Error('The authenticated client certificate has no common name');

    const signatureControls = [...form.querySelectorAll('[data-forms-as-code-signature][data-forms-as-code]')]
      .filter(control => control.dataset.formsAsCodeSignature === signatureGroup);
    const signatureDateControls = [...form.querySelectorAll('[data-forms-as-code-signature-date][data-forms-as-code]')]
      .filter(control => (control.dataset.formsAsCodeSignatureFor || '') === signatureGroup);
    const acknowledgedAt = new Date();

    for (const control of signatureControls) validateControlValue(control, signerName);
    for (const control of signatureDateControls) {
      const format = (control.dataset.formsAsCodeSignatureDate || 'YYYYMMDD').toUpperCase();
      const formatter = DATE_FORMATTERS[format];
      if (!formatter) throw new Error(`Unknown signature date format ${format}`);
      validateControlValue(control, formatter(acknowledgedAt));
    }

    for (const control of signatureControls) control.value = signerName;
    for (const control of signatureDateControls) {
      const format = (control.dataset.formsAsCodeSignatureDate || 'YYYYMMDD').toUpperCase();
      control.value = DATE_FORMATTERS[format](acknowledgedAt);
    }

    renderSignatureControls();

    form.dispatchEvent(new Event('input', { bubbles: true }));
    const controlsAboveSignature = [...form.querySelectorAll('[data-forms-as-code]')]
      .filter(control => control.compareDocumentPosition(signatureTrigger) & Node.DOCUMENT_POSITION_FOLLOWING);
    const lockedPaths = [...controlsAboveSignature, ...signatureControls, ...signatureDateControls]
      .map(control => control.dataset.formsAsCode);
    form.dispatchEvent(new CustomEvent('forms-as-code-lock-fields', {
      bubbles: true,
      detail: { paths: [...new Set(lockedPaths)] }
    }));

    const completionMessage = `Authenticated with your certificate as ${signerName} at ${acknowledgedAt.toLocaleString()}. ` +
      'This is an mTLS authentication acknowledgment, not a cryptographic signature over the form. Use Print or Save to keep a copy.';
    for (const selector of ['#form-status', '#app-status']) {
      const statusOutput = document.querySelector(selector);
      if (statusOutput) statusOutput.textContent = completionMessage;
    }
  }

  async function acknowledgeSubmission(form, signatureGroup, signatureTrigger) {
    signingInProgress = true;
    dialogActions.replaceChildren();
    dialogIntroduction.textContent = 'Authenticate once with your certificate login certificate. The authenticated name and current date will be placed in the form before it is locked.';
    if (!signingDialog.open) signingDialog.showModal();
    try {
      setDialogStatus('Authenticating with your certificate (pick your certificate and enter your PIN)');
      const certificateIdentity = await authenticateWithClientCertificate();
      applyAuthenticationAcknowledgment(form, signatureGroup, certificateIdentity, signatureTrigger);
      signingDialog.close();
    } catch (error) {
      const serviceDidNotRespond = error instanceof TypeError;
      setDialogStatus(`Could not authenticate with your certificate: ${error.message}.${serviceDidNotRespond ? ' Is the card inserted and the middleware installed?' : ''}`, 'certificate-err');
      if (serviceDidNotRespond) {
        dialogIntroduction.replaceChildren(
          'The browser could not reach the mTLS authentication endpoint. Open ',
          createElement('a', {
            href: `${CLIENT_CERTIFICATE_API}/api/whoami`,
            target: '_blank',
            rel: 'noopener',
            textContent: `${CLIENT_CERTIFICATE_API}/api/whoami`
          }),
          ' in a new tab, accept the certificate warning if one appears, choose your certificate, then submit the form again.',
          ...(location.origin !== EXPECTED_APP_ORIGIN
            ? [` Also open this app at ${EXPECTED_APP_ORIGIN}${location.pathname}: it is open at ${location.origin}, which the service does not accept.`]
            : [])
        );
      }
      dialogActions.replaceChildren(createCloseButton());
    } finally {
      signingInProgress = false;
    }
  }

  // A signature *button* (e.g. the form's submit button with
  // data-forms-as-code="signature.requestor" data-forms-as-code-signature) keeps
  // the authenticated name as its value, which forms-as-code saves and loads like
  // any field. Show that name as the button's text; with no name, its original text.
  function renderSignatureControls() {
    // A placeholder enables :placeholder-shown for the in-field signing button.
    for (const signatureInput of document.querySelectorAll('#template-host input[data-forms-as-code-signature][data-forms-as-code]')) {
      if (!signatureInput.hasAttribute('placeholder')) signatureInput.setAttribute('placeholder', ' ');
      if (!signatureInput.hasAttribute('title')) signatureInput.setAttribute('title', 'Authenticate with your certificate');
    }
    for (const signatureButton of document.querySelectorAll('#template-host button[data-forms-as-code-signature][data-forms-as-code]')) {
      if (signatureButton.dataset.certificateLabel === undefined) {
        signatureButton.dataset.certificateLabel = signatureButton.textContent;
      }
      const displayedLabel = signatureButton.value || signatureButton.dataset.certificateLabel;
      if (signatureButton.textContent !== displayedLabel) signatureButton.textContent = displayedLabel;
      signatureButton.classList.toggle('forms-as-code-signed', Boolean(signatureButton.value));
    }
  }

  // Keep controls synchronized when app.js loads a submission or replaces a template.
  const templateHost = document.querySelector('#template-host');
  if (templateHost) {
    new MutationObserver(renderSignatureControls)
      .observe(templateHost, { subtree: true, childList: true, attributes: true, attributeFilter: ['value'] });
  }

  // form.reset() does not clear button values, so clear signature buttons explicitly.
  document.addEventListener('reset', event => {
    if (!(event.target instanceof HTMLFormElement)) return;
    for (const signatureButton of event.target.querySelectorAll('button[data-forms-as-code-signature][data-forms-as-code]')) {
      signatureButton.value = '';
    }
  }, true);

  // ---------------------------------------------------------------------------
  // Signature triggers
  // Signature inputs and submit buttons can select a documented signature group.
  // ---------------------------------------------------------------------------

  function getSignatureGroup(trigger) {
    if (!trigger) return '';
    return trigger.dataset.formsAsCodeSignature ?? trigger.dataset.formsAsCodeSign ?? '';
  }

  let pendingSignatureTrigger = null;

  function submitFromSignatureInput(signatureInput) {
    const form = signatureInput.closest('form[data-forms-as-code-form]');
    if (!form || signatureInput.disabled || signingInProgress) return;
    pendingSignatureTrigger = signatureInput;
    try {
      form.requestSubmit();
    } finally {
      // The submit event fires synchronously, so the handler already captured it.
      pendingSignatureTrigger = null;
    }
  }

  function findSignatureInput(target) {
    return target instanceof Element
      ? target.closest('#template-host input[data-forms-as-code-signature][data-forms-as-code]')
      : null;
  }

  document.addEventListener('click', event => {
    const signatureInput = findSignatureInput(event.target);
    if (signatureInput) submitFromSignatureInput(signatureInput);
  });
  document.addEventListener('keydown', event => {
    const signatureInput = findSignatureInput(event.target);
    if (signatureInput && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      submitFromSignatureInput(signatureInput);
    }
  });
  // Draw a "Sign With Certificate button inside each empty, unlocked signature input
  // (as its background, right-aligned), so the field itself is the button. It
  // disappears once the field holds the authenticated name, when the form is locked,
  // and on paper. :placeholder-shown means "empty"; renderSignatureControls()
  // gives every signature input a placeholder so that works.
  // ---------------------------------------------------------------------------
  // In-field "Sign with certificate" presentation
  // The background disappears after signing, when disabled, and when printed.
  // ---------------------------------------------------------------------------

  const signWithCertificateButtonSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="112" height="24" viewBox="0 0 112 24">
    <rect x="0.5" y="0.5" width="111" height="23" rx="4" fill="#164b75" stroke="#0f3654"/>
    <text x="56" y="16.5" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="12"
          font-weight="600" fill="#ffffff">Sign with certificate</text></svg>`;
  const signatureInputStyle = document.createElement('style');
  signatureInputStyle.textContent = `
    #template-host input[data-forms-as-code-signature]:not(:disabled) { cursor:pointer; }
    #template-host input[data-forms-as-code-signature]:not(:disabled):placeholder-shown {
      background-image:url("data:image/svg+xml,${encodeURIComponent(signWithCertificateButtonSvg)}") !important;
      background-repeat:no-repeat !important;
      background-position:right 2px center !important;
      background-size:auto calc(100% - 4px) !important;
    }
    #template-host input[data-forms-as-code-signature]:not(:disabled):placeholder-shown:hover { filter:brightness(1.08); }
    @media print {
      #template-host input[data-forms-as-code-signature] { background-image:none !important; }
      #template-host input[data-forms-as-code-signature]::placeholder { color:transparent; }
    }`;
  document.head.append(signatureInputStyle);

  // ---------------------------------------------------------------------------
  // Form submission interception
  // Native validation runs first; this handler replaces browser navigation with
  // the one-step mTLS authentication acknowledgment.
  // ---------------------------------------------------------------------------

  document.addEventListener('submit', event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches('#template-host form[data-forms-as-code-form]')) return;
    event.preventDefault();
    if (!signingInProgress) {
      const signatureTrigger = pendingSignatureTrigger || event.submitter;
      acknowledgeSubmission(form, getSignatureGroup(signatureTrigger), signatureTrigger);
    }
  }, true);
})();
