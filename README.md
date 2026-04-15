# LocalRadar

[简体中文](./README.zh-CN.md)

LocalRadar is a cross-platform desktop app for local service discovery, localhost port management, Docker service tracking, and developer-friendly service navigation.

It helps you discover, search, and monitor services running on `localhost`, Docker containers, local web apps, databases, AI runtimes, and other host processes from one native desktop interface.

![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-2f7df6)
![Tauri](https://img.shields.io/badge/Tauri-2.x-24c8db)
![Rust](https://img.shields.io/badge/Rust-stable-f0743e)
![React](https://img.shields.io/badge/React-18-61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)
![License](https://img.shields.io/badge/license-MIT-green)

## Preview

![LocalRadar overview](./docs/preview-overview.svg)

Keywords:
- local service discovery
- localhost service manager
- localhost port dashboard
- Docker desktop service tracker
- developer portal for local services
- Tauri desktop app
- Rust React desktop app

It is designed for people who regularly run Docker containers, local web apps, databases, AI runtimes, and other localhost services, but do not want to keep guessing:

- What is running right now?
- Which port belongs to which service?
- Which services were just added or removed?
- Where is this service running from?

## Why LocalRadar

Local development environments get messy fast. A single machine can run many containers, Node.js dev servers, Python APIs, databases, AI tools, and background services at the same time.

LocalRadar gives you a native desktop dashboard for:

- seeing what is running on your machine
- matching ports to real services
- tracking newly added or removed services
- inspecting process details, paths, and lightweight resource usage
- navigating local services without remembering random localhost ports

## Current Features

- Discover Docker port mappings
- Discover local listening services from the host machine
- Track added, removed, and changed services
- Search by service name, port, URL, tag, or path
- Show service details such as PID, CPU, memory, executable path, and working directory when available
- Display lightweight CPU and memory trend sparklines in the inspector
- Favorite, rename, hide, and restore services
- Filter services by source or category
- Support English and Chinese UI
- Run as a native desktop app with Tauri

## Use Cases

- Track Docker containers and localhost services from one place
- Find which app owns a specific port such as `3000`, `5173`, or `11434`
- Distinguish between multiple similarly named services such as several `node` processes
- Inspect service metadata including PID, working directory, executable path, CPU, and memory
- Build a local service dashboard for development, AI workflows, and homelab-style setups

## Tech Stack

- `Tauri 2`
- `Rust`
- `React`
- `TypeScript`
- `Vite`

## Project Structure

- `app/`: React frontend for the desktop UI
- `src-tauri/`: Tauri desktop shell and runtime state management
- `crates/core/`: shared Rust discovery logic and service models

## Local Development

### Requirements

- Rust toolchain
- Node.js and npm
- Tauri system dependencies for your platform
- `docker` if you want Docker discovery
- `lsof` for local listener discovery on Unix-like systems

### Install Dependencies

```bash
cd app
npm install
```

### Start the Desktop App

Run from the project root:

```bash
./app/node_modules/.bin/tauri dev
```

### Build the Frontend

```bash
cd app
npm run build
```

### Check Rust Code

```bash
cargo check
```

## Packaging

To build distributable desktop packages locally, use:

```bash
./app/node_modules/.bin/tauri build
```

The exact output format depends on your platform and installed Tauri bundling dependencies.

## Current Limitations

- Resource usage is sampled on scan intervals, not streamed at system-monitor frequency
- Local listener discovery is currently focused on Unix-like environments
- SQLite persistence is not implemented yet
- Release automation is not configured yet

## Release Automation

This repository now includes a GitHub Actions release workflow for automatic desktop builds.

Current setup:

- Push a version tag such as `v0.1.0`
- Or trigger the workflow manually from GitHub Actions
- The workflow will build desktop artifacts for macOS, Windows, and Linux
- Release assets will be attached to the GitHub Release

Workflow file:

- `.github/workflows/release.yml`

Notes:

- macOS and Windows signing are not configured yet
- Unsigned artifacts can still be generated for testing and internal distribution

## Roadmap

- Add SQLite persistence for history and preferences
- Improve classification for local services with similar names
- Add packaging and release automation
- Expand provider support beyond Docker and localhost listeners

## License

MIT. See [LICENSE](./LICENSE).
