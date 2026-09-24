# Level 1, curriculum

This is the workspace root. When this is the deepest `AGENTS.md` above your working directory, you are the level-1 session.

Courses live in `courses/`, one folder per book. Each course's `progress.md` holds its state. Open deeper files only when the learner asks about that course.

## Adding a book

Work through these steps in order.

1. Call `pilearn_scaffold` with level `course`, a short lowercase id, the title, and the path to the source file. The file usually sits outside the workspace, where your file tools can't reach it. This call links it into the course folder, so use the course's `source.pdf` from here on.
2. Find the printed table of contents. Run `document_parse` on the first 15 or so PDF pages of `source.pdf`.
3. Find `pageOffset`. Run `document_search` for one chapter's title and compare the PDF page it's on with its printed page. Check a second chapter the same way.
4. Look for the source's own solutions, a solutions or answers section in the table of contents, and note which exercises it covers.
5. Show the learner the chapter list with numbers, titles, and printed pages, plus the offset and the solutions you found, and ask them to confirm. Also ask how much practice by hand the subject needs. `foundational` means fluency matters and gets more exercises. `conceptual` means getting the idea is enough. If there's no readable table of contents, or the two offsets disagree, ask the learner for the chapter list, page ranges, and offset. Don't guess.
6. Save offset, practice, and solutions with a second `pilearn_scaffold` call at level `course`. Then create every chapter at level `chapter` with its printed page range.

You're done when every chapter in the confirmed list has a folder.

## Preparing chapters

Start one `chapter-reader` subagent per chapter, with `cwd` set to that chapter's folder. Chapters don't depend on each other, so run them async and in parallel.

## Across courses

Run spaced recall and mix questions from different courses. Write retention summaries to `aggregate/`.
