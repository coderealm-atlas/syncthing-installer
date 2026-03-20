# sync

这个目录用于放置 GitHub 资源同步和部署脚本。

当前拆分：

- `bin/`：可直接执行的入口脚本
- `lib/`：共享 shell 函数
- `config/`：环境变量模板

建议流程：

1. 用 `bin/fetch-assets.sh` 拉取 GitHub Release 资源到本地目录
2. 用 `bin/sync-assets.sh` 将本地目录同步到中国服务器

当前实现优先支持 `rsync over SSH`，适合“先下载到目录，再发布到中国服务器”的流程。

另外也提供了一个面向 Ubuntu 24 的部署脚本，用于把整个 `sync/` 目录上传到远端服务器，并安装 `systemd service + timer`。

## 当前能力

- 拉取最近多个 GitHub releases
- 按需过滤 asset 名称，便于只同步 Windows 安装包
- 为已下载文件跳过重复下载
- 生成 `manifest.json`
- 生成 `releases.json` 和 `latest.json`
- 使用 `rsync` 做 dry-run 或正式发布
- 发布前自动构建稳定的镜像目录结构

## 配置

复制 `config/env.example` 为 `config/env` 后再执行脚本。

常用变量：

- `RELEASE_COUNT`：要抓取的 release 数量
- `KEEP_VERSIONS`：本地保留的版本目录数量
- `SYNC_PROFILE`：同步预设，当前支持 `windows` 和 `all`
- `ASSET_MATCH`：可选自定义文件名正则；为空时会按 `SYNC_PROFILE` 自动选择
- `MIRROR_BASE_URL`：镜像站对外根路径，用于和 Worker 配置保持一致
- `REMOTE_HOST` / `REMOTE_USER` / `REMOTE_PATH`
- `REMOTE_PORT`
- `DRY_RUN=1`：只预览 `rsync` 变更，不真正上传
- `PUBLISH_LAYOUT=versioned`：发布为固定结构，包含 `releases/` 和 `latest/`
- `STAGE_ROOT`：可选，指定本地 staging 目录；不设置时自动用临时目录
- `SYNC_DEPLOY_HOST` / `SYNC_DEPLOY_USER` / `SYNC_DEPLOY_PORT`：部署 sync 程序到 Ubuntu 24 的 SSH 目标
- `SYNC_DEPLOY_BASE_DIR`：远端安装目录
- `SYNC_SYSTEMD_NAME_PREFIX`：systemd service/timer 名称前缀
- `SYNC_RUN_USER` / `SYNC_RUN_GROUP`：远端执行同步任务的用户和组
- `SYNC_TIMER_ON_CALENDAR`：systemd timer 的计划，例如 `hourly` 或 `*-*-* 03:00:00`

## 产出文件

- `manifest.json`：所有已同步 asset 的明细、来源 URL、SHA-256、大小
- `releases.json`：最近同步版本的索引列表
- `latest.json`：当前最新版本的简要元数据

## 发布目录结构

当前 `sync-assets.sh` 会先构造本地 staging 目录，再整体同步到远端。默认结构如下：

```text
manifest.json
releases.json
latest.json
releases/
	vX.Y.Z/
latest/
	...最新版本文件...
```

这样可以同时满足：

- 保留多个历史版本用于回滚
- 用固定的 `latest/` 路径给下载页或安装器使用
- 让远端站点不需要自己做目录扫描或软链接切换

这些文件可以直接给下载页、Worker 或镜像站点读取，不需要额外扫描目录。

## 执行示例

```bash
cp sync/config/env.example sync/config/env
./sync/bin/fetch-assets.sh
DRY_RUN=1 ./sync/bin/sync-assets.sh
./sync/bin/sync-assets.sh
```

默认 `SYNC_PROFILE=windows`，会只同步 Windows zip。

如果你要同步全部平台资产：

- 把 `SYNC_PROFILE=all`
- 或者自定义 `ASSET_MATCH`

## Ubuntu 24 部署

当前只针对 Ubuntu 24，部署脚本会完成三件事：

1. 上传整个 `sync/` 目录到远端服务器
2. 上传实际运行用的 `config/env`
3. 安装并启用 `systemd service + timer`

另外，脚本会在远端自动检查并安装缺失依赖：

- `rsync`
- `curl`
- `jq`

执行方式：

```bash
cp sync/config/env.example sync/config/env
# 编辑 sync/config/env，填写部署和运行参数
./sync/bin/deploy-sync-ubuntu24.sh
```

部署完成后，远端会安装：

- `${SYNC_SYSTEMD_NAME_PREFIX}.service`
- `${SYNC_SYSTEMD_NAME_PREFIX}.timer`

脚本在部署结束后还会自动输出：

- `systemctl status <service>`
- `systemctl status <timer>`
- `systemctl list-timers <timer>`
- 最近 20 行 service 日志

手动触发一次同步：

```bash
ssh deploy@your-server 'sudo systemctl start syncthing-installer-sync.service'
```