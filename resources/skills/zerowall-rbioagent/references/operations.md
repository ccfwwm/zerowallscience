# 生成操作目录

此文件来自实际服务端注册。离线注册不等于运行时可用；精确执行前使用 describe。

## biomni.status

检查内部 Biomni 服务、Python 运行时、数据湖状态和凭据传输风险。只读。

- 工具族：biomni_runtime；副作用：read；query：true；执行：sync。
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

## biomni.capabilities

返回 Biomni/A1、Python 包、GEO/NHANES/R 联动和数据湖能力。只读。

- 工具族：biomni_runtime；副作用：read；query：true；执行：sync。
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

## biomni.tools

动态列出当前已安装 Biomni 工具及 ZeroWall 数据桥工具。只读。

- 工具族：biomni_catalog；副作用：read；query：true；执行：sync。
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

## biomni.search.tools

按关键词搜索 Biomni 动态工具目录。

- 工具族：biomni_catalog；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "q": {
        "type": "string",
        "maxLength": 200,
        "default": ""
      },
      "limit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 500,
        "default": 100
      }
    },
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## biomni.data.catalog

列出 Biomni 数据湖文件数量、大小和就绪状态。只读。

- 工具族：biomni_catalog；副作用：read；query：true；执行：sync。
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

## biomni.find.dataset

在 Biomni 数据湖中按路径或数据集名称查找文件。

- 工具族：biomni_catalog；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "q": {
        "type": "string",
        "maxLength": 300,
        "default": ""
      },
      "limit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 1000,
        "default": 100
      }
    },
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## biomni.get.know.how

搜索 Biomni know-how 文档索引；数据湖未预取时返回明确提示。

- 工具族：biomni_catalog；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "q": {
        "type": "string",
        "maxLength": 300,
        "default": ""
      },
      "limit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 100,
        "default": 20
      }
    },
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## biomni.runtime.profile

返回 Biomni Python 运行时 profile、允许模型和 LLM 地址配置状态。只读。

- 工具族：biomni_runtime；副作用：read；query：true；执行：sync。
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

## biomni.verify.datalake

校验 Biomni 数据湖当前文件索引和完整性状态。只读。

- 工具族：biomni_catalog；副作用：read；query：true；执行：sync。
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

## biomni.prefetch.datalake

异步预取 Biomni 数据湖或指定数据集。不会在 MCP 请求中等待；需要 download scope 和 confirm=true。

- 工具族：biomni_execute；副作用：execute；query：false；执行：async_or_cached。
- 确认字段：confirm。
- 输出：Submission with remote identifier; status and manifest are separate operations.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "datasets": {
        "type": "array",
        "items": {
          "type": "string",
          "minLength": 1,
          "maxLength": 500
        },
        "maxItems": 500,
        "default": []
      },
      "confirm": {
        "type": "boolean",
        "default": false,
        "description": "Must be true for file writes, destructive actions, code execution, and package changes"
      }
    },
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": {
    "id_fields": [
      "job_id",
      "download_job_id",
      "id"
    ],
    "argument": "job_id",
    "status": "biomni.get.download.status",
    "cancel": "biomni.cancel.download"
  }
}
```

## biomni.get.download.status

查询 Biomni 数据湖预取任务状态、日志和输出 Manifest。

- 工具族：biomni_jobs；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "job_id": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128,
        "description": "R job id returned by r_submit_script"
      }
    },
    "required": [
      "job_id"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## biomni.cancel.download

取消 Biomni 数据湖预取任务。需要 confirm=true。

- 工具族：biomni_jobs；副作用：write；query：false；执行：sync。
- 确认字段：confirm。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
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
      "job_id"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## biomni.run.agent

异步运行 Biomni A1 端到端生物医学任务，可联动 GEO/NHANES/R。支持任意已安装 Biomni 接受的模型和兼容 OpenAI 的 base_url；api_key 可由可信 Host、服务器环境或本次请求提供，不要求模型白名单或 credential proxy。需要 execute scope 和 confirm=true。

- 工具族：biomni_execute；副作用：execute；query：false；执行：async_or_cached。
- 确认字段：confirm。
- 输出：Submission with remote identifier; status and manifest are separate operations.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "provider": {
        "type": "string",
        "maxLength": 200
      },
      "api": {
        "type": "string",
        "enum": [
          "auto",
          "openai-completions",
          "openai-responses",
          "anthropic-messages"
        ]
      },
      "runtime_env": {
        "type": "object",
        "additionalProperties": {
          "type": "string",
          "maxLength": 8192
        },
        "description": "Host-only selected scientific variables"
      },
      "project_id": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128,
        "pattern": "^[A-Za-z0-9._-]+$",
        "description": "ZeroWall project id"
      },
      "prompt": {
        "type": "string",
        "minLength": 1,
        "maxLength": 100000
      },
      "session_id": {
        "type": "string",
        "maxLength": 160
      },
      "model": {
        "type": "string",
        "maxLength": 200
      },
      "base_url": {
        "type": "string",
        "format": "uri",
        "maxLength": 200,
        "description": "兼容 OpenAI 的模型服务地址；省略时使用服务器配置或模型环境变量"
      },
      "api_key": {
        "type": "string",
        "minLength": 1,
        "maxLength": 4096,
        "description": "本次任务的短期模型 API Key；省略时使用服务器环境或端点自带认证，不要写入 prompt"
      },
      "data_refs": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": {}
        },
        "maxItems": 100,
        "default": []
      },
      "integrations": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": [
            "geo",
            "nhanes",
            "r"
          ]
        },
        "maxItems": 10,
        "default": []
      },
      "timeout_ms": {
        "type": "integer",
        "minimum": 1000,
        "maximum": 14400000,
        "default": 3600000
      },
      "confirm": {
        "type": "boolean",
        "default": false,
        "description": "Must be true for file writes, destructive actions, code execution, and package changes"
      }
    },
    "required": [
      "project_id",
      "prompt"
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
    "status": "biomni.get.job",
    "cancel": "biomni.cancel.job",
    "manifest": "biomni.get.job.manifest",
    "log": "biomni.get.job.log"
  }
}
```

