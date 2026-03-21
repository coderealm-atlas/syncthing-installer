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
  const mode = url.searchParams.get("mode") || "default"
  const explicitListenOn = url.searchParams.get("listenon") || undefined
  const guiListenAddress = normalizeListenOn(explicitListenOn)
  const tailscaleMode = !explicitListenOn && url.searchParams.get("tailscale") === "1"

  if (!platformFamily) {
    return null
  }

  return {
    installer,
    action,
    platform,
    platformFamily,
    guiListenAddress,
    guiURL: buildGuiURL(guiListenAddress),
    tailscaleMode,
    sourceName: url.searchParams.get("source") || "mirror",
    version: url.searchParams.get("version") || undefined,
    installDir: url.searchParams.get("dir") || defaultInstallDir(platformFamily, mode),
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
    mode
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

  if (platform.startsWith("freebsd")) {
    return "freebsd"
  }

  if (platform.startsWith("macos") || platform.startsWith("darwin")) {
    return "macos"
  }

  return null
}

function defaultInstallDir(platformFamily: PlatformFamily, mode: string): string {
  switch (platformFamily) {
    case "windows":
      return "C:\\\\Syncthing"
    case "linux":
      return mode === "service" ? "/usr/local/lib/syncthing" : "$HOME/.local/lib/syncthing"
    case "freebsd":
      return mode === "service" ? "/usr/local/lib/syncthing" : "$HOME/.local/lib/syncthing"
    case "macos":
      return "/Applications/Syncthing"
  }
}

function defaultVariant(platformFamily: PlatformFamily): string {
  switch (platformFamily) {
    case "windows":
      return "win11"
    case "linux":
      return "linux"
    case "freebsd":
      return "freebsd"
    case "macos":
      return "darwin"
  }
}

function normalizeListenOn(listenOn?: string): string {
  const defaultAddress = "127.0.0.1:8384"

  if (!listenOn) {
    return defaultAddress
  }

  const trimmed = listenOn.trim()

  if (!trimmed) {
    return defaultAddress
  }

  if (trimmed === "*" || trimmed.toLowerCase() === "all") {
    return "0.0.0.0:8384"
  }

  if (/^[a-z]+:\/\//i.test(trimmed)) {
    return trimmed
  }

  if (trimmed.startsWith("[")) {
    return trimmed.includes("]:") ? trimmed : `${trimmed}:8384`
  }

  if (trimmed.includes(":")) {
    return trimmed
  }

  return `${trimmed}:8384`
}

function buildGuiURL(guiListenAddress: string): string {
  if (/^[a-z]+:\/\//i.test(guiListenAddress)) {
    return guiListenAddress.endsWith("/") ? guiListenAddress : `${guiListenAddress}/`
  }

  if (guiListenAddress === "0.0.0.0:8384" || guiListenAddress === "[::]:8384") {
    return "http://127.0.0.1:8384/"
  }

  return `http://${guiListenAddress}/`
}