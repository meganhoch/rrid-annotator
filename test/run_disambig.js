/**
 * Offline validation of Disambiguator.gs against the ambiguous-terms fixture.
 * Run: node test/run_disambig.js   (from the project root)
 *
 * Loads Scorer.gs + Disambiguator.gs into one shared VM context (so the
 * disambiguator can see Scorer's STOPWORDS), builds realistic mock SciCrunch
 * records, and checks each occurrence's decision against the expected label.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const ctx = { console, Set, RegExp, JSON, String, Math, Logger: { log() {} } };
vm.createContext(ctx);
const src =
  fs.readFileSync(path.join(ROOT, "Scorer.gs"), "utf8") + "\n" +
  fs.readFileSync(path.join(ROOT, "Disambiguator.gs"), "utf8");
vm.runInContext(src, ctx, { filename: "combined.gs" });

const text = fs.readFileSync(path.join(ROOT, "test/ambiguous_terms_sample.txt"), "utf8");
const expected = JSON.parse(
  fs.readFileSync(path.join(ROOT, "test/ambiguous_terms_expected.json"), "utf8")
);

// Realistic SciCrunch-style records (description / keywords / synonyms).
const RES = {
  python: { item: { name: "Python",
    description: "Python is a high-level general-purpose programming language widely used for scripting, data analysis and software development.",
    keywords: [{ keyword: "programming language" }, { keyword: "scripting" }, { keyword: "interpreter" }] } },
  anaconda: { item: { name: "Anaconda",
    description: "Anaconda is a distribution of the Python and R programming languages for scientific computing, bundling the conda package manager and virtual environments.",
    keywords: [{ keyword: "distribution" }, { keyword: "package manager" }, { keyword: "environment" }] } },
  panda: { item: { name: "pandas",
    description: "pandas is a Python software library for data analysis and manipulation, providing the DataFrame data structure.",
    keywords: [{ keyword: "data analysis" }, { keyword: "dataframe" }, { keyword: "library" }] } },
  neuron: { item: { name: "NEURON",
    description: "NEURON is a simulation environment for building and using computational models of individual neurons and networks of neurons.",
    keywords: [{ keyword: "simulation" }, { keyword: "compartmental model" }, { keyword: "computational neuroscience" }] } },
};

function resourceFor(term) {
  const k = term.toLowerCase().replace(/s$/, "");
  return RES[k] || null;
}

// Hybrid scoring: the cue engine must be correct WHEN CONFIDENT. Genuinely
// mixed occurrences return "uncertain" and are deferred to the LLM at runtime
// — those are not cue failures, but we do flag them.
let confidentOK = 0, confidentWrong = 0, deferred = 0;
const rows = [];
for (const c of expected.cases) {
  const sIdx = text.indexOf(c.snippet);
  if (sIdx < 0) { console.error("!! snippet not found in sample:", c.snippet); confidentWrong++; continue; }
  const local = text.indexOf(c.term, sIdx);
  const start = local, end = local + c.term.length;

  const res = resourceFor(c.term);
  const window = ctx.contextWindow(text, start, end);
  const d = ctx.senseDecision(c.term, window, res);
  const wantAnnotate = c.should_annotate;

  let result;
  if (!d.confident) {
    deferred++;
    result = "→LLM";
  } else {
    const annotate = d.sense === "software";
    if (annotate === wantAnnotate) { confidentOK++; result = "ok"; }
    else { confidentWrong++; result = "FAIL"; }
  }
  rows.push({
    term: c.term,
    expect: wantAnnotate ? "ANNOTATE" : "skip",
    decision: d.sense, conf: d.confident ? "y" : "-", sw: d.sw, bio: d.bio,
    result,
  });
}

const w = (s, n) => String(s).padEnd(n);
console.log("\n" + w("term", 11) + w("truth", 10) + w("cue-sense", 11) +
  w("conf", 6) + w("sw", 4) + w("bio", 4) + "result");
console.log("-".repeat(60));
for (const r of rows) {
  console.log(w(r.term, 11) + w(r.expect, 10) + w(r.decision, 11) +
    w(r.conf, 6) + w(r.sw, 4) + w(r.bio, 4) + r.result);
}
console.log("-".repeat(60));
console.log(`Confident decisions: ${confidentOK}/${confidentOK + confidentWrong} correct` +
  `   |   deferred to LLM: ${deferred}/${expected.cases.length}`);
if (confidentWrong) console.log("FAIL: a confident cue decision was wrong.");
else console.log("PASS: every confident cue decision matched ground truth.");

// ───────────────────────────────────────────────────────────────────────────
// Part 2 — the GATE as the live annotate path calls it, with the LLM disabled.
// This is the deterministic floor: what the add-on does for a user who has not
// supplied an Anthropic key. Only genuinely mixed contexts should be wrong.
// ───────────────────────────────────────────────────────────────────────────
let gateOK = 0, gateWrong = 0;
const gateMisses = [];
for (const c of expected.cases) {
  const sIdx = text.indexOf(c.snippet);
  if (sIdx < 0) continue;
  const local = text.indexOf(c.term, sIdx);
  const got = ctx.shouldAnnotateOccurrence(
    c.term, text, local, local + c.term.length, resourceFor(c.term), { allowLLM: false });
  if (got === c.should_annotate) gateOK++;
  else { gateWrong++; gateMisses.push(`${c.term} (${c.snippet.slice(0, 40)}…)`); }
}
console.log(`\nGate, no LLM: ${gateOK}/${gateOK + gateWrong} occurrences correct`);
gateMisses.forEach(m => console.log("  miss: " + m));

// ───────────────────────────────────────────────────────────────────────────
// Part 3 — regressions the gate must NOT cause.
// ───────────────────────────────────────────────────────────────────────────
const checks = [];
function check(name, actual, want) {
  checks.push({ name, ok: actual === want, actual, want });
}

// (a) THE BIG ONE: a bare mention with no sense cues at all must still be
// annotated. Most real citations look like this; if the gate demanded positive
// proof, it would silently suppress nearly every ordinary match.
const bare = "We used ImageJ to measure the area of each region.";
const bStart = bare.indexOf("ImageJ");
check("bare mention with no cues → annotate",
  ctx.shouldAnnotateOccurrence("ImageJ", bare, bStart, bStart + 6,
    { item: { name: "ImageJ", description: "ImageJ is an image processing program." } },
    { allowLLM: false }),
  true);

// (b) An unknown resource (no record, no cues) must still be annotated —
// softwareCuesFromResource gets nothing to work with, and that is not evidence
// against the match.
const unk = "Analysis was performed with Foobar.";
const uStart = unk.indexOf("Foobar");
check("no registry record → annotate",
  ctx.shouldAnnotateOccurrence("Foobar", unk, uStart, uStart + 6, null, { allowLLM: false }),
  true);

// (c) Phrase level: one software mention rescues a phrase whose other mentions
// are the everyday sense.
const mixedText =
  "Two pythons were basking in the wild near the forest habitat. " +
  "Separately, we scripted the analysis in Python 3.11 using the standard library.";
const mixedOccs = [];
for (const t of ["pythons", "Python"]) {
  let at = mixedText.indexOf(t);
  while (at !== -1) { mixedOccs.push([t, at, at + t.length]); at = mixedText.indexOf(t, at + 1); }
}
check("mixed selection, one software mention → annotate",
  ctx.phraseRefersToResource("Python", mixedText, mixedOccs, RES.python, { allowLLM: false }),
  true);

// (d) Phrase level: every mention biological → skip.
const snakeText =
  "Two pythons were basking in the wild. The pythons are a species of large reptile.";
const snakeOccs = [];
let sAt = snakeText.indexOf("pythons");
while (sAt !== -1) { snakeOccs.push(["pythons", sAt, sAt + 7]); sAt = snakeText.indexOf("pythons", sAt + 1); }
check("all mentions biological → skip",
  ctx.phraseRefersToResource("pythons", snakeText, snakeOccs, RES.python, { allowLLM: false }),
  false);

console.log("\nRegression checks");
console.log("-".repeat(60));
let regFail = 0;
for (const c of checks) {
  if (!c.ok) regFail++;
  console.log(`${c.ok ? "ok  " : "FAIL"}  ${c.name}` + (c.ok ? "" : `  (got ${c.actual}, want ${c.want})`));
}

console.log("-".repeat(60));
const failed = confidentWrong || regFail;
console.log(failed ? "FAIL" : "PASS");
process.exit(failed ? 1 : 0);
