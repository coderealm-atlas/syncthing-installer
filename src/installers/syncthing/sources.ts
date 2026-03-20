import { Env, InstallerConfig } from "../../core/types"

const defaultMirrorBaseURL = "https://download.example.com/syncthing"

export function getMirrorBaseURL(env?: Env): string {
  return (env?.MIRROR_BASE_URL || defaultMirrorBaseURL).replace(/\/$/, "")
}

export function getSyncthingSources(env?: Env): InstallerConfig["sources"] {
  const mirrorBaseURL = getMirrorBaseURL(env)

  return {
    github: {
      api: "https://api.github.com/repos/syncthing/syncthing/releases/latest",
      base: "https://github.com/syncthing/syncthing/releases/download",
      downloadPath: "{tagVersion}/{file}",
      pattern: "syncthing-{platform}-v{version}.{archive}"
    },
    mirror: {
      base: mirrorBaseURL,
      api: `${mirrorBaseURL}/latest.json`,
      downloadPath: "releases/{tagVersion}/{file}",
      latestDownloadPath: "latest/{file}",
      pattern: "syncthing-{platform}-v{version}.{archive}"
    }
  }
}

export function getSyncthingInstallerConfig(env?: Env): InstallerConfig {
  return {
    sources: getSyncthingSources(env)
  }
}