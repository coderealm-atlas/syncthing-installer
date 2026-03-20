import { InstallModeConfig } from "../../../core/types"
import { defaultMode } from "./default"

const modes: Record<string, InstallModeConfig> = {
  [defaultMode.name]: defaultMode
}

export function resolveMode(name: string): InstallModeConfig {
  return modes[name] || defaultMode
}