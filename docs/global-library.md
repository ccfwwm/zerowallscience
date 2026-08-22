# Global Library

The Library keeps immutable copies of code cells and image artifacts across all
projects in the local ZeroWall installation.

- Click the SVG star beside a Notebook cell to save its language and source.
- Click the SVG star in an image artifact header to save the image bytes and,
  when provenance exists, the code that generated it.
- In an image artifact viewer, open **Code** and use **Copy code** to copy the
  exact recorded source, or the pencil to edit it and drop a re-run request into
  the composer. The recorded source in `execution_log` is never rewritten.
- Open **Library** from the Projects screen or a project sidebar. Items can be
  searched, filtered, removed, or traced back to their source project/session.

A saved item's code is versioned: the starred snapshot is the immutable v1, and
each edit appends a new version (`library_item_versions`) instead of rewriting
it. This applies to `code` items and to a figure's generating code; text
excerpts stay verbatim because they anchor highlights back to the transcript.
From a project (not the Projects screen), **Insert into chat** pre-fills the
composer with the selected version — the request names the item id and version
number, and the user still sends it.

Library data lives in `library.sqlite` beside the main `zerowall.sqlite` app
database. Project and session IDs/names are stored as source snapshots without
cross-database foreign keys. Deleting the source project, session, or workspace
therefore does not delete or alter a saved Library item; the source link may no
longer open, but the saved code/image remains available.

The first version accepts code up to 2 MiB and PNG, JPEG, GIF, WebP, SVG, or BMP
images up to 32 MiB. PDFs and arbitrary workspace files are not Library items.
