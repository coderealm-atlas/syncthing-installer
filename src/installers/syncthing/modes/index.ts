import { InstallModeConfig } from "../../../core/types"
import { defaultMode } from "./default"
import { serviceMode } from "./service"
import { startupMode } from "./startup"

const modes: Record<string, InstallModeConfig> = {
  [defaultMode.name]: defaultMode,
  [startupMode.name]: startupMode,
  [serviceMode.name]: serviceMode
}

export function resolveMode(name: string): InstallModeConfig {
  return modes[name] || defaultMode
}