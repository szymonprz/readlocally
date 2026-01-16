/**
 * Storage Service
 * Manages localStorage persistence for book data and user preferences
 */

const STORAGE_KEYS = {
  BOOK_DATA: 'rsvp_book_data',
  READING_POSITION: 'rsvp_reading_position',
  PREFERENCES: 'rsvp_preferences',
};

/**
 * Save book metadata (without the full content) for resume functionality
 * @param {Object} bookData - The parsed book data
 * @param {File} file - The original file (for reference)
 */
export function saveBookReference(bookData, file) {
  const reference = {
    fileName: file.name,
    fileSize: file.size,
    title: bookData.metadata.title,
    author: bookData.metadata.author,
    totalWords: bookData.totalWords,
    chapterCount: bookData.chapters.length,
    coverUrl: bookData.metadata.coverUrl,
    savedAt: Date.now(),
  };

  try {
    localStorage.setItem(STORAGE_KEYS.BOOK_DATA, JSON.stringify(reference));
  } catch (e) {
    console.warn('Failed to save book reference:', e);
  }
}

/**
 * Get saved book reference
 * @returns {Object|null} The saved book reference or null
 */
export function getBookReference() {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.BOOK_DATA);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.warn('Failed to read book reference:', e);
    return null;
  }
}

/**
 * Save current reading position
 * @param {number} wordIndex - Global word index
 * @param {number} chapterIndex - Current chapter index
 */
export function saveReadingPosition(wordIndex, chapterIndex) {
  const position = {
    wordIndex,
    chapterIndex,
    savedAt: Date.now(),
  };

  try {
    localStorage.setItem(STORAGE_KEYS.READING_POSITION, JSON.stringify(position));
  } catch (e) {
    console.warn('Failed to save reading position:', e);
  }
}

/**
 * Get saved reading position
 * @returns {Object|null} The saved position or null
 */
export function getReadingPosition() {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.READING_POSITION);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.warn('Failed to read reading position:', e);
    return null;
  }
}

/**
 * Save user preferences
 * @param {Object} prefs - Preferences object
 */
export function savePreferences(prefs) {
  try {
    const existing = getPreferences();
    const merged = { ...existing, ...prefs };
    localStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(merged));
  } catch (e) {
    console.warn('Failed to save preferences:', e);
  }
}

/**
 * Get user preferences
 * @returns {Object} Preferences object with defaults
 */
export function getPreferences() {
  const defaults = {
    wpm: 300,
    chunkSize: 1,
    theme: 'dark',
    showPeripheralPreview: false,
    showStatisticsHud: true,
    pauseBetweenChapters: false,
    fontSize: 3, // rem units
    fontFamily: 'literata', // font ID from READING_FONTS
  };

  try {
    const data = localStorage.getItem(STORAGE_KEYS.PREFERENCES);
    const saved = data ? JSON.parse(data) : {};
    return { ...defaults, ...saved };
  } catch (e) {
    console.warn('Failed to read preferences:', e);
    return defaults;
  }
}

/**
 * Clear all book-related data (used when loading a new book)
 */
export function clearBookData() {
  try {
    localStorage.removeItem(STORAGE_KEYS.BOOK_DATA);
    localStorage.removeItem(STORAGE_KEYS.READING_POSITION);
  } catch (e) {
    console.warn('Failed to clear book data:', e);
  }
}

/**
 * Clear just the reading position (used when starting fresh)
 */
export function clearReadingPosition() {
  try {
    localStorage.removeItem(STORAGE_KEYS.READING_POSITION);
  } catch (e) {
    console.warn('Failed to clear reading position:', e);
  }
}

/**
 * Clear all stored data
 */
export function clearAllData() {
  try {
    Object.values(STORAGE_KEYS).forEach((key) => {
      localStorage.removeItem(key);
    });
  } catch (e) {
    console.warn('Failed to clear all data:', e);
  }
}

/**
 * Check if we have a saved book that matches the given file
 * @param {File} file - The file to check
 * @returns {boolean} True if the file matches saved book
 */
export function isMatchingSavedBook(file) {
  const saved = getBookReference();
  if (!saved) return false;

  return saved.fileName === file.name && saved.fileSize === file.size;
}
