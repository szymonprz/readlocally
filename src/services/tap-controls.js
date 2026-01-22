/**
 * Tap Controls Service
 *
 * Implements YouTube-style tap controls for the RSVP reader:
 * - Single tap center: play/pause
 * - Double tap left: skip back 25 words
 * - Double tap right: skip forward 25 words
 *
 * Also handles visual feedback (play/pause/back/forward icons)
 */

import { createElement, Play, Pause, Rewind, FastForward } from 'lucide';

export class TapControls {
  constructor() {
    this.targetElement = null;
    this.callbacks = {
      onPlayPause: null,
      onSkipBack: null,
      onSkipForward: null,
    };

    // Tap detection state
    this.lastTapTime = 0;
    this.lastTapZone = null;
    this.tapTimeout = null;
    this.DOUBLE_TAP_THRESHOLD = 300; // ms

    // Visual feedback elements
    this.feedbackElements = {
      playPause: null,
      backArrows: null,
      forwardArrows: null,
    };

    // Animation state
    this.animationTimeouts = [];
  }

  /**
   * Initialize tap controls on a target element
   * @param {HTMLElement} element - The element to attach tap listeners to
   * @param {Object} callbacks - Callback functions {onPlayPause, onSkipBack, onSkipForward}
   */
  init(element, callbacks) {
    this.targetElement = element;
    this.callbacks = callbacks;

    // Create visual feedback elements
    this.createFeedbackElements();

    // Attach event listeners
    this.attachListeners();
  }

  /**
   * Create visual feedback overlay elements
   */
  createFeedbackElements() {
    // Play/Pause feedback (top-right corner)
    const playPause = document.createElement('div');
    playPause.id = 'tap-feedback-playpause';
    playPause.className = 'tap-feedback';
    playPause.innerHTML = '<div class="feedback-icon"></div>';
    document.body.appendChild(playPause);
    this.feedbackElements.playPause = playPause;

    // Back arrows feedback (left side)
    const backArrows = document.createElement('div');
    backArrows.id = 'tap-feedback-back';
    backArrows.className = 'tap-feedback tap-feedback-arrows';
    backArrows.innerHTML = '<div class="feedback-icon"></div>';
    document.body.appendChild(backArrows);
    this.feedbackElements.backArrows = backArrows;

    // Forward arrows feedback (right side)
    const forwardArrows = document.createElement('div');
    forwardArrows.id = 'tap-feedback-forward';
    forwardArrows.className = 'tap-feedback tap-feedback-arrows';
    forwardArrows.innerHTML = '<div class="feedback-icon"></div>';
    document.body.appendChild(forwardArrows);
    this.feedbackElements.forwardArrows = forwardArrows;
  }

  /**
   * Get SVG icon for an action using Lucide icons
   * @param {'play'|'pause'|'back'|'forward'} action
   * @returns {SVGElement} SVG element
   */
  getIconElement(action) {
    const iconData = {
      play: Play,
      pause: Pause,
      back: Rewind,
      forward: FastForward,
    };

    const icon = iconData[action];
    if (!icon) return null;

    // Use Lucide's createElement to convert icon data to SVG element
    const svgElement = createElement(icon, {
      'stroke-width': 2,
      width: 40,
      height: 40,
    });

    return svgElement;
  }

  /**
   * Attach touch and mouse event listeners
   */
  attachListeners() {
    if (!this.targetElement) return;

    // Touch events
    this.targetElement.addEventListener('touchend', this.handleTap.bind(this), { passive: true });

    // Mouse events (for desktop support)
    this.targetElement.addEventListener('click', this.handleTap.bind(this));

    // Prevent text selection on double-tap
    this.targetElement.addEventListener('touchstart', (e) => {
      e.preventDefault();
    }, { passive: false });
  }

  /**
   * Handle tap/click events
   * @param {TouchEvent|MouseEvent} event
   */
  handleTap(event) {
    const now = Date.now();
    const timeSinceLastTap = now - this.lastTapTime;

    // Determine tap position and zone
    const { clientX } = event.type === 'touchend'
      ? event.changedTouches[0]
      : event;

    const zone = this.getTapZone(clientX);

    // Check if this is a double-tap in the same zone
    const isDoubleTap = timeSinceLastTap < this.DOUBLE_TAP_THRESHOLD
                        && zone === this.lastTapZone;

    if (isDoubleTap) {
      // Clear single tap timeout
      if (this.tapTimeout) {
        clearTimeout(this.tapTimeout);
        this.tapTimeout = null;
      }

      // Handle double-tap
      this.handleDoubleTap(zone);

      // Reset tap state
      this.lastTapTime = 0;
      this.lastTapZone = null;
    } else {
      // This is a potential first tap of a double-tap
      this.lastTapTime = now;
      this.lastTapZone = zone;

      // Wait to see if there's a second tap
      this.tapTimeout = setTimeout(() => {
        // Single tap confirmed
        this.handleSingleTap(zone);
        this.tapTimeout = null;
      }, this.DOUBLE_TAP_THRESHOLD);
    }
  }

