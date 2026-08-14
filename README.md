# CrewFlow

CrewFlow is a desktop command center for project intake, task assignment, delivery calendars, team workload, user accounts, archive management, and finance tracking.

It is built with Electron, React, and Vite, and supports both single-user local data and LAN team mode through a lightweight CrewFlow Server.

Current stable version: **v1.4.5**. See [CHANGELOG.md](CHANGELOG.md) for release details.

中文使用说明：[CrewFlow 用户使用说明](docs/USER_GUIDE.zh-CN.md)

## Screenshots

![Dashboard](docs/screenshots/dashboard.png)

![Project Center](docs/screenshots/projects.png)

![Finance](docs/screenshots/finance.png)

![Team Mode](docs/screenshots/team-mode.png)

## Features

- Role-based workspace for controller, admin, project manager, member, and finance users
- Project intake, project details, task assignment, and workflow tracking
- Personal task view for assigned work
- Delivery calendar for project milestones
- Read-only China public-holiday and adjusted-workday display with offline caching
- Team workload overview
- Staff, account, and option management
- Project archive
- Finance tracking for contracts, payments, invoices, and settlement status
- CrewFlow Assistant with local rules, OpenAI-compatible online models, and local Ollama models
- Permission-aware natural-language form prefilling and chat-record extraction
- Image understanding through compatible online multimodal models
- Built-in searchable Chinese user guide available from first-use guidance and the sidebar
- Single-user mode with local data storage
- LAN team mode with a host computer running CrewFlow Server

## Default Account

Clean initial data includes one controller account:

```text
Account: zk
Password: 123456
```

Change this account after first login.

## Downloads

Download the latest desktop packages from the [GitHub Releases page](https://github.com/nuomiyuwan/CrewFlow/releases).

- macOS Apple Silicon and Intel: `CrewFlow-v<version>-macOS-universal.dmg`
- Windows 64-bit: `CrewFlow-v<version>-Windows-x64-Setup.exe`

Release assets are only promoted after they have been built and verified for that platform.

On macOS, open the DMG and drag `CrewFlow.app` into Applications. On Windows, run the Setup installer. App data is stored outside the installation directory, so normal updates do not remove local or team-service data.

## Data Modes

### Single-User Mode

Data is stored on the current computer. This mode is suitable for local use, evaluation, or single-person management.

Default macOS data file:

```text
~/Library/Application Support/CrewFlow/crewflow-data.json
```

### LAN Team Mode

Team mode uses one always-on Mac or Windows computer as the LAN host. Other clients connect to that host through HTTP with a CrewFlow access key.

Typical connection URL:

```text
http://HOST_LAN_IP:8787
```

For daily use, open CrewFlow on the host computer and click “开启团队服务” in “工作模式”. The app installs a background service and shows the LAN address and access key for other clients.

See [server/README.md](server/README.md) for CrewFlow Server details.

## Development

Install dependencies:

```bash
npm install
```

Run the desktop app in development:

```bash
npm run desktop
```

Run only the Vite dev server:

```bash
npm run dev
```

Run the team server manually:

```bash
npm run team:server
```

## Verification

```bash
npm test
npm run lint
npm run build
```

## Packaging

Build the macOS Apple Silicon unpacked app:

```bash
npm run package:mac
```

Build an Intel Mac version:

```bash
npm run package:mac:x64
```

Build a universal Mac version:

```bash
npm run package:mac:universal
```

Build the Windows NSIS installer:

```bash
npm run package:win
```

Build both:

```bash
npm run package:all
```

Output paths:

- `release/CrewFlow-v<version>-macOS-universal.dmg`
- `release/CrewFlow-v<version>-Windows-x64-Setup.exe`
- `release/win-unpacked/CrewFlow.exe`

## License

MIT

Third-party licenses and data-source attribution are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
