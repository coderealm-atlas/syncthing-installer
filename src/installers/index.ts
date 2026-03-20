import { Env, InstallRequest, InstallerConfig } from "../core/types"
import {
  buildSyncthingInstallScript,
  getSyncthingConfig,
  getSyncthingLatestVersion
} from "./syncthing"

export function getInstallerConfig(installer: string, env?: Env): InstallerConfig | null {
  if (installer === "syncthing") {
    return getSyncthingConfig(env)
  }

  return null
}

export async function buildInstallerScript(request: InstallRequest, env?: Env): Promise<string> {
  if (request.installer === "syncthing") {
    return buildSyncthingInstallScript(request, env)
  }

  throw new Error("Unknown installer")
}

export async function getLatestVersion(installer: string, sourceName = "github", env?: Env): Promise<string> {
  if (installer === "syncthing") {
    return getSyncthingLatestVersion(sourceName, env)
  }

  throw new Error("Unknown installer")
}