  /**
   * Determine which zone was tapped (left/center/right)
   * @param {number} clientX - X coordinate of tap
   * @returns {'left'|'center'|'right'}
   */
  getTapZone(clientX) {
    const screenWidth = window.innerWidth;
    const leftBoundary = screenWidth * 0.4;
    const rightBoundary = screenWidth * 0.6;

    if (clientX < leftBoundary) return 'left';
    if (clientX > rightBoundary) return 'right';
    return 'center';
  }

  /**
   * Handle single tap
   * @param {'left'|'center'|'right'} zone
   */
  handleSingleTap(zone) {
    if (zone === 'center') {
      // Play/pause
      if (this.callbacks.onPlayPause) {
        this.callbacks.onPlayPause();
      }
    }
    // Left and right single taps do nothing
  }

  /**
   * Handle double tap
   * @param {'left'|'center'|'right'} zone
   */
  handleDoubleTap(zone) {
    if (zone === 'left') {
      // Skip back
      this.showFeedback('back');
      if (this.callbacks.onSkipBack) {
        this.callbacks.onSkipBack();
      }
    } else if (zone === 'right') {
      // Skip forward
      this.showFeedback('forward');
      if (this.callbacks.onSkipForward) {
        this.callbacks.onSkipForward();
      }
    } else if (zone === 'center') {
      // Double tap center also plays/pauses
      if (this.callbacks.onPlayPause) {
        this.callbacks.onPlayPause();
      }
    }
  }

  /**
   * Show visual feedback for an action
   * @param {'play'|'pause'|'back'|'forward'} action
   */
  showFeedback(action) {
    let element;

    switch (action) {
      case 'play':
        element = this.feedbackElements.playPause;
        break;
      case 'pause':
        element = this.feedbackElements.playPause;
        break;
      case 'back':
        element = this.feedbackElements.backArrows;
        break;
      case 'forward':
        element = this.feedbackElements.forwardArrows;
        break;
      default:
        return;
    }

    if (!element) return;

    // Update icon content with SVG element
    const iconContainer = element.querySelector('.feedback-icon');
    if (iconContainer) {
      // Clear existing content
      iconContainer.innerHTML = '';

      // Get and append new icon
      const iconElement = this.getIconElement(action);
      if (iconElement) {
        iconContainer.appendChild(iconElement);
      }
    }

    // Clear any existing animation
    element.classList.remove('tap-feedback-show');
    void element.offsetWidth; // Force reflow to restart animation

    // Show feedback with animation
    element.classList.add('tap-feedback-show');

    // Clear existing timeout for this element
    this.clearAnimationTimeout(element);

    // Hide after animation completes
    const timeout = setTimeout(() => {
      element.classList.remove('tap-feedback-show');
    }, 1400); // 600ms fade in/stay + 800ms fade out

    this.animationTimeouts.push({ element, timeout });
  }

  /**
   * Clear animation timeout for a specific element
   * @param {HTMLElement} element
   */
  clearAnimationTimeout(element) {
    const index = this.animationTimeouts.findIndex(item => item.element === element);
    if (index !== -1) {
      clearTimeout(this.animationTimeouts[index].timeout);
      this.animationTimeouts.splice(index, 1);
    }
  }

  /**
   * Update play/pause feedback when state changes externally
   * @param {boolean} isPlaying
   */
  updatePlayPauseState(isPlaying) {
    this.showFeedback(isPlaying ? 'play' : 'pause');
  }

  /**
   * Clean up event listeners and elements
   */
  destroy() {
    if (this.targetElement) {
      this.targetElement.removeEventListener('touchend', this.handleTap);
      this.targetElement.removeEventListener('click', this.handleTap);
    }

    // Clear all animation timeouts
    this.animationTimeouts.forEach(({ timeout }) => clearTimeout(timeout));
    this.animationTimeouts = [];

    // Remove feedback elements
    Object.values(this.feedbackElements).forEach(element => {
      if (element && element.parentNode) {
        element.parentNode.removeChild(element);
      }
    });

    this.feedbackElements = {};
  }
}

export default TapControls;
