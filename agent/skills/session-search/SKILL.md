---
name: session-search
description: Find earlier PILearn work in session transcripts. Use when the learner asks what was covered or said in an earlier session and the course's `progress.md` and `sessions/` logs don't answer it.
---

# Session search

Check the course's `progress.md` and `sessions/` first. They hold the cleaned-up record. Search the raw transcripts only if those don't answer the question.

Transcripts are JSONL files in `~/.pilearn/agent/sessions/`. Each line is one record with a `type` (session, message, model_change) and `message.content`. Run the `grep` tool on that folder with a pattern such as `power set`, then `read` only the lines around each match.
