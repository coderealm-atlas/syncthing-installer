import { InstallRequest, PlatformRuntime, PlatformVariantConfig } from "../../../../../core/types"
import { resolveMode } from "../../modes"
import { generateWindowsPowerShell } from "./common/powershell"
import { win10Variant } from "./variants/win10"
import { win11Variant } from "./variants/win11"

const windowsVariants: PlatformVariantConfig[] = [win10Variant, win11Variant]

export function resolveWindowsRuntime(request: InstallRequest): PlatformRuntime {
  const variant = resolveWindowsVariant(request.variant)
  const mode = resolveMode(request.mode)

  return {
    assetExtension: "zip",
    buildScript(downloadURL: string): string {
      return generateWindowsPowerShell({
        downloadURL,
        installDir: request.installDir,
        createTask: request.createTask,
        variantLabel: variant.label,
        modeLabel: mode.label
      })
    }
  }
}

function resolveWindowsVariant(name: string): PlatformVariantConfig {
  const normalizedName = name.toLowerCase()

  return windowsVariants.find((variant) => {
    return variant.name === normalizedName || variant.aliases?.includes(normalizedName)
  }) || win11Variant
}