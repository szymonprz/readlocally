/**
 * RSVP Reader - Main Application Entry Point
 */

// Self-hosted fonts via Fontsource (SIL Open Font License)
import '@fontsource-variable/literata';
import '@fontsource/merriweather/400.css';
import '@fontsource/merriweather/700.css';
import '@fontsource-variable/source-serif-4';

import { initFileHandler } from './services/file-handler.js';
import { parseEpub } from './services/epub-parser.js';
import { tokenizeChapters } from './services/tokenizer.js';
import { createRsvpEngine } from './services/rsvp-engine.js';
import { splitWordAtOrp } from './services/orp.js';
import {
  saveBookReference,
  getBookReference,
  saveReadingPosition,
  getReadingPosition,
  savePreferences,
  getPreferences,
  clearBookData,
  isMatchingSavedBook,
} from './services/storage.js';
import {
  saveFileAccess,
  loadSavedFile,
  checkSavedFileStatus,
  clearSavedFile,
} from './services/file-persistence.js';
import {
  acquireWakeLock,
  releaseWakeLock,
  setupVisibilityHandler,
} from './services/wake-lock.js';
import {
  isMobileDevice,
  initMobileControls,
  setPlayingState,
} from './services/mobile-controls.js';

// Font configuration - open source fonts optimized for reading (self-hosted via Fontsource)
const READING_FONTS = {
  literata: {
    id: 'literata',
    name: 'Literata',
    family: "'Literata Variable', Georgia, serif",
  },
  merriweather: {
    id: 'merriweather',
    name: 'Merriweather',
    family: "'Merriweather', Georgia, serif",
  },
  sourceSerif: {
    id: 'sourceSerif',
    name: 'Source Serif',
    family: "'Source Serif 4 Variable', Georgia, serif",
  },
  georgia: {
    id: 'georgia',
    name: 'Georgia',
    family: 'Georgia, serif',
  },
};

const FONT_SIZE_MIN = 2;
const FONT_SIZE_MAX = 5;
const FONT_SIZE_STEP = 0.25;
const POSITION_SAVE_INTERVAL = 5000; // Save position every 5 seconds

// App state
let engine = null;
let bookData = null;
let tokens = null;
let currentFile = null;
let currentFileHandle = null;
let preferences = getPreferences();
let showPeripheralPreview = preferences.showPeripheralPreview || false;
let lastPositionSaveTime = 0;
let mobileControlsInitialized = false;

// DOM Elements
const landingScreen = document.getElementById('landing-screen');
const bookInfoScreen = document.getElementById('book-info-screen');
const readerScreen = document.getElementById('reader-screen');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const filePickerBtn = document.getElementById('file-picker-btn');
const currentWordEl = document.getElementById('current-word');
const wordLeftEl = document.getElementById('word-left');
const wordRightEl = document.getElementById('word-right');
const wordBeforeEl = document.getElementById('word-before');
const wordOrpEl = document.getElementById('word-orp');
const wordAfterEl = document.getElementById('word-after');
const prevWordEl = document.getElementById('prev-word');
const nextWordEl = document.getElementById('next-word');
const statusIndicator = document.getElementById('status-indicator');
const wpmDisplay = document.getElementById('wpm-display');
const chunkDisplay = document.getElementById('chunk-display');
const progressDisplay = document.getElementById('progress-display');
const chapterIndicator = document.getElementById('chapter-indicator');
const chapterTitle = document.getElementById('chapter-title');

// Book info elements
const bookCover = document.getElementById('book-cover');
const coverPlaceholder = document.getElementById('cover-placeholder');
const bookTitleEl = document.getElementById('book-title');
const bookAuthorEl = document.getElementById('book-author');
const bookStatsEl = document.getElementById('book-stats');
const startReadingBtn = document.getElementById('start-reading-btn');
const chooseDifferentBtn = document.getElementById('choose-different-btn');

// Book info fallback file selection elements
const bookInfoDropZone = document.getElementById('book-info-drop-zone');
const bookInfoFileBtn = document.getElementById('book-info-file-btn');

