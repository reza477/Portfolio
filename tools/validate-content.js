#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const Ajv = require("ajv/dist/2020");

const rootDir = path.resolve(__dirname, "..");
const schemaPath = path.join(rootDir, "schema", "content.schema.json");
const contentPath = path.join(rootDir, "content", "content.json");

function loadJsonFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Failed to read ${path.relative(rootDir, filePath)}: ${error.message}`);
    process.exit(1);
  }
}

const ajv = new Ajv({ allErrors: true, strict: false });
const schema = loadJsonFile(schemaPath);
const validate = ajv.compile(schema);
const data = loadJsonFile(contentPath);

const isValid = validate(data);

if (!isValid) {
  console.error("Content validation failed:\n");
  for (const err of validate.errors || []) {
    const instancePath = err.instancePath || "(root)";
    const message = err.message || "Validation error";
    const details = err.params && Object.keys(err.params).length ? ` (${JSON.stringify(err.params)})` : "";
    console.error(`- ${instancePath}: ${message}${details}`);
  }
  process.exit(1);
}

console.log("Content validation passed.");
