---
name: image-base64-render
description: >-
  Default image-result rendering guidance. Use when a tool creates, reads, or
  returns an image and the conversation needs an immediately visible preview.
  Prefer a native durable image block; use a data URL or Base64 only when a
  native attachment cannot be produced.
whenToUse: Whenever an image result would otherwise be shown only as a filename, path, or JSON metadata.
---

# Image Result Rendering

For an image returned by a filesystem, MCP, or generation tool:

1. Preserve the image as a native durable image block whenever the tool supports attachments. The conversation renderer loads that attachment and displays the image inline.
2. If the tool only returns bytes, convert the bytes to canonical Base64 and use a `data:<media-type>;base64,<payload>` URL for the preview. Keep the media type accurate and do not include whitespace or a second Base64 encoding.
3. Keep the original filename as a short attachment label. It is an action button for opening the image in the workspace sidebar, not a replacement for the inline preview.
4. Do not paste large Base64 payloads into visible assistant text. Return the image block or data URL through the tool result so the UI can render it without flooding the transcript.

When a result contains both descriptive text and an image, keep the text as a concise caption and keep the image block adjacent to it. Do not replace an image block with a JSON dump of its attachment metadata.
