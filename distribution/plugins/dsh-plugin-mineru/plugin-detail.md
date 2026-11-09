# MinerU document parsing

Parse document URLs, workspace files and verified session attachments into Markdown, structured content and images. Interrupted tasks resume through their original task identifier.

Configure the API endpoint, parsing mode and token below or in Environment settings. Credentials use the Host credential store. The connection test checks availability without submitting a document; missing credentials and service failures are reported explicitly.

Results and task records are saved under the workspace artifact directory, or the selected DSH home for sessions without a workspace. This plugin requires no local Python runtime and supplies no separate MinerU Skill.
