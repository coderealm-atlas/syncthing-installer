#!/usr/bin/env bash
set -eu

script_dir="$(cd "$(dirname "$0")" && pwd)"

. "$script_dir/../lib/logging.sh"
. "$script_dir/../lib/github.sh"
. "$script_dir/../lib/files.sh"

load_env_file "$script_dir/../config/env"

repo_owner="${REPO_OWNER:-syncthing}"
repo_name="${REPO_NAME:-syncthing}"
download_root="${DOWNLOAD_ROOT:-$script_dir/../data/releases}"
keep_versions="${KEEP_VERSIONS:-3}"
release_count="${RELEASE_COUNT:-$keep_versions}"
sync_profile="${SYNC_PROFILE:-windows}"
asset_match="${ASSET_MATCH:-$(asset_match_for_profile "$sync_profile")}"

ensure_directory "$download_root"

for required_cmd in curl jq sha256sum; do
  if ! command -v "$required_cmd" >/dev/null 2>&1; then
    log_error "$required_cmd is required"
    exit 1
  fi
done

releases_json="$(github_releases_json "$repo_owner" "$repo_name" "$release_count")"
manifest_items="[]"
release_items="[]"
latest_json=""

while IFS= read -r release_json; do
  tag_name="$(printf '%s' "$release_json" | jq -r '.tag_name')"
  published_at="$(printf '%s' "$release_json" | jq -r '.published_at // empty')"
  release_url="$(printf '%s' "$release_json" | jq -r '.html_url // empty')"
  release_dir="$download_root/$tag_name"
  asset_count=0
  total_size=0

  ensure_directory "$release_dir"

  while IFS=$'\t' read -r asset_name asset_url asset_size; do
    if [ -n "$asset_match" ] && ! printf '%s' "$asset_name" | grep -Eq "$asset_match"; then
      continue
    fi

    if [ -f "$release_dir/$asset_name" ]; then
      log_info "skip existing asset: $tag_name/$asset_name"
    else
      log_info "download asset: $tag_name/$asset_name"
      download_file "$asset_url" "$release_dir/$asset_name"
    fi

    asset_sha256="$(sha256_file "$release_dir/$asset_name")"
    manifest_items="$(printf '%s' "$manifest_items" | jq \
      --arg version "$tag_name" \
      --arg name "$asset_name" \
      --arg url "$asset_url" \
      --arg sha256 "$asset_sha256" \
      --arg size "$asset_size" \
      '. + [{version: $version, name: $name, url: $url, sha256: $sha256, size: ($size | tonumber)}]')"

    asset_count=$((asset_count + 1))
    total_size=$((total_size + asset_size))
  done < <(printf '%s' "$release_json" | jq -r '.assets[] | [.name, .browser_download_url, (.size | tostring)] | @tsv')

  release_items="$(printf '%s' "$release_items" | jq \
    --arg version "$tag_name" \
    --arg publishedAt "$published_at" \
    --arg releaseUrl "$release_url" \
    --arg directory "$tag_name" \
    --argjson assetCount "$asset_count" \
    --argjson totalSize "$total_size" \
    '. + [{version: $version, publishedAt: $publishedAt, releaseUrl: $releaseUrl, directory: $directory, assetCount: $assetCount, totalSize: $totalSize}]')"

  if [ -z "$latest_json" ]; then
    latest_json="$(jq -n \
      --arg version "$tag_name" \
      --arg publishedAt "$published_at" \
      --arg releaseUrl "$release_url" \
      --arg directory "$tag_name" \
      --argjson assetCount "$asset_count" \
      --argjson totalSize "$total_size" \
      '{version: $version, publishedAt: $publishedAt, releaseUrl: $releaseUrl, directory: $directory, assetCount: $assetCount, totalSize: $totalSize}')"
  fi
done < <(printf '%s' "$releases_json" | jq -c '.[] | select(.draft == false and .prerelease == false)')

if [ -z "$latest_json" ]; then
  log_error "no releases matched the current filters"
  exit 1
fi

kept_releases_json="$(printf '%s' "$release_items" | jq --argjson keep "$keep_versions" '.[0:$keep]')"
kept_versions_json="$(printf '%s' "$kept_releases_json" | jq '[.[].version]')"
manifest_items="$(printf '%s' "$manifest_items" | jq --argjson versions "$kept_versions_json" '[.[] | select(.version as $version | $versions | index($version))]')"
latest_json="$(printf '%s' "$kept_releases_json" | jq '.[0]')"

manifest_json="$(jq -n \
  --arg generatedAt "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  --arg repo "${repo_owner}/${repo_name}" \
  --argjson assets "$manifest_items" \
  '{generatedAt: $generatedAt, repository: $repo, assets: $assets}')"

releases_index_json="$(jq -n \
  --arg generatedAt "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  --arg repo "${repo_owner}/${repo_name}" \
  --argjson releases "$kept_releases_json" \
  '{generatedAt: $generatedAt, repository: $repo, releases: $releases}')"

write_json_file "$download_root/manifest.json" "$manifest_json"
write_json_file "$download_root/releases.json" "$releases_index_json"
write_json_file "$download_root/latest.json" "$latest_json"

prune_release_directories "$download_root" "$keep_versions"
log_info "sync assets finished"