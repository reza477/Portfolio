#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const slugify = require('slugify');

const rootDir = path.resolve(__dirname, '..');
const contentPath = path.join(rootDir, 'content', 'content.json');
const backupPath = path.join(rootDir, 'content', 'content.backup-drive.json');

function loadContent() {
  try {
    const raw = fs.readFileSync(contentPath, 'utf8');
    return { raw, data: JSON.parse(raw) };
  } catch (error) {
    console.error(`Failed to read or parse ${path.relative(rootDir, contentPath)}: ${error.message}`);
    process.exit(1);
  }
}

function saveBackup(raw) {
  try {
    fs.writeFileSync(backupPath, raw, 'utf8');
  } catch (error) {
    console.error(`Failed to write backup ${path.relative(rootDir, backupPath)}: ${error.message}`);
    process.exit(1);
  }
}

function writeContent(data) {
  try {
    fs.writeFileSync(contentPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  } catch (error) {
    console.error(`Failed to write updated content: ${error.message}`);
    process.exit(1);
  }
}

function makeSlug(input, fallback) {
  const primary = slugify(input || '', { lower: true, strict: true });
  if (primary) return primary;
  const fallbackSlug = slugify(fallback || '', { lower: true, strict: true });
  if (fallbackSlug) return fallbackSlug;
  return (fallback || 'item').toLowerCase().replace(/\s+/g, '-');
}

function placeholderUrl(ext, slug) {
  return `CDN://UPLOAD_ME/${slug}.${ext}`;
}

function recordChange(collection, title, summary, changes) {
  summary[collection] = (summary[collection] || 0) + 1;
  changes.push({ section: collection, title });
}

function updateVisualCollection(sectionName, items, summary, changes, fallbackPrefix) {
  if (!Array.isArray(items)) return;
  items.forEach((item, idx) => {
    if (!item || typeof item !== 'object') return;
    if (!item.driveId) return;
    const title = item.title || `${fallbackPrefix}-${idx + 1}`;
    const slug = makeSlug(item.title, `${fallbackPrefix}-${idx + 1}`);
    item.src = placeholderUrl('jpg', slug);
    delete item.driveId;
    recordChange(sectionName, title, summary, changes);
  });
}

function updateTracks(sectionName, tracks, summary, changes) {
  if (!Array.isArray(tracks)) return;
  tracks.forEach((track, idx) => {
    if (!track || typeof track !== 'object') return;
    if (!track.driveId) return;
    const title = track.title || `track-${idx + 1}`;
    const slug = makeSlug(track.title, `track-${idx + 1}`);
    track.file = placeholderUrl('mp3', slug);
    delete track.driveId;
    recordChange(sectionName, title, summary, changes);
  });
}

function updateProjects(sectionName, projects, summary, changes) {
  if (!Array.isArray(projects)) return;
  projects.forEach((project, idx) => {
    if (!project || typeof project !== 'object') return;
    if (!project.embed || project.embed.type !== 'gdrive') return;
    const title = project.title || `project-${idx + 1}`;
    project.embed = { type: 'youtube', id: 'REPLACE_WITH_VIDEO_ID' };
    recordChange(sectionName, title, summary, changes);
  });
}

function main() {
  const summary = { art: 0, photography: 0, musician: 0, games: 0, apps: 0 };
  const changes = [];

  const { raw, data } = loadContent();

  updateVisualCollection('art', data.art?.works, summary, changes, 'art');
  updateVisualCollection('photography', data.photography?.photos, summary, changes, 'photo');
  updateTracks('musician', data.musician?.tracks, summary, changes);
  updateProjects('games', data.games?.projects, summary, changes);
  updateProjects('apps', data.apps?.projects, summary, changes);

  if (changes.length === 0) {
    console.log('No legacy Google Drive fields found. No changes made.');
    return;
  }

  saveBackup(raw);
  writeContent(data);

  console.log(`Backup saved to ${path.relative(rootDir, backupPath)}`);
  console.log('Updated entries:');
  changes.forEach(({ section, title }) => {
    console.log(`- ${section}: ${title}`);
  });
  console.log('Summary:');
  Object.entries(summary)
    .filter(([, count]) => count > 0)
    .forEach(([section, count]) => {
      console.log(`  ${section}: ${count}`);
    });
}

try {
  main();
} catch (error) {
  console.error(`migrate-drive-out failed: ${error.message}`);
  process.exit(1);
}
