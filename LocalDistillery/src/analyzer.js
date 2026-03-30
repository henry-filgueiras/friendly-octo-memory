const DEFAULT_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "but",
  "by",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "his",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "itself",
  "more",
  "no",
  "not",
  "of",
  "on",
  "or",
  "our",
  "she",
  "should",
  "so",
  "than",
  "that",
  "the",
  "their",
  "them",
  "there",
  "they",
  "this",
  "to",
  "too",
  "up",
  "us",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "will",
  "with",
  "you",
  "your",
]);

const SECTION_CONFIG = [
  { id: "summary", label: "One-line summary", type: "text", kicker: "Synopsis" },
  { id: "digest", label: "Short bullet digest", type: "list", kicker: "Digest" },
  { id: "actions", label: "Action items", type: "list", kicker: "Follow-up" },
  { id: "questions", label: "Open questions", type: "list", kicker: "Unknowns" },
  { id: "motifs", label: "Repeated terms / motifs", type: "list", kicker: "Patterns" },
  { id: "entities", label: "Concept / entity list", type: "list", kicker: "Concepts" },
];

const MODE_HINTS = {
  Notes: ["note", "idea", "summary", "follow-up", "next step"],
  Meeting: ["decision", "owner", "timeline", "follow-up", "risk"],
  Research: ["finding", "evidence", "question", "hypothesis", "theme"],
  Logs: ["error", "warning", "timestamp", "repeated event", "anomaly"],
  Spec: ["requirement", "constraint", "decision", "scope", "interface"],
};

const STRENGTH_PROFILES = {
  light: { digestCount: 5, motifCount: 8, entityCount: 12, phraseSize: 2 },
  medium: { digestCount: 4, motifCount: 6, entityCount: 10, phraseSize: 3 },
  aggressive: { digestCount: 3, motifCount: 5, entityCount: 8, phraseSize: 3 },
};

export function getSectionConfig() {
  return SECTION_CONFIG;
}

export function buildDefaultToggles() {
  return Object.fromEntries(SECTION_CONFIG.map((section) => [section.id, true]));
}

export function analyzeText(text, mode, strength) {
  const profile = STRENGTH_PROFILES[strength] || STRENGTH_PROFILES.medium;
  const normalized = normalizeText(text);
  const lines = normalized.lines;
  const sentences = splitSentences(normalized.joined);
  const headings = detectHeadings(lines);
  const frequency = countTerms(normalized.joined);
  const rankedSentences = rankSentences(sentences, frequency, mode);
  const summary = buildSummary(rankedSentences, headings, mode);
  const digest = rankedSentences.slice(0, profile.digestCount).map(cleanSentence);
  const actions = extractActions(lines, mode);
  const questions = extractQuestions(lines, sentences);
  const motifs = extractMotifs(normalized.joined, frequency, profile);
  const entities = extractEntities(lines, profile.entityCount);

  return {
    sections: {
      summary,
      digest,
      actions,
      questions,
      motifs,
      entities,
    },
    stats: {
      characters: text.length,
      words: normalized.joined.trim() ? normalized.joined.trim().split(/\s+/).length : 0,
      sentences: sentences.length,
      headings: headings.length,
    },
  };
}

