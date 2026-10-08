# 生成操作目录

此文件来自实际服务端注册。离线注册不等于运行时可用；精确执行前使用 describe。

## omicverse.status

Inspect independent CPU environment, queue, version and resource limits.

- 工具族：omicverse_runtime；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {},
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## omicverse.search

Search live native and API coverage catalog; unavailable or unverified APIs remain explicit.

- 工具族：omicverse_catalog；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "default": ""
      },
      "offset": {
        "type": "integer",
        "minimum": 0,
        "default": 0
      },
      "limit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 100,
        "default": 25
      }
    },
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## omicverse.describe

Get the exact native tool schema or Python API coverage entry.

- 工具族：omicverse_catalog；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "capability_id": {
        "type": "string",
        "minLength": 1,
        "maxLength": 500
      }
    },
    "required": [
      "capability_id"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## omicverse.run.python

Execute Python in the isolated OmicVerse CPU worker. Write outputs in OUTPUT_DIR; shared inputs are read-only.

- 工具族：omicverse_execute；副作用：execute；query：false；执行：async_or_cached。
- 确认字段：confirm。
- 输出：Submission with remote identifier; status and manifest are separate operations.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "project_id": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$"
      },
      "request_id": {
        "$ref": "#/properties/project_id"
      },
      "timeout_ms": {
        "type": "integer",
        "minimum": 1000,
        "maximum": 14400000,
        "default": 1800000
      },
      "confirm": {
        "type": "boolean",
        "const": true
      },
      "code": {
        "type": "string",
        "minLength": 1,
        "maxLength": 2000000
      }
    },
    "required": [
      "project_id",
      "request_id",
      "confirm",
      "code"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": {
    "id_fields": [
      "id",
      "job_id"
    ],
    "argument": "job_id",
    "status": "omicverse.get.job",
    "cancel": "omicverse.cancel.job",
    "manifest": "omicverse.get.job.manifest",
    "log": "omicverse.get.job.log"
  }
}
```

## omicverse.run.singlecell

CPU QC, normalization, PCA, neighbors, UMAP, Leiden, markers and H5AD checkpoint using verified input.

- 工具族：omicverse_execute；副作用：execute；query：false；执行：async_or_cached。
- 确认字段：confirm。
- 输出：Submission with remote identifier; status and manifest are separate operations.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "project_id": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$"
      },
      "request_id": {
        "$ref": "#/properties/project_id"
      },
      "timeout_ms": {
        "type": "integer",
        "minimum": 1000,
        "maximum": 14400000,
        "default": 1800000
      },
      "confirm": {
        "type": "boolean",
        "const": true
      },
      "input_path": {
        "type": "string",
        "minLength": 1
      },
      "min_genes": {
        "type": "integer",
        "minimum": 0,
        "default": 200
      },
      "max_percent_mt": {
        "type": "number",
        "minimum": 0,
        "maximum": 100,
        "default": 20
      }
    },
    "required": [
      "project_id",
      "request_id",
      "confirm",
      "input_path"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": {
    "id_fields": [
      "id",
      "job_id"
    ],
    "argument": "job_id",
    "status": "omicverse.get.job",
    "cancel": "omicverse.cancel.job",
    "manifest": "omicverse.get.job.manifest",
    "log": "omicverse.get.job.log"
  }
}
```

## omicverse.run.bulk

PyDESeq2 raw count differential expression with aligned biological replicate metadata.

- 工具族：omicverse_execute；副作用：execute；query：false；执行：async_or_cached。
- 确认字段：confirm。
- 输出：Submission with remote identifier; status and manifest are separate operations.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "project_id": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$"
      },
      "request_id": {
        "$ref": "#/properties/project_id"
      },
      "timeout_ms": {
        "type": "integer",
        "minimum": 1000,
        "maximum": 14400000,
        "default": 1800000
      },
      "confirm": {
        "type": "boolean",
        "const": true
      },
      "input_path": {
        "type": "string",
        "minLength": 1
      },
      "metadata_path": {
        "type": "string",
        "minLength": 1
      },
      "factor": {
        "type": "string",
        "pattern": "^[A-Za-z][A-Za-z0-9_]*$"
      },
      "test": {
        "type": "string"
      },
      "reference": {
        "type": "string"
      }
    },
    "required": [
      "project_id",
      "request_id",
      "confirm",
      "input_path",
      "metadata_path",
      "factor",
      "test",
      "reference"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": {
    "id_fields": [
      "id",
      "job_id"
    ],
    "argument": "job_id",
    "status": "omicverse.get.job",
    "cancel": "omicverse.cancel.job",
    "manifest": "omicverse.get.job.manifest",
    "log": "omicverse.get.job.log"
  }
}
```

## omicverse.run.spatial

CPU spatial neighbors and Moran I with Squidpy; requires obsm spatial coordinates.

- 工具族：omicverse_execute；副作用：execute；query：false；执行：async_or_cached。
- 确认字段：confirm。
- 输出：Submission with remote identifier; status and manifest are separate operations.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "project_id": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$"
      },
      "request_id": {
        "$ref": "#/properties/project_id"
      },
      "timeout_ms": {
        "type": "integer",
        "minimum": 1000,
        "maximum": 14400000,
        "default": 1800000
      },
      "confirm": {
        "type": "boolean",
        "const": true
      },
      "input_path": {
        "type": "string",
        "minLength": 1
      }
    },
    "required": [
      "project_id",
      "request_id",
      "confirm",
      "input_path"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": {
    "id_fields": [
      "id",
      "job_id"
    ],
    "argument": "job_id",
    "status": "omicverse.get.job",
    "cancel": "omicverse.cancel.job",
    "manifest": "omicverse.get.job.manifest",
    "log": "omicverse.get.job.log"
  }
}
```

