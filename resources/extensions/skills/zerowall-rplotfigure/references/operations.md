# 生成操作目录

此文件来自实际服务端注册。离线注册不等于运行时可用；精确执行前使用 describe。

## figureya.entry

FigureYa 远程 R/Rmd 绘图主入口。plan 只校验并保存模板、输入哈希和输出策略；run 只执行已验证计划。支持模板、自定义 R/Rmd 和 agent_assisted 草案，长任务返回 run_id/job_id，结果通过 Manifest 分片读取。自定义代码和执行必须 confirm=true。

- 工具族：r_figureya_plan；副作用：execute；query：false；执行：async_or_cached。
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
      "action": {
        "type": "string",
        "enum": [
          "plan",
          "run"
        ],
        "default": "plan",
        "description": "plan 仅校验并保存计划；run 仅执行已验证计划"
      },
      "mode": {
        "type": "string",
        "enum": [
          "template",
          "custom_r",
          "custom_rmd",
          "agent_assisted"
        ],
        "default": "template"
      },
      "template_id": {
        "type": "string",
        "minLength": 2,
        "maxLength": 180
      },
      "plan_id": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128,
        "description": "R job id returned by r_submit_script"
      },
      "prompt": {
        "type": "string",
        "maxLength": 100000,
        "default": ""
      },
      "code": {
        "type": "string",
        "maxLength": 2000000,
        "description": "custom_r/custom_rmd 代码，仅在 confirm=true 时提交"
      },
      "input_refs": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "source": {
              "type": "string",
              "enum": [
                "project",
                "geo",
                "nhanes"
              ],
              "default": "project"
            },
            "path": {
              "type": "string",
              "maxLength": 1024,
              "default": "",
              "description": "Existing file path. Write text with r.write.file or upload through the desktop r_files facade first."
            },
            "accession": {
              "type": "string"
            },
            "sha256": {
              "type": "string"
            }
          },
          "additionalProperties": true
        },
        "maxItems": 100,
        "default": [],
        "description": "Existing input files only. Omit for server-local FigureYa demo data; do not put file content here."
      },
      "parameters": {
        "type": "object",
        "additionalProperties": {},
        "default": {}
      },
      "outputs": {
        "type": "object",
        "additionalProperties": {},
        "default": {
          "formats": [
            "png"
          ]
        }
      },
      "report": {
        "type": "object",
        "additionalProperties": {},
        "default": {}
      },
      "seed": {
        "type": "integer",
        "minimum": 1,
        "maximum": 2147483647,
        "default": 123
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
      "project_id"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": {
    "id_fields": [
      "run_id",
      "job_id",
      "id"
    ],
    "argument": "run_id",
    "status": "figureya.get.job",
    "cancel": "figureya.cancel",
    "manifest": "figureya.get.manifest",
    "log": "figureya.get.log"
  }
}
```

## figureya.catalog

列出 FigureYa 中文绘图模块、来源提交、依赖和可用状态。只读。

- 工具族：r_figureya_catalog；副作用：read；query：true；执行：sync。
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
      "family": {
        "type": "string",
        "maxLength": 80,
        "default": ""
      },
      "status": {
        "type": "string",
        "maxLength": 80,
        "default": ""
      },
      "limit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 1000,
        "default": 500
      }
    },
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## figureya.search

按 PCA、火山图、热图、KM、GSEA 等关键词搜索 FigureYa 模板。只读。

- 工具族：r_figureya_catalog；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "q": {
        "type": "string",
        "minLength": 1,
        "maxLength": 300
      },
      "limit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 200,
        "default": 50
      }
    },
    "required": [
      "q"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## figureya.describe

查看一个 FigureYa 模块的中文用途、输入、输出、依赖、来源提交和 SHA-256。只读。

- 工具族：r_figureya_catalog；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "module_id": {
        "type": "string",
        "minLength": 2,
        "maxLength": 180
      }
    },
    "required": [
      "module_id"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## figureya.list.files

列出服务器本地 FigureYa 模块源码和示例文件。源码已安装在远端服务器，不需要网页抓取或外网 URL。只读。

- 工具族：r_figureya_catalog；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "module_id": {
        "type": "string",
        "minLength": 2,
        "maxLength": 180
      }
    },
    "required": [
      "module_id"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## figureya.get.source

读取服务器本地 FigureYa R/Rmd 源码或示例文本。优先使用此工具，不要从 raw.githubusercontent.com 下载同一模块。只读。

- 工具族：r_figureya_catalog；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "module_id": {
        "type": "string",
        "minLength": 2,
        "maxLength": 180
      },
      "path": {
        "type": "string",
        "maxLength": 1024,
        "default": ""
      },
      "max_chars": {
        "type": "integer",
        "minimum": 1,
        "maximum": 2000000,
        "default": 500000
      }
    },
    "required": [
      "module_id"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## figureya.source.file.manifest

读取服务器自带 FigureYa 模块源码或示例文件的 Manifest。无需 project_id，不返回文件内容。

- 工具族：r_figureya_catalog；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "module_id": {
        "type": "string",
        "minLength": 2,
        "maxLength": 180
      },
      "path": {
        "type": "string",
        "maxLength": 1024,
        "default": ""
      }
    },
    "required": [
      "module_id"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## figureya.read.source.file.chunk

按最多 4 MiB 的分片读取服务器自带 FigureYa 模块源码或示例文件。无需 project_id。普通调用只返回分片元数据；ZeroWall Host 下载时使用 internal_host_download=true 获取受控分片内容。

- 工具族：r_figureya_catalog；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "module_id": {
        "type": "string",
        "minLength": 2,
        "maxLength": 180
      },
      "path": {
        "type": "string",
        "maxLength": 1024,
        "default": ""
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
      },
      "internal_host_download": {
        "type": "boolean",
        "default": false,
        "description": "Host-only: allow the trusted local downloader to receive this binary chunk"
      }
    },
    "required": [
      "module_id"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## figureya.validate

校验 FigureYa 模块、输入引用、SHA-256、输出格式和运行时，不执行绘图。

- 工具族：r_figureya_plan；副作用：read；query：true；执行：sync。
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
      "action": {
        "type": "string",
        "const": "plan"
      },
      "mode": {
        "type": "string",
        "enum": [
          "template",
          "custom_r",
          "custom_rmd",
          "agent_assisted"
        ],
        "default": "template"
      },
      "template_id": {
        "type": "string",
        "minLength": 2,
        "maxLength": 180
      },
      "plan_id": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128,
        "description": "R job id returned by r_submit_script"
      },
      "prompt": {
        "type": "string",
        "maxLength": 100000,
        "default": ""
      },
      "code": {
        "type": "string",
        "maxLength": 2000000,
        "description": "custom_r/custom_rmd 代码，仅在 confirm=true 时提交"
      },
      "input_refs": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "source": {
              "type": "string",
              "enum": [
                "project",
                "geo",
                "nhanes"
              ],
              "default": "project"
            },
            "path": {
              "type": "string",
              "maxLength": 1024,
              "default": "",
              "description": "Existing file path. Write text with r.write.file or upload through the desktop r_files facade first."
            },
            "accession": {
              "type": "string"
            },
            "sha256": {
              "type": "string"
            }
          },
          "additionalProperties": true
        },
        "maxItems": 100,
        "default": [],
        "description": "Existing input files only. Omit for server-local FigureYa demo data; do not put file content here."
      },
      "parameters": {
        "type": "object",
        "additionalProperties": {},
        "default": {}
      },
      "outputs": {
        "type": "object",
        "additionalProperties": {},
        "default": {
          "formats": [
            "png"
          ]
        }
      },
      "report": {
        "type": "object",
        "additionalProperties": {},
        "default": {}
      },
      "seed": {
        "type": "integer",
        "minimum": 1,
        "maximum": 2147483647,
        "default": 123
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
      "action"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## figureya.create.plan

创建一个已验证的 FigureYa 绘图计划，保存输入引用和参数，等待后续 run。

- 工具族：r_figureya_plan；副作用：write；query：false；执行：sync。
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
      "action": {
        "type": "string",
        "const": "plan"
      },
      "mode": {
        "type": "string",
        "enum": [
          "template",
          "custom_r",
          "custom_rmd",
          "agent_assisted"
        ],
        "default": "template"
      },
      "template_id": {
        "type": "string",
        "minLength": 2,
        "maxLength": 180
      },
      "plan_id": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128,
        "description": "R job id returned by r_submit_script"
      },
      "prompt": {
        "type": "string",
        "maxLength": 100000,
        "default": ""
      },
      "code": {
        "type": "string",
        "maxLength": 2000000,
        "description": "custom_r/custom_rmd 代码，仅在 confirm=true 时提交"
      },
      "input_refs": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "source": {
              "type": "string",
              "enum": [
                "project",
                "geo",
                "nhanes"
              ],
              "default": "project"
            },
            "path": {
              "type": "string",
              "maxLength": 1024,
              "default": "",
              "description": "Existing file path. Write text with r.write.file or upload through the desktop r_files facade first."
            },
            "accession": {
              "type": "string"
            },
            "sha256": {
              "type": "string"
            }
          },
          "additionalProperties": true
        },
        "maxItems": 100,
        "default": [],
        "description": "Existing input files only. Omit for server-local FigureYa demo data; do not put file content here."
      },
      "parameters": {
        "type": "object",
        "additionalProperties": {},
        "default": {}
      },
      "outputs": {
        "type": "object",
        "additionalProperties": {},
        "default": {
          "formats": [
            "png"
          ]
        }
      },
      "report": {
        "type": "object",
        "additionalProperties": {},
        "default": {}
      },
      "seed": {
        "type": "integer",
        "minimum": 1,
        "maximum": 2147483647,
        "default": 123
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
      "action"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## figureya.run.plan

执行已验证 FigureYa 计划并立即返回异步任务 ID。需要 confirm=true。

- 工具族：r_figureya_run；副作用：execute；query：false；执行：async_or_cached。
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
      "plan_id": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128,
        "description": "R job id returned by r_submit_script"
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
      "plan_id"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": {
    "id_fields": [
      "run_id",
      "job_id",
      "id"
    ],
    "argument": "run_id",
    "status": "figureya.get.job",
    "cancel": "figureya.cancel",
    "manifest": "figureya.get.manifest",
    "log": "figureya.get.log"
  }
}
```

