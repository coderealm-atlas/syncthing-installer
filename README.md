
# syncthing-installer

Syncthing 是一个非常优秀的文件同步软件，我个人长期使用，也非常推荐更多人尝试。

这个项目的目标，是让 Syncthing 的安装和分发过程更简单，尤其是为 Windows 用户，以及中国网络环境下的使用者提供一个更稳定、更直接的安装入口。

交流QQ群: 418474680

欢迎认领一个平台的开发工作，接受 Vibe Coding，但请将修改限制在你认领的平台目录内。

![Installer Invocations](https://i.lets-script.com/syncthing/stats.svg)
![Mirror Installs](https://i.lets-script.com/syncthing/stats.svg?metric=source:mirror&label=mirror%20installs)

## 快速安装

复制下面对应命令即可直接安装。

| 状态 | 平台 | 场景 | 安装命令 |
| --- | --- | --- | --- |
| ✅ | Windows amd64 | 默认后台安装，登录后启动 | `irm "https://i.cjj365.cc/syncthing/install.ps1?platform=windows-amd64" \| iex` |
| ✅ | Windows amd64 | 开机启动 | `irm "https://i.cjj365.cc/syncthing/install.ps1?platform=windows-amd64&mode=startup" \| iex` |
| ✅ | Windows amd64 | 系统服务 | `irm "https://i.cjj365.cc/syncthing/install.ps1?platform=windows-amd64&mode=service" \| iex` |
| ✅ | Linux amd64 | 默认用户服务 | `curl -fsSL "https://i.cjj365.cc/syncthing/install.sh?platform=linux-amd64" \| bash` |
| ✅ | Linux amd64 | 启动即运行的用户服务 | `curl -fsSL "https://i.cjj365.cc/syncthing/install.sh?platform=linux-amd64&mode=startup" \| bash` |
| ✅ | Linux amd64 | 系统服务 | `curl -fsSL "https://i.cjj365.cc/syncthing/install.sh?platform=linux-amd64&mode=service&service_user=$USER" \| sudo bash` |
| ⚠️ | FreeBSD amd64 | 当前用户立即启动 | `fetch -qo- "https://i.cjj365.cc/syncthing/install.sh?platform=freebsd-amd64&source=github" \| sh` |
| ⚠️ | FreeBSD amd64 | 用户登录后开机启动 | `fetch -qo- "https://i.cjj365.cc/syncthing/install.sh?platform=freebsd-amd64&mode=startup&source=github" \| sh` |
| ⚠️ | FreeBSD amd64 | rc.d 系统服务 | `fetch -qo- "https://i.cjj365.cc/syncthing/install.sh?platform=freebsd-amd64&mode=service&service_user=$USER&source=github" \| sudo sh` |
| ⚠️ | macOS | 通用 | `curl -fsSL "https://i.cjj365.cc/syncthing/install.sh?platform=macos-universal&variant=darwin&source=github" \| bash` |

说明：

- 中国大陆用户建议优先使用 `source=mirror`。
- 海外用户建议优先使用 `source=github`。
- 如果未显式指定 `source`，当前默认使用 `mirror`。
- `✅` 表示当前已重点实现并持续验证；`⚠️` 表示已有基础脚本，但覆盖和验证还不够完整。
- Linux `mode=default` 会安装并启用当前用户的 `systemd --user` 服务，适合桌面环境。
- Linux `mode=startup` 会在 `mode=default` 基础上启用 `loginctl enable-linger`，让当前用户的 `systemd --user` 服务在开机后也能自动拉起。
- Linux `mode=service` 会安装为系统级 `systemd` 服务，适合服务器；默认使用 `service_user` 或 `sudo` 前的当前用户作为运行账号，安装目录默认是 `/usr/local/lib/syncthing`。
- FreeBSD `mode=default` 会安装到当前用户目录并立即后台启动，但不会自动加入开机启动。
- FreeBSD `mode=startup` 会在 `mode=default` 基础上额外写入当前用户的 `crontab @reboot` 条目。
- FreeBSD `mode=service` 会写入 `/usr/local/etc/rc.d/syncthing` 并通过 `sysrc` 启用标准 `rc.d` 服务；默认使用 `service_user` 或 `sudo` 前的当前用户作为运行账号。
- FreeBSD 在 `mode=default` / `mode=startup` 和 `mode=service` 之间切换时，会尝试自动停用旧的启动方式，避免用户模式和 `rc.d` 服务同时存在。
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
platform - 二进制平台，例如 windows-amd64、linux-amd64、freebsd-amd64、macos-universal
source - 下载源，可选 github 或 mirror；默认 mirror
dir - 安装目录
task - 是否创建计划任务，1 表示创建，0 表示不创建
open - 安装完成后是否自动打开 Web UI，1 表示打开，0 表示不打开
listenon - Web GUI 监听地址，默认 127.0.0.1:8384；如果只给 IP 或主机名，会自动补成 :8384；listenon=* 或 listenon=all 会映射到 0.0.0.0:8384。注意这只是监听地址；安装脚本本地打开 GUI 时仍会使用 http://127.0.0.1:8384/
tailscale - 1 表示优先检测本机 Tailscale IPv4，并把 Web GUI 绑定到该地址；如果同时指定 listenon，则以 listenon 为准
service_name - 仅在 Windows mode=service 时使用，自定义 Windows service 名称
service_user - 在 Windows mode=service 时表示 Windows 账号；在 Linux mode=service 时表示系统服务运行账号
service_log - 仅在 Windows mode=service 时使用，指定 service 输出日志文件路径
service_create_user - 仅在 Windows mode=service 时使用，1 表示自动创建本地低权限服务账号
service_paths - 仅在 Windows mode=service 时使用，用分号分隔多个需要授予服务账号写权限的数据目录
variant - 平台变体，例如 linux、darwin、win10、win11；Linux 侧旧的 distro 名称会兼容映射到通用 Linux 路径
mode - 安装模式，当前默认 default
```

当 `source=mirror` 时，Worker 会优先读取镜像站发布的 `latest.json`。如果请求里没有显式指定 `version`，下载链接会优先使用镜像站稳定的 `latest/` 路径；指定了 `version` 时则使用 `releases/<version>/`。

如果镜像站的 `latest.json` 暂时不可用，Worker 会自动回退到 GitHub 的最新版本解析，避免安装入口直接失效。

如果镜像站已经返回版本信息、但目标平台资产尚未同步，安装脚本也会自动回退到 GitHub 对应版本的直链，避免出现 404。

## 使用建议

- 中国大陆用户建议优先使用 `source=mirror`，通常下载更稳定、速度更好。
- 海外用户建议优先使用 `source=github`；如果不显式指定，Worker 默认优先走镜像源。
- 如果镜像源临时不可用，可以随时切换回 GitHub 源。
- Windows `mode=default` 当前按“用户登录后在后台启动”处理，这也是 Syncthing 官方更适合大多数终端用户的建议。
- Windows `mode=startup` 会改成任务计划程序的“开机启动”，适合希望系统启动后即进入后台运行、但仍然沿用任务计划程序的场景。
- Windows `mode=service` 会使用镜像站提供的 NSSM 安装成独立 Windows service，更适合服务器或无人值守场景。
- Linux `mode=default` 当前会安装成 `systemd --user` 服务，并立即 `enable --now`。
- Linux `mode=startup` 会在 `mode=default` 基础上额外执行 `loginctl enable-linger`，因此可能提示输入 sudo 密码。
- Linux `mode=service` 会写入系统级 unit 文件，并要求以 root 权限执行安装脚本；当前默认把程序内容放到 `/usr/local/lib/syncthing`，再把实际执行文件落到 `/usr/local/libexec/syncthing-installer/syncthing`，避免目标目录挂了 `noexec` 时 systemd 无法启动。
- Linux 在 `mode=default` / `mode=startup` 和 `mode=service` 之间切换时，会尝试自动停用旧的 systemd unit，避免用户服务和系统服务同时存在。
- 如果通过 `listenon` 把 GUI 改成监听非 localhost 地址，请尽快为 Web GUI 设置用户名和密码；通过 Tailscale 或其他隧道暴露时同样如此。
- `listenon=*` 或 `listenon=all` 适合测试或内网场景，本质上等价于 `0.0.0.0:8384`；请配合防火墙、认证和 HTTPS 使用。
- 如果使用 `tailscale=1`，安装脚本会在目标机器上运行时尝试执行 `tailscale ip -4`；检测失败时会自动回退到 `127.0.0.1:8384`。
- `mode=service` 安装后请尽快给 Syncthing Web GUI 设置用户名和密码，或通过 `service_user` 改成权限更低的服务账号。
- 如果使用 `service_create_user=1`，脚本会自动创建本地低权限账号，并把安装目录、配置目录、日志目录以及 `service_paths` 指定的数据目录 ACL 授给该账号。
- 启用 `mode=service` 前，请先确认镜像站已经提供 NSSM ZIP；当前仓库提供了手动脚本 `sync/bin/fetch-nssm-local.sh`，可直接在 `dl.cjj365.cc` 上执行一次。

示例：

Windows 桌面用户：

irm "https://i.cjj365.cc/syncthing/install.ps1?platform=windows-amd64" | iex

irm "https://i.cjj365.cc/syncthing/install.ps1?platform=windows-amd64&dir=C:\Syncthing&source=github" | iex

irm "https://i.cjj365.cc/syncthing/install.ps1?platform=windows-amd64&mode=startup" | iex

irm "https://i.cjj365.cc/syncthing/install.ps1?platform=windows-amd64&open=0" | iex

irm "https://i.cjj365.cc/syncthing/install.ps1?platform=windows-amd64&listenon=100.64.0.10" | iex

irm "https://i.cjj365.cc/syncthing/install.ps1?platform=windows-amd64&tailscale=1" | iex

irm "https://i.cjj365.cc/syncthing/install.ps1?platform=windows-amd64&listenon=all" | iex

Windows 服务器或无人值守场景：

irm "https://i.cjj365.cc/syncthing/install.ps1?platform=windows-amd64&mode=service" | iex

irm "https://i.cjj365.cc/syncthing/install.ps1?platform=windows-amd64&mode=service&service_name=Syncthing-Server&service_log=C:\Syncthing\syncthing-service.log" | iex

irm "https://i.cjj365.cc/syncthing/install.ps1?platform=windows-amd64&mode=service&service_user=.\syncthingsvc&service_create_user=1&service_paths=D:\SyncData;E:\Shared" | iex

Linux/macOS/FreeBSD：

```bash
curl -fsSL "https://i.cjj365.cc/syncthing/install.sh?platform=linux-amd64" | bash
curl -fsSL "https://i.cjj365.cc/syncthing/install.sh?platform=linux-amd64&listenon=100.64.0.10" | bash
curl -fsSL "https://i.cjj365.cc/syncthing/install.sh?platform=linux-amd64&tailscale=1" | bash
curl -fsSL "https://i.cjj365.cc/syncthing/install.sh?platform=linux-amd64&listenon=all" | bash
curl -fsSL "https://i.cjj365.cc/syncthing/install.sh?platform=linux-amd64&mode=startup" | bash
curl -fsSL "https://i.cjj365.cc/syncthing/install.sh?platform=linux-amd64&mode=service&service_user=$USER" | sudo bash
fetch -qo- "https://i.cjj365.cc/syncthing/install.sh?platform=freebsd-amd64&source=github" | sh
fetch -qo- "https://i.cjj365.cc/syncthing/install.sh?platform=freebsd-amd64&listenon=100.64.0.10&source=github" | sh
fetch -qo- "https://i.cjj365.cc/syncthing/install.sh?platform=freebsd-amd64&tailscale=1&source=github" | sh
fetch -qo- "https://i.cjj365.cc/syncthing/install.sh?platform=freebsd-amd64&listenon=all&source=github" | sh
fetch -qo- "https://i.cjj365.cc/syncthing/install.sh?platform=freebsd-amd64&mode=startup&source=github" | sh
fetch -qo- "https://i.cjj365.cc/syncthing/install.sh?platform=freebsd-amd64&mode=service&service_user=$USER&source=github" | sudo sh
```

获取最新版本也可以指定来源：

```text
/syncthing/latest?source=mirror
```

如果不指定 `source`，`/syncthing/latest` 现在也默认返回镜像源解析出的版本。

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

6. 用默认镜像源验证安装脚本

	```powershell
	irm "https://i.cjj365.cc/syncthing/install.ps1?platform=windows-amd64" | iex
	```

	```bash
	curl -fsSL "https://i.cjj365.cc/syncthing/install.sh?platform=linux-amd64" | bash
	```

7. 验证最新版本接口

	```text
	https://i.cjj365.cc/syncthing/latest?source=mirror
	```