// Mobile toolbar elements
const mobileToolbar = document.getElementById('mobile-toolbar');
const btnPlayPause = document.getElementById('btn-play-pause');
const btnSpeedUp = document.getElementById('btn-speed-up');
const btnSpeedDown = document.getElementById('btn-speed-down');
const btnStepBack = document.getElementById('btn-step-back');
const btnStepForward = document.getElementById('btn-step-forward');
const btnChunkCycle = document.getElementById('btn-chunk-cycle');
const btnFontUp = document.getElementById('btn-font-up');
const btnFontDown = document.getElementById('btn-font-down');
const btnFontCycle = document.getElementById('btn-font-cycle');
const btnPreviewToggle = document.getElementById('btn-preview-toggle');
const btnMenu = document.getElementById('btn-menu');
const playPauseIcon = document.getElementById('play-pause-icon');
const chunkIcon = document.getElementById('chunk-icon');
const previewIcon = document.getElementById('preview-icon');

/**
 * Initialize the application
 */
async function init() {
  // Apply saved font preferences
  applyFontPreferences();

  // Set up file handling with handle support
  initFileHandler({
    dropZone,
    fileInput,
    pickerButton: filePickerBtn,
    onFile: (file) => handleFile(file, null),
    onFileWithHandle: (file, handle) => handleFile(file, handle),
    onError: handleError,
  });

  // Set up fallback file handling on book info screen
  if (bookInfoDropZone && bookInfoFileBtn) {
    initFileHandler({
      dropZone: bookInfoDropZone,
      fileInput,
      pickerButton: bookInfoFileBtn,
      onFile: (file) => handleFile(file, null),
      onFileWithHandle: (file, handle) => handleFile(file, handle),
      onError: handleError,
    });
  }

  // Set up button handlers - use onclick so it can be reassigned for resume flow
  startReadingBtn.onclick = startReading;
  chooseDifferentBtn.addEventListener('click', async () => {
    clearBookData();
    await clearSavedFile();
    bookData = null;
    tokens = null;
    currentFile = null;
    currentFileHandle = null;
    showLandingScreen();
  });

  // Set up keyboard controls
  document.addEventListener('keydown', handleKeydown);

  // Save position when page is closed
  window.addEventListener('beforeunload', () => {
    if (engine && tokens) {
      const index = engine.getCurrentIndex();
      const token = tokens[index];
      if (token) {
        saveReadingPosition(index, token.chapterIndex);
      }
    }
  });

  // Check for saved book on load
  await checkForSavedBook();

  console.log('RSVP Reader initialized');
}

/**
 * Check if there's a saved book to resume
 */
async function checkForSavedBook() {
  const savedBook = getBookReference();
  if (!savedBook) return;

  // Check if we can load the file automatically
  const fileStatus = await checkSavedFileStatus();
  showResumePrompt(savedBook, fileStatus);
}

/**
 * Show resume prompt for saved book
 * @param {Object} savedBook - Saved book reference
 * @param {Object} fileStatus - { available, requiresPermission }
 */
function showResumePrompt(savedBook, fileStatus = { available: false, requiresPermission: false }) {
  bookTitleEl.textContent = savedBook.title;
  bookAuthorEl.textContent = savedBook.author;
  bookStatsEl.textContent = `${savedBook.totalWords.toLocaleString()} words · ${savedBook.chapterCount} chapters`;

  if (savedBook.coverUrl) {
    bookCover.src = savedBook.coverUrl;
    coverPlaceholder.style.display = 'none';
  } else {
    bookCover.src = '';
    coverPlaceholder.style.display = 'flex';
  }

  // Configure button based on file availability
  const fileHint = document.getElementById('file-hint');

  if (fileStatus.available) {
    startReadingBtn.disabled = false;

    if (fileStatus.requiresPermission) {
      startReadingBtn.textContent = 'Continue Reading (Grant Access)';
    } else {
      const savedPosition = getReadingPosition();
      if (savedPosition && savedPosition.wordIndex > 0) {
        const progress = Math.round((savedPosition.wordIndex / savedBook.totalWords) * 100);
        startReadingBtn.textContent = `Continue Reading (${progress}%)`;
      } else {
        startReadingBtn.textContent = 'Load Saved Book';
      }
    }

    // Replace click handler to load saved file
    startReadingBtn.onclick = handleReloadSavedFile;

    // Hide file hint if it exists
    if (fileHint) {
      fileHint.classList.add('hidden');
    }
  } else {
    // No saved file access - need to re-select
    startReadingBtn.disabled = true;
    startReadingBtn.textContent = 'Select file to resume';
    startReadingBtn.onclick = null;

    // Show file hint if it exists
    if (fileHint) {
      fileHint.classList.remove('hidden');
    }
  }

  chooseDifferentBtn.textContent = 'Choose Different Book';
  showBookInfoScreen();
}

