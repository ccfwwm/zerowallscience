# Local credential setup

The scripts load ~/.env themselves. Keep this location consistent with the selected script. Use the python tool to test a specific required variable with dotenv.dotenv_values and print only a boolean, never the mapping or value. Test non-empty values; an empty assignment is not a configured key. Verify required credentials before a dependent request. Optional keys do not block anonymous requests.

For a missing required value, provide its service registration link and ask the user to run a local command with hidden input. Do not execute a placeholder credential command, read secrets into conversation history, or ask the user to paste them into chat. A cross-platform local command using the resolved interpreter can use getpass.getpass, pathlib.Path.home() / ".env", and dotenv.set_key. Pass only the variable NAME as an argument. Existing unrelated .env entries must be preserved. Never expose provider credentials in logs, URLs or subprocess arguments.

ALPHAGENOME_API_KEY is required for authenticated predictions. NCBI_API_KEY, OPENALEX_API_KEY and FDA_API_KEY are optional only for operations the service permits anonymously. USER_EMAIL is contact information required by specific sequence-service operations; request it locally when that operation requires it. Preserve all upstream service terms and research-use restrictions.
