# MCSet 🎮

> **A modern, lightweight, high-performance Minecraft server manager with native AI assistant integration, built with Tauri 2, Rust, and React.**

[![Latest Release](https://img.shields.io/github/v/release/Chandi371/mcset?color=emerald&logo=github)](https://github.com/Chandi371/mcset/releases/latest)
[![Tauri v2](https://img.shields.io/badge/Tauri-v2-blue?logo=tauri)](https://tauri.app/)
[![React 19](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev/)
[![Rust](https://img.shields.io/badge/Rust-1.90+-orange?logo=rust)](https://www.rust-lang.org/)
[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/License-PolyForm%20NC%201.0.0-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows-blue?logo=windows)](https://github.com/Chandi371/mcset/releases)

---

## ✨ Features

- **🚀 1-Click Server Creation & Setup**
  - Instant deployment for **Paper**, **Purpur**, **Fabric**, **Forge**, **NeoForge**, **Spigot**, **Vanilla**, and **Bedrock**.
  - Automatic download and launch of server runtimes and installers without manual JAR or launch script shuffling.
  - Native file & directory selection for importing custom servers or uploading ZIP archives.
  - One-click installation of Modrinth `.mrpack` modpacks with dependency resolution.
  - Transparent EULA acceptance prompt and initial server configuration.

- **☕ Smart Java Runtime Management**
  - Automatically scans and detects installed system Java runtimes.
  - Dynamically provisions isolated Adoptium / Eclipse Temurin JDKs (Java 8, 11, 16, 17, 21) matching your Minecraft version requirements.

- **🌐 Zero-Port-Forwarding Multiplayer**
  - Built-in tunnel integration (Portal) with verified platform release downloads and SHA-256 integrity verification.
  - Share your server with friends anywhere instantly without opening router ports or exposing your home IP address.

- **🤖 Built-in Intelligent Server AI Assistant (MCP)**
  - Integrated Model Context Protocol (MCP) server tools.
  - **Cryptographic Action Approval**: Destructive actions (server deletion, backup restoration, file edits, console commands) require user consent with single-use cryptographic authorization tokens.
  - **Live Diagnostics**: Ask *"Why is my server lagging?"* to analyze TPS drops, MSPT tick timing, chunk thrashing, and memory bottlenecks.
  - **Crash Log Analysis**: AI analyzes crash logs, parses stack traces, and suggests exact mod or configuration fixes.

- **👥 Complete Player & Permissions Management**
  - Visual management of Whitelist, Operators (levels 1-4), Banned Players, and Banned IPs.
  - Real-time `usercache.json` UUID synchronization with strict deduplication.
  - Player search, online status indicators, and head avatars with local fallbacks.

- **⚙️ Visual Config Editor**
  - Dual-mode editor: Intuitive visual sliders, toggles, and dropdowns alongside a full syntax-highlighted editor for `server.properties` and software-specific configs.
  - Full comment preservation and non-destructive diff updates.

- **🧩 Mod & Plugin Store**
  - Direct Modrinth marketplace search for mods and plugins.
  - Filter by Minecraft version, loader (Fabric, Forge, NeoForge, Paper), and category.
  - Direct one-click download, version updates, and file toggling.

---

## 📥 Downloads (Latest Release v0.1.0)

| Package | Type | Description | Download |
| :--- | :--- | :--- | :--- |
| **Windows Setup** | `.exe` | Windows NSIS installer (Recommended) | [Download `mcset_0.1.0_x64-setup.exe`](https://github.com/Chandi371/mcset/releases/download/v0.1.0/mcset_0.1.0_x64-setup.exe) |
| **Windows MSI** | `.msi` | Windows Installer package | [Download `mcset_0.1.0_x64_en-US.msi`](https://github.com/Chandi371/mcset/releases/download/v0.1.0/mcset_0.1.0_x64_en-US.msi) |
| **Portable Executable** | `.exe` | Standalone portable executable | [Download `mcset.exe`](https://github.com/Chandi371/mcset/releases/download/v0.1.0/mcset.exe) |
| **Source Archive** | `.zip` | Complete repository source bundle | [Download `mcset-v0.1.0-source.zip`](https://github.com/Chandi371/mcset/releases/download/v0.1.0/mcset-v0.1.0-source.zip) |

All official release artifacts are hosted directly on the [GitHub Releases Page](https://github.com/Chandi371/mcset/releases).

---

## 🛠️ Building from Source

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or newer)
- [Rust](https://www.rust-lang.org/tools/install) (1.90 or newer)
- C++ Build Tools (Visual Studio 2022 C++ build tools on Windows)
- Tauri CLI (`npm install -g @tauri-apps/cli`)

### Quick Start
```bash
# 1. Clone repository
git clone https://github.com/Chandi371/mcset.git
cd mcset

# 2. Install frontend dependencies
npm install

# 3. Run test suites
npm test                                         # Frontend unit tests (Vitest)
cargo test --manifest-path src-tauri/Cargo.toml   # Rust backend unit tests

# 4. Start development mode
npm run tauri dev

# 5. Build production executable and installers
npm run tauri build
```

Compiled release binaries are created at:
- `src-tauri/target/release/mcset.exe`
- `src-tauri/target/release/bundle/nsis/mcset_0.1.0_x64-setup.exe`
- `src-tauri/target/release/bundle/msi/mcset_0.1.0_x64_en-US.msi`

---

## 🔒 Security Architecture

- **Strict Content Security Policy (CSP)**: WebView2 is secured with an explicit CSP restricting origins, preventing unauthorized script execution, and whitelisting only authorized asset CDNs (Modrinth, ForgeCDN, Minotar).
- **Hardened MCP Authorization**: Destructive operations executed through MCP tools require explicit user consent via single-use SHA-256 tokens.
- **Process Sandbox & Safe Paths**: Strict path sanitization prevents directory traversal attacks outside the designated server directory.
- **Explicit Consent**: Transparent EULA confirmation ensures users explicitly review and accept terms without silent background agreements.

---

## 📄 License

This project is licensed under the **PolyForm Noncommercial License 1.0.0**.
See [LICENSE](LICENSE) for details.

For commercial use inquiries, please contact the repository owner.