export function buildMarkdownExport({ inputMeta, mode, strength, sections, toggles }) {
  const lines = [
    "# Local Distillery Export",
    "",
    `- Mode: ${mode}`,
    `- Compression: ${strength}`,
    `- Generated locally: yes`,
    `- Source name: ${inputMeta.name || "Pasted text"}`,
    `- Character count: ${inputMeta.characters}`,
    "",
  ];

  for (const section of SECTION_CONFIG) {
    if (!toggles[section.id]) continue;
    lines.push(`## ${section.label}`);
    lines.push("");
    const value = sections[section.id];
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push("- None detected");
      } else {
        value.forEach((item) => lines.push(`- ${item}`));
      }
    } else {
      lines.push(value || "None detected");
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function buildJsonExport({ inputMeta, mode, strength, sections, toggles, stats }) {
  return JSON.stringify(
    {
      app: "Local Distillery",
      generatedLocally: true,
      mode,
      strength,
      source: inputMeta,
      stats,
      enabledSections: toggles,
      output: sections,
    },
    null,
    2
  );
}

function normalizeText(text) {
  const joined = text.replace(/\r\n/g, "\n").replace(/\t/g, "  ").trim();
  return {
    joined,
    lines: joined ? joined.split("\n").map((line) => line.trim()) : [],
  };
}

function splitSentences(text) {
  if (!text) return [];
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"\[])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 24);
}

function detectHeadings(lines) {
  return lines.filter((line) => {
    if (!line) return false;
    if (/^#{1,6}\s+/.test(line)) return true;
    if (/^[A-Z][A-Za-z0-9 /:-]{2,40}:$/.test(line)) return true;
    return /^[A-Z0-9][A-Z0-9 /-]{4,50}$/.test(line);
  });
}

function countTerms(text) {
  const counts = new Map();
  const tokens = text.toLowerCase().match(/[a-z][a-z0-9'-]{2,}/g) || [];
  for (const token of tokens) {
    if (DEFAULT_STOP_WORDS.has(token)) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return counts;
}

function rankSentences(sentences, frequency, mode) {
  const hints = MODE_HINTS[mode] || [];
  return sentences
    .map((sentence, index) => ({
      sentence,
      score: scoreSentence(sentence, frequency, hints, index),
    }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.sentence);
}

function scoreSentence(sentence, frequency, hints, index) {
  const tokens = sentence.toLowerCase().match(/[a-z][a-z0-9'-]{2,}/g) || [];
  const seen = new Set();
  let score = 0;

  for (const token of tokens) {
    if (DEFAULT_STOP_WORDS.has(token) || seen.has(token)) continue;
    seen.add(token);
    score += Math.min(frequency.get(token) || 0, 6);
  }

  if (/[0-9]/.test(sentence)) score += 1.5;
  if (/decision|agreed|must|should|need|risk|blocked|owner|action/i.test(sentence)) score += 4;
  if (sentence.length > 210) score -= 2;
  if (index < 3) score += 1.5;

  for (const hint of hints) {
    if (sentence.toLowerCase().includes(hint)) score += 2;
  }

  return score;
}

function buildSummary(rankedSentences, headings, mode) {
  const lead = rankedSentences[0] || "";
  const cleanLead = cleanSentence(lead || `Local distillation output for ${mode.toLowerCase()} input.`);
  const headingHint = headings[0] ? ` Focus area: ${cleanHeading(headings[0])}.` : "";
  return `${cleanLead}${headingHint}`.trim();
}

function extractActions(lines, mode) {
  const actionLines = [];
  const imperativeHints = /\b(todo|action item|next step|follow up|owner|assign|ship|review|add|fix|update|define|check|investigate|document|decide|create|compare|extract)\b/i;

  for (const line of lines) {
    if (!line) continue;
    if (/^\[[ xX]?\]\s+/.test(line) || /^[-*]\s+\[[ xX]?\]/.test(line)) {
      actionLines.push(line.replace(/^[-*]\s+/, ""));
      continue;
    }
    if (/^[-*]\s+/.test(line) && imperativeHints.test(line)) {
      actionLines.push(line.replace(/^[-*]\s+/, ""));
      continue;
    }
    if (imperativeHints.test(line) && line.length < 180) {
      actionLines.push(line);
    }
  }

  const unique = uniq(actionLines.map(cleanListItem));
  if (unique.length > 0) return unique.slice(0, 10);
  return mode === "Meeting"
    ? ["No explicit action items detected in the current text."]
    : [];
}

function extractQuestions(lines, sentences) {
  const questionLines = lines.filter((line) => /[?]$/.test(line));
  const interrogatives = sentences.filter((sentence) =>
    /^(who|what|when|where|why|how|should|could|would|do|does|is|are)\b/i.test(sentence.trim())
  );
  return uniq([...questionLines, ...interrogatives].map(cleanListItem)).slice(0, 10);
}

function extractMotifs(text, frequency, profile) {
  const phrases = new Map();
  const tokens = text.toLowerCase().match(/[a-z][a-z0-9'-]{2,}/g) || [];
  for (let i = 0; i <= tokens.length - profile.phraseSize; i += 1) {
    const slice = tokens.slice(i, i + profile.phraseSize);
    if (slice.some((token) => DEFAULT_STOP_WORDS.has(token))) continue;
    const phrase = slice.join(" ");
    phrases.set(phrase, (phrases.get(phrase) || 0) + 1);
  }

  const repeatedPhrases = [...phrases.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, profile.motifCount)
    .map(([phrase, count]) => `${phrase} (${count})`);

  const repeatedTerms = [...frequency.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, profile.motifCount)
    .map(([term, count]) => `${term} (${count})`);

  return uniq([...repeatedPhrases, ...repeatedTerms]).slice(0, profile.motifCount);
}

function extractEntities(lines, limit) {
  const entityCounts = new Map();
  const entityPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}|[A-Z]{2,}(?:-[A-Z]{2,})?|\d{4}-\d{2}-\d{2})\b/g;

  for (const line of lines) {
    const matches = line.match(entityPattern) || [];
    for (const match of matches) {
      const normalized = match.trim();
      if (normalized.length < 2) continue;
      entityCounts.set(normalized, (entityCounts.get(normalized) || 0) + 1);
    }
  }

  return [...entityCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([entity, count]) => (count > 1 ? `${entity} (${count})` : entity));
}

function cleanSentence(sentence) {
  return sentence
    .replace(/\s+/g, " ")
    .replace(/^[-*]\s+/, "")
    .trim();
}

function cleanHeading(heading) {
  return heading.replace(/^#+\s*/, "").replace(/:$/, "").trim();
}

function cleanListItem(item) {
  return item
    .replace(/^[-*]\s+/, "")
    .replace(/^\[[ xX]?\]\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}
