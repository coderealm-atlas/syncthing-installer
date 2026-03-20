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

echo "Installing Syncthing (${options.variantLabel}) to $install_dir"

mkdir -p "$install_dir"
curl -fsSL "$download_url" -o "$archive_path"
ditto -x -k "$archive_path" "$install_dir"

echo "macOS variant ${options.variantLabel} uses the shared shell installer. Add launchd integration in its variant directory if needed."
`
}