# Meeting detection

`src/calendar.ts` skips the prompt automatically while the user is in a
meeting, instead of asking "what did you get done" mid-call.

## Why Outlook COM instead of Microsoft Graph

Graph's calendar API (`/me/calendarView`, `/me/presence`) needs an Entra app
registration and OAuth consent. That's not available on this tenant, so it's
not an option here.

Outlook COM automation sidesteps auth entirely: it drives the desktop Outlook
client's *existing* signed-in session (`New-Object -ComObject
Outlook.Application`), the same way `notifier.ts` drives `powershell.exe` for
toasts/dialogs. No app registration, no token storage, no admin consent.

Trade-off: it only works when Outlook is installed and running on the Windows
side (true for this WSL setup, since `notifier.ts` already assumes a Windows
host for toasts/dialogs).

Proven with a standalone PowerShell spike before writing any TypeScript:

```powershell
$outlook = New-Object -ComObject Outlook.Application
$namespace = $outlook.GetNamespace("MAPI")
$calendar = $namespace.GetDefaultFolder(9) # olFolderCalendar
# ... restrict to today, print "start|end|busyStatus|subject" per event
```

Run from WSL via `powershell.exe -File <script>`, this printed real calendar
entries (subject, times, `BusyStatus`) with zero configuration.

## How it works

- `getEventsForDay(day)` shells out to PowerShell (reusing
  `runPowershellScript`/`escapePowershellSingleQuoted` from `notifier.ts`) and
  restricts Outlook's calendar folder to events overlapping that day.
- `parseCalendarOutput(output)` is a pure function that turns the
  pipe-delimited `start|end|busyStatus|subject` lines into `CalendarEvent[]`.
  Kept pure and separate from the PowerShell call so it's unit-testable
  without Outlook installed.
- `findCurrentMeeting(events, now)` is also pure: picks the event (if any)
  covering `now` whose `BusyStatus` is `Busy`, `OutOfOffice`, or
  `WorkingElsewhere` (not `Free`/`Tentative`-as-free-time).
- `getCurrentMeeting(now)` combines both and **fails open**: any error
  (Outlook not running, not on Windows, COM error) returns `null` rather than
  throwing, so a broken calendar check never blocks the prompt.

## Wiring into `check.ts`

Before showing the notifier prompt (and only when not `--now`/`--force`,
which is an explicit manual override), `runCheck` calls `getCurrentMeeting`.
If it returns an event, the prompt is skipped and a **meeting line** is
appended to the day file instead of a normal snooze line:

```
2026-01-05T10:00:00.000Z	MEETING UNTIL 2026-01-05T11:00:00.000Z	Planning
```

This reuses the existing snooze-line machinery in `state.ts`
(`computeDueState` treats snooze lines and meeting lines the same way: both
are excluded from `totalMinutes` and both set `nextPromptAt` to their own
"until" time), but keeps meeting skips distinguishable from a user-initiated
snooze in the log. Unlike a snooze, the "until" time is the meeting's actual
end time from the calendar, not a flat 15 minutes — so the prompt reappears
right when the meeting finishes rather than up to 15 minutes late.

## Not done yet

- **Focus Assist fallback** — a registry-based check for when Outlook isn't
  running, still to be built.
- **Backfill** — when a gap between prompts is larger than expected (laptop
  asleep, several consecutive meetings), look up what calendar events fell in
  that gap and pre-fill/suggest an entry instead of leaving it blank.
