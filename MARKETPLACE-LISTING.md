# Marketplace listing copy — draft for review

For the **Google Workspace Marketplace SDK → Store Listing** tab.
Addresses rejection items 1 (trademark attribution) and 2 (detailed description).

**Trademark rule applied:** every occurrence of a Google product name carries a ™,
and the description closes with an attribution footnote — what the reviewer asked
for ("whenever you use the names of these products, you must append a ™ symbol").
The app name "RRID Annotator" contains no Google mark, so it needs no change.

---

## Short description

```
Cite research resources in Google Docs™ with persistent RRIDs from the SciCrunch registry.
```

---

## Detailed description

```
RRID Annotator finds the research resources named in your research publication and appends each mention with an RRID — a persistent Research Resource Identifier from the SciCrunch registry — inserted directly into your Google Docs™ document as a linked citation.

Select a passage and run RRID → Annotate Selection. The add-on scans the selection for research resources, looks each one up in the SciCrunch registry, and inserts a citation such as (RRID:SCR_002333) immediately after the resource's name, hyperlinked to its registry record.

WHY RRIDs
Methods sections are often ambiguous about which antibody, cell line, organism, or software package was actually used. Two labs can describe different reagents in identical words. An RRID resolves to a single unambiguous registry record, so readers and automated screening tools can identify the exact resource and reproduce the work. A growing number of journals now ask for them.

RESOURCE NAME DISAMBIGUATION
Resource names can collide with ordinary language. "Python" is a programming language and a snake; "NEURON" is a simulator and a cell. Before citing anything, the add-on assesses the surrounding sentence to understand the context in which the term is being used. For mixed passages you can optionally supply your own Anthropic API key, and the add-on will ask Claude to settle the call.

CITED ONCE, AT THE FIRST MENTION
Each resource is cited a single time, at its first mention. Before inserting, the add-on checks whether that RRID already appears anywhere in the document.

FEATURES
• One-click annotation — select text, run one menu command, and matched resources are cited inline and hyperlinked to their SciCrunch record.
• Review before inserting — an optional dialog lists every match so you can confirm what will be written before anything touches your document.
• Context-aware disambiguation — skips resource names being used in their everyday sense, with an optional Claude fallback for ambiguous cases.
• Resource side panel — lists every RRID in the document. Click a row to read the registry details, jump the cursor to the citation, or toggle an annotation off and on.
• Diagnostics — shows the candidate phrases pulled from your selection and the raw registry results with match scores, so you can see exactly why a term did or did not match.
• Bring your own keys — your API keys are stored in your own per-user add-on storage, never displayed back to you, and never shared with other users.

WHAT YOU NEED
A SciCrunch API key, free from scicrunch.org. Enter it once under RRID → Settings. An Anthropic API key is optional and only enables the disambiguation fallback.

DATA AND PRIVACY
The add-on reads the text you select and the RRID citations already present in your document. Resource names are sent to the SciCrunch registry to look up identifiers. If you choose to enable the optional fallback, a short surrounding text snippet is sent to Anthropic for that one classification. Your document is not stored by the add-on. See the privacy policy for full details.

———
Google Docs™ is a trademark of Google LLC. RRID Annotator is not created by, endorsed by, or affiliated with Google LLC. SciCrunch and RRID are services of SciCrunch.org.
```

---

## Pricing (rejection item 4)

**Free.** No paid tier, no trial. The only key a user needs (SciCrunch) is itself free.

---

## Still outstanding

- **Item 5 — OAuth publishing status.** Still "Testing"; must be "In production",
  which triggers Google verification. Unavoidable even for an unlisted listing.
  Scopes are sensitive (not restricted), so no third-party security assessment.
- **Visibility for testers.** A *Private* listing is scoped to a Google Workspace
  organization; a consumer @gmail.com account has no domain to scope to. An
  **unlisted** listing (direct link, not searchable) is the likely path — confirm
  in the SDK.
- **Icon choice.** `store-assets/rrid-logo-icon-*.png` closely resembles SciCrunch's
  own mark — a separate trademark exposure from the Google one. The blue
  `app-icon-*.png` tile is the safer pick absent written permission from SciCrunch.
- Both icon sets and the screenshot are still untracked in git.