## biomni.call.tool

异步调用已由 Biomni 运行时发现并允许的工具。可信 ZeroWall Host 会透传当前模型、base_url 和 API Key；Key 仅用于本次任务。禁止任意 shell；需要 execute scope 和 confirm=true。

- 工具族：biomni_execute；副作用：execute；query：false；执行：async_or_cached。
- 确认字段：confirm。
- 输出：Submission with remote identifier; status and manifest are separate operations.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "provider": {
        "type": "string",
        "maxLength": 200
      },
      "api": {
        "type": "string",
        "enum": [
          "auto",
          "openai-completions",
          "openai-responses",
          "anthropic-messages"
        ]
      },
      "runtime_env": {
        "type": "object",
        "additionalProperties": {
          "type": "string",
          "maxLength": 8192
        },
        "description": "Host-only selected scientific variables"
      },
      "project_id": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128,
        "pattern": "^[A-Za-z0-9._-]+$",
        "description": "ZeroWall project id"
      },
      "tool_name": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200,
        "pattern": "^[A-Za-z0-9_.:-]+$"
      },
      "arguments": {
        "type": "object",
        "additionalProperties": {},
        "default": {}
      },
      "session_id": {
        "type": "string",
        "maxLength": 160
      },
      "model": {
        "type": "string",
        "maxLength": 200
      },
      "base_url": {
        "type": "string",
        "format": "uri",
        "maxLength": 200,
        "description": "由可信 Host 注入的当前模型 API 地址"
      },
      "api_key": {
        "type": "string",
        "minLength": 1,
        "maxLength": 4096,
        "description": "由可信 Host 注入的当前模型 API Key，不要在对话中填写"
      },
      "timeout_ms": {
        "type": "integer",
        "minimum": 1000,
        "maximum": 14400000,
        "default": 1800000
      },
      "confirm": {
        "type": "boolean",
        "default": false,
        "description": "Must be true for file writes, destructive actions, code execution, and package changes"
      }
    },
    "required": [
      "project_id",
      "tool_name"
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
    "status": "biomni.get.job",
    "cancel": "biomni.cancel.job",
    "manifest": "biomni.get.job.manifest",
    "log": "biomni.get.job.log"
  }
}
```

## biomni.run.python

Run Python in the shared host Biomni venv. Read BIOMNI_DATA_ROOT and write artifacts in the job directory. Task LLM configuration is inherited by Biomni calls. Requires confirm=true.

- 工具族：biomni_execute；副作用：execute；query：false；执行：async_or_cached。
- 确认字段：confirm。
- 输出：Submission with remote identifier; status and manifest are separate operations.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "provider": {
        "type": "string",
        "maxLength": 200
      },
      "api": {
        "type": "string",
        "enum": [
          "auto",
          "openai-completions",
          "openai-responses",
          "anthropic-messages"
        ]
      },
      "runtime_env": {
        "type": "object",
        "additionalProperties": {
          "type": "string",
          "maxLength": 8192
        },
        "description": "Host-only selected scientific variables"
      },
      "project_id": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128,
        "pattern": "^[A-Za-z0-9._-]+$",
        "description": "ZeroWall project id"
      },
      "code": {
        "type": "string",
        "minLength": 1,
        "maxLength": 2000000
      },
      "model": {
        "type": "string"
      },
      "base_url": {
        "type": "string",
        "format": "uri"
      },
      "api_key": {
        "type": "string",
        "maxLength": 4096
      },
      "timeout_ms": {
        "type": "integer",
        "minimum": 1000,
        "maximum": 14400000,
        "default": 1800000
      },
      "confirm": {
        "type": "boolean",
        "default": false,
        "description": "Must be true for file writes, destructive actions, code execution, and package changes"
      }
    },
    "required": [
      "project_id",
      "code"
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
    "status": "biomni.get.job",
    "cancel": "biomni.cancel.job",
    "manifest": "biomni.get.job.manifest",
    "log": "biomni.get.job.log"
  }
}
```

