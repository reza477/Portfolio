# Reza Rahnama — Portfolio

Static, JSON‑driven portfolio website. No frameworks; just accessible HTML, CSS, and vanilla JS. All real content lives in `content/content.json` and renders at runtime.

## Live
- URL: https://your-netlify-site.netlify.app

## What’s Inside
- JSON‑driven sections: Musician, Writer, Game Design Analysis, Art, Video Games, Street Photography, Vibe Coding Apps, Contact.
- Global search, per‑section filters, image lightbox, project details modal, and a custom audio player for local MP3s.
- Theme toggle with `localStorage` persistence and sensible defaults (system preference).

## Project Structure
```
portfolio/
├─ index.html           # Shell; sections rendered by JS
├─ styles.css           # Theme, layout, components
├─ main.js              # Rendering, search, filters, modals, player
├─ content/
│  └─ content.json      # All content (edit me)
├─ assets/
│  ├─ images/
│  │  ├─ art/
│  │  ├─ photography/
│  │  ├─ games/
│  │  ├─ apps/
│  │  └─ og/og.svg      # Open Graph placeholder
│  └─ music/
├─ admin.html           # Local‑only helper UI (uploads, embeds)
├─ admin.js
├─ admin.css
├─ netlify.toml         # Headers + caching (used if base=portfolio)
├─ sitemap.xml          # Simple sitemap
├─ robots.txt
└─ package.json         # `npm start` for local preview
```

## Run Locally
- Open `index.html` directly in a browser, or start a tiny server:
```
cd portfolio
npm start
# → http://localhost:5505
```

## Validate Content
- Run `npm run validate` to ensure `content/content.json` matches `schema/content.schema.json` (automatically runs before pushes).

## Asset Tools
- Run `npm run images:build` to generate responsive variants (`assets/images/_generated/manifest.json`) and inject `srcset` data; this script relies on the native `sharp` dependency installed via `npm install`.

## Deploy
Netlify (recommended)
- Connect your repo, set:
  - Build command: `(none)`
  - Base directory: `portfolio`
  - Publish directory: `.` (relative to base)
- `netlify.toml` in `portfolio/` sets safe headers and long‑cache for assets.

GitHub Pages (multi‑project repo)
- Option A (docs folder): copy `portfolio/` into `docs/` and enable Pages → Source: `main` → `/docs`.
- Option B (Actions): use Pages actions to publish the `portfolio` subfolder. Example workflow:
```yaml
name: Deploy Pages (portfolio)
on: { push: { branches: [ main ] } }
permissions: { pages: write, id-token: write }
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/upload-pages-artifact@v3
        with: { path: portfolio }
      - uses: actions/deploy-pages@v4
```

## Add Content
Edit `content/content.json`. Shapes (snippets):

- Site
```json
{ "site": { "name": "Reza Rahnama", "tagline": "Musician • Writer • Game Design • Art • Photography • Vibe Coding" } }
```

- Musician (local file)
```json
{ "musician": { "bio": "…", "tracks": [
  { "title": "Track One", "file": "assets/music/track-one.mp3", "year": 2024,
    "links": [ { "label": "Bandcamp", "url": "#" } ] }
] } }
```

- Musician (Google Drive)
```json
{ "musician": { "tracks": [ { "title": "…", "driveId": "FILE_ID", "year": 2024 } ] } }
```

- Art/Photography (local image or Drive)
```json
{ "art": { "works": [ { "title": "Blue Wash", "src": "assets/images/art/blue-wash.jpg", "year": 2023, "tags": ["watercolor"] } ] } }
{ "photography": { "photos": [ { "title": "Alley Light", "driveId": "FILE_ID", "year": 2022, "tags": ["street","bw"] } ] } }
```

- Games/Apps project with embeds
```json
{ "games": { "projects": [
  { "title": "Sky Runner", "thumb": "assets/images/games/skyrunner.jpg", "year": 2023,
    "tags": ["unity","pc"],
    "embed": { "type": "youtube", "id": "VIDEO_ID" },
    "links": [ { "label": "Itch.io", "url": "#" } ],
    "summary": "Arcade runner with procedural levels." }
] } }
```

- Google Drive embed for projects
```json
{ "apps": { "projects": [ { "title": "…", "embed": { "type": "gdrive", "id": "FILE_ID" } } ] } }
```

Google Drive notes
- Set files to “Anyone with the link (Viewer)”.
- For thumbnails, `driveId` is rendered via Drive’s image endpoint; projects/readers use Drive’s preview iframe.

## Accessibility
- Keyboard: visible focus rings, ESC to close modals, ←/→ to navigate lightbox/reader, space/←/→ for audio controls.
- ARIA: labelled nav/search/buttons; modal dialogs use `aria-hidden` and focus management.
- Motion: honors `prefers-reduced-motion`; reveal animations disable accordingly.

## Security
- Admin is local‑only: `admin.html` disables controls unless `hostname` is `localhost` or `127.0.0.1`.
- Content is static; no write APIs on production. For future publishing, prefer serverless functions with auth (e.g., Netlify Functions + GitHub content PRs).

## License & Credits
- License: MIT — do what you like; attribution appreciated.
- Credits: Vanilla HTML/CSS/JS. Optional admin uploads use Cloudinary’s Upload Widget.
