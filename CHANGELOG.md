# Changelog

## 0.1.9

**New**
- **In-app updates** — when a new version is out you get a badge on the home and assistant screens; open it for the changelog and a one-click Homebrew update that runs right in the popup, then restarts into the new version.
- **Search every conversation** (⌘⇧P) — full-text search across all your Claude transcripts, scoped to one assistant or all projects, with jump-to-match and every hit highlighted.
- **Shift+Enter** inserts a newline in Claude (instead of sending).
- The app now opens **maximized** on every launch.
- Click the **active session again to close it**.
- A fresh app icon.

**Fixed**
- Cleaner UI: header buttons no longer wrap, "New session" / "Add resource" use solid (not dashed) borders, the session search matches the sidebar search, and the New Assistant dialog no longer shows a personal placeholder.

## 0.1.8

**New**
- **Keep-awake** toggle in the header — stops your Mac from sleeping during long runs.
- **Color-code sessions and terminals** — rename and tint them to tell them apart at a glance.
- **Select and copy terminal text** with ⌘C / ⌘V.
- **HTTP / HTTPS MCP servers** now work — test the connection and run their tools, not just stdio servers.
- **Reconnect** button for MCP servers, and panels now auto-connect when opened so status is live.

**Fixed**
- Notifications no longer fire while you're typing, and their content is clean and consistent.
- Deleting a global MCP server now actually removes it.
- A `claude` session started by typing it manually now resumes after an app restart.
- Terminal text is no longer clipped on the right — even padding on both sides, scrollbar at the edge.
- Claude now shades your typed input in the terminal (the app reports its colors to it).
- Session duration reads in your UI language, and the New Assistant dialog no longer shows a personal placeholder.
