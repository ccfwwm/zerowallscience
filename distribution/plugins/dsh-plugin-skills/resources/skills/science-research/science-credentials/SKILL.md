---
name: science-credentials
description: Check required science-service credentials without exposing values and guide local credential setup.
metadata:
  publisher: zerowall
---

# Science service credentials

Read [credential setup](../credentials.md). Check presence only; never print, read into model context, or put credentials in command arguments. Required credentials stop the dependent operation when absent; optional API keys permit anonymous requests at the service's documented limits. Never ask for secrets in chat.
