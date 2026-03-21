
# syncthing-installer

Syncthing 是一个非常优秀的文件同步软件，我个人长期使用，也非常推荐更多人尝试。

这个项目的目标，是让 Syncthing 的安装和分发过程更简单，尤其是为 Windows 用户，以及中国网络环境下的使用者提供一个更稳定、更直接的安装入口。

交流QQ群: 418474680

欢迎认领一个平台的开发工作，接受 Vibe Coding，但请将修改限制在你认领的平台目录内。

## 快速安装

复制下面对应命令即可直接安装。

| 状态 | 平台 | 场景 | 安装命令 |
| --- | --- | --- | --- |
| ✅ | Windows amd64 | 默认后台安装，登录后启动 | `irm "https://i.cjj365.cc/syncthing/install.ps1?platform=windows-amd64&source=mirror" \| iex` |
| ✅ | Windows amd64 | 开机启动 | `irm "https://i.cjj365.cc/syncthing/install.ps1?platform=windows-amd64&source=mirror&mode=startup" \| iex` |
| ✅ | Windows amd64 | 系统服务 | `irm "https://i.cjj365.cc/syncthing/install.ps1?platform=windows-amd64&source=mirror&mode=service" \| iex` |
| ⚠️ | Linux amd64 | Ubuntu | `curl -fsSL "https://i.cjj365.cc/syncthing/install.sh?platform=linux-amd64&variant=ubuntu&source=github" \| bash` |
| ⚠️ | macOS | 通用 | `curl -fsSL "https://i.cjj365.cc/syncthing/install.sh?platform=macos-universal&variant=darwin&source=github" \| bash` |

说明：

- 中国大陆用户建议优先使用 `source=mirror`。
- 海外用户建议优先使用 `source=github`。
- `✅` 表示当前已重点实现并持续验证；`⚠️` 表示已有基础脚本，但覆盖和验证还不如 Windows 完整。
- Windows `mode=service` 依赖镜像站上的 NSSM 包；当前已通过 `https://dl.cjj365.cc/syncthing/deps/nssm/nssm-2.24-101-g897c7ad.zip` 提供。

项目主体基于 Cloudflare Worker 动态生成安装脚本，同时配套提供镜像同步与 rsync 发布脚本，便于把 GitHub Releases 同步到中国服务器，再通过镜像源完成安装分发。

Windows 安装器的实现说明见 [docs/implementation.md](docs/implementation.md)。

GitHub 资源同步到中国服务器的方案讨论见 [docs/github-assets-sync.md](docs/github-assets-sync.md)。

同步与部署脚本位于 [sync/README.md](sync/README.md)。

`sync/` 目录同时包含一个面向 Ubuntu 24 的部署脚本，可用于把同步程序自身上传到服务器并安装 `systemd timer`。

Worker 侧镜像域名通过 [wrangler.toml](wrangler.toml) 中的 `MIRROR_BASE_URL` 配置。


## 接口

- Windows: `/syncthing/install.ps1`
- Linux/macOS: `/syncthing/install.sh`

示例：

irm https://i.cjj365.cc/syncthing/install.ps1 | iex

## 参数

```text
version - 指定版本
platform - 二进制平台，例如 windows-amd64、linux-amd64、macos-universal
source - 下载源，可选 github 或 mirror
dir - 安装目录
task - 是否创建计划任务，1 表示创建，0 表示不创建
open - 安装完成后是否自动打开 Web UI，1 表示打开，0 表示不打开
service_name - 仅在 mode=service 时使用，自定义 Windows service 名称
service_user - 仅在 mode=service 时使用，指定运行服务的 Windows 账号；脚本会交互式提示输入密码
service_log - 仅在 mode=service 时使用，指定 service 输出日志文件路径
service_create_user - 仅在 mode=service 时使用，1 表示自动创建本地低权限服务账号
service_paths - 仅在 mode=service 时使用，用分号分隔多个需要授予服务账号写权限的数据目录
variant - 平台变体，例如 win10、win11、debian、ubuntu、suse
mode - 安装模式，当前默认 default
```

当 `source=mirror` 时，Worker 会优先读取镜像站发布的 `latest.json`。如果请求里没有显式指定 `version`，下载链接会优先使用镜像站稳定的 `latest/` 路径；指定了 `version` 时则使用 `releases/<version>/`。

如果镜像站的 `latest.json` 暂时不可用，Worker 会自动回退到 GitHub 的最新版本解析，避免安装入口直接失效。

## 使用建议

