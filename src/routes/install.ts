import { buildInstallerScript, getInstallerConfig } from "../installers"
import { isSupportedInstallAction, parseInstallRequest } from "../core/request"
import { textResponse } from "../core/response"
import type { Env } from "../core/types"

export async function handleInstallRequest(
  request: Request,
  installer: string,
  action: string,
  env: Env
): Promise<Response> {
  if (!getInstallerConfig(installer, env)) {
    return textResponse("Unknown installer", 404)
  }

  const installRequest = parseInstallRequest(request, installer, action)

  if (!installRequest) {
    return textResponse("Unknown platform", 400)
  }

  if (!isSupportedInstallAction(action, installRequest.platformFamily)) {
    const expectedAction = installRequest.platformFamily === "windows" ? "install.ps1" : "install.sh"
    return textResponse(`Use ${expectedAction} for ${installRequest.platformFamily}`, 400)
  }

  try {
    const script = await buildInstallerScript(installRequest, env)
    return textResponse(script)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error"
    return textResponse(message, 500)
  }
}