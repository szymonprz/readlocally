/**
 * Theme Service
 * Manages theme presets and CSS custom property application
 */

export const THEMES = {
  dark: {
    '--bg-color': '#1a1a2e',
    '--text-color': '#eaeaea',
    '--orp-color': '#e94560',
    '--accent-color': '#e94560',
    '--surface-color': '#16213e',
    '--border-color': '#0f3460',
    '--muted-color': '#666',
  },
  light: {
    '--bg-color': '#f5f5f5',
    '--text-color': '#1a1a1a',
    '--orp-color': '#d32f2f',
    '--accent-color': '#d32f2f',
    '--surface-color': '#ffffff',
    '--border-color': '#dddddd',
    '--muted-color': '#888',
  },
  sepia: {
    '--bg-color': '#f4ecd8',
    '--text-color': '#5c4b37',
    '--orp-color': '#8b4513',
    '--accent-color': '#8b4513',
    '--surface-color': '#faf6eb',
    '--border-color': '#d4c5a9',
    '--muted-color': '#8b7355',
  },
};

/**
 * Get list of available theme IDs
 * @returns {string[]} Array of theme IDs
 */
export function getThemeIds() {
  return Object.keys(THEMES);
}

/**
 * Get the next theme ID in the cycle
 * @param {string} currentThemeId - Current theme ID
 * @returns {string} Next theme ID
 */
export function getNextThemeId(currentThemeId) {
  const themeIds = getThemeIds();
  const currentIndex = themeIds.indexOf(currentThemeId);
  const nextIndex = (currentIndex + 1) % themeIds.length;
  return themeIds[nextIndex];
}

/**
 * Apply a theme by setting CSS custom properties on :root
 * @param {string} themeId - The theme ID to apply
 * @returns {boolean} True if theme was applied successfully
 */
export function applyTheme(themeId) {
  const theme = THEMES[themeId];
  if (!theme) {
    console.warn(`Theme "${themeId}" not found`);
    return false;
  }

  Object.entries(theme).forEach(([property, value]) => {
    document.documentElement.style.setProperty(property, value);
  });

  return true;
}

/**
 * Get human-readable theme name
 * @param {string} themeId - Theme ID
 * @returns {string} Display name
 */
export function getThemeName(themeId) {
  const names = {
    dark: 'Dark',
    light: 'Light',
    sepia: 'Sepia',
  };
  return names[themeId] || themeId;
}
