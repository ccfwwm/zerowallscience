# ZeroWall Science 5.6.0

5.6.0 improves DeepSeek Harness tool-result media handling and packages the
updated local Windows x64 desktop application.

## DeepSeek Harness image rendering

- Image blocks returned by tools are rendered inline in the conversation using
  the existing message image renderer instead of being serialized into a JSON
  tool card.
- Each rendered image keeps its source filename as an accessible button. Clicking
  the filename opens the existing file preview sidebar for the attachment.
- Non-image tool payloads continue to render as JSON, while valid image
  attachments are not duplicated in the JSON view.
- A bundled `image-base64-render` skill documents the default image handling:
  prefer native attachments and use standards-compliant Base64 data URLs when
  an image must be embedded for rendering.

## Desktop packaging

- The Windows x64 installer is built locally as `zerowall-science-5.6.0-win-x64.exe`.
- The DSH integration is pinned to the locally validated ZeroWall commit and
  all ZeroWall plugin package versions are synchronized to 5.6.0.
