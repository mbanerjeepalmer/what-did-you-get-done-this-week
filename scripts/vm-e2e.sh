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

# Real mouse clicks (AppleScript "click" doesn't open a button's popup menu like a human does).
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
put pickoldest.sh <<'EOF'
# Click the "Choose when" chevron with a real mouse, then the last (oldest) menu item.
[ -x ~/vmtest/rclick ] || swiftc -O ~/vmtest/rclick.swift -o ~/vmtest/rclick
read X Y < <(osascript <<AS
tell application "System Events" to tell process "prompt"
  set b to button "Choose when" of window 1
  set {px, py} to position of b
  set {w, h} to size of b
  return (px + w / 2) & " " & (py + h / 2)
end tell
AS
)
~/vmtest/rclick ${X%.*} ${Y%.*} left
sleep 1
osascript <<AS
tell application "System Events" to tell process "prompt"
  set m to menu 1 of button "Choose when" of window 1
  click menu item (count of menu items of m) of m
end tell
AS
EOF
if [ -z "${ONLY:-}" ]; then # ONLY=menubar|edge runs just that section (agents must already be running)
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
  set value of text field 1 of window 1 to "e2e backfilled"
end tell
AS
bash ~/vmtest/pickoldest.sh
EOF
put age.sh <<'EOF'
# prints the age in seconds of the "e2e backfilled" entry (nothing if missing)
ts=$(grep -s "e2e backfilled" ~/what-did-you-get-done-this-week/$(date +%F).txt | cut -f1)
[ -n "$ts" ] && echo $(( $(date +%s) - $(date -j -u -f %Y-%m-%dT%H:%M:%S "${ts%.*}" +%s) ))
EOF
sleep 3
age=$(guest "bash ~/vmtest/age.sh")
check "backfilled entry is ~25 min old (age=${age:-none}s)" '[ -n "$age" ] && [ "$age" -ge 1200 ] && [ "$age" -le 1800 ]'

echo "== 5b. late answer to an on-time prompt can be backfilled"
term ontime <<'EOF'
pkill -f dist/prompt
rm -f ~/what-did-you-get-done-this-week/*.txt
EOF
check "on-time prompt shown" "wait_for 'pgrep -f dist/prompt >/dev/null' 100"
sleep 150 # the choices widen while the dialog stays open (refreshes every 30s)
term late <<'EOF'
osascript <<AS
tell application "System Events" to tell process "prompt"
  set value of text field 1 of window 1 to "e2e late"
end tell
AS
bash ~/vmtest/pickoldest.sh
EOF
put age2.sh <<'EOF'
ts=$(grep -s "e2e late" ~/what-did-you-get-done-this-week/$(date +%F).txt | cut -f1)
[ -n "$ts" ] && echo $(( $(date +%s) - $(date -j -u -f %Y-%m-%dT%H:%M:%S "${ts%.*}" +%s) ))
EOF
sleep 3
age=$(guest "bash ~/vmtest/age2.sh")
check "late entry is backdated to when the prompt appeared (age=${age:-none}s)" '[ -n "$age" ] && [ "$age" -ge 120 ] && [ "$age" -le 240 ]'

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

if [ -z "${ONLY:-}" ] || [ "${ONLY:-}" = menubar ]; then
echo "== 7. menu bar item"
# AppleScript can't right-click, and an accessibility "press" is a left click, so post
# real mouse events with a tiny CoreGraphics tool (needs Terminal's Accessibility grant).
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

fi

if [ -z "${ONLY:-}" ] || [ "${ONLY:-}" = edge ]; then
echo "== 8. calendar edge cases (EventKit helper output)"
# Import four events from an .ics into a local calendar: all-day, free, cancelled, busy.
# Only the plain busy one should reach the check. Not testable on a local calendar:
# Free/Tentative (local calendars report availability as unsupported, so everything is
# Busy) and Declined (needs an attendee that is the current user). Check those once
# by hand on a real Exchange/M365 calendar (docs/vm-testing.md).
edgeout=$(mktemp)
term edge 120 > "$edgeout" <<'EOF'
pkill -f dist/prompt
cleanup() { osascript <<AS
tell application "Calendar"
  repeat with c in calendars
    try
      delete (every event of c whose summary starts with "E2E-edge")
    end try
  end repeat
end tell
AS
}
cleanup
d=~/vmtest/edge.ics
st=$(date -u -v-10M +%Y%m%dT%H%M%SZ); en=$(date -u -v+50M +%Y%m%dT%H%M%SZ)
t0=$(date +%Y%m%d); t1=$(date -v+1d +%Y%m%d); stamp=$(date -u +%Y%m%dT%H%M%SZ)
ev() { u="$1"; s="$2"; shift 2
  printf 'BEGIN:VEVENT\nUID:%s@e2e\nDTSTAMP:%s\nSUMMARY:%s\n' "$u" "$stamp" "$s"
  for l in "$@"; do printf '%s\n' "$l"; done
  printf 'END:VEVENT\n'; }
{ printf 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//e2e//EN\n'
  ev allday "E2E-edge all-day" "DTSTART;VALUE=DATE:$t0" "DTEND;VALUE=DATE:$t1"
  ev cancelled "E2E-edge cancelled" "DTSTART:$st" "DTEND:$en" "STATUS:CANCELLED"
  ev busy "E2E-edge busy" "DTSTART:$st" "DTEND:$en" "TRANSP:OPAQUE"
  printf 'END:VCALENDAR\n'; } > $d
open -a Calendar $d
for i in $(seq 1 15); do
  osascript <<AS >/dev/null 2>&1 && break
tell application "System Events" to tell process "Calendar" to click button "OK" of window "Add event"
AS
  sleep 1
done
sleep 4
now=$(($(date +%s)*1000))
echo "HELPER_BEGIN"
~/project/dist/calendar-events $((now-86400000)) $((now+86400000))
echo "HELPER_END"
cleanup
EOF
helper=$(sed -n '/HELPER_BEGIN/,/HELPER_END/p' "$edgeout"); rm -f "$edgeout"
echo "$helper" | grep 'E2E-edge' | sed 's/^/      /'
check "plain busy event is reported" 'echo "$helper" | grep -q "|Busy|E2E-edge busy"'
check "all-day event is filtered out" '! echo "$helper" | grep -q "E2E-edge all-day"'
check "cancelled event is filtered out" '! echo "$helper" | grep -q "E2E-edge cancelled"'
fi

echo
[ "$fails" -eq 0 ] && echo "All checks passed." || echo "$fails check(s) failed."
exit "$fails"
