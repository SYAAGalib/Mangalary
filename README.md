# Manga Library Reader

A lightweight, browser-based library for vertically long manga images. Point it at a folder of series, browse with rich thumbnails, and jump into a smooth infinite-scroll reader—no backend required.

## Features

- **Library-level folder selection** using the browser’s File System Access API (Chromium-based browsers).
- **Persistent library**: the chosen root folder is remembered between sessions until you pick a different one.
- **Gallery view** with adaptive cards, page counts, and hover slideshows cycling through the first five images.
- **Instant reader** that stacks pages edge to edge with a zoom slider (60% – 150%).
- **Lazy loading** keeps long chapters responsive and memory-friendly.

## Quick Start

1. Download or clone this folder to your machine.
2. Open `index.html` directly in a modern Chromium browser (Chrome, Edge, Brave, Vivaldi, Arc).
3. Click the ⚙️ **Settings** icon and choose your “mother” folder (the one that contains all of your manga folders).
4. Browse the gallery; hover any series to preview its first pages and click to read.
5. Scroll vertically to read; drag the **Zoom** slider to resize the pages. Hit **Back to Library** to pick another series.

> **Note:** The File System Access API is currently supported in Chromium-based browsers (Chrome, Edge, Brave, Vivaldi, Arc…). Firefox and Safari do not yet support persistent directory handles.

### Fallback mode (non-Chromium or insecure contexts)

- The app automatically falls back to the legacy folder chooser when the File System Access API is unavailable (for example, when running over `file://` or in Firefox).
- In fallback mode you can still point the app at your library via the ⚙️ **Settings** icon; the browser will prompt you to pick a folder and the reader will build the gallery from those files.
- Persistent library storage is disabled in this mode—pick your library each time you open the app.
- For smoother access (no repeated prompts) run a tiny local server and open the app via `http://localhost`. See the optional server tip below.

## Optional: Serve Locally

You can also serve the project from a lightweight HTTP server (useful if your browser blocks local file access).

```fish
python -m http.server 8080
```

Then visit [http://localhost:8080](http://localhost:8080) and open `index.html` from there.

## Supported Image Formats

JPEG, PNG, GIF, WebP, AVIF, BMP, SVG. Files are sorted alphabetically with numeric awareness (`page-9` comes before `page-10`). Nested folders inside a series are supported.

## Future Ideas

- Keyboard shortcuts for zooming and quick navigation.
- Remembering per-series zoom preferences.
- Optional two-page (spread) mode for landscape chapters.
