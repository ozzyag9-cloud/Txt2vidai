'use strict';

const STOPWORDS = new Set([
  'a','an','the','and','or','but','if','then','so','of','to','in','on','at','for','with',
  'as','by','is','are','was','were','be','been','being','it','its','this','that','these',
  'those','i','you','he','she','we','they','them','his','her','their','our','your','my',
  'me','him','us','do','does','did','not','no','yes','from','into','about','than','too',
  'very','just','can','will','would','could','should','have','has','had','also','more',
  'most','some','such','only','up','down','out','over','under','again','here','there',
  'when','where','why','how','what','who','which','all','each','other','what\'s'
]);

/**
 * Split raw text into sentences. Not perfect (doesn't special-case every
 * abbreviation), but good enough for grouping narration into scenes.
 */
function splitSentences(text) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  const matches = cleaned.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [];
  return matches.map((s) => s.trim()).filter(Boolean);
}

function countWords(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Group sentences into "scenes" of roughly minWords..maxWords each.
 * Each scene becomes one narrated clip with one matching stock video.
 */
function buildScenes(script, { minWords = 12, maxWords = 26 } = {}) {
  const sentences = splitSentences(script);
  const scenes = [];
  let current = [];
  let wordCount = 0;

  for (const sentence of sentences) {
    const sentenceWords = countWords(sentence);

    if (current.length && wordCount + sentenceWords > maxWords) {
      scenes.push(current.join(' ').trim());
      current = [];
      wordCount = 0;
    }

    current.push(sentence);
    wordCount += sentenceWords;

    if (wordCount >= minWords) {
      scenes.push(current.join(' ').trim());
      current = [];
      wordCount = 0;
    }
  }

  if (current.length) scenes.push(current.join(' ').trim());

  return scenes.filter((s) => s.length > 0);
}

/**
 * Pull a short, stopword-free keyword phrase out of scene text to use as a
 * Pexels search query. Falls back to the first few raw words if nothing
 * survives the stopword filter.
 */
function extractKeywords(text, maxWords = 6) {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !STOPWORDS.has(w));

  if (words.length) return words.slice(0, maxWords).join(' ');

  return text.split(/\s+/).filter(Boolean).slice(0, 4).join(' ');
}

/**
 * Build the full scene list for a script: text + search query per scene.
 */
function buildSceneList(script, opts = {}) {
  const scenes = buildScenes(script, opts);
  return scenes.map((text, index) => ({
    index,
    text,
    query: extractKeywords(text),
  }));
}

module.exports = { splitSentences, buildScenes, extractKeywords, buildSceneList };
