import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';
import { getLocalDateString } from './state';

const SNOOZE_JS = path.join(__dirname, 'snooze.js');

const runSnooze = (home: string, arg: string): string => {
    return execFileSync(process.execPath, [SNOOZE_JS, arg], {
        env: { ...process.env, HOME: home, USERPROFILE: home },
    }).toString();
};

const readTodayFile = (home: string): string[] => {
    const today = getLocalDateString(new Date());
    const filePath = path.join(home, 'what-did-you-get-done-this-week', `${today}.txt`);
    if (!fs.existsSync(filePath)) return [];
    return fs.readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean);
};

test('snooze CLI writes a SNOOZE line for a minute count', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wgd-snooze-'));
    try {
        const output = runSnooze(home, '30');
        assert.match(output, /^Snoozed until/);

        const lines = readTodayFile(home);
        assert.equal(lines.length, 1);
        assert.match(lines[0], /SNOOZE UNTIL/);
    } finally {
        fs.rmSync(home, { recursive: true, force: true });
    }
});

test('snooze CLI exits non-zero and writes nothing for unparseable input', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wgd-snooze-'));
    try {
        assert.throws(() => runSnooze(home, 'not a time'));
        assert.deepEqual(readTodayFile(home), []);
    } finally {
        fs.rmSync(home, { recursive: true, force: true });
    }
});
