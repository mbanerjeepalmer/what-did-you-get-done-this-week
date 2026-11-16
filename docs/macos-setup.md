# macOS setup

The tool auto-detects macOS (`process.platform === 'darwin'`); nothing needs
configuring. This page lists what must be in place, split into what the
**running tool** needs and what **development/verification** needs.

## Running the tool

| Requirement | Why | How |
| --- | --- | --- |
| Node (e.g. via nvm) | runs `dist/check.js` | `nvm install`; `npm start` records the node path in the launchd plist |
| Xcode Command Line Tools (`swiftc`) | `npm run build` compiles the helpers in `scripts/*.swift` | `xcode-select --install`. Without it the helpers are skipped: no menu bar icon, no mic check, no calendar check, and the prompt falls back to a plain `osascript` dialog |
| Work calendar synced to Calendar.app | meeting detection reads Calendar via EventKit (the New Outlook has no scripting API) | System Settings > Internet Accounts > Microsoft Exchange |
| Calendar permission for **`dist/launcher`** | EventKit access | Allow the prompt on first run. Under launchd `node` can't prompt (hardened runtime), so launchd starts `dist/launcher`, which spawns node and holds the grant. Reset with `tccutil reset Calendar` if needed |

Install with `npm start` (build + launchd agents), stop with `npm run stop`.
Two agents are installed in `~/Library/LaunchAgents`:

- `com.mbanerjeepalmer.what-did-you-get-done-this-week`: runs the check every minute via `dist/launcher`
- `com.mbanerjeepalmer.what-did-you-get-done-this-week.menubar`: the menu bar icon (click = prompt now, right-click = open today's file / quit)

Logs: `~/.what-did-you-get-done-this-week.log`. Entries: `~/what-did-you-get-done-this-week/`.

The mic check (`"micCheck": true` in `config.json`) needs no permission, but
can only say the default input device is in use, not which app.

## Development and verification only

None of these are needed to *run* the tool. They were needed for an agent
(or you) to drive the UI in automated tests, and can be revoked afterwards.

| Permission (for the terminal app, e.g. Terminal) | Used for |
| --- | --- |
| Accessibility | clicking prompt buttons / typing into it via System Events |
| Screen Recording | `screencapture` to check where the prompt appears |
| Automation (to System Events) | the same UI scripting |
| Calendar | running the EventKit helper directly from a shell |

Grant in System Settings > Privacy & Security, then **quit and reopen the
terminal**. Revoke with, e.g. for Terminal:

```sh
tccutil reset Accessibility com.apple.Terminal
tccutil reset ScreenCapture com.apple.Terminal
tccutil reset AppleEvents com.apple.Terminal
tccutil reset Calendar com.apple.Terminal
```

### Testing tips

- Always wrap UI-driving commands in `timeout`: a dialog nobody clicks blocks forever.
- Test against a throwaway `HOME` so real day files aren't polluted. `check.js`, the menu bar app and `lock.ts` all honour `$HOME`.
- Drive the prompt with `tell process "prompt"` (`set value of text field 1 of window 1`, `click button "Log" of window 1`); use `tell process "osascript"` for the fallback dialog.
- The TCC log explains silent permission failures:
  `log show --last 2m --predicate 'subsystem == "com.apple.TCC"'`.
