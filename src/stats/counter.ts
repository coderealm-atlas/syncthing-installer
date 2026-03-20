import { DurableObject } from "cloudflare:workers"
import type { InstallRequest } from "../core/types"

export type StatsSnapshot = {
  totalInvocations: number
  installers: Record<string, number>
  platforms: Record<string, number>
  sources: Record<string, number>
  daily: Record<string, number>
  updatedAt: string | null
}

const EMPTY_SNAPSHOT: StatsSnapshot = {
  totalInvocations: 0,
  installers: {},
  platforms: {},
  sources: {},
  daily: {},
  updatedAt: null
}

export class StatsCounter extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === "POST" && url.pathname === "/increment") {
      const payload = await request.json() as InstallRequest
      const snapshot = await this.increment(payload)
      return Response.json(snapshot)
    }

    if (request.method === "GET" && url.pathname === "/snapshot") {
      return Response.json(await this.readSnapshot())
    }

    return new Response("Not found", { status: 404 })
  }

  private async increment(payload: InstallRequest): Promise<StatsSnapshot> {
    const snapshot = await this.readSnapshot()
    const dailyKey = new Date().toISOString().slice(0, 10)

    snapshot.totalInvocations += 1
    snapshot.installers[payload.installer] = (snapshot.installers[payload.installer] || 0) + 1
    snapshot.platforms[payload.platform] = (snapshot.platforms[payload.platform] || 0) + 1
    snapshot.sources[payload.sourceName] = (snapshot.sources[payload.sourceName] || 0) + 1
    snapshot.daily[dailyKey] = (snapshot.daily[dailyKey] || 0) + 1
    snapshot.updatedAt = new Date().toISOString()

    await this.ctx.storage.put("stats", snapshot)
    return snapshot
  }

  private async readSnapshot(): Promise<StatsSnapshot> {
    const stored = await this.ctx.storage.get<Partial<StatsSnapshot>>("stats")

    return {
      ...EMPTY_SNAPSHOT,
      ...stored,
      installers: stored?.installers || {},
      platforms: stored?.platforms || {},
      sources: stored?.sources || {},
      daily: stored?.daily || {}
    }
  }
}

export async function recordInstallInvocation(request: InstallRequest, env: { STATS_COUNTER?: DurableObjectNamespace }): Promise<void> {
  if (!env.STATS_COUNTER) {
    return
  }

  const stub = env.STATS_COUNTER.getByName("global")
  await stub.fetch("https://stats/increment", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request)
  })
}

export async function readInstallStats(env: { STATS_COUNTER?: DurableObjectNamespace }): Promise<StatsSnapshot> {
  if (!env.STATS_COUNTER) {
    return { ...EMPTY_SNAPSHOT }
  }

  const stub = env.STATS_COUNTER.getByName("global")
  const response = await stub.fetch("https://stats/snapshot")

  if (!response.ok) {
    throw new Error(`Failed to read stats: ${response.status}`)
  }

  return await response.json() as StatsSnapshot
}