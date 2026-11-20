# Deployment configuration

A deployment reads `site.config.json` from the same directory as `app.js`.
Configuration controls presentation and trusted template sources without adding organization-specific behavior to the renderer.
See [`../configs/example.json`](../configs/example.json) for a complete example and [`../configs/default.json`](../configs/default.json) for the neutral default.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `siteName` | string | No | Product name shown in the header and browser title. |
| `tagline` | string | No | Short text shown below the site name. |
| `footer` | string | No | Deployment notice shown in the application footer. |
| `sourceUrl` | string or `false` | No | Public HTTP(S) project link, or `false` to hide the source link. |
| `sourceLabel` | string | No | Link text used when `sourceUrl` is enabled. |
| `favicon` | string | No | Relative or same-origin `.svg`, `.png`, or `.ico` resource. |
| `appearance` | object | No | Organization-controlled color overrides described below. |
| `catalogs` | array | Yes | Ordered trusted catalog sources. An empty array is valid and starts without remote templates. |

Unknown fields are ignored.
Missing optional fields use neutral built-in defaults.
Malformed JSON, a non-object root, an invalid `catalogs` value, or an invalid catalog URL causes the app to use all built-in defaults.
Invalid optional source-link, favicon, and color values are ignored independently.

## Appearance fields

All appearance values are CSS colors.
Omitted values retain the neutral renderer defaults.

| Field | Use |
| --- | --- |
| `primary` | Header and primary control color in light mode. |
| `primaryDark` | Darker primary color used for emphasis and hover states. |
| `accent` | Focus, status, and supporting accent color. |
| `headerText` | Text color displayed over the primary header. |
| `darkText` | Main text color in dark mode. |
| `darkBackground` | Page background in dark mode. |
| `darkSurface` | Panel and control surface in dark mode. |
| `darkBorder` | Borders in dark mode. |
| `darkHover` | Hovered control surface in dark mode. |
| `darkDropZone` | File drop-zone surface in dark mode. |
| `darkDropZoneBorder` | File drop-zone border in dark mode. |
| `darkMuted` | Secondary text in dark mode. |

Branding colors are deployment configuration, while light or dark mode remains an individual browser preference.

## Catalog entries

Each item in `catalogs` has this shape:

```json
{
  "label": "Public example forms",
  "url": "./examples/catalog.json"
}
```

`label` is the source name shown to users.
`url` must resolve to a public HTTP(S) catalog without embedded credentials.
Relative URLs are resolved from the deployed application URL and are useful when templates ship with the static site.
Catalogs earlier in the array take precedence when the same template identity and version appears more than once.
A user's browser-saved non-empty source list overrides configured defaults until the user changes or clears browser storage.

Catalogs and templates may be same-origin or hosted elsewhere.
Cross-origin hosts must permit credential-free `GET` requests through CORS.
Credentials, API keys, signed URLs, and storage-provider SDK settings do not belong in this file.

## Local development

Run the neutral deployment with:

```sh
./serve.sh
```

Run a selected configuration without copying it into `app/` with:

```sh
./serve.sh configs/example.json
```

Static deployment tooling should copy its selected configuration to `site.config.json` beside the application files.
