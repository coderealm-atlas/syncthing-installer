import { SourceConfig } from "./types"

export async function resolveVersion(source: SourceConfig, requested?: string): Promise<string> {
  if (requested) {
    return requested
  }

  if (!source.api) {
    throw new Error("Source has no API for latest version")
  }

  const response = await fetch(source.api, {
    headers: { "User-Agent": "cf-worker-installer" }
  })

  if (!response.ok) {
    throw new Error(`Failed to resolve latest version: ${response.status}`)
  }

  const payload = await response.json() as { tag_name?: string }

  const rawVersion = payload.tag_name || (payload as { version?: string }).version

  if (!rawVersion) {
    throw new Error("Latest version response did not include tag_name or version")
  }

  return rawVersion.replace(/^v/, "")
}