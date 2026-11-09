# 生成操作目录

此文件来自实际服务端注册。离线注册不等于运行时可用；精确执行前使用 describe。

## tooluniverse.status

Inspect the isolated ToolUniverse SDK, catalog, queue and resource limits.

- 工具族：tooluniverse_runtime；副作用：read；query：true；执行：sync。
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

## tooluniverse.search

Search the pinned complete catalog including blocked and unverified tools. Keywords need no model.

- 工具族：tooluniverse_catalog；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "maxLength": 300,
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
      },
      "category": {
        "type": "string"
      }
    },
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## tooluniverse.describe

Inspect exact upstream parameters, credentials, dependencies and verification evidence.

- 工具族：tooluniverse_catalog；副作用：read；query：true；执行：sync。
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

## tooluniverse.run.tool

Validate and submit one exact ToolUniverse tool. Credentials are supplied by trusted Host metadata, never arguments.

- 工具族：tooluniverse_execute；副作用：execute；query：false；执行：async_or_cached。
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
      "tool_name": {
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
      "tool_name"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": {
    "id_fields": [
      "job_id"
    ],
    "argument": "job_id",
    "status": "tooluniverse.get.job",
    "cancel": "tooluniverse.cancel.job",
    "manifest": "tooluniverse.get.job.manifest",
    "log": "tooluniverse.get.job.log"
  }
}
```

## tooluniverse.list.jobs

List persistent jobs for one project.

- 工具族：tooluniverse_jobs；副作用：read；query：true；执行：sync。
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

## tooluniverse.get.job

Read job state, bounded logs or checksummed project result references.

- 工具族：tooluniverse_jobs；副作用：read；query：true；执行：sync。
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

## tooluniverse.get.job.log

Read job state, bounded logs or checksummed project result references.

- 工具族：tooluniverse_jobs；副作用：read；query：true；执行：sync。
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

## tooluniverse.get.job.manifest

Read job state, bounded logs or checksummed project result references.

- 工具族：tooluniverse_artifacts；副作用：read；query：true；执行：sync。
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

## tooluniverse.get.job.result

Read job state, bounded logs or checksummed project result references.

- 工具族：tooluniverse_artifacts；副作用：read；query：true；执行：sync。
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

## tooluniverse.wait.job

Wait at most 30 seconds for a persistent job.

- 工具族：tooluniverse_jobs；副作用：read；query：true；执行：sync。
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
      },
      "timeout_ms": {
        "type": "integer",
        "minimum": 0,
        "maximum": 30000,
        "default": 10000
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

## tooluniverse.cancel.job

Cancel queued or running ToolUniverse work.

- 工具族：tooluniverse_jobs；副作用：write；query：false；执行：sync。
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
