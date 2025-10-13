#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const contentPath = path.join(rootDir, "content", "content.json");

function loadJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Failed to read ${path.relative(rootDir, filePath)}: ${error.message}`);
    process.exit(1);
  }
}

function formatPath(parts) {
  return parts.reduce((acc, part) => {
    if (typeof part === "number") {
      return `${acc}[${part}]`;
    }
    return acc ? `${acc}.${part}` : String(part);
  }, "");
}

function collectReferences(node, breadcrumb = [], refs = { local: new Map() }) {
  if (Array.isArray(node)) {
    node.forEach((item, index) => collectReferences(item, breadcrumb.concat(index), refs));
    return refs;
  }

  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      const currentPath = breadcrumb.concat(key);
      if (typeof value === "string") {
        const location = formatPath(currentPath);
        if (value.startsWith("assets/")) {
          if (!refs.local.has(value)) {
            refs.local.set(value, []);
          }
          refs.local.get(value).push(location);
        }
      } else if (value !== null && typeof value === "object") {
        collectReferences(value, currentPath, refs);
      }
    }
  }

  return refs;
}

async function main() {
  const content = loadJson(contentPath);
  const { local } = collectReferences(content);

  const missingLocal = [];
  for (const [assetPath, locations] of local.entries()) {
    const absolutePath = path.resolve(rootDir, assetPath);
    if (!fs.existsSync(absolutePath)) {
      missingLocal.push({ assetPath, locations });
    }
  }

  const totalLocalRefs = Array.from(local.values()).reduce((sum, locs) => sum + locs.length, 0);
  console.log(`Local asset references: ${totalLocalRefs} (${local.size} unique)`);
  if (missingLocal.length > 0) {
    console.error(`Missing local assets (${missingLocal.length}):`);
    for (const missing of missingLocal) {
      console.error(` - ${missing.assetPath} ← ${missing.locations.join(", ")}`);
    }
  } else {
   console.log("All referenced local assets are present.");
  }

  if (missingLocal.length > 0) {
    process.exit(1);
  }

  process.exit(0);
}

main().catch(error => {
  console.error(`check-links failed: ${error.message}`);
  process.exit(1);
});
