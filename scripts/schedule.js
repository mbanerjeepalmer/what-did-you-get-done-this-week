#!/usr/bin/env node

// Installs/removes whatever runs dist/check.js every minute, auto-detecting the platform:
//   macOS         -> a launchd LaunchAgent (cron can't reliably show GUI dialogs there)
//   Linux / WSL   -> a crontab entry (+ the Windows autostart shortcut under WSL)
//
// Usage: node scripts/schedule.js install|uninstall

const { execFileSync, execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const mode = process.argv[2];
if (mode !== "install" && mode !== "uninstall") {
    console.error("Usage: node scripts/schedule.js install|uninstall");
    process.exit(1);
}

const ROOT = path.join(__dirname, "..");
const CHECK_JS = path.join(ROOT, "dist", "check.js");
const LOG = path.join(os.homedir(), ".what-did-you-get-done-this-week.log");

const installMac = () => {
    const label = "com.mbanerjeepalmer.what-did-you-get-done-this-week";
    const plistPath = path.join(os.homedir(), "Library", "LaunchAgents", `${label}.plist`);
    const domain = `gui/${process.getuid()}`;
    const launchctl = (...args) => {
        try {
            execFileSync("launchctl", args, { stdio: "ignore" });
        } catch {
            // not loaded yet / already gone
        }
    };
    launchctl("bootout", `${domain}/${label}`);
    if (mode === "uninstall") {
        fs.rmSync(plistPath, { force: true });
        console.log("Removed launchd agent.");
        return;
    }
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>${label}</string>
    <key>ProgramArguments</key><array><string>${process.execPath}</string><string>${CHECK_JS}</string></array>
    <key>StartInterval</key><integer>60</integer>
    <key>RunAtLoad</key><true/>
    <key>StandardOutPath</key><string>${LOG}</string>
    <key>StandardErrorPath</key><string>${LOG}</string>
</dict>
</plist>
`;
    fs.mkdirSync(path.dirname(plistPath), { recursive: true });
    fs.writeFileSync(plistPath, plist);
    execFileSync("launchctl", ["bootstrap", domain, plistPath]);
    console.log(`Installed launchd agent ${label}.`);
};

const installCron = () => {
    let existing = "";
    try {
        existing = execSync("crontab -l 2>/dev/null").toString();
    } catch {
        // no crontab yet
    }
    const kept = existing.split("\n").filter((line) => line.length > 0 && !line.includes("dist/check.js"));
    if (mode === "install") {
        kept.push(`* * * * * ${process.execPath} ${CHECK_JS} >> ${LOG} 2>&1`);
    }
    execSync("crontab -", { input: kept.join("\n") + "\n" });
    console.log(mode === "install" ? "Installed crontab entry." : "Removed scheduled check from crontab.");
    execFileSync(process.execPath, [path.join(__dirname, "autostart.js"), mode], { stdio: "inherit" });
};

if (process.platform === "darwin") installMac();
else installCron();
