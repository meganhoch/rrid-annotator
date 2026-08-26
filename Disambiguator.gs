/**
 * Disambiguator — decides whether an ambiguous candidate string, in its LOCAL
 * context, actually refers to the SciCrunch resource it name-matched (SOFTWARE)
 * or to a non-resource sense (an animal, a nerve cell, a common word).
 *
 * General by design: it is NOT keyed to a hand-picked term list. Software cues
 * are DERIVED from whatever resource SciCrunch returned (its description /
 * keywords / synonyms); a small generic software-usage list and a generic
 * biological/specimen list supply term-independent signals. When the cues are
 * inconclusive, `classifyAmbiguousWithLLM` (Apps Script only) is the fallback.
 *
 * The scoring functions here are pure (no DocumentApp / UrlFetchApp), so they
 * run and are unit-tested under Node against test/ambiguous_terms_sample.txt.
 */

// Term-independent "this is being used as software" signals.
const GENERIC_SW_CUES = new Set([
  "version","versions","installed","install","script","scripted","scripting",
  "library","libraries","package","packages","software","toolbox","toolkit",
  "framework","environment","environments","distribution","simulation",
  "simulate","simulated","model","models","modeling","modelled","code","coded",
  "github","pip","conda","dependency","dependencies","workflow","pipeline",
  "dataframe","api","compiled","module","modules","repository","implemented",
  "computed","plotted","interpreter","function","functions","parameter",
  "import","imported","imports"
]);

// Term-independent "this is a specimen / organism / cell" signals.
const BIO_NEG_CUES = new Set([
  "species","snake","snakes","wild","basking","habitat","specimen","specimens",
  "genus","captive","foraging","dorsal","juvenile","adult","reptile","reptiles",
  "predator","prey","mammal","mammals","zoo","forest","canopy","wetland",
  "cell","cells","cortical","pyramidal","neuronal","synaptic","tissue","tissues",
  "membrane","slice","slices","axon","dendrite","dendritic","vivo","vitro",
  "animal","animals","morphometry","whole-cell","electrophysiology"
]);

// Confidence: decide locally when the winning side leads by >=2 or has >=2 hits;
// otherwise return "uncertain" so the caller can fall back to the LLM.
var DISAMBIG_MARGIN = 2;

function _dStop() {
  // Reuse Scorer's STOPWORDS when loaded together (Apps Script / test harness).
  var base = (typeof STOPWORDS !== "undefined") ? STOPWORDS : new Set();
  return base;
}

function _dTokenize(s) {
  return (String(s || "").toLowerCase().match(/[a-z0-9][a-z0-9+\-.]*/g) || []);
}

function _singular(w) { return w.replace(/s$/, ""); }

/**
 * A LOCAL context window: up to `radius` whitespace-words on each side of
 * [start,end), CLAMPED to the sentence containing the occurrence so a mixed
 * sentence's neighbours don't leak in from adjacent sentences. Keeps the
 * decision about the *occurrence*, not the whole document.
 */
function contextWindow(text, start, end, radius) {
  radius = radius || 10;
  var pre = text.slice(0, start);
  var sentStart = Math.max(
    pre.lastIndexOf(". "), pre.lastIndexOf("! "), pre.lastIndexOf("? "),
    pre.lastIndexOf("\n"));
  sentStart = sentStart >= 0 ? sentStart + 1 : 0;
  var rest = text.slice(end);
  var nb = rest.search(/[.!?](\s|$)/);
  var sentEnd = nb >= 0 ? end + nb : text.length;

  var before = text.slice(sentStart, start).split(/\s+/).filter(Boolean).slice(-radius);
  var after = text.slice(end, sentEnd).split(/\s+/).filter(Boolean).slice(0, radius);
  return before.join(" ") + " " + text.slice(start, end) + " " + after.join(" ");
}

/**
 * Software cue words derived from the SciCrunch resource, EXCLUDING the
 * candidate term itself and its cognates (so NEURON's description "modeling
 * neurons" does not turn "neuron" into a software cue) and excluding any
 * biological words.
 */
function softwareCuesFromResource(resource, candidate) {
  var item = (resource && (resource.item || resource)) || {};
  var bag = [item.description || ""];
  (item.keywords || []).forEach(function (k) { bag.push((k && k.keyword) || ""); });
  (item.synonyms || []).forEach(function (s) { bag.push((s && s.name) || ""); });

  var cand = _singular(String(candidate || "").toLowerCase());
  var stop = _dStop();
  var cues = new Set();
  _dTokenize(bag.join(" ")).forEach(function (w) {
    var ws = _singular(w);
    if (ws === cand) return;              // exclude the term / its cognate
    if (stop.has(w)) return;
    if (BIO_NEG_CUES.has(w) || BIO_NEG_CUES.has(ws)) return;
    if (w.length >= 3) cues.add(w);
  });
  return cues;
}

/**
 * Decide the sense of `candidate` given `ctxText` (a local window) and the
 * name-matched `resource`. Returns {sense: 'software'|'other'|'uncertain',
 * sw, bio, confident}.
 */
