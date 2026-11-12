---
kind: package-reference
description: "Manage curated scientific workflows and imported Skills through the shared DSH registry."
---

# @zerowall/dsh-plugin-skills

English | [中文](README.zh.md)

## Use

Open Skills in Settings or this plugin's configuration page. Twelve independent core workflows are enabled initially. Other model-invocable bundled workflows are available on demand: `skills_manage` searches by task, activates a matching workflow for the current conversation workspace, and lets the Skill tool load its instructions. Activation is temporary and limited to that workspace. The switch defaults to all workspaces; users can enable or disable an individual skill or topic globally or for a selected workspace. A manual disable takes precedence over automatic activation. Optional Python dependencies must become usable before enablement or activation succeeds. Instruction loading resolves existing dependency environments without installing packages.

Folder, ZIP, Markdown and public GitHub imports require a preview. GitHub sources are pinned to the resolved commit. Name conflicts require an explicit replacement choice. Imported instructions stay disabled until enabled, and retain their `disable-model-invocation` and `user-invocable` frontmatter controls. Only model-invocable bundled workflows can activate automatically; manual-only and user-imported skills require explicit enablement. Scripts and installers never run during preview or import. Removal unregisters an import and preserves its files and backup metadata.

## Sources and state

Plugin-owned instructions appear in the owning plugin's Usage instructions section. Its switch controls model instructions independently of plugin activation. Bundled entries declare `metadata.ownerPackage`; `providerOwners` maps official providers without modifying official packages. Owners without a bundle page receive a package-named detail entry, generated from the registry; bundle pages are not duplicated. Entries refresh after plugin management changes and are released with their client scope. Project and user overrides remain in Skills according to their actual source. The registry still supplies enabled instructions to the Skill tool, PPT lazy tools and Claude projection. `resources/plugin-instructions.json` records the retired duplicate help copies; active guidance and third-party notices remain with their owners.

The shared registry supplies plugin, project and user sources, winner selection and enablement. Disabled and shadowed entries remain visible. Standard DSH consumers and Claude use the same policies. Plugin-owned instructions remain with their owning plugin; the curated package provides no duplicate navigation Skill.

The bundled catalog is generated from one source manifest (`scripts/curate-sources.json`). It preserves the local Nature snapshot (23 callable skills), the BioNeMo Agent Toolkit snapshot (47 skills), source-tree and per-skill SHA-256 values, runtime preflight facts, and upstream license notices. `nature-shared` is retained as an internal resource and is not a standalone invocation target. BioNeMo instructions never install CUDA, Docker, model weights, NIM containers, or credentials; GPU, Docker, network, and credential requirements are explicit preflight metadata.

The `research_integrity` model tool asks for missing scope choices through `ask_user_question`, records `research-integrity/requested`, and returns input and dependency preflight findings. Selected skills perform the detector runs and save evidence; this tool does not emit `research-integrity/completed` or return detector conclusions. Similarity, missing source records, unavailable sources, rate limits, and failed detectors remain review states and are never reported as confirmed fabrication.

The bundle disables the profile's `skill` row and mounts this package's `./registry` subpath as the sole active registry. The standard filesystem provider and Skill tool remain enabled. It ships the extended registry under the ZeroWall package name and retains the DSH MIT license; no modified official version is republished.

`resources/audit.json` records all 287 legacy instruction files: 202 retained entries, 18 plugin replacements, 34 merges, 32 exclusions and one shared resource. `catalog.json` owns descriptions, topics, licenses and dependency capability identifiers. `capabilities.json` lists their Python requirements. The pinned Academic Research scripts and shared resources retain their license and notices; upstream CLI hooks remain inactive.

State is atomically stored under the selected DSH home's `zerowall-skills` directory. `home` and `resources` override storage and packaged-resource locations. Installation directories are resolved from the package; user and project paths are never embedded in shipped instructions. Desktop unpacks the catalog, instructions and supporting scripts into physical files through the package's `zerowall.asarUnpack` declaration.

## Limits

Local imports reject symbolic links. Archives are limited to 64 MiB compressed, 256 MiB expanded and 10,000 members; unsafe paths are rejected before extraction. A failed operation preserves the prior registry policy. Remote capabilities, GPU model weights and external accounts remain subject to their actual availability; enabling instructions does not create them.

Bundled research workflows use the zerowallrmcp service and mcp__zerowallrmcp__ tool prefix; historical import inventories retain their original source names.