/**
 * Attempt to reload the saved file and start reading immediately
 */
async function handleReloadSavedFile() {
  const savedBook = getBookReference();
  if (!savedBook) {
    handleError(new Error('No saved book found'));
    return;
  }

  try {
    startReadingBtn.disabled = true;
    startReadingBtn.textContent = 'Loading...';

    const file = await loadSavedFile();

    if (file) {
      // Verify file matches what we expect
      if (file.name === savedBook.fileName && file.size === savedBook.fileSize) {
        // Load the book data
        currentFile = file;
        bookData = await parseEpub(file);
        tokens = tokenizeChapters(bookData.chapters);

        // Start reading immediately
        startReading();
      } else {
        // File changed - notify user
        handleError(new Error('The saved file has been modified. Please select it again.'));
        await clearSavedFile();
        await checkForSavedBook();
      }
    } else {
      // Permission denied or file not available
      handleError(new Error('Could not access the saved file. Please select it again.'));
      await clearSavedFile();
      showLandingScreen();
    }
  } catch (error) {
    handleError(error);
    startReadingBtn.disabled = false;
    startReadingBtn.textContent = 'Try Again';
    startReadingBtn.onclick = handleReloadSavedFile;
  }
}

/**
 * Handle a loaded file
 * @param {File} file - The EPUB file
 * @param {FileSystemFileHandle|null} handle - The file handle (if available)
 */
async function handleFile(file, handle = null) {
  try {
    currentFile = file;
    currentFileHandle = handle;
    landingScreen.classList.add('loading');

    console.log('Parsing EPUB:', file.name);
    bookData = await parseEpub(file);
    console.log('Book loaded:', bookData.metadata.title);
    console.log('Chapters:', bookData.chapters.length);
    console.log('Total words:', bookData.totalWords);

    tokens = tokenizeChapters(bookData.chapters);
    console.log('Tokens generated:', tokens.length);

    const isResume = isMatchingSavedBook(file);
    saveBookReference(bookData, file);

    // Save file access for future reloads
    try {
      await saveFileAccess(file, handle);
    } catch (e) {
      console.warn('Failed to save file access:', e);
    }

    displayBookInfo(bookData, isResume);

    landingScreen.classList.remove('loading');
    showBookInfoScreen();
  } catch (error) {
    landingScreen.classList.remove('loading');
    handleError(error);
  }
}

/**
 * Display book info on the info screen
 * @param {Object} data - Parsed book data
 * @param {boolean} isResume - Whether resuming a previous session
 */
function displayBookInfo(data, isResume) {
  bookTitleEl.textContent = data.metadata.title;
  bookAuthorEl.textContent = data.metadata.author;
  bookStatsEl.textContent = `${data.totalWords.toLocaleString()} words · ${data.chapters.length} chapters`;

  if (data.metadata.coverUrl) {
    bookCover.src = data.metadata.coverUrl;
    coverPlaceholder.style.display = 'none';
  } else {
    bookCover.src = '';
    coverPlaceholder.style.display = 'flex';
  }

  // Hide file hint (we have the file loaded)
  const fileHint = document.getElementById('file-hint');
  if (fileHint) {
    fileHint.classList.add('hidden');
  }

  // Reset onclick to normal start reading
  startReadingBtn.onclick = startReading;
  startReadingBtn.disabled = false;

  if (isResume) {
    const savedPosition = getReadingPosition();
    if (savedPosition && savedPosition.wordIndex > 0) {
      const progress = Math.round((savedPosition.wordIndex / data.totalWords) * 100);
      startReadingBtn.textContent = `Resume Reading (${progress}%)`;
    } else {
      startReadingBtn.textContent = 'Start Reading';
    }
  } else {
    startReadingBtn.textContent = 'Start Reading';
  }
}

