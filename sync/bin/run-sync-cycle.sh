#!/usr/bin/env bash
set -eu

script_dir="$(cd "$(dirname "$0")" && pwd)"

"$script_dir/fetch-assets.sh"
"$script_dir/sync-assets.sh"