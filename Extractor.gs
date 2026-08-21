function extractCandidates(text) {
  const sentStarts = new Set();
  const sentBoundary = /[.!?]\s+/g;
  let m;
  while ((m = sentBoundary.exec(text)) !== null) {
    sentStarts.add(m.index + m[0].length);
  }

  // Matches: words starting with capital (ImageJ) OR camelCase (imageJ, sciPy)
  const capToken = /\b(?:[A-Z][a-zA-Z0-9+#._-]*|[a-z][a-zA-Z0-9+#._-]*[A-Z][a-zA-Z0-9+#._-]*)\b/g;
  const tokens = [];
  while ((m = capToken.exec(text)) !== null) {
    tokens.push({ word: m[0], start: m.index, end: m.index + m[0].length });
  }

  const seen = new Set();
  const candidates = [];

  let i = 0;
  while (i < tokens.length) {
    const t0 = tokens[i];
    if (sentStarts.has(t0.start)) { i++; continue; }

    // Greedily build run of up to 4 adjacent capitalized tokens
    const run = [t0];
    let j = i + 1;
    while (j < tokens.length && run.length < 4) {
      const tj = tokens[j];
      const gap = text.slice(run[run.length - 1].end, tj.start);
      if (gap.length <= 2 && gap.trim() === '') { run.push(tj); j++; }
      else break;
    }

    // Emit phrases from longest to shortest
    let r = [...run];
    while (r.length > 0) {
      const start = r[0].start;
      const end   = r[r.length - 1].end;
      const phrase = text.slice(start, end);
      const key = `${start}-${end}`;
      if (!seen.has(key) && phrase.length > 1) {
        seen.add(key);
        candidates.push([phrase, start, end]);
      }
      r = r.slice(0, -1);
    }
    i++;
  }

  candidates.sort((a, b) => a[1] - b[1]);
  return candidates;
}
