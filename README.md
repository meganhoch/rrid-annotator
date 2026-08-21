# RRID Annotator

A Google Docs add-on that finds research resources in your text and annotates them
with citable **RRIDs** (Research Resource Identifiers) from the
[SciCrunch](https://scicrunch.org/) registry.

Select a block of text and the add-on scans it for research resources — software,
tools, databases, and other registered resources — looks each one up in SciCrunch,
and inserts a linked RRID citation (e.g. `(RRID:SCR_002333)`) at the resource's
first mention. Ambiguous terms (like *NEURON* the simulator vs. a nerve cell) are
resolved with local context heuristics and an optional Claude-powered fallback. A
side panel lists every RRID in the document so you can review, jump to, and toggle
each annotation.

<img width=90%  alt="image" src="https://github.com/user-attachments/assets/fe3cfc0c-e5db-432d-a8f3-f5fa92600498" />

<br>
RRIDs make methods sections reproducible: each identifier resolves (via
[n2t.net](https://n2t.net/)) to a single, unambiguous record for the resource an
author actually used.

## Features

- **One-click annotation** — select text, run **RRID → Annotate Selection**, and
  matched resources are cited inline with a hyperlink to their registry record.
- **First-instance-only** — each resource is annotated once, at its first mention;
  it won't re-annotate a resource already cited elsewhere in the document.
- **Context-aware disambiguation** — a term that name-matches a resource is only
  annotated if its local context actually refers to that resource. Cues are derived
  from the SciCrunch record plus generic software/biological signal lists; genuinely
  ambiguous cases fall back to an LLM (optional).
- **Resource side panel** — **RRID → Open RRID Panel** lists every RRID in the
  document; click one to see its details inline, jump the cursor to its citation, or
  toggle the annotation off/on.
- **Diagnostics** — **RRID → Diagnose Selection** shows the extracted candidates and
  the raw SciCrunch top-10 with scores, so you can see exactly why a term did or
  didn't match.
- **Bring-your-own keys** — each user stores their own API keys via the **Settings**
  dialog; keys live in per-user Apps Script storage, never in the source.

## How it works

1. **Candidate extraction** (`Extractor.gs`) pulls candidate resource phrases from the
   selected text.
2. **Registry lookup** (`SciCrunch.gs`) queries the SciCrunch registry for each
   candidate and scores the hits.
3. **Disambiguation** (`Disambiguator.gs`, `Scorer.gs`) decides whether a candidate,
   in its local context, actually refers to the matched resource. Confident cases are
   decided locally; uncertain ones optionally consult Claude.
4. **Annotation** (`Code.gs`) inserts the `(RRID:…)` citation with a hyperlink at the
   first occurrence, and powers the side panel and settings UI.

## Requirements

- A **SciCrunch API key** (required) — get one from your
  [SciCrunch account](https://scicrunch.org/).
- An **Anthropic API key** (optional) — enables the LLM disambiguation fallback.
  Uses Claude Haiku for a one-word classification per ambiguous term, so cost is
  negligible. Without it, ambiguous terms fall back to keyword rules only.

## Configuration

Open **RRID → Settings…** in the document. Each key is stored only in *your* Google
account for this add-on (Apps Script `UserProperties`) and is never shown back in the
UI or shared with other users.

- **SciCrunch API key** — required. If a shared project key is configured (see below),
  leave this blank to use it, or enter your own to override.
- **Anthropic API key** — optional; enables LLM disambiguation.

### Shared SciCrunch key (optional, for maintainers)

To let testers use the add-on without each obtaining their own SciCrunch key, set a
shared default as a **Script Property** rather than hardcoding it in source:

1. In the Apps Script editor: **Project Settings** (⚙️) → **Script Properties**.
2. Add `SCICRUNCH_API_KEY_SHARED` = your SciCrunch key.

`getApiKey()` resolves in order: the user's own key → the shared project key → none.
The shared key is used server-side and never rendered in the Settings dialog. **Do
not** configure a shared *Anthropic* key this way — it is a paid credential and
should remain bring-your-own.

## Development

This is a [clasp](https://github.com/google/clasp)-managed Google Apps Script
project (a Google Docs Editor Add-on).

```bash
npm install -g @google/clasp
clasp login

# Bind to your own Apps Script project (creates a local .clasp.json — gitignored):
#   - existing script:  clasp clone <scriptId>
#   - new container-bound script from a Doc: create it via Extensions → Apps Script,
#     then `clasp clone` its scriptId
clasp push          # deploy source to your Apps Script project
```

`.clasp.json` (your `scriptId` / bound-Doc `parentId`) is intentionally gitignored —
each developer points at their own Apps Script project.

### OAuth scopes

Declared in `appsscript.json`:

- `documents` — read the document and insert citations
- `script.external_request` — call the SciCrunch and Anthropic APIs
- `script.container.ui` — show the sidebar, dialogs, and menu

### Tests

The disambiguation scoring functions are pure (no `DocumentApp` / `UrlFetchApp`), so
they run under Node against a labeled sample. See [TESTING.md](TESTING.md):

```bash
node test/run_disambig.js
```

## Publishing

The add-on is distributed via the **Google Workspace Marketplace**. For private
testing, publish an **unlisted** listing and add testers as OAuth-consent test users;
for domain-internal use, publish a private/internal listing (no Google verification
required). The scopes above are "sensitive" (not "restricted"), so public listing
requires OAuth verification but not a third-party security assessment.

## License

See [LICENSE](LICENSE).
