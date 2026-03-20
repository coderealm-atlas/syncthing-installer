import { InstallRequest, PlatformRuntime } from "../../core/types"
import { resolveLinuxRuntime } from "./platforms/linux"
import { resolveMacOSRuntime } from "./platforms/macos"
import { resolveWindowsRuntime } from "./platforms/windows"

export function resolvePlatformRuntime(request: InstallRequest): PlatformRuntime {
  switch (request.platformFamily) {
    case "windows":
      return resolveWindowsRuntime(request)
    case "linux":
      return resolveLinuxRuntime(request)
    case "macos":
      return resolveMacOSRuntime(request)
  }
}