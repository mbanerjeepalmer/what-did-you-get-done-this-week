import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { acquireLock, releaseLock } from './lock';

test('acquireLock succeeds when no lock file exists', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wgd-lock-'));
    const lockPath = path.join(dir, '.prompt.lock');
    assert.equal(acquireLock(lockPath), true);
    assert.equal(fs.readFileSync(lockPath, 'utf8').trim(), String(process.pid));
    fs.rmSync(dir, { recursive: true, force: true });
});

test('acquireLock fails while a live process holds the lock', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wgd-lock-'));
    const lockPath = path.join(dir, '.prompt.lock');
    // Our own process is definitely alive, so use our own pid to simulate
    // "another live process holds the lock".
    fs.writeFileSync(lockPath, String(process.pid));
    assert.equal(acquireLock(lockPath), false);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('acquireLock reclaims a stale lock left by a dead process', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wgd-lock-'));
    const lockPath = path.join(dir, '.prompt.lock');
    // PID 999999 is very unlikely to be a live process.
    fs.writeFileSync(lockPath, '999999');
    assert.equal(acquireLock(lockPath, process.pid), true);
    assert.equal(fs.readFileSync(lockPath, 'utf8').trim(), String(process.pid));
    fs.rmSync(dir, { recursive: true, force: true });
});

test('releaseLock removes the lock file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wgd-lock-'));
    const lockPath = path.join(dir, '.prompt.lock');
    acquireLock(lockPath);
    releaseLock(lockPath);
    assert.equal(fs.existsSync(lockPath), false);
});

test('releaseLock is a no-op if the lock file is already gone', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wgd-lock-'));
    const lockPath = path.join(dir, '.prompt.lock');
    assert.doesNotThrow(() => releaseLock(lockPath));
    fs.rmSync(dir, { recursive: true, force: true });
});
