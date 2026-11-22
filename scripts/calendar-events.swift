import EventKit
import Foundation

// Prints today's relevant calendar events as `start|end|busyStatus|subject` (ISO 8601),
// matching what src/calendar.ts parses. Usage: calendar-events <startEpochMs> <endEpochMs>
// Reads macOS's calendar database, so it works with any account synced to Calendar.app
// (including Exchange / Microsoft 365), unlike the New Outlook which has no scripting API.
// Exits non-zero if calendar access isn't granted.

let args = CommandLine.arguments
guard args.count == 3, let startMs = Double(args[1]), let endMs = Double(args[2]) else {
    FileHandle.standardError.write("usage: calendar-events <startEpochMs> <endEpochMs>\n".data(using: .utf8)!)
    exit(64)
}

let store = EKEventStore()
let sem = DispatchSemaphore(value: 0)
var granted = false
store.requestFullAccessToEvents { ok, _ in granted = ok; sem.signal() }
if sem.wait(timeout: .now() + 30) == .timedOut || !granted {
    FileHandle.standardError.write("calendar access not granted\n".data(using: .utf8)!)
    exit(1)
}

let start = Date(timeIntervalSince1970: startMs / 1000)
let end = Date(timeIntervalSince1970: endMs / 1000)
let iso = ISO8601DateFormatter()
iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

for e in store.events(matching: store.predicateForEvents(withStart: start, end: end, calendars: nil)) {
    // All-day items (holidays, OOO markers) would suppress the prompt all day; cancelled/declined aren't meetings.
    if e.isAllDay || e.status == .canceled { continue }
    if let me = e.attendees?.first(where: { $0.isCurrentUser }), me.participantStatus == .declined { continue }
    let busy: String
    switch e.availability {
    case .free: busy = "Free"
    case .tentative: busy = "Tentative"
    case .unavailable: busy = "OutOfOffice"
    default: busy = "Busy"
    }
    let subject = (e.title ?? "").replacingOccurrences(of: "\n", with: " ").replacingOccurrences(of: "\r", with: " ")
    print("\(iso.string(from: e.startDate))|\(iso.string(from: e.endDate))|\(busy)|\(subject)")
}
