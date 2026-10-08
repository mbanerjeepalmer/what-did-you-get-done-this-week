import * as fs from 'fs';
import * as path from 'path';
import {
    CONFIG_DIR_NAME,
    computeDueState,
    extractSnoozeArgument,
    formatEntryLine,
    formatMeetingLine,
    formatSnoozeLine,
    getLocalDateString,
    isSnoozeCommand,
    parseSnoozeInput,
} from './state';
import { getNotifier } from './notifier';
import { acquireLock, releaseLock } from './lock';
import { getCurrentMeeting } from './calendar';
import { getActiveMicApp } from './microphone';
import { loadConfig } from './config';

/** A call found via the mic has no known end, so re-check this often until it's over. */
const CALL_RECHECK_MINUTES = 5;

const CONFIG_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '.', CONFIG_DIR_NAME);
const LOCK_PATH = path.join(CONFIG_DIR, '.prompt.lock');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

const getTodayFilePath = (now: Date): string =>
    path.join(CONFIG_DIR, `${getLocalDateString(now)}.txt`);

const readLines = (filePath: string): string[] => {
    if (!fs.existsSync(filePath)) return [];
    return fs.readFileSync(filePath, 'utf8').split('\n');
};

const appendLine = (filePath: string, line: string): void => {
    fs.appendFileSync(filePath, `${line}\n`);
};

/**
 * @param clock source of the current time. Read once for the due check and
 *   again after the prompt returns, since the dialog can sit open for a long
 *   time (e.g. while the user is away) and snoozes/entries must be timed from
 *   when the user actually answered, not from when the dialog appeared.
 * @param forcePrompt bypass the due-time check and prompt immediately
 *   regardless of schedule (used by `--now`/manual invocation).
 */
export const runCheck = async (
    clock: () => Date = () => new Date(),
    forcePrompt = false,
): Promise<void> => {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });

    const now = clock();

    const filePath = getTodayFilePath(now);
    const lines = readLines(filePath);
    const due = computeDueState(lines, now);

    if (!due.isDue && !forcePrompt) return;

    // A prompt can stay open far longer than the 1-minute cron tick; without
    // this lock, every subsequent tick would spawn another overlapping
    // dialog until the first one was answered.
    if (!acquireLock(LOCK_PATH)) return;

    try {
        // WGD_SKIP_MEETING_CHECK keeps the e2e tests independent of the real calendar/mic.
        if (!forcePrompt && !process.env.WGD_SKIP_MEETING_CHECK) {
            const meeting = await getCurrentMeeting(now);
            if (meeting) {
                appendLine(filePath, formatMeetingLine(now, meeting.end, meeting.subject));
                return;
            }

            const micApp = loadConfig(CONFIG_PATH).micCheck ? await getActiveMicApp() : null;
            if (micApp) {
                const recheckAt = new Date(now.getTime() + CALL_RECHECK_MINUTES * 60000);
                appendLine(filePath, formatMeetingLine(now, recheckAt, `Call (mic in use: ${micApp})`));
                return;
            }
        }

        // Make sure the day file exists so the dialog's link to it opens
        // something even before the first entry of the day.
        fs.appendFileSync(filePath, '');

        const testResponse = process.env.WGD_TEST_RESPONSE;
        const response =
            testResponse !== undefined
                ? testResponse.length === 0
                    ? null
                    : testResponse
                : await getNotifier().prompt(
                      'What did you get done?',
                      'Describe what you accomplished:',
                      filePath,
                  );

        const answeredAt = clock();
        const answeredFilePath = getTodayFilePath(answeredAt);

        if (response === null) {
            // Dismissed: record an implicit 15-minute snooze so the prompt doesn't
            // reappear on every subsequent minute's check before the interval is up.
            const snoozeUntil = parseSnoozeInput('15', answeredAt)!;
            appendLine(answeredFilePath, formatSnoozeLine(answeredAt, snoozeUntil));
            return;
        }

        if (isSnoozeCommand(response)) {
            const snoozeUntil = parseSnoozeInput(extractSnoozeArgument(response), answeredAt);
            if (snoozeUntil) {
                appendLine(answeredFilePath, formatSnoozeLine(answeredAt, snoozeUntil));
            }
            return;
        }

        appendLine(answeredFilePath, formatEntryLine(answeredAt, response));
    } finally {
        releaseLock(LOCK_PATH);
    }
};

if (require.main === module) {
    const forcePrompt = process.argv.includes('--now') || process.argv.includes('--force');
    runCheck(undefined, forcePrompt).catch((err) => {
        console.error(err);
        process.exitCode = 1;
    });
}
