# Changelog

## 0.2.0

**Added**
- **Windows and Linux builds.** Releases now carry installers for all three platforms: `.dmg`/`.zip` for macOS, `.exe`/`.zip` for Windows, `.AppImage`/`.deb` for Linux. The parts of the app that only ever worked on a Mac were fixed along the way — the PATH passed to terminals is joined with the platform's own separator (on Windows the old `:` join flattened the whole PATH into one bogus entry, so nothing resolved), terminals spawn PowerShell with arguments PowerShell actually understands, the transcript folder name now encodes drive letters and backslashes (without it usage and transcript search silently found nothing), the skill bridge falls back to directory junctions where symlinks need admin rights, MCP servers spawn through a shell so `npx`/`uvx` shims resolve, terminal copy/paste answers Ctrl+Shift+C/V, and the title bar no longer reserves space for traffic lights that aren't there.
- **Plugin management.** "manage plugins" under the Plugins group opens a panel listing installed and available plugins plus your marketplaces: install, uninstall, update, enable/disable, and add or remove a marketplace. Everything runs through the `claude plugin` CLI rather than editing its files behind its back.
- **Share an assistant with git.** The ⎇ button on an assistant card turns its folder into a git repo — a `.gitignore` keeping local permissions and logs out, then commit, remote, push and pull from one dialog. "Clone" on the home screen pulls someone else's assistant from a repo and registers it.
- **Hook editor.** Clicking a hook opens an editor for that event instead of the whole `settings.json` as raw text: add and remove matchers, edit each command and its timeout, switch to raw JSON, or delete the event. Writes touch only that event's key, so permissions and everything else in the file are left alone.
- **Doctor.** A new Settings tab that checks what Archo needs on this machine — the Claude CLI and its version, a stored login, a writable assistants folder, the transcripts folder, git, node, and `gh` auth — and prints the fix for whatever is missing.
- **Terminal recording cleanup.** Settings › General now shows how much disk the recorded scrollback uses, how much of it belongs to sessions you already deleted, and clears logs older than 30 or 7 days, or all of them.
- **Variables in saved prompts.** A prompt containing `{{ticket}}` asks for the values when you send it and substitutes them. Prompts without variables are unchanged.
- **Frontmatter warnings.** The editor flags a skill or agent that Claude Code would never load — missing frontmatter, a missing `name` or `description`, a name that doesn't match its folder, or a description too short to trigger on. Warnings only; saving is never blocked.

**Changed**
- An exported bundle now blanks every MCP server's `env` values, so the receiver sees which keys a server needs without receiving yours. The same config is kept out of a shared git repo entirely — add it yourself if it holds no secrets.
- Exporting an assistant no longer packs machine-local files: `.claude/settings.local.json`, `.claude/logs/` and any `.env` stay behind. Binary files are detected by content instead of being silently mangled by a UTF-8 round-trip, and every file left out (binary or over 512KB) is listed in the bundle and reported after the export — previously they just vanished.
- Deleting a resource or an assistant now also clears what the app remembered about it: its favorite entry and its place in the sidebar ordering, plus the recent-directory list of a deleted assistant.

