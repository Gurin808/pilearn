---
description: Prepare chapters by having chapter-readers write their digests
argument-hint: "[course] [chapters|all]"
---
Prepare chapters of course `${1:-the current course}`: ${@:2}. With no chapters named, prepare every chapter without a `digest.md`. Start one `chapter-reader` subagent per chapter, async and in parallel, each with `cwd` set to its chapter folder. When they finish, check that each `digest.md` exists and report each chapter as done, or as failed with the reason.
