# Privacy Policy — RRID Annotator

*Last updated: 2026-08-26*

RRID Annotator is a Google Docs™ add-on that annotates research resources in your
document with RRID (Research Resource Identifier) citations.

## What it accesses

- **Your document text.** When you run an annotation or open the side panel, the
  add-on reads the selected text (or scans the document body for existing RRIDs) to
  detect resources and insert citations. It writes only the `(RRID:…)` citations you
  trigger.
- **SciCrunch registry lookups.** Each candidate resource phrase — the phrase alone,
  such as `ImageJ`, and not the text around it — is sent to the **SciCrunch registry
  API** (scicrunch.org) to find matching RRIDs. Surrounding context is used only on
  your device, inside the add-on, to score which registry record fits best; it is not
  transmitted to SciCrunch.
- **Optional disambiguation lookups.** Some resource names double as ordinary words
  ("Python", "NEURON"). The add-on decides which sense you meant from local context
  without contacting anyone. Only when that evidence is genuinely mixed, *and* only
  if you have supplied your own Anthropic API key, does it send a short snippet — the
  term plus roughly ten words on either side, clamped to the sentence it appears in —
  to the **Anthropic (Claude) API** for a one-word classification. This is at most one
  request per resource name, and none at all if you leave the Anthropic key unset.
- These services process the text they receive under their own privacy policies.

## What it stores

- Your SciCrunch and/or Anthropic **API keys** are stored using Google Apps Script™
  Properties, scoped to your Google Account™, and are never displayed back to you or
  shared with other users. A maintainer-provided shared SciCrunch key may be stored
  at the project level.

## What it does not do

- **Your document is never uploaded.** The add-on does not send the selected passage,
  the document body, or the document itself to any server. Only the short extracts
  described above — a resource phrase, or an optional sentence-length snippet — leave
  your device.
- The developer does not receive, store, or have access to your document or your API
  keys. There is no analytics or tracking. No data is sold, and nothing is shared
  beyond the SciCrunch and Anthropic lookups described above.
- The add-on keeps no copy of your document and no history of what it annotated.

## Error logs

One narrow exception to the above, stated plainly: when a registry lookup fails —
a network error or an error response from SciCrunch — the add-on writes a
diagnostic log line that includes the phrase it was looking up (for example,
`SciCrunch 503 for "ImageJ"`). Google Apps Script™ routes these to the developer's
error-reporting console. Nothing is logged on a successful lookup, no surrounding
document text is ever logged, and API keys are never logged.

## Permissions

The requested scopes (`documents`, `script.external_request`, `script.container.ui`)
are used solely to read the active document and insert citations, call the lookup
APIs, and display the add-on's menu, dialogs, and side panel.

## Contact

alexdwade@gmail.com

---

Google Docs™, Google Apps Script™, and Google Account™ are trademarks of Google LLC.
RRID Annotator is not created by, endorsed by, or affiliated with Google LLC.
SciCrunch and RRID are services of SciCrunch.org.
