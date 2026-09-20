# 生成操作目录

此文件来自实际服务端注册。离线注册不等于运行时可用；精确执行前使用 describe。

## r.validate.sc.tenifold.runtime

Check the selected remote R runtime for scTenifoldKnk and required supporting packages. Does not execute a job.

- 工具族：r_runtime；副作用：read；query：true；执行：sync。
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

## r.submit.sc.tenifold.knockout

Submit a validated, auditable scTenifoldKnk virtual knockout to the remote R worker. The input must already be inside the project workspace and contain raw integer-like counts. Requires confirm=true.

- 工具族：r_execute；副作用：execute；query：false；执行：async_or_cached。
- 确认字段：confirm。
- 输出：Submission with remote identifier; status and manifest are separate operations.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "project_id": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128,
        "pattern": "^[A-Za-z0-9._-]+$",
        "description": "ZeroWall project id"
      },
      "input_path": {
        "type": "string",
        "minLength": 1,
        "maxLength": 1024,
        "description": "Project-relative raw count input path"
      },
      "output_path": {
        "type": "string",
        "minLength": 1,
        "maxLength": 1024,
        "description": "Project-relative output directory"
      },
      "target": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128,
        "pattern": "^[A-Za-z][A-Za-z0-9_.-]*$",
        "description": "Target gene symbol"
      },
      "metadata_path": {
        "type": "string",
        "maxLength": 1024,
        "default": "",
        "description": "Path relative to the project root; absolute paths and symbolic links are rejected"
      },
      "parameters": {
        "type": "object",
        "properties": {
          "seed": {
            "type": "integer",
            "minimum": 1,
            "maximum": 2147483647,
            "default": 123
          },
          "seeds": {
            "type": "array",
            "items": {
              "type": "integer",
              "minimum": 1,
              "maximum": 2147483647
            },
            "minItems": 1,
            "maxItems": 16
          },
          "nc_nNet": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100,
            "default": 10
          },
          "nc_nCells": {
            "type": "integer",
            "minimum": 10,
            "maximum": 100000,
            "default": 500
          },
          "td_K": {
            "type": "integer",
            "minimum": 1,
            "maximum": 50,
            "default": 3
          },
          "qc_mtThreshold": {
            "type": "number",
            "minimum": 0,
            "maximum": 1,
            "default": 0.1
          },
          "qc_minLSize": {
            "type": "integer",
            "minimum": 0,
            "maximum": 10000000,
            "default": 1000
          },
          "fdr": {
            "type": "number",
            "exclusiveMinimum": 0,
            "exclusiveMaximum": 1,
            "default": 0.05
          }
        },
        "additionalProperties": false,
        "default": {}
      },
      "timeout_ms": {
        "type": "integer",
        "minimum": 1000,
        "maximum": 3600000,
        "default": 600000
      },
      "confirm": {
        "type": "boolean",
        "default": false,
        "description": "Must be true for file writes, destructive actions, code execution, and package changes"
      }
    },
    "required": [
      "project_id",
      "input_path",
      "output_path",
      "target"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": {
    "id_fields": [
      "job_id",
      "id"
    ],
    "argument": "job_id",
    "status": "r.get.sc.tenifold.run",
    "cancel": "r.cancel.sc.tenifold.run",
    "manifest": "r.get.sc.tenifold.manifest"
  }
}
```

## r.get.sc.tenifold.run

Get the asynchronous state and manifest summary for a remote scTenifoldKnk run.

- 工具族：r_jobs；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "project_id": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128,
        "pattern": "^[A-Za-z0-9._-]+$",
        "description": "ZeroWall project id"
      },
      "job_id": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128,
        "description": "R job id returned by r_submit_script"
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

## r.cancel.sc.tenifold.run

Cancel a queued or running remote scTenifoldKnk run. Requires confirm=true.

- 工具族：r_jobs；副作用：write；query：false；执行：sync。
- 确认字段：confirm。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "project_id": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128,
        "pattern": "^[A-Za-z0-9._-]+$",
        "description": "ZeroWall project id"
      },
      "job_id": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128,
        "description": "R job id returned by r_submit_script"
      },
      "confirm": {
        "type": "boolean",
        "default": false,
        "description": "Must be true for file writes, destructive actions, code execution, and package changes"
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

## r.get.sc.tenifold.manifest

List output artifacts produced by a remote scTenifoldKnk run.

- 工具族：r_jobs；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "project_id": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128,
        "pattern": "^[A-Za-z0-9._-]+$",
        "description": "ZeroWall project id"
      },
      "job_id": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128,
        "description": "R job id returned by r_submit_script"
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
