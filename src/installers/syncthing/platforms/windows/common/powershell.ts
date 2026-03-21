import {
  buildWindowsHiddenScriptPath,
  windowsHomeDirExpression,
  windowsServiceHomeDirExpression
} from "./paths"
import { buildScheduledTaskCommand } from "./task"

type WindowsPowerShellOptions = {
  downloadURL: string
  nssmZipUrl: string
  installDir: string
  createTask: boolean
  guiListenAddress: string
  guiURL: string
  tailscaleMode: boolean
  openBrowser: boolean
  modeName: string
  serviceName?: string
  serviceUser?: string
  serviceLogPath?: string
  serviceCreateUser: boolean
  servicePaths: string[]
  variantLabel: string
  modeLabel: string
}

function escapePowerShellString(value: string): string {
  return value.replace(/`/g, "``").replace(/"/g, '`"')
}

export function generateWindowsPowerShell(options: WindowsPowerShellOptions): string {
  if (options.modeName === "service") {
    return generateWindowsServicePowerShell(options)
  }

  const hiddenScriptPath = buildWindowsHiddenScriptPath(options.installDir)
  const taskSchedule = options.modeName === "startup" ? "onstart" : "onlogon"
  const taskCommand = options.createTask ? buildScheduledTaskCommand(hiddenScriptPath, taskSchedule) : ""

  return `
$ErrorActionPreference = "Stop"

$installDir = "${options.installDir}"
$homeDir = ${windowsHomeDirExpression()}
$url = "${options.downloadURL}"
$defaultGuiListenAddress = "${escapePowerShellString(options.guiListenAddress)}"
$defaultGuiUrl = "${escapePowerShellString(options.guiURL)}"
$tailscaleMode = ${options.tailscaleMode ? "$true" : "$false"}
$openBrowser = ${options.openBrowser ? "$true" : "$false"}
$serviceName = "${escapePowerShellString(options.serviceName || "Syncthing")}"

function Resolve-GuiUrl([string]$listenAddress) {
  if ($listenAddress -match '^[a-z]+://') {
    if ($listenAddress.EndsWith('/')) {
      return $listenAddress
    }

    return $listenAddress + '/'
  }

  return 'http://' + $listenAddress + '/'
}

function Resolve-TailscaleGuiListenAddress([string]$fallbackListenAddress) {
  if (-not $tailscaleMode) {
    return $fallbackListenAddress
  }

  $tailscaleCommand = Get-Command tailscale.exe -ErrorAction SilentlyContinue

  if ($tailscaleCommand -eq $null) {
    $tailscaleCommand = Get-Command tailscale -ErrorAction SilentlyContinue
  }

  if ($tailscaleCommand -eq $null) {
    Write-Warning "tailscale=1 was requested, but tailscale is not installed. Falling back to $fallbackListenAddress"
    return $fallbackListenAddress
  }

  $tailscaleIp = (& $tailscaleCommand.Source ip -4 2>$null | Select-Object -First 1).Trim()

  if ([string]::IsNullOrWhiteSpace($tailscaleIp)) {
    Write-Warning "tailscale=1 was requested, but no Tailscale IPv4 address was detected. Falling back to $fallbackListenAddress"
    return $fallbackListenAddress
  }

  $detectedListenAddress = "$tailscaleIp:8384"
  Write-Host "Detected Tailscale GUI listen address: $detectedListenAddress"
  return $detectedListenAddress
}

$guiListenAddress = Resolve-TailscaleGuiListenAddress $defaultGuiListenAddress
$guiUrl = if ($tailscaleMode -and $guiListenAddress -ne $defaultGuiListenAddress) {
  Resolve-GuiUrl $guiListenAddress
} else {
  $defaultGuiUrl
}

function Stop-InstalledSyncthingProcesses([string]$targetInstallDir) {
  $normalizedTarget = [System.IO.Path]::GetFullPath($targetInstallDir).TrimEnd('\\')

  Get-CimInstance Win32_Process -Filter "Name = 'syncthing.exe'" -ErrorAction SilentlyContinue | ForEach-Object {
    if ([string]::IsNullOrWhiteSpace($_.ExecutablePath)) {
      return
    }

    $processPath = [System.IO.Path]::GetFullPath($_.ExecutablePath)

    if ($processPath.StartsWith($normalizedTarget, [System.StringComparison]::OrdinalIgnoreCase)) {
      Invoke-CimMethod -InputObject $_ -MethodName Terminate | Out-Null
    }
  }
}

function Remove-SyncthingScheduledTask() {
  & cmd.exe /d /c 'schtasks.exe /query /tn "Syncthing" >nul 2>&1'

  if ($LASTEXITCODE -eq 0) {
    & cmd.exe /d /c 'schtasks.exe /delete /tn "Syncthing" /f >nul 2>&1'
  }
}

function Remove-SyncthingService([string]$name) {
  $existingService = Get-Service -Name $name -ErrorAction SilentlyContinue

  if ($existingService -eq $null) {
    return
  }

  if ($existingService.Status -ne "Stopped") {
    sc.exe stop $name | Out-Null
    Start-Sleep -Seconds 2
  }

  sc.exe delete $name | Out-Null
  Start-Sleep -Seconds 1
}

Write-Host "安装 Syncthing (${options.variantLabel} / ${options.modeLabel}) 到 $installDir"

Remove-SyncthingService $serviceName
Stop-InstalledSyncthingProcesses $installDir

New-Item -ItemType Directory -Force -Path $installDir | Out-Null
New-Item -ItemType Directory -Force -Path $homeDir | Out-Null

$tmp = Join-Path $env:TEMP "syncthing.zip"
$extractRoot = Join-Path $env:TEMP "syncthing-extract"

if (Test-Path $extractRoot) {
  Remove-Item -Recurse -Force $extractRoot
}

New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null

Invoke-WebRequest $url -OutFile $tmp
Expand-Archive $tmp -DestinationPath $extractRoot -Force

Get-ChildItem $extractRoot | ForEach-Object {
  Copy-Item $_.FullName -Destination $installDir -Recurse -Force
}

$exe = Get-ChildItem $installDir -Recurse -Filter syncthing.exe | Select-Object -First 1

if ($exe -eq $null) {
  Write-Error "未找到 syncthing.exe"
}

$wscriptPath = Join-Path (Join-Path $env:WINDIR "System32") "wscript.exe"
$hidden = Join-Path $installDir "syncthing-hidden.vbs"

@"
Set shell = CreateObject("WScript.Shell")
shell.Run """$($exe.FullName)"" serve --no-browser --no-restart --home ""$homeDir"" --gui-address ""$guiListenAddress""", 0, False
"@ | Out-File $hidden -Encoding ASCII

${taskCommand}

Start-Process -FilePath $wscriptPath -ArgumentList ('"' + $hidden + '"') -WindowStyle Hidden

Remove-Item -Force $tmp
Remove-Item -Recurse -Force $extractRoot

if ($openBrowser) {
  Write-Host "等待 Syncthing 启动并打开 Web 界面..."

  $opened = $false

  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Seconds 1

    try {
      Invoke-WebRequest -Uri $guiUrl -UseBasicParsing -TimeoutSec 2 | Out-Null
      Start-Process $guiUrl
      $opened = $true
      break
    } catch {
    }
  }

  if (-not $opened) {
    Write-Host "Syncthing 已启动，请手动打开 $guiUrl 完成初始化。"
  }
}

Write-Host "安装完成。"
`
}

function generateWindowsServicePowerShell(options: WindowsPowerShellOptions): string {
  const serviceName = escapePowerShellString(options.serviceName || "Syncthing")
  const serviceUser = options.serviceUser ? escapePowerShellString(options.serviceUser) : ""
  const serviceLogPath = options.serviceLogPath ? escapePowerShellString(options.serviceLogPath) : ""
  const servicePaths = options.servicePaths.map((item) => `"${escapePowerShellString(item)}"`).join(", ")

  return `
$ErrorActionPreference = "Stop"

$installDir = "${options.installDir}"
$homeDir = ${windowsServiceHomeDirExpression()}
$url = "${options.downloadURL}"
$defaultGuiListenAddress = "${escapePowerShellString(options.guiListenAddress)}"
$defaultGuiUrl = "${escapePowerShellString(options.guiURL)}"
$tailscaleMode = ${options.tailscaleMode ? "$true" : "$false"}
$openBrowser = ${options.openBrowser ? "$true" : "$false"}
$serviceName = "${serviceName}"
$serviceUser = "${serviceUser}"
$serviceLogPath = "${serviceLogPath}"
$serviceCreateUser = ${options.serviceCreateUser ? "$true" : "$false"}
$servicePaths = @(${servicePaths})
$nssmZipUrl = "${escapePowerShellString(options.nssmZipUrl)}"
$generatedPassword = $null

function Resolve-GuiUrl([string]$listenAddress) {
  if ($listenAddress -match '^[a-z]+://') {
    if ($listenAddress.EndsWith('/')) {
      return $listenAddress
    }

    return $listenAddress + '/'
  }

  return 'http://' + $listenAddress + '/'
}

function Resolve-TailscaleGuiListenAddress([string]$fallbackListenAddress) {
  if (-not $tailscaleMode) {
    return $fallbackListenAddress
  }

  $tailscaleCommand = Get-Command tailscale.exe -ErrorAction SilentlyContinue

  if ($tailscaleCommand -eq $null) {
    $tailscaleCommand = Get-Command tailscale -ErrorAction SilentlyContinue
  }

  if ($tailscaleCommand -eq $null) {
    Write-Warning "tailscale=1 was requested, but tailscale is not installed. Falling back to $fallbackListenAddress"
    return $fallbackListenAddress
  }

  $tailscaleIp = (& $tailscaleCommand.Source ip -4 2>$null | Select-Object -First 1).Trim()

  if ([string]::IsNullOrWhiteSpace($tailscaleIp)) {
    Write-Warning "tailscale=1 was requested, but no Tailscale IPv4 address was detected. Falling back to $fallbackListenAddress"
    return $fallbackListenAddress
  }

  $detectedListenAddress = "$tailscaleIp:8384"
  Write-Host "Detected Tailscale GUI listen address: $detectedListenAddress"
  return $detectedListenAddress
}

$guiListenAddress = Resolve-TailscaleGuiListenAddress $defaultGuiListenAddress
$guiUrl = if ($tailscaleMode -and $guiListenAddress -ne $defaultGuiListenAddress) {
  Resolve-GuiUrl $guiListenAddress
} else {
  $defaultGuiUrl
}

function Resolve-LocalServiceUserName([string]$identity) {
  if ([string]::IsNullOrWhiteSpace($identity)) {
    return $null
  }

  if ($identity.StartsWith('.\\')) {
    return $identity.Substring(2)
  }

  if ($identity -notmatch '[\\@]') {
    return $identity
  }

  return $null
}

function New-RandomServicePassword() {
  $chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*_-'
  -join (1..24 | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
}

function Grant-ModifyAcl([string]$path, [string]$identity) {
  if ([string]::IsNullOrWhiteSpace($path) -or [string]::IsNullOrWhiteSpace($identity)) {
    return
  }

  New-Item -ItemType Directory -Force -Path $path | Out-Null
  & icacls.exe $path /grant ("{0}:(OI)(CI)M" -f $identity) /T /C | Out-Null
}

function Stop-InstalledSyncthingProcesses([string]$targetInstallDir) {
  $normalizedTarget = [System.IO.Path]::GetFullPath($targetInstallDir).TrimEnd('\\')

  Get-CimInstance Win32_Process -Filter "Name = 'syncthing.exe'" -ErrorAction SilentlyContinue | ForEach-Object {
    if ([string]::IsNullOrWhiteSpace($_.ExecutablePath)) {
      return
    }

    $processPath = [System.IO.Path]::GetFullPath($_.ExecutablePath)

    if ($processPath.StartsWith($normalizedTarget, [System.StringComparison]::OrdinalIgnoreCase)) {
      Invoke-CimMethod -InputObject $_ -MethodName Terminate | Out-Null
    }
  }
}

function Remove-SyncthingScheduledTask() {
  & cmd.exe /d /c 'schtasks.exe /query /tn "Syncthing" >nul 2>&1'

  if ($LASTEXITCODE -eq 0) {
    & cmd.exe /d /c 'schtasks.exe /delete /tn "Syncthing" /f >nul 2>&1'
  }
}

function Download-File([string]$url, [string]$destinationPath) {
  Write-Host "下载依赖: $url"
  Invoke-WebRequest $url -OutFile $destinationPath
}

function New-InstallerTempPath([string]$name) {
  return Join-Path $env:TEMP ("syncthing-installer-" + [System.Guid]::NewGuid().ToString("N") + "-" + $name)
}

function Remove-TemporaryPath([string]$path) {
  if (-not (Test-Path $path)) {
    return
  }

  for ($attempt = 0; $attempt -lt 5; $attempt++) {
    try {
      Remove-Item -Recurse -Force -ErrorAction Stop $path
      return
    } catch {
      Start-Sleep -Milliseconds 400
    }
  }

  Write-Warning "临时文件清理失败，可稍后手动删除: $path"
}

Write-Host "安装 Syncthing (${options.variantLabel} / ${options.modeLabel}) 到 $installDir"
Write-Warning "service 模式更适合服务器或无人值守场景。请在安装后尽快为 Syncthing Web GUI 设置用户名和密码。"

Remove-SyncthingScheduledTask
Stop-InstalledSyncthingProcesses $installDir

New-Item -ItemType Directory -Force -Path $installDir | Out-Null
New-Item -ItemType Directory -Force -Path $homeDir | Out-Null

$tmp = New-InstallerTempPath "syncthing.zip"
$extractRoot = New-InstallerTempPath "syncthing-extract"
$nssmZip = New-InstallerTempPath "nssm.zip"
$nssmExtractRoot = New-InstallerTempPath "nssm-extract"
$nssmRuntimePath = New-InstallerTempPath "nssm.exe"

foreach ($path in @($extractRoot, $nssmExtractRoot)) {
  if (Test-Path $path) {
    Remove-TemporaryPath $path
  }
  New-Item -ItemType Directory -Force -Path $path | Out-Null
}

Invoke-WebRequest $url -OutFile $tmp
Expand-Archive $tmp -DestinationPath $extractRoot -Force

Get-ChildItem $extractRoot | ForEach-Object {
  Copy-Item $_.FullName -Destination $installDir -Recurse -Force
}

$exe = Get-ChildItem $installDir -Recurse -Filter syncthing.exe | Select-Object -First 1

if ($exe -eq $null) {
  Write-Error "未找到 syncthing.exe"
}

Download-File $nssmZipUrl $nssmZip
Expand-Archive $nssmZip -DestinationPath $nssmExtractRoot -Force

$nssmArch = if ([Environment]::Is64BitOperatingSystem) { "win64" } else { "win32" }
$nssm = Get-ChildItem $nssmExtractRoot -Recurse -Filter nssm.exe | Where-Object { $_.FullName -match [Regex]::Escape("\\$nssmArch\\") } | Select-Object -First 1

if ($nssm -eq $null) {
  Write-Error "未找到 nssm.exe"
}

Copy-Item -Force $nssm.FullName $nssmRuntimePath

if ($serviceCreateUser) {
  if ($serviceUser -eq "") {
    $serviceUser = ".\\syncthingsvc"
  }

  $localServiceUserName = Resolve-LocalServiceUserName $serviceUser

  if ($null -eq $localServiceUserName) {
    Write-Error "service_create_user=1 只支持本地账号，请使用 .\\用户名 或本地用户名"
  }

  $existingLocalUser = Get-LocalUser -Name $localServiceUserName -ErrorAction SilentlyContinue

  if ($existingLocalUser -eq $null) {
    $generatedPassword = New-RandomServicePassword
    $generatedSecurePassword = ConvertTo-SecureString $generatedPassword -AsPlainText -Force
    New-LocalUser -Name $localServiceUserName -Password $generatedSecurePassword -AccountNeverExpires -PasswordNeverExpires:$true -UserMayNotChangePassword:$true | Out-Null
    Write-Host "已创建本地低权限 service 账号: $serviceUser"
  } else {
    Write-Host "本地 service 账号已存在: $serviceUser"
  }
}

$serviceArgs = '--no-restart --no-browser --home "' + $homeDir + '" --gui-address "' + $guiListenAddress + '"'

$existingService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue

if ($existingService -ne $null) {
  if ($existingService.Status -ne "Stopped") {
    sc.exe stop $serviceName | Out-Null
    Start-Sleep -Seconds 2
  }

  & $nssmRuntimePath remove $serviceName confirm
  Start-Sleep -Seconds 1
}

& $nssmRuntimePath install $serviceName $exe.FullName $serviceArgs
& $nssmRuntimePath set $serviceName AppDirectory $installDir
& $nssmRuntimePath set $serviceName Start SERVICE_AUTO_START
& $nssmRuntimePath set $serviceName AppExit Default Exit
& $nssmRuntimePath set $serviceName AppExit 0 Exit
& $nssmRuntimePath set $serviceName AppExit 3 Restart
& $nssmRuntimePath set $serviceName AppExit 4 Restart

if ($serviceLogPath -ne "") {
  $serviceLogDir = Split-Path -Parent $serviceLogPath

  if ($serviceLogDir -ne "") {
    New-Item -ItemType Directory -Force -Path $serviceLogDir | Out-Null
  }

  & $nssmRuntimePath set $serviceName AppStdout $serviceLogPath
  & $nssmRuntimePath set $serviceName AppStderr $serviceLogPath
}

if ($serviceUser -ne "") {
  Grant-ModifyAcl $installDir $serviceUser
  Grant-ModifyAcl $homeDir $serviceUser

  foreach ($servicePath in $servicePaths) {
    Grant-ModifyAcl $servicePath $serviceUser
  }

  if ($serviceLogPath -ne "") {
    $serviceLogDir = Split-Path -Parent $serviceLogPath

    if ($serviceLogDir -ne "") {
      Grant-ModifyAcl $serviceLogDir $serviceUser
    }
  }

  Write-Host "将 Windows service 账户设置为: $serviceUser"

  if ($generatedPassword -eq $null) {
    $securePassword = Read-Host "请输入 service 账户密码" -AsSecureString
    $passwordPlain = [System.Net.NetworkCredential]::new("", $securePassword).Password
  } else {
    $passwordPlain = $generatedPassword
  }

  & $nssmRuntimePath set $serviceName ObjectName $serviceUser $passwordPlain
  $passwordPlain = $null
  $generatedPassword = $null
}

sc.exe description $serviceName "Syncthing background service installed by syncthing-installer" | Out-Null
sc.exe start $serviceName | Out-Null

Start-Sleep -Milliseconds 500
Remove-TemporaryPath $tmp
Remove-TemporaryPath $nssmZip
Remove-TemporaryPath $extractRoot
Remove-TemporaryPath $nssmExtractRoot
Remove-TemporaryPath $nssmRuntimePath

if ($openBrowser) {
  Write-Host "等待 Syncthing service 启动并打开 Web 界面..."

  $opened = $false

  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Seconds 1

    try {
      Invoke-WebRequest -Uri $guiUrl -UseBasicParsing -TimeoutSec 2 | Out-Null
      Start-Process $guiUrl
      $opened = $true
      break
    } catch {
    }
  }

  if (-not $opened) {
    Write-Host "Syncthing service 已启动，请手动打开 $guiUrl 完成初始化。"
  }
}

Write-Host "安装完成。"
`
}