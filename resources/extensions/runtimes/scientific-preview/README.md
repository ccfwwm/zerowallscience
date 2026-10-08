# Vendored WebView assets

This directory is the committed source of offline browser assets. It is never
copied into the application directly. `node ui/sync-vendor.mjs` deletes and
rebuilds `ui/vendor-runtime/` from an allowlist, then verifies required assets,
the pinned Office bundle sizes and SHA-256 hashes, and the 1 MiB incremental
Office gzip budget.

Office preview versions:

- `xlsx.mini.min.js`: SheetJS CE 0.20.3 mini build, Apache-2.0
- `pptx-preview.mjs`: `@aiden0z/pptx-renderer` 1.2.4, Apache-2.0
- `docx-preview.mjs`: `docx-preview` 0.4.0, Apache-2.0

The DOCX and PPTX entries are generated together by `../vendor-build/` with
ESM splitting enabled. Both import the single JSZip module named by
`office-build.json`; ECharts remains private to the PPTX entry. The generated
manifest records every output's byte length, gzip length, and SHA-256, while
`sync-vendor.mjs` pins the manifest itself.

The matching SheetJS, DOCX, PPTX, JSZip, ECharts, and ZRender license/notice
files are committed beside the bundles. Runtime loading is local-only; no CDN
is contacted by the app.

To update XLSX, replace the source file and its license, then update its expected
byte length and SHA-256 in `sync-vendor.mjs`. To update DOCX or PPTX, update the
exact dependency version in `../vendor-build/package.json`, run `npm ci` and
`npm run build` there, then pin the new `office-build.json` SHA-256 in
`sync-vendor.mjs`. Run the runtime generator and Office Playwright tests before
committing. Source maps, test/demo/docs folders, examples, language packs, and
unlisted fonts are intentionally excluded from the runtime directory.
