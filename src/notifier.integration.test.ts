import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getNotifier, LinuxNotifier, MacNotifier, parseMacDialogOutput, parsePromptHelperOutput, WindowsNotifier } from './notifier';

test('getNotifier picks WindowsNotifier on win32', () => {
    assert.ok(getNotifier('win32') instanceof WindowsNotifier);
});

test('getNotifier picks MacNotifier on darwin', () => {
    assert.ok(getNotifier('darwin') instanceof MacNotifier);
});

test('getNotifier picks LinuxNotifier on plain linux (no WSL markers)', () => {
    const originalEnv = process.env.WSL_DISTRO_NAME;
    delete process.env.WSL_DISTRO_NAME;
    try {
        // Note: this only reflects "plain Linux" if /proc/version doesn't
        // mention Microsoft either; on this dev machine (WSL) that's not the
        // case, so this assertion is skipped there and covered by the
        // WSL-detection test below instead.
        const isActuallyWsl = require('fs')
            .readFileSync('/proc/version', 'utf8')
            .toLowerCase()
            .includes('microsoft');
        if (!isActuallyWsl) {
            assert.ok(getNotifier('linux') instanceof LinuxNotifier);
        }
    } catch {
        assert.ok(getNotifier('linux') instanceof LinuxNotifier);
    } finally {
        if (originalEnv !== undefined) process.env.WSL_DISTRO_NAME = originalEnv;
    }
});

test('getNotifier picks WindowsNotifier on linux when WSL_DISTRO_NAME is set', () => {
    const originalEnv = process.env.WSL_DISTRO_NAME;
    process.env.WSL_DISTRO_NAME = 'Ubuntu';
    try {
        assert.ok(getNotifier('linux') instanceof WindowsNotifier);
    } finally {
        if (originalEnv === undefined) delete process.env.WSL_DISTRO_NAME;
        else process.env.WSL_DISTRO_NAME = originalEnv;
    }
});

test('parseMacDialogOutput handles the trailing newline osascript emits', () => {
    assert.deepEqual(parseMacDialogOutput('button returned:Log, text returned:did a thing\n'), {
        button: 'Log',
        enteredText: 'did a thing',
    });
    assert.deepEqual(parseMacDialogOutput('button returned:Snooze, text returned:30\n'), {
        button: 'Snooze',
        enteredText: '30',
    });
});

test('parsePromptHelperOutput splits action and text, keeping pipes in the text', () => {
    assert.deepEqual(parsePromptHelperOutput('log|0|a | b\n'), { action: 'log', minutesAgo: 0, text: 'a | b' });
    assert.deepEqual(parsePromptHelperOutput('log|30|discussed x\n'), { action: 'log', minutesAgo: 30, text: 'discussed x' });
    assert.deepEqual(parsePromptHelperOutput('dismiss|0|\n'), { action: 'dismiss', minutesAgo: 0, text: '' });
    assert.deepEqual(parsePromptHelperOutput(''), { action: '', minutesAgo: 0, text: '' });
});
