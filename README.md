# CrewFlow

传媒公司视频项目管理桌面端。当前版本为 `v0.9.11` 内测版，用于管理项目立项、任务分派、交付日历、团队负载、人员账号和财务结算。

## 当前定位

这是桌面客户端内测版，支持单人模式和第一版内网团队模式。

单人模式数据保存在本机 App 数据文件和浏览器本地备份中。团队模式通过一台常驻 Mac 或 Windows 电脑运行 CrewFlow Server，局域网内其他客户端通过 HTTP 地址连接。

单人模式数据文件：

```text
~/Library/Application Support/CrewFlow/crewflow-data.json
```

当前干净初始状态只保留总控账号：`zk / 123456`。

## 功能范围

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

## 开发运行

```bash
npm run desktop
```

启动内网团队服务端：

```bash
npm run team:server
```

团队服务端说明见 `server/README.md`。

安装团队服务端后台常驻服务：

```bash
npm run team:install-service
```

Mac 会安装 launchd 后台服务；Windows 会安装计划任务。安装后终端关闭不影响团队模式连接。

只启动网页调试：

```bash
npm run dev
```

## 检查

```bash
npm test
npm run build
npm run lint
```

## 打包

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

## 下一阶段

`v1.0` 继续完善内网多人协作版：

- 当前已加入第一版团队模式：一台常开 Mac 运行 CrewFlow Server，客户端通过 HTTP 读写同一份团队数据。
- CrewFlow Server 可在 Mac 或 Windows 常驻电脑上运行。
- 第一版使用 10 秒轮询和“最后保存生效”策略。
- 后续继续完善实时推送、冲突提示、自动备份、启动项安装和更细的服务端权限。
