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
$guiUrl = "http://127.0.0.1:8384/"
$openBrowser = ${options.openBrowser ? "$true" : "$false"}
$serviceName = "${escapePowerShellString(options.serviceName || "Syncthing")}"

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
  & schtasks.exe /query /tn Syncthing | Out-Null 2>&1

  if ($LASTEXITCODE -eq 0) {
    & schtasks.exe /delete /tn Syncthing /f | Out-Null
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
shell.Run """$($exe.FullName)"" serve --no-browser --no-restart --home ""$homeDir""", 0, False
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
$guiUrl = "http://127.0.0.1:8384/"
$openBrowser = ${options.openBrowser ? "$true" : "$false"}
$serviceName = "${serviceName}"
$serviceUser = "${serviceUser}"
$serviceLogPath = "${serviceLogPath}"
$serviceCreateUser = ${options.serviceCreateUser ? "$true" : "$false"}
$servicePaths = @(${servicePaths})
$nssmZipUrl = "${escapePowerShellString(options.nssmZipUrl)}"
$generatedPassword = $null

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
  & schtasks.exe /query /tn Syncthing | Out-Null 2>&1

  if ($LASTEXITCODE -eq 0) {
    & schtasks.exe /delete /tn Syncthing /f | Out-Null
  }
}

function Download-File([string]$url, [string]$destinationPath) {
  Write-Host "下载依赖: $url"
  Invoke-WebRequest $url -OutFile $destinationPath
}

function Remove-TemporaryPath([string]$path) {
  if (-not (Test-Path $path)) {
    return
  }

  try {
    Remove-Item -Recurse -Force -ErrorAction Stop $path
  } catch {
    Write-Warning "临时文件清理失败，可稍后手动删除: $path"
  }
}

Write-Host "安装 Syncthing (${options.variantLabel} / ${options.modeLabel}) 到 $installDir"
Write-Warning "service 模式更适合服务器或无人值守场景。请在安装后尽快为 Syncthing Web GUI 设置用户名和密码。"

Remove-SyncthingScheduledTask
Stop-InstalledSyncthingProcesses $installDir

New-Item -ItemType Directory -Force -Path $installDir | Out-Null
New-Item -ItemType Directory -Force -Path $homeDir | Out-Null

$tmp = Join-Path $env:TEMP "syncthing.zip"
$extractRoot = Join-Path $env:TEMP "syncthing-extract"
$nssmZip = Join-Path $env:TEMP "nssm.zip"
$nssmExtractRoot = Join-Path $env:TEMP "nssm-extract"

foreach ($path in @($extractRoot, $nssmExtractRoot)) {
  if (Test-Path $path) {
    Remove-Item -Recurse -Force $path
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

$serviceArgs = '--no-restart --no-browser --home "' + $homeDir + '"'

$existingService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue

if ($existingService -ne $null) {
  if ($existingService.Status -ne "Stopped") {
    sc.exe stop $serviceName | Out-Null
    Start-Sleep -Seconds 2
  }

  & $nssm.FullName remove $serviceName confirm
  Start-Sleep -Seconds 1
}

& $nssm.FullName install $serviceName $exe.FullName $serviceArgs
& $nssm.FullName set $serviceName AppDirectory $installDir
& $nssm.FullName set $serviceName Start SERVICE_AUTO_START
& $nssm.FullName set $serviceName AppExit Default Exit
& $nssm.FullName set $serviceName AppExit 0 Exit
& $nssm.FullName set $serviceName AppExit 3 Restart
& $nssm.FullName set $serviceName AppExit 4 Restart

if ($serviceLogPath -ne "") {
  $serviceLogDir = Split-Path -Parent $serviceLogPath

  if ($serviceLogDir -ne "") {
    New-Item -ItemType Directory -Force -Path $serviceLogDir | Out-Null
  }

  & $nssm.FullName set $serviceName AppStdout $serviceLogPath
  & $nssm.FullName set $serviceName AppStderr $serviceLogPath
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

  & $nssm.FullName set $serviceName ObjectName $serviceUser $passwordPlain
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