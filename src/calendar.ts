import { runCommand, runPowershellScript } from './notifier';

export interface CalendarEvent {
    start: Date;
    end: Date;
    /** Outlook's BusyStatus, e.g. "Free", "Tentative", "Busy", "OutOfOffice", "WorkingElsewhere". */
    busyStatus: string;
    subject: string;
}

/**
 * Only "Busy" counts as actually being in something. Free/Tentative are
 * placeholders, and OutOfOffice/WorkingElsewhere are typically all-day
 * markers that would otherwise suppress the prompt for the whole day.
 */
const isBusy = (event: CalendarEvent): boolean => event.busyStatus === 'Busy';

/**
 * Reads today's calendar via Outlook COM automation, driven from PowerShell.
 * This deliberately avoids the Microsoft Graph API: Graph needs an Entra app
 * registration and OAuth consent, which isn't available on this tenant.
 * Outlook COM instead rides on the desktop client's existing signed-in
 * session, so it works with no auth setup at all -- at the cost of only
 * working when Outlook is installed and running on the Windows side.
 *
 * Outlook's Restrict() parses date strings using the Windows locale, so an
 * ISO-ish "2026-10-06" is read as year-day-month (10 June) on a UK machine.
 * The dates are therefore built from numeric parts inside PowerShell and
 * formatted with the current culture ("g") for Outlook to parse back.
 * Sort must precede IncludeRecurrences, per Outlook's docs, or recurring
 * occurrences are not expanded correctly.
 *
 * Classic Outlook usually isn't running (the new Outlook, olk.exe, is what's
 * used day to day, and it has no COM API). COM starts it headless, and without
 * a sync it answers from a local cache that can be days out of date -- missing
 * any one-off meeting booked since it last ran. So a send/receive is run first
 * and waited on, up to SYNC_TIMEOUT_MS; if it doesn't finish (or the interop
 * assembly is missing) the query still runs against whatever is cached.
 * SyncEnd isn't reachable from PowerShell's late-bound COM objects, hence the
 * small C# helper compiled against Outlook's interop assembly.
 */
const SYNC_TIMEOUT_MS = 30000;

const buildOutlookQueryScript = (startOfDay: Date, endOfDay: Date): string => {
    const toPowershellDate = (d: Date) =>
        `(New-Object DateTime ${d.getFullYear()}, ${d.getMonth() + 1}, ${d.getDate()}, ${d.getHours()}, ${d.getMinutes()}, 0)`;

    return `
$rangeStart = ${toPowershellDate(startOfDay)}
$rangeEnd = ${toPowershellDate(endOfDay)}

$outlook = New-Object -ComObject Outlook.Application
$namespace = $outlook.GetNamespace("MAPI")

try {
    $pia = [Reflection.Assembly]::LoadWithPartialName('Microsoft.Office.Interop.Outlook')
    Add-Type -ReferencedAssemblies $pia.Location -TypeDefinition @'
using System.Threading;
using Outlook = Microsoft.Office.Interop.Outlook;
public static class WgdOutlookSync {
    public static bool Run(object ns, int timeoutMs) {
        var sync = ((Outlook.NameSpace)ns).SyncObjects[1];
        var done = new ManualResetEvent(false);
        sync.SyncEnd += () => done.Set();
        sync.Start();
        return done.WaitOne(timeoutMs);
    }
}
'@
    $null = [WgdOutlookSync]::Run($namespace, ${SYNC_TIMEOUT_MS})
} catch {}
$calendar = $namespace.GetDefaultFolder(9)
$items = $calendar.Items
$items.Sort("[Start]")
$items.IncludeRecurrences = $true

# Overlap, not "starts within": also catches events that began before rangeStart.
$filter = "[Start] < '" + $rangeEnd.ToString("g") + "' AND [End] > '" + $rangeStart.ToString("g") + "'"
$todayItems = $items.Restrict($filter)

foreach ($item in $todayItems) {
    $busyStatus = switch ($item.BusyStatus) {
        0 { "Free" }
        1 { "Tentative" }
        2 { "Busy" }
        3 { "OutOfOffice" }
        4 { "WorkingElsewhere" }
        default { "Unknown" }
    }
    "$($item.Start.ToString('o'))|$($item.End.ToString('o'))|$busyStatus|$($item.Subject)"
}
`;
};

/** Parses the pipe-delimited `start|end|busyStatus|subject` lines the PowerShell script prints. */
export const parseCalendarOutput = (output: string): CalendarEvent[] =>
    output
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => {
            const [startStr, endStr, busyStatus, ...subjectParts] = line.split('|');
            return {
                start: new Date(startStr),
                end: new Date(endStr),
                busyStatus,
                subject: subjectParts.join('|'),
            };
        })
        .filter((event) => !isNaN(event.start.getTime()) && !isNaN(event.end.getTime()));

/**
 * macOS: asks Outlook for Mac via JXA (osascript -l JavaScript), printing the
 * same `start|end|busyStatus|subject` lines as the PowerShell script. It needs
 * classic Outlook for Mac; the "New Outlook" has no calendar scripting
 * support and yields no events (so the check fails open to "not in a meeting").
 * The first run triggers macOS's Automation permission prompt.
 */
export const buildMacOutlookScript = (startOfDay: Date, endOfDay: Date): string => `
const app = Application('Microsoft Outlook');
const rangeStart = new Date(${startOfDay.getTime()});
const rangeEnd = new Date(${endOfDay.getTime()});
const events = app.calendarEvents;
const starts = events.startTime(), ends = events.endTime(), subjects = events.subject();
const out = [];
for (let i = 0; i < starts.length; i++) {
    if (starts[i] < rangeEnd && ends[i] > rangeStart) {
        out.push(starts[i].toISOString() + '|' + ends[i].toISOString() + '|Busy|' + String(subjects[i]).replace(/[\\r\\n]+/g, ' '));
    }
}
out.join('\\n');
`;

/** Fetches calendar events overlapping the given day (local time), oldest first. */
export const getEventsForDay = async (day: Date): Promise<CalendarEvent[]> => {
    const startOfDay = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
    if (process.platform === 'darwin') {
        const output = await runCommand('osascript', ['-l', 'JavaScript', '-e', buildMacOutlookScript(startOfDay, endOfDay)]);
        return parseCalendarOutput(output);
    }
    const output = await runPowershellScript(buildOutlookQueryScript(startOfDay, endOfDay));
    return parseCalendarOutput(output);
};

/** Pure: picks the event (if any) that covers `now` and counts as actually busy. */
export const findCurrentMeeting = (events: CalendarEvent[], now: Date): CalendarEvent | null =>
    events.find(
        (event) =>
            isBusy(event) &&
            event.start.getTime() <= now.getTime() &&
            now.getTime() < event.end.getTime(),
    ) ?? null;

/**
 * Whether `now` falls inside a busy calendar event.
 * Fails open (returns null) on any error -- e.g. Outlook isn't installed/running,
 * or this isn't Windows/WSL -- so a broken calendar check never blocks the prompt.
 */
export const getCurrentMeeting = async (now: Date = new Date()): Promise<CalendarEvent | null> => {
    try {
        const events = await getEventsForDay(now);
        return findCurrentMeeting(events, now);
    } catch {
        return null;
    }
};
