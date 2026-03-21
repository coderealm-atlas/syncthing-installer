export interface Env {
  MIRROR_BASE_URL?: string
  STATS_COUNTER?: DurableObjectNamespace
}

export type PlatformFamily = "windows" | "linux" | "macos" | "freebsd"

export type SourceConfig = {
  api?: string
  base?: string
  downloadPath?: string
  latestDownloadPath?: string
  pattern: string
}

export type InstallerConfig = {
  sources: Record<string, SourceConfig>
}

export type InstallRequest = {
  installer: string
  action: string
  platform: string
  platformFamily: PlatformFamily
  guiListenAddress: string
  guiURL: string
  tailscaleMode: boolean
  sourceName: string
  version?: string
  installDir: string
  createTask: boolean
  openBrowser: boolean
  serviceName?: string
  serviceUser?: string
  serviceLogPath?: string
  serviceCreateUser: boolean
  servicePaths: string[]
  variant: string
  mode: string
}

export type PlatformVariantConfig = {
  name: string
  label: string
  aliases?: string[]
}

export type InstallModeConfig = {
  name: string
  label: string
}

export type PlatformRuntime = {
  assetExtension: string
  buildScript: (downloadURL: string, request: InstallRequest) => string
}