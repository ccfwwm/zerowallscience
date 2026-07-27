# NOTICE — provenance and licensing of `runtime/skills/`

This file records what could be **established from evidence on disk and in this
repository's git history** about where the skill directories under
`runtime/skills/` came from. It is deliberately conservative: where the evidence
does not settle a question, the question is recorded as undetermined rather than
answered by inference. Nothing here was resolved by a network lookup.

The repository root `LICENSE` is the **MIT License, "Copyright (c) 2026 ZeroWall
Science contributors"**. That license covers the first-party material in this
repository; it does not by itself establish the provenance or license of
material copied in from elsewhere, which is what this file addresses.

At the time of writing there is **no `LICENSE`, `NOTICE`, or `COPYING` file
anywhere else under `runtime/`**, and no skill directory carries its own license
text. Consequently there is no per-skill license text to preserve or reference;
if upstream license files are added later, they should ship with their skill and
be referenced here rather than restated.

---

## 1. How the skills got here (git evidence)

Three commits touch `runtime/skills/`: `167cdb4` (baseline), `97bdf79`, and
`b55f13a`. The import is recorded in `97bdf79` (2026-07-26), whose message
states:

```
feat(skills): integrate science pack skill files from existing projects

- Copied 37 complete skills from myscience/assets/skills
- Copied agent-infini from wisp-science/skills
- Created 11 placeholder skills for BEAR series and missing skills
```

Both named sources are sibling trees on the machine where the import was made:
`C:\softworks\gpt-tools\myscience` and `C:\softworks\gpt-tools\wisp-science`.
The claims in that commit message were re-verified for this file by byte-level
comparison (`diff -r -q`) and by MD5 content matching of every file under
`runtime/skills/` against both sibling trees.

## 2. Third-party skills: copied from `myscience/assets/skills`

The following directories are **byte-identical** to their same-named counterpart
in `C:\softworks\gpt-tools\myscience\assets\skills\`. Each one declares
`license: Apache-2.0` in its own `SKILL.md` YAML frontmatter — that declaration
is the only license statement that travelled with the files.

`advanced/customize`, `advanced/product-self-knowledge`, `advanced/self-awareness`,
`advanced/skill-creator`, `advanced/using-model-endpoint`,
`compute/remote-compute-modal`, `compute/remote-compute-ssh`,
`life-science/boltz`, `life-science/borzoi`, `life-science/chai1`,
`life-science/diffdock`, `life-science/esmfold2`, `life-science/evo2`,
`life-science/fair-esm2`, `life-science/indication-dossier`,
`life-science/ligandmpnn`, `life-science/openfold3`, `life-science/proteinmpnn`,
`life-science/scgpt`, `life-science/scvi-tools`, `life-science/solublempnn`,
`literature/pdf-explore`, `publishing/figure-style`, `publishing/paper-narrative`

(24 directories. `advanced/product-self-knowledge` is byte-identical to the copy
in **both** sibling trees, so its immediate source of truth is ambiguous between
them; its license declaration is the same in either case.)

Five further files are byte-identical copies of upstream `SKILL.md` files that
were placed at **category level** rather than inside a skill directory, and so
sit one level too high. They are, with their upstream counterpart:

| File | Identical to `myscience/assets/skills/…` |
| --- | --- |
| `advanced/SKILL.md` | `managed-model-endpoints/SKILL.md` |
| `compute/SKILL.md` | `compute-env-setup/SKILL.md` |
| `life-science/SKILL.md` | `alphafold2/SKILL.md` |
| `literature/SKILL.md` | `literature-review/SKILL.md` |
| `publishing/SKILL.md` | `figure-composer/SKILL.md` |

These five are third-party content under the same terms as the table above and
are listed here so the attribution is complete regardless of whether their
placement is later corrected.

### What the `myscience` tree does and does not tell us

`myscience` is **not a git repository** (`git rev-parse` fails in it) and has no
remote, so no upstream URL, commit, or author can be recovered from it. It has
no product-level `LICENSE` file. It contains
`assets/skills/THIRD_PARTY_LICENSES.md`, which opens:

> This distribution of Claude Science includes components derived from or
> bundling third-party open-source software. The required attributions and
> license texts are reproduced below. Per-skill `LICENSE`/`NOTICE` files, where
> present in a skill directory, ship alongside that skill and also apply.

That file documents **bundled binary/library components** (Ketcher, CZ
CELLxGENE, biomart-mcp, micromamba, sharp, DejaVu fonts) and model weights. It
does **not** state the license or copyright holder of the skill files
themselves. Its one mention of Anthropic is a disclaimer about model weights:
"Anthropic does not distribute these weights". Several skill bodies refer to the
product by name — e.g. `advanced/self-awareness/SKILL.md` is titled
"Self-awareness — Claude Science's own database and SDK".

**Undetermined:** the copyright holder of these 24 directories and 5 stray
files, and the upstream repository or distribution they originate from. The
string "Claude Science" appears in the source tree and in the skill text, but no
file on disk states who holds copyright in the skill files, and no LICENSE text
accompanies them. **This has not been resolved and must not be guessed.** The
per-file `license: Apache-2.0` frontmatter is recorded above as what the files
themselves declare; it is a declaration inside the imported content, not an
independently verified grant, and it names no licensor. Resolving this requires
either a network lookup of the upstream project or a statement from whoever
assembled the `myscience` tree.

## 3. Third-party skill: copied from `wisp-science/skills`

`advanced/agent-infini` is byte-identical to
`C:\softworks\gpt-tools\wisp-science\skills\agent-infini`, and its `SKILL.md`
declares `license: Apache-2.0`.

Unlike `myscience`, this source **is** a git repository with a remote:

- Remote: `https://github.com/xuzhougeng/wisp-science.git`
- Root `LICENSE`: Apache License 2.0, "Copyright 2026 Wisp contributors"
- The directory was added there in commit `a24e1c3`,
  "add infinisynapse skill support (#123)"

