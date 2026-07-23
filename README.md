# Archo

A macOS desktop app for creating and managing [Claude Code](https://claude.com/claude-code) assistants. Build assistants with their own skills, agents, commands, MCP servers, and instructions — then run and manage recorded terminal sessions for each of them from one place.

Built with Electron + React + TypeScript.

## Features

- **Assistant manager** — create assistants, each backed by a real, runnable Claude Code project
- **Skills, agents, commands & instructions** — edit an assistant's resources with an in-app editor
- **MCP servers** — configure MCP at global and per-project scope, enable/disable per assistant
- **Recorded terminal sessions** — named, resumable terminals per assistant with full scrollback
- **Claude session resume** — reattach to previous Claude Code conversations
- **Desktop notifications** — get notified when a run finishes, waits for input, or stops
- **Bilingual UI** — English and Turkish
- **Import / export** — move your assistants and settings between machines
- **Auto update check** — the app checks GitHub Releases for newer versions

## Install

Grab the latest `.dmg` from the [Releases](https://github.com/imonursahin/archo/releases) page.

1. Open the DMG and drag **Archo** into Applications.
2. The app is unsigned, so the first launch needs **right-click → Open** (then confirm). It opens normally after that.

Currently built for macOS on Apple Silicon (arm64).

## Development

```bash
npm install      # installs deps and rebuilds node-pty
npm run dev      # start the app with hot reload
npm run build    # type-check + build
npm run pack     # build an unpacked .app into dist/
npm run dist     # build .dmg + .zip installers into dist/
```

## Releasing

Releases are fully automated with GitHub Actions. Bump the version and push:

```bash
npm run ship 0.1.1
```

This bumps `package.json`, commits, and pushes. The [Release workflow](.github/workflows/release.yml) then builds the macOS installers and publishes a GitHub Release. Installed apps detect the new version on next launch.

## License

MIT
