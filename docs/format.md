# Draft format notes (0.1.0)

This is an exploratory contract, not a stable interoperability specification. Expect breaking changes.

## One app, one HTML template, one submission

A form has one self-contained HTML file in a trusted template source outside forms-as-code.
It contains form markup, template metadata, embedded presentation CSS, and `data-forms-as-code` bindings.
Common application behavior, including data binding, CSV/ZIP workflows, save/load, and printing, belongs to the forms-as-code app.

### Template authoring contract

Every loadable template must contain these non-empty identity elements in `<head>`:

```html
<meta name="forms-as-code:template-id" content="https://forms.example.org/forms-as-code/da-form-2404">
<meta name="forms-as-code:template-version" content="2026-08.1">
<meta name="forms-as-code:form-code" content="DA2404">
```

- `template-id` is the stable identifier shared by every edition of the same logical form.
- `template-version` identifies one immutable template artifact and must change when that artifact changes.
- `form-code` is the compact form designator used for display and filenames, such as `DA2404` or `DD1750`.
- The identity values in a fetched HTML document must exactly match its trusted catalog entry.
- A missing or mismatched identity value makes that individual template unusable because submissions could not be resolved safely.

Authors should also provide these non-empty display elements:

```html
<meta name="forms-as-code:form-title" content="Equipment Inspection and Maintenance Worksheet">
<meta name="forms-as-code:form-edition" content="AUG 2026">
<title>DA Form 2404 - Equipment Inspection and Maintenance Worksheet</title>
```

`form-title` contains the descriptive title without the form designator or edition.
`form-edition` contains the printed edition or revision, preferably in the source form's canonical format.
The browser can load a template without either display element, but marks its source yellow and uses a fallback title or omits the edition.
The canonical `forms` repository requires both display elements and `<title>` before its catalog can be published.

Every template must also satisfy these structural and safety requirements:

- Include a usable `<form data-forms-as-code-form>` container.
- Put `data-forms-as-code="path.to.value"` on each control whose value belongs in submission JSON.
- Use the same binding path consistently in HTML controls, submissions, and bulk CSV columns.
- Dot-separated path segments are object keys by default.
- A parent is an array only when all of its immediate child segments are decimal indexes and the set includes `0`; array indexes must be zero-based and contiguous.
- Do not mix numeric indexes and named keys under one parent.
- Use named keys such as `first`, `second`, and `average` for fixed semantic measurements rather than one-based numeric keys.
- Keep the file self-contained with form-specific CSS in `<style>` elements.
- Do not include `<script>`, executable event-handler attributes, iframes, embedded objects, external stylesheets, or elements that load external assets.
- Do not use CSS `@import` or `url(...)` resources.
- Use safe ordinary links when source material requires a hyperlink, never `javascript:` URLs.
- Include accessible labels and native HTML constraints for values that can be expressed declaratively.

Optional metadata currently recognized by the app includes:

```html
<meta name="forms-as-code:name-path" content="equipment.nomenclatureModel">
<meta name="forms-as-code:notice" content="Unofficial HTML recreation. Use fictional data only.">
```

`name-path` identifies the preferred bound value for generated filenames and CSV reference-row behavior.
`notice` supplies a user-facing template notice.
Omitting optional metadata does not invalidate a template.

A bad file or catalog entry is isolated from its siblings.
The source remains available when at least one valid template loads, and the settings drawer reports skipped files, invalid entries, and missing display metadata as warnings.
A source fails completely only when its catalog is invalid, cannot be fetched, or contains no valid templates.

A submission is a JSON file containing a format version, unique ID, reference to the template ID and immutable version, a boolean `locked` state, and structured `data`.
The app resolves that exact identity through ordered, validated template sources and fetches only the catalog-approved HTML path from the catalog's own origin.
It never blindly fetches a URI supplied by untrusted JSON.

The `example.org` template URIs are identifiers, not retrieval locations, and must not be treated as live services.
The app currently uses HTML controls and binding attributes for field metadata and validation.
A separate per-form schema or manifest is not loaded.

