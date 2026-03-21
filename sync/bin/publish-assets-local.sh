#!/usr/bin/env bash
set -eu

script_dir="$(cd "$(dirname "$0")" && pwd)"

. "$script_dir/../lib/logging.sh"
. "$script_dir/../lib/files.sh"
. "$script_dir/../lib/rsync.sh"

load_env_file "$script_dir/../config/env.local"

source_dir="${1:-${DOWNLOAD_ROOT:-}}"
publish_path="${LOCAL_PUBLISH_PATH:-}"
dry_run="${LOCAL_DRY_RUN:-${DRY_RUN:-0}}"
publish_layout="${PUBLISH_LAYOUT:-versioned}"
stage_root="${LOCAL_STAGE_ROOT:-${STAGE_ROOT:-}}"

if [ -z "$source_dir" ] || [ -z "$publish_path" ]; then
  log_error "DOWNLOAD_ROOT and LOCAL_PUBLISH_PATH are required"
  exit 1
fi

if [ ! -d "$source_dir" ]; then
  log_error "source_dir does not exist: $source_dir"
  exit 1
fi

for required_file in manifest.json releases.json latest.json; do
  if [ ! -f "$source_dir/$required_file" ]; then
    log_error "required metadata file not found: $source_dir/$required_file"
    exit 1
  fi
done

if ! command -v jq >/dev/null 2>&1; then
  log_error "jq is required"
  exit 1
fi

if ! command -v rsync >/dev/null 2>&1; then
  log_error "rsync is required"
  exit 1
fi

latest_version="$(latest_version_from_json "$source_dir/latest.json")"

if [ -z "$latest_version" ] || [ "$latest_version" = "null" ]; then
  log_error "latest.json does not contain a valid version"
  exit 1
fi

if [ ! -d "$source_dir/$latest_version" ]; then
  log_error "latest release directory does not exist: $source_dir/$latest_version"
  exit 1
fi

if [ -n "$stage_root" ]; then
  staging_dir="$stage_root"
  reset_directory "$staging_dir"
else
  staging_dir="$(mktemp -d)"
fi

cleanup() {
  if [ -z "$stage_root" ] && [ -n "${staging_dir:-}" ] && [ -d "$staging_dir" ]; then
    rm -rf "$staging_dir"
  fi
}

trap cleanup EXIT

log_info "prepare local publish tree in $staging_dir"

reset_directory "$staging_dir/releases"
ensure_directory "$staging_dir/latest"

copy_path "$source_dir/manifest.json" "$staging_dir/manifest.json"
copy_path "$source_dir/releases.json" "$staging_dir/releases.json"
copy_path "$source_dir/latest.json" "$staging_dir/latest.json"

while IFS= read -r version; do
  [ -n "$version" ] || continue
  copy_path "$source_dir/$version" "$staging_dir/releases/$version"
done < <(jq -r '.releases[].version' "$source_dir/releases.json")

if [ "$publish_layout" = "versioned" ]; then
  copy_path "$source_dir/$latest_version/." "$staging_dir/latest"
else
  log_error "unsupported PUBLISH_LAYOUT: $publish_layout"
  exit 1
fi

log_info "publish local assets from $staging_dir to $publish_path"
deploy_directory_locally "$staging_dir" "$publish_path" "$dry_run"

if [ "$dry_run" != "1" ]; then
  find "$publish_path" -type d -exec chmod 755 {} +
  find "$publish_path" -type f -exec chmod 644 {} +
fi

log_info "local publish finished"