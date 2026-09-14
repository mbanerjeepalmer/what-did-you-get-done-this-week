import * as fs from 'fs';
import * as path from 'path';
import { CONFIG_DIR_NAME, formatSnoozeLine, getLocalDateString, parseSnoozeInput } from './state';

const CONFIG_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '.', CONFIG_DIR_NAME);

/**
 * Writes a snooze line directly to today's file, without waiting for a
 * prompt to appear. Accepts anything `parseSnoozeInput` does: a minute
 * count ("30"), an HH:MM time, or a parseable date string.
 */
export const runSnooze = (input: string, now: Date = new Date()): Date | null => {
    const until = parseSnoozeInput(input, now);
    if (!until) return null;

    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    const filePath = path.join(CONFIG_DIR, `${getLocalDateString(now)}.txt`);
    fs.appendFileSync(filePath, `${formatSnoozeLine(now, until)}\n`);
    return until;
};

if (require.main === module) {
    const arg = process.argv.slice(2).join(' ').trim();
    if (!arg) {
        console.error('Usage: snooze <minutes|HH:MM|date>  (e.g. "30", "16:00")');
        process.exit(1);
    }

    const until = runSnooze(arg);
    if (!until) {
        console.error(`Could not parse snooze time: "${arg}"`);
        process.exit(1);
    }

    console.log(`Snoozed until ${until.toLocaleString()}`);
}