## figureya.get.job

查询 FigureYa 绘图任务状态、阶段、错误和运行时信息。

- 工具族：r_figureya_run；副作用：read；query：true；执行：sync。
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
      "run_id": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128,
        "description": "R job id returned by r_submit_script"
      }
    },
    "required": [
      "project_id",
      "run_id"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## figureya.wait.job

等待 FigureYa 异步绘图任务最多 30 秒并返回最新状态和项目内产物引用。不会读取或内嵌图片；需要查看图片时显式调用 figureya.read.image。

- 工具族：r_figureya_run；副作用：read；query：true；执行：sync。
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
      "run_id": {
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
      "project_id",
      "run_id"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## figureya.get.log

读取 FigureYa 绘图任务 stdout/stderr 和最近进度事件。

- 工具族：r_figureya_run；副作用：read；query：true；执行：sync。
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
      "run_id": {
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
      "project_id",
      "run_id"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## figureya.cancel

取消排队或运行中的 FigureYa 绘图任务。需要 confirm=true。

- 工具族：r_figureya_run；副作用：write；query：false；执行：sync。
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
      "run_id": {
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
      "run_id"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## figureya.get.manifest

分页列出 FigureYa 图片、表格、脚本、报告及其 MIME、大小和 SHA-256。默认返回 25 个文件和总数、总字节数、角色统计；使用 offset/limit 继续读取，不返回文件内容。

- 工具族：r_figureya_artifacts；副作用：read；query：true；执行：sync。
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
      "run_id": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128,
        "description": "R job id returned by r_submit_script"
      },
      "offset": {
        "type": "integer",
        "minimum": 0,
        "default": 0
      },
      "limit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 200,
        "default": 25
      },
      "role": {
        "type": "string",
        "maxLength": 80,
        "default": ""
      },
      "q": {
        "type": "string",
        "maxLength": 300,
        "default": ""
      }
    },
    "required": [
      "project_id",
      "run_id"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## figureya.get.result

读取 FigureYa 结果文本、图片或二进制文件；图片返回原生 MCP image，大文件使用 offset/max_bytes 分片。

- 工具族：r_figureya_artifacts；副作用：read；query：true；执行：sync。
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
      "run_id": {
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
      "project_id",
      "run_id"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## figureya.read.file.chunk

读取 FigureYa PDF、RDS、Parquet 等大文件的受限 base64 分片。

- 工具族：r_figureya_artifacts；副作用：read；query：true；执行：sync。
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
      "run_id": {
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
      "project_id",
      "run_id"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## figureya.read.image

读取 FigureYa 生成的 PNG/JPEG/SVG 图片并作为原生 MCP image 返回。project_id 可省略，服务端会按 run_id 推导。

- 工具族：r_figureya_artifacts；副作用：read；query：true；执行：sync。
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
      "run_id": {
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
        "maximum": 8388608,
        "default": 8388608
      }
    },
    "required": [
      "run_id"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## figureya.generate.report

为 FigureYa 计划生成 Quarto HTML/PDF 报告；PDF 不可用时保留 HTML/QMD 并标记降级。需要 confirm=true。

- 工具族：r_figureya_artifacts；副作用：write；query：false；执行：sync。
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
      "plan": {
        "type": "object",
        "additionalProperties": {}
      },
      "confirm": {
        "type": "boolean",
        "default": false,
        "description": "Must be true for file writes, destructive actions, code execution, and package changes"
      }
    },
    "required": [
      "project_id",
      "plan"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## figureya.compare

比较论文图表或表格，返回 SHA-256、MSE、SSIM、OCR、像素差异、数值误差和差异分类。需要 confirm=true。

- 工具族：r_figureya_artifacts；副作用：write；query：false；执行：sync。
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
      "kind": {
        "type": "string",
        "enum": [
          "figure",
          "table"
        ],
        "default": "figure"
      },
      "reference_path": {
        "type": "string",
        "maxLength": 1024,
        "default": "",
        "description": "Path relative to the project root; absolute paths and symbolic links are rejected"
      },
      "reproduced_path": {
        "$ref": "#/properties/reference_path"
      },
      "diff_output_path": {
        "$ref": "#/properties/reference_path",
        "description": "Path relative to the project root; absolute paths and symbolic links are rejected"
      },
      "tolerance": {
        "type": "number",
        "minimum": 0,
        "default": 1e-8
      },
      "confirm": {
        "type": "boolean",
        "default": false,
        "description": "Must be true for file writes, destructive actions, code execution, and package changes"
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
