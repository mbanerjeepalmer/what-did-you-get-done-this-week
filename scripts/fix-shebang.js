#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const distDir = path.join(__dirname, "..", "dist");
const targetFile = path.join(distDir, "what.js");

const nodePath = execSync("which node").toString().trim();

let content = fs.readFileSync(targetFile, "utf-8");

// Replace or prepend shebang
if (content.startsWith("#!")) {
    content = content.replace(/^#!.*\n/, `#!${nodePath}\n`);
} else {
    content = `#!${nodePath}\n${content}`;
}

fs.writeFileSync(targetFile, content);
fs.chmodSync(targetFile, "755");

console.log(`✅ Shebang updated to ${nodePath}`);
