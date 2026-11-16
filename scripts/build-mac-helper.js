#!/usr/bin/env node

// Builds the macOS Swift helpers into dist/ (mic-active, calendar-events, launcher); no-op elsewhere.
// A missing helper just disables the matching check, so a failed build isn't fatal.
if (process.platform !== "darwin") process.exit(0);

const { execFileSync } = require("child_process");
const path = require("path");

const fs = require("fs");
const os = require("os");

// Each helper is a compiled binary so macOS attributes permission prompts to a stable
// identity. The calendar helper embeds an Info.plist carrying the usage description
// macOS requires before it will show the Calendar access prompt.
const dist = path.join(__dirname, "..", "dist");
const CALENDAR_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.mbanerjeepalmer.wgd.calendar-events</string>
<key>NSCalendarsFullAccessUsageDescription</key><string>Skips the "what did you get done" prompt while you are in a meeting.</string>
<key>NSCalendarsUsageDescription</key><string>Skips the "what did you get done" prompt while you are in a meeting.</string>
</dict></plist>
`;

const CALENDAR_LINK = ["-Xlinker", "-sectcreate", "-Xlinker", "__TEXT", "-Xlinker", "__info_plist"];

const build = (name, extraArgs = []) => {
    try {
        execFileSync(
            "swiftc",
            ["-O", path.join(__dirname, `${name}.swift`), "-o", path.join(dist, name), ...extraArgs],
            { stdio: "inherit" },
        );
        console.log(`Built dist/${name}`);
    } catch {
        console.warn(`Could not build dist/${name} (swiftc missing?); the matching check will be disabled.`);
    }
};

build("mic-active");
const plistPath = path.join(os.tmpdir(), "wgd-calendar-events.plist");
fs.writeFileSync(plistPath, CALENDAR_PLIST);
build("calendar-events", [...CALENDAR_LINK, "-Xlinker", plistPath]);
build("launcher", [...CALENDAR_LINK, "-Xlinker", plistPath]); // the launchd entry point; see launcher.swift
fs.rmSync(plistPath, { force: true });
