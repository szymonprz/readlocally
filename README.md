# ReadLocally

A browser-based EPUB reader using Rapid Serial Visual Presentation (RSVP) for speed reading. Works entirely offline - your files never leave your device.

## Features

- **RSVP Speed Reading** - Words displayed one at a time at your chosen speed (300-1000+ WPM)
- **Optimal Recognition Point (ORP)** - Highlighted letter positioning for faster word recognition
- **Offline First** - All processing happens locally in your browser
- **Progress Saving** - Automatically saves your reading position
- **Mobile Support** - Touch-friendly controls with auto-hiding toolbar
- **Screen Wake Lock** - Prevents screen from dimming during reading

## Controls

### Desktop (Keyboard)
| Key | Action |
|-----|--------|
| Space | Play/Pause |
| ↑/↓ | Adjust speed (±25 WPM) |
| 1-5 | Set chunk size (words per display) |
| +/- | Adjust font size |
| F | Cycle reading font |
| J/K | Step backward/forward (when paused) |
| Esc | Return to menu |

### Mobile (Touch)
- Tap anywhere to show/hide controls
- Bottom toolbar with play/pause, speed, and settings

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Deploy to GitHub Pages
npm run deploy
```

## Tech Stack

- Vanilla JavaScript (ES6 modules)
- Vite for bundling
- JSZip for EPUB parsing
- Pure CSS with custom properties

## License

MIT
