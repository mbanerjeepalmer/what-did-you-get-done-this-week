import { runPowershellScript } from './notifier';

/**
 * Catches calls that aren't on the calendar (ad-hoc Teams/Zoom calls, or
 * invites on a calendar other than the default one), which calendar.ts can't see.
 *
 * Windows records every app's microphone use under the CapabilityAccessManager
 * consent store: `LastUsedTimeStart`/`LastUsedTimeStop` as FILETIMEs, with
 * `LastUsedTimeStop` set to 0 while the app is still holding the mic. Packaged
 * apps (e.g. new Teams, "MSTeams_8wekyb3d8bbwe") sit directly under the key;
 * classic desktop apps (e.g. Zoom.exe) sit under its "NonPackaged" subkey, so
 * the search recurses.
 */
const MIC_USAGE_SCRIPT = `
$base = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone'
Get-ChildItem $base -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
    $p = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
    if ($p.PSObject.Properties.Name -contains 'LastUsedTimeStop') {
        "$($_.PSChildName)|$($p.LastUsedTimeStart)|$($p.LastUsedTimeStop)"
    }
}
`;

/** Pure: names of apps the `app|start|stop` lines show as currently holding the mic. */
export const parseActiveMicApps = (output: string): string[] =>
    output
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => line.split('|'))
        .filter(([, start, stop]) => start !== undefined && start !== '0' && stop === '0')
        .map(([app]) => app.split('#').pop()!);

/**
 * Name of an app currently using the microphone, or null if none.
 * Fails open (returns null) on any error, like getCurrentMeeting.
 */
export const getActiveMicApp = async (): Promise<string | null> => {
    try {
        return parseActiveMicApps(await runPowershellScript(MIC_USAGE_SCRIPT))[0] ?? null;
    } catch {
        return null;
    }
};
