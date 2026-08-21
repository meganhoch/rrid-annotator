function onOpen() {
  DocumentApp.getUi()
    .createMenu('RRID')
    .addItem('Annotate Selection', 'annotateSelection')
    .addItem('Annotate Selection (no dialog)', 'annotateSelectionDirect')
    .addItem('Open RRID Panel', 'showRridPanel')
    .addSeparator()
    .addItem('Diagnose Selection (debug)', 'diagnoseSelection')
    .addItem('Settings…', 'showSettings')
    .addToUi();
}

// ── Side panel ────────────────────────────────────────────────────────────────

// Opens the persistent side panel. It lists every RRID in the document; clicking
// one loads that resource's details inline (see getRridDetails) instead of
// navigating away to the resolver in a new browser tab.
function showRridPanel() {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('RRID Resources');
  DocumentApp.getUi().showSidebar(html);
}

// Scan the document body for RRID citations and return them in reading order,
// deduplicated. Each entry carries a short preceding snippet as a human label
// (usually the annotated resource name that sits just before "(RRID:…)").
function getDocRrids() {
  const text = DocumentApp.getActiveDocument().getBody().getText();
  const re = /RRID:\s*([A-Za-z0-9][A-Za-z0-9._:-]*)/g;
  const out = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(text)) !== null) {
    const rrid = m[1].replace(/[).,;]+$/, '');   // trim trailing punctuation
    if (!rrid || seen.has(rrid)) continue;
    seen.add(rrid);

    // Text just before the "(RRID:…)" — the annotated resource name. Used both
    // as the row label and as the anchor for restoring a toggled-off annotation.
    const before = text.slice(Math.max(0, m.index - 60), m.index)
      .replace(/\(\s*$/, '')       // drop a dangling opening paren
      .replace(/\s+$/, '');        // and trailing whitespace
    const clause = (before.split(/[.!?\n]/).pop() || '').trim();
    const label  = clause.slice(-40);
    const anchor = clause.slice(-40);   // findText anchor for re-insertion

    out.push({ rrid: rrid, label: label, anchor: anchor });
  }
  return out;
}

// Look up one RRID's full details for the panel's detail view.
function getRridDetails(rrid) {
  const apiKey = getApiKey();
  if (!apiKey) return { error: 'No SciCrunch API key set (RRID → Settings).' };
  const details = lookupRridDetails(apiKey, rrid);
  if (!details) return { error: 'No registry record found for RRID:' + rrid };
  return details;
}

// Move the document cursor to the first "(RRID:…)" citation for this RRID,
// scrolling the doc into view. Lets the panel double as a navigator.
function jumpToRrid(rrid) {
  const doc  = DocumentApp.getActiveDocument();
  const found = doc.getBody().findText(escapeRegex('RRID:' + rrid));
  if (!found) return { ok: false, error: 'Citation not found in document.' };
  doc.setCursor(doc.newPosition(found.getElement(), found.getStartOffset()));
  return { ok: true };
}

// Remove a "(RRID:…)" citation (with its link and the leading space) from the
// document. Toggling the panel checkbox off calls this.
function removeAnnotation(rrid) {
  const body    = DocumentApp.getActiveDocument().getBody();
  const pattern = '\\s?\\(RRID:' + escapeRegex(rrid) + '\\)';
  const found   = body.findText(pattern);
  if (!found) return { ok: false, error: 'Citation not found.' };
  found.getElement().asText().deleteText(found.getStartOffset(), found.getEndOffsetInclusive());
  return { ok: true };
}

