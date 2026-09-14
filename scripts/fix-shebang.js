#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Windows has no shebang/executable-bit concept; dist/check.js is always
// invoked as `node dist/check.js` there, so there's nothing to patch.
if (process.platform === "win32") {
    process.exit(0);
}

const distDir = path.join(__dirname, "..", "dist");
const targetFile = path.join(distDir, "check.js");

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
