# PILearn developer notes

This repo holds the PILearn package code, which runs on the Pi core (`@earendil-works/pi-coding-agent`) next to Feynman. Study data lives apart from it in the workspace, `~/study`, so these notes never load into a tutoring session. The session steps are in `agent/skills/pilearn-tutor/SKILL.md`. The evidence behind them and the append-only decision log are in `docs/design-notes.md`. Feynman sessions edit that file through the symlink `~/outputs/ai-tutor-design-notes.md`.

## Extending Pi

Read `node_modules/@earendil-works/pi-coding-agent/docs/` and `examples/extensions/` first. `docs/extensions.md`, `docs/themes.md`, `docs/settings.md`, and the rest are the maintained API reference. Reverse-engineer Feynman's bundled app (`~/.local/share/feynman/*/app/`) only as a last resort, to see what's possible. Its internals follow an older Pi version than PILearn uses and aren't the API contract.

## Source of truth

`agent/` in this repo is canonical. `install.mjs`, which `install.sh` wraps, is the only install path, and it always overwrites the copies in `~/.pilearn/agent`. Edit here, not there, then run `sh install.sh` to sync and test live. Never commit credentials. `seeds/` holds only an empty provider list and an empty `auth.json`.

`agent/templates/` holds PILearn's runtime instructions, written for the tutor, not for you. `shared-AGENTS.md` is installed as `~/.pilearn/agent/AGENTS.md` and loads in every PILearn session. `level1-AGENTS.md` becomes `~/study/AGENTS.md`. The `pilearn_scaffold` tool fills in `level2` and `level3` when it creates course and chapter folders. The files are named `*-AGENTS.md` so they don't load as instructions while you edit this repo.

## Writing instructions

Models copy the style of what they read. Write every instruction, skill, prompt, and tool description in plain sentences: no em dashes, no bold labels followed by a colon, no filler or AI vocabulary. Don't put the author's name in any file other than `LICENSE`.
