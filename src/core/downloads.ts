import { SourceConfig } from "./types"

export function buildDownloadURL(
  source: SourceConfig,
  version: string,
  platform: string,
  assetExtension: string,
  useLatestPath = false
): string {
  const file = source.pattern
    .replace("{version}", version)
    .replace("{platform}", platform)
    .replace("{archive}", assetExtension)
  const tagVersion = `v${version}`

  if (!source.base) {
    throw new Error("Source missing base URL")
  }

  const pathTemplate = useLatestPath && source.latestDownloadPath
    ? source.latestDownloadPath
    : (source.downloadPath || "{tagVersion}/{file}")

  const downloadPath = pathTemplate
    .replace("{version}", version)
    .replace("{tagVersion}", tagVersion)
    .replace("{file}", file)

  return `${source.base}/${downloadPath}`
}