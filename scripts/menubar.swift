import AppKit

// Menu bar item showing minutes until the next prompt (negative once overdue, via
// `node dist/status.js`). Clicking it pops the prompt right now (`node dist/check.js --now`).
// Right-click / ctrl-click for the menu.
// Usage: menubar <nodePath> <checkJsPath>   (started by launchd; see schedule.js)

let args = CommandLine.arguments
guard args.count == 3 else {
    FileHandle.standardError.write("usage: menubar <nodePath> <checkJsPath>\n".data(using: .utf8)!)
    exit(64)
}
let nodePath = args[1], checkJs = args[2]
let statusJs = (checkJs as NSString).deletingLastPathComponent + "/status.js"

final class Controller: NSObject {
    let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    let menu = NSMenu()
    var running: Process?

    override init() {
        super.init()
        if let b = item.button {
            b.font = NSFont.monospacedDigitSystemFont(ofSize: NSFont.systemFontSize, weight: .regular)
            b.title = "–"
            b.toolTip = "Minutes until the next prompt (negative = overdue). Click to log now"
            b.target = self
            b.action = #selector(clicked)
            b.sendAction(on: [.leftMouseUp, .rightMouseUp])
        }
        let open = NSMenuItem(title: "Open today's file", action: #selector(openToday), keyEquivalent: "")
        open.target = self
        menu.addItem(open)
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        refresh()
        // Common run-loop mode so it keeps ticking while a menu is open.
        let timer = Timer(timeInterval: 15, repeats: true) { [weak self] _ in self?.refresh() }
        RunLoop.main.add(timer, forMode: .common)
    }

    /// Asks `status.js` how many minutes until the next prompt and shows it as the title.
    func refresh() {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: nodePath)
        p.arguments = [statusJs]
        let pipe = Pipe()
        p.standardOutput = pipe
        p.standardError = FileHandle.nullDevice
        p.terminationHandler = { [weak self] proc in
            let out = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            let n = proc.terminationStatus == 0 ? Int(out.trimmingCharacters(in: .whitespacesAndNewlines)) : nil
            DispatchQueue.main.async { self?.item.button?.title = n.map { String($0) } ?? "–" }
        }
        try? p.run()
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
        p.terminationHandler = { [weak self] _ in DispatchQueue.main.async { self?.refresh() } }
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