This is the one third-party skill whose upstream repository, license text, and
copyright line are all present on disk. Note that `wisp-science`'s own README
describes its `skills/` as "vendored from the upstream `wisp-science` asset
bundle (Apache-2.0)" — a self-referential statement that does not identify a
further-upstream origin.

## 4. Skills authored in this repository

No file in these directories matches any file in either sibling tree by content
hash (empty `.gitkeep` files excluded), so they are treated as first-party
material under the repository's MIT `LICENSE`:

- `core/` — `bibliometric-analysis`, `citation-reviewer`, `domain-check`,
  `figure-provenance`, `large-file`, `modal-run`, `paper-to-report`,
  `publication-figures`, `remote-compute`, `reproducible-research`,
  `stats-integrity`, `traceability-review`. Several carry
  ZeroWall-specific code and assets (`zerowall.mplstyle`, `record_run.py`,
  `domain_check.py`, `bibliometrics.py`, `report_scaffold.py`).
- `advanced/browser-use`, `compute/local-env-setup`,
  `compute/probe-compute-environment`, `publishing/journal-club-ppt` —
  short placeholder stubs.
- `literature/bear-abstracts`, `bear-citations`, `bear-concepts`,
  `bear-datasets`, `bear-figures`, `bear-methods`, `bear-results`,
  `bear-tables` — placeholder stubs of 8–18 lines each, all marked
  "This skill is a placeholder. Full implementation pending."

### Rewritten from third-party originals

These five directories share a name with an upstream skill but differ in
content; each contains only a locally written `SKILL.md` with no `license:`
field, and several reference ZeroWall Science by name:

`advanced/managed-model-endpoints`, `compute/compute-env-setup`,
`life-science/alphafold2`, `literature/literature-review`,
`publishing/figure-composer`

**Undetermined:** whether these were written from scratch against the same
subject matter or derived by editing the upstream file. The upstream
counterparts still exist verbatim at category level (see the table in §2), which
is consistent with either history. `life-science/alphafold2` is the closest
case — 85 lines here against 99 upstream, retaining the frontmatter shape
including `license: Apache-2.0`, `category: biomodels`, and a
`metadata.third_party` block. Treat it as potentially derived from the upstream
file until someone who knows its authorship confirms otherwise.

## 5. A naming collision worth flagging

The eight `literature/bear-*` directories here are **first-party placeholders**,
verified above by content hash and by inspection. They are unrelated to the
`bear-*` skills in `wisp-science/skills/`, which that tree's
`skills/THIRD_PARTY_LICENSES.md` attributes to
`https://github.com/fei0810/bear-research-skills` under **CC BY-NC-SA 4.0** —
a **non-commercial, share-alike** license. The name sets differ (here:
`bear-abstracts`, `bear-citations`, `bear-concepts`, `bear-datasets`,
`bear-figures`, `bear-methods`, `bear-results`, `bear-tables`; upstream:
`bear-support`, `bear-counter`, `bear-map`, `bear-scoop`, `bear-trace`,
`bear-review`, `bear-onboard`, `bear-propose`), and no upstream `bear` content
is present in this repository.

This is recorded because the placeholders invite exactly the wrong follow-up:
filling them in by copying from `bear-research-skills` would import
CC BY-NC-SA 4.0 material — non-commercial and share-alike — into an
MIT-licensed repository.

## 6. External packs (not in git, fetched at build time)

`runtime/skills/external/` is git-ignored (`.gitignore` line 59) and populated by
`scripts/dev/fetch-skills.sh` at pinned commits. Its contents are **not** covered
by the sections above; each pack's own license governs.

- **ai4s-skills** — `https://github.com/ai4s-research/ai4s-skills`, pinned at
  `8fa2ab0523082c135598909b227ed8feb48263ad`. **License undetermined**: no
  license is stated for this pack anywhere in this repository, and the fetch
  script does not preserve one from the archive.
- **anthropic-skills** (`docx`, `pdf`, `pptx`, `xlsx`) — from
  `https://github.com/anthropics/skills`, pinned at
  `9d2f1ae187231d8199c64b5b762e1bdf2244733d`. `runtime/skills/README.md` and the
  fetch script both record this as Apache-2.0, and the script's comment states
  each skill directory "carries its own `LICENSE.txt`, kept by the copy below".
  That per-directory license text is the authoritative statement and ships with
  the skill; it is not restated here.

## 7. Open items

1. Copyright holder and upstream origin of the 24 directories and 5 stray files
   in §2 — undetermined; needs a network lookup or a statement from the
   assembler of the `myscience` tree.
2. Whether the five rewritten skills in §4 are derivative works — undetermined.
3. License of the `ai4s-skills` pack — undetermined.
4. No upstream license *text* is present on disk for any skill in §2 or §3, only
   frontmatter declarations and, for `wisp-science`, a root LICENSE file.
