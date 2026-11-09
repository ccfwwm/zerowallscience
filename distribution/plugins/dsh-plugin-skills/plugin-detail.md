# Skills manager

Browse plugin instructions, curated scientific workflows and user imports in one catalog. Disabled and overridden entries remain visible. Twelve core workflows are enabled initially; other bundled workflows can activate when a task needs them. Search with `skills_manage`, or use the switch to set global or workspace availability. A manual disable always wins.

The switch defaults to all workspaces; choose a workspace for a local override. Folder, ZIP, Markdown and public GitHub imports require a preview; conflicts require a replacement choice. Imports remain disabled until enabled, and importing never runs scripts or installs packages. Only model-invocable bundled workflows support automatic activation.

Python dependencies are prepared before an optional workflow is enabled. Removal unregisters an import and retains its files and backup metadata. Plugin instructions follow their owning plugin and share the same enablement policy with standard DSH and Claude sessions.
