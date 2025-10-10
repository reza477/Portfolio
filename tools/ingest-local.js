#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const SUPPORTED_TYPES = new Set(["art", "photo", "track", "game", "app"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"]);

const TYPE_META = {
  art: {
    dest: "assets/images/art",
    section: ["art", "works"],
    defaultTags: ["art"],
    kind: "image"
  },
  photo: {
    dest: "assets/images/photography",
    section: ["photography", "photos"],
    defaultTags: ["photography"],
    kind: "image"
  },
  track: {
    dest: "assets/music",
    section: ["musician", "tracks"],
    defaultTags: null,
    kind: "audio"
  },
  game: {
    dest: "assets/images/games",
    section: ["games", "projects"],
    defaultTags: ["game"],
    kind: "image"
  },
  app: {
    dest: "assets/images/apps",
    section: ["apps", "projects"],
    defaultTags: ["app"],
    kind: "image"
  }
};

const rootDir = path.resolve(__dirname, "..");
const contentPath = path.join(rootDir, "content", "content.json");
const validateScript = path.join(__dirname, "validate-content.js");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }
    const segment = token.slice(2);
    if (segment.includes("=")) {
      const [key, ...rest] = segment.split("=");
      args[key] = rest.join("=");
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[segment] = true;
    } else {
      args[segment] = next;
      i += 1;
    }
  }
  return args;
}

function gatherFiles(srcPath) {
  const stats = fs.statSync(srcPath);
  if (stats.isFile()) {
    return [srcPath];
  }
  if (stats.isDirectory()) {
    const files = [];
    const stack = [srcPath];
    while (stack.length > 0) {
      const current = stack.pop();
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".")) {
          continue;
        }
        const entryPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(entryPath);
        } else if (entry.isFile()) {
          files.push(entryPath);
        }
      }
    }
    return files.sort();
  }
  throw new Error(`Unsupported source path: ${srcPath}`);
}

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "asset";
}

function toTitle(slug) {
  return slug
    .split("-")
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
    || "Untitled";
}

function ensureUniqueFilename(dir, base, ext, planned) {
  const taken = planned.get(dir) || new Set();
  let counter = 0;
  let candidate;
  do {
    candidate = counter === 0 ? `${base}${ext}` : `${base}-${counter}${ext}`;
    counter += 1;
  } while (taken.has(candidate) || fs.existsSync(path.join(dir, candidate)));
  taken.add(candidate);
  planned.set(dir, taken);
  return candidate;
}

function posixRelative(filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join("/");
}

function ensureArray(container, key) {
  if (!Array.isArray(container[key])) {
    container[key] = [];
  }
  return container[key];
}

function splitTags(tagString) {
  if (!tagString) {
    return [];
  }
  return tagString
    .split(",")
    .map(tag => tag.trim())
    .filter(Boolean);
}

function buildEntry(type, { relPath, title, year, tags, summary }) {
  const typedTags = tags && tags.length > 0 ? tags : TYPE_META[type].defaultTags || [];
  switch (type) {
    case "art":
      return {
        title,
        src: relPath,
        year,
        tags: typedTags.length > 0 ? typedTags : ["art"]
      };
    case "photo":
      return {
        title,
        src: relPath,
        year,
        tags: typedTags.length > 0 ? typedTags : ["photography"]
      };
    case "track":
      return {
        title,
        year,
        file: relPath,
        links: [
          {
            label: "Listen",
            url: "#"
          }
        ]
      };
    case "game":
      return {
        title,
        year,
        tags: typedTags.length > 0 ? typedTags : ["game"],
        links: [
          {
            label: "More Info",
            url: "#"
          }
        ],
        thumb: relPath,
        summary: summary || "(fill me)"
      };
    case "app":
      return {
        title,
        year,
        tags: typedTags.length > 0 ? typedTags : ["app"],
        links: [
          {
            label: "More Info",
            url: "#"
          }
        ],
        thumb: relPath,
        summary: summary || "(fill me)"
      };
    default:
      throw new Error(`Unsupported type: ${type}`);
  }
}

