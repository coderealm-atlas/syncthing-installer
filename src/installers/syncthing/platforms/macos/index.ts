import { InstallRequest, PlatformRuntime } from "../../../../../core/types"
import { resolveMode } from "../../modes"
import { generateMacOSShell } from "./common/shell"
import { darwinVariant } from "./variants/darwin"

export function resolveMacOSRuntime(request: InstallRequest): PlatformRuntime {
  const mode = resolveMode(request.mode)

  return {
    assetExtension: "zip",
    buildScript(downloadURL: string): string {
      return generateMacOSShell({
        downloadURL,
        installDir: request.installDir,
        variantLabel: `${darwinVariant.label} / ${mode.label}`
      })
    }
  }
}