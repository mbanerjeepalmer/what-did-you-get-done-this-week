#!/usr/bin/env bash
# End-to-end check of the macOS build inside the Tart VM (see docs/vm-testing.md).
# Needs the VM running (scripts/vm.sh start|headless) with Terminal granted
# Accessibility, Screen Recording and Calendar once. Runs on the host; drives the
# guest with `tart exec` and uses Terminal there so UI scripting inherits its grants.
set -uo pipefail

VM=wdygdtw-dev
REPO="$(cd "$(dirname "$0")/.." && pwd)"
fails=0

guest() { tart exec "$VM" bash -lc "$1"; }
put() { tart exec -i "$VM" bash -c "mkdir -p ~/vmtest && cat > ~/vmtest/$1"; } # put <name> < content
ok() { echo "PASS  $1"; }
bad() { echo "FAIL  $1"; fails=$((fails + 1)); }
check() { if eval "$2"; then ok "$1"; else bad "$1"; fi; }

# Guest helper: run a script under Terminal (inherits its TCC grants), print its output.
put runterm.sh <<'EOF'
s="$1"; rm -f "$s.out" "$s.done"
printf '#!/bin/bash\nbash "%s" > "%s.out" 2>&1\necho $? > "%s.done"\n' "$s" "$s" "$s" > "$s.command"
chmod +x "$s.command"; open -a Terminal "$s.command"
for i in $(seq 1 "${2:-60}"); do [ -f "$s.done" ] && break; sleep 1; done
cat "$s.out"
EOF
term() { # term <name> [timeout] : script on stdin, run in Terminal
  put "$1.sh" && guest "bash ~/vmtest/runterm.sh \$HOME/vmtest/$1.sh ${2:-60}"
}
day='$HOME/what-did-you-get-done-this-week/$(date +%F).txt'
wait_for() { # wait_for <guest shell condition> [seconds]
  guest "for i in \$(seq 1 ${2:-100}); do $1 && exit 0; sleep 1; done; exit 1"
}

if [ "${ONLY:-}" != menubar ]; then # ONLY=menubar skips sections 1-6 (agents must already be running)
echo "== 1. build + unit tests in the guest"
"$REPO/scripts/vm.sh" test > /tmp/vm-e2e-test.log 2>&1 && ok "npm test" || { bad "npm test (see /tmp/vm-e2e-test.log)"; }

echo "== 2. install agents"
term start <<'EOF'
eval "$(/opt/homebrew/bin/brew shellenv)"
cd ~/project && npm start 2>&1 | tail -3
EOF
check "launchd agents loaded" 'guest "launchctl list | grep -c what-did-you-get | grep -qs 2"'

echo "== 3. meeting suppresses the prompt"
term event <<'EOF'
pkill -f dist/prompt
osascript <<AS
tell application "Calendar"
  if not (exists calendar "VMTest") then make new calendar with properties {name:"VMTest"}
  tell calendar "VMTest"
    delete every event
    make new event with properties {summary:"E2E meeting", start date:((current date) - 10 * minutes), end date:((current date) + 50 * minutes)}
  end tell
