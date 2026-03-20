import { InstallRequest, PlatformRuntime, PlatformVariantConfig } from "../../../../../core/types"
import { resolveMode } from "../../modes"
import { generateLinuxShell } from "./common/shell"
import { debianVariant } from "./variants/debian"
import { suseVariant } from "./variants/suse"
import { ubuntuVariant } from "./variants/ubuntu"

const linuxVariants: PlatformVariantConfig[] = [debianVariant, ubuntuVariant, suseVariant]

export function resolveLinuxRuntime(request: InstallRequest): PlatformRuntime {
  const variant = resolveLinuxVariant(request.variant)
  const mode = resolveMode(request.mode)

  return {
    assetExtension: "tar.gz",
    buildScript(downloadURL: string): string {
      return generateLinuxShell({
        downloadURL,
        installDir: request.installDir,
        variantLabel: `${variant.label} / ${mode.label}`
      })
    }
  }
}

function resolveLinuxVariant(name: string): PlatformVariantConfig {
  const normalizedName = name.toLowerCase()

  return linuxVariants.find((variant) => {
    return variant.name === normalizedName || variant.aliases?.includes(normalizedName)
  }) || ubuntuVariant
}