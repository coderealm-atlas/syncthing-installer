import { buildDownloadURL } from "../../core/downloads"
import { Env, InstallRequest, InstallerConfig, SourceConfig } from "../../core/types"
import { resolveVersion } from "../../core/versions"
import { resolvePlatformRuntime } from "./matrix"
import { getSyncthingInstallerConfig } from "./sources"

export function getSyncthingConfig(env?: Env): InstallerConfig {
  return getSyncthingInstallerConfig(env)
}

export async function buildSyncthingInstallScript(request: InstallRequest, env?: Env): Promise<string> {
  const sources = getSyncthingInstallerConfig(env).sources
  const source = sources[request.sourceName]

  if (!source) {
    throw new Error("Unknown source")
  }

  const runtime = resolvePlatformRuntime(request, env)
  const resolved = await resolveSourceAndVersion(request.sourceName, request.version, sources)
  let downloadURL = buildDownloadURL(
    resolved.source,
    resolved.version,
    request.platform,
    runtime.assetExtension,
    resolved.usedLatestPath
  )

  if (request.sourceName === "mirror" && resolved.source === source) {
    const hasMirroredAsset = await assetExists(downloadURL)

    if (!hasMirroredAsset) {
      const fallbackSource = sources.github

      if (fallbackSource) {
        downloadURL = buildDownloadURL(
          fallbackSource,
          resolved.version,
          request.platform,
          runtime.assetExtension,
          false
        )
      }
    }
  }

  return runtime.buildScript(downloadURL, request)
}

export async function getSyncthingLatestVersion(sourceName = "mirror", env?: Env): Promise<string> {
  const sources = getSyncthingInstallerConfig(env).sources
  const source = sources[sourceName]

  if (!source) {
    throw new Error("Unknown source")
  }

  const resolved = await resolveSourceAndVersion(sourceName, undefined, sources)
  return resolved.version
}

async function resolveSourceAndVersion(
  sourceName: string,
  requestedVersion: string | undefined,
  sources: Record<string, SourceConfig>
): Promise<{ source: SourceConfig, version: string, usedLatestPath: boolean }> {
  const source = sources[sourceName]

  if (!source) {
    throw new Error("Unknown source")
  }

  if (requestedVersion) {
    return {
      source,
      version: requestedVersion,
      usedLatestPath: false
    }
  }

  try {
    return {
      source,
      version: await resolveVersion(source),
      usedLatestPath: sourceName === "mirror"
    }
  } catch (error) {
    if (sourceName !== "mirror") {
      throw error
    }

    const fallbackSource = sources.github

    if (!fallbackSource) {
      throw error
    }

    return {
      source: fallbackSource,
      version: await resolveVersion(fallbackSource),
      usedLatestPath: false
    }
  }
}

async function assetExists(url: string): Promise<boolean> {
  try {
    const headResponse = await fetch(url, {
      method: "HEAD",
      redirect: "follow"
    })

    if (headResponse.ok) {
      return true
    }

    if (headResponse.status !== 403 && headResponse.status !== 405) {
      return false
    }

    const getResponse = await fetch(url, {
      method: "GET",
      headers: {
        Range: "bytes=0-0"
      },
      redirect: "follow"
    })

    return getResponse.ok || getResponse.status === 206
  } catch {
    return false
  }
}