## omicverse.run.native

Submit an official P0+P0.5+P2 MCP tool in a persistent project/session; AnnData checkpoints survive restart.

- 工具族：omicverse_execute；副作用：execute；query：false；执行：async_or_cached。
- 确认字段：confirm。
- 输出：Submission with remote identifier; status and manifest are separate operations.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "project_id": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$"
      },
      "request_id": {
        "$ref": "#/properties/project_id"
      },
      "timeout_ms": {
        "type": "integer",
        "minimum": 1000,
        "maximum": 14400000,
        "default": 1800000
      },
      "confirm": {
        "type": "boolean",
        "const": true
      },
      "session_id": {
        "$ref": "#/properties/project_id",
        "default": "default"
      },
      "tool": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      },
      "tool_arguments": {
        "type": "object",
        "additionalProperties": {},
        "default": {}
      }
    },
    "required": [
      "project_id",
      "request_id",
      "confirm",
      "tool"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": {
    "id_fields": [
      "id",
      "job_id"
    ],
    "argument": "job_id",
    "status": "omicverse.get.job",
    "cancel": "omicverse.cancel.job",
    "manifest": "omicverse.get.job.manifest",
    "log": "omicverse.get.job.log"
  }
}
```

## omicverse.run.agent

Optional official OmicVerse Agent using the Host selected model, endpoint and explicit wire protocol. Credentials are transient.

- 工具族：omicverse_execute；副作用：execute；query：false；执行：async_or_cached。
- 确认字段：confirm。
- 输出：Submission with remote identifier; status and manifest are separate operations.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "project_id": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$"
      },
      "request_id": {
        "$ref": "#/properties/project_id"
      },
      "timeout_ms": {
        "type": "integer",
        "minimum": 1000,
        "maximum": 14400000,
        "default": 1800000
      },
      "confirm": {
        "type": "boolean",
        "const": true
      },
      "prompt": {
        "type": "string",
        "minLength": 1,
        "maxLength": 100000
      },
      "input_path": {
        "type": "string"
      },
      "model": {
        "type": "string"
      },
      "provider": {
        "type": "string"
      },
      "base_url": {
        "type": "string",
        "format": "uri"
      },
      "api": {
        "type": "string",
        "enum": [
          "openai-completions",
          "openai-responses",
          "anthropic-messages"
        ]
      },
      "api_key": {
        "type": "string"
      }
    },
    "required": [
      "project_id",
      "request_id",
      "confirm",
      "prompt"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": {
    "id_fields": [
      "id",
      "job_id"
    ],
    "argument": "job_id",
    "status": "omicverse.get.job",
    "cancel": "omicverse.cancel.job",
    "manifest": "omicverse.get.job.manifest",
    "log": "omicverse.get.job.log"
  }
}
```

## omicverse.list.jobs

List durable jobs belonging to one project.

- 工具族：omicverse_jobs；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "project_id": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$"
      },
      "limit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 100,
        "default": 25
      }
    },
    "required": [
      "project_id"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## omicverse.get.job

Query job status.

- 工具族：omicverse_jobs；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "project_id": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$"
      },
      "job_id": {
        "$ref": "#/properties/project_id"
      }
    },
    "required": [
      "project_id",
      "job_id"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## omicverse.get.job.log

Read bounded worker logs.

- 工具族：omicverse_jobs；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "project_id": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$"
      },
      "job_id": {
        "$ref": "#/properties/project_id"
      }
    },
    "required": [
      "project_id",
      "job_id"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## omicverse.get.job.manifest

Read output paths, MIME, bytes and SHA-256.

- 工具族：omicverse_artifacts；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "project_id": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$"
      },
      "job_id": {
        "$ref": "#/properties/project_id"
      }
    },
    "required": [
      "project_id",
      "job_id"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## omicverse.cancel.job

Cancel a queued/running job; native session instances are invalidated, checkpoints preserved.

- 工具族：omicverse_jobs；副作用：write；query：false；执行：sync。
- 确认字段：confirm。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "project_id": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$"
      },
      "job_id": {
        "$ref": "#/properties/project_id"
      },
      "confirm": {
        "type": "boolean",
        "const": true
      }
    },
    "required": [
      "project_id",
      "job_id",
      "confirm"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## omicverse.close.session

Close an idle native session and release memory; class handles expire, H5AD files remain.

- 工具族：omicverse_runtime；副作用：write；query：false；执行：sync。
- 确认字段：confirm。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "project_id": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$"
      },
      "session_id": {
        "$ref": "#/properties/project_id"
      },
      "confirm": {
        "type": "boolean",
        "const": true
      }
    },
    "required": [
      "project_id",
      "session_id",
      "confirm"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```
