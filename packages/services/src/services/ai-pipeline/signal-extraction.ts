/**
 * Cheap, deterministic, rule-based extraction from a transcript. NO AI — this
 * is the "Cheap rule-based signals first" cost discipline for follow-up and
 * shared call metadata. Objection Intelligence owns a separate, one-time
 * semantic extraction from the complete transcript.
 */

export interface ExtractedSignals {
  objections: { type: string; evidenceExcerpt: string }[];
  intentSignals: string[];
  notablePhrases: string[];
}

const OBJECTION_PATTERNS: { type: string; keywords: string[] }[] = [
  {
    type: "price",
    keywords: [
      "too expensive",
      "expensive",
      "price",
      "pricing",
      "cost too",
      "budget",
      "afford",
      "cheaper",
    ],
  },
  {
    type: "timing",
    keywords: [
      "not the right time",
      "not a good time",
      "call me later",
      "next quarter",
      "next year",
      "too busy",
      "circle back",
    ],
  },
  {
    type: "authority",
    keywords: [
      "not my decision",
      "check with",
      "talk to my",
      "my boss",
      "my team",
      "decision maker",
    ],
  },
  {
    type: "need",
    keywords: [
      "don't need",
      "do not need",
      "not interested",
      "no need",
      "already have",
      "we're good",
    ],
  },
  {
    type: "trust",
    keywords: [
      "is this a scam",
      "how did you get",
      "not sure about",
      "skeptical",
      "don't trust",
    ],
  },
  {
    type: "competitor",
    keywords: [
      "already using",
      "we use",
      "with a competitor",
      "another provider",
      "switched to",
    ],
  },
];

const INTENT_PATTERNS: { signal: string; keywords: string[] }[] = [
  {
    signal: "requested_info",
    keywords: [
      "send me",
      "send over",
      "email me",
      "more information",
      "send the details",
    ],
  },
  {
    signal: "pricing_interest",
    keywords: [
      "how much",
      "what's the price",
      "pricing",
      "what does it cost",
      "quote",
    ],
  },
  {
    signal: "wants_demo",
    keywords: ["demo", "see it in action", "walk me through", "show me"],
  },
  {
    signal: "wants_callback",
    keywords: ["call me back", "call back", "reach out", "follow up with me"],
  },
  {
    signal: "positive",
    keywords: [
      "sounds good",
      "sounds great",
      "interested",
      "tell me more",
      "let's do it",
      "sign me up",
    ],
  },
  {
    signal: "scheduling",
    keywords: [
      "schedule",
      "book a",
      "set up a meeting",
      "calendar",
      "next week works",
    ],
  },
];

/** Up to ~280 chars of context around the first keyword hit. */
function excerptAround(haystack: string, keyword: string): string {
  const idx = haystack.indexOf(keyword);
  if (idx === -1) return "";
  const start = Math.max(0, idx - 80);
  const end = Math.min(haystack.length, idx + keyword.length + 120);
  return haystack.slice(start, end).trim();
}

export function extractSignals(transcript: string): ExtractedSignals {
  const text = transcript.toLowerCase();

  const objections: { type: string; evidenceExcerpt: string }[] = [];
  for (const pattern of OBJECTION_PATTERNS) {
    const hit = pattern.keywords.find((k) => text.includes(k));
    if (hit) {
      objections.push({
        type: pattern.type,
        evidenceExcerpt: excerptAround(text, hit),
      });
    }
  }

  const intentSignals: string[] = [];
  const notablePhrases: string[] = [];
  for (const pattern of INTENT_PATTERNS) {
    const hit = pattern.keywords.find((k) => text.includes(k));
    if (hit) {
      intentSignals.push(pattern.signal);
      const phrase = excerptAround(text, hit);
      if (phrase) notablePhrases.push(phrase);
    }
  }

  return {
    objections,
    intentSignals: [...new Set(intentSignals)],
    notablePhrases: notablePhrases.slice(0, 5),
  };
}
