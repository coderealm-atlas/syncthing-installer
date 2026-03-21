import { InstallRequest, PlatformRuntime } from "../../../../../core/types"
import { resolveMode } from "../../modes"
import { generateFreeBSDShell } from "./common/shell"

export function resolveFreeBSDRuntime(request: InstallRequest): PlatformRuntime {
  const mode = resolveMode(request.mode)

  return {
    assetExtension: "tar.gz",
    buildScript(downloadURL: string): string {
      return generateFreeBSDShell({
        downloadURL,
        installDir: request.installDir,
        guiListenAddress: request.guiListenAddress,
        guiURL: request.guiURL,
        tailscaleMode: request.tailscaleMode,
        openBrowser: request.openBrowser,
        modeName: mode.name,
        serviceUser: request.serviceUser,
        variantLabel: `FreeBSD / ${mode.label}`
      })
    }
  }
}
