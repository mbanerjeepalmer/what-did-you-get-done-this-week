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
term() { # term <name> : script on stdin, run in Terminal
  put "$1.sh" && guest "bash ~/vmtest/runterm.sh \$HOME/vmtest/$1.sh 60"
}
day='$HOME/what-did-you-get-done-this-week/$(date +%F).txt'
wait_for() { # wait_for <guest shell condition> [seconds]
  guest "for i in \$(seq 1 ${2:-100}); do $1 && exit 0; sleep 1; done; exit 1"
}

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

echo
[ "$fails" -eq 0 ] && echo "All checks passed." || echo "$fails check(s) failed."
exit "$fails"
