github_curl() {
  local -a curl_args

  curl_args=()

  if [ -n "${CURL_PROXY:-}" ]; then
    curl_args+=(--proxy "$CURL_PROXY")
  elif [ -n "${HTTPS_PROXY:-}" ]; then
    curl_args+=(--proxy "$HTTPS_PROXY")
  elif [ -n "${https_proxy:-}" ]; then
    curl_args+=(--proxy "$https_proxy")
  elif [ -n "${ALL_PROXY:-}" ]; then
    curl_args+=(--proxy "$ALL_PROXY")
  elif [ -n "${all_proxy:-}" ]; then
    curl_args+=(--proxy "$all_proxy")
  fi

  if [ -n "${NO_PROXY:-}" ]; then
    curl_args+=(--noproxy "$NO_PROXY")
  elif [ -n "${no_proxy:-}" ]; then
    curl_args+=(--noproxy "$no_proxy")
  fi

  curl "${curl_args[@]}" "$@"
}

github_latest_release_json() {
  local owner="$1"
  local repo="$2"

  github_curl -fsSL "https://api.github.com/repos/${owner}/${repo}/releases/latest"
}

github_releases_json() {
  local owner="$1"
  local repo="$2"
  local per_page="$3"

  github_curl -fsSL "https://api.github.com/repos/${owner}/${repo}/releases?per_page=${per_page}"
}