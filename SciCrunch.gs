const SCICRUNCH_URL = 'https://api.scicrunch.io/elastic/v1/RIN_Tool_pr/_search';

// How many hits to retrieve and score. SciCrunch's elastic relevance ranking
// does NOT always put the exact-named tool in the top few — for "Pandas" the
// tool "pandas" (SCR_018214) ranks ~6-10 behind PANDA/GeoPandas/mentions — so a
// small window can miss the right resource entirely. Scoring re-ranks these by
// our own name+context score, so a wider window is safe (it only adds lower-
// relevance candidates to consider; it can't lower the best legitimate score).
const SEARCH_SIZE = 20;

function querySciCrunch(apiKey, phrase, context) {
  const url = SCICRUNCH_URL + '?q=' + encodeURIComponent(phrase) + '&size=' + SEARCH_SIZE;

  let response;
  try {
    response = UrlFetchApp.fetch(url, {
      headers: { 'apikey': apiKey },
      muteHttpExceptions: true,
    });
  } catch (e) {
    Logger.log('SciCrunch fetch error for "' + phrase + '": ' + e);
    return null;
  }

  if (response.getResponseCode() !== 200) {
    Logger.log('SciCrunch ' + response.getResponseCode() + ' for "' + phrase + '"');
    return null;
  }

  const data = JSON.parse(response.getContentText());
  const hits = ((data.hits || {}).hits || []).map(h => h._source);

  let best = null, bestScore = 0;
  for (const resource of hits) {
    const score = scoreResource(phrase, context, resource);
    if (score > bestScore) { bestScore = score; best = resource; }
  }

  if (!best || bestScore < THRESHOLD) return null;

  const item = best.item || best;
  const rrid = item.identifier || '';
  const name = item.name || ((item.synonyms || [])[0] || {}).name || '';

  return {
    rrid,
    name,
    score: Math.round(bestScore * 1000) / 1000,
    url: 'https://n2t.net/RRID:' + rrid,
    // Raw registry record, for the disambiguator to derive software cues from
    // (description / keywords / synonyms). Internal only — gatherSelectionMatches
    // drops it before the match list is serialised to the dialog.
    resource: best,
  };
}

// Debug helper: same request querySciCrunch makes, but returns EVERY hit with
// its computed score (not just the winner) so we can see why a term matched or
// didn't. Used by the "Diagnose Selection" menu item.
function debugQuery(apiKey, phrase, context, size) {
  size = size || SEARCH_SIZE;
  const url = SCICRUNCH_URL + '?q=' + encodeURIComponent(phrase) + '&size=' + size;
  let response;
  try {
    response = UrlFetchApp.fetch(url, { headers: { 'apikey': apiKey }, muteHttpExceptions: true });
  } catch (e) {
    return { phrase: phrase, error: String(e), hits: [] };
  }
  const status = response.getResponseCode();
  if (status !== 200) {
    return { phrase: phrase, status: status, hits: [] };
  }
  const data = JSON.parse(response.getContentText());
  const raw = ((data.hits || {}).hits || []).map(h => h._source);
  const hits = raw.map(function (resource) {
    const item = resource.item || resource;
    const types = (item.types || []).map(function (t) {
      return (t && (t.name || t.type)) || (typeof t === 'string' ? t : '');
    }).filter(Boolean);
    return {
      name: item.name || '',
      rrid: item.identifier || '',
      types: types.join(', '),
      score: Math.round(scoreResource(phrase, context, resource) * 1000) / 1000,
    };
  }).sort(function (a, b) { return b.score - a.score; });
  return { phrase: phrase, status: status, count: raw.length, threshold: THRESHOLD, hits: hits };
}

// Direct lookup of a single RRID's full record (for the side panel detail
// view). Unlike querySciCrunch — which fuzzy-matches a phrase — this queries
// by the identifier itself and returns the hit whose identifier matches.
function lookupRridDetails(apiKey, rrid) {
  const bare = String(rrid || '').replace(/^RRID:/i, '').trim();
  if (!bare) return null;

  const url = SCICRUNCH_URL + '?q=' + encodeURIComponent(bare) + '&size=10';
  let response;
  try {
    response = UrlFetchApp.fetch(url, {
      headers: { 'apikey': apiKey },
      muteHttpExceptions: true,
    });
  } catch (e) {
    Logger.log('SciCrunch detail fetch error for "' + bare + '": ' + e);
    return null;
  }
  if (response.getResponseCode() !== 200) {
    Logger.log('SciCrunch detail ' + response.getResponseCode() + ' for "' + bare + '"');
    return null;
  }

  const data = JSON.parse(response.getContentText());
  const hits = ((data.hits || {}).hits || []).map(h => h._source);

  // Require an exact identifier match; deliberately no fall-back to hits[0].
  // The loop examines every hit, so a fall-back would fire only when the
  // requested RRID is absent, returning an unrelated record under it.
  let match = null;
  for (const resource of hits) {
    const item = resource.item || resource;
    if (String(item.identifier || '').toLowerCase() === bare.toLowerCase()) {
      match = resource;
      break;
    }
  }
  if (!match) return null;

  const item = match.item || match;
  const synonyms = (item.synonyms || [])
    .map(s => (s && s.name) || '')
    .filter(Boolean);
  const keywords = (item.keywords || [])
    .map(k => (k && k.keyword) || '')
    .filter(Boolean);
  const types = (item.types || [])
    .map(t => (t && (t.name || t.type)) || (typeof t === 'string' ? t : ''))
    .filter(Boolean);
  // Resource's own homepage/landing URL, if the registry has one.
  const resourceUrl =
    (item.url && (item.url.uri || item.url)) ||
    ((item.relationships || []).find(r => r && r.originalURL) || {}).originalURL ||
    '';

  return {
    rrid: bare,
    name: item.name || '',
    description: item.description || '',
    url: 'https://n2t.net/RRID:' + bare,   // parenthetical/link target
    resourceUrl: typeof resourceUrl === 'string' ? resourceUrl : '',
    types,
    synonyms: synonyms.slice(0, 8),
    keywords: keywords.slice(0, 12),
  };
}
