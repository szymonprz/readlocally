/**
 * Tokenizer Service
 * Converts chapter text into word tokens for RSVP display
 */

/**
 * Tokenize text from chapters into a flat array of word tokens
 * @param {Array} chapters - Array of chapter objects with text property
 * @returns {Array} Array of token objects
 */
export function tokenizeChapters(chapters) {
  const tokens = [];

  chapters.forEach((chapter, chapterIndex) => {
    const words = tokenizeText(chapter.text);

    words.forEach((word, wordIndex) => {
      tokens.push({
        word,
        chapterIndex,
        chapterTitle: chapter.title,
        wordIndexInChapter: wordIndex,
        isChapterStart: wordIndex === 0,
        isChapterEnd: wordIndex === words.length - 1,
        hasSentenceEnd: hasSentenceEndingPunctuation(word),
      });
    });
  });

  return tokens;
}

/**
 * Tokenize a single text string into words
 * @param {string} text - Text to tokenize
 * @returns {string[]} Array of words
 */
function tokenizeText(text) {
  // Split on whitespace while preserving punctuation attached to words
  return text
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => cleanWord(word));
}

/**
 * Clean a word token (remove excessive punctuation, normalize)
 * @param {string} word - The word to clean
 * @returns {string} Cleaned word
 */
function cleanWord(word) {
  // Remove leading/trailing quotes and parentheses but keep internal punctuation
  return word
    .replace(/^[""''«»„‚]+/, '')
    .replace(/[""''«»„‚]+$/, '')
    .trim();
}

/**
 * Check if a word ends with sentence-ending punctuation
 * @param {string} word - The word to check
 * @returns {boolean} True if word ends a sentence
 */
function hasSentenceEndingPunctuation(word) {
  // Check for period, question mark, exclamation mark at end
  // Also handle cases like "word." or "word?"
  return /[.!?]["'»"']?$/.test(word);
}

/**
 * Find the index of the start of the previous sentence
 * @param {Array} tokens - Array of all tokens
 * @param {number} currentIndex - Current position
 * @returns {number} Index of sentence start
 */
export function findPreviousSentenceStart(tokens, currentIndex) {
  if (currentIndex <= 0) return 0;

  // Go back to find the previous sentence ending, then move forward one
  let i = currentIndex - 1;

  // Skip to before current sentence
  while (i > 0 && !tokens[i].hasSentenceEnd) {
    i--;
  }

  // Now we're at a sentence ending (or start), go back one more sentence
  if (i > 0) {
    i--;
    while (i > 0 && !tokens[i].hasSentenceEnd) {
      i--;
    }
  }

  // Move forward one to be at sentence start
  if (i > 0 && tokens[i].hasSentenceEnd) {
    i++;
  }

  return Math.max(0, i);
}

/**
 * Find the index of the start of the next sentence
 * @param {Array} tokens - Array of all tokens
 * @param {number} currentIndex - Current position
 * @returns {number} Index of next sentence start
 */
export function findNextSentenceStart(tokens, currentIndex) {
  const maxIndex = tokens.length - 1;
  if (currentIndex >= maxIndex) return maxIndex;

  // Find the next sentence ending
  let i = currentIndex;
  while (i < maxIndex && !tokens[i].hasSentenceEnd) {
    i++;
  }

  // Move to the start of the next sentence
  if (i < maxIndex) {
    i++;
  }

  return Math.min(i, maxIndex);
}

/**
 * Get the global word index from chapter index and word index
 * @param {Array} chapters - Array of chapters
 * @param {number} chapterIndex - Chapter index
 * @param {number} wordIndexInChapter - Word index within chapter
 * @returns {number} Global word index
 */
export function getGlobalIndex(chapters, chapterIndex, wordIndexInChapter) {
  let index = 0;

  for (let i = 0; i < chapterIndex && i < chapters.length; i++) {
    index += chapters[i].wordCount;
  }

  return index + wordIndexInChapter;
}

/**
 * Get chapter index and word index from global index
 * @param {Array} chapters - Array of chapters
 * @param {number} globalIndex - Global word index
 * @returns {Object} Object with chapterIndex and wordIndexInChapter
 */
export function getChapterPosition(chapters, globalIndex) {
  let remaining = globalIndex;

  for (let i = 0; i < chapters.length; i++) {
    if (remaining < chapters[i].wordCount) {
      return {
        chapterIndex: i,
        wordIndexInChapter: remaining,
      };
    }
    remaining -= chapters[i].wordCount;
  }

  // Past end of book, return last position
  const lastChapter = chapters.length - 1;
  return {
    chapterIndex: lastChapter,
    wordIndexInChapter: chapters[lastChapter]?.wordCount - 1 || 0,
  };
}
