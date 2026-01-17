/**
 * Fullscreen Service
 *
 * Manages fullscreen mode for mobile reading experience.
 * - Automatically enters fullscreen after toolbar auto-hide delay (4 seconds) when playing
 * - Stays in fullscreen when paused
 * - Prevents layout shift during transitions
 * - Provides manual toggle control
 */

const FULLSCREEN_DELAY = 4000; // Match toolbar auto-hide delay

let readerElement = null;
let fullscreenButton = null;
let autoEnterTimer = null;
let isAutoEnterEnabled = true;
let onStateChange = null;

/**
 * Check if Fullscreen API is supported
 */
export function isFullscreenSupported() {
  return !!(
    document.fullscreenEnabled ||
    document.webkitFullscreenEnabled ||
    document.mozFullScreenEnabled ||
    document.msFullscreenEnabled
  );
}

/**
 * Check if currently in fullscreen mode
 */
export function isFullscreenActive() {
  return !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullScreenElement
  );
}

/**
 * Enter fullscreen mode with layout shift prevention
 */
export async function enterFullscreen() {
  if (!isFullscreenSupported() || isFullscreenActive()) {
    return;
  }

  try {
    // Add CSS class BEFORE entering fullscreen to prevent layout shift
    if (readerElement) {
      readerElement.classList.add('fullscreen-active');
    }

    // Use requestAnimationFrame to ensure CSS is applied before fullscreen request
    await new Promise(resolve => requestAnimationFrame(resolve));

    const element = document.documentElement;

    if (element.requestFullscreen) {
      await element.requestFullscreen();
    } else if (element.webkitRequestFullscreen) {
      await element.webkitRequestFullscreen();
    } else if (element.mozRequestFullScreen) {
      await element.mozRequestFullScreen();
    } else if (element.msRequestFullscreen) {
      await element.msRequestFullscreen();
    }
  } catch (error) {
    console.error('Failed to enter fullscreen:', error);
    // Remove class if fullscreen failed
    if (readerElement) {
      readerElement.classList.remove('fullscreen-active');
    }
  }
}

/**
 * Exit fullscreen mode
 */
export async function exitFullscreen() {
  if (!isFullscreenActive()) {
    return;
  }

  try {
    if (document.exitFullscreen) {
      await document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      await document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      await document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
      await document.msExitFullscreen();
    }

    // Remove CSS class after exiting fullscreen
    if (readerElement) {
      readerElement.classList.remove('fullscreen-active');
    }
  } catch (error) {
    console.error('Failed to exit fullscreen:', error);
  }
}

/**
 * Toggle fullscreen mode
 */
export async function toggleFullscreen() {
  if (isFullscreenActive()) {
    await exitFullscreen();
  } else {
    await enterFullscreen();
  }
}

/**
 * Start auto-enter timer (triggers after FULLSCREEN_DELAY ms)
 */
function startAutoEnterTimer() {
  clearAutoEnterTimer();

  if (!isAutoEnterEnabled || !isFullscreenSupported()) {
    return;
  }

  autoEnterTimer = setTimeout(() => {
    enterFullscreen();
  }, FULLSCREEN_DELAY);
}

/**
 * Clear auto-enter timer
 */
function clearAutoEnterTimer() {
  if (autoEnterTimer) {
    clearTimeout(autoEnterTimer);
    autoEnterTimer = null;
  }
}

/**
 * Update fullscreen button icon based on current state
 */
function updateButtonIcon() {
  if (!fullscreenButton) return;

  const isActive = isFullscreenActive();
  const enterIcon = fullscreenButton.querySelector('.fullscreen-enter-icon');
  const exitIcon = fullscreenButton.querySelector('.fullscreen-exit-icon');

  if (enterIcon && exitIcon) {
    enterIcon.style.display = isActive ? 'none' : 'block';
    exitIcon.style.display = isActive ? 'block' : 'none';
  }
}

/**
 * Handle fullscreen change events (triggered by browser or user gestures)
 */
function handleFullscreenChange() {
  const isActive = isFullscreenActive();

  // Update CSS class to match fullscreen state
  if (readerElement) {
    if (isActive) {
      readerElement.classList.add('fullscreen-active');
    } else {
      readerElement.classList.remove('fullscreen-active');
    }
  }

  // Update button icon
  updateButtonIcon();

  // Notify state change callback
  if (onStateChange) {
    onStateChange(isActive);
  }
}

/**
 * Set playing state (called from main.js when play/pause changes)
 * @param {boolean} playing - Whether reading is playing
 */
export function setPlayingState(playing) {
  if (playing) {
    // Start auto-enter timer when playing starts
    startAutoEnterTimer();
  } else {
    // Clear timer when paused, but stay in fullscreen
    clearAutoEnterTimer();
  }
}

/**
 * Initialize fullscreen controls
 * @param {Object} options - Configuration options
 * @param {HTMLElement} options.readerElement - The reader screen element
 * @param {HTMLElement} options.fullscreenButton - The fullscreen toggle button
 * @param {Function} options.onStateChange - Callback when fullscreen state changes
 * @param {boolean} options.autoEnter - Enable auto-enter on play (default: true)
 */
export function initFullscreen(options = {}) {
  readerElement = options.readerElement;
  fullscreenButton = options.fullscreenButton;
  onStateChange = options.onStateChange;
  isAutoEnterEnabled = options.autoEnter !== false;

  if (!isFullscreenSupported()) {
    console.warn('Fullscreen API not supported');
    // Hide fullscreen button if not supported
    if (fullscreenButton) {
      fullscreenButton.style.display = 'none';
    }
    return;
  }

  // Listen for fullscreen change events (all vendor prefixes)
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
  document.addEventListener('mozfullscreenchange', handleFullscreenChange);
  document.addEventListener('msfullscreenchange', handleFullscreenChange);

  // Setup manual toggle button
  if (fullscreenButton) {
    fullscreenButton.addEventListener('click', toggleFullscreen);
    updateButtonIcon();
  }

  console.log('Fullscreen controls initialized');
}

/**
 * Cleanup fullscreen controls
 */
export function cleanup() {
  clearAutoEnterTimer();

  document.removeEventListener('fullscreenchange', handleFullscreenChange);
  document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
  document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
  document.removeEventListener('msfullscreenchange', handleFullscreenChange);

  if (fullscreenButton) {
    fullscreenButton.removeEventListener('click', toggleFullscreen);
  }

  readerElement = null;
  fullscreenButton = null;
  onStateChange = null;
}
