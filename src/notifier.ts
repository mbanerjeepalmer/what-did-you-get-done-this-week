import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';

export interface Notifier {
    /** Shows a prompt and returns the user's text, or null if dismissed/cancelled. */
    prompt(title: string, text: string): Promise<string | null>;
}

const runCommand = (command: string, args: string[]): Promise<string> =>
    new Promise((resolve, reject) => {
        execFile(command, args, { windowsHide: true }, (error, stdout) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(stdout.toString());
        });
    });

const nullIfEmpty = (value: string): string | null => {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
};

// On native Windows, `powershell.exe` is always resolvable via PATH. From WSL
// it usually is too (interop appends the Windows PATH) -- except under cron,
// which runs with a minimal PATH that doesn't include it. Fall back to the
// well-known install location in that case rather than depending on PATH.
const WINDOWS_POWERSHELL_FALLBACK_PATHS = [
    '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
    '/mnt/c/WINDOWS/System32/WindowsPowerShell/v1.0/powershell.exe',
];

let resolvedPowershellPath: string | undefined;

export const resolvePowershellExecutable = (): string => {
    if (resolvedPowershellPath) return resolvedPowershellPath;
    if (process.platform === 'win32') {
        resolvedPowershellPath = 'powershell.exe';
        return resolvedPowershellPath;
    }
    const envPathHasIt = (process.env.PATH || '')
        .split(':')
        .some((dir) => {
            try {
                return fs.existsSync(path.join(dir, 'powershell.exe'));
            } catch {
                return false;
            }
        });
    if (envPathHasIt) {
        resolvedPowershellPath = 'powershell.exe';
        return resolvedPowershellPath;
    }
    resolvedPowershellPath =
        WINDOWS_POWERSHELL_FALLBACK_PATHS.find((p) => fs.existsSync(p)) ?? 'powershell.exe';
    return resolvedPowershellPath;
};

