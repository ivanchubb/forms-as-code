# Certificate authentication for forms-as-code

## Current implementation

The current release implements an **mTLS client-certificate authentication
acknowledgment**. It does not cryptographically sign the form and does not
provide non-repudiation.

When a user activates a signature field, `certificate-sign.js` calls the
mTLS-protected `/api/whoami` endpoint. A successful TLS handshake authenticates
the client certificate. The browser then places the certificate identity and
current date into the selected fields and locks the fields above the signature.
The user can use the app's **Print** or **Save** action to retain a copy.

The browser cannot access the TLS private key or handshake signature. Therefore,
the saved JSON, printed form, entered identity, date, and lock state are not a
cryptographic signature, tamper evidence, or proof of non-repudiation.

The server serves the app and sibling `forms` repository from one HTTPS origin
and injects:

```html
<script defer src="/certificate/certificate-sign.js"></script>
```

## What a form template needs

No script is needed (forms-as-code templates may not contain any): only these
attributes, which `certificate-sign.js` reads.

| Attribute | On | Meaning |
|---|---|---|
| `data-forms-as-code-signature` | the signature field | The server puts the signer's certificate name here. On an `<input>`, clicking the field (or Enter/Space) starts signing. Give it a name (`="supervisor"`) when the form has more than one signature |
| `data-forms-as-code-signature-date="YYYYMMDD"` | a date field | The server puts the signing date here, in that format |
| `data-forms-as-code-signature-for="supervisor"` | a date field | Which signature the date belongs to (omit when there is only one) |
| `data-forms-as-code-sign="supervisor"` | a submit button | Optional: a separate button that makes the named signature |

Date formats: `YYYYMMDD` (default), `YYYY-MM-DD`, `DDMMMYYYY`, `MMDDYYYY`,
`MM/DD/YYYY`, `DD/MM/YYYY`.

**One signature, the field is the "Sign with certificate" button** (`certificate-sign.js` draws a "Sign with certificate" button inside the empty field; it disappears once the field shows the signed name, when the form is locked, and on paper):

```html
<div class="signature-row">
  <label class="wide">11. SIGNATURE
    <input data-forms-as-code="signature.requestor" data-forms-as-code-signature
           readonly maxlength="64">
  </label>
  <label class="wide">DATE
    <input data-forms-as-code="signature.requestorDate" data-forms-as-code-signature-date="YYYYMMDD"
           pattern="[0-9]{8}" maxlength="8">
  </label>
</div>
```

**Several signatures** (each signer clicks their own field; only that
signature's name and date are filled):

```html
<label class="wide">11. SIGNATURE
  <input data-forms-as-code="signature.requestor" data-forms-as-code-signature="requestor"
         readonly maxlength="64">
</label>
<label class="wide">DATE
  <input data-forms-as-code="signature.requestorDate" data-forms-as-code-signature-date="YYYYMMDD"
         data-forms-as-code-signature-for="requestor" pattern="[0-9]{8}" maxlength="8">
</label>

<label class="wide">14. SUPERVISOR SIGNATURE
  <input data-forms-as-code="supervisor.signature" data-forms-as-code-signature="supervisor"
         readonly maxlength="64">
</label>
<label class="wide">DATE
  <input data-forms-as-code="supervisor.date" data-forms-as-code-signature-date="YYYYMMDD"
         data-forms-as-code-signature-for="supervisor" pattern="[0-9]{8}" maxlength="8">
</label>
```

Other ways that also work: a separate `<button type="submit">` (add
`data-forms-as-code-sign="supervisor"` to pick a named signature), or a
`<button type="submit" data-forms-as-code="signature.requestor" data-forms-as-code-signature>`
that is itself the signature box and shows the signed name as its text.

After acknowledgment, every bound control before the signature trigger in
document order is disabled, while later fields remain editable. **Save** writes
those binding paths to `lockedFields`, and loading that JSON restores the partial
lock. The selected identity and date controls are also locked, even when a date
control occurs after the trigger.

The browser's own checks (`required`, `pattern`, `maxlength`) run before
authentication. Don't mark a later user's fields `required`; use
`data-forms-as-code-required-when`. The placeholder text and drawn button are not
printed. **Without the mTLS server, clicking the field does nothing.**

With several users, the first user can acknowledge and lock a completed section,
click **Save**, and send the JSON onward. The next user can **Load** it and fill
in the remaining editable section. **These saved values and locks remain
application state, not cryptographic signatures.**

The server returns the name from the authenticated client certificate (for
example, `DOE.JANE.M.1234567890`), and the browser fills that name and the current
date. The authenticated identity cannot be typed into these read-only controls
through the normal UI, but it is not cryptographically bound to a saved form.
Use **Print** or **Save** to keep an unsigned acknowledgment copy.


## How the current acknowledgment works

```text
Browser (forms-as-code app)              mTLS endpoint
  + certificate-sign.js
───────────────────────────              ─────────────
User activates a signature field
  1. GET /api/whoami ──────────────────► requests a client certificate
                                          and validates the TLS identity
  2. ◄────────────────────────────────── returns certificate identity
  3. fills the selected identity/date fields
  4. locks the signature and fields above it
  5. user may Print or Save an unsigned copy
```

This provides certificate-backed authentication at the time of the TLS request.
It does not bind the certificate to the form's exact bytes, saved JSON,
template, or later edits.

## Run the server

```bash
# 1. Make a localhost server certificate (Python 3.9+ is required)
mkdir -p certs
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout certs/server-key.pem -out certs/server-cert.pem \
  -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost"

# 2. Add the CA certificates that issue accepted client certificates
cp /path/to/your-client-cas.pem certs/client-ca.pem

# 3. Start
python3 server.py
```

Then open **https://localhost:8443** (it redirects to the forms-as-code app at
`/forms-as-code/app/`). Templates are loaded from the sibling `forms`
repository (`../forms` next to the forms-as-code folder), as the app expects.

| Option | What it does |
|---|---|
| `--forms-as-code DIR` (or `FORMS_AS_CODE_DIR`) | Where the forms-as-code repository is |
| `--certs-dir DIR` | Use certificates from another folder, e.g. an existing deployment's `certs` |
