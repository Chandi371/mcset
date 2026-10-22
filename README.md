# MCSet 🎮

> **A modern, lightweight, high-performance Minecraft server manager with native AI assistant integration, built with Tauri 2, Rust, and React.**

[![Tauri v2](https://img.shields.io/badge/Tauri-v2-blue?logo=tauri)](https://tauri.app/)
[![React 19](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev/)
[![Rust](https://img.shields.io/badge/Rust-1.85+-orange?logo=rust)](https://www.rust-lang.org/)
[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/License-PolyForm%20NC%201.0.0-green.svg)](LICENSE)

---

## ✨ Features

- **🚀 Instant Server Creation & Setup**
  - Support for **Paper**, **Purpur**, **Fabric**, **Forge**, **NeoForge**, **Spigot**, **Vanilla**, and **Bedrock**.
  - One-click installation of Modrinth `.mrpack` modpacks with dependency resolution.
  - Automatic EULA acceptance and initial server configuration.

- **☕ Smart Java Runtime Management**
  - Automatically detects system Java installations.
  - Automatically downloads and provisions isolated Java runtimes (Java 8, 11, 17, 21) from Adoptium / Eclipse Temurin based on Minecraft version requirements.

- **🌐 Zero-Port-Forwarding Multiplayer**
  - Built-in **playit.gg** tunnel integration (MCSet Portal).
  - Share your server with friends anywhere instantly without opening router ports or exposing your home IP address.

- **🤖 Built-in Intelligent Server AI Assistant**
  - Integrated with Model Context Protocol (MCP) server tools.
  - **Live Performance Diagnostics**: Ask *"Why is my server lagging?"* to diagnose TPS drops, MSPT tick timing, chunk thrashing, and memory bottlenecks.
  - **Crash Log Analysis**: AI parses stack traces and suggests exact mod or config fixes.
  - Direct execution of safe server commands, config modifications, and troubleshooting.

- **👥 Complete Player & Permissions Management**
  - Visual management of Whitelist, Operators (levels 1-4), Banned Players, and Banned IPs.
  - Automatic `usercache.json` UUID synchronization with strict deduplication.
  - Quick player search and real-time player actions.

- **⚙️ Visual Config Editor**
  - Intuitive visual sliders, toggles, and dropdowns for `server.properties` and software-specific configs.
  - Dual-mode editor: Switch between visual GUI controls and raw code editor with syntax preservation and comment retention.

- **🧩 Mod & Plugin Store**
  - Direct Modrinth marketplace search for mods and plugins.
  - Filter by Minecraft version, loader (Fabric, Forge, NeoForge, Paper), and category.
  - Direct one-click download, version updates, and file toggling.

---

## 📥 Installation & Download

### Windows
1. Download the latest installer or portable executable from [Releases](https://github.com/Chandi371/mcset/releases):
   - **Installer**: `mcset_0.1.0_x64-setup.exe` (or `.msi`)
   - **Standalone Executable**: `mcset.exe`
2. Run the application. MCSet automatically prepares the environment.

---

## 🛠️ Building from Source

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or newer)
- [Rust](https://www.rust-lang.org/tools/install) (1.78+)
- C++ Build Tools (Visual Studio 2022 C++ build tools on Windows)
- Tauri CLI (`npm install -g @tauri-apps/cli`)

### Quick Start
```bash
# Clone repository
git clone https://github.com/Chandi371/mcset.git
cd mcset

# Install frontend dependencies
npm install

# Run frontend unit tests
npm test

# Run Rust backend unit tests
cargo test --manifest-path src-tauri/Cargo.toml

# Start development mode
npm run tauri dev

# Build release executable and installers
npm run tauri build
```

The compiled binaries will be output to:
- `src-tauri/target/release/mcset.exe`
- `src-tauri/target/release/bundle/nsis/mcset_0.1.0_x64-setup.exe`
- `src-tauri/target/release/bundle/msi/mcset_0.1.0_x64_en-US.msi`

---

## 🔒 Security & Privacy

- All server files and worlds are stored locally on your machine.
- Process isolation and strict path traversal protection prevent malicious filesystem manipulation.
- AI features use your own configured API key (Gemini / OpenRouter) stored securely in local storage.

---

## 📄 License

This project is licensed under the **PolyForm Noncommercial License 1.0.0**.
See [LICENSE](LICENSE) for details.

For commercial use inquiries, please contact the repository owner.
