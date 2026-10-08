import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, parseConfig } from './config';

test('parseConfig defaults micCheck to off', () => {
    assert.deepEqual(parseConfig({}), { micCheck: false });
    assert.deepEqual(parseConfig(null), { micCheck: false });
});

test('parseConfig honours a boolean micCheck and ignores other types', () => {
    assert.equal(parseConfig({ micCheck: true }).micCheck, true);
    assert.equal(parseConfig({ micCheck: 'yes' }).micCheck, false);
});

test('loadConfig falls back to defaults when the file is missing', () => {
    assert.deepEqual(loadConfig('/nonexistent/config.json'), { micCheck: false });
});
