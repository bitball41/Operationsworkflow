# OpenScout engine provenance

These classic browser modules were copied from `bitball41/openscout` at commit
`6058ef5b0daec85399b523f8c42d23b6d32ef1d5`:

| Operations Workflow file | OpenScout source |
| --- | --- |
| `classify.js` | `js/classify.js` |
| `verify.js` | `js/verify.js` |
| `location.js` | `js/location.js` |
| `storage.js` | `js/storage.js` |
| `google-places.js` | `js/googlePlaces.js` |

The copied engine retains OpenScout's global `window.OpenScout` API. The only
engine patch is the `radiusKm` search option in `google-places.js`, bounded to
1–80 km before OpenScout calculates the tile bounds.

`adapter.js` is Operations Workflow code. It calls the engine and converts its
results into normalized dashboard leads while retaining source metadata. It
also prevents direct arbitrary-origin website probes on hosted builds, where
the dashboard's narrow Content Security Policy would otherwise make blocked
requests look like dead sites. The copied verification logic itself is
unchanged and remains available in local/file previews.

`tests/openscout-engine.test.cjs` is the upstream OpenScout pure-logic test suite
with only its import paths changed to target these copied modules.
