import { InstallRequest, PlatformRuntime, PlatformVariantConfig } from "../../../../../core/types"
import { resolveMode } from "../../modes"
import { generateLinuxShell } from "./common/shell"
import { genericLinuxVariant } from "./variants/generic"

const linuxVariants: PlatformVariantConfig[] = [genericLinuxVariant]

export function resolveLinuxRuntime(request: InstallRequest): PlatformRuntime {
  const variant = resolveLinuxVariant(request.variant)
  const mode = resolveMode(request.mode)

  return {
    assetExtension: "tar.gz",
    buildScript(downloadURL: string): string {
      return generateLinuxShell({
        downloadURL,
        installDir: request.installDir,
        guiListenAddress: request.guiListenAddress,
        guiURL: request.guiURL,
        tailscaleMode: request.tailscaleMode,
        openBrowser: request.openBrowser,
        modeName: mode.name,
        serviceUser: request.serviceUser,
        variantLabel: `${variant.label} / ${mode.label}`
      })
    }
  }
}

function resolveLinuxVariant(name: string): PlatformVariantConfig {
  const normalizedName = name.toLowerCase()

  return linuxVariants.find((variant) => {
    return variant.name === normalizedName || variant.aliases?.includes(normalizedName)
  }) || genericLinuxVariant
}