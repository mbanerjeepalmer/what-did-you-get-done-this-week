# Testing in an isolated macOS VM

Running the tool for real takes over the screen (prompt, menu bar). To test
without losing your machine, run it in a [Tart](https://github.com/openai/tart)
VM (Apple Virtualization.framework, Apple Silicon only, ~33 GB on disk).

## Setup

```sh
brew install openai/tools/tart   # Tart moved from cirruslabs to openai
# newer Homebrew refuses untrusted taps; trust just the two formulas needed
brew trust --formula openai/tools/tart
brew trust --formula openai/tools/softnet
scripts/vm.sh create             # pulls macos-tahoe-base, keeps a pristine copy
scripts/vm.sh start              # VM opens in its own window; repo is shared in
```

The `macos-tahoe-base` image has brew, Node and the command line tools
(`swiftc`) preinstalled. Login is `admin` / `admin`.

### One-time grants (in the VM window)

UI scripting is blocked by macOS until a person approves it once. In the guest,
System Settings > Privacy & Security, switch **Terminal** on under:

- Accessibility
- Screen & System Audio Recording

Then quit and reopen Terminal (a grant only applies to a freshly launched
app). Calendar access for Terminal and `dist/launcher` is prompted the first
time they touch the calendar. Allow it.

Why Terminal: `tart exec` commands have no grants, but anything started with
`open -a Terminal script.command` inherits Terminal's. `vm-e2e.sh` does this
for you. `scripts/vm.sh reset` discards the grants, so repeat this after a reset.

## Day to day

| Command | Does |
| --- | --- |
| `scripts/vm.sh test` | `npm ci && npm test` in the guest via `tart exec` (no window needed) |
| `scripts/vm-e2e.sh` | full end-to-end check below (~6 min) |
| `scripts/vm.sh ssh` | shell in the guest |
| `scripts/vm.sh start` / `headless` | boot with / without a window |
| `scripts/vm.sh reset` | back to the pristine copy |
| `scripts/vm.sh stop` | shut down |

## What `vm-e2e.sh` checks

Needs the VM running and the grants above. It uses a local "VMTest" calendar
(On My Mac), so there is no Outlook involved: this tests the EventKit path, not
real Exchange sync.

1. Build and unit tests pass in the guest.
2. `npm start` installs both launchd agents.
3. A meeting running now writes a `MEETING UNTIL` line and no prompt appears.
4. With no meeting the prompt appears; typing text and clicking Log writes the entry and closes it.
5. When overdue, the "When" dropdown backfills (oldest option logs ~25 min ago).
6. Snooze (`30`) writes `SNOOZE UNTIL` and the prompt stays away.

Also checked by hand, not in the script: `npm run stop` removes the agents,
and after a cold VM boot both agents load and the menu bar is running.

Not covered: the menu bar item's right-click menu (AppleScript can't right-click)
and real Exchange/Outlook calendars.

## Gotchas

- Only one prompt at a time: a prompt left open blocks the next check, so the
  script kills stray `dist/prompt` processes between steps.
- Wait for the dropdown to be ready before clicking an item; clicking straight
  after opening it silently selects nothing.
- At most 2 macOS VMs can run at once on Apple Silicon.
