/**
 * Wake Lock Service
 * Manages Screen Wake Lock API to prevent screen sleep during reading
 */

let wakeLock = null;

/**
 * Request a screen wake lock to prevent the display from dimming
 * @returns {Promise<boolean>} True if wake lock was acquired
 */
export async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) {
    return false;
  }

  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
    });
    return true;
  } catch (err) {
    // Wake lock request can fail if:
    // - Page is not visible
    // - System is low on battery
    // - User denied permission
    console.warn('Wake Lock request failed:', err.message);
    return false;
  }
}

/**
 * Release the current wake lock
 * @returns {Promise<boolean>} True if wake lock was released
 */
export async function releaseWakeLock() {
  if (!wakeLock) {
    return false;
  }

  try {
    await wakeLock.release();
    wakeLock = null;
    return true;
  } catch (err) {
    console.warn('Wake Lock release failed:', err.message);
    return false;
  }
}

/**
 * Check if wake lock is currently active
 * @returns {boolean}
 */
export function isWakeLockActive() {
  return wakeLock !== null;
}

/**
 * Setup visibility change handler to re-acquire wake lock when tab becomes visible
 * @param {() => boolean} getIsPlaying - Function that returns current playing state
 */
export function setupVisibilityHandler(getIsPlaying) {
  document.addEventListener('visibilitychange', async () => {
    // Re-acquire wake lock when page becomes visible and playback is active
    if (document.visibilityState === 'visible' && getIsPlaying()) {
      await acquireWakeLock();
    }
  });
}
