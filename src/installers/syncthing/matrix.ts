import { Env, InstallRequest, PlatformRuntime } from "../../core/types"
import { resolveFreeBSDRuntime } from "./platforms/freebsd"
import { resolveLinuxRuntime } from "./platforms/linux"
import { resolveMacOSRuntime } from "./platforms/macos"
import { resolveWindowsRuntime } from "./platforms/windows"

export function resolvePlatformRuntime(request: InstallRequest, env?: Env): PlatformRuntime {
  switch (request.platformFamily) {
    case "windows":
      return resolveWindowsRuntime(request, env)
    case "linux":
      return resolveLinuxRuntime(request)
    case "freebsd":
      return resolveFreeBSDRuntime(request)
    case "macos":
      return resolveMacOSRuntime(request)
  }
}