/**
 * Start or resume reading
 */
function startReading() {
  if (!bookData || !tokens) {
    handleError(new Error('No book loaded'));
    return;
  }

  if (engine) {
    engine.destroy();
  }

  engine = createRsvpEngine({
    tokens,
    wpm: preferences.wpm,
    chunkSize: preferences.chunkSize || 1,
    onWord: handleWord,
    onStateChange: handleStateChange,
    onProgress: handleProgress,
    onEnd: handleEnd,
  });

  const isResume = isMatchingSavedBook(currentFile);
  if (isResume) {
    const savedPosition = getReadingPosition();
    if (savedPosition && savedPosition.wordIndex > 0) {
      engine.seekTo(savedPosition.wordIndex);
    }
  } else {
    clearBookData();
    saveBookReference(bookData, currentFile);
  }

  updateWpmDisplay(preferences.wpm);
  updateChunkDisplay(preferences.chunkSize || 1);
  updatePeripheralPreviewVisibility();
  statusIndicator.textContent = 'Paused';
  statusIndicator.classList.remove('playing');

  showReaderScreen();

  // Initialize mobile controls when entering reader
  initMobileToolbar();
  updateMobileUI();
}

/**
 * Handle word display update from the engine
 * @param {Object} data - Word data from engine
 */
function handleWord(data) {
  const { token, chunk, prevToken, nextToken, index, chunkSize } = data;

  // Handle chunk display
  if (chunkSize > 1) {
    displayChunk(chunk);
  } else {
    displaySingleWord(token.word);
  }

  // Update peripheral preview
  if (showPeripheralPreview) {
    prevWordEl.textContent = prevToken?.word || '';
    nextWordEl.textContent = nextToken?.word || '';
  }

  // Show chapter indicator on chapter change
  if (token.isChapterStart && index > 0) {
    showChapterIndicator(token.chapterTitle);
  }
}

/**
 * Display a single word with ORP highlighting
 * Uses CSS flexbox two-container layout - no JS measurement needed.
 * Left container (right-aligned) contains before+ORP, right container (left-aligned) contains after.
 * @param {string} word - The word to display
 */
function displaySingleWord(word) {
  currentWordEl.classList.remove('chunk-mode');
  const { before, orp, after } = splitWordAtOrp(word);

  // Update the text - CSS handles positioning automatically
  wordBeforeEl.textContent = before;
  wordOrpEl.textContent = orp;
  wordAfterEl.textContent = after;
}

/**
 * Display a chunk of words
 * For chunks, center the entire text without ORP split (research shows chunks require eye movement anyway)
 * @param {Array} chunk - Array of token objects
 */
function displayChunk(chunk) {
  currentWordEl.classList.add('chunk-mode');

  // For chunks, center the entire text without ORP
  const text = chunk.map((t) => t.word).join(' ');

  // Clear left container, put all text in right container (centered via CSS)
  wordBeforeEl.textContent = '';
  wordOrpEl.textContent = '';
  wordAfterEl.textContent = text;
}

/**
 * Show chapter indicator briefly
 * @param {string} title - Chapter title
 */
function showChapterIndicator(title) {
  chapterTitle.textContent = title;
  chapterIndicator.classList.remove('hidden');

  chapterIndicator.style.animation = 'none';
  chapterIndicator.offsetHeight;
  chapterIndicator.style.animation = '';

  setTimeout(() => {
    chapterIndicator.classList.add('hidden');
  }, 2000);
}

/**
 * Handle play/pause state change
 * @param {boolean} isPlaying - Current playing state
 */
