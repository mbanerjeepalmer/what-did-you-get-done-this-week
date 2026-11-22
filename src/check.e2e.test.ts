import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';
import { getLocalDateString } from './state';

const CHECK_JS = path.join(__dirname, 'check.js');

const runCheck = (home: string, testResponse: string | undefined): void => {
    execFileSync(process.execPath, [CHECK_JS], {
        env: { ...process.env, HOME: home, USERPROFILE: home, WGD_SKIP_MEETING_CHECK: '1', WGD_TEST_RESPONSE: testResponse },
    });
};

const readTodayFile = (home: string): string[] => {
    const today = getLocalDateString(new Date());
    const filePath = path.join(home, 'what-did-you-get-done-this-week', `${today}.txt`);
    if (!fs.existsSync(filePath)) return [];
    return fs.readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean);
};

test('e2e: responding writes an entry line', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wgd-e2e-'));
    try {
        runCheck(home, 'wrote the quarterly report');
        const lines = readTodayFile(home);
        assert.equal(lines.length, 1);
        assert.match(lines[0], /\twrote the quarterly report$/);
    } finally {
        fs.rmSync(home, { recursive: true, force: true });
    }
});

test('e2e: "snooze 5" writes a SNOOZE line and suppresses the next check', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wgd-e2e-'));
    try {
        runCheck(home, 'snooze 5');
        const lines = readTodayFile(home);
        assert.equal(lines.length, 1);
        assert.match(lines[0], /SNOOZE UNTIL/);

        // Running again immediately must not prompt/write again since we're
        // still within the snooze window (WGD_TEST_RESPONSE unset would hang
        // waiting for a real GUI if it *did* try to prompt, so this also
        // proves no prompt was attempted).
        execFileSync(process.execPath, [CHECK_JS], {
            env: { ...process.env, HOME: home, USERPROFILE: home, WGD_SKIP_MEETING_CHECK: '1', WGD_TEST_RESPONSE: undefined },
            timeout: 5000,
        });
        const linesAfter = readTodayFile(home);
        assert.equal(linesAfter.length, 1);
    } finally {
        fs.rmSync(home, { recursive: true, force: true });
    }
});

test('e2e: empty response is treated as dismiss and implicitly snoozes 15 minutes', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wgd-e2e-'));
    try {
        runCheck(home, '');
        const lines = readTodayFile(home);
        assert.equal(lines.length, 1);
        assert.match(lines[0], /SNOOZE UNTIL/);
    } finally {
        fs.rmSync(home, { recursive: true, force: true });
    }
});

test('e2e: backfilled entry is timestamped minutesAgo earlier, capped at how overdue the prompt is', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wgd-e2e-'));
    try {
        const dir = path.join(home, 'what-did-you-get-done-this-week');
        fs.mkdirSync(dir, { recursive: true });
        // Last entry 45 minutes ago => the prompt (15-minute interval) is 30 minutes overdue.
        const lastEntry = new Date(Date.now() - 45 * 60000);
        fs.writeFileSync(path.join(dir, `${getLocalDateString(new Date())}.txt`), `${lastEntry.toISOString()}\tearlier\n`);

        const run = (minutesAgo: string) =>
            execFileSync(process.execPath, [CHECK_JS, '--now'], {
                env: { ...process.env, HOME: home, USERPROFILE: home, WGD_SKIP_MEETING_CHECK: '1', WGD_TEST_RESPONSE: 'discussing x', WGD_TEST_MINUTES_AGO: minutesAgo },
            });

        run('999'); // far more than allowed: capped to the 30 minutes overdue
        const lines = readTodayFile(home);
        assert.equal(lines.length, 2);
        const [stamp, text] = lines[1].split('\t');
        assert.equal(text, 'discussing x');
        const agoMinutes = (Date.now() - new Date(stamp).getTime()) / 60000;
        assert.ok(agoMinutes > 29.5 && agoMinutes < 31, `expected ~30 minutes ago, got ${agoMinutes}`);
    } finally {
        fs.rmSync(home, { recursive: true, force: true });
    }
});
