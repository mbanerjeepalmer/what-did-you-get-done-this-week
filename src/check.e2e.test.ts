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
