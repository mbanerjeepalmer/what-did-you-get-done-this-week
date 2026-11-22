# Testing macOS GUI apps in a Tart VM (generic guide)

For any project that needs a real macOS session (menu bar items, dialogs,
EventKit, launchd agents) but where you don't want it taking over your own
screen. Nothing here is specific to one repo. See `vm-testing.md` for how this
project applies it.

## Requirements

- Apple Silicon Mac, macOS 13 (Ventura) or later.
- ~35 GB free disk (the base image is ~25 GB to pull, ~33 GB on disk; each
  extra VM is a full copy unless you use `--stacked` on macOS 27+).
- At most 2 macOS VMs can run at once.
- Tart's license is FSL-1.1-ALv2 (source-available), fine for internal testing.

## 1. Install Tart

Tart moved from `cirruslabs` to `openai` in 2026. The old
`brew install cirruslabs/cli/tart` no longer works.

```sh
brew install openai/tools/tart
```

Current Homebrew refuses formulas from taps you haven't trusted, and Tart pulls
in a dependency (`softnet`) from the same tap, so trust both formulas first:

```sh
brew trust --formula openai/tools/tart
brew trust --formula openai/tools/softnet
brew install openai/tools/tart
```

Trust is a security decision; check the source yourself. What was verified when
this was written: `github.com/openai` is the verified OpenAI org,
`cirruslabs/tart` redirects to `openai/tart`, and the formulas download only
from `github.com/openai/{tart,softnet}` releases with SHA-256 hashes that match
the checksum files published on those releases. Prefer trusting individual
formulas over `brew trust openai/tools`, which covers the whole tap.

## 2. Create the VM

```sh
tart clone ghcr.io/cirruslabs/macos-tahoe-base:latest golden   # ~25 GB download
tart clone golden dev                                          # working copy
tart run dev --dir=project:/path/to/repo                       # window opens
```

- Keep `golden` untouched; to reset, `tart delete dev && tart clone golden dev`.
- Image variants: `macos-{tahoe,sequoia,sonoma}-{vanilla,base,xcode}`. `base`
  has brew, Node and the command line tools (`swiftc`); `xcode` adds Xcode;
  `vanilla` has nothing. Full list: tart.run/quick-start.
- Login is `admin` / `admin` (published default; GUI, console and SSH).
- `--dir=name:path` mounts a host folder at `/Volumes/My Shared Files/name`
  (add `:ro` for read-only). Copy it into the guest before `npm ci` or builds so
  native modules and `node_modules` aren't shared with the host.
- `tart run dev --no-graphics` boots without a window. The guest still has a
  logged-in GUI session; you just can't see it.

## 3. Run commands in the guest

`tart exec` talks to the guest agent and needs no SSH or password:

```sh
tart exec dev bash -lc 'uname -a'
tart exec -i dev bash -c 'cat > ~/script.sh' < local-script.sh   # push a file
tart exec -i -t dev bash -l                                      # interactive shell
tart ip dev --wait 120                                           # wait for boot
```

Use `bash -lc` so brew and Node are on `PATH`. The guest has no `timeout`
command, so wrap waits in a shell loop. `tart exec` right after boot can fail
until the agent is up; retry for a while.

## 4. Drive the GUI from the host

This is the part that bites. macOS blocks UI scripting (clicking, typing,
screenshots) and calendar access until a person approves it, and processes
started by `tart exec` have no approvals. Trying to click a permission dialog
from `tart exec` hangs, because clicking needs the permission you are trying to
grant.

**One-time, by a person, in the VM window** (System Settings > Privacy &
Security), turn **Terminal** on under:

- Accessibility
- Screen & System Audio Recording

Enter `admin` if asked for a password, and quit and reopen Terminal after
granting (the grant only applies to a freshly launched app). Calendar and
similar prompts appear the first time something touches them; allow them.

**Then from the host**, run anything under Terminal so it inherits those grants:

```sh
# guest: runterm.sh <abs script path> [timeout]
s="$1"; rm -f "$s.out" "$s.done"
printf '#!/bin/bash\nbash "%s" > "%s.out" 2>&1\necho $? > "%s.done"\n' "$s" "$s" "$s" > "$s.command"
chmod +x "$s.command"; open -a Terminal "$s.command"
for i in $(seq 1 "${2:-60}"); do [ -f "$s.done" ] && break; sleep 1; done
cat "$s.out"
```

Inside such scripts `osascript` can now click and type, and `screencapture -x
file.png` works; copy the image out with `tart exec dev cat file.png > out.png`
to look at the guest screen.

Grants live in the VM disk, so `delete`/re-clone from `golden` loses them
(confirmed by design, not tested). Doing the grants in `golden` before cloning
should make clones keep them, but that is untested.

## 5. Things that went wrong

- `brew install cirruslabs/cli/tart`: "No available formula". Use the `openai` tap.
- `Refusing to load formula ... from untrusted tap`: `brew trust --formula ...`.
- `osascript is not allowed assistive access (-1719)`: Accessibility not on for
  Terminal, or Terminal wasn't relaunched after granting.
- `could not create image from display`: Screen Recording not granted yet.
- `sudo shutdown -r now` via `tart exec` silently did nothing; use `tart stop`
  then `tart run` for a cold boot.
- Clicking a popup menu item immediately after opening it silently selects
  nothing; read the menu's items first (or delay) so it's ready.
- A GUI test waiting on a dialog nobody clicks blocks forever; always bound
  waits.
- Apps launched headlessly via launchd agents still show their windows in the
  VM's session, and a leftover window can block the next step. Kill strays
  between steps.

## 6. Verifying what you can't see

There's no automatic way to assert on pixels here; the pattern that worked is:
assert on files and processes (`pgrep`, log/state files, `launchctl list`), and
use screenshots only to look at the result when something is off.
