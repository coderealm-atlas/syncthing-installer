export function buildWindowsHiddenScriptPath(installDir: string): string {
  return `${installDir}\\syncthing-hidden.vbs`
}

export function windowsHomeDirExpression(): string {
  return 'Join-Path $env:LOCALAPPDATA "Syncthing"'
}

export function windowsServiceHomeDirExpression(): string {
  return 'Join-Path $env:ProgramData "Syncthing"'
}