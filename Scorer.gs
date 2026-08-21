const THRESHOLD = 0.65;

const STOPWORDS = new Set([
  'a','an','the','and','or','of','in','to','for','with','on','at','by',
  'from','as','is','was','are','were','be','been','being','have','has',
  'had','do','does','did','will','would','could','should','may','might',
  'that','this','it','we','i','you','they','using','used','via','into','than'
]);

function editDistance(a, b) {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : Math.min(prev, dp[j], dp[j - 1]) + 1;
      prev = temp;
    }
  }
  return dp[b.length];
}

function fuzzyRatio(a, b) {
  if (!a || !b) return 0;
  const longer  = a.length >= b.length ? a : b;
  const shorter = a.length >= b.length ? b : a;
  if (longer.length === 0) return 1.0;
  return (longer.length - editDistance(longer, shorter)) / longer.length;
}

function scoreResource(candidate, context, resource) {
  const c    = candidate.toLowerCase().trim();
  const item = resource.item || resource;

  const name     = (item.name || '').toLowerCase().trim();
  const altNames = (item.synonyms || []).map(s => (s.name || '').toLowerCase().trim()).filter(Boolean);
  const allNames = name ? [name, ...altNames] : altNames;

  const description = (item.description || '').toLowerCase().replace(/[^\w\s]/g, ' ');
  const keywords    = (item.keywords || []).map(k => (k.keyword || '').toLowerCase());

  let score = 0;

  if (allNames.includes(c)) {
    score += 0.6;
  } else if (allNames.length > 0) {
    const best = Math.max(...allNames.map(n => fuzzyRatio(c, n)));
    if (best >= 0.92) score += 0.4;
    else if (best >= 0.80) score += 0.2;
  }

  if (context) {
    const ctxWords  = new Set(context.toLowerCase().split(/\s+/).filter(w => w && !STOPWORDS.has(w)));
    const descWords = new Set(description.split(/\s+/).filter(w => w && !STOPWORDS.has(w)));
    const kwWords   = new Set(keywords);
    const combined  = new Set([...descWords, ...kwWords]);
    let overlap = 0;
    for (const w of ctxWords) if (combined.has(w)) overlap++;
    score += Math.min(overlap * 0.05, 0.2);
  }

  return Math.min(score, 1.0);
}
