# Claude Free Menubar

A premium Electron-based menubar application that provides a headless terminal interface for Claude Code, featuring a modern design and persistent sessions.

## Features

- **Floating Terminal Area**: Expandable terminal with a clean, no-UI look.
- **Premium Aesthetic**: Dark mode, glassmorphism, and custom "Olive Gold" scrollbar.
- **Persistent PTY**: Background terminal session that stays alive between toggles.
- **Cross-Platform Ready**: Designed to run on macOS and Windows.

## Installation

### Prerequisites

- **Node.js** (v18+)
- **GitHub CLI (gh)** (optional, for repo management)
- **Claude Code CLI** installed on your system.
- **Build Tools**:
  - **macOS**: Xcode Command Line Tools.
  - **Windows**: `npm install --global --production windows-build-tools` or Visual Studio Build Tools with C++ workload.

### Setup

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Rebuild native modules (essential for `node-pty`):
   ```bash
   npm run rebuild
   ```
4. Run in development:
   ```bash
   npm run dev
   ```

## Windows Migration Notes

This project uses `node-pty`. When migrating to Windows:
- Ensure you have a `.claude-free-home` directory in your User Profile.
- The `claude-free-wrapper.sh` (Mac) should be replaced with a `.bat` or logic inside `claudeRunner.ts` to call `claude` directly or via a proxy.
- Native dependencies will be recompiled for Windows during `npm install`.

## License

MIT
