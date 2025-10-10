#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const SUPPORTED_TYPES = ["art", "photo", "track", "game", "app"];
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
    const eqIndex = token.indexOf("=");
    let key;
    let value;
    if (eqIndex !== -1) {
      key = token.slice(2, eqIndex);
      value = token.slice(eqIndex + 1);
    } else {
      key = token.slice(2);
      i += 1;
      if (i >= argv.length) {
        throw new Error(`Missing value for --${key}`);
      }
      value = argv[i];
    }
    args[key] = value;
  }
  return args;
}

function parseDriveId(input) {
  if (!input) {
    throw new Error("Missing Drive identifier");
  }
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/https?:\/\/drive\.google\.com\/[^\s]+/i);
  const source = urlMatch ? urlMatch[0] : trimmed;

  const idPatterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)\//,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /\/open\?id=([a-zA-Z0-9_-]+)/,
    /\/uc\?id=([a-zA-Z0-9_-]+)/,
    /^([a-zA-Z0-9_-]{20,})$/
  ];

  for (const pattern of idPatterns) {
    const match = source.match(pattern);
    if (match) {
      return match[1];
    }
  }

  throw new Error(`Unable to parse Drive ID from value: ${input}`);
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

function viewLinkFor(id) {
  return `https://drive.google.com/file/d/${id}/view`;
}

function buildEntry({ type, title, year, tags, driveId }) {
  const yearNumber = Number.parseInt(year, 10);
  if (Number.isNaN(yearNumber)) {
    throw new Error(`Invalid year value: ${year}`);
  }
  const tagsArray = splitTags(tags);
  const viewLink = viewLinkFor(driveId);

  switch (type) {
    case "art":
      if (tagsArray.length === 0) {
        throw new Error("Art items require at least one tag (--tags=tag1,tag2)");
      }
      return { target: ["art", "works"], entry: { title, driveId, year: yearNumber, tags: tagsArray } };
    case "photo":
      if (tagsArray.length === 0) {
        throw new Error("Photo items require at least one tag (--tags=tag1,tag2)");
      }
      return { target: ["photography", "photos"], entry: { title, driveId, year: yearNumber, tags: tagsArray } };
    case "track":
      return {
        target: ["musician", "tracks"],
        entry: {
          title,
          year: yearNumber,
          driveId,
          links: [
            {
              label: "Drive",
              url: viewLink
            }
          ]
        }
      };
    case "game":
      if (tagsArray.length === 0) {
        throw new Error("Game projects require at least one tag (--tags=tag1,tag2)");
      }
      return {
        target: ["games", "projects"],
        entry: {
          title,
          year: yearNumber,
          tags: tagsArray,
          links: [
            {
              label: "Drive",
              url: viewLink
            }
          ],
          embed: {
            type: "gdrive",
            id: driveId
          },
          summary: "(fill me)"
        }
      };
    case "app":
      if (tagsArray.length === 0) {
        throw new Error("App projects require at least one tag (--tags=tag1,tag2)");
      }
      return {
        target: ["apps", "projects"],
        entry: {
          title,
          year: yearNumber,
          tags: tagsArray,
          links: [
            {
              label: "Drive",
              url: viewLink
            }
          ],
          embed: {
            type: "gdrive",
            id: driveId
          },
          summary: "(fill me)"
        }
      };
    default:
      throw new Error(`Unsupported type: ${type}`);
  }
}

function loadContent() {
  try {
    const raw = fs.readFileSync(contentPath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to read content.json: ${error.message}`);
  }
}

function saveContent(content) {
  fs.writeFileSync(contentPath, `${JSON.stringify(content, null, 2)}\n`, "utf8");
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
  const type = (args.type || "").toLowerCase();
  const title = args.title;
  const year = args.year;
  const driveValue = args.drive || args.id || args.driveId;
  const tags = args.tags;

  if (!SUPPORTED_TYPES.includes(type)) {
    throw new Error(`--type must be one of: ${SUPPORTED_TYPES.join(", ")}`);
  }
  if (!title) {
    throw new Error("--title is required");
  }
  if (!year) {
    throw new Error("--year is required");
  }
  if (!driveValue) {
    throw new Error("--drive is required (accepts Drive URL or ID)");
  }

  const driveId = parseDriveId(driveValue);
  const { target, entry } = buildEntry({ type, title, year, tags, driveId });

  const original = fs.readFileSync(contentPath, "utf8");
  const content = loadContent();

  const [sectionKey, collectionKey] = target;
  if (!content[sectionKey]) {
    content[sectionKey] = {};
  }
  const targetSection = content[sectionKey];
  const collection = ensureArray(targetSection, collectionKey);
  collection.unshift(entry);

  saveContent(content);

  if (!runValidation()) {
    console.error("Validation failed. Reverting content.json.");
    fs.writeFileSync(contentPath, original, "utf8");
    process.exit(1);
  }

  console.log(`Added new ${type} entry "${title}" (Drive ID: ${driveId}).`);
}

try {
  main();
} catch (error) {
  console.error(`drive-import failed: ${error.message}`);
  process.exit(1);
}
