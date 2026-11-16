import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMacOutlookScript, findCurrentMeeting, parseCalendarOutput } from './calendar';

test('parseCalendarOutput parses pipe-delimited lines, skipping blanks', () => {
    const output = [
        '2026-01-05T10:00:00.000Z|2026-01-05T10:30:00.000Z|Busy|Stand-up',
        '',
        '2026-01-05T11:00:00.000Z|2026-01-05T12:00:00.000Z|Tentative|Budget review | Q1',
        '   ',
    ].join('\n');

    const events = parseCalendarOutput(output);

    assert.equal(events.length, 2);
    assert.equal(events[0].subject, 'Stand-up');
    assert.equal(events[0].busyStatus, 'Busy');
    assert.equal(events[0].start.toISOString(), '2026-01-05T10:00:00.000Z');
    assert.equal(events[1].subject, 'Budget review | Q1');
});

test('parseCalendarOutput drops lines with unparseable dates', () => {
    const events = parseCalendarOutput('not-a-date|also-not|Busy|Broken');
    assert.equal(events.length, 0);
});

test('findCurrentMeeting picks the busy event covering `now`', () => {
    const events = parseCalendarOutput(
        [
            '2026-01-05T10:00:00.000Z|2026-01-05T10:30:00.000Z|Busy|Stand-up',
            '2026-01-05T11:00:00.000Z|2026-01-05T12:00:00.000Z|Busy|Planning',
        ].join('\n'),
    );

    const found = findCurrentMeeting(events, new Date('2026-01-05T11:30:00.000Z'));
    assert.equal(found?.subject, 'Planning');
});

test('findCurrentMeeting ignores events marked Free', () => {
    const events = parseCalendarOutput(
        '2026-01-05T10:00:00.000Z|2026-01-05T10:30:00.000Z|Free|Placeholder',
    );
    assert.equal(findCurrentMeeting(events, new Date('2026-01-05T10:15:00.000Z')), null);
});

test('findCurrentMeeting ignores everything but Busy', () => {
    const events = parseCalendarOutput(
        ['Free', 'Tentative', 'OutOfOffice', 'WorkingElsewhere']
            .map((status) => `2026-01-05T10:00:00.000Z|2026-01-05T10:30:00.000Z|${status}|${status} event`)
            .join('\n'),
    );
    assert.equal(findCurrentMeeting(events, new Date('2026-01-05T10:15:00.000Z')), null);
});

test('findCurrentMeeting returns null when nothing covers `now`', () => {
    const events = parseCalendarOutput(
        '2026-01-05T10:00:00.000Z|2026-01-05T10:30:00.000Z|Busy|Stand-up',
    );
    assert.equal(findCurrentMeeting(events, new Date('2026-01-05T09:00:00.000Z')), null);
});

test('buildMacOutlookScript embeds the range and keeps newlines/regex escapes valid JS', () => {
    const script = buildMacOutlookScript(new Date(1000), new Date(2000));
    assert.match(script, /new Date\(1000\)/);
    assert.doesNotThrow(() => new Function('Application', script)(() => ({ calendarEvents: { startTime: () => [], endTime: () => [], subject: () => [] } })));
});
