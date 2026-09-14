import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    computeDueState,
    extractSnoozeArgument,
    formatEntryLine,
    formatMeetingLine,
    formatSnoozeLine,
    formatTime,
    getLocalDateString,
    isSnoozeCommand,
    parseSnoozeInput,
} from './state';

test('getLocalDateString pads month/day', () => {
    assert.equal(getLocalDateString(new Date(2026, 0, 5)), '2026-01-05');
});

test('formatTime formats minutes as HHhMMm', () => {
    assert.equal(formatTime(0), '00h00m');
    assert.equal(formatTime(75), '01h15m');
    assert.equal(formatTime(600), '10h00m');
});

test('formatEntryLine / formatSnoozeLine round-trip parseable', () => {
    const now = new Date('2026-01-05T10:00:00.000Z');
    const entryLine = formatEntryLine(now, 'wrote some docs');
    assert.equal(entryLine, '2026-01-05T10:00:00.000Z\twrote some docs');

    const until = new Date('2026-01-05T10:15:00.000Z');
    const snoozeLine = formatSnoozeLine(now, until);
    assert.equal(snoozeLine, '2026-01-05T10:00:00.000Z\tSNOOZE UNTIL 2026-01-05T10:15:00.000Z');
});

// Scenario A: empty file -> due immediately.
test('computeDueState: no lines yet is due immediately', () => {
    const now = new Date('2026-01-05T10:00:00.000Z');
    const due = computeDueState([], now);
    assert.equal(due.isDue, true);
    assert.equal(due.totalMinutes, 0);
});

// Scenario A: responded, next prompt 15 min later, not due yet.
test('computeDueState: not due before 15 minutes since last entry', () => {
    const now = new Date('2026-01-05T10:10:00.000Z');
    const lines = ['2026-01-05T10:00:00.000Z\tdid a thing'];
    const due = computeDueState(lines, now);
    assert.equal(due.isDue, false);
    assert.equal(due.totalMinutes, 15);
});

test('computeDueState: due exactly at 15 minutes since last entry', () => {
    const now = new Date('2026-01-05T10:15:00.000Z');
    const lines = ['2026-01-05T10:00:00.000Z\tdid a thing'];
    const due = computeDueState(lines, now);
    assert.equal(due.isDue, true);
});

// Scenario C: late response reschedules 15 min after actual response time, not original schedule.
test('computeDueState: late response reschedules from the response time', () => {
    // User responded at 10:20 to a prompt that was "due" at 10:00.
    const lines = [
        '2026-01-05T09:45:00.000Z\tprevious thing',
        '2026-01-05T10:20:00.000Z\tresponded late',
    ];
    const notDueYet = computeDueState(lines, new Date('2026-01-05T10:30:00.000Z'));
    assert.equal(notDueYet.isDue, false);
    const dueNow = computeDueState(lines, new Date('2026-01-05T10:35:00.000Z'));
    assert.equal(dueNow.isDue, true);
});

// Scenario E: snoozed until 4pm suppresses prompts; waking early (clearing snooze) makes it due again.
test('computeDueState: snoozed suppresses prompt until snooze time', () => {
    const lines = [
        '2026-01-05T10:00:00.000Z\tSNOOZE UNTIL 2026-01-05T16:00:00.000Z',
    ];
    const stillSnoozed = computeDueState(lines, new Date('2026-01-05T15:00:00.000Z'));
    assert.equal(stillSnoozed.isDue, false);
    const snoozeExpired = computeDueState(lines, new Date('2026-01-05T16:00:00.000Z'));
    assert.equal(snoozeExpired.isDue, true);
});

test('computeDueState: snooze lines are excluded from totalMinutes', () => {
    const lines = [
        '2026-01-05T09:00:00.000Z\tdid a thing',
        '2026-01-05T09:15:00.000Z\tSNOOZE UNTIL 2026-01-05T09:30:00.000Z',
    ];
    const due = computeDueState(lines, new Date('2026-01-05T09:30:00.000Z'));
    assert.equal(due.totalMinutes, 15);
});

test('computeDueState: meeting lines suppress prompt until the meeting ends', () => {
    const now = new Date('2026-01-05T10:00:00.000Z');
    const until = new Date('2026-01-05T11:00:00.000Z');
    const lines = [formatMeetingLine(now, until, 'Planning')];

    const stillInMeeting = computeDueState(lines, new Date('2026-01-05T10:30:00.000Z'));
    assert.equal(stillInMeeting.isDue, false);

    const meetingOver = computeDueState(lines, until);
    assert.equal(meetingOver.isDue, true);
});

test('computeDueState: meeting lines are excluded from totalMinutes', () => {
    const now = new Date('2026-01-05T10:00:00.000Z');
    const lines = [
        '2026-01-05T09:00:00.000Z\tdid a thing',
        formatMeetingLine(now, new Date('2026-01-05T11:00:00.000Z'), 'Planning'),
    ];
    const due = computeDueState(lines, now);
    assert.equal(due.totalMinutes, 15);
});

test('formatMeetingLine includes the subject and end time', () => {
    const now = new Date('2026-01-05T10:00:00.000Z');
    const until = new Date('2026-01-05T11:00:00.000Z');
    assert.equal(
        formatMeetingLine(now, until, 'Planning'),
        '2026-01-05T10:00:00.000Z\tMEETING UNTIL 2026-01-05T11:00:00.000Z\tPlanning',
    );
});

test('isSnoozeCommand recognizes "snooze" prefix, case-insensitively', () => {
    assert.equal(isSnoozeCommand('snooze 30'), true);
    assert.equal(isSnoozeCommand('Snooze 16:00'), true);
    assert.equal(isSnoozeCommand('snoozed off for a nap'), false);
    assert.equal(isSnoozeCommand('wrote some docs'), false);
});

test('extractSnoozeArgument strips the snooze keyword', () => {
    assert.equal(extractSnoozeArgument('snooze 30'), '30');
    assert.equal(extractSnoozeArgument('Snooze 16:00'), '16:00');
});

test('parseSnoozeInput parses a minute count', () => {
    const now = new Date('2026-01-05T10:00:00.000Z');
    const result = parseSnoozeInput('30', now);
    assert.equal(result?.toISOString(), '2026-01-05T10:30:00.000Z');
});

test('parseSnoozeInput parses HH:MM later today', () => {
    const now = new Date(2026, 0, 5, 10, 0, 0);
    const result = parseSnoozeInput('16:00', now);
    assert.equal(result?.getHours(), 16);
    assert.equal(result?.getDate(), 5);
});

test('parseSnoozeInput rolls HH:MM over to tomorrow if already past', () => {
    const now = new Date(2026, 0, 5, 20, 0, 0);
    const result = parseSnoozeInput('16:00', now);
    assert.equal(result?.getHours(), 16);
    assert.equal(result?.getDate(), 6);
});

test('parseSnoozeInput returns null for garbage input', () => {
    const now = new Date('2026-01-05T10:00:00.000Z');
    assert.equal(parseSnoozeInput('not a time', now), null);
});
