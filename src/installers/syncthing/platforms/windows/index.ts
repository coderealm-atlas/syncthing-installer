import { Env, InstallRequest, PlatformRuntime, PlatformVariantConfig } from "../../../../../core/types"
import { resolveMode } from "../../modes"
import { getMirroredNssmZipURL } from "../../sources"
import { generateWindowsPowerShell } from "./common/powershell"
import { win10Variant } from "./variants/win10"
import { win11Variant } from "./variants/win11"

const windowsVariants: PlatformVariantConfig[] = [win10Variant, win11Variant]

export function resolveWindowsRuntime(request: InstallRequest, env?: Env): PlatformRuntime {
  const variant = resolveWindowsVariant(request.variant)
  const mode = resolveMode(request.mode)
  const nssmZipUrl = getMirroredNssmZipURL(env)

  return {
    assetExtension: "zip",
    buildScript(downloadURL: string): string {
      return generateWindowsPowerShell({
        downloadURL,
        nssmZipUrl,
        installDir: request.installDir,
        createTask: request.createTask,
        openBrowser: request.openBrowser,
        modeName: mode.name,
        serviceName: request.serviceName,
        serviceUser: request.serviceUser,
        serviceLogPath: request.serviceLogPath,
        serviceCreateUser: request.serviceCreateUser,
        servicePaths: request.servicePaths,
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