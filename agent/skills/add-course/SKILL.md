---
name: add-course
description: Set up a PILearn course from a book PDF, an MIT OpenCourseWare course download, or both. Use when the learner runs /add-course or asks to add a book or a course.
---

# Add a course

You build the course with `pilearn_scaffold`, check what the sources contain, propose a plan, and create units only after the learner approves it. Run the steps in order.

## 1. Ask what the learner has

Ask for what's missing from the learner's message, all in one message.

- Book PDFs, as local paths. Books are linked, not copied, so they stay in the learner's library.
- An OCW course as an unpacked download folder. On the course's page on ocw.mit.edu, "Download course" gives a zip with every PDF and the course pages. The learner unzips it and gives you the folder. The tool copies its PDFs into the course, so the download can be deleted afterwards. A link to the course page is not enough, because you can't open web pages.
- Video lectures from YouTube or another site that `yt-dlp` supports. PILearn can't open web pages, so the learner first runs `!pilearn videos <playlist or video links> --out <folder>` in the session. It writes one transcript per video with timestamps and an `index.md` with the links. Then they give you the folder.
- Any other course materials, like lecture notes, problem sheets, and solutions from a course website, saved in one folder.
- What each source is for. A book can be the main reading, a reference to look things up in, an exercise source, or a supplement for some topics. With an OCW course, ask whether the learner will watch the lectures. If so, the lectures are the main pass through the material and books support them.
- How much practice by hand the subject needs. `foundational` means fluency matters and gets more exercises. `conceptual` means getting the idea is enough.

## 2. Create the course and add the sources

If the learner adds to a course that already exists, don't create it again. Keep its units and digests, since digesting is the costly part. Its book is already source `book`, and the tool converts an older `course.json` to the list of sources the first time you call it. Skip to adding the OCW download, and in step 3 read the book's offset and solutions from `course.json` instead of finding them again. In the plan, the existing book chapters stay units, and each session names the sections that go with its lecture in the Read column.

1. Call level `course` with a short lowercase id that names the topic, like `multivariable-calculus`, the title, and `practice`.
2. For each book, call level `source` with an id such as `book` or `schey` and its `path`.
3. For an OCW download, call level `ocw` with the folder as `path`. Then read `ocw/index.md` and the syllabus, calendar, readings, and assignments pages it lists in `ocw/pages/`.
4. For any other folder, including transcripts from `pilearn videos`, call level `folder` with an id such as `simon-lectures` as `source` and the folder as `path`. It copies the folder to `materials/<id>/` and keeps its structure. Then explore it yourself with `ls`, `find`, `read`, and `document_parse`: what each file is, how the lectures, notes, and problems belong together, and in what order. Start with its `index.md` if it has one. When a file name doesn't say what a PDF is, look at its first page.

## 3. Check each book

1. Find the printed table of contents. Run `document_parse` on the first 15 or so PDF pages of the book's file in `sources/`.
2. Find `pageOffset`. Run `document_search` for one chapter's title and compare the PDF page it's on with its printed page. Check a second chapter the same way.
3. Look for the book's own solutions, an answers section in the table of contents, and note which exercises it covers.
4. Save `pageOffset` and `solutions` with another level `source` call for that id.

If there's no readable table of contents, or the two offsets disagree, ask the learner. Don't guess.

## 4. Check the OCW course against the books

The syllabus or readings page names the course's textbook and its edition. Compare it with the learner's books.

- Same book and edition. Section and problem numbers in the readings and problem sets match the learner's book.
- A different edition or a different book. Map each lecture to the learner's book by topic, using its table of contents, and mark every such mapping as yours in the plan. Problems that the OCW PDFs cite by book number, like "12.1/17", point to the wrong problems. Use only problems printed in full in the OCW PDFs, or pick matching problems from the learner's book yourself and say so.
- No book. The transcripts, lecture notes, and other OCW notes are the reading. Say which lectures have no readable notes.

## 5. Propose the plan

Units are what chapter-readers digest, so only what the learner will study goes into a unit. A book used only as a reference is never digested whole. The plan names its pages in the Look up column, and the tutor opens them when a question needs them. Pages of a book's exercises go into a unit as an `exercises` part, so the reader lists just those problems.

When the learner reads a book, each book chapter is one unit. When the learner watches lectures, each lecture is one unit. Its reading parts are the lecture's transcript, from the videos table in `ocw/index.md` or the `index.md` of a `pilearn videos` folder, and the lecture notes that go with it. A transcript part names its file and no pages, because it's read whole. Take only the pages of a week's summary that belong to that lecture when you can tell them apart. A supplement, such as a book chapter on one topic, goes into the unit of the lecture it supports. A problem set or practice exam used for practice is a unit too, with its pages as `exercises` and its solutions as `solutions`. When a range holds more than the unit needs, such as Part A and Part B on the same page, give the part a `note` like "Part B" or "problems 1E and 1G-1H". Each page range belongs to one unit. When a later session revisits it, name the earlier unit in that plan row instead of adding the pages again. The tutor assigns only problems that a digest lists, so a book's exercises for a lecture go into that lecture's unit as an `exercises` part. Add them only when the course's own problems don't give enough practice, or when the learner asks for them. An `exercises` part covers only the pages where the problems are printed, not the section's text. Find them with `document_search` for the book's exercise heading, such as "Exercises" or "Problem Set", within the section.

Follow the course's own pacing. A session is one lecture with the reading and problems the course gives it. A book that supports a course whose lectures the learner watches goes in the Look up column, not Read, unless the learner asks for it as reading, so it doesn't add to the course's load.

Show the learner the units with their sources and pages, and the sessions in order with what each watches, reads, looks up, and practices. Also show the page offsets and the solutions you found. Ask for approval, and change the plan until the learner approves it.

## 6. Build what was approved

1. Create each unit with level `chapter`, giving `parts` as page ranges of its sources. A part can name a file under `ocw/files/` or `materials/<id>/` by its path, like `ocw/files/ps3.pdf` or `materials/simon-lectures/video03.md`. The tool then adds it as a source under an id made from its name, a PDF with pageOffset 0 or a transcript read whole, and the plan uses that id. Add an OCW PDF with level `source` first only when it prints page numbers that differ from its PDF pages. Book chapters keep ids like `3`, which become `ch03`. Lectures get ids like `lec09`. Give other units short ids like `notes-m` or `ps3`.
2. For a course with an OCW course or more than one book, write `plan.md` in the course folder. For a single book read in order, the chapter order is the plan and no `plan.md` is needed.

```markdown
# Plan

Order: <what sets the order, e.g. the OCW 18.02 calendar>. Sources: <each source id and its role, e.g. `book` OpenStax Calculus Vol. 3 for reference and exercises>.

| # | Session | Watch | Read | Look up | Practice |
|---|---|---|---|---|---|
| 9 | Lecture 9, Max-min problems; least squares | https://www.youtube.com/watch?v=... | lec09 (transcript, week 4 notes, notes LS) | book §4.7 pp. 452-468 (mapped by topic) | lec09: book §4.7 #321, #325; ps3 Part B 2 |
```

Watch is the video's link from the videos table in `ocw/index.md` or a `pilearn videos` index, or empty when there is none. Read names units and their sections. Look up names source pages that aren't digested. Practice names the units whose digests list the problems. Mark a mapping you made yourself with "(mapped by topic)".

You're done when every unit of the approved plan has a folder and `plan.md` matches what the learner approved. Then offer `/prep` to have the units digested.
