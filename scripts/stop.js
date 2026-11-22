#!/usr/bin/env node

// Kills the scheduled checker: removes the schedule (launchd agent or crontab entry) so no further
// checks run, and terminates a check.js invocation currently blocked on an
// open prompt dialog (if any), along with its dialog subprocess.

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const CONFIG_DIR = path.join(os.homedir(), "what-did-you-get-done-this-week");
const LOCK_PATH = path.join(CONFIG_DIR, ".prompt.lock");

execSync(`node ${path.join(__dirname, "schedule.js")} uninstall`, { stdio: "inherit" });

if (fs.existsSync(LOCK_PATH)) {
    const pid = parseInt(fs.readFileSync(LOCK_PATH, "utf8").trim(), 10);
    if (!isNaN(pid)) {
        try {
            execSync(`pkill -TERM -P ${pid}`); // the dialog subprocess (zenity/powershell)
        } catch {
            // no matching children
        }
        try {
            process.kill(pid, "SIGTERM");
            console.log(`Killed running prompt (pid ${pid}).`);
        } catch {
            // already gone
        }
    }
    fs.unlinkSync(LOCK_PATH);
}

console.log("Stopped. Run `npm start` to resume.");
