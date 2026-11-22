import Foundation

// Runs its arguments as a child process and exits with the child's status.
// launchd starts this instead of `node` directly: macOS attributes Calendar
// permission to the "responsible" process, and node (hardened runtime, no
// calendar entitlement) is never allowed to even prompt for it. This binary
// carries an Info.plist usage description, so it can be granted access once.
let args = Array(CommandLine.arguments.dropFirst())
guard let exe = args.first else { exit(64) }
let p = Process()
p.executableURL = URL(fileURLWithPath: exe)
p.arguments = Array(args.dropFirst())
do { try p.run() } catch { exit(127) }
p.waitUntilExit()
exit(p.terminationStatus)
