#!/usr/bin/env node

// The checker is driven by cron inside WSL, but Windows doesn't start WSL at
// login, and WSL shuts the distro down (taking cron with it) once the last
// terminal closes. This puts a shortcut in the Windows Startup folder that
// launches a hidden, long-lived WSL process, so the distro -- and cron, via
// systemd -- comes up at login and stays up.
//
// Usage: node scripts/autostart.js install|uninstall
// No-op outside WSL.

const { execFileSync } = require("child_process");

const SHORTCUT_NAME = "what-did-you-get-done-this-week.lnk";

const distro = process.env.WSL_DISTRO_NAME;
if (!distro) {
    process.exit(0);
}

const mode = process.argv[2];
if (mode !== "install" && mode !== "uninstall") {
    console.error("Usage: node scripts/autostart.js install|uninstall");
    process.exit(1);
}

const powershell = (script) =>
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
        cwd: "/mnt/c", // avoid UNC-path cwd warnings from Windows processes
    })
        .toString()
        .trim();

const startupPathExpr = `(Join-Path ([Environment]::GetFolderPath('Startup')) '${SHORTCUT_NAME}')`;

if (mode === "install") {
    // conhost --headless runs wsl.exe without a visible console window.
    powershell(`
        $s = (New-Object -ComObject WScript.Shell).CreateShortcut(${startupPathExpr})
        $s.TargetPath = "$env:WINDIR\\System32\\conhost.exe"
        $s.Arguments = '--headless wsl.exe -d ${distro} --exec sleep infinity'
        $s.WindowStyle = 7
        $s.Save()
    `);
    console.log(`Installed Windows autostart for WSL distro '${distro}'.`);
} else {
    powershell(`Remove-Item -ErrorAction SilentlyContinue ${startupPathExpr}`);
    console.log("Removed Windows autostart.");
}
