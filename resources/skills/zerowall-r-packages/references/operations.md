# 生成操作目录

此文件来自实际服务端注册。离线注册不等于运行时可用；精确执行前使用 describe。

## r.get.package.status

Return installed versions and library paths for selected R packages. Read-only.

- 工具族：r_packages；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "packages": {
        "type": "array",
        "items": {
          "type": "string",
          "pattern": "^[A-Za-z][A-Za-z0-9.]+$"
        },
        "minItems": 1,
        "maxItems": 50
      }
    },
    "required": [
      "packages"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## r.ensure.analysis.packages

Ensure approved R/Bioconductor analysis packages are installed in the managed global library. Requires administrator authorization and confirm=true; DuckDB and Arrow are only checked and are not installed by this operation.

- 工具族：r_packages；副作用：write；query：false；执行：sync。
- 确认字段：confirm。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "packages": {
        "type": "array",
        "items": {
          "type": "string",
          "pattern": "^[A-Za-z][A-Za-z0-9.]+$"
        },
        "minItems": 1,
        "maxItems": 30
      },
      "confirm": {
        "type": "boolean",
        "default": false,
        "description": "Must be true for file writes, destructive actions, code execution, and package changes"
      }
    },
    "required": [
      "packages"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## r.list.packages

List installed R packages and versions visible to the remote R worker across the global and system library paths.

- 工具族：r_packages；副作用：read；query：true；执行：sync。
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

## r.install.packages

Install validated CRAN packages into the global R library under a serial package lock. Requires administrator authorization and confirm=true.

- 工具族：r_packages；副作用：write；query：false；执行：sync。
- 确认字段：confirm。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "packages": {
        "type": "array",
        "items": {
          "type": "string",
          "pattern": "^[A-Za-z][A-Za-z0-9.]+$"
        },
        "minItems": 1,
        "maxItems": 20
      },
      "confirm": {
        "type": "boolean",
        "default": false,
        "description": "Must be true for file writes, destructive actions, code execution, and package changes"
      }
    },
    "required": [
      "packages"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## r.uninstall.packages

Uninstall validated packages from the global R library under a serial package lock. Requires administrator authorization and confirm=true.

- 工具族：r_packages；副作用：write；query：false；执行：sync。
- 确认字段：confirm。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "packages": {
        "type": "array",
        "items": {
          "type": "string",
          "pattern": "^[A-Za-z][A-Za-z0-9.]+$"
        },
        "minItems": 1,
        "maxItems": 20
      },
      "confirm": {
        "type": "boolean",
        "default": false,
        "description": "Must be true for file writes, destructive actions, code execution, and package changes"
      }
    },
    "required": [
      "packages"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```
