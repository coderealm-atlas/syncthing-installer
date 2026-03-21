import { InstallRequest, PlatformFamily } from "./types"

type ParsedRoute = {
  installer: string
  action: string
}

export function parseRoute(request: Request): ParsedRoute | null {
  const url = new URL(request.url)
  const parts = url.pathname.split("/").filter(Boolean)

  if (parts.length < 2) {
    return null
  }

  return {
    installer: parts[0].replace("-installer", ""),
    action: parts[1]
  }
}

export function parseInstallRequest(
  request: Request,
  installer: string,
  action: string
): InstallRequest | null {
  const url = new URL(request.url)
  const platform = url.searchParams.get("platform") || "windows-amd64"
  const platformFamily = resolvePlatformFamily(platform)

  if (!platformFamily) {
    return null
  }

  return {
    installer,
    action,
    platform,
    platformFamily,
    sourceName: url.searchParams.get("source") || "github",
    version: url.searchParams.get("version") || undefined,
    installDir: url.searchParams.get("dir") || defaultInstallDir(platformFamily),
    createTask: url.searchParams.get("task") !== "0",
    openBrowser: url.searchParams.get("open") !== "0",
    serviceName: url.searchParams.get("service_name") || undefined,
    serviceUser: url.searchParams.get("service_user") || undefined,
    serviceLogPath: url.searchParams.get("service_log") || undefined,
    serviceCreateUser: url.searchParams.get("service_create_user") === "1",
    servicePaths: (url.searchParams.get("service_paths") || "")
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean),
    variant: url.searchParams.get("variant") || defaultVariant(platformFamily),
    mode: url.searchParams.get("mode") || "default"
  }
}

export function isSupportedInstallAction(action: string, platformFamily: PlatformFamily): boolean {
  if (platformFamily === "windows") {
    return action === "install.ps1"
  }

  return action === "install.sh"
}

function resolvePlatformFamily(platform: string): PlatformFamily | null {
  if (platform.startsWith("windows")) {
    return "windows"
  }

  if (platform.startsWith("linux")) {
    return "linux"
  }

  if (platform.startsWith("macos") || platform.startsWith("darwin")) {
    return "macos"
  }

  return null
}

function defaultInstallDir(platformFamily: PlatformFamily): string {
  switch (platformFamily) {
    case "windows":
      return "C:\\\\Syncthing"
    case "linux":
      return "/opt/syncthing"
    case "macos":
      return "/Applications/Syncthing"
  }
}

function defaultVariant(platformFamily: PlatformFamily): string {
  switch (platformFamily) {
    case "windows":
      return "win11"
    case "linux":
      return "ubuntu"
    case "macos":
      return "darwin"
  }
}