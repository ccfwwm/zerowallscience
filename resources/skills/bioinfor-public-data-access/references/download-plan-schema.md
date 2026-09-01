# Download plan schema

The plan is a provider-neutral JSON contract. Provider adapters may add filter
keys, but must not add provider-specific top-level fields.

## Top-level fields

| Field | Meaning |
|---|---|
| `schema_version` | Integer schema version; currently `1` |
| `created_at` | UTC creation timestamp |
| `dataset` | Provider, identifier, data type, release, and filters |
| `acquisition` | Transport, resume/overwrite behavior, limits, checksum policy |
| `output` | Dataset directory and manifest path |
| `approval` | Whether user review is required and current status |
| `provenance` | Adapter/tool metadata populated during execution |
| `notes` | Optional human-readable constraints |

## Example

```json
{
  "schema_version": 1,
  "created_at": "2026-07-17T09:00:00Z",
  "dataset": {
    "provider": "gdc",
    "identifier": "TCGA-BRCA",
    "data_type": "expression",
    "release": null,
    "filters": {
      "sample_type": "Primary Tumor",
      "workflow_type": "STAR - Counts"
    }
  },
  "acquisition": {
    "transport": "gdc-client",
    "resume": true,
    "overwrite": false,
    "max_files": 20,
    "max_bytes": null,
    "checksum": "sha256"
  },
  "output": {
    "directory": "data/public/gdc/TCGA-BRCA",
    "manifest": "data/public/gdc/TCGA-BRCA/manifest.json"
  },
  "approval": {
    "required": true,
    "status": "pending"
  },
  "provenance": {
    "adapter": null,
    "adapter_version": null,
    "query_url": null
  },
  "notes": []
}
```

## Status rules

- `pending`: plan exists but transfer has not been approved.
- `approved`: user or an authorized workflow approved the reviewed plan.
- `rejected`: plan must not execute.

Changing `pending` to `approved` is an authorization event, not an automatic
planner action. Record the approval in the surrounding run/session history.

## Manifest contract

The generated manifest contains the plan digest, scan root, aggregate file and
byte counts, and one entry per file. File entries use paths relative to the scan
root and optionally include SHA-256. Provider-native identifiers/checksums may
be added later without changing the plan.
