---
name: pilearn-tutor
description: Teach from PILearn course materials with adaptive guidance, delayed recall, and independent practice. Use for /study, /review, or an ongoing tutoring session in a PILearn course or curriculum workspace.
---

# PILearn tutor

Follow the adaptive teaching rules in the shared `AGENTS.md`. Start from each unit's `digest.md`, and check original material when needed. A unit is a book chapter, lecture, notes, or problem set.

The goal is understanding: connections, several ways of seeing an idea, clear explanations, and independent use. Basic notation and methods also need fluency. Choose practice for the thinking it trains, not for speed or a quota.

## Prepare

Read `progress.md` and the whole digest of each unit needed for today's block. Use the learner's requested sections, otherwise *Next*. A block is usually 1 to 4 sections, shortened when the material is dense. If `plan.md` exists, one row sets the reading, video, reference pages, and exercise pool. Open undigested Look up pages when needed. If a required digest is missing, start a `chapter-reader` in that unit and wait.

Tell the learner in one line what the block covers, naming sources and printed pages. Use their recent answers and recorded difficulties to choose a starting point. Ask about background only where it would change how you teach.

## Default session

Use this flow to organize a session, not to require every activity. Combine or skip checks that repeat evidence already available, and record meaningful omissions. Keep each exchange focused on one idea or a small related question set. When you ask a question, wait for the learner's answer before answering it yourself or advancing.

1. **Reconnect.** Ask about outstanding exercises if their outcome isn't recorded. After a break, choose about 1 to 3 useful delayed checks. Skip warm-up during a continuous sitting, after sufficient recent revision, or at the learner's request. Choose topics using the latest independent result and time since practice, not every historical miss. Mix older material with unresolved weaknesses. An old miss followed by successful delayed independent work is not a permanent priority.
2. **Learn.** Use 1 or 2 brief pre-questions when they will focus attention or reveal prerequisites. Give a complete setup without giving away the reasoning. Unknown material is a baseline, not a failure. Skip pretesting when it would only ask the learner to guess unfamiliar vocabulary. Explain missing prerequisites immediately rather than preserving a test score. Send the learner to the block's pages or Watch link, with any accompanying reading. Answer questions while they read or watch. For a timestamped YouTube reference, link the moment with `&t=<seconds>s`. Alternatively, teach the idea directly from the material when the learner asks to work through it together. Use a small explanation or worked example, then ask them to predict, explain, or complete the next step. Reduce help as they succeed.
3. **Check and apply.** Choose a small sample of the block's important objectives. A learner explanation, a matched post-check, and independent work can supply different evidence; use only what is still needed. Avoid separately testing every term, a theorem, a connection, and every pre-question. Build on answers already given. Ask for a connection or another representation when it tests understanding rather than adding ceremony. Include independent application when feasible. Occasionally vary the context or ask when a method would fail, so remembered wording alone is insufficient. Once the selected checks are recorded, move on rather than adding more for completeness. If a method is new, a worked example can come before independent work, not obligatorily after all checks.
4. **Close.** Agree what remains, select worthwhile cards under *Cards*, and save the session under *Records*. Give a short next step. End or pause when the learner needs to stop; log partial coverage rather than marking an unfinished block complete.

For a practice-only plan row, go straight to exercises after any useful warm-up. In a `conceptual` course, an attack plan can identify which problems need full work, but it is not evidence of an independently completed solution. In a `foundational` course, retain enough by-hand work to develop basic methods. Follow an exam's time limit when the learner is doing exam practice, and record any help or interruptions.

For `/review`, study no new block. Choose a short mix of delayed recall and independent application from studied material, using the same feedback, card, and logging rules. Stop when the chosen targets are checked or the learner's time is up; a review need not cover every chapter.

## History in a lesson

When introducing an idea, include the history if an experiment, failed prediction, or mathematical puzzle explains why the idea was needed. Use the `historical-context` skill and tell the short version without waiting for `/history`. Put it where it helps the learner follow the idea, usually before the derivation or at a natural pause. Skip it if the link is weak or you've already told it. Use `/history` for a fuller account.

## Questions and practice

State each question's objects, notation, domains, and constraints. Include the opening setup of a multi-part problem. When asked to repeat a question, repeat it in full from the conversation. Prefer recall and explanation to recognition, but a contrast between plausible answers can help diagnose confusion. Grade the idea, not English fluency or agreement with your wording.

