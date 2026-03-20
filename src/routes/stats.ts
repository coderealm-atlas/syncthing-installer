import { jsonResponse, svgResponse, textResponse } from "../core/response"
import type { Env } from "../core/types"
import { readInstallStats, type StatsSnapshot } from "../stats/counter"

export async function handleStatsRequest(request: Request, installer: string, env: Env): Promise<Response> {
  if (installer !== "syncthing") {
    return textResponse("Unknown installer", 404)
  }

  try {
    const stats = await readInstallStats(env)
    const days = parseDays(new URL(request.url).searchParams.get("days"))
    return jsonResponse(buildStatsPayload(stats, days))
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error"
    return textResponse(message, 500)
  }
}

export async function handleStatsBadgeRequest(request: Request, installer: string, env: Env): Promise<Response> {
  if (installer !== "syncthing") {
    return textResponse("Unknown installer", 404)
  }

  try {
    const stats = await readInstallStats(env)
    const url = new URL(request.url)
    const metric = url.searchParams.get("metric") || "total"
    const label = url.searchParams.get("label") || defaultLabelForMetric(metric)
    const value = resolveMetricValue(stats, metric)
    const svg = renderBadge(label, String(value))
    return svgResponse(svg)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error"
    return textResponse(message, 500)
  }
}

function buildStatsPayload(stats: StatsSnapshot, days: number) {
  return {
    ...stats,
    trend: buildTrend(stats.daily, days)
  }
}

function buildTrend(daily: Record<string, number>, days: number) {
  const today = new Date()
  const trend = [] as Array<{ date: string, invocations: number }>

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const current = new Date(Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate() - offset
    ))
    const key = current.toISOString().slice(0, 10)
    trend.push({
      date: key,
      invocations: daily[key] || 0
    })
  }

  return trend
}

function parseDays(value: string | null): number {
  const parsed = Number(value || 7)

  if (!Number.isFinite(parsed)) {
    return 7
  }

  return Math.max(1, Math.min(30, Math.floor(parsed)))
}

function resolveMetricValue(stats: StatsSnapshot, metric: string): number {
  if (metric === "total") {
    return stats.totalInvocations
  }

  if (metric.startsWith("source:")) {
    return stats.sources[metric.slice("source:".length)] || 0
  }

  if (metric.startsWith("platform:")) {
    return stats.platforms[metric.slice("platform:".length)] || 0
  }

  if (metric.startsWith("installer:")) {
    return stats.installers[metric.slice("installer:".length)] || 0
  }

  return stats.totalInvocations
}

function defaultLabelForMetric(metric: string): string {
  if (metric === "total") {
    return "installer invocations"
  }

  if (metric.startsWith("source:")) {
    return `${metric.slice("source:".length)} installs`
  }

  if (metric.startsWith("platform:")) {
    return metric.slice("platform:".length)
  }

  if (metric.startsWith("installer:")) {
    return metric.slice("installer:".length)
  }

  return "installer invocations"
}

function renderBadge(label: string, value: string): string {
  const labelWidth = Math.max(90, label.length * 7 + 16)
  const valueWidth = Math.max(36, value.length * 7 + 16)
  const totalWidth = labelWidth + valueWidth

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${value}">
  <linearGradient id="smooth" x2="0" y2="100%">
    <stop offset="0" stop-color="#fff" stop-opacity=".7"/>
    <stop offset=".1" stop-color="#aaa" stop-opacity=".1"/>
    <stop offset=".9" stop-opacity=".3"/>
    <stop offset="1" stop-opacity=".5"/>
  </linearGradient>
  <clipPath id="round">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#round)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="#4c1"/>
    <rect width="${totalWidth}" height="20" fill="url(#smooth)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${Math.floor(labelWidth / 2)}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${Math.floor(labelWidth / 2)}" y="14">${label}</text>
    <text x="${labelWidth + Math.floor(valueWidth / 2)}" y="15" fill="#010101" fill-opacity=".3">${value}</text>
    <text x="${labelWidth + Math.floor(valueWidth / 2)}" y="14">${value}</text>
  </g>
</svg>`
}