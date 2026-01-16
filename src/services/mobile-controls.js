/**
 * Mobile Controls Service
 * Manages touch toolbar visibility and auto-hide behavior
 */

const AUTOHIDE_DELAY = 4000; // 4 seconds

let hideTimer = null;
let isVisible = true;
let isPlaying = false;
let toolbarEl = null;
let readerEl = null;

/**
 * Detect if the device supports touch or is a small screen
 * @returns {boolean}
 */
export function isMobileDevice() {
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia('(pointer: coarse)').matches ||
    window.matchMedia('(max-width: 768px)').matches
  );
}

/**
 * Initialize mobile controls with auto-hide behavior
 * @param {Object} options
 * @param {HTMLElement} options.toolbar - The toolbar element
 * @param {HTMLElement} options.reader - The reader screen element
 */
export function initMobileControls({ toolbar, reader }) {
  if (!toolbar || !reader) {
    console.warn('Mobile controls: missing toolbar or reader element');
    return;
  }

  toolbarEl = toolbar;
  readerEl = reader;

  // Tap anywhere on reader toggles toolbar visibility (except toolbar itself)
  reader.addEventListener('click', (e) => {
    if (toolbar.contains(e.target)) {
      return;
    }
    toggleVisibility();
  });

  // Keep toolbar visible while interacting with it
  toolbar.addEventListener('touchstart', () => {
    clearAutoHideTimer();
  }, { passive: true });

  toolbar.addEventListener('touchend', () => {
    if (isPlaying) {
      startAutoHideTimer();
    }
  }, { passive: true });

  // Initial state
  showToolbar();
}

/**
 * Update the playing state and manage toolbar visibility accordingly
 * @param {boolean} playing - Whether playback is active
 */
export function setPlayingState(playing) {
  isPlaying = playing;
  if (playing) {
    startAutoHideTimer();
  } else {
    clearAutoHideTimer();
    showToolbar();
  }
}

/**
 * Start the auto-hide timer
 */
function startAutoHideTimer() {
  clearAutoHideTimer();
  hideTimer = setTimeout(() => {
    hideToolbar();
  }, AUTOHIDE_DELAY);
}

/**
 * Clear the auto-hide timer
 */
function clearAutoHideTimer() {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

/**
 * Show the toolbar
 */
function showToolbar() {
  if (toolbarEl) {
    toolbarEl.classList.remove('hidden');
    isVisible = true;
  }
}

/**
 * Hide the toolbar (only if playing)
 */
function hideToolbar() {
  if (toolbarEl && isPlaying) {
    toolbarEl.classList.add('hidden');
    isVisible = false;
  }
}

/**
 * Toggle toolbar visibility
 */
function toggleVisibility() {
  if (isVisible) {
    hideToolbar();
  } else {
    showToolbar();
    if (isPlaying) {
      startAutoHideTimer();
    }
  }
}

/**
 * Get current visibility state
 * @returns {boolean}
 */
export function isToolbarVisible() {
  return isVisible;
}

/**
 * Clean up event listeners and timers
 */
export function destroy() {
  clearAutoHideTimer();
  toolbarEl = null;
  readerEl = null;
  isVisible = true;
  isPlaying = false;
}
