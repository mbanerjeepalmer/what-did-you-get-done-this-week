import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseActiveMicApps } from './microphone';

test('parseActiveMicApps returns only apps whose LastUsedTimeStop is 0', () => {
    const output = [
        'MSTeams_8wekyb3d8bbwe|134358390094631672|0',
        'Microsoft.WindowsSoundRecorder_8wekyb3d8bbwe|134328244263255732|134328244332145363',
        'C:#Users#someone#AppData#Roaming#Zoom#bin#Zoom.exe|134351534380828542|0',
        'NeverUsed|0|0',
        '',
    ].join('\n');

    assert.deepEqual(parseActiveMicApps(output), ['MSTeams_8wekyb3d8bbwe', 'Zoom.exe']);
});

test('parseActiveMicApps returns nothing when no app holds the mic', () => {
    assert.deepEqual(parseActiveMicApps('MSTeams_8wekyb3d8bbwe|1|2\n'), []);
});
