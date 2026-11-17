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

A locked submission is rendered read-only until the user explicitly chooses **Unlock fields**. `locked` is application state only: it can be changed by editing the JSON or using the app's unlock control, and it is not tamper protection or proof of signing. Missing bindings in an incomplete draft default to blank or unchecked; unknown bindings and invalid provided values are rejected.

The template URI identifies a template but is not, by itself, proof that a retrieved template is original. Production submissions should pin an immutable template artifact, preferably with a digest. Digest algorithm and coverage still need a normative definition.

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

No signature structure or signing algorithm is defined. Signing design must specify canonicalization, the exact signed bytes and claims, certificate-chain and revocation validation, timestamps, and long-term evidence. It must also be checked against CAC/PIV policies and receiving systems. Do not treat the current JSON envelope as signed or tamper-evident.

The app generates CSV headers as dot-separated paths to nested JSON values and adds a reference row with example values inferred from the template's controls and field hints.
The reference row is marked in the name field and ignored on import until that marker is replaced.
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
