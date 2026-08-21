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
process.exit(confidentWrong ? 1 : 0);
