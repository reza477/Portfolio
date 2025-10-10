#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const sharp = require("sharp");

const WIDTHS = [480, 960, 1440];
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);
const SOURCE_DIRS = ["art", "photography"];

const rootDir = path.resolve(__dirname, "..");
const imagesDir = path.join(rootDir, "assets", "images");
const generatedDir = path.join(imagesDir, "_generated");
const manifestPath = path.join(generatedDir, "manifest.json");
const contentPath = path.join(rootDir, "content", "content.json");
const validateScript = path.join(__dirname, "validate-content.js");

function toPosix(value) {
  return value.split(path.sep).join("/");
}

async function ensureDir(dirPath) {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

async function walkImages(dirPath) {
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkImages(fullPath));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (IMAGE_EXTENSIONS.has(ext)) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

async function collectOriginals() {
  const files = [];
  for (const dir of SOURCE_DIRS) {
    const absolute = path.join(imagesDir, dir);
    if (!fs.existsSync(absolute)) continue;
    const discovered = await walkImages(absolute);
    files.push(...discovered);
  }
  return files.sort();
}

async function generateSizes(originalPath) {
  const relativeFromRoot = toPosix(path.relative(rootDir, originalPath));
  const relativeFromImages = toPosix(path.relative(imagesDir, originalPath));
  const parsed = path.parse(relativeFromImages);
  const destDir = path.join(generatedDir, parsed.dir);
  await ensureDir(destDir);

  let metadata = {};
  try {
    metadata = await sharp(originalPath).metadata();
  } catch (error) {
    console.warn(`Failed to read metadata for ${relativeFromRoot}: ${error.message}`);
  }

  const maxWidth = metadata.width || Number.MAX_SAFE_INTEGER;
  const srcsetEntries = [];

  for (const width of WIDTHS) {
    if (width > maxWidth) continue;

    const fileName = `${parsed.name}-${width}w${parsed.ext}`;
    const destPath = path.join(destDir, fileName);
    try {
      await sharp(originalPath)
        .resize({ width, withoutEnlargement: true })
        .toFile(destPath);
      const destRel = toPosix(path.relative(rootDir, destPath));
      srcsetEntries.push({ w: width, src: destRel });
    } catch (error) {
      console.warn(`Failed to generate ${width}w for ${relativeFromRoot}: ${error.message}`);
    }
  }

  return { key: relativeFromRoot, srcset: srcsetEntries };
}

async function updateContent(manifest) {
  if (!fs.existsSync(contentPath)) return false;
  const raw = await fs.promises.readFile(contentPath, "utf8");
  const data = JSON.parse(raw);
  let changed = false;

  const applySrcset = (items = []) => {
    items.forEach(item => {
      if (!item || typeof item !== "object" || !item.src) return;
      const key = item.src;
      const generated = manifest[key];
      if (!generated || generated.length === 0) return;
      const current = Array.isArray(item.srcset) ? item.srcset : [];
      const sameLength = current.length === generated.length;
      const sameEntries = sameLength && current.every((entry, idx) => entry.w === generated[idx].w && entry.src === generated[idx].src);
      if (!sameEntries) {
        item.srcset = generated;
        changed = true;
      }
    });
  };

  if (data.art && Array.isArray(data.art.works)) {
    applySrcset(data.art.works);
  }
  if (data.photography && Array.isArray(data.photography.photos)) {
    applySrcset(data.photography.photos);
  }

  if (changed) {
    await fs.promises.writeFile(contentPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }
  return changed;
}

function runValidation() {
  const result = spawnSync(process.execPath, [validateScript], {
    cwd: rootDir,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    throw new Error("Content validation failed after srcset update.");
  }
}

async function main() {
  await ensureDir(generatedDir);
  const originals = await collectOriginals();
  if (originals.length === 0) {
    console.log("No source images found in art or photography directories.");
    return;
  }

  console.log(`Processing ${originals.length} image(s)...`);
  const manifest = {};

  for (const original of originals) {
    const { key, srcset } = await generateSizes(original);
    if (srcset.length > 0) {
      manifest[key] = srcset;
    }
  }

  await fs.promises.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Manifest written to ${toPosix(path.relative(rootDir, manifestPath))}`);

  const updated = await updateContent(manifest);
  if (updated) {
    runValidation();
    console.log("content/content.json updated with srcset data.");
  } else {
    console.log("content/content.json already up to date.");
  }
}

main().catch(error => {
  console.error(`make-srcset failed: ${error.message}`);
  process.exit(1);
});
