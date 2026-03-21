export function buildScheduledTaskCommand(hiddenScriptPath: string, schedule: "onlogon" | "onstart"): string {
  return [
    '$taskTarget = "`"$wscriptPath`" `"$hidden`""',
    `& schtasks.exe /create /sc ${schedule} /tn Syncthing /tr $taskTarget /f`
  ].join("\n")
}