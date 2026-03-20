github_latest_release_json() {
  local owner="$1"
  local repo="$2"

  curl -fsSL "https://api.github.com/repos/${owner}/${repo}/releases/latest"
}

github_releases_json() {
  local owner="$1"
  local repo="$2"
  local per_page="$3"

  curl -fsSL "https://api.github.com/repos/${owner}/${repo}/releases?per_page=${per_page}"
}