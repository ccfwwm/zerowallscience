# Provider routing

Choose a provider adapter only after the provider-neutral plan is valid.

## GEO

- Accept `GSE`, `GDS`, `GSM`, and `GPL` accessions.
- Inspect series/sample metadata before choosing a matrix or supplementary file.
- Use series matrices for bounded expression reanalysis when available.
- Use supplementary archives or SRA/ENA for raw data; do not pretend GEO itself
  guarantees FASTQ availability.

## SRA and ENA

- Resolve project/sample accessions to run accessions before transfer.
- Prefer ENA HTTPS/FTP for directly available FASTQ with published checksums.
- Use SRA Toolkit when conversion from SRA objects is required.
- Record layout (single/paired), run count, bases/bytes, and checksums.

## GDC

- Build an explicit files/cases query and save it with the plan or manifest.
- Use `gdc-client` for resumable bulk transfer from a generated manifest.
- Keep controlled-access data outside this public-data workflow unless the
  caller has explicitly configured credentials and authorization.
- Do not merge thousands of files in memory during acquisition.

## GTEx

- Use expression connectors/APIs for bounded gene/tissue questions.
- Use official release matrices for bulk analysis and record the release.
- Distinguish gene-level median expression from sample-level matrices.

## DepMap

- Treat DepMap as an optional provider adapter, never as the common backend.
- Inspect release and file metadata before choosing expression, mutation,
  copy-number, dependency, or model metadata products.
- Keep release-specific names and authentication behavior inside this adapter.
- Do not expose `--all` as a provider-neutral option.

## Custom HTTPS/FTP

- Require explicit URLs or a machine-readable catalog response.
- Record final resolved URLs, object identifiers, expected bytes, and checksums.
- Reject short-lived signed URLs in durable plans; store a stable object ID and
  resolve a fresh URL only at execution time.

## Adapter selection order

1. Installed ZeroWall connector/MCP for discovery and small results.
2. Official provider API or bulk client.
3. A versioned external CLI already installed in the execution environment.
4. Manual instructions when no safe executable adapter exists.

Do not silently fall through from one adapter to another after a partial
transfer. Record the failure, preserve resumable state, and ask before changing
transport.
