import { buildWindowsHiddenScriptPath, windowsHomeDirExpression } from "./paths"
import { buildScheduledTaskCommand } from "./task"

type WindowsPowerShellOptions = {
  downloadURL: string
  installDir: string
  createTask: boolean
  variantLabel: string
  modeLabel: string
}

export function generateWindowsPowerShell(options: WindowsPowerShellOptions): string {
  const hiddenScriptPath = buildWindowsHiddenScriptPath(options.installDir)
  const taskCommand = options.createTask ? buildScheduledTaskCommand(hiddenScriptPath) : ""

  return `
$ErrorActionPreference = "Stop"

$installDir = "${options.installDir}"
$homeDir = ${windowsHomeDirExpression()}
$url = "${options.downloadURL}"

Write-Host "安装 Syncthing (${options.variantLabel} / ${options.modeLabel}) 到 $installDir"

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

$hidden = Join-Path $installDir "syncthing-hidden.vbs"

@"
Set shell = CreateObject("WScript.Shell")
shell.Run """$($exe.FullName)"" serve --no-browser --no-restart --home ""$homeDir""", 0, False
"@ | Out-File $hidden -Encoding ASCII

${taskCommand}

Start-Process -FilePath "C:\Windows\System32\wscript.exe" -ArgumentList ('"' + $hidden + '"') -WindowStyle Hidden

Remove-Item -Force $tmp
Remove-Item -Recurse -Force $extractRoot

Write-Host "安装完成。"
`
}