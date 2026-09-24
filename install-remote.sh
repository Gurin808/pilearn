#!/bin/sh
# One-line install and update for macOS and Linux:
#   curl -fsSL https://raw.githubusercontent.com/Gurin808/pilearn/main/install-remote.sh | sh
# Clones PILearn to ~/pilearn (or $PILEARN_SRC), or updates it if it's already
# there, then runs the normal installer.
set -e
REPO="${PILEARN_REPO:-https://github.com/Gurin808/pilearn}"
DIR="${PILEARN_SRC:-$HOME/pilearn}"

command -v git >/dev/null 2>&1 || { echo "pilearn: git is required." >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "pilearn: Node.js 22.19 or newer is required: https://nodejs.org" >&2; exit 1; }

if [ -d "$DIR/.git" ]; then
  echo "pilearn: updating $DIR"
  git -C "$DIR" pull --ff-only --quiet
elif [ -e "$DIR" ]; then
  echo "pilearn: $DIR exists but isn't a PILearn checkout. Move it away or set PILEARN_SRC." >&2
  exit 1
else
  echo "pilearn: downloading to $DIR"
  git clone --quiet "$REPO" "$DIR"
fi

exec node "$DIR/install.mjs" </dev/null
