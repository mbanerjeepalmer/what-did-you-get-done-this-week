# Testing in an isolated macOS VM

Running the tool for real takes over the screen (prompt, menu bar). To test
without losing your machine, run it in a [Tart](https://github.com/openai/tart)
VM (Apple Virtualization.framework, Apple Silicon only, ~33 GB on disk).

For the general how-to (installing Tart, creating the VM, `tart exec`, the
one-time permission grants, pitfalls), which applies to any project, see
[tart-macos-vm-guide.md](tart-macos-vm-guide.md). This page covers only how this
project uses it.

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
7. Menu bar item: left click opens the prompt; right click shows "Open today's
   file" and "Quit"; Open launches TextEdit; Quit exits the process.
   `ONLY=menubar scripts/vm-e2e.sh` runs just this section against already-running agents.
8. Calendar edge cases, via an imported `.ics`: a plain busy event is reported;
   all-day and cancelled events are filtered out. `ONLY=edge` runs just this.

Also checked by hand, not in the script: `npm run stop` removes the agents,
and after a cold VM boot both agents load and the menu bar is running.

Not covered: real Exchange/Outlook calendars (see "Exchange and Outlook" below).

Known behaviour: the menu bar agent has `KeepAlive` set in its launchd plist, so
choosing **Quit** exits the process and launchd starts it again within seconds.
Use `npm run stop` to actually stop it.

## Exchange and Outlook

The tool never talks to Outlook. It reads Calendar.app through EventKit
(`scripts/calendar-events.swift`), so the thing to test is a calendar that syncs
into Calendar.app, i.e. an Exchange / Microsoft 365 account added under System
Settings > Internet Accounts. The New Outlook app is not in the data path (it has
no scripting API and does not write to Calendar.app), so installing it in the VM
adds nothing for this tool.

What that takes, and what is not automated here:

- Sign-in has to be done by a person in the VM window, including MFA. Scripts
  here don't and shouldn't handle credentials.
- Use a **test** account, not your real work one. Options: a Microsoft 365 test
  tenant (the free developer tenant requires a Visual Studio Pro/Enterprise
  subscription or a qualifying program, per Microsoft's developer program page),
  or any account type Calendar.app supports (Exchange, Outlook.com, iCloud,
  Google, CalDAV), which all go through the same EventKit path.
- A work tenant may refuse an unmanaged VM (conditional access, device
  compliance). That would show up as a sign-in failure, not an app bug.
- Once an account syncs, the existing steps work unchanged: put an event on
  that calendar for "now" and check for the `MEETING UNTIL` line.

One-off manual checklist on a real Exchange/M365 calendar. These are the cases a
local calendar can't prove (it reports availability as unsupported, so every
event looks Busy, and it has no attendees):

1. A normal busy meeting now: `MEETING UNTIL` line, no prompt.
2. An event marked Free: no `MEETING UNTIL` line, prompt still appears.
3. An event marked Tentative: same as Free.
4. A meeting you have declined: ignored.
5. An out-of-office or all-day event: ignored.

The all-day and cancelled filters are covered automatically by section 8.

## Gotchas

- Only one prompt at a time: a prompt left open blocks the next check, so the
  script kills stray `dist/prompt` processes between steps.
- Wait for the dropdown to be ready before clicking an item; clicking straight
  after opening it silently selects nothing.
- At most 2 macOS VMs can run at once on Apple Silicon.
