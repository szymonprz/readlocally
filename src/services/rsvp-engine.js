/**
 * RSVP Engine Service
 * Controls the word-by-word display timing using requestAnimationFrame
 */

/**
 * Create an RSVP engine instance
 * @param {Object} options
 * @param {Array} options.tokens - Array of word tokens
 * @param {number} options.wpm - Words per minute (300-1000)
 * @param {number} options.chunkSize - Number of words to display at once (1-5)
 * @param {Function} options.onWord - Callback when a new word should be displayed
 * @param {Function} options.onStateChange - Callback when play/pause state changes
 * @param {Function} options.onProgress - Callback for progress updates
 * @param {Function} options.onEnd - Callback when reading reaches the end
 * @returns {Object} Engine control interface
 */
export function createRsvpEngine({
  tokens,
  wpm = 300,
  chunkSize = 1,
  onWord,
  onStateChange,
  onProgress,
  onEnd,
}) {
  let currentIndex = 0;
  let currentWpm = wpm;
  let currentChunkSize = Math.max(1, Math.min(5, chunkSize));
  let isPlaying = false;
  let lastFrameTime = 0;
  let accumulatedTime = 0;
  let animationFrameId = null;

  /**
   * Calculate milliseconds per word based on WPM
   * @returns {number} Milliseconds per word
   */
  function getMsPerWord() {
    return 60000 / currentWpm;
  }

  /**
   * Get additional delay for sentence-ending words (smart pause)
   * @param {Object} token - The current token
   * @returns {number} Additional delay in ms
   */
  function getSmartPauseDelay(token) {
    if (token.hasSentenceEnd) {
      return 75; // 75ms extra pause at sentence boundaries
    }
    return 0;
  }

  /**
   * Main animation loop
   * @param {number} timestamp - Current timestamp from requestAnimationFrame
   */
  function tick(timestamp) {
    if (!isPlaying) return;

    if (lastFrameTime === 0) {
      lastFrameTime = timestamp;
    }

    const deltaTime = timestamp - lastFrameTime;
    lastFrameTime = timestamp;
    accumulatedTime += deltaTime;

    const currentToken = tokens[currentIndex];
    const msPerWord = getMsPerWord() + getSmartPauseDelay(currentToken);

    if (accumulatedTime >= msPerWord) {
      accumulatedTime -= msPerWord;

      // Move to next word (or chunk)
      currentIndex += currentChunkSize;

      if (currentIndex >= tokens.length) {
        // Reached the end
        currentIndex = tokens.length - 1;
        pause();
        onEnd?.();
        return;
      }

      // Display the new word
      displayCurrentWord();
    }

    animationFrameId = requestAnimationFrame(tick);
  }

  /**
   * Get chunk of tokens starting at index
   * @param {number} startIndex - Starting index
   * @returns {Array} Array of tokens in the chunk
   */
  function getChunk(startIndex) {
    const chunk = [];
    for (let i = 0; i < currentChunkSize && startIndex + i < tokens.length; i++) {
      chunk.push(tokens[startIndex + i]);
    }
    return chunk;
  }

  /**
   * Display the current word/chunk
   */
  function displayCurrentWord() {
    const token = tokens[currentIndex];
    if (token) {
      const chunk = getChunk(currentIndex);
      const prevToken = currentIndex > 0 ? tokens[currentIndex - 1] : null;
      const nextIndex = currentIndex + currentChunkSize;
      const nextToken = nextIndex < tokens.length ? tokens[nextIndex] : null;

      onWord?.({
        token,
        chunk,
        prevToken,
        nextToken,
        index: currentIndex,
        chunkSize: currentChunkSize,
      });
      updateProgress();
    }
  }

  /**
   * Update progress
   */
  function updateProgress() {
    const progress = tokens.length > 0 ? (currentIndex / tokens.length) * 100 : 0;
    onProgress?.({
      currentIndex,
      totalWords: tokens.length,
      progress,
      currentToken: tokens[currentIndex],
    });
  }

  /**
   * Start or resume playback
   */
  function play() {
    if (isPlaying) return;
    if (currentIndex >= tokens.length) {
      currentIndex = 0; // Restart from beginning if at end
    }

    isPlaying = true;
    lastFrameTime = 0;
    accumulatedTime = 0;

    onStateChange?.(true);
    displayCurrentWord();
    animationFrameId = requestAnimationFrame(tick);
  }

  /**
   * Pause playback
   */
  function pause() {
    if (!isPlaying) return;

    isPlaying = false;
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    onStateChange?.(false);
  }

  /**
   * Toggle play/pause
   */
  function toggle() {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }

  /**
   * Set WPM (can be done while playing)
   * @param {number} newWpm - New WPM value
   */
  function setWpm(newWpm) {
    currentWpm = Math.max(300, Math.min(1000, newWpm));
    return currentWpm;
  }

  /**
   * Get current WPM
   * @returns {number} Current WPM
   */
  function getWpm() {
    return currentWpm;
  }

  /**
   * Set chunk size (can be done while playing)
   * @param {number} size - New chunk size (1-5)
   */
  function setChunkSize(size) {
    currentChunkSize = Math.max(1, Math.min(5, size));
    displayCurrentWord(); // Update display immediately
    return currentChunkSize;
  }

  /**
   * Get current chunk size
   * @returns {number} Current chunk size
   */
  function getChunkSize() {
    return currentChunkSize;
  }

  /**
   * Jump to a specific index
   * @param {number} index - Target index
   */
  function seekTo(index) {
    currentIndex = Math.max(0, Math.min(index, tokens.length - 1));
    accumulatedTime = 0;
    displayCurrentWord();
  }

  /**
   * Get current position
   * @returns {number} Current index
   */
  function getCurrentIndex() {
    return currentIndex;
  }

  /**
   * Check if currently playing
   * @returns {boolean} Playing state
   */
  function getIsPlaying() {
    return isPlaying;
  }

  /**
   * Clean up resources
   */
  function destroy() {
    pause();
  }

  // Display initial word
  if (tokens.length > 0) {
    displayCurrentWord();
  }

  return {
    play,
    pause,
    toggle,
    setWpm,
    getWpm,
    setChunkSize,
    getChunkSize,
    seekTo,
    getCurrentIndex,
    getIsPlaying,
    destroy,
  };
}
