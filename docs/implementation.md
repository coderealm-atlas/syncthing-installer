# syncthing-installer 实现说明

## 概述

本项目通过 Cloudflare Worker 提供一个 PowerShell 安装脚本。对于 Windows 安装场景，生成的脚本会下载 Syncthing、解压到目标目录、写入一个隐藏启动包装脚本，并按需创建计划任务，让 Syncthing 自动启动。

## Windows 启动方式

Windows 安装器默认应该创建一个使用 `onlogon` 触发器的计划任务。

相比 `onstart` 或“开机时启动”，这个项目更适合使用 `onlogon`，原因如下：

- 安装是用户级别的，不是整机级别的。
- 可执行文件和包装脚本都位于当前用户的配置目录下。
- Syncthing 的 home 目录同样位于当前用户目录下。
- 在用户登录时启动，可以避免用户配置目录尚未就绪的问题。

以这些路径为例：

- `C:\Users\jiang\AppData\Local\Programs\Syncthing\syncthing.exe`
- `C:\Users\jiang\AppData\Local\Programs\Syncthing\syncthing-hidden.vbs`
- `C:\Users\jiang\AppData\Local\Syncthing`

默认使用 `onlogon` 计划任务是正确的选择。

## 隐藏启动包装脚本

安装器会在 `syncthing.exe` 同级目录写入 `syncthing-hidden.vbs`，并通过 `wscript.exe` 启动它，从而避免弹出控制台窗口。

计划任务使用的命令示例：

```text
C:\Windows\System32\wscript.exe C:\Users\jiang\AppData\Local\Programs\Syncthing\syncthing-hidden.vbs
```

VBS 内容示例：

```vbscript
Set shell = CreateObject("WScript.Shell")
shell.Run """C:\Users\jiang\AppData\Local\Programs\Syncthing\syncthing.exe"" serve --no-browser --no-restart --home ""C:\Users\jiang\AppData\Local\Syncthing""", 0, False
```

行为说明：

- `wscript.exe` 会以 VBScript Host 的方式运行脚本，不打开控制台窗口。
- `shell.Run(..., 0, False)` 会以隐藏窗口方式启动 Syncthing。
- `--no-browser` 表示不要自动打开 Web UI。
- `--no-restart` 表示不要让 Syncthing 在计划任务模型之外自行重启。
- `--home` 用来明确指定配置目录位于当前用户目录下。

## 计划任务建议形式

推荐的任务定义：

- 触发器：`At log on`
- 作用范围：当前用户
- 动作：运行 `wscript.exe`，参数为 `syncthing-hidden.vbs` 的路径
- 任务名称：`Syncthing`

参考命令：

```text
schtasks /create /sc onlogon /tn Syncthing /tr "C:\Windows\System32\wscript.exe C:\Users\jiang\AppData\Local\Programs\Syncthing\syncthing-hidden.vbs" /f
```

如果希望计划任务明确绑定到当前用户，也可以额外带上 `/ru <username>`。

## 为什么不使用开机启动

只有在 Syncthing 被安装为整机级后台进程时，`On startup` 才更合理，例如：

- 二进制文件存放在系统级目录中
- 配置目录不在某个具体用户的 profile 下
- 任务或服务运行在服务账号或 `SYSTEM` 身份下

这和当前安装器的部署模型不同。按照目前的用户级目录布局，登录时启动是更安全也更简单的实现方式。

## 当前 Worker 的行为

当前 Worker 实现已经基本符合这个方向：

- 会生成一个 VBS 包装脚本
- 可以按需创建计划任务
- 计划任务使用 `schtasks /create /sc onlogon`
- 安装完成后会主动等待本地 Web GUI 就绪，并打开 `http://127.0.0.1:8384/`，便于首次初始化和触发防火墙放行提示

还有一个实现细节值得继续对齐：当前生成的 VBS 命令行。只要已知 home 路径，Windows 包装脚本就应该显式带上该路径，这样运行行为才会与预期的用户级目录布局保持一致。

## 关于 system service 模式

Syncthing 官方文档明确提到，真正独立于用户登录的 Windows service 模式更适合服务器或无人值守场景，而不是普通桌面用户。

原因主要有两点：

- 这类模式通常需要借助 NSSM 之类的第三方工具来托管服务
- 如果 GUI 和 REST API 没有正确加固，service 模式会放大权限与暴露面的风险

因此当前安装器仍然把“用户登录后在后台启动”作为默认方案。对于绝大多数 Windows 桌面用户，这是更稳妥的选择。

## 当前支持的 Windows 运行模式

当前安装器对 Windows 提供三种模式：

- `mode=default`：用户登录后通过任务计划程序在后台启动
- `mode=startup`：通过任务计划程序在系统启动时启动
- `mode=service`：使用 NSSM 安装为独立 Windows service

其中：

- `default` 仍然是普通桌面用户的推荐模式
- `startup` 适合希望机器开机后即开始同步，但仍不想引入 Windows service 的场景
- `service` 更接近服务器部署方式，适合长时间无人登录的机器

`service` 模式当前会自动下载 NSSM，并用它把 Syncthing 注册为名为 `Syncthing` 的 Windows service。为了降低配置复杂度，当前脚本会先以 service 默认账户安装并启动，因此更需要在首次启动后尽快完成 GUI 安全设置。

为了让这个模式更适合服务器场景，当前脚本还支持以下可选参数：

- `service_name`：自定义 Windows service 名称
- `service_user`：指定服务运行账号；脚本会在安装时交互式提示输入密码，而不是把密码放进 URL
- `service_log`：配置 NSSM 的 stdout/stderr 输出文件
- `service_create_user`：自动创建本地低权限账号，并用它运行 service
- `service_paths`：为指定的数据目录授予 service 账号所需的修改权限

如果同名 service 已存在，脚本会先尝试停止并移除旧 service，然后再按新的参数重新安装。

如果启用了 `service_create_user=1`，当前脚本会：

- 自动创建一个本地普通用户账号
- 把安装目录、配置目录、日志目录和 `service_paths` 指定目录的 ACL 授给这个账号
- 再用该账号配置 NSSM service

这样可以避免直接使用管理员账号或默认的 `LocalSystem`。