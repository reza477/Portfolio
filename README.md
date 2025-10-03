# Portfolio

Modern, responsive portfolio site. Content-driven via `content/content.json`.

## Quick Start
- Open `index.html` in a browser (no build step required).
- Or run `npm start` to serve locally on http://localhost:5505
- Edit `content/content.json` to update all sections.
- Drop media into `assets/…` folders (MP3s in `assets/music/`, images in relevant folders).

## Features
- Dark/Light toggle persisted to `localStorage`.
- Global search filters cards by titles/tags across sections.
- Per-section tag chips with a clear-filter chip.
- Lightbox for Art & Photography, keyboard-friendly (Esc, ←/→).
- Details modal for Games & Apps projects with action links.
- Accessible structure, lazy-loaded images, semantic HTML.

## Customize
- Replace `YOUR NAME` in `content/content.json`.
- Accent color: edit `--accent` in `styles.css`.
- Open Graph image: update `assets/images/og/og.svg`.

## Using Google Drive
- Set your Drive files to “Anyone with the link” (view access) so previews load.
- In `content/content.json`, you can provide a `driveId` in place of a local file:
  - Art & Photography items: `{ "title": "…", "driveId": "FILE_ID", "year": 2024, "tags": [ … ] }`
  - Musician tracks: use `driveId` instead of `file` to show an “Open in Drive” button (no custom audio player for Drive items).
  - Games/Apps projects: `{ "embed": { "type": "gdrive", "id": "FILE_ID" } }` to preview in the details modal.
- Why preview iframes? Using Drive’s preview (`https://drive.google.com/file/d/ID/preview`) is the most reliable, cross‑origin‑friendly way to display Drive media without exposing raw download endpoints.
