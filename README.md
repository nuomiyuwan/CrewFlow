# CrewFlow

CrewFlow is a desktop command center for project intake, task assignment, delivery calendars, team workload, user accounts, and finance tracking. It is built with Electron, React, and Vite.

## 当前定位

这是桌面客户端内测版，支持单人模式和第一版内网团队模式。

单人模式数据保存在本机 App 数据文件和浏览器本地备份中。团队模式通过一台常驻 Mac 或 Windows 电脑运行 CrewFlow Server，局域网内其他客户端通过 HTTP 地址连接。

单人模式数据文件：

```text
~/Library/Application Support/CrewFlow/crewflow-data.json
```

Clean initial data keeps only the controller account: `zk / 123456`. Change this account after first login.

## Features

- 登录视角：总控、管理员、项目经理、执行成员、财务
- 首页控制台
- 项目中心、项目详情、项目编辑
- 新建项目、任务分派、交付节点
- 我的任务
- 交付日历
- 团队负载
- 人员管理
- 项目归档
- 财务结算
- 本地规则版制片助理

## Development

```bash
npm run desktop
```

启动内网团队服务端：

```bash
npm run team:server
```

See `server/README.md` for team server details.

For daily use, open CrewFlow on the host computer and click “开启团队服务” in “工作模式”. The app installs the background service and shows the LAN address for other clients.

For development or troubleshooting, install the background team service from the terminal:

```bash
npm run team:install-service
```

macOS uses a launchd LaunchAgent. Windows uses a scheduled task. After installation, closing the terminal does not stop team mode.

Start only the Vite dev server:

```bash
npm run dev
```

## Verification

```bash
npm test
npm run build
npm run lint
```

## Packaging

Mac 解包版：

```bash
npm run package:mac
```

Windows 解包版：

```bash
npm run package:win
```

Mac 和 Windows 一起打包：

```bash
npm run package:all
```

输出目录：

- `release/mac/CrewFlow.app`
- `release/win-unpacked/CrewFlow.exe`

## Roadmap

`v1.0` 继续完善内网多人协作版：

- 当前已加入第一版团队模式：一台常开 Mac 运行 CrewFlow Server，客户端通过 HTTP 读写同一份团队数据。
- CrewFlow Server 可在 Mac 或 Windows 常驻电脑上运行。
- Current team mode polls every 2 seconds and uses a last-save-wins strategy.
- 后续继续完善实时推送、冲突提示、自动备份、启动项安装和更细的服务端权限。

## License

MIT
