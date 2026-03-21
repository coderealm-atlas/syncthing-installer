import { SourceConfig } from "./types"

export async function resolveVersion(source: SourceConfig, requested?: string): Promise<string> {
  if (requested) {
    return requested
  }

  if (!source.api) {
    throw new Error("Source has no API for latest version")
  }

  const response = await fetch(source.api, {
    headers: {
      "User-Agent": "cf-worker-installer",
      Accept: "application/vnd.github+json, application/json;q=0.9, */*;q=0.8"
    }
  })

  if (!response.ok) {
    const fallbackVersion = await resolveGithubVersionFromReleaseRedirect(source)

    if (fallbackVersion) {
      return fallbackVersion
    }

    throw new Error(`Failed to resolve latest version: ${response.status}`)
  }

  const payload = await response.json() as { tag_name?: string }

  const rawVersion = payload.tag_name || (payload as { version?: string }).version

  if (!rawVersion) {
    throw new Error("Latest version response did not include tag_name or version")
  }

  return rawVersion.replace(/^v/, "")
}

async function resolveGithubVersionFromReleaseRedirect(source: SourceConfig): Promise<string | null> {
  const repoRoot = getGithubRepoRoot(source)

  if (!repoRoot) {
    return null
  }

  const latestUrl = `${repoRoot}/releases/latest`

  const manualRedirectResponse = await fetch(latestUrl, {
    redirect: "manual",
    headers: {
      "User-Agent": "cf-worker-installer",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  })

  const location = manualRedirectResponse.headers.get("location")
  const redirectedVersion = extractVersionFromGithubReleaseURL(location)

  if (redirectedVersion) {
    return redirectedVersion
  }

  const followedResponse = await fetch(latestUrl, {
    headers: {
      "User-Agent": "cf-worker-installer",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  })

  return extractVersionFromGithubReleaseURL(followedResponse.url)
}

function getGithubRepoRoot(source: SourceConfig): string | null {
  if (!source.base || !source.base.includes("github.com")) {
    return null
  }

  return source.base.replace(/\/releases\/download\/?$/, "")
}

function extractVersionFromGithubReleaseURL(url: string | null): string | null {
  if (!url) {
    return null
  }

  const match = url.match(/\/releases\/tag\/(v[^/?#]+)/)

  if (!match) {
    return null
  }

  return match[1].replace(/^v/, "")
}