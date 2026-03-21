import { jsonResponse, textResponse } from "../core/response"
import { getInstallerConfig, getLatestVersion } from "../installers"
import type { Env } from "../core/types"

export async function handleLatestRequest(request: Request, installer: string, env: Env): Promise<Response> {
  if (!getInstallerConfig(installer, env)) {
    return textResponse("Unknown installer", 404)
  }

  const sourceName = new URL(request.url).searchParams.get("source") || "mirror"

  try {
    const version = await getLatestVersion(installer, sourceName, env)
    return jsonResponse({ version })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error"
    return textResponse(message, 500)
  }
}