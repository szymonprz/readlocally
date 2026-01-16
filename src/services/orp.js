/**
 * ORP (Optimal Recognition Point) Service
 * Calculates the optimal recognition point for words in RSVP display
 */

/**
 * Calculate the ORP index for a word
 * The ORP is typically around 20-30% into the word, which is where
 * the eye naturally focuses for fastest word recognition.
 *
 * Rules:
 * - 1 char: index 0
 * - 2-5 chars: index 1
 * - 6-9 chars: index 2
 * - 10-13 chars: index 3
 * - 14+ chars: index 4
 *
 * @param {string} word - The word to calculate ORP for
 * @returns {number} The index of the ORP character
 */
export function calculateOrpIndex(word) {
  const len = word.length;

  if (len <= 1) return 0;
  if (len <= 5) return 1;
  if (len <= 9) return 2;
  if (len <= 13) return 3;
  return 4;
}

/**
 * Split a word into three parts: before ORP, ORP character, after ORP
 * @param {string} word - The word to split
 * @returns {Object} Object with before, orp, and after strings
 */
export function splitWordAtOrp(word) {
  if (!word || word.length === 0) {
    return { before: '', orp: '', after: '' };
  }

  const orpIndex = calculateOrpIndex(word);

  return {
    before: word.substring(0, orpIndex),
    orp: word[orpIndex] || '',
    after: word.substring(orpIndex + 1),
  };
}

/**
 * Calculate padding needed to center the ORP character
 * This helps keep the ORP at a fixed position on screen
 * @param {string} word - The word
 * @param {number} maxPadding - Maximum padding characters
 * @returns {Object} Object with leftPad and rightPad counts
 */
export function calculateOrpPadding(word, maxPadding = 10) {
  const orpIndex = calculateOrpIndex(word);
  const charsAfterOrp = word.length - orpIndex - 1;

  // We want the ORP to be roughly centered
  // Pad left so ORP aligns, pad right to balance
  const leftPad = Math.min(maxPadding - orpIndex, maxPadding);
  const rightPad = Math.min(maxPadding - charsAfterOrp, maxPadding);

  return {
    leftPad: Math.max(0, leftPad),
    rightPad: Math.max(0, rightPad),
  };
}
