export const CONFIG_DIR_NAME = 'what-did-you-get-done-this-week';

export const getLocalDateString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}h${mins.toString().padStart(2, '0')}m`;
};

export const formatEntryLine = (when: Date, entry: string): string => {
    return `${when.toISOString()}\t${entry}`;
};

export const formatSnoozeLine = (when: Date, until: Date): string => {
    return `${when.toISOString()}\tSNOOZE UNTIL ${until.toISOString()}`;
};

export const isSnoozeLine = (line: string): boolean => line.includes('SNOOZE UNTIL');

export const parseSnoozeUntil = (line: string): Date | null => {
    const match = line.match(/SNOOZE UNTIL (\S+)/);
    if (!match) return null;
    const parsed = new Date(match[1]);
    return isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Recorded instead of a snooze line when the prompt is auto-skipped because
 * the calendar says the user is in a meeting right now (see src/calendar.ts).
 * Carries the meeting's own end time so the next prompt lines up with when
 * the meeting actually finishes, rather than a flat 15-minute snooze.
 */
export const formatMeetingLine = (when: Date, until: Date, subject: string): string => {
    return `${when.toISOString()}\tMEETING UNTIL ${until.toISOString()}\t${subject}`;
};

export const isMeetingLine = (line: string): boolean => line.includes('MEETING UNTIL');

export const parseMeetingUntil = (line: string): Date | null => {
    const match = line.match(/MEETING UNTIL (\S+)/);
    if (!match) return null;
    const parsed = new Date(match[1]);
    return isNaN(parsed.getTime()) ? null : parsed;
};

/** A line that shouldn't count toward logged minutes and carries its own "resume at" time. */
const isSkipLine = (line: string): boolean => isSnoozeLine(line) || isMeetingLine(line);

const parseSkipUntil = (line: string): Date | null => parseSnoozeUntil(line) ?? parseMeetingUntil(line);

export const parseLineTimestamp = (line: string): Date | null => {
    const parsed = new Date(line.split(/\s+/)[0]);
    return isNaN(parsed.getTime()) ? null : parsed;
};

const INTERVAL_MINUTES = 15;

export interface DueState {
    /** Time the next prompt should appear. */
    nextPromptAt: Date;
    /** Total minutes logged today (excludes snooze lines). */
    totalMinutes: number;
    /** True if a prompt should be shown right now. */
    isDue: boolean;
}

/**
 * Pure computation of scheduling state from a day file's lines and the current time.
 * Mirrors scenarios A-E in docs/v0.2.0.spec-open-questions.md.
 */
export const computeDueState = (lines: string[], now: Date): DueState => {
    const nonEmptyLines = lines.filter((l) => l.trim().length > 0);

    if (nonEmptyLines.length === 0) {
        return { nextPromptAt: now, totalMinutes: 0, isDue: true };
    }

    const nonSnoozeLines = nonEmptyLines.filter((l) => !isSkipLine(l));
    const totalMinutes = nonSnoozeLines.length * INTERVAL_MINUTES;

    const lastLine = nonEmptyLines[nonEmptyLines.length - 1];

    let nextPromptAt: Date;
    if (isSkipLine(lastLine)) {
        const skipUntil = parseSkipUntil(lastLine);
        nextPromptAt = skipUntil ?? now;
    } else {
        const lastTimestamp = parseLineTimestamp(lastLine);
        nextPromptAt = lastTimestamp
            ? new Date(lastTimestamp.getTime() + INTERVAL_MINUTES * 60000)
            : now;
    }

    return {
        nextPromptAt,
        totalMinutes,
        isDue: now.getTime() >= nextPromptAt.getTime(),
    };
};

/**
 * Parses a snooze duration or absolute time, mirroring scripts/snooze.sh's behaviour.
 * Accepts: "30" (minutes), "16:00" (today, or tomorrow if already past), or any
 * string `Date` can parse.
 */
export const parseSnoozeInput = (input: string, now: Date): Date | null => {
    const trimmed = input.trim();

    const minutesMatch = trimmed.match(/^\+?(\d+)$/);
    if (minutesMatch) {
        return new Date(now.getTime() + parseInt(minutesMatch[1], 10) * 60000);
    }

    const hhmmMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
    if (hhmmMatch) {
        const hours = parseInt(hhmmMatch[1], 10);
        const mins = parseInt(hhmmMatch[2], 10);
        const candidate = new Date(now);
        candidate.setHours(hours, mins, 0, 0);
        if (candidate.getTime() < now.getTime()) {
            candidate.setDate(candidate.getDate() + 1);
        }
        return candidate;
    }

    const parsed = new Date(trimmed);
    return isNaN(parsed.getTime()) ? null : parsed;
};

/** A response is treated as a snooze command if it starts with the word "snooze". */
export const isSnoozeCommand = (response: string): boolean =>
    /^snooze\b/i.test(response.trim());

export const extractSnoozeArgument = (response: string): string =>
    response.trim().replace(/^snooze\b/i, '').trim();

/**
 * Whole minutes until the next prompt is due, negative once it's overdue
 * (e.g. -3 = due 3 minutes ago). Under a minute overdue shows as 0.
 */
export const minutesUntilNextPrompt = (lines: string[], now: Date): number => {
    const diffMs = computeDueState(lines, now).nextPromptAt.getTime() - now.getTime();
    const minutes = diffMs >= 0 ? Math.ceil(diffMs / 60000) : Math.trunc(diffMs / 60000);
    return minutes === 0 ? 0 : minutes; // normalise -0
};
