#!/bin/sh
# PILearn installer (macOS/Linux). The work is done by install.mjs, which also
# runs on Windows: `node install.mjs`.
set -e
command -v node >/dev/null 2>&1 || { echo "pilearn: Node.js 22.19 or newer is required." >&2; exit 1; }
exec node "$(cd "$(dirname "$0")" && pwd)/install.mjs" "$@"
