import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// check.ts resolves its config dir from HOME at import time, so point HOME at
// a temp dir before requiring it.
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wgd-delay-'));
process.env.HOME = home;
process.env.USERPROFILE = home;
process.env.WGD_TEST_RESPONSE = 'snooze 15';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { runCheck } = require('./check') as typeof import('./check');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { computeDueState, getLocalDateString } = require('./state') as typeof import('./state');

test('snooze is timed from when the prompt was answered, not when it opened', async (t) => {
    t.after(() => fs.rmSync(home, { recursive: true, force: true }));

    const openedAt = new Date(2026, 8, 28, 10, 0, 0);
    const answeredAt = new Date(openedAt.getTime() + 30 * 60000); // user was away 30 min
    const times = [openedAt, answeredAt];
    await runCheck(() => times.shift() ?? answeredAt, true);

    const filePath = path.join(home, 'what-did-you-get-done-this-week', `${getLocalDateString(answeredAt)}.txt`);
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    const due = computeDueState(lines, answeredAt);

    assert.equal(due.isDue, false);
    assert.equal(due.nextPromptAt.getTime(), answeredAt.getTime() + 15 * 60000);
});
