# CrewFlow Server

CrewFlow 团队模式使用一台常开的 Mac 或 Windows 电脑作为内网数据服务端。客户端不直接读写共享文件，只通过 HTTP 接口读写这台常驻电脑上的数据文件。

## 启动

在常驻电脑上进入项目目录：

```bash
cd /path/to/video-project-command-center
npm run team:server
```

Windows 主机同理，先进入项目目录再运行同一个命令：

```bat
cd /d D:\CrewFlow\video-project-command-center
npm run team:server
```

默认监听：

```text
http://0.0.0.0:8787
```

服务端数据文件：

```text
~/Library/Application Support/CrewFlow Server/crewflow-team-data.json
```

Windows 默认数据文件：

```text
%APPDATA%\CrewFlow Server\crewflow-team-data.json
```

其他电脑在 CrewFlow 登录页或左下角“工作模式”里选择“团队模式”，服务器地址填写这台常驻电脑的局域网 IP，例如：

```text
http://192.168.31.20:8787
```

## 后台常驻服务

临时运行 `npm run team:server` 时，终端关闭服务就会停止。正式使用建议在常驻电脑打开 CrewFlow，在“工作模式”里点击“开启团队服务”。App 会安装后台服务，并显示其他电脑要填写的局域网地址。

打包版会优先把后台服务指向当前 CrewFlow App 的 `--team-server` 模式；开发环境下才使用 Node 运行 `server/crewflow-server.mjs`。

开发或排障时也可以用命令安装后台服务。

安装后台服务：

```bash
npm run team:install-service
```

服务管理命令：

```bash
npm run team:start-service
npm run team:stop-service
npm run team:restart-service
npm run team:service-status
npm run team:uninstall-service
```

Mac 使用当前用户的 `launchd` LaunchAgent；Windows 使用当前用户登录时自动运行的计划任务。安装后终端窗口可以关闭。

## 环境变量

```bash
CREWFLOW_HOST=0.0.0.0 CREWFLOW_PORT=8787 npm run team:server
```

自定义数据目录：

```bash
CREWFLOW_DATA_DIR="/path/to/CrewFlow Server Data" npm run team:server
```

## 当前同步策略

- 客户端打开团队模式时读取服务端数据。
- 客户端保存时向服务端写入变更字段。
- 客户端每 2 秒轮询一次服务端数据。
- 第一版采用“最后保存生效”，后续再做更细的冲突提示和审计记录。

## 不要这样做

不要让多台电脑直接读写同一个 JSON、SQLite 或 SMB 共享文件。多人同时写入时容易互相覆盖，CrewFlow Server 的作用就是把写入集中到一个进程里。
