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

const CONFIG_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '.', CONFIG_DIR_NAME);
const LOCK_PATH = path.join(CONFIG_DIR, '.prompt.lock');

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
 * @param forcePrompt bypass the due-time check and prompt immediately
 *   regardless of schedule (used by `--now`/manual invocation).
 */
export const runCheck = async (now: Date = new Date(), forcePrompt = false): Promise<void> => {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });

    const filePath = getTodayFilePath(now);
    const lines = readLines(filePath);
    const due = computeDueState(lines, now);

    if (!due.isDue && !forcePrompt) return;

    // A prompt can stay open far longer than the 1-minute cron tick; without
    // this lock, every subsequent tick would spawn another overlapping
    // dialog until the first one was answered.
    if (!acquireLock(LOCK_PATH)) return;

    try {
        if (!forcePrompt) {
            const meeting = await getCurrentMeeting(now);
            if (meeting) {
                appendLine(filePath, formatMeetingLine(now, meeting.end, meeting.subject));
                return;
            }
        }

        const testResponse = process.env.WGD_TEST_RESPONSE;
        const response =
            testResponse !== undefined
                ? testResponse.length === 0
                    ? null
                    : testResponse
                : await getNotifier().prompt(
                      'What did you get done?',
                      'Describe what you accomplished:',
                  );

        if (response === null) {
            // Dismissed: record an implicit 15-minute snooze so the prompt doesn't
            // reappear on every subsequent minute's check before the interval is up.
            const snoozeUntil = parseSnoozeInput('15', now)!;
            appendLine(filePath, formatSnoozeLine(now, snoozeUntil));
            return;
        }

        if (isSnoozeCommand(response)) {
            const snoozeUntil = parseSnoozeInput(extractSnoozeArgument(response), now);
            if (snoozeUntil) {
                appendLine(filePath, formatSnoozeLine(now, snoozeUntil));
            }
            return;
        }

        appendLine(filePath, formatEntryLine(now, response));
    } finally {
        releaseLock(LOCK_PATH);
    }
};

if (require.main === module) {
    const forcePrompt = process.argv.includes('--now') || process.argv.includes('--force');
    runCheck(new Date(), forcePrompt).catch((err) => {
        console.error(err);
        process.exitCode = 1;
    });
}
