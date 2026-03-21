type MacOSShellOptions = {
  downloadURL: string
  installDir: string
  variantLabel: string
}

export function generateMacOSShell(options: MacOSShellOptions): string {
  return `#!/usr/bin/env bash
set -eu

install_dir="${options.installDir}"
download_url="${options.downloadURL}"
archive_path="$(mktemp -t syncthing.zip)"

cleanup() {
  rm -f "$archive_path"
}

trap cleanup EXIT

detect_host_os() {
  uname -s 2>/dev/null || echo unknown
}

validate_host_os() {
  local host_os

  host_os="$(detect_host_os)"

  if [ "$host_os" = "Darwin" ]; then
    return
  fi

  echo "This installer URL targets macOS, but detected host OS: $host_os" >&2
  echo "Please use a matching installer URL for your host operating system." >&2
  exit 1
}

echo "Installing Syncthing (${options.variantLabel}) to $install_dir"

validate_host_os

mkdir -p "$install_dir"
curl -fsSL "$download_url" -o "$archive_path"
ditto -x -k "$archive_path" "$install_dir"

echo "macOS variant ${options.variantLabel} uses the shared shell installer. Add launchd integration in its variant directory if needed."
`
}