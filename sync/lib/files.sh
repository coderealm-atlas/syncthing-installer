ensure_directory() {
  local dir="$1"
  mkdir -p "$dir"
}

reset_directory() {
  local dir="$1"

  rm -rf "$dir"
  mkdir -p "$dir"
}

load_env_file() {
  local env_file="$1"

  if [ -f "$env_file" ]; then
    # shellcheck disable=SC1090
    . "$env_file"
  fi
}

download_file() {
  local url="$1"
  local target_path="$2"
  local temp_path="${target_path}.tmp"

  curl -fL --retry 3 --retry-delay 2 --retry-connrefused "$url" -o "$temp_path"
  mv "$temp_path" "$target_path"
}

sha256_file() {
  local file_path="$1"

  sha256sum "$file_path" | awk '{print $1}'
}

write_json_file() {
  local target_path="$1"
  local content="$2"
  local temp_path="${target_path}.tmp"

  printf '%s\n' "$content" > "$temp_path"
  mv "$temp_path" "$target_path"
}

copy_path() {
  local source_path="$1"
  local target_path="$2"

  if [ -d "$source_path" ]; then
    cp -a "$source_path" "$target_path"
    return
  fi

  cp -a "$source_path" "$target_path"
}

latest_version_from_json() {
  local latest_json_path="$1"

  jq -r '.version' "$latest_json_path"
}

asset_match_for_profile() {
  local profile="$1"

  case "$profile" in
    windows)
      printf '%s' 'windows.*\.zip$'
      ;;
    all)
      printf ''
      ;;
    *)
      printf ''
      ;;
  esac
}

prune_release_directories() {
  local root="$1"
  local keep_versions="$2"

  find "$root" -mindepth 1 -maxdepth 1 -type d | sort -r | tail -n +$((keep_versions + 1)) | while read -r dir; do
    rm -rf "$dir"
  done
}