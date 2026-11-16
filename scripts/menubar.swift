import AppKit

// Menu bar icon: clicking it pops the "what did you get done" prompt right now
// (runs `node dist/check.js --now`). Right-click / ctrl-click for the menu.
// Usage: menubar <nodePath> <checkJsPath>   (started by launchd; see schedule.js)

let args = CommandLine.arguments
guard args.count == 3 else {
    FileHandle.standardError.write("usage: menubar <nodePath> <checkJsPath>\n".data(using: .utf8)!)
    exit(64)
}
let nodePath = args[1], checkJs = args[2]

final class Controller: NSObject {
    let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    let menu = NSMenu()
    var running: Process?

    override init() {
        super.init()
        if let b = item.button {
            b.image = NSImage(systemSymbolName: "checkmark.circle", accessibilityDescription: "What did you get done?")
            b.toolTip = "What did you get done? Click to log now"
            b.target = self
            b.action = #selector(clicked)
            b.sendAction(on: [.leftMouseUp, .rightMouseUp])
        }
        let open = NSMenuItem(title: "Open today's file", action: #selector(openToday), keyEquivalent: "")
        open.target = self
        menu.addItem(open)
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
    }

    @objc func clicked() {
        let e = NSApp.currentEvent
        if e?.type == .rightMouseUp || e?.modifierFlags.contains(.control) == true {
            item.menu = menu
            item.button?.performClick(nil)
            item.menu = nil
        } else {
            logNow()
        }
    }

    func logNow() {
        if let r = running, r.isRunning { return } // a prompt is already open
        let p = Process()
        p.executableURL = URL(fileURLWithPath: nodePath)
        p.arguments = [checkJs, "--now"]
        try? p.run()
        running = p
    }

    @objc func openToday() {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        let path = NSHomeDirectory() + "/what-did-you-get-done-this-week/\(f.string(from: Date())).txt"
        NSWorkspace.shared.open(URL(fileURLWithPath: path))
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let controller = Controller()
app.run()