// Re-insert a previously-removed "(RRID:…)" citation after its anchor text
// (the resource name it followed). Toggling the checkbox back on calls this.
function restoreAnnotation(rrid, anchor) {
  if (!anchor) return { ok: false, error: 'No anchor to restore at; re-annotate instead.' };
  const body  = DocumentApp.getActiveDocument().getBody();
  const found = body.findText(escapeRegex(anchor));
  if (!found) return { ok: false, error: 'Could not find where to restore it; re-annotate instead.' };

  const textEl    = found.getElement().asText();
  const endOffset = found.getEndOffsetInclusive();
  const citation  = ' (RRID:' + rrid + ')';
  textEl.insertText(endOffset + 1, citation);

  const rridLabel = 'RRID:' + rrid;
  const rridStart = endOffset + 3;   // skip the leading " ("
  textEl.setLinkUrl(rridStart, rridStart + rridLabel.length - 1, 'https://n2t.net/RRID:' + rrid);
  return { ok: true };
}

// Build the list of resource matches for the current selection. Returns
// { matches } on success or { error } with a user-facing message. Kept free of
// UI (no alerts) so both the review-dialog flow and the direct flow share it.
function gatherSelectionMatches() {
  const doc = DocumentApp.getActiveDocument();
  const selection = doc.getSelection();
  if (!selection) return { error: 'Please select some text first.' };

  const text = getSelectionText(selection);
  if (!text.trim()) return { error: 'Selection is empty.' };

  const apiKey = getApiKey();
  if (!apiKey) return { error: 'Please set your SciCrunch API key first (RRID → Settings).' };

  const candidates = extractCandidates(text);
  if (candidates.length === 0) return { error: 'No candidates found.\nText received: "' + text + '"' };

  // Deduplicate by normalised phrase
  const seen = new Set();
  const unique = candidates.filter(([phrase]) => {
    const key = phrase.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Query SciCrunch for each candidate.
  // Candidates are sorted by start position, longest-first within the same start.
  // Once a longer span is accepted, skip any shorter span fully contained within it.
  const matches = [];
  const seenRrids = new Set();
  const acceptedSpans = [];
  for (const [phrase, start, end] of unique) {
    if (acceptedSpans.some(([s, e]) => start >= s && end <= e)) continue;
    const hit = querySciCrunch(apiKey, phrase, text);
    if (hit && !seenRrids.has(hit.rrid)) {
      seenRrids.add(hit.rrid);
      matches.push({ candidate: phrase, start, end, ...hit });
      acceptedSpans.push([start, end]);
    }
  }

  if (matches.length === 0) return { error: 'No matching resources found in the SciCrunch registry.' };
  return { matches: matches };
}

// Menu: "Annotate Selection" — review the matches in a dialog before inserting.
function annotateSelection() {
  const ui  = DocumentApp.getUi();
  const res = gatherSelectionMatches();
  if (res.error) { ui.alert('RRID Annotator', res.error, ui.ButtonSet.OK); return; }

  const matches  = res.matches;
  const template = HtmlService.createTemplateFromFile('Dialog');
  template.matches = matches;
  const html = template.evaluate()
    .setWidth(480)
    .setHeight(Math.min(140 + matches.length * 46, 420));
  ui.showModalDialog(html, 'RRID Annotator — ' + matches.length + ' resource' + (matches.length > 1 ? 's' : '') + ' found');
}

// Menu: "Annotate Selection (no dialog)" — insert every match immediately,
// skipping the review dialog. Silent on success (the inserted "(RRID:…)"
// citations are the confirmation); only alerts on an error or a genuine no-op
// so the command never fails invisibly.
function annotateSelectionDirect() {
  const ui  = DocumentApp.getUi();
  const res = gatherSelectionMatches();
  if (res.error) { ui.alert('RRID Annotator', res.error, ui.ButtonSet.OK); return; }

  const log = insertCitations(JSON.stringify(res.matches));
  if (!/^OK:/m.test(log)) {
    ui.alert('RRID Annotator',
      'Nothing to annotate — the matched resource(s) are already cited, or their ' +
      'text could not be located in the document.', ui.ButtonSet.OK);
  }
}

function insertCitations(matchesJson) {
  const matches = JSON.parse(matchesJson);
  const body    = DocumentApp.getActiveDocument().getBody();
  const log     = [];

  for (const match of [...matches].reverse()) {
    // First-instance-only: annotate each resource at most once, at its first
    // textual occurrence. If a "(RRID:<id>)" for this resource already exists
    // anywhere in the doc, skip. This is one native indexed search per match —
    // no full-document traversal — and it catches annotations from prior runs
    // and earlier sessions, not just this one. The closing ")" anchors the
    // match so RRID:NXR_1049 can't be matched by RRID:NXR_10490.
    if (body.findText('\\(RRID:' + escapeRegex(match.rrid) + '\\)')) {
      log.push('SKIP (already annotated): ' + match.rrid);
      continue;
    }

    // findText with no start position searches from the top of the body, so
    // this lands on the FIRST occurrence of the resource name in the document
    // (definition (a)) — later mentions are left bare.
    const pattern = escapeRegex(match.candidate);
    const found   = body.findText(pattern);
    if (!found) {
      log.push('NOT FOUND: "' + match.candidate + '"');
      continue;
    }

    const textEl    = found.getElement().asText();
    const endOffset = found.getEndOffsetInclusive();
    const citation  = ' (RRID:' + match.rrid + ')';
    textEl.insertText(endOffset + 1, citation);

    const rridLabel = 'RRID:' + match.rrid;
    const rridStart = endOffset + 3;
    textEl.setLinkUrl(rridStart, rridStart + rridLabel.length - 1, match.url);
    log.push('OK: "' + match.candidate + '" → ' + match.rrid);
  }

  return log.join('\n');
}

// ── Diagnostics ───────────────────────────────────────────────────────────────

// For the current selection, show every extracted candidate and the raw
// SciCrunch top-10 (name / RRID / type / score) so we can see exactly why a
// term did or didn't match. Does not modify the document.
function diagnoseSelection() {
  const ui  = DocumentApp.getUi();
  const doc = DocumentApp.getActiveDocument();
  const selection = doc.getSelection();
  if (!selection) { ui.alert('RRID Diagnose', 'Select some text first.', ui.ButtonSet.OK); return; }

  const text = getSelectionText(selection);
  const apiKey = getApiKey();
  if (!apiKey) { ui.alert('RRID Diagnose', 'Set your SciCrunch API key first (RRID → Settings).', ui.ButtonSet.OK); return; }

  const candidates = extractCandidates(text);
  const seen = new Set();
  const unique = candidates.filter(([p]) => {
    const k = p.toLowerCase();
    if (seen.has(k)) return false; seen.add(k); return true;
  });

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  let html = '<style>body{font:12px/1.5 Arial;padding:10px;color:#202124}'
    + 'h3{margin:14px 0 4px;font-size:13px}table{border-collapse:collapse;width:100%}'
    + 'td,th{border-bottom:1px solid #eee;padding:3px 6px;text-align:left;vertical-align:top}'
    + 'th{color:#5f6368;font-weight:normal}code{background:#f1f3f4;padding:0 4px;border-radius:3px}'
    + '.pass{color:#137333;font-weight:bold}.fail{color:#c5221f}</style>';
  html += '<div><b>Selection candidates:</b> ' + esc(unique.map(c => c[0]).join(' · ')) + '</div>';

  for (const [phrase] of unique) {
    const r = debugQuery(apiKey, phrase, text, 10);
    html += '<h3>' + esc(phrase) + '</h3>';
    if (r.error) { html += '<div class="fail">fetch error: ' + esc(r.error) + '</div>'; continue; }
    if (r.status && r.status !== 200) { html += '<div class="fail">HTTP ' + r.status + '</div>'; continue; }
    if (!r.hits.length) { html += '<div>(no results; threshold ' + r.threshold + ')</div>'; continue; }
    html += '<table><tr><th>score</th><th>name</th><th>RRID</th><th>type</th></tr>';
    for (const h of r.hits) {
      const cls = h.score >= r.threshold ? 'pass' : 'fail';
      html += '<tr><td class="' + cls + '">' + h.score + '</td><td>' + esc(h.name)
        + '</td><td><code>' + esc(h.rrid) + '</code></td><td>' + esc(h.types) + '</td></tr>';
    }
    html += '</table>';
    const win = r.hits.filter(h => h.score >= r.threshold)[0];
    html += '<div>' + (win ? '<span class="pass">→ would annotate ' + esc(win.rrid) + '</span>'
      : '<span class="fail">→ no match (best ' + (r.hits[0] ? r.hits[0].score : 0)
        + ' &lt; ' + r.threshold + ')</span>') + '</div>';
  }

  const out = HtmlService.createHtmlOutput(html).setWidth(560).setHeight(460);
  ui.showModalDialog(out, 'RRID Diagnose — SciCrunch results & scores');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getSelectionText(selection) {
  return selection.getRangeElements().map(el => {
    const elem = el.getElement();
    // Only a Text element is ever partially selected — slice by its offsets.
    if (el.isPartial()) {
      return elem.asText().getText()
        .slice(el.getStartOffset(), el.getEndOffsetInclusive() + 1);
    }
    // A fully-selected element can be a Text element OR its container
    // (Paragraph / ListItem) — the latter is what you get when the whole
    // paragraph, including its trailing newline, is selected. All text-bearing
    // elements expose getText(); non-text elements (images, rules) don't.
    return typeof elem.getText === 'function' ? elem.getText() : '';
  }).join(' ').trim();
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// The active SciCrunch key: the user's own if they set one, otherwise the
// shared project key (a Script Property the project owner provisions once, so
// testers work out of the box without it being committed to source). Returns ''
// only if neither is set.
function getApiKey() {
  const own = PropertiesService.getUserProperties().getProperty('SCICRUNCH_API_KEY');
  if (own) return own;
  return PropertiesService.getScriptProperties().getProperty('SCICRUNCH_API_KEY_SHARED') || '';
}

// ── Settings ───────────────────────────────────────────────────────────────

function showSettings() {
  const html = HtmlService.createHtmlOutputFromFile('Settings')
    .setWidth(440).setHeight(560);
  DocumentApp.getUi().showModalDialog(html, 'RRID Settings');
}

// Report which key is in effect without ever returning the secret values.
// scicrunch: 'own' (user override) | 'shared' (project default) | 'none'
// anthropic: 'own' | 'none'
function getKeyStatus() {
  const user   = PropertiesService.getUserProperties();
  const script = PropertiesService.getScriptProperties();
  let scicrunch;
  if (user.getProperty('SCICRUNCH_API_KEY'))               scicrunch = 'own';
  else if (script.getProperty('SCICRUNCH_API_KEY_SHARED')) scicrunch = 'shared';
  else                                                     scicrunch = 'none';
  return {
    scicrunch: scicrunch,
    anthropic: user.getProperty('ANTHROPIC_API_KEY') ? 'own' : 'none'
  };
}

// Save keys the user typed. A blank field means "leave unchanged" (so opening
// Settings just to set one key never wipes the other). To clear a key, use
// clearKey(). Keys are written to the user's own property store only.
function saveKeys(scicrunch, anthropic) {
  const user = PropertiesService.getUserProperties();
  if (scicrunch && scicrunch.trim()) user.setProperty('SCICRUNCH_API_KEY', scicrunch.trim());
  if (anthropic && anthropic.trim()) user.setProperty('ANTHROPIC_API_KEY', anthropic.trim());
  return getKeyStatus();
}

// Remove a user-set key. For SciCrunch this reverts to the shared project key;
// for Anthropic it turns the LLM disambiguation fallback off.
function clearKey(which) {
  const user = PropertiesService.getUserProperties();
  if (which === 'scicrunch')      user.deleteProperty('SCICRUNCH_API_KEY');
  else if (which === 'anthropic') user.deleteProperty('ANTHROPIC_API_KEY');
  return getKeyStatus();
}
