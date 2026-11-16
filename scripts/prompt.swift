import AppKit

// Native prompt window, the macOS counterpart of the WinForms dialog in notifier.ts.
// Usage: prompt <title> <text> [filePath]
// Prints `log|<text>`, `snooze|<text>` or `dismiss|` to stdout, then exits.
//
// `display dialog` can't be positioned, so this is a panel pinned to the bottom
// right of the main screen's visible area. It's non-activating (like the Windows
// version's WS_EX_NOACTIVATE): it appears without stealing keyboard focus from
// whatever you're typing in, and only takes keys once you click into it.

let args = CommandLine.arguments
let titleText = args.count > 1 ? args[1] : "What did you get done?"
let bodyText = args.count > 2 ? args[2] : "Describe what you accomplished:"
let filePath: String? = args.count > 3 && !args[3].isEmpty ? args[3] : nil

final class Panel: NSPanel {
    override var canBecomeKey: Bool { true }
}

final class Controller: NSObject, NSWindowDelegate {
    var field: NSTextField!
    var finished = false

    func finish(_ action: String, _ text: String) {
        if finished { return }
        finished = true
        print("\(action)|\(text.replacingOccurrences(of: "\n", with: " "))")
        fflush(stdout)
        exit(0)
    }
    @objc func log() { finish("log", field.stringValue) }
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

let width: CGFloat = 420, height: CGFloat = 190, margin: CGFloat = 20
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

content.addSubview(label("To snooze: enter a duration (30), a time (16:00), then click Snooze.",
                         NSRect(x: 12, y: height - 80, width: 396, height: 16), size: 10.5, gray: true))

if let p = filePath {
    let link = NSButton(frame: NSRect(x: 12, y: height - 102, width: 396, height: 16))
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

panel.orderFrontRegardless()
app.run()
