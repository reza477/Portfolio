#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

if (typeof fetch !== "function") {
  console.error("Global fetch is unavailable. Node 18+ is required to run link checks.");
  process.exit(1);
}

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

function collectReferences(node, breadcrumb = [], refs = { local: new Map(), drive: new Map() }) {
  if (Array.isArray(node)) {
    node.forEach((item, index) => collectReferences(item, breadcrumb.concat(index), refs));
    return refs;
  }

  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      const currentPath = breadcrumb.concat(key);
      if (typeof value === "string") {
        const location = formatPath(currentPath);
        if (key === "driveId" && value.trim()) {
          const trimmed = value.trim();
          if (!refs.drive.has(trimmed)) {
            refs.drive.set(trimmed, []);
          }
          refs.drive.get(trimmed).push(location);
        }
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

async function checkDriveIds(driveMap) {
  const results = [];
  for (const [driveId, locations] of driveMap.entries()) {
    const url = `https://drive.google.com/file/d/${driveId}/preview`;
    try {
      const response = await fetch(url, { method: "HEAD", redirect: "follow" });
      results.push({ driveId, locations, ok: response.ok, status: response.status });
      if (!response.ok) {
        console.warn(`Drive preview returned ${response.status} for ${driveId} (${locations.join(", ")})`);
      }
    } catch (error) {
      console.warn(`Skipping remaining Drive checks due to network error: ${error.message}`);
      return { results, skipped: true };
    }
  }
  return { results, skipped: false };
}

async function main() {
  const content = loadJson(contentPath);
  const { local, drive } = collectReferences(content);

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

  let driveSummary = null;
  if (drive.size > 0) {
    driveSummary = await checkDriveIds(drive);
    if (driveSummary.skipped) {
      console.warn("Drive link checks were skipped due to network issues.");
    } else {
      const failing = driveSummary.results.filter(result => !result.ok);
      console.log(`Drive previews checked: ${drive.size} unique (${Array.from(drive.values()).reduce((sum, locs) => sum + locs.length, 0)} references)`);
      if (failing.length > 0) {
        console.warn(`Drive previews with non-OK status (${failing.length}):`);
        for (const result of failing) {
          console.warn(` - ${result.driveId} [status ${result.status}] ← ${result.locations.join(", ")}`);
        }
      } else {
        console.log("All Drive previews responded with OK status.");
      }
    }
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
