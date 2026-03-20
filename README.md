
# syncthing-installer

一个通过 Cloudflare Worker 动态生成安装脚本的项目。

Windows 安装器的实现说明见 [docs/implementation.md](docs/implementation.md)。

GitHub 资源同步到中国服务器的方案讨论见 [docs/github-assets-sync.md](docs/github-assets-sync.md)。

同步与部署脚本位于 [sync/README.md](sync/README.md)。

Worker 侧镜像域名通过 [wrangler.toml](wrangler.toml) 中的 `MIRROR_BASE_URL` 配置。

## 接口

- Windows: `/syncthing-installer/install.ps1`
- Linux/macOS: `/syncthing-installer/install.sh`

示例：

irm https://your-worker/syncthing-installer/install.ps1 | iex

## 参数

version - 指定版本  
platform - 二进制平台，例如 windows-amd64、linux-amd64、macos-universal  
source - 下载源，可选 github 或 mirror  
dir - 安装目录  
task - 是否创建计划任务，1 表示创建，0 表示不创建
variant - 平台变体，例如 win10、win11、debian、ubuntu、suse  
mode - 安装模式，当前默认 `default`

当 `source=mirror` 时，Worker 会优先读取镜像站发布的 `latest.json`。如果请求里没有显式指定 `version`，下载链接会优先使用镜像站稳定的 `latest/` 路径；指定了 `version` 时则使用 `releases/<version>/`。

如果镜像站的 `latest.json` 暂时不可用，Worker 会自动回退到 GitHub 的最新版本解析，避免安装入口直接失效。

示例：

irm "https://your-worker/syncthing-installer/install.ps1?platform=windows-amd64&dir=C:\Syncthing" | iex

irm "https://your-worker/syncthing-installer/install.ps1?platform=windows-amd64&source=mirror" | iex

```bash
curl -fsSL "https://your-worker/syncthing-installer/install.sh?platform=linux-amd64&variant=ubuntu" | bash
```

获取最新版本也可以指定来源：

```text
/syncthing-installer/latest?source=mirror
```

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
	./sync/bin/sync-assets.sh
	```

3. 先预演 rsync 发布

	```bash
	DRY_RUN=1 ./sync/bin/deploy-rsync.sh
	```

4. 正式发布到镜像站

	```bash
	./sync/bin/deploy-rsync.sh
	```

5. 配置 Worker 的镜像域名

	- 在 [wrangler.toml](wrangler.toml) 中把 `MIRROR_BASE_URL` 改成真实镜像地址
	- 重新执行 `wrangler deploy`

6. 用镜像源验证安装脚本

	```powershell
	irm "https://your-worker/syncthing-installer/install.ps1?platform=windows-amd64&source=mirror" | iex
	```

7. 验证最新版本接口

	```text
	https://your-worker/syncthing-installer/latest?source=mirror
	```
