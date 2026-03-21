#!/usr/bin/env bash
set -eu

script_dir="$(cd "$(dirname "$0")" && pwd)"

. "$script_dir/../lib/logging.sh"
. "$script_dir/../lib/files.sh"

load_env_file "$script_dir/../config/env.local"

publish_path="${LOCAL_PUBLISH_PATH:-}"
nssm_version="${NSSM_VERSION:-2.24-101-g897c7ad}"
nssm_url="${NSSM_URL:-https://nssm.cc/ci/nssm-${nssm_version}.zip}"
force_download="${FORCE_DOWNLOAD:-0}"

if [ -z "$publish_path" ]; then
  log_error "LOCAL_PUBLISH_PATH is required"
  exit 1
fi

for required_cmd in curl sha256sum; do
  if ! command -v "$required_cmd" >/dev/null 2>&1; then
    log_error "$required_cmd is required"
    exit 1
  fi
done

target_dir="$publish_path/deps/nssm"
target_path="$target_dir/nssm-${nssm_version}.zip"

ensure_directory "$target_dir"

if [ -f "$target_path" ] && [ "$force_download" != "1" ]; then
  log_info "skip existing nssm package: $target_path"
  exit 0
fi

log_info "download nssm package: $nssm_url"
download_file "$nssm_url" "$target_path"

chmod 755 "$publish_path" "$publish_path/deps" "$target_dir"
chmod 644 "$target_path"

log_info "nssm package ready: $target_path"
log_info "sha256: $(sha256_file "$target_path")"