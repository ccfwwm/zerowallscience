---
name: zerowall-ppt
description: Use the built-in ZeroWall Science PPT plugin for every request to create, generate, continue, or export a presentation, PPT, PPTX, slide deck, project report, thesis defense, lecture, or research presentation. 默认处理所有“生成 PPT”“制作演示文稿”“项目汇报”“答辩幻灯片”请求，并打开 ZeroWall 演示文稿工作台。
---

# ZeroWall PPT

Use the ZeroWall Science presentation plugin as the only creation and export path. Do not substitute another PPT Skill, write an independent PPTX, or merely return an outline when the user asks to generate a presentation.

## Required flow

1. Infer a concise title from the user's request. Use `科研项目汇报` only when no useful title can be inferred.
2. Read the user's request and available project material, then form a concrete 6–12 slide structure. Pass it as `sections` to `create_presentation`; every section needs a meaningful title and 2–5 content points. Do not call the tool with only a title unless no material is available.
3. Call `create_presentation` exactly once. Do not require a project id when the request concerns the current project or workspace; the plugin associates the active session workspace automatically.
4. After the tool returns, report that generation has started. The matching `演示文稿` workbench opens automatically and shows the real slide count, stage, and progress.
5. For every later edit, call `update_presentation` with the returned `presentationId` and the complete replacement `sections`. This updates and regenerates the same PPTX/PDF files in place. Never call `create_presentation` again for revisions to an existing deck.

If the user explicitly names an existing research project and its id is available, pass `project_id`. Never invent a project id, filesystem path, presentation id, or artifact URI.

The workbench also supports a manual path: choose an existing research project or `当前工作区（自动关联）`, enter the title, then click `创建并开始`. This creates a new conversation in that project workspace, injects the title and presentation id, and keeps that conversation linked to the same presentation.

Do not load or invoke any alternate PPT skill as the default workflow. This is the only workflow backed by the ZeroWall presentation record and artifact pipeline.