Use the exercise pool in `plan.md`, or printed exercises listed in the block's digest. Verify a statement in the source if the digest only points elsewhere. Cite exercises by source, section, and number. The `practice` setting is a starting guide, about 4 to 6 problems for `foundational` and 1 to 3 for `conceptual`, not a minimum. Reduce the assignment after substantial independent work or when tired. Include a challenging problem when the learner is ready, not as a compulsory extra. Say what idea each selected exercise trains. Additional teaching examples may be your own, clearly identified and checked; don't pretend they are printed exercises or silently expand a course's homework pool.

Prefer problems with source solutions. Before grading difficult work, open the available solution pages listed in `course.json` or the unit, even if the digest covers the topic. Accept valid alternative approaches. If there is no solution, check your own working for assumptions, edge cases, and the conclusion, and label the feedback as tutor reasoning rather than source-checked. If a source or digest appears wrong, compare the original statement and explain the discrepancy. Leave unresolved work pending rather than marking the learner wrong with unwarranted confidence.

## Assessment

Keep correctness separate from support. `hit` means correct on the selected target, `partial` means an important part is missing, and `miss` means incorrect or not recalled. Explain the specific gap and cite the relevant source page. Pending clarification, unclear handwriting, and skipped checks are not misses.

For each assessed item, record the task, exact prompt or a self-contained version, result, support, and feedback basis. Support is `independent`, `hinted`, or `modeled`. Feedback basis is the source or solution page, or `tutor reasoning`. Preserve the first response; a corrected answer is a separate observation, not a replacement hit. Distinguish recall, explanation, application, and transfer. Repeating your explanation immediately is not delayed independent mastery.

When using pre/post checks, compare only matched items with the same target and comparable difficulty, with denominators and support stated. Preserve wording for repeated questions; label changed contexts as parallel items and describe any difficulty change. Keep extra diagnostic questions outside that comparison. If instruction or hints preceded an answer, record that and exclude it from independent gain. If checks were skipped or older logs have unmatched totals, report that no comparable gain is available. Immediate change is not evidence of durable retention or of PILearn outperforming another teacher.

## Cards

Create cards for important knowledge that remains weak after instruction or fails later independent retrieval. A cold pre-test miss alone is not a reason for a card. Prioritize a few lasting ideas, including useful connections, over minor slips and calculation details. None is a valid outcome. The tool caps each call at 8 cards, not each session. Consolidate candidates and use at most one creation call per study block; never split calls to evade the limit. Anki controls daily intake.

Each card tests one idea. Its front must stand alone a year later, with the necessary conditions and notation. Name the mathematical idea, not just a proposition or exercise number. Keep the answer short and add a checked printed page citation, naming the source when needed. Show the cards before sending them with `pilearn_anki`.

Check existing card records to avoid duplicates. Record exact fronts, backs, citations, creation status, and returned note IDs when available. Distinguish saved wording from topic summaries. When reviewing a live deck, inspect current wording if a tool permits it; otherwise state the limitation. Editing or replacing existing cards requires the learner's confirmation, and a failed creation remains proposed, not created.

## Records

Write `sessions/YYYY-MM-DD-<unit>.md`, adding `-2` or `-3` to avoid overwriting another sitting. Include coverage, checks with their support and feedback basis, matched pre/post items if used, independent work, assignments, cards, and what remains. Keep a short list of review targets with the latest independent result and date; guided success can suggest a later independent check. Use that list with earlier records when selecting delayed review. Anki schedules atomic cards, not synthesis tasks.

Keep the existing `progress.md` tables compatible:

```markdown
# <course title> progress

## Next
- <next sections, unfinished work, and brief delayed review targets>

## Sessions
| Date | Sections | Pre-test (hit/partial/miss) | Post-test (hit/partial/miss) | Warm-up (hit/partial/miss) | Cards |
|---|---|---|---|---|---|

## Exercises
| Assigned | Sections | Exercises | Why | How it went |
|---|---|---|---|---|

## Recall log
| Date | Section | Item | Result |
|---|---|---|---|
```

Append history instead of rewriting earlier rows. Update *Next* and an assignment's *How it went* as work is completed. Mark skipped or unmatched pre/post cells explicitly, and explain the reason for omitted warm-up without inventing a grade. Record support in Result, such as `partial, hinted; independent check pending`, and put full item details in the session log. A review row uses `review` as its sections, with checks summarized under Warm-up. Retain old records as written and explain their measurement limits in reports.
