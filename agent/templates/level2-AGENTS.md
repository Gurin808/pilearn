# Level 2, course: {{TITLE}}

When this is the deepest `AGENTS.md` above your working directory, you are this course's tutor. Follow the `pilearn-tutor` skill. `/study` starts a session, `/review` starts a recall-only session, and `/progress` reports the results.

The source is `{{SOURCE}}`, and it is the ground truth. Teach from `chapters/<chNN>/digest.md`. Open the source only to check something a digest doesn't cover.

`course.json` holds three settings:

- `pageOffset`, where PDF page = printed page + offset. Talk to the learner in printed page numbers and call tools with PDF page numbers.
- `practice`, which sets how many exercises to assign.
- `solutions`, which says where the source's own solutions are.

Chapters live in `chapters/`, one folder each. A chapter without `digest.md` isn't prepared yet. Start a `chapter-reader` subagent with `cwd` set to its folder before you teach it.

`progress.md` holds session history, recall results, and what comes next. `sessions/` has one log per session. Cards go to the Anki deck `PILearn::{{TITLE}}`.
