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

服务端 SQLite 数据库：

```text
~/Library/Application Support/CrewFlow Server/crewflow-team.db
```

Windows 默认 SQLite 数据库：

```text
%APPDATA%\CrewFlow Server\crewflow-team.db
```

从旧版本首次升级时，服务会自动读取 `crewflow-team-data.json` 并在事务中迁移。原 JSON 不会删除，迁移前副本和每日数据库备份保存在同目录的 `backups` 文件夹。

其他电脑在 CrewFlow 登录页或左下角“工作模式”里选择“团队模式”，服务器地址填写这台常驻电脑的局域网 IP，例如：

```text
http://HOST_LAN_IP:8787
```

如果使用 App 里的“开启团队服务”，CrewFlow 会同时生成访问密钥。其他电脑需要填写服务器地址和访问密钥后才能读取或保存团队数据。

## 后台常驻服务

临时运行 `npm run team:server` 时，终端关闭服务就会停止。正式使用建议在常驻电脑打开 CrewFlow，在“工作模式”里点击“开启团队服务”。App 会安装后台服务，并显示其他电脑要填写的局域网地址。

后台服务会自动生成并保存访问密钥，后续重启会继续使用同一个密钥。

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

手动指定访问密钥：

```bash
CREWFLOW_ACCESS_KEY="change-this-key" npm run team:server
```

自定义数据目录：

```bash
CREWFLOW_DATA_DIR="/path/to/CrewFlow Server Data" npm run team:server
```

## 当前同步策略

- 客户端首次打开团队模式时读取一份完整数据。
- 客户端保存时只提交新增、修改或删除的具体记录。
- 客户端每 2 秒查询增量变更，没有变化时不会重复下载完整数据。
- SQLite 按项目、任务、日历、财务、人员、账号和设置分别保存记录。
- 服务端会校验访问密钥。
- 服务端会用 `revision` 检查旧版本写入；如果其他电脑已经保存了更新，客户端会重新同步并提示用户再操作一次。
- 旧版客户端的完整数据接口继续保留，可以分批升级其他电脑。

升级顺序：先更新并重启常驻团队主机上的 CrewFlow 服务，再分批更新其他客户端。SQLite 迁移成功后，不要再用旧版 CrewFlow 作为团队主机；旧版客户端仍可暂时连接新主机。

直接从源码运行团队服务需要支持内置 `node:sqlite` 的 Node.js 24 或更高版本。通过打包版 CrewFlow 安装后台服务时会使用 App 自带的 Node 运行环境。

## 不要这样做

不要让多台电脑直接读写同一个 JSON、SQLite 或 SMB 共享文件。多人同时写入时容易互相覆盖，CrewFlow Server 的作用就是把写入集中到一个进程里。