## biomni.list.jobs

列出最近的 Biomni A1、工具、Python 和数据湖任务。只读。

- 工具族：biomni_jobs；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "limit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 500,
        "default": 100
      }
    },
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## biomni.get.job

查询 Biomni Agent、工具或 Python 任务状态、阶段、错误和 Manifest。

- 工具族：biomni_jobs；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "job_id": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128,
        "description": "R job id returned by r_submit_script"
      }
    },
    "required": [
      "job_id"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## biomni.wait.job

等待 Biomni 异步任务最多 30 秒并返回最新状态。

- 工具族：biomni_jobs；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "job_id": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128,
        "description": "R job id returned by r_submit_script"
      },
      "timeout_ms": {
        "type": "integer",
        "minimum": 0,
        "maximum": 30000,
        "default": 10000
      }
    },
    "required": [
      "job_id"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## biomni.get.job.log

读取 Biomni 任务 stdout/stderr 尾部。

- 工具族：biomni_jobs；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "job_id": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128,
        "description": "R job id returned by r_submit_script"
      },
      "max_bytes": {
        "type": "integer",
        "minimum": 1,
        "maximum": 4000000,
        "default": 256000
      }
    },
    "required": [
      "job_id"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## biomni.cancel.job

取消 Biomni Agent、工具或 Python 任务。需要 confirm=true。

- 工具族：biomni_jobs；副作用：write；query：false；执行：sync。
- 确认字段：confirm。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
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
      "job_id"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## biomni.get.job.manifest

列出 Biomni 任务结果文件、MIME、大小和 SHA-256。

- 工具族：biomni_artifacts；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "job_id": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128,
        "description": "R job id returned by r_submit_script"
      }
    },
    "required": [
      "job_id"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## biomni.get.job.result

读取 Biomni 任务文本、图片或二进制结果；大文件按最多 4 MiB 分片返回。

- 工具族：biomni_artifacts；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "job_id": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128,
        "description": "R job id returned by r_submit_script"
      },
      "path": {
        "type": "string",
        "maxLength": 1024,
        "default": "",
        "description": "Path relative to the project root; absolute paths and symbolic links are rejected"
      },
      "offset": {
        "type": "integer",
        "minimum": 0,
        "default": 0
      },
      "max_bytes": {
        "type": "integer",
        "minimum": 1,
        "maximum": 4194304,
        "default": 1048576
      }
    },
    "required": [
      "job_id"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## biomni.read.file.chunk

读取 Biomni 任务结果的受限二进制分片，适用于 RDS、Parquet、PDF 等大文件。

- 工具族：biomni_artifacts；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "job_id": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128,
        "description": "R job id returned by r_submit_script"
      },
      "path": {
        "type": "string",
        "maxLength": 1024,
        "default": "",
        "description": "Path relative to the project root; absolute paths and symbolic links are rejected"
      },
      "offset": {
        "type": "integer",
        "minimum": 0,
        "default": 0
      },
      "length": {
        "type": "integer",
        "minimum": 1,
        "maximum": 4194304,
        "default": 1048576
      }
    },
    "required": [
      "job_id"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```
