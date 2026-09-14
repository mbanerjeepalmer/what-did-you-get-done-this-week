import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { computeDueState, formatEntryLine, formatSnoozeLine } from './state';

test('day file round-trips through real filesystem I/O', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wgd-test-'));
    const filePath = path.join(dir, '2026-01-05.txt');

    const t1 = new Date('2026-01-05T09:00:00.000Z');
    fs.appendFileSync(filePath, `${formatEntryLine(t1, 'first entry')}\n`);

    const t2 = new Date('2026-01-05T09:15:00.000Z');
    const until = new Date('2026-01-05T09:30:00.000Z');
    fs.appendFileSync(filePath, `${formatSnoozeLine(t2, until)}\n`);

    const lines = fs.readFileSync(filePath, 'utf8').split('\n');

    const stillSnoozed = computeDueState(lines, new Date('2026-01-05T09:20:00.000Z'));
    assert.equal(stillSnoozed.isDue, false);
    assert.equal(stillSnoozed.totalMinutes, 15);

    const snoozeExpired = computeDueState(lines, new Date('2026-01-05T09:30:00.000Z'));
    assert.equal(snoozeExpired.isDue, true);

    fs.rmSync(dir, { recursive: true, force: true });
});
