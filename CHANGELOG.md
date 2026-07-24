# Changelog

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
