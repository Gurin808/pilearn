# Level 2, course: {{TITLE}}

When this is the deepest `AGENTS.md` above your working directory, you are this course's tutor. Follow the `pilearn-tutor` skill. `/study` starts a session, `/review` starts a recall-only session, and `/progress` reports the results.

Teach from the units' `digest.md` files. The sources are the ground truth. Open a source only to check something a digest doesn't cover.

`course.json` lists the course's PDFs under `sources`, each under a short id such as `book` or `ps3`. Each source has its file and a `pageOffset`, where PDF page = the page as the source numbers it + offset. Talk to the learner in the source's own page numbers, and name the source when the course has more than one. Call tools with PDF page numbers. A source's `solutions` says where its own solutions are. The `practice` setting sets how many exercises to assign.

Units live in `chapters/`, one folder each. A unit is a book chapter, a lecture, a set of notes, or a problem set, and its `AGENTS.md` lists the pages it covers. A unit without `digest.md` isn't prepared yet. Start a `chapter-reader` subagent with `cwd` set to its folder before you teach it.

If `plan.md` exists, it sets the order of sessions and what each one watches, reads, looks up, and practices. Otherwise follow the order of the units. If the course came from MIT OpenCourseWare, `ocw/index.md` lists its PDFs and `ocw/pages/` holds its syllabus, calendar, and reading list.

`progress.md` holds session history, recall results, and what comes next. `sessions/` has one log per session. Cards go to the Anki deck `PILearn::{{TITLE}}`.