**Fixed**
- Typing in transcript search crashed on every keystroke (a setter that didn't exist).
- Two different translations were registered under the same key, so one of them could never appear.

## 0.1.19

**Changed**
- Terminal tabs no longer show the linked ticket key as a chip. The link itself is unchanged: the ticket and its live status still appear in the tab's edit popover and on the session in the sidebar.

## 0.1.18

**Added**
- Renaming a terminal tab now renames the Claude conversation running in it. Archo sends the new name to that terminal as `/rename <name>`, so the conversation is titled after the tab in `/resume` instead of carrying a generated name (long names are cut to 60 characters). It only fires while Claude is the terminal's foreground process and sitting on its normal input box — nothing is typed at a shell prompt, nor while Claude is working or waiting on a permission prompt, where the keystrokes would answer that prompt instead. A rename box opened and closed unchanged sends nothing.

## 0.1.17

**Fixed**
- Terminals no longer resume each other's Claude conversation after the app is restarted. Archo used to work out which conversation a terminal owned by watching the transcripts folder and taking the most recently written file — but every Claude session running in that folder keeps its file fresh, so a terminal could adopt a sibling's conversation, or find nothing within the 30-second deadline and end up with no id at all. Those terminals then restarted with `claude --continue`, which hands the single newest conversation to every terminal that asks. Archo now pins the id up front with `--session-id` when it launches Claude, so a terminal owns its conversation from the first frame. A `claude` you type yourself still has to be matched after the fact, but that watch now declines to guess while a sibling terminal in the same folder is waiting too, rather than handing the next transcript to whichever watcher happens to tick first. Terminals with no id adopt an unclaimed conversation that was started in their folder after they were, and a pinned conversation that never actually got going opens under its own id instead of failing to resume.

## 0.1.16

**Fixed**
- The active terminal tab is now actually visible — with several tabs open (especially colored ones) there was no usable way to tell which terminal you were in. Inactive tabs are dimmed and the active one carries an accent bar along its top edge.

## 0.1.15

**Added**
- **Dashboard** — a new top-level tab next to Sessions: your open GitHub PRs, the PRs waiting on your review, today's meetings, and your active-sprint Jira issues laid out as board columns. Refreshes every minute in the background (5 minutes when the window isn't focused), backs off on errors, and shows when it last updated.
- Jira issues can be moved between columns straight from the Dashboard, and a green dot on the tab flags an unseen review request or a meeting about to start.
- Google Calendar integration: today's meetings with one-click Meet join, a desktop reminder 5 minutes before a meeting starts, plus creating an instant Meet room, a scheduled meeting with guests, or an out-of-office block.
- Terminals can now be linked to a Jira ticket. The tab shows the key, the popover shows the ticket's live status, and the Dashboard links each issue straight to the terminal doing its work.
- Terminal tabs can be reordered by dragging, and tagged like sessions.
- Claude Code's file memory (`~/.claude/projects/*/memory`) now appears in the sidebar as an editable resource group.
- Settings › Integrations for GitHub and Jira credentials — tokens are encrypted with the OS keychain and never read back into the UI.

**Fixed**
- Turkish (and any non-ASCII) characters were mangled in the terminal and in anything you copied out of it. A GUI-launched app inherits no locale, so the shell fell back to the C locale and treated every byte as latin-1.
- Returning to a session now reopens the terminal you were last on instead of always the first one.
- Session deletion honours the "Confirm before delete" preference.

## 0.1.14

**Fixed**
- Terminal scrollback was completely unscrollable after resuming a session or reattaching a tab — replaying the saved buffer raced against the initial fit, corrupting xterm's scrollback bookkeeping.
- Pasting a screenshot/image into a terminal now shows Claude's native `[Image #1]` attachment instead of a raw file path — Cmd+V now defers to Claude's own clipboard-image handling (the same one Ctrl+V already triggered) instead of the old dead-code path.
- Claude's status line could clip its last character(s) against the right edge, worse at some window widths — added correct Unicode wide-character width handling and a small permanent column margin so nothing sits flush against the edge.
- A console error on every launch (`Cannot read properties of undefined (reading 'dimensions')`) from fitting the terminal before its renderer had finished initializing.
- A background timer tracking manually-typed `claude` invocations kept running for up to 30s after closing that terminal.
- A rare crash writing to an already-closed terminal view if you switched tabs while its scrollback was still loading.

## 0.1.13

**Fixed**
- Claude Code's own input-row shading (and other truecolor-aware TUIs) now actually renders — Archo launches from Finder rather than a shell, so the spawned terminal never advertised 24-bit color support (`COLORTERM`), leaving that shading with nothing to draw against.

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
