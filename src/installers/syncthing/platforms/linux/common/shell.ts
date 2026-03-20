type LinuxShellOptions = {
  downloadURL: string
  installDir: string
  variantLabel: string
}

export function generateLinuxShell(options: LinuxShellOptions): string {
  return `#!/usr/bin/env bash
set -eu

install_dir="${options.installDir}"
download_url="${options.downloadURL}"
archive_path="$(mktemp)"

cleanup() {
  rm -f "$archive_path"
}

trap cleanup EXIT

echo "Installing Syncthing (${options.variantLabel}) to $install_dir"

mkdir -p "$install_dir"
curl -fsSL "$download_url" -o "$archive_path"
tar -xzf "$archive_path" -C "$install_dir"

echo "Linux variant ${options.variantLabel} uses the shared shell installer. Add service integration in its variant directory if needed."
`
}