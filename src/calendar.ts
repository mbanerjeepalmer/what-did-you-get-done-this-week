import { escapePowershellSingleQuoted, runPowershellScript } from './notifier';

export interface CalendarEvent {
    start: Date;
    end: Date;
    /** Outlook's BusyStatus, e.g. "Free", "Tentative", "Busy", "OutOfOffice", "WorkingElsewhere". */
    busyStatus: string;
    subject: string;
}

/** BusyStatus values that count as "actually in something", not just a placeholder on the calendar. */
const BUSY_STATUSES = new Set(['Busy', 'OutOfOffice', 'WorkingElsewhere']);

/**
 * Reads today's calendar via Outlook COM automation, driven from PowerShell.
 * This deliberately avoids the Microsoft Graph API: Graph needs an Entra app
 * registration and OAuth consent, which isn't available on this tenant.
 * Outlook COM instead rides on the desktop client's existing signed-in
 * session, so it works with no auth setup at all -- at the cost of only
 * working when Outlook is installed and running on the Windows side.
 */
const buildOutlookQueryScript = (startOfDay: Date, endOfDay: Date): string => {
    const toOutlookDateString = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
            d.getDate(),
        ).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(
            d.getMinutes(),
        ).padStart(2, '0')}`;

    return `
$outlook = New-Object -ComObject Outlook.Application
$namespace = $outlook.GetNamespace("MAPI")
$calendar = $namespace.GetDefaultFolder(9)
$items = $calendar.Items
$items.IncludeRecurrences = $true
$items.Sort("[Start]")

$filter = "[Start] >= '${escapePowershellSingleQuoted(
        toOutlookDateString(startOfDay),
    )}' AND [Start] <= '${escapePowershellSingleQuoted(toOutlookDateString(endOfDay))}'"
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

/** Fetches calendar events overlapping the given day (local time), oldest first. */
export const getEventsForDay = async (day: Date): Promise<CalendarEvent[]> => {
    const startOfDay = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
    const output = await runPowershellScript(buildOutlookQueryScript(startOfDay, endOfDay));
    return parseCalendarOutput(output);
};

/** Pure: picks the event (if any) that covers `now` and counts as actually busy. */
export const findCurrentMeeting = (events: CalendarEvent[], now: Date): CalendarEvent | null =>
    events.find(
        (event) =>
            BUSY_STATUSES.has(event.busyStatus) &&
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
