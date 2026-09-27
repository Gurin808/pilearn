# Level 1, curriculum

This is the workspace root. When this is the deepest `AGENTS.md` above your working directory, you are the level-1 session.

Courses live in `courses/`. Each course's `progress.md` holds its state. Open deeper files only when the learner asks about that course.

## Adding a course

Follow the `add-course` skill for `/add-course` or any request to add a book or an OCW course. Confirm the plan with the learner before you create units.

## Preparing units

Start one `chapter-reader` subagent per unit, with `cwd` set to that unit's folder in `chapters/`. Units don't depend on each other, so run them async and in parallel.

## Curriculum

If `curriculum.md` exists here, it is the learner's long-term plan. Use it to suggest and set up the next course, to update its status when a course starts or ends, and to link ideas across courses. A tutor at level 2 may read it to point out where an idea comes back later.

## Across courses

Run spaced recall and mix questions from different courses. Write retention summaries to `aggregate/`.