function handleStateChange(isPlaying) {
  if (isPlaying) {
    statusIndicator.textContent = 'Playing';
    statusIndicator.classList.add('playing');

    // Mobile: update UI and acquire wake lock
    if (isMobileDevice()) {
      if (playPauseIcon) playPauseIcon.textContent = '⏸';
      btnPlayPause?.classList.add('playing');
      setPlayingState(true);
      acquireWakeLock();
    }
  } else {
    statusIndicator.textContent = 'Paused';
    statusIndicator.classList.remove('playing');

    // Mobile: update UI and release wake lock
    if (isMobileDevice()) {
      if (playPauseIcon) playPauseIcon.textContent = '▶';
      btnPlayPause?.classList.remove('playing');
      setPlayingState(false);
      releaseWakeLock();
    }

    // Update step button states (only enabled when paused)
    updateStepButtonStates();

    if (engine) {
      const index = engine.getCurrentIndex();
      const token = tokens[index];
      if (token) {
        saveReadingPosition(index, token.chapterIndex);
      }
    }
  }
}

/**
 * Handle progress update
 * @param {Object} data - Progress data
 */
function handleProgress(data) {
  progressDisplay.textContent = `${Math.round(data.progress)}%`;

  // Save position periodically while playing
  const now = Date.now();
  if (now - lastPositionSaveTime > POSITION_SAVE_INTERVAL && engine) {
    lastPositionSaveTime = now;
    const index = engine.getCurrentIndex();
    const token = tokens[index];
    if (token) {
      saveReadingPosition(index, token.chapterIndex);
    }
  }
}

/**
 * Handle reaching the end of the book
 */
function handleEnd() {
  console.log('Reached end of book');
  wordBeforeEl.textContent = '';
  wordOrpEl.textContent = 'The';
  wordAfterEl.textContent = ' End';
  saveReadingPosition(tokens.length - 1, bookData.chapters.length - 1);
}

/**
 * Handle errors
 * @param {Error} error - The error
 */
function handleError(error) {
  console.error('Error:', error);
  alert(error.message || 'An error occurred');
  showLandingScreen();
}

/**
 * Handle keyboard input
 * @param {KeyboardEvent} event - Keyboard event
 */
function handleKeydown(event) {
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
    return;
  }

  if (readerScreen.classList.contains('hidden')) {
    return;
  }

  switch (event.code) {
    case 'Space':
      event.preventDefault();
      engine?.toggle();
      break;

    case 'ArrowUp':
      event.preventDefault();
      if (engine) {
        const newWpm = engine.setWpm(engine.getWpm() + 25);
        updateWpmDisplay(newWpm);
        preferences.wpm = newWpm;
        savePreferences({ wpm: newWpm });
      }
      break;

    case 'ArrowDown':
      event.preventDefault();
      if (engine) {
        const newWpm = engine.setWpm(engine.getWpm() - 25);
        updateWpmDisplay(newWpm);
        preferences.wpm = newWpm;
        savePreferences({ wpm: newWpm });
      }
      break;

    case 'Digit1':
    case 'Digit2':
    case 'Digit3':
    case 'Digit4':
    case 'Digit5':
      event.preventDefault();
      if (engine) {
        const size = parseInt(event.code.replace('Digit', ''));
        const newSize = engine.setChunkSize(size);
        updateChunkDisplay(newSize);
        preferences.chunkSize = newSize;
        savePreferences({ chunkSize: newSize });
      }
      break;

    case 'KeyP':
      event.preventDefault();
      togglePeripheralPreview();
      break;

    case 'KeyF':
      event.preventDefault();
      cycleReadingFont();
      break;

    case 'KeyJ':
      event.preventDefault();
      stepBackward();
      break;

    case 'KeyK':
      event.preventDefault();
      stepForward();
      break;

    case 'Equal':
    case 'NumpadAdd':
      event.preventDefault();
      increaseFontSize();
      break;

    case 'Minus':
    case 'NumpadSubtract':
      event.preventDefault();
      decreaseFontSize();
      break;

    case 'Escape':
      event.preventDefault();
      engine?.pause();
      showBookInfoScreen();
      break;
  }
}

/**
 * Toggle peripheral preview visibility
 */
function togglePeripheralPreview() {
  showPeripheralPreview = !showPeripheralPreview;
  preferences.showPeripheralPreview = showPeripheralPreview;
  savePreferences({ showPeripheralPreview });
  updatePeripheralPreviewVisibility();
}