- 中国大陆用户建议优先使用 `source=mirror`，通常下载更稳定、速度更好。
- 海外用户建议优先使用 `source=github`，或者直接使用默认配置，由 Worker 直接解析 GitHub Releases。
- 如果镜像源临时不可用，可以随时切换回 GitHub 源。
- Windows `mode=default` 当前按“用户登录后在后台启动”处理，这也是 Syncthing 官方更适合大多数终端用户的建议。
- Windows `mode=startup` 会改成任务计划程序的“开机启动”，适合希望系统启动后即进入后台运行、但仍然沿用任务计划程序的场景。
- Windows `mode=service` 会使用镜像站提供的 NSSM 安装成独立 Windows service，更适合服务器或无人值守场景。
- `mode=service` 安装后请尽快给 Syncthing Web GUI 设置用户名和密码，或通过 `service_user` 改成权限更低的服务账号。
- 如果使用 `service_create_user=1`，脚本会自动创建本地低权限账号，并把安装目录、配置目录、日志目录以及 `service_paths` 指定的数据目录 ACL 授给该账号。
- 启用 `mode=service` 前，请先确认镜像站已经提供 NSSM ZIP；当前仓库提供了手动脚本 `sync/bin/fetch-nssm-local.sh`，可直接在 `dl.cjj365.cc` 上执行一次。

示例：

Windows 桌面用户：

irm "https://i.cjj365.cc/syncthing/install.ps1?platform=windows-amd64&source=mirror" | iex

irm "https://i.cjj365.cc/syncthing/install.ps1?platform=windows-amd64&dir=C:\Syncthing&source=github" | iex

irm "https://i.cjj365.cc/syncthing/install.ps1?platform=windows-amd64&source=mirror&mode=startup" | iex

irm "https://i.cjj365.cc/syncthing/install.ps1?platform=windows-amd64&source=mirror&open=0" | iex

Windows 服务器或无人值守场景：

irm "https://i.cjj365.cc/syncthing/install.ps1?platform=windows-amd64&source=mirror&mode=service" | iex

irm "https://i.cjj365.cc/syncthing/install.ps1?platform=windows-amd64&source=mirror&mode=service&service_name=Syncthing-Server&service_log=C:\Syncthing\syncthing-service.log" | iex

irm "https://i.cjj365.cc/syncthing/install.ps1?platform=windows-amd64&source=mirror&mode=service&service_user=.\syncthingsvc&service_create_user=1&service_paths=D:\SyncData;E:\Shared" | iex

Linux/macOS：

```bash
curl -fsSL "https://i.cjj365.cc/syncthing/install.sh?platform=linux-amd64&variant=ubuntu&source=github" | bash
```

获取最新版本也可以指定来源：

```text
/syncthing/latest?source=mirror
```

## 统计

Worker 支持记录安装脚本的调用次数，并提供两个接口：

- `/syncthing/stats`：返回 JSON 统计结果
- `/syncthing/stats.svg`：返回可嵌入 README 的 SVG badge

示例：

```text
/syncthing/stats
/syncthing/stats.svg
/syncthing/stats?days=14
/syncthing/stats.svg?metric=source:mirror&label=mirror%20installs
```

如果你想把统计结果展示在 GitHub README，可以直接使用稳定入口：

```markdown
![Installer Invocations](https://i.cjj365.cc/syncthing/stats.svg)
![Mirror Installs](https://i.cjj365.cc/syncthing/stats.svg?metric=source:mirror&label=mirror%20installs)
```

`/stats` 默认会返回最近 7 天趋势；可以通过 `days=1..30` 调整。

`/stats.svg` 目前支持：

- `metric=total`
- `metric=source:mirror`
- `metric=source:github`
- `metric=platform:windows-amd64`
- `metric=installer:syncthing`

并且支持 `label=...` 自定义 badge 左侧文案。

## 部署

npm install
wrangler login
wrangler deploy

## Mirror 联调流程

1. 配置镜像同步参数

	- 编辑 [sync/config/env.example](sync/config/env.example) 对应的 `config/env`
	- 填写下载目录、远端 SSH 信息，以及你的镜像站根 URL 对应的 `MIRROR_BASE_URL`
	- 示例配置默认 `SYNC_PROFILE=windows`，只同步 Windows zip 资产；如果要同步全部平台，改成 `SYNC_PROFILE=all`

2. 拉取 GitHub 资源

	```bash
	./sync/bin/fetch-assets.sh
	```

3. 先预演 rsync 发布

	```bash
	DRY_RUN=1 ./sync/bin/sync-assets.sh
	```

4. 正式发布到镜像站

	```bash
	./sync/bin/sync-assets.sh
	```

5. 配置 Worker 的镜像域名

	- 在 [wrangler.toml](wrangler.toml) 中把 `MIRROR_BASE_URL` 改成真实镜像地址
	- 重新执行 `wrangler deploy`

6. 用镜像源验证安装脚本

	```powershell
	irm "https://i.cjj365.cc/syncthing/install.ps1?platform=windows-amd64&source=mirror" | iex
	```

7. 验证最新版本接口

	```text
	https://i.cjj365.cc/syncthing/latest?source=mirror
	```
