# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ReadLocally is a browser-based EPUB reader using Rapid Serial Visual Presentation (RSVP) for speed reading. It's a completely offline-first application built with vanilla JavaScript and Vite, where all EPUB processing happens locally in the browser.

## Key Commands

```bash
# Development
npm install          # Install dependencies
npm run dev          # Start Vite dev server at localhost:5173
npm run build        # Build for production (outputs to dist/)
npm run preview      # Preview production build
npm run deploy       # Build and deploy to GitHub Pages
```

## Architecture Overview

### Application Flow

1. **File Loading** → 2. **EPUB Parsing** → 3. **Tokenization** → 4. **RSVP Engine** → 5. **Display**

The app has three main screens managed by `src/main.js`:
- **Landing Screen**: File selection via drag-and-drop or file picker
- **Book Info Screen**: Displays book metadata and resume options
- **Reader Screen**: RSVP word-by-word display with controls

### Core Services (src/services/)

**epub-parser.js**
- Unzips EPUB files using JSZip
- Parses OPF (Open Packaging Format) for metadata, manifest, and spine
- Extracts NCX navigation for chapter structure
- Fallback to spine-based chapters if NCX navigation is insufficient
- Handles cover image extraction as base64 data URLs
- Cleans HTML content (removes scripts, styles, nav, aside elements)

**tokenizer.js**
- Converts chapter text into individual word tokens
- Adds metadata to each token:
  - `chapterIndex`: Which chapter the word belongs to
  - `isChapterStart`: First word of a chapter
  - `chapterTitle`: Title for chapter indicator display
  - `hasSentenceEnd`: Word ends with `.`, `!`, or `?` (used for smart pauses)

**rsvp-engine.js**
- Controls timing and display of words using `requestAnimationFrame`
- Manages WPM (300-1000 range) and chunk size (1-5 words)
- Implements "smart pause" - adds 75ms delay after sentence-ending words
- Provides play/pause/seek controls
- Emits callbacks for word display, state changes, progress, and end-of-book

**orp.js** (Optimal Recognition Point)
- Calculates the optimal character to highlight in each word for faster recognition
- For words ≤1 char: position 0
- For words 2-5 chars: position 1
- For words 6-9 chars: position 2
- For words 10-13 chars: position 3
- For words ≥14 chars: position 4
- Used to split words into `{ before, orp, after }` for display alignment

**storage.js**
- Manages localStorage persistence:
  - Book metadata (title, author, word count, file name/size)
  - Reading position (word index, chapter index)
  - User preferences (WPM, chunk size, theme, font, font size)
- Does NOT store full book content (only metadata)

**file-persistence.js**
- Uses File System Access API when available to maintain access to original EPUB files
- Saves `FileSystemFileHandle` to IndexedDB for resume functionality
- Handles permission prompts for re-accessing files
- Falls back gracefully if API is unavailable

**file-handler.js**
- Unified file input handling for drag-and-drop and file picker
- Validates EPUB file extensions
- Supports multiple drop zones (landing screen and book info screen)

**theme.js**
- Manages three themes: dark, light, sepia
- Applies CSS custom properties to document root
- Persists theme preference

**mobile-controls.js**
- Auto-hiding toolbar for touch devices
- Detects mobile via user agent and touch capability
- Hides toolbar after 2 seconds of inactivity, shows on tap

**wake-lock.js**
- Uses Screen Wake Lock API to prevent screen dimming during reading
- Automatically acquires lock when playing, releases when paused
- Handles visibility changes (re-acquires lock when tab becomes visible)

### State Management

Global state is managed in `src/main.js`:
- `engine`: RSVP engine instance
- `bookData`: Parsed EPUB data (metadata + chapters)
- `tokens`: Flattened array of word tokens from all chapters
- `currentFile` / `currentFileHandle`: File reference for persistence
- `preferences`: User preferences loaded from localStorage
- `isResumingBook`: Flag to prevent position reset when resuming

### Reading Position Persistence

When loading a file:
1. Check if file matches saved book (by name + size)
2. If match: set `isResumingBook = true`, preserve reading position
3. If different: clear old position data, start fresh
4. Position saved periodically (every 5 seconds while playing) and on pause/close

### Chapter Navigation

Chapters are extracted using two methods:
1. **NCX Navigation** (preferred): Uses EPUB's navigation structure with fragment-based extraction
2. **Spine Fallback**: Extracts each spine item as a chapter if NCX is missing/insufficient

Chapter titles come from:
- NCX navigation labels (if using NCX)
- HTML `<h1>`, `<h2>`, `<h3>` elements
- HTML `<title>` tag
- Auto-generated "Part N" if none found

### ORP Display System

The word display uses a two-container CSS flexbox layout (no JavaScript measurement):
- **Left container**: Right-aligned, contains `before + orp` text
- **Right container**: Left-aligned, contains `after` text
- ORP character sits at the focal point where containers meet
- For chunks (multiple words), ORP is disabled and text is centered

### Keyboard Controls

Defined in `handleKeydown()` in `src/main.js`:
- Space: Play/pause
- ↑/↓: Adjust WPM (±25)
- 1-5: Set chunk size
- +/-: Adjust font size (±0.25rem)
- F: Cycle reading font
- T: Cycle theme
- J/K: Step backward/forward (when paused)
- [ / ]: Previous/next chapter
- C: Open chapter list
- Esc: Close chapter list or return to menu

## Important Implementation Details

### Vite Configuration
- Base path is `/readlocally/` for GitHub Pages deployment
- Public assets go in `public/` directory
- Entry point is `index.html` at project root

### Font Loading
Uses self-hosted fonts via Fontsource:
- Literata Variable
- Merriweather (400, 700)
- Source Serif 4 Variable
- Georgia (system fallback)

### Security Considerations
- All file processing happens client-side (nothing uploaded)
- EPUB files are only parsed in the browser via JSZip
- Cover images are converted to base64 data URLs (self-contained)
- No external API calls or tracking

### Mobile-Specific Behavior
- Mobile detection via user agent + touch events
- Auto-hiding toolbar with tap-to-show
- Wake lock prevents screen sleep during reading
- Touch controls mirror keyboard shortcuts

## Common Gotchas

1. **Position Reset Bug**: Always check `isResumingBook` before clearing reading position. The app uses file name + size matching to determine if a book is being resumed.

2. **Chapter Extraction**: NCX-based extraction is complex due to fragment handling. If chapters appear merged or missing, check NCX parsing logic and fragment extraction.

3. **ORP Alignment**: Don't try to center words using JavaScript measurements. The CSS flexbox layout handles alignment automatically via the two-container system.

4. **localStorage Limits**: Book references store metadata only, not full content. Large cover images as base64 can hit storage limits.

5. **File Handle Permissions**: File System Access API requires user permission grants. Handle permission-denied gracefully and prompt user to re-select file.

6. **Theme Application**: Themes use CSS custom properties applied to `:root`. Changes take effect immediately via `applyTheme()`.
