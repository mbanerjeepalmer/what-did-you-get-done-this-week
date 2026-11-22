## 14 Sep 2026
- Meeting detection: prompt is now auto-skipped during Outlook meetings, via
  COM automation (no OAuth). See docs/meeting-detection.md.

## 11 Sep 2025
- Now writes from Argos

### Backlog
- [X] Notifications at intervals
- [ ] Notification is interactive
- [ ] Access written file from dropdown
- [X] Calendar integration (Outlook COM, not Google/Graph — see docs/meeting-detection.md)
- [ ] Focus Assist fallback for meeting detection when Outlook isn't running
- [ ] Backfill entries from calendar after a gap (laptop asleep, etc.)
- [ ] Backfill dropdown ("When: N min ago") on Windows and Linux; macOS has it (see `promptWithBackfill`)