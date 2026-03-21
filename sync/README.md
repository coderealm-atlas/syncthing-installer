# sync

这个目录用于放置 GitHub 资源同步和部署脚本。

当前拆分：

- `bin/`：可直接执行的入口脚本
- `lib/`：共享 shell 函数
- `config/`：环境变量模板

建议流程：

1. 用 `bin/fetch-assets.sh` 拉取 GitHub Release 资源到本地目录
2. 用 `bin/sync-assets.sh` 将本地目录同步到中国服务器

如果要完全避开“中转主机到下载主机”的链路，也可以走一条独立路径：

1. 把同步程序直接部署到 `dl.cjj365.cc`
2. 用代理从 GitHub 拉取资源
3. 直接写入 Nginx 服务目录

当前实现优先支持 `rsync over SSH`，适合“先下载到目录，再发布到中国服务器”的流程。

另外也提供了一个面向 Ubuntu 24 的部署脚本，用于把整个 `sync/` 目录上传到远端服务器，并安装 `systemd service + timer`。

本目录现在包含两套互不依赖的方案：

- 跨主机方案：`fetch-assets.sh` + `sync-assets.sh` + `deploy-sync-ubuntu24.sh`
- 本机直写方案：`fetch-assets-local.sh` + `publish-assets-local.sh` + `deploy-local-sync-ubuntu24.sh`

## 当前能力

- 拉取最近多个 GitHub releases
- 按需过滤 asset 名称，便于只同步 Windows 安装包
- 为已下载文件跳过重复下载
- 已存在但大小不匹配的文件会自动重新下载
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
- `FORCE_DOWNLOAD=1`：忽略本地已有文件，强制重新从 GitHub 下载
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

`SYNC_RUN_USER` 需要具备到 `REMOTE_USER@REMOTE_HOST` 的 SSH 发布权限；如果发布密钥只在某个现有登录用户下，最简单的做法就是直接让 `systemd` 以那个用户运行。
- `SYNC_TIMER_ON_CALENDAR`：systemd timer 的计划，例如 `hourly` 或 `*-*-* 03:00:00`

如果使用本机直写方案，复制 `config/env.local.example` 为 `config/env.local`，常用变量如下：

- `LOCAL_PUBLISH_PATH`：Nginx 直接服务的目录，例如 `/var/www/downloads/syncthing`
- `LOCAL_STAGE_ROOT`：可选，本地 staging 目录；不设置时自动使用临时目录
- `LOCAL_DRY_RUN=1`：只预览本地发布变更，不真正写入 Nginx 目录
- `LOCAL_DEPLOY_HOST` / `LOCAL_DEPLOY_USER` / `LOCAL_DEPLOY_PORT`
- `LOCAL_DEPLOY_BASE_DIR`：本机直写方案在目标机上的安装目录
- `LOCAL_SYSTEMD_NAME_PREFIX`：本机直写方案的 systemd service/timer 名前缀
- `LOCAL_RUN_USER` / `LOCAL_RUN_GROUP`：在 `dl.cjj365.cc` 上执行同步任务、并写入 `LOCAL_PUBLISH_PATH` 的用户和组
- `LOCAL_TIMER_ON_CALENDAR`：本机直写方案的计划时间
- `CURL_PROXY` / `NO_PROXY`：如果目标机访问 GitHub 需要代理，在这里配置

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

本机直写方案发布到 `LOCAL_PUBLISH_PATH` 后，对外目录结构保持一致，因此 Worker 侧的 `MIRROR_BASE_URL` 不需要因为部署方式变化而调整。

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

如果 `SYNC_RUN_USER` 或 `SYNC_RUN_GROUP` 在远端不存在，部署脚本也会自动创建对应的系统用户和用户组。

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

## 本机直写方案

这条路径用于解决“中转主机和下载主机之间链路太差”的问题。

思路是：

1. 直接把同步程序部署到 `dl.cjj365.cc`
2. 目标机自己通过代理访问 GitHub API 和资产下载地址
3. 下载结果直接发布到 Nginx 服务目录

执行方式：

```bash
cp sync/config/env.local.example sync/config/env.local
# 编辑 sync/config/env.local，填写代理、Nginx 目录和部署目标
./sync/bin/deploy-local-sync-ubuntu24.sh
```

手动执行一次本机直写同步：

```bash
ssh deploy@dl.cjj365.cc 'sudo systemctl start syncthing-installer-local-sync.service'
```

如果只想在目标机本地跑抓取和发布，不重新部署 service：

```bash
./sync/bin/fetch-assets-local.sh
./sync/bin/publish-assets-local.sh
```

本机直写方案依赖：

- `curl`
- `jq`
- `rsync`

其中 `rsync` 只用于目标机本地目录同步，不再走跨主机 SSH 发布。

## 手动同步 NSSM

Windows `mode=service` 还依赖一个额外文件：NSSM ZIP。

考虑到 NSSM 更新频率很低，而且中国网络下访问境外源并不稳定，当前建议直接在 `dl.cjj365.cc` 上手动执行一次：

```bash
./sync/bin/fetch-nssm-local.sh
```

这个脚本会读取 `config/env.local`，并把 NSSM 发布到：

```text
${LOCAL_PUBLISH_PATH}/deps/nssm/nssm-2.24-101-g897c7ad.zip
```

Worker 的 Windows service 安装脚本会直接使用镜像地址下载这个文件，不再依赖境外 NSSM 源。