/**
 * Update peripheral preview DOM visibility
 */
function updatePeripheralPreviewVisibility() {
  if (showPeripheralPreview) {
    prevWordEl.classList.add('visible');
    nextWordEl.classList.add('visible');
  } else {
    prevWordEl.classList.remove('visible');
    nextWordEl.classList.remove('visible');
    prevWordEl.textContent = '';
    nextWordEl.textContent = '';
  }
}

/**
 * Update WPM display
 * @param {number} wpm - Current WPM
 */
function updateWpmDisplay(wpm) {
  wpmDisplay.textContent = `${wpm} WPM`;
}

/**
 * Update chunk size display
 * @param {number} size - Current chunk size
 */
function updateChunkDisplay(size) {
  chunkDisplay.textContent = size === 1 ? '1 word' : `${size} words`;
}

/**
 * Set the reading font
 * @param {string} fontId - Font ID from READING_FONTS
 */
function setReadingFont(fontId) {
  const font = READING_FONTS[fontId];
  if (!font) return;

  document.documentElement.style.setProperty('--font-family-reading', font.family);
  preferences.fontFamily = fontId;
  savePreferences({ fontFamily: fontId });
}

/**
 * Cycle to the next reading font
 */
function cycleReadingFont() {
  const fontIds = Object.keys(READING_FONTS);
  const currentIndex = fontIds.indexOf(preferences.fontFamily || 'literata');
  const nextIndex = (currentIndex + 1) % fontIds.length;
  const nextFontId = fontIds[nextIndex];

  setReadingFont(nextFontId);

  // Show brief notification of font change
  const font = READING_FONTS[nextFontId];
  showTemporaryNotification(`Font: ${font.name}`);
}

/**
 * Set the font size
 * @param {number} size - Font size in rem
 */
function setFontSize(size) {
  const clampedSize = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, size));
  document.documentElement.style.setProperty('--font-size-word', `${clampedSize}rem`);
  preferences.fontSize = clampedSize;
  savePreferences({ fontSize: clampedSize });
  return clampedSize;
}

/**
 * Increase font size
 */
function increaseFontSize() {
  const currentSize = preferences.fontSize || 3;
  const newSize = setFontSize(currentSize + FONT_SIZE_STEP);
  showTemporaryNotification(`Size: ${newSize}rem`);
}

/**
 * Decrease font size
 */
function decreaseFontSize() {
  const currentSize = preferences.fontSize || 3;
  const newSize = setFontSize(currentSize - FONT_SIZE_STEP);
  showTemporaryNotification(`Size: ${newSize}rem`);
}

/**
 * Step backward by one word (only when paused)
 */
function stepBackward() {
  if (!engine || engine.getIsPlaying()) return;

  const currentIndex = engine.getCurrentIndex();
  if (currentIndex > 0) {
    engine.seekTo(currentIndex - 1);
  }
}

/**
 * Step forward by one word (only when paused)
 */
function stepForward() {
  if (!engine || engine.getIsPlaying()) return;

  const currentIndex = engine.getCurrentIndex();
  if (currentIndex < tokens.length - 1) {
    engine.seekTo(currentIndex + 1);
  }
}

/**
 * Show a temporary notification (reuses chapter indicator)
 * @param {string} message - Message to display
 */
function showTemporaryNotification(message) {
  chapterTitle.textContent = message;
  chapterIndicator.classList.remove('hidden');

  chapterIndicator.style.animation = 'none';
  chapterIndicator.offsetHeight;
  chapterIndicator.style.animation = '';

  setTimeout(() => {
    chapterIndicator.classList.add('hidden');
  }, 1000);
}

/**
 * Apply saved font preferences on startup
 */
function applyFontPreferences() {
  // Apply saved font family
  if (preferences.fontFamily && READING_FONTS[preferences.fontFamily]) {
    document.documentElement.style.setProperty(
      '--font-family-reading',
      READING_FONTS[preferences.fontFamily].family
    );
  }

  // Apply saved font size
  if (preferences.fontSize) {
    document.documentElement.style.setProperty('--font-size-word', `${preferences.fontSize}rem`);
  }
}

/**
 * Initialize mobile toolbar controls
 */