function runValidation() {
  const result = spawnSync(process.execPath, [validateScript], {
    cwd: rootDir,
    stdio: "inherit"
  });
  return result.status === 0;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rawType = args.type || "";
  const type = rawType.toLowerCase();
  const src = args.src ? path.resolve(process.cwd(), args.src) : null;
  const apply =
    Object.prototype.hasOwnProperty.call(args, "apply") &&
    (args.apply === true ||
      args.apply === "" ||
      String(args.apply).toLowerCase() === "true" ||
      String(args.apply).toLowerCase() === "1" ||
      String(args.apply).toLowerCase() === "yes");
  const defaultYear = args.year ? Number.parseInt(args.year, 10) : new Date().getFullYear();
  if (Number.isNaN(defaultYear)) {
    throw new Error(`Invalid --year value: ${args.year}`);
  }
  const tagsOverride = splitTags(args.tags);
  const summaryOverride = args.summary;
  const manualTitle = args.title;

  if (!SUPPORTED_TYPES.has(type)) {
    throw new Error(`--type must be one of: ${Array.from(SUPPORTED_TYPES).join(", ")}`);
  }
  if (!src) {
    throw new Error("--src is required");
  }
  if (!fs.existsSync(src)) {
    throw new Error(`Source path does not exist: ${src}`);
  }

  const meta = TYPE_META[type];
  const files = gatherFiles(src);
  if (files.length === 0) {
    throw new Error("No files found at source path.");
  }

  const planned = new Map();
  const proposals = [];
  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();
    if (meta.kind === "image" && !IMAGE_EXTENSIONS.has(ext)) {
      console.warn(`Skipping non-image file for type "${type}": ${filePath}`);
      continue;
    }
    if (meta.kind === "audio" && !AUDIO_EXTENSIONS.has(ext)) {
      console.warn(`Skipping non-audio file for type "${type}": ${filePath}`);
      continue;
    }

    const basename = path.basename(filePath, ext);
    const slug = slugify(basename);
    const title = manualTitle && files.length === 1 ? manualTitle : toTitle(slug);
    const destDirAbs = path.join(rootDir, meta.dest);
    const destFileName = ensureUniqueFilename(destDirAbs, slug, ext, planned);
    const destAbs = path.join(destDirAbs, destFileName);
    const relPath = posixRelative(destAbs);
    const entry = buildEntry(type, {
      relPath,
      title,
      year: defaultYear,
      tags: tagsOverride,
      summary: summaryOverride
    });

    proposals.push({
      srcAbs: filePath,
      destAbs,
      destRel: relPath,
      entry,
      title
    });
  }

  if (proposals.length === 0) {
    throw new Error("No valid files to ingest after filtering.");
  }

  console.log(`Planned ingest for type "${type}":`);
  for (const proposal of proposals) {
    console.log(` - ${path.basename(proposal.srcAbs)} -> ${proposal.destRel}`);
  }
  console.log("\nProposed entries:");
  console.log(JSON.stringify(proposals.map(p => p.entry), null, 2));

  if (!apply) {
    console.log("\nRun again with --apply to move files and update content.");
    process.exit(0);
  }

  const originalContent = fs.readFileSync(contentPath, "utf8");
  const moved = [];
  try {
    for (const proposal of proposals) {
      fs.mkdirSync(path.dirname(proposal.destAbs), { recursive: true });
      fs.renameSync(proposal.srcAbs, proposal.destAbs);
      moved.push(proposal);
    }

    const content = JSON.parse(originalContent);
    const [sectionKey, arrayKey] = meta.section;
    if (!content[sectionKey]) {
      content[sectionKey] = {};
    }
    const targetCollection = ensureArray(content[sectionKey], arrayKey);
    for (const proposal of proposals.slice().reverse()) {
      targetCollection.unshift(proposal.entry);
    }
    fs.writeFileSync(contentPath, `${JSON.stringify(content, null, 2)}\n`, "utf8");

    if (!runValidation()) {
      throw new Error("Content validation failed.");
    }

    console.log(`\nIngested ${proposals.length} file(s) into ${sectionKey}.${arrayKey}.`);
  } catch (error) {
    for (const proposal of moved.reverse()) {
      try {
        if (fs.existsSync(proposal.destAbs)) {
          fs.mkdirSync(path.dirname(proposal.srcAbs), { recursive: true });
          fs.renameSync(proposal.destAbs, proposal.srcAbs);
        }
      } catch (revertErr) {
        console.error(`Failed to revert file ${proposal.destAbs}: ${revertErr.message}`);
      }
    }
    try {
      fs.writeFileSync(contentPath, originalContent, "utf8");
    } catch (restoreErr) {
      console.error(`Failed to restore original content.json: ${restoreErr.message}`);
    }
    throw error;
  }
}

try {
  main();
} catch (error) {
  console.error(`ingest-local failed: ${error.message}`);
  process.exit(1);
}