end tell
AS
rm -f ~/what-did-you-get-done-this-week/*.txt
EOF
check "MEETING line written" "wait_for 'grep -qs \"MEETING UNTIL.*E2E meeting\" $day' 100"
check "no prompt during meeting" '! guest "pgrep -f dist/prompt"'

echo "== 4. prompt appears and logs"
term clear <<'EOF'
pkill -f dist/prompt
osascript -e 'tell application "Calendar" to delete every event of calendar "VMTest"'
rm -f ~/what-did-you-get-done-this-week/*.txt
EOF
check "prompt shown when due" "wait_for 'pgrep -f dist/prompt >/dev/null' 100"
sleep 2
term log <<'EOF'
osascript <<AS
tell application "System Events" to tell process "prompt"
  set value of text field 1 of window 1 to "e2e entry"
  click button "Log" of window 1
end tell
AS
EOF
check "entry written" "wait_for 'grep -qs \"e2e entry\" $day' 10"
check "prompt closed after Log" "wait_for '! pgrep -f dist/prompt >/dev/null' 10"

echo "== 5. backfill"
term overdue <<'EOF'
pkill -f dist/prompt
printf '%s\told entry\n' "$(date -u -v-40M +%Y-%m-%dT%H:%M:%S.000Z)" > ~/what-did-you-get-done-this-week/$(date +%F).txt
EOF
check "prompt shown when overdue" "wait_for 'pgrep -f dist/prompt >/dev/null' 100"
sleep 2
term backfill <<'EOF'
osascript <<AS
tell application "System Events" to tell process "prompt"
  click pop up button 1 of window 1
  delay 1
  set n to count of menu items of menu 1 of pop up button 1 of window 1 -- also waits for the menu to be ready
  click menu item n of menu 1 of pop up button 1 of window 1
  delay 1
  set value of text field 1 of window 1 to "e2e backfilled"
  click button "Log" of window 1
end tell
AS
EOF
put age.sh <<'EOF'
# prints the age in seconds of the "e2e backfilled" entry (nothing if missing)
ts=$(grep -s "e2e backfilled" ~/what-did-you-get-done-this-week/$(date +%F).txt | cut -f1)
[ -n "$ts" ] && echo $(( $(date +%s) - $(date -j -u -f %Y-%m-%dT%H:%M:%S "${ts%.*}" +%s) ))
EOF
sleep 3
age=$(guest "bash ~/vmtest/age.sh")
check "backfilled entry is ~25 min old (age=${age:-none}s)" '[ -n "$age" ] && [ "$age" -ge 1200 ] && [ "$age" -le 1800 ]'

echo "== 6. snooze"
term clear2 <<'EOF'
pkill -f dist/prompt
rm -f ~/what-did-you-get-done-this-week/*.txt
EOF
check "prompt shown again" "wait_for 'pgrep -f dist/prompt >/dev/null' 100"
sleep 2
term snooze <<'EOF'
osascript <<AS
tell application "System Events" to tell process "prompt"
  set value of text field 1 of window 1 to "30"
  click button "Snooze" of window 1
end tell
AS
EOF
check "SNOOZE line written" "wait_for 'grep -qs \"SNOOZE UNTIL\" $day' 10"
sleep 65
check "no prompt while snoozed" '! guest "pgrep -f dist/prompt"'
fi

echo "== 7. menu bar item"
# AppleScript can't right-click, and an accessibility "press" is a left click, so post
# real mouse events with a tiny CoreGraphics tool (needs Terminal's Accessibility grant).
put rclick.swift <<'EOF'
import CoreGraphics
import Foundation
let a = CommandLine.arguments
let p = CGPoint(x: Double(a[1])!, y: Double(a[2])!)
let btn: CGMouseButton = a.count > 3 && a[3] == "left" ? .left : .right
let (down, up): (CGEventType, CGEventType) = btn == .left ? (.leftMouseDown, .leftMouseUp) : (.rightMouseDown, .rightMouseUp)
CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: p, mouseButton: btn)?.post(tap: .cghidEventTap)
usleep(300_000)
CGEvent(mouseEventSource: nil, mouseType: down, mouseCursorPosition: p, mouseButton: btn)?.post(tap: .cghidEventTap)
usleep(80_000)
CGEvent(mouseEventSource: nil, mouseType: up, mouseCursorPosition: p, mouseButton: btn)?.post(tap: .cghidEventTap)
EOF
# Not touched here: TextEdit Apple Events (macOS would ask for a separate Automation grant).
mbout=$(mktemp)
term menubar 150 > "$mbout" <<'EOF'
pkill -f dist/prompt; pkill TextEdit
[ -x ~/vmtest/rclick ] || swiftc -O ~/vmtest/rclick.swift -o ~/vmtest/rclick
# a recent entry so the prompt isn't overdue and "Open today's file" has a file to open
printf '%s\tsomething\n' "$(date -u -v-1M +%Y-%m-%dT%H:%M:%S.000Z)" > ~/what-did-you-get-done-this-week/$(date +%F).txt
read X Y < <(osascript <<AS
tell application "System Events" to tell process "menubar"
  set i to menu bar item 1 of menu bar 1
  set p to position of i
  set s to size of i
  return ((item 1 of p) + ((item 1 of s) div 2) as text) & " " & ((item 2 of p) + ((item 2 of s) div 2) as text)
end tell
AS
)
echo "POS=$X,$Y"
# left click = prompt now
~/vmtest/rclick $X $Y left
for i in $(seq 1 20); do pgrep -f dist/prompt >/dev/null && break; sleep 1; done
pgrep -f dist/prompt >/dev/null && echo "LEFT=prompt" || echo "LEFT=none"
pkill -f dist/prompt; sleep 1
# right click = menu
~/vmtest/rclick $X $Y
sleep 1
echo "MENU=$(osascript <<AS
tell application "System Events" to tell process "menubar" to get name of every menu item of menu 1 of menu bar item 1 of menu bar 1
AS
)"
osascript <<AS >/dev/null
tell application "System Events" to tell process "menubar" to click menu item "Open today's file" of menu 1 of menu bar item 1 of menu bar 1
AS
sleep 4
pgrep -x TextEdit >/dev/null && echo "OPEN=TextEdit" || echo "OPEN=none"
pkill TextEdit; sleep 1
# right click > Quit exits the process. launchd may restart it at once, so compare pids
# rather than relying on a fixed wait: a different pid (or none) means the old one quit.
old=$(pgrep -f dist/menubar | head -1)
~/vmtest/rclick $X $Y
sleep 1
osascript <<AS >/dev/null
tell application "System Events" to tell process "menubar" to click menu item "Quit" of menu 1 of menu bar item 1 of menu bar 1
AS
for i in $(seq 1 40); do cur=$(pgrep -f dist/menubar | head -1); [ "$cur" != "$old" ] && break; sleep 1; done
[ "$cur" != "$old" ] && echo "QUIT=exited" || echo "QUIT=still-running"
for i in $(seq 1 30); do pgrep -f dist/menubar >/dev/null && break; sleep 1; done
pgrep -f dist/menubar >/dev/null && echo "RESPAWN=yes" || echo "RESPAWN=no"
EOF
mb=$(cat "$mbout"); rm -f "$mbout"
echo "$mb" | sed 's/^/      /'
check "left click opens the prompt" 'echo "$mb" | grep -q "LEFT=prompt"'
check "right click shows Open today's file + Quit" 'echo "$mb" | grep -q "MENU=Open today.s file, missing value, Quit"'
check "Open today's file opens it in TextEdit" 'echo "$mb" | grep -q "OPEN=TextEdit"'
check "Quit exits the menu bar process" 'echo "$mb" | grep -q "QUIT=exited"'
# Informational, not a pass/fail: launchd KeepAlive restarts the agent after Quit.
echo "INFO  menu bar respawned after Quit: $(echo "$mb" | sed -n 's/^RESPAWN=//p')"

echo
[ "$fails" -eq 0 ] && echo "All checks passed." || echo "$fails check(s) failed."
exit "$fails"