// A pre-registered AUMID that lets an unpackaged script raise a native toast
// under Windows PowerShell's own identity, with no shortcut/registration step.
const POWERSHELL_AUMID = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe';

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const escapePowershellSingleQuoted = (s: string) => s.replace(/'/g, "''");

export const runPowershellScript = (script: string): Promise<string> => {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    return runCommand(resolvePowershellExecutable(), [
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        encoded,
    ]);
};

/**
 * Fire-and-forget native Windows toast (Action Center) as a visual alert.
 * Note: Windows PowerShell cannot subscribe to WinRT toast events
 * ("Windows PowerShell cannot subscribe to Windows RT events"), so toast
 * action buttons can't reliably report back to this process -- this is
 * alert-only, matching notify-send's role in the original Linux design.
 * The WinForms dialog below is the guaranteed, working input path.
 */
const showNativeToast = async (title: string, text: string): Promise<void> => {
    const toastXml = `<toast scenario="reminder"><visual><binding template="ToastGeneric"><text>${escapeXml(
        title,
    )}</text><text>${escapeXml(text)}</text></binding></visual></toast>`;
    const script = [
        '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null',
        '[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null',
        '$xml = New-Object Windows.Data.Xml.Dom.XmlDocument',
        `$xml.LoadXml('${escapePowershellSingleQuoted(toastXml)}')`,
        '$toast = New-Object Windows.UI.Notifications.ToastNotification $xml',
        `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('${POWERSHELL_AUMID}').Show($toast)`,
    ].join('; ');
    await runPowershellScript(script);
};

/**
 * Native WinForms dialog (System.Windows.Forms ships with every Windows
 * install, no module install needed) with a text box and three explicit
 * buttons: Log / Snooze / Dismiss. `ShowDialog()` blocks until one is
 * clicked or the window is closed, so it stays on screen until dismissed.
 *
 * Snooze reuses the textbox: typing a duration ("30"), a time ("16:00"), or
 * anything else `parseSnoozeInput` accepts and clicking Snooze snoozes for
 * that; clicking Snooze with the textbox empty falls back to 15 minutes.
 */
const showWinFormsPrompt = async (
    title: string,
    text: string,
): Promise<{ action: 'log' | 'snooze' | 'dismiss'; text: string }> => {
    const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = '${escapePowershellSingleQuoted(title)}'
$form.Width = 420
$form.Height = 190
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.StartPosition = 'CenterScreen'
$form.TopMost = $true

$label = New-Object System.Windows.Forms.Label
$label.Text = '${escapePowershellSingleQuoted(text)}'
$label.SetBounds(10, 10, 385, 20)
$form.Controls.Add($label)

$textbox = New-Object System.Windows.Forms.TextBox
$textbox.SetBounds(10, 35, 385, 20)
$form.Controls.Add($textbox)

$hint = New-Object System.Windows.Forms.Label
$hint.Text = 'To snooze: enter a duration (30), a time (16:00), then click Snooze.'
$hint.SetBounds(10, 58, 385, 16)
$hint.ForeColor = [System.Drawing.Color]::Gray
$hint.Font = New-Object System.Drawing.Font($hint.Font.FontFamily, 7.5)
$form.Controls.Add($hint)

$script:wgdResult = $null

$btnLog = New-Object System.Windows.Forms.Button
$btnLog.Text = 'Log'
$btnLog.SetBounds(10, 95, 120, 30)
$btnLog.Add_Click({ $script:wgdResult = @{ Action = 'log'; Text = $textbox.Text }; $form.Close() })
$form.Controls.Add($btnLog)

$btnSnooze = New-Object System.Windows.Forms.Button
$btnSnooze.Text = 'Snooze'
$btnSnooze.SetBounds(140, 95, 120, 30)
$btnSnooze.Add_Click({ $script:wgdResult = @{ Action = 'snooze'; Text = $textbox.Text }; $form.Close() })
$form.Controls.Add($btnSnooze)

$btnDismiss = New-Object System.Windows.Forms.Button
$btnDismiss.Text = 'Dismiss'
$btnDismiss.SetBounds(270, 95, 120, 30)
$btnDismiss.Add_Click({ $script:wgdResult = @{ Action = 'dismiss'; Text = '' }; $form.Close() })
$form.Controls.Add($btnDismiss)

$form.AcceptButton = $btnLog
$form.Add_Shown({ $form.Activate(); $textbox.Focus() })
[void]$form.ShowDialog()

if ($null -eq $script:wgdResult) {
    # closed via the window's X button
    $script:wgdResult = @{ Action = 'dismiss'; Text = '' }
}

Write-Output "$($script:wgdResult.Action)|$($script:wgdResult.Text)"
`;

    const output = await runPowershellScript(script);
    const separatorIndex = output.indexOf('|');
    const action = (separatorIndex === -1 ? output : output.slice(0, separatorIndex)).trim();
    const responseText = separatorIndex === -1 ? '' : output.slice(separatorIndex + 1).trim();

    if (action === 'log' || action === 'snooze') {
        return { action, text: responseText };
    }
    return { action: 'dismiss', text: '' };
};

export class WindowsNotifier implements Notifier {
    async prompt(title: string, text: string): Promise<string | null> {
        await showNativeToast(title, text).catch(() => {});

        const result = await showWinFormsPrompt(title, text);

        if (result.action === 'dismiss') return null;
        if (result.action === 'snooze') {
            const duration = nullIfEmpty(result.text);
            return `snooze ${duration ?? '15'}`;
        }
        return nullIfEmpty(result.text);
    }
}

const FORMS_SEPARATOR = ''; // unlikely to appear in either field, unlike a visible character

export class LinuxNotifier implements Notifier {
    async prompt(title: string, text: string): Promise<string | null> {
        await runCommand('notify-send', [title, text]).catch(() => {
            // best-effort; zenity dialog below is the real prompt
        });
        try {
            const output = await runCommand('zenity', [
                '--forms',
                `--title=${title}`,
                `--text=${text}`,
                `--separator=${FORMS_SEPARATOR}`,
                '--add-entry=Response',
                '--add-entry=Or snooze for (e.g. 30, 16:00) — leave Response blank',
            ]);
            const [response, snooze] = output.split(FORMS_SEPARATOR);
            const snoozeArg = nullIfEmpty(snooze ?? '');
            if (snoozeArg) return `snooze ${snoozeArg}`;
            return nullIfEmpty(response ?? '');
        } catch {
            return null;
        }
    }
}

export class MacNotifier implements Notifier {
    async prompt(title: string, text: string): Promise<string | null> {
        const escape = (s: string) => s.replace(/"/g, '\\"');
        const hint = `${text} (to snooze: enter a duration or time, e.g. 30 or 16:00, then click Snooze)`;
        const script = `display dialog "${escape(hint)}" with title "${escape(
            title,
        )}" default answer "" buttons {"Dismiss", "Snooze", "Log"} default button "Log"`;
        try {
            const output = await runCommand('osascript', ['-e', script]);
            const buttonMatch = output.match(/button returned:([^,]*)/);
            const textMatch = output.match(/text returned:(.*)$/);
            const button = buttonMatch ? buttonMatch[1].trim() : 'Dismiss';
            const enteredText = textMatch ? textMatch[1] : '';

            if (button === 'Dismiss') return null;
            if (button === 'Snooze') {
                const duration = nullIfEmpty(enteredText);
                return `snooze ${duration ?? '15'}`;
            }
            return nullIfEmpty(enteredText);
        } catch {
            return null;
        }
    }
}

export const isWsl = (): boolean => {
    if (process.env.WSL_DISTRO_NAME) return true;
    try {
        return fs
            .readFileSync('/proc/version', 'utf8')
            .toLowerCase()
            .includes('microsoft');
    } catch {
        return false;
    }
};

export const getNotifier = (platform: NodeJS.Platform = process.platform): Notifier => {
    if (platform === 'win32') return new WindowsNotifier();
    if (platform === 'darwin') return new MacNotifier();
    if (platform === 'linux' && isWsl()) return new WindowsNotifier();
    return new LinuxNotifier();
};
