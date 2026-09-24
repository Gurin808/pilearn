# PILearn

PILearn is an AI tutor for learning from books. It runs on [Pi](https://github.com/earendil-works/pi), the agent core that Feynman also uses. The book is the ground truth. PILearn first condenses each chapter into a short digest. Then it runs study sessions with a pre-test, reading, recall in your own words, practice, and spaced review, and sends what you missed to Anki.

The teaching follows research on how people learn: retrieval practice, pretesting, spacing, interleaving, trying before being told, and guided worked examples. The session steps are in `agent/skills/pilearn-tutor/SKILL.md`. The evidence behind each choice, and a log of every design decision, are in `docs/design-notes.md`.

## Why PILearn

For me, studying is a kind of art. A speaker plays music more perfectly than any live band, and I'd still rather hear the band. PILearn is for learning because it's worth doing, not because a machine couldn't do it for you.

> *Today is the best day in history to be a learner.*
> *Tomorrow, learning may earn us nothing,*
> *nothing but the art of understanding.*

AI already solves most textbook math faster and more reliably than most people, and it's getting good at synthesis too. So why study at all?

Because understanding is the point. What makes learning fulfilling is seeing the bigger picture: making connections, looking at the same problem from different sides, and being able to explain it to someone else. People used to need to be fast at integrals and differential equations by hand. Calculators and now AI do that for us, and I'm glad, because the understanding was always the fun part.

That doesn't make hard problems useless. They're how the connections get made. A hard problem forces you to think, and what you had to think hard about is what stays. The goal isn't to get good at those particular problems. It's to use them to get the idea. How much practice that takes depends on the subject. Fundamentals, like a first course in proofs, deserve a lot of work by hand, because everything later builds on being fluent there. In other subjects, getting the idea is often enough.

So PILearn tests understanding by having you explain things in your own words, and it assigns a few exercises to do on paper, chosen for where you struggled. It doesn't grade your arithmetic.

## The science behind PILearn

PILearn applies findings from cognitive and educational psychology. Each choice below names the finding, where it comes from, and what PILearn does with it. Where a choice is an engineering decision or a personal view rather than evidence, *Limits* says so. The full reasoning and the decision history are in `docs/design-notes.md`.

### The studies it rests on

- **Active learning beats lecturing.** A meta-analysis of 225 studies in undergraduate STEM found that active learning raised exam performance by 0.47 standard deviations and cut failure rates from 33.8% to 21.8% (Freeman et al., 2014).
- **Feeling that you learned is a poor guide.** In a randomized crossover experiment with identical material, students who first tried the problems themselves learned more (+0.46 SD on an independent test) but *felt* they had learned less (−0.56 SD) than students who got a polished lecture. Novices mistake the effort of real learning for not learning (Deslauriers et al., 2019).
- **An AI tutor can work if it's structured.** In a randomized trial with 194 students, an AI tutor built on these principles beat in-class active learning by 0.63 SD, in less time: a median of 49 minutes against a 60-minute class. Two features made it work. A system prompt alone wasn't enough, so the platform walked students through each problem step by step. And the AI worked from answers written by experts instead of producing its own (Kestin et al., 2025).
- **An unstructured AI can hurt.** In a field experiment in high-school math, students with open GPT-4 access did better during practice but worse once the AI was taken away. A tutor that gave hints written by teachers instead of answers reduced the harm (Bastani et al., 2025).

### Principles and how PILearn applies them

| Principle | What the research shows | In PILearn |
|---|---|---|
| Retrieval practice | Recalling material strengthens memory more than rereading it (Roediger & Karpicke, 2006; Karpicke & Roediger, 2008; Roediger & Butler, 2011). Practice testing is among the most useful study techniques (Dunlosky et al., 2013). | Every session asks you to recall in your own words. `/review` sessions. Anki cards. |
| Pretesting | Trying to answer before studying, even without success, helps you learn that material later (Kornell, Hays & Bjork, 2009; Pan & Carpenter, 2023). | Pre-questions before each block of sections, scored as a pre-test. |
| Spacing | Spreading practice over time helps long-term retention more than cramming it together (Cepeda et al., 2006). | Warm-ups on earlier chapters, `/review`, and Anki's schedule. |
| Interleaving | Mixing problem types during practice improves later performance in math (Rohrer & Taylor, 2007). | Warm-ups and reviews mix chapters instead of grouping them. |
| Desirable difficulties | Conditions that make learning feel harder can make it last longer (Bjork & Bjork, 2011, 2020). | Hard problems on purpose, and progress judged by recall, not by ease. |
| Attempt first | Working on a problem before instruction can deepen understanding and transfer (Kapur, 2008, 2016; meta-analysis in Sinha & Kapur, 2021). Trying first, then hearing the explanation, beat a fluent lecture in Deslauriers et al. (2019). | You try before the tutor explains, and hints come before solutions. |
| Guidance and worked examples | For novices, instruction with little guidance works worse than guided instruction (Kirschner, Sweller & Clark, 2006). Worked examples whose steps are removed one at a time ease the move to solving problems alone (Renkl & Atkinson, 2003). | A fixed eight-step session, and one worked example per block where you take over more of each step. |
| Self-explanation | Explaining material to yourself improves understanding (Chi et al., 1989). Constructive and interactive engagement beats passive engagement (Chi & Wylie, 2014). | You explain in your own words, link ideas to earlier chapters, and look at an idea from a second side. |
| Conceptual and procedural knowledge | The two grow together and support each other (Rittle-Johnson, Schneider & Star, 2015). | A per-course setting, `foundational` or `conceptual`, decides how many exercises you do by hand. |
| Feeling ≠ learning | See Deslauriers et al. (2019) above. | Progress is judged only by what you can recall, never by how a session felt. |
| Structure and a fixed source | See Kestin et al. (2025) and Bastani et al. (2025) above. | Tools enforce the step order and limits, the book is the ground truth, the only web access is Wikipedia for history, and no answer comes before an attempt. |
| Context, not decoration | Interesting details that don't serve the idea, "seductive details", can hurt learning (Harp & Mayer, 1998). | `/history` tells the problem or experiment behind an idea and the people involved, only when you ask, and always leads back to the idea. |

The research on trying first and the research on guidance pull in different directions. Kapur (2016) and Sinha & Kapur (2021) describe when struggling first pays off. PILearn takes the overlap, a short attempt first inside a guided sequence.

### How PILearn measures itself

Each block of sections gets a pre-test and a post-test with the same questions. Warm-ups and `/review` measure recall days later, grouped by how long ago you studied a chapter. Anki reports retention over the last 30 days. `/progress` puts these side by side. It's one learner checking their own study, not a controlled study, but it's the evidence PILearn is judged by.

### Limits

- Most of this evidence comes from classroom studies with university or school students, mostly in STEM. Whether it carries over to one person studying a book with an AI tutor is an assumption PILearn tests on itself, not a finding.
- Some choices are engineering or rules of thumb, not results. That covers the three levels and the chapter digests, which keep a whole book from having to fit in the model's context, and the numeric limits: 8 cards per session and the number of exercises.
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
- An account with a model provider Pi supports, such as a ChatGPT or Claude subscription or an API key. See *Models*.
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

Use [Windows Terminal](https://aka.ms/terminal) so colors and math symbols display correctly. Windows allows symbolic links only in Developer Mode, so without it `/add-book` links the PDF with a hard link, or copies it if the book is on another drive. You can also run PILearn inside WSL and follow the Linux steps.

Windows support is new and hasn't been tested on a Windows machine yet. Please open an issue if something breaks.

### What the installer does

You can run the installer again at any time, and should after pulling updates. It creates:

- `~/.pilearn/agent`, PILearn's config with theme, skills, extensions, and settings. It never overwrites your settings, models, or credentials.
- `~/study`, your study workspace with courses, progress, and session logs. Set `PILEARN_WORKSPACE` before installing to use another folder.
- the `pilearn` launcher, at `~/.local/bin/pilearn` on macOS and Linux and `%USERPROFILE%\.pilearn\bin\pilearn.cmd` on Windows. Set `PILEARN_BIN` to put it elsewhere.

## Models

The installer asks you to do this once, inside PILearn:

1. `/login` connects your provider, by subscription or API key. Pi stores the credentials on your machine in `~/.pilearn/agent/auth.json`.
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
/add-book <path-to-pdf>    # new course; finds chapters and page offset, asks you when unsure
/prep <course>             # chapter-readers write each chapter's digest
/go                        # pick a course with the arrow keys; PILearn restarts there
/reader-model              # choose the model that reads PDFs
```

Inside a course, at level 2:

- `/study [chapter or sections]` runs one session: warm-up, pre-test, reading, recall and post-test, a worked example, exercises to do by hand, Anki cards, and the log.
- `/review` runs a recall-only session across the chapters you've studied.
- `/progress` shows gains from pre-test to post-test, retention over time, and Anki retention.
- `/history [topic]` tells the story behind an idea from Wikipedia: the problem or experiment that led to it, the people, and their teachers and students.
- `/btw <question>` asks a side question without derailing the session.

`pilearn --course <id>` starts directly in a course. Keep Anki open while you study. Cards go to the deck `PILearn::<course>`.

## How it's organized

```
~/study/                          level 1, curriculum
└── courses/<course>/             level 2, course: you study here
      └── chapters/<chNN>/        level 3, chapter: a chapter-reader writes digest.md here
```

Each level has an `AGENTS.md` that tells the model its role. Each level reads only the summaries the level below wrote.

PILearn stays inside your study folder. It teaches from your book and its own training, and cites printed page numbers so you can check any claim. It has no shell tool, and a guard, `pilearn-guard`, checks every file access before it runs.

- Writing is allowed only inside the workspace, `~/study`.
- Reading is allowed in the workspace, in each course's source file, which usually lives elsewhere and is linked in, and in PILearn's config except the files that hold credentials.
- Subagents can only start inside the workspace.

The only internet access is Wikipedia and Wikidata, for `/history`. The guard limits what the model's tools can do. It is not an operating-system sandbox, and your own `!command` shell in PILearn works as usual.

Repo layout:

- `agent/` is installed into `~/.pilearn/agent`. It has the theme, the `chapter-reader` subagent, skills (`pilearn-tutor`, `historical-context`, `eli5`, `session-search`, `unslop`), extensions (`pilearn-header`, `pilearn-scaffold`, `pilearn-anki`, `pilearn-go`, `pilearn-reader-model`, `pilearn-guard`, `pilearn-wiki`, `pilearn-date`), prompts, and templates.
- `bin/pilearn.js` is the launcher.
- `seeds/` has the first-install settings, models, auth, and keybindings, with no secrets.
- `install.mjs` is the installer for all platforms. `install.sh` runs it on macOS and Linux.
- `install-remote.sh` and `install-remote.ps1` are the one-line installers. They download or update the repo, then run `install.mjs`.

## License

MIT, see `LICENSE`. Parts adapted from Feynman, pi-subagents, and pstack, all MIT, are listed with their notices in `THIRD_PARTY_NOTICES.md`.