function initMobileToolbar() {
  if (!isMobileDevice() || mobileControlsInitialized) return;

  mobileControlsInitialized = true;

  // Initialize visibility management
  initMobileControls({
    toolbar: mobileToolbar,
    reader: readerScreen,
  });

  // Setup wake lock visibility handler
  setupVisibilityHandler(() => engine?.getIsPlaying() || false);

  // Play/Pause
  btnPlayPause?.addEventListener('click', () => {
    engine?.toggle();
  });

  // Speed controls
  btnSpeedUp?.addEventListener('click', () => {
    if (engine) {
      const newWpm = engine.setWpm(engine.getWpm() + 25);
      updateWpmDisplay(newWpm);
      preferences.wpm = newWpm;
      savePreferences({ wpm: newWpm });
    }
  });

  btnSpeedDown?.addEventListener('click', () => {
    if (engine) {
      const newWpm = engine.setWpm(engine.getWpm() - 25);
      updateWpmDisplay(newWpm);
      preferences.wpm = newWpm;
      savePreferences({ wpm: newWpm });
    }
  });

  // Step controls
  btnStepBack?.addEventListener('click', stepBackward);
  btnStepForward?.addEventListener('click', stepForward);

  // Chunk size cycle (1 -> 2 -> 3 -> 4 -> 5 -> 1)
  btnChunkCycle?.addEventListener('click', () => {
    if (engine) {
      const currentSize = engine.getChunkSize();
      const newSize = currentSize >= 5 ? 1 : currentSize + 1;
      const actualSize = engine.setChunkSize(newSize);
      updateChunkDisplay(actualSize);
      updateChunkIcon(actualSize);
      preferences.chunkSize = actualSize;
      savePreferences({ chunkSize: actualSize });
    }
  });

  // Font size controls
  btnFontUp?.addEventListener('click', increaseFontSize);
  btnFontDown?.addEventListener('click', decreaseFontSize);

  // Font cycle
  btnFontCycle?.addEventListener('click', cycleReadingFont);

  // Peripheral preview toggle
  btnPreviewToggle?.addEventListener('click', () => {
    togglePeripheralPreview();
    updatePreviewIcon();
  });

  // Menu/back button
  btnMenu?.addEventListener('click', () => {
    engine?.pause();
    showBookInfoScreen();
  });
}

/**
 * Update mobile UI elements to reflect current state
 */
function updateMobileUI() {
  if (!isMobileDevice()) return;

  // Update chunk icon
  updateChunkIcon(preferences.chunkSize || 1);

  // Update preview icon
  updatePreviewIcon();

  // Update step button states
  updateStepButtonStates();
}

/**
 * Update preview icon based on current state
 */
function updatePreviewIcon() {
  if (previewIcon) {
    previewIcon.textContent = showPeripheralPreview ? '◉' : '◯';
    btnPreviewToggle?.classList.toggle('active', showPeripheralPreview);
  }
}

/**
 * Update chunk icon
 * @param {number} size - Current chunk size
 */
function updateChunkIcon(size) {
  if (chunkIcon) {
    chunkIcon.textContent = size.toString();
  }
}

/**
 * Update step button enabled/disabled state
 */
function updateStepButtonStates() {
  const isPaused = engine && !engine.getIsPlaying();
  if (btnStepBack) btnStepBack.disabled = !isPaused;
  if (btnStepForward) btnStepForward.disabled = !isPaused;
}

/**
 * Show the landing screen
 */
function showLandingScreen() {
  landingScreen.classList.remove('hidden');
  bookInfoScreen.classList.add('hidden');
  readerScreen.classList.add('hidden');
}

/**
 * Show the book info screen
 */
function showBookInfoScreen() {
  landingScreen.classList.add('hidden');
  bookInfoScreen.classList.remove('hidden');
  readerScreen.classList.add('hidden');

  // Release wake lock when leaving reader
  releaseWakeLock();
}

/**
 * Show the reader screen
 */
function showReaderScreen() {
  landingScreen.classList.add('hidden');
  bookInfoScreen.classList.add('hidden');
  readerScreen.classList.remove('hidden');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
