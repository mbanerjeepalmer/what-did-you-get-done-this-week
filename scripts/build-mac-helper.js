#!/usr/bin/env node

// Builds dist/mic-active (CoreAudio mic-in-use probe) on macOS; no-op elsewhere.
// A missing helper just disables the mic check, so a failed build isn't fatal.
if (process.platform !== "darwin") process.exit(0);

const { execFileSync } = require("child_process");
const path = require("path");

try {
    execFileSync(
        "swiftc",
        ["-O", path.join(__dirname, "mic-active.swift"), "-o", path.join(__dirname, "..", "dist", "mic-active")],
        { stdio: "inherit" },
    );
    console.log("Built dist/mic-active");
} catch {
    console.warn("Could not build dist/mic-active (swiftc missing?); micCheck will be disabled.");
}
