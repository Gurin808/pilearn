# PILearn

PILearn is an AI tutor for learning from books and course materials, including MIT OpenCourseWare. It runs on [Pi](https://github.com/earendil-works/pi), the agent core that Feynman also uses. Chapter digests help the tutor navigate the material, while original sources and solutions remain available for checking. The tutor explains unfamiliar ideas, uses hints on problems you can meaningfully attempt, and checks delayed recall and independent application. Important weaknesses that remain after teaching can become Anki cards.

The teaching is informed by research on retrieval, spacing, pretesting, self-explanation, and worked examples. These are choices to adapt to the learner, not compulsory activities in every session. The teaching policy is in `agent/templates/shared-AGENTS.md` and `agent/skills/pilearn-tutor/SKILL.md`. The rationale and decision history are in `docs/design-notes.md`.

## Why PILearn

For me, studying is a kind of art. A speaker plays music more perfectly than any live band, and I'd still rather hear the band. PILearn is for learning because it's worth doing, not because a machine couldn't do it for you.

> *Today is the best day in history to be a learner.*
> *Tomorrow, learning may earn us nothing,*
> *nothing but the art of understanding.*

AI already solves most textbook math faster and more reliably than most people, and it's getting good at synthesis too. So why study at all?

Because understanding is the point. What makes learning fulfilling is seeing the bigger picture: making connections, looking at the same problem from different sides, and being able to explain it to someone else. People used to need to be fast at integrals and differential equations by hand. Calculators and now AI do that for us, and I'm glad, because the understanding was always the fun part.

That doesn't make hard problems useless. They're how the connections get made. A hard problem forces you to think, and what you had to think hard about is what stays. The goal isn't to get good at those particular problems. It's to use them to get the idea. How much practice that takes depends on the subject. Fundamentals, like a first course in proofs, deserve a lot of work by hand, because everything later builds on being fluent there. In other subjects, getting the idea is often enough.

So PILearn asks you to explain ideas and use them independently, including on paper. It chooses practice for the understanding it builds. Arithmetic slips get corrected, but they aren't confused with conceptual gaps.

## The science behind PILearn

PILearn applies findings from cognitive and educational psychology. Each choice below names the finding, where it comes from, and what PILearn does with it. Where a choice is an engineering decision or a personal view rather than evidence, *Limits* says so. The full reasoning and the decision history are in `docs/design-notes.md`.

### The studies it rests on

- **Active learning beats lecturing.** A meta-analysis of 225 studies in undergraduate STEM found that active learning raised exam performance by 0.47 standard deviations and cut failure rates from 33.8% to 21.8% (Freeman et al., 2014).
- **Feeling that you learned is a poor guide.** In a randomized crossover experiment with identical material, students who first tried the problems themselves learned more (+0.46 SD on an independent test) but *felt* they had learned less (−0.56 SD) than students who got a polished lecture. Novices mistake the effort of real learning for not learning (Deslauriers et al., 2019).
- **An AI tutor can work if it's structured.** In a randomized trial with 194 students, an AI tutor built on these principles beat in-class active learning by 0.63 SD, in less time: a median of 49 minutes against a 60-minute class. The design included a platform that walked students through each problem part and answers written by experts. The study tested that combined design, not the isolated contribution of each feature (Kestin et al., 2025).
- **An unstructured AI can hurt.** In a field experiment in high-school math, students with open GPT-4 access did better during practice but worse once the AI was taken away. A tutor that gave hints written by teachers instead of answers reduced the harm (Bastani et al., 2025).

### Principles and how PILearn applies them

| Principle | What the research shows | In PILearn |
|---|---|---|
| Retrieval practice | Recalling studied material improves later retention (Roediger & Karpicke, 2006; Karpicke & Roediger, 2008; Roediger & Butler, 2011). Practice testing is among the most useful study techniques (Dunlosky et al., 2013). | Delayed checks, `/review`, and Anki complement explanations and independent practice. |
| Pretesting | Trying to answer before studying can improve subsequent learning (Kornell, Hays & Bjork, 2009; Pan & Carpenter, 2023). | A few optional pre-questions focus attention or reveal prerequisites. Cold misses alone don't create cards. |
| Spacing | Spreading practice over time helps long-term retention more than cramming it together (Cepeda et al., 2006). | Warm-ups on earlier chapters, `/review`, and Anki's schedule. |
| Interleaving | Mixing problem types during practice improves later performance in math (Rohrer & Taylor, 2007). | Warm-ups and reviews mix chapters instead of grouping them. |
| Desirable difficulties | Some difficulties improve retention, but difficulty by itself is not a learning benefit (Bjork & Bjork, 2011, 2020). | Effort goes into retrieving and applying ideas, with clear questions and challenge matched to readiness. |
| Attempt first | Problem solving followed by instruction can improve understanding and transfer under suitable conditions (Kapur, 2008, 2016; Sinha & Kapur, 2021). | Try familiar methods before receiving hints. Missing prerequisites and requests for explanation get direct teaching. |
| Guidance and worked examples | Novices benefit from guidance, and fading worked steps can support independent problem solving (Kirschner, Sweller & Clark, 2006; Renkl & Atkinson, 2003). | Explain or demonstrate unfamiliar methods, then reduce help. The session flow adapts rather than requiring every activity. |
| Self-explanation | Explaining material to yourself improves understanding (Chi et al., 1989). Constructive and interactive engagement beats passive engagement (Chi & Wylie, 2014). | You explain in your own words, link ideas to earlier chapters, and look at an idea from a second side. |
| Conceptual and procedural knowledge | The two grow together and support each other (Rittle-Johnson, Schneider & Star, 2015). | `foundational` and `conceptual` practice settings guide workload rather than set a minimum. Guided plans and independent solutions are recorded separately. |
| Feeling ≠ learning | See Deslauriers et al. (2019) above. | Delayed recall, independent application, and transfer supply evidence. Frustration and fatigue inform pacing, not grades. |
| Structure and source checking | See Kestin et al. (2025) and Bastani et al. (2025) above. | Prompts guide sessions; tools do not enforce lesson order. The tutor checks difficult feedback against available solutions and distinguishes its own reasoning from source-checked work. |
| Context, not decoration | Interesting details that don't serve the idea, "seductive details", can hurt learning (Harp & Mayer, 1998). | The tutor tells a short story when the problem or experiment behind an idea helps explain it. Use `/history` for the longer account. |

The teacher chooses between explanation, a worked example, retrieval, and independent practice based on your responses. It uses your existing attempt instead of asking you to repeat it, and teaches a missing step when hints stop helping. Extra analogies, prerequisite explanations, and teaching examples are allowed, with their origin made clear and no invented source citations.

### How PILearn measures itself

When pre/post checks are useful, the tutor compares only matched items with comparable difficulty, stated denominators, and the help received. Extra diagnostic questions aren't folded into that comparison. Older unmatched totals remain in the history but aren't reported as a measured gain.

Warm-ups and `/review` check delayed recall and independent use, sometimes in a changed context. Records distinguish independent, hinted, and modeled answers. Review targets follow the latest independent evidence rather than treating every old miss as permanently weak. Anki's last-30-day retention and longest interval describe card reviews, not overall understanding. `/progress` reports these sources of evidence separately. They do not establish that PILearn caused an improvement or outperforms another teacher.

### Limits

- Most evidence comes from particular classroom or laboratory settings. PILearn is research-informed, not a validated reproduction of those interventions.
- Unlike Kestin's platform, PILearn has no lesson-state controller enforcing the sequence and no complete set of expert-written, question-specific answers. Digests and answer notes are generated summaries that can contain errors. Source checks improve traceability but don't guarantee correctness.
- The three levels, digest lengths, suggested exercise counts, and limit of 8 cards per tool call are engineering choices or rules of thumb, not established optima.
- *Why PILearn* above is a personal view.

### References

- Bastani, H., Bastani, O., Sungu, A., Ge, H., Kabakcı, Ö., & Mariman, R. (2025). Generative AI without guardrails can harm learning: Evidence from high school mathematics. *Proceedings of the National Academy of Sciences*, *122*(26), e2422633122. https://doi.org/10.1073/pnas.2422633122
- Bjork, E. L., & Bjork, R. A. (2011). Making things hard on yourself, but in a good way: Creating desirable difficulties to enhance learning. In M. A. Gernsbacher, R. W. Pew, L. M. Hough, & J. R. Pomerantz (Eds.), *Psychology and the real world: Essays illustrating fundamental contributions to society* (pp. 56–64). Worth Publishers.
- Bjork, R. A., & Bjork, E. L. (2020). Desirable difficulties in theory and practice. *Journal of Applied Research in Memory and Cognition*, *9*(4), 475–479. https://doi.org/10.1016/j.jarmac.2020.09.003
- Cepeda, N. J., Pashler, H., Vul, E., Wixted, J. T., & Rohrer, D. (2006). Distributed practice in verbal recall tasks: A review and quantitative synthesis. *Psychological Bulletin*, *132*(3), 354–380. https://doi.org/10.1037/0033-2909.132.3.354
- Chi, M. T. H., Bassok, M., Lewis, M. W., Reimann, P., & Glaser, R. (1989). Self-explanations: How students study and use examples in learning to solve problems. *Cognitive Science*, *13*(2), 145–182. https://doi.org/10.1207/s15516709cog1302_1
- Chi, M. T. H., & Wylie, R. (2014). The ICAP framework: Linking cognitive engagement to active learning outcomes. *Educational Psychologist*, *49*(4), 219–243. https://doi.org/10.1080/00461520.2014.965823
- Deslauriers, L., McCarty, L. S., Miller, K., Callaghan, K., & Kestin, G. (2019). Measuring actual learning versus feeling of learning in response to being actively engaged in the classroom. *Proceedings of the National Academy of Sciences*, *116*(39), 19251–19257. https://doi.org/10.1073/pnas.1821936116
- Dunlosky, J., Rawson, K. A., Marsh, E. J., Nathan, M. J., & Willingham, D. T. (2013). Improving students' learning with effective learning techniques. *Psychological Science in the Public Interest*, *14*(1), 4–58. https://doi.org/10.1177/1529100612453266
- Freeman, S., Eddy, S. L., McDonough, M., Smith, M. K., Okoroafor, N., Jordt, H., & Wenderoth, M. P. (2014). Active learning increases student performance in science, engineering, and mathematics. *Proceedings of the National Academy of Sciences*, *111*(23), 8410–8415. https://doi.org/10.1073/pnas.1319030111
- Harp, S. F., & Mayer, R. E. (1998). How seductive details do their damage: A theory of cognitive interest in science learning. *Journal of Educational Psychology*, *90*(3), 414–434. https://doi.org/10.1037/0022-0663.90.3.414
- Kapur, M. (2008). Productive failure. *Cognition and Instruction*, *26*(3), 379–424. https://doi.org/10.1080/07370000802212669
- Kapur, M. (2016). Examining productive failure, productive success, unproductive failure, and unproductive success in learning. *Educational Psychologist*, *51*(2), 289–299. https://doi.org/10.1080/00461520.2016.1155457
- Karpicke, J. D., & Roediger, H. L. (2008). The critical importance of retrieval for learning. *Science*, *319*(5865), 966–968. https://doi.org/10.1126/science.1152408
- Kestin, G., Miller, K., Klales, A., Milbourne, T., & Ponti, G. (2025). AI tutoring outperforms in-class active learning: An RCT introducing a novel research-based design in an authentic educational setting. *Scientific Reports*, *15*(1), 17458. https://doi.org/10.1038/s41598-025-97652-6
- Kirschner, P. A., Sweller, J., & Clark, R. E. (2006). Why minimal guidance during instruction does not work: An analysis of the failure of constructivist, discovery, problem-based, experiential, and inquiry-based teaching. *Educational Psychologist*, *41*(2), 75–86. https://doi.org/10.1207/s15326985ep4102_1
- Kornell, N., Hays, M. J., & Bjork, R. A. (2009). Unsuccessful retrieval attempts enhance subsequent learning. *Journal of Experimental Psychology: Learning, Memory, and Cognition*, *35*(4), 989–998. https://doi.org/10.1037/a0015729
- Pan, S. C., & Carpenter, S. K. (2023). Prequestioning and pretesting effects: A review of empirical research, theoretical perspectives, and implications for educational practice. *Educational Psychology Review*, *35*(4), 97. https://doi.org/10.1007/s10648-023-09814-5
- Renkl, A., & Atkinson, R. K. (2003). Structuring the transition from example study to problem solving in cognitive skill acquisition: A cognitive load perspective. *Educational Psychologist*, *38*(1), 15–22. https://doi.org/10.1207/s15326985ep3801_3
- Rittle-Johnson, B., Schneider, M., & Star, J. R. (2015). Not a one-way street: Bidirectional relations between procedural and conceptual knowledge of mathematics. *Educational Psychology Review*, *27*(4), 587–597. https://doi.org/10.1007/s10648-015-9302-x
- Roediger, H. L., & Butler, A. C. (2011). The critical role of retrieval practice in long-term retention. *Trends in Cognitive Sciences*, *15*(1), 20–27. https://doi.org/10.1016/j.tics.2010.09.003
- Roediger, H. L., & Karpicke, J. D. (2006). Test-enhanced learning: Taking memory tests improves long-term retention. *Psychological Science*, *17*(3), 249–255. https://doi.org/10.1111/j.1467-9280.2006.01693.x
- Rohrer, D., & Taylor, K. (2007). The shuffling of mathematics problems improves learning. *Instructional Science*, *35*(6), 481–498. https://doi.org/10.1007/s11251-007-9015-8
- Sinha, T., & Kapur, M. (2021). When problem solving followed by instruction works: Evidence for productive failure. *Review of Educational Research*, *91*(5), 761–798. https://doi.org/10.3102/00346543211019105

## Requirements

- macOS, Linux, or Windows, with Node.js 22.19 or newer
- An account with a model provider Pi supports, such as a ChatGPT subscription or an API key. A Claude subscription doesn't work, because Anthropic doesn't allow third-party tools like Pi to use it. Claude works through an Anthropic API key, billed by use. See *Models*.
- Optional: [Anki](https://apps.ankiweb.net) with the AnkiConnect add-on, code `2055492159`, for flashcards

## Install

You need [Node.js](https://nodejs.org) 22.19 or newer and [Git](https://git-scm.com). Then paste one line into a terminal.

macOS and Linux:

```sh
curl -fsSL https://raw.githubusercontent.com/Gurin808/pilearn/main/install-remote.sh | sh
```

Windows, in PowerShell:

```powershell
irm https://raw.githubusercontent.com/Gurin808/pilearn/main/install-remote.ps1 | iex
```

The same line updates PILearn later. On Windows it also adds the launcher to your `PATH`. Open a new terminal afterwards and run `pilearn`.

### Manual install

macOS and Linux:

```sh
git clone https://github.com/Gurin808/pilearn ~/pilearn
cd ~/pilearn
sh install.sh
```

Windows, in PowerShell. `winget install OpenJS.NodeJS.LTS Git.Git` installs Node and Git if you don't have them.

```powershell
git clone https://github.com/Gurin808/pilearn $HOME\pilearn
cd $HOME\pilearn
node install.mjs
```

Then add `%USERPROFILE%\.pilearn\bin` to your `PATH`. Open Start, search "Edit environment variables for your account", select `Path`, and add it with New.

### Windows notes

Use [Windows Terminal](https://aka.ms/terminal) so colors and math symbols display correctly. Windows allows symbolic links only in Developer Mode, so without it `/add-course` links the PDF with a hard link, or copies it if the book is on another drive. You can also run PILearn inside WSL and follow the Linux steps.

Windows support is new and hasn't been tested on a Windows machine yet. Please open an issue if something breaks.

### Pi and extension updates

PILearn uses its own local Pi installation, separate from a global `pi` command. Updating global Pi does not update PILearn's copy.

The installer and launcher check the npm `latest` release of Pi and update the local copy when needed. Extension packages also update on installation and startup. npm package sources in PILearn's settings have no version suffix; older pinned entries are migrated while preserving their resource filters and other settings. This policy accepts new releases across minor and major versions, which can require compatibility fixes.

If a registry check or update fails, PILearn warns and uses the available installed copy. It retries on the next launch. `pilearn --offline` or `PI_OFFLINE=1` skips automatic network updates. `pilearn --context` and `pilearn videos` do not load Pi and do not run these checks.

The lockfile records the dependency tree from the last install, not a permanent version policy. Startup checks for a newer Pi release independently of that record. Dependency constraints inside upstream packages remain under their authors' control.

### What the installer does

You can run the installer again at any time, and should after pulling updates. It creates:

- `~/.pilearn/agent`, PILearn's skills, extensions, prompts, and settings. Existing models, credentials, and keybindings are preserved. Settings migrations remove the retired PILearn theme and keep shared skills outside the tutor's allowed folders excluded. Other preferences and user themes are preserved. With no theme selection, Pi uses its default `system` theme, matching the terminal.
- `~/study`, your study workspace with courses, progress, and session logs. Set `PILEARN_WORKSPACE` before installing to use another folder.
- the `pilearn` launcher, at `~/.local/bin/pilearn` on macOS and Linux and `%USERPROFILE%\.pilearn\bin\pilearn.cmd` on Windows. Set `PILEARN_BIN` to put it elsewhere.

Reinstalling refreshes package-owned instructions and migrates known old wording in course-level `AGENTS.md` files without replacing course paths or personal additions. It leaves books, digests, progress, session logs, and Anki data intact.

## Models

The installer asks you to do this once, inside PILearn:

1. `/login` connects your provider, by subscription (ChatGPT) or API key (for example Anthropic for Claude). Pi stores the credentials on your machine in `~/.pilearn/agent/auth.json`.
2. `/model` picks the chat model and saves it as your default.
3. `/reader-model` picks the model that reads your PDFs. Math is read from images of the pages, so the list only shows models that accept images. If you don't pick one, the chat model reads the PDFs.

The startup panel shows both, as `model` and `reader`.

You can add any other endpoint that speaks the OpenAI API in `~/.pilearn/agent/models.json`, with its key in an environment variable:

```json
{
  "providers": {
    "my-provider": {
      "baseUrl": "https://api.example.com/v1",
      "api": "openai-completions",
      "apiKey": "$MY_PROVIDER_API_KEY",
      "authHeader": true,
      "models": [{ "id": "example-model", "reasoning": true, "input": ["text", "image"] }]
    }
  }
}
```

Keep credentials in `auth.json` or environment variables, never in this repo.

## Use

```
pilearn                    # starts at level 1 (~/study)
/add-course                # add books, an OCW course download, video lectures, or any folder of course materials
!pilearn videos <links> --out <folder>   # turn YouTube lectures into transcripts for /add-course (needs yt-dlp)
/prep <course>             # chapter-readers write each chapter's digest
/go                        # pick a course with the arrow keys; PILearn restarts there
/reader-model              # choose the model that reads PDFs
```

`/add-course` takes book PDFs as local paths and links them, so your library keeps the only copy. For an OCW course, use "Download course" on its page on ocw.mit.edu, unzip it, and give PILearn the folder. PILearn copies the course's PDFs (notes, problem sets, exams, solutions, transcripts) into the course and turns its syllabus, calendar, and reading list into Markdown, so you can delete the download afterwards. Lectures from YouTube work too. `pilearn videos` takes a playlist or video links, downloads the captions with [yt-dlp](https://github.com/yt-dlp/yt-dlp), preferring captions made by the uploader over automatic ones, and writes one transcript per lecture with timestamps. You run it yourself, for example as `!pilearn videos …` inside PILearn, so the model never goes online. Any other folder of course materials, such as lecture notes and problem sheets from a course website, can be added the same way: PILearn copies it into the course and works out what each file is. With a book and a course, say which one sets the order. PILearn checks whether the course uses your edition of the book, proposes units and a session plan, and waits for your approval before it creates anything.

Inside a course, at level 2:

- `/study [chapter or sections]` runs an adaptive session with reading or guided explanation, useful checks, and independent practice. When you wrap up or pause with the tutor, it saves a short note in `sessions/` and updates *Next* in `progress.md`. Older records stay as written.
- `/review` checks studied material through delayed recall and independent application.
- `/progress` reports matched learning checks where available, delayed recall, independent use, and Anki statistics without treating them as interchangeable.
- `/history [topic]` gives a fuller account of the problem or experiment behind an idea. It starts with the course sources and uses Wikipedia and Wikidata as needed.
- `/btw <question>` asks a side question without derailing the session.

`pilearn --course <id>` starts directly in a course. Keep Anki open while you study. Cards go to the deck `PILearn::<course>`.

### Type LaTeX in the terminal

Run `/latexsuite` for the searchable shortcut reference, or `/latexsuite theta` to open it with a search already filled in. Type to filter by shortcut, LaTeX command, or description. Use the arrow keys to browse, Ctrl+F to clear the search, and Esc to close. Press Ctrl+Alt+L to open it without clearing a draft already in the editor.

Type `mk` then **Tab** to start inline math, or `dm` then **Tab** to start a display block. Inside math, PILearn uses the [Obsidian LaTeX Suite defaults](https://github.com/artisticat1/obsidian-latex-suite/blob/734110a4cee5ced5d253395ff2e31703a608eb21/src/default_snippets.js). Try `@t` for `\theta`, `xsr` for `x^{2}`, `//` for a fraction template, or `pmat` for a matrix. `x/y` followed by Tab makes a fraction. Tab expands manual snippets and advances through placeholders; typing in a new placeholder replaces its default text. For a visual snippet, hold Shift and move left or right to mark a range in math, then type its trigger, such as `S` to wrap it in a square root.

Automatic expansions stay inside dollar-delimited math, outside code and prose. Escape a literal dollar as `\$`. Paste is left as typed. The snippet catalog is adapted for Pi's editor; Obsidian's preview, concealment, and plugin settings do not carry over. No WezTerm configuration is needed.

### Submit handwritten solutions

You can send screenshots of proofs or solutions instead of typing them out. Choose a chat model that accepts images with `/model`; the separate `/reader-model` setting is for preparing course digests.

1. Write on your iPad and copy a screenshot. Apple's Universal Clipboard can transfer it to your Mac when both devices use the same Apple Account, have Handoff enabled, have Wi-Fi and Bluetooth on, and are nearby. You can also copy a screenshot directly on the Mac.
2. In PILearn, press **Ctrl+V**, not Cmd+V. Pi's built-in clipboard action inserts a temporary image path into the editor. On Windows and WSL the default is **Alt+V**. `/hotkeys` shows your active binding.
3. Add the chapter and exercise number, plus what you want checked, then press Enter. The tutor reads the image and reviews your attempt. Delete the inserted path before sending if you want to remove the image.

Cmd+V is usually handled by the terminal's ordinary paste action and may not transfer images. If no image path appears, check that the image has reached the Mac clipboard and try Ctrl+V again. Copy the screenshot itself rather than text containing its filename.

The tutor uses context to resolve clear handwriting. It asks about a specific symbol or line when different plausible readings would change the meaning or feedback, rather than asking about every imperfect mark. Unclear handwriting is not recorded as a mathematical mistake. Actual gaps in your proof still get feedback and hints.

Some iPad apps copy handwriting on a transparent background, which can make the ink disappear when the model displays it. When the tutor reads a Pi clipboard image that you submitted, PILearn places its transparent pixels on the background you choose. White is the default for dark ink. Choose black for white or light ink:

```text
/clipboard-background white
/clipboard-background black
/clipboard-background toggle
```

`toggle` switches between white and black, rather than turning the background off. Run `/clipboard-background` without an argument to see the current choice. The footer shows `clipboard background: white` or `black`. Your choice is saved in `~/.pilearn/agent/clipboard.json`, shared across courses, and survives restarts and reinstalls.

The setting applies on the next image read. To change an image already sent to the model, switch the background and ask the tutor to reread it. Opaque clipboard images are unchanged, as are book pages and other image files. The original file is preserved.

Pi still handles clipboard paste and image reading. PILearn's small `pilearn-clipboard` extension adjusts only the returned clipboard image, using local image processing with no OCR, extra model call, or ink-color detection. You do not need ImageMagick or another command-line converter. Submitted images go to your model provider and may be retained in the saved session, so crop out unrelated personal information.

## How it's organized

```
~/study/                          level 1, curriculum
└── courses/<course>/             level 2, course: you study here
      └── chapters/<chNN>/        level 3, chapter: a chapter-reader writes digest.md here
```

Each level has an `AGENTS.md` that tells the model its role. Tutors start from summaries and can reopen original material and solutions for checking.

PILearn stays inside your study folder. It teaches from course materials and can add prerequisite explanations, analogies, and examples from its own knowledge. Citations follow the course's numbering for each PDF source and use timestamps for timestamped transcripts. Teaching additions and unverified reasoning aren't passed off as source content. It has no shell tool, and a guard, `pilearn-guard`, checks every file access before it runs.

- Writing is allowed only inside the workspace, `~/study`.
- Reading is allowed in the workspace, in each course's linked books, which live elsewhere, in PILearn's config except the files that hold credentials, and in the system temporary directory for screenshots and pasted clipboard images.
- Subagents can only start inside the workspace.

The only internet access is Wikipedia and Wikidata, for historical context in lessons and `/history`. The guard limits what the model's tools can do. It is not an operating-system sandbox, and your own `!command` shell in PILearn works as usual.

Repo layout:

- `agent/` is installed into `~/.pilearn/agent`. It has the `chapter-reader` subagent, skills (`pilearn-tutor`, `add-course`, `historical-context`, `eli5`, `session-search`, `unslop`), extensions (`pilearn-header`, `pilearn-scaffold`, `pilearn-anki`, `pilearn-go`, `pilearn-reader-model`, `pilearn-guard`, `pilearn-wiki`, `pilearn-date`, `pilearn-clipboard`), prompts, and templates.
- `bin/pilearn.js` is the launcher.
- `seeds/` has the first-install settings, models, auth, and keybindings, with no secrets.
- `install.mjs` is the installer for all platforms. `install.sh` runs it on macOS and Linux.
- `install-remote.sh` and `install-remote.ps1` are the one-line installers. They download or update the repo, then run `install.mjs`.

## License

MIT, see `LICENSE`. Parts adapted from Feynman, pi-subagents, and pstack, all MIT, are listed with their notices in `THIRD_PARTY_NOTICES.md`.
