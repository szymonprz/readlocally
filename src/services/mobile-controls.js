/**
 * Mobile Controls Service
 * Manages toolbar visibility with chevron button
 */

let isVisible = false;
let toolbarEl = null;
let readerEl = null;
let chevronBtn = null;
let onToolbarShowCallback = null;

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
 * Initialize mobile controls with chevron button
 * @param {Object} options
 * @param {HTMLElement} options.toolbar - The toolbar element
 * @param {HTMLElement} options.reader - The reader screen element
 * @param {Function} options.onToolbarShow - Callback when toolbar is shown (should pause reading)
 */
export function initMobileControls({ toolbar, reader, onToolbarShow }) {
  if (!toolbar || !reader) {
    console.warn('Mobile controls: missing toolbar or reader element');
    return;
  }

  toolbarEl = toolbar;
  readerEl = reader;
  onToolbarShowCallback = onToolbarShow;

  // Create chevron button
  createChevronButton();

  // Initial state: toolbar hidden
  hideToolbar();
}

/**
 * Create the chevron toggle button
 */
function createChevronButton() {
  if (chevronBtn) return; // Already created

  chevronBtn = document.createElement('button');
  chevronBtn.id = 'toolbar-chevron';
  chevronBtn.className = 'toolbar-chevron';
  chevronBtn.setAttribute('aria-label', 'Toggle toolbar');
  chevronBtn.innerHTML = '⌃'; // Chevron up by default

  // Add to reader screen
  readerEl.appendChild(chevronBtn);

  // Click handler
  chevronBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent tap controls from triggering
    toggleVisibility();
  });
}

/**
 * Show the toolbar
 */
function showToolbar() {
  if (toolbarEl) {
    toolbarEl.classList.remove('hidden');
    isVisible = true;

    // Update chevron to down arrow
    if (chevronBtn) {
      chevronBtn.innerHTML = '⌄';
      chevronBtn.setAttribute('aria-label', 'Hide toolbar');
    }

    // Trigger pause callback
    if (onToolbarShowCallback) {
      onToolbarShowCallback();
    }
  }
}

/**
 * Hide the toolbar
 */
function hideToolbar() {
  if (toolbarEl) {
    toolbarEl.classList.add('hidden');
    isVisible = false;

    // Update chevron to up arrow
    if (chevronBtn) {
      chevronBtn.innerHTML = '⌃';
      chevronBtn.setAttribute('aria-label', 'Show toolbar');
    }

    // Note: We do NOT auto-play when hiding
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
 * Programmatically show toolbar (for external use)
 */
export function show() {
  showToolbar();
}

/**
 * Programmatically hide toolbar (for external use)
 */
export function hide() {
  hideToolbar();
}

/**
 * Clean up event listeners and elements
 */
export function destroy() {
  if (chevronBtn && chevronBtn.parentNode) {
    chevronBtn.parentNode.removeChild(chevronBtn);
  }

  chevronBtn = null;
  toolbarEl = null;
  readerEl = null;
  onToolbarShowCallback = null;
  isVisible = false;
}
