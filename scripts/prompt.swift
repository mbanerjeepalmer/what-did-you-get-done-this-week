import AppKit

// Native prompt window, the macOS counterpart of the WinForms dialog in notifier.ts.
// Usage: prompt <title> <text> [filePath] [backfillMinutes]
// backfillMinutes is a comma list (e.g. "5,10,15"); if given, a "When" dropdown offers
// those "N min ago" choices so an entry can be backdated after being away.
// Prints `log|<minutesAgo>|<text>`, `snooze|0|<text>` or `dismiss|0|` to stdout, then exits.
//
// `display dialog` can't be positioned, so this is a panel pinned to the bottom
// right of the main screen's visible area. It's non-activating (like the Windows
// version's WS_EX_NOACTIVATE): it appears without stealing keyboard focus from
// whatever you're typing in, and only becomes key (and takes Enter) once you click it.

let args = CommandLine.arguments
let titleText = args.count > 1 ? args[1] : "What did you get done?"
let bodyText = args.count > 2 ? args[2] : "Describe what you accomplished:"
let filePath: String? = args.count > 3 && !args[3].isEmpty ? args[3] : nil
let backfillOptions: [Int] = args.count > 4
    ? args[4].split(separator: ",").compactMap { Int($0) }.filter { $0 > 0 } : []

final class Panel: NSPanel {
    // Refuse key status until the user deliberately clicks the panel, so a stray
    // Enter (meant for the app they were typing in) can't hit the default Log button.
    var allowKey = false
    override var canBecomeKey: Bool { allowKey }
    override func sendEvent(_ event: NSEvent) {
        if event.type == .leftMouseDown && !allowKey {
            allowKey = true
            NSApp.activate(ignoringOtherApps: true)
            makeKey()
        }
        super.sendEvent(event)
    }
}

final class Controller: NSObject, NSWindowDelegate {
    var field: NSTextField!
    var whenPopup: NSPopUpButton?
    var finished = false

    /// Minutes ago chosen in the dropdown (0 = "Just now" or no dropdown).
    var minutesAgo: Int {
        guard let p = whenPopup else { return 0 }
        let i = p.indexOfSelectedItem
        return i > 0 && i <= backfillOptions.count ? backfillOptions[i - 1] : 0
    }

    func finish(_ action: String, _ text: String, minutes: Int = 0) {
        if finished { return }
        finished = true
        print("\(action)|\(minutes)|\(text.replacingOccurrences(of: "\n", with: " "))")
        fflush(stdout)
        exit(0)
    }
    @objc func log() { finish("log", field.stringValue, minutes: minutesAgo) }
    @objc func snooze() { finish("snooze", field.stringValue) }
    @objc func dismiss() { finish("dismiss", "") }
    @objc func openFile() {
        if let p = filePath { NSWorkspace.shared.open(URL(fileURLWithPath: p)) }
    }
    func windowWillClose(_ notification: Notification) { finish("dismiss", "") }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let controller = Controller()

// The dropdown row, when offered, pushes everything below it down.
let dy: CGFloat = backfillOptions.isEmpty ? 0 : 30
let width: CGFloat = 420, height: CGFloat = 190 + dy, margin: CGFloat = 20
let panel = Panel(
    contentRect: NSRect(x: 0, y: 0, width: width, height: height),
    styleMask: [.titled, .closable, .nonactivatingPanel],
    backing: .buffered, defer: false)
panel.title = titleText
panel.level = .floating
panel.hidesOnDeactivate = false
panel.isReleasedWhenClosed = false
panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
panel.delegate = controller

let screen = NSScreen.main ?? NSScreen.screens[0]
let area = screen.visibleFrame
panel.setFrameOrigin(NSPoint(x: area.maxX - panel.frame.width - margin, y: area.minY + margin))

let content = panel.contentView!
func label(_ s: String, _ rect: NSRect, size: CGFloat = 13, gray: Bool = false) -> NSTextField {
    let l = NSTextField(labelWithString: s)
    l.frame = rect
    l.font = NSFont.systemFont(ofSize: size)
    if gray { l.textColor = .secondaryLabelColor }
    return l
}
// Content coordinates are bottom-up: y = height - top - h
content.addSubview(label(bodyText, NSRect(x: 12, y: height - 30, width: 396, height: 18)))

let field = NSTextField(frame: NSRect(x: 12, y: height - 58, width: 396, height: 24))
controller.field = field
field.target = controller
field.action = #selector(Controller.log)
content.addSubview(field)

if !backfillOptions.isEmpty {
    let fmt = DateFormatter()
    fmt.dateFormat = "HH:mm"
    content.addSubview(label("When:", NSRect(x: 12, y: height - 86, width: 44, height: 18)))
    let popup = NSPopUpButton(frame: NSRect(x: 58, y: height - 90, width: 200, height: 24), pullsDown: false)
    popup.addItem(withTitle: "Just now")
    for m in backfillOptions {
        let t = fmt.string(from: Date().addingTimeInterval(-Double(m) * 60))
        popup.addItem(withTitle: "\(m) min ago (\(t))")
    }
    controller.whenPopup = popup
    content.addSubview(popup)
}

content.addSubview(label("To snooze: enter a duration (30), a time (16:00), then click Snooze.",
                         NSRect(x: 12, y: height - 80 - dy, width: 396, height: 16), size: 10.5, gray: true))

if let p = filePath {
    let link = NSButton(frame: NSRect(x: 12, y: height - 102 - dy, width: 396, height: 16))
    link.isBordered = false
    link.alignment = .left
    link.attributedTitle = NSAttributedString(
        string: "Open \((p as NSString).lastPathComponent)",
        attributes: [.foregroundColor: NSColor.linkColor, .underlineStyle: NSUnderlineStyle.single.rawValue,
                     .font: NSFont.systemFont(ofSize: 11)])
    link.target = controller
    link.action = #selector(Controller.openFile)
    content.addSubview(link)
}

func button(_ title: String, _ x: CGFloat, _ action: Selector, primary: Bool = false) {
    let b = NSButton(title: title, target: controller, action: action)
    b.frame = NSRect(x: x, y: 14, width: 124, height: 30)
    b.bezelStyle = .rounded
    if primary { b.keyEquivalent = "\r" }
    content.addSubview(b)
}
button("Dismiss", 12, #selector(Controller.dismiss))
button("Snooze", 148, #selector(Controller.snooze))
button("Log", 284, #selector(Controller.log), primary: true)

panel.initialFirstResponder = nil
panel.makeFirstResponder(nil)
panel.orderFrontRegardless()
app.run()
