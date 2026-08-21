# Privacy Policy — RRID Annotator

*Last updated: 2026-08-21*

RRID Annotator is a Google Docs add-on that annotates research resources in your
document with RRID (Research Resource Identifier) citations.

## What it accesses

- **Your document text.** When you run an annotation or open the side panel, the
  add-on reads the selected text (or scans the document body for existing RRIDs) to
  detect resources and insert citations. It writes only the `(RRID:…)` citations you
  trigger.
- **Third-party lookups.** Candidate resource phrases and their surrounding sentence
  context are sent to the **SciCrunch registry API** (scicrunch.org) to find matching
  RRIDs. If you provide an Anthropic API key, short snippets (an ambiguous term plus
  its local context) are sent to the **Anthropic (Claude) API** to disambiguate
  meaning. These services process that text under their own privacy policies.

## What it stores

- Your SciCrunch and/or Anthropic **API keys** are stored using Google Apps Script
  Properties, scoped to your Google account, and are never displayed back to you or
  shared with other users. A maintainer-provided shared SciCrunch key may be stored
  at the project level.

## What it does not do

- The developer does not receive, store, or have access to your document content or
  your API keys. There is no analytics or tracking. No data is sold or shared beyond
  the SciCrunch and Anthropic lookups described above.

## Permissions

The requested scopes (`documents`, `script.external_request`, `script.container.ui`)
are used solely to read the active document and insert citations, call the lookup
APIs, and display the add-on's menu, dialogs, and side panel.

## Contact

alexdwade@gmail.com