## Submission behavior

A locked submission is rendered read-only until the user explicitly chooses **Unlock fields**.
When a locked submission is saved, the app stores an `integrity` record containing a SHA-256 digest.
The covered payload contains only `formatVersion`, `template` (`uri`, `version`, and `sha256` when available), and `data`.
It deliberately excludes mutable envelope metadata such as `id`, `createdAt`, `locked`, `integrity`, and future signature records.
The payload is serialized using RFC 8785 JSON Canonicalization Scheme semantics and hashed as UTF-8 bytes.
The current data model contains JSON-compatible strings, booleans, arrays, objects, and finite numbers, for which the app's canonical serializer produces RFC 8785-compatible output.

The digest detects accidental or deliberate changes to covered content when the file is loaded through the app, but it is not a signature because anyone can edit the content and calculate a replacement digest.
`locked` remains application state and can be changed by editing the JSON or using **Unlock fields**.
Unlocking and saving removes `integrity`; locking and saving creates a new digest.
A locked file with missing, malformed, or mismatched integrity metadata is rejected before its data is populated.
Integrity is also verified whenever the record exists, even if `locked` is false, so inconsistent envelopes cannot bypass verification by changing the UI-state flag.
Validation and derived-field normalization operate on a clone after verification and do not mutate the covered submission data.
Missing bindings in an incomplete draft default to blank or unchecked; unknown bindings and invalid provided values are rejected.

The template URI identifies a template but is not, by itself, proof that a retrieved template is original.
The integrity payload includes a template artifact digest when the trusted catalog supplies `template.sha256`; otherwise it binds only the template URI and version.

## Binding behavior to preserve

A future renderer should:

- resolve only explicitly trusted templates;
- pin exact immutable versions and provide offline use of cached templates;
- verify template integrity before use;
- bind submitted values as text, not interpret them as HTML;
- support partial drafts while validating all supplied values;
- reject or clearly report unknown data paths;
- keep template identity and signed submission data tied together in any signing workflow.

`data-forms-as-code` and its small declarative attributes are a minimal binding convention, not a finalized templating language.

## Signing and bulk workflows

No signature structure or signing algorithm is defined.
The integrity digest establishes a candidate canonical payload for later signing, but provides no signer identity or authenticity by itself.
Signing design must still specify the exact signed bytes and claims, certificate-chain and revocation validation, timestamps, and long-term evidence.
It must also be checked against CAC/PIV policies and receiving systems.
Do not describe an integrity-only submission as signed.

The app generates a three-row CSV template.
The first row contains stable dot-separated machine paths that map exactly to submission JSON.
The second row contains human-readable field labels derived from `data-forms-as-code-csv-label`, a concise accessible label, or a humanized binding path.
Long accessible instructions are not reused as CSV labels.
Template authors should provide a brief `data-forms-as-code-csv-label` when the ordinary accessible label is ambiguous outside the visual form, especially for repeated rows and sections.
CSV labels should identify the section, field, and row only when needed, avoid instructions already shown in the example row, and target 40 characters or fewer.
The renderer normalizes whitespace and limits generated labels to 72 characters.
The third row contains example values inferred from the controls and field hints.
The label and example rows carry reserved markers in the configured name column and are ignored on import.
Users add ordinary submission rows beneath them without changing the machine-header row.
The app validates all populated rows before creating a ZIP or combined print document.
A combined print renders up to 1,000 records locally, separates records with page breaks, and uses the browser print dialog to save one PDF.
The app processes CSV contents in the browser and does not send them to a server, but browser memory and print performance depend on the template and batch size.
Repeated groups and a fully normative CSV dialect remain open.

## Open decisions

- Template discovery, URI rules, distribution, and repository transport.
- A normative template format and digest coverage.
- Cache layout, integrity verification, and offline UX.
- Binding syntax, localization, accessibility, conditionals, and repeatable fields.
- Signature container and CAC/PIV integration.
- Durable archival output and long-term template availability.
- License, implementation language, renderer, and validation toolchain.
