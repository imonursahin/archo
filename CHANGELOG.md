# Changelog

## 0.1.12

**Fixed**
- Pasting into a terminal no longer inserts the clipboard text twice.
- Terminal sizing is more robust across window resizes, external-display changes, and resumed Claude sessions — content no longer gets stuck at a stale width.
- The update badge now also appears while the app is already open (checked periodically), not just after relaunching.

## 0.1.11

**New**
- **Collapsible resource sidebar** — hide it down to a slim strip to give sessions and terminals more room, without touching them at all.
- **Drag a file into the terminal** to insert its path, and the `@file` picker can now reference whole folders, not just files.
- **Much more accurate "Claude is done" notifications** — instead of guessing from a fixed idle timeout, this reads Claude's own busy indicator directly, so it no longer fires early while Claude is still thinking/writing, or lingers late after it's actually finished.

**Fixed**
- Dragging a file onto the terminal no longer opens the "create resource" dialog — that's scoped to the sidebar now.
- A crash where collapsing the sidebar could blank the whole window.

## 0.1.10

**New**
- **Resume from search** — transcript search now shows each result's session id and a "Resume in new terminal" button that reopens that exact Claude conversation with `claude --resume`.

**Fixed**
- Deleting an assistant now leaves nothing behind — its terminal sessions, recorded logs, and (when you delete its files) its folder and Claude transcripts are all removed. Deleting a single session never touches your Claude conversations.

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