function senseDecision(candidate, ctxText, resource) {
  var stop = _dStop();
  var toks = _dTokenize(ctxText).filter(function (w) { return !stop.has(w); });
  var swCues = new Set(GENERIC_SW_CUES);
  softwareCuesFromResource(resource, candidate).forEach(function (c) { swCues.add(c); });

  var sw = 0, bio = 0;
  toks.forEach(function (w) {
    var ws = _singular(w);
    if (swCues.has(w) || swCues.has(ws)) sw++;
    if (BIO_NEG_CUES.has(w) || BIO_NEG_CUES.has(ws)) bio++;
  });
  if (/\b\d+\.\d+\b/.test(ctxText)) sw++;   // version-number bonus (e.g. "3.11")

  var sense, confident;
  if (sw > bio && sw >= 1) {
    // Software side stays conservative: some generic cues (e.g. "model",
    // "function") also occur in biology, so require 2 hits or a clear margin.
    sense = "software"; confident = (sw - bio) >= DISAMBIG_MARGIN || sw >= 2;
  } else if (bio > sw && bio >= 1) {
    // Biological cues (species, pyramidal, cortical, membrane…) are highly
    // specific, so a single one with no software signal is enough to skip.
    sense = "other"; confident = sw === 0 || (bio - sw) >= DISAMBIG_MARGIN || bio >= 2;
  } else {
    sense = "uncertain"; confident = false;
  }
  return { sense: sense, sw: sw, bio: bio, confident: confident };
}

/**
 * THE GATE RULE — annotate unless there is positive evidence against it.
 *
 * A candidate only reaches this point because it already name-matched a
 * SciCrunch resource above the score threshold. So the gate's job is narrow:
 * veto the match when the local context shows the word is being used in its
 * everyday / biological sense instead. It is NOT a second relevance test.
 *
 * That asymmetry matters. Most legitimate mentions carry no sense cues at all
 * ("We used ImageJ to measure the area" scores sw=0, bio=0). If a bare mention
 * had to prove itself, the gate would suppress nearly every ordinary match. So
 * `bio === 0` — nothing arguing the other way — always annotates, exactly as
 * the add-on behaved before the gate existed. Only an occurrence with real
 * biological/specimen evidence can lose, and only if no occurrence of the same
 * phrase reads confidently as the resource.
 *
 * Returns {annotate: bool, reason: string, llmUsed: bool}.
 */
function _gateDecision(candidate, occurrences, text, resource, opts) {
  opts = opts || {};
  var mixed = null;        // most software-leaning occurrence that also has bio evidence
  var sawNegative = false;

  for (var i = 0; i < occurrences.length; i++) {
    var occ = occurrences[i];
    var ctx = contextWindow(text, occ[1], occ[2], opts.radius);
    var d = senseDecision(candidate, ctx, resource);

    // One confident software mention is enough. A resource genuinely cited
    // once stays cited even if the same word is used in its everyday sense
    // elsewhere in the selection ("pythons bask… we scripted Python 3.11").
    if (d.confident && d.sense === "software") {
      return { annotate: true, reason: "software cues", llmUsed: false };
    }
    if (d.bio === 0) continue;                 // nothing argues against this one
    sawNegative = true;
    if (!d.confident && (mixed === null || d.sw > mixed.d.sw)) {
      mixed = { ctx: ctx, d: d };
    }
  }

  if (!sawNegative) {
    return { annotate: true, reason: "no counter-evidence", llmUsed: false };
  }

  // Negative evidence, and nothing read confidently as the resource. If some
  // occurrence was genuinely mixed, spend ONE LLM call on the most
  // software-leaning of them to break the tie.
  if (mixed && opts.allowLLM !== false &&
      typeof classifyAmbiguousWithLLM === "function") {
    var resName = ((resource && (resource.item || resource)) || {}).name || candidate;
    var verdict = classifyAmbiguousWithLLM(candidate, mixed.ctx, resName);
    if (verdict === "software") return { annotate: true, reason: "LLM: software", llmUsed: true };
    if (verdict === "other") return { annotate: false, reason: "LLM: other", llmUsed: true };
    // No key, or the call failed — fall back to the cue tilt.
    return {
      annotate: mixed.d.sense === "software",
      reason: "cue tilt (no LLM verdict)",
      llmUsed: false
    };
  }
  return { annotate: false, reason: "biological cues", llmUsed: false };
}

/**
 * Gate for a single occurrence. Thin wrapper over the shared rule.
 */
function shouldAnnotateOccurrence(candidate, text, start, end, resource, opts) {
  return _gateDecision(candidate, [[candidate, start, end]], text, resource, opts).annotate;
}

/**
 * Gate for a phrase across EVERY occurrence of it in the text — the entry
 * point used by the live annotate path. `occurrences` is an array of
 * [phrase, start, end] triples.
 */
function phraseRefersToResource(candidate, text, occurrences, resource, opts) {
  if (!occurrences || !occurrences.length) return true;
  return _gateDecision(candidate, occurrences, text, resource, opts).annotate;
}

/**
 * LLM fallback (Apps Script only; not exercised by the Node tests).
 * Uses ANTHROPIC_API_KEY from user properties. Returns 'software' | 'other' |
 * 'uncertain'.
 */
function classifyAmbiguousWithLLM(candidate, ctxText, resourceName) {
  if (typeof PropertiesService === "undefined" || typeof UrlFetchApp === "undefined") {
    return "uncertain";
  }
  var key = PropertiesService.getUserProperties().getProperty("ANTHROPIC_API_KEY");
  if (!key) return "uncertain";

  var prompt =
    'In the text below, does the word "' + candidate + '" refer to the ' +
    'software/tool named "' + resourceName + '", or to something else (an ' +
    'animal, a nerve cell, or an ordinary word)? Reply with exactly one word: ' +
    'SOFTWARE or OTHER.\n\nText: "' + ctxText + '"';

  try {
    var resp = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
      method: "post",
      contentType: "application/json",
      muteHttpExceptions: true,
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      payload: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 5,
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (resp.getResponseCode() !== 200) return "uncertain";
    var data = JSON.parse(resp.getContentText());
    var text = ((data.content || [])[0] || {}).text || "";
    text = text.toUpperCase();
    if (text.indexOf("SOFTWARE") !== -1) return "software";
    if (text.indexOf("OTHER") !== -1) return "other";
  } catch (e) {
    Logger.log("LLM disambiguation failed: " + e);
  }
  return "uncertain";
}
