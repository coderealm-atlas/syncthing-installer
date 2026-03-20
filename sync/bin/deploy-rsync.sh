#!/usr/bin/env bash
set -eu

script_dir="$(cd "$(dirname "$0")" && pwd)"

. "$script_dir/../lib/logging.sh"
. "$script_dir/../lib/files.sh"
. "$script_dir/../lib/rsync.sh"

load_env_file "$script_dir/../config/env"

source_dir="${1:-${DOWNLOAD_ROOT:-}}"
remote_host="${REMOTE_HOST:-}"
remote_user="${REMOTE_USER:-}"
remote_path="${REMOTE_PATH:-}"
ssh_port="${REMOTE_PORT:-22}"
dry_run="${DRY_RUN:-0}"
publish_layout="${PUBLISH_LAYOUT:-versioned}"
stage_root="${STAGE_ROOT:-}"

if [ -z "$source_dir" ] || [ -z "$remote_host" ] || [ -z "$remote_user" ] || [ -z "$remote_path" ]; then
  log_error "source_dir, REMOTE_HOST, REMOTE_USER and REMOTE_PATH are required"
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

log_info "prepare publish tree in $staging_dir"

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

log_info "deploy $staging_dir to ${remote_user}@${remote_host}:${remote_path}"
deploy_directory_with_rsync "$staging_dir" "$remote_user" "$remote_host" "$remote_path" "$dry_run" "$ssh_port"
log_info "deploy finished"