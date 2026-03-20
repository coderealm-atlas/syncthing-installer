
import { parseRoute } from "./core/request"
import { textResponse } from "./core/response"
import type { Env } from "./core/types"
import { handleInstallRequest } from "./routes/install"
import { handleLatestRequest } from "./routes/latest"

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    const route = parseRoute(request)

    if (!route) {
      return textResponse("Invalid path", 404)
    }

    if (route.action === "latest") {
      return handleLatestRequest(request, route.installer, _env)
    }

    if (route.action.startsWith("install.")) {
      return handleInstallRequest(request, route.installer, route.action, _env)
    }

    return textResponse("Not found", 404)
  }
}
