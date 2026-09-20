# 生成操作目录

此文件来自实际服务端注册。离线注册不等于运行时可用；精确执行前使用 describe。

## r.nhanes.catalog

List the indexed NHANES cycles, domains, file counts, sizes, and classification summary.

- 工具族：r_nhanes_catalog；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "refresh": {
        "type": "boolean",
        "default": false
      }
    },
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## r.nhanes.list.datasets

List NHANES files by cycle, domain, or dataset name. Returns paths, formats, sizes, and classifications.

- 工具族：r_nhanes_catalog；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "cycle": {
        "type": "string",
        "pattern": "^[0-9]{4}-[0-9]{4}$",
        "description": "NHANES cycle, for example 2019-2020"
      },
      "domain": {
        "type": "string",
        "maxLength": 80,
        "description": "NHANES domain, for example Demographics or Laboratory"
      },
      "dataset": {
        "type": "string",
        "maxLength": 160
      },
      "limit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 1000,
        "default": 200
      }
    },
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## r.nhanes.search.variables

Search NHANES variable names, labels, descriptions, cycles, and domains. Returns bounded metadata, not sample records.

- 工具族：r_nhanes_catalog；副作用：read；query：true；执行：sync。
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
      "cycle": {
        "type": "string",
        "pattern": "^[0-9]{4}-[0-9]{4}$",
        "description": "NHANES cycle, for example 2019-2020"
      },
      "domain": {
        "type": "string",
        "maxLength": 80,
        "description": "NHANES domain, for example Demographics or Laboratory"
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

## r.nhanes.describe.dataset

Describe one NHANES data file, including columns, R types, labels, cycle, domain, size, and classification.

- 工具族：r_nhanes_catalog；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "minLength": 1,
        "maxLength": 1024
      }
    },
    "required": [
      "path"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## r.nhanes.get.codebook

List the codebook, variable-label, and HTML documentation files associated with an NHANES dataset.

- 工具族：r_nhanes_catalog；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "minLength": 1,
        "maxLength": 1024
      }
    },
    "required": [
      "path"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## r.nhanes.ensure.available

Check whether an NHANES dataset is locally available; when absent, return the official CDC download candidates and a queued-download request.

- 工具族：r_nhanes_catalog；副作用：execute；query：false；执行：async_or_cached。
- 确认字段：无。
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
      "cycle": {
        "type": "string",
        "pattern": "^[0-9]{4}-[0-9]{4}$",
        "description": "NHANES cycle, for example 2019-2020"
      },
      "domain": {
        "type": "string",
        "maxLength": 80,
        "description": "NHANES domain, for example Demographics or Laboratory"
      },
      "dataset": {
        "type": "string",
        "minLength": 1,
        "maxLength": 160
      }
    },
    "required": [
      "project_id",
      "dataset"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": {
    "id_fields": [
      "download_job_id",
      "job_id"
    ],
    "argument": "download_job_id",
    "status": "r.nhanes.get.download.status",
    "cancel": "r.nhanes.cancel.download"
  }
}
```

## r.nhanes.get.download.status

Return the state and progress of an NHANES download request.

- 工具族：r_nhanes_catalog；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "download_job_id": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128,
        "description": "R job id returned by r_submit_script"
      }
    },
    "required": [
      "download_job_id"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## r.nhanes.cancel.download

Cancel a queued NHANES download request. Requires confirm=true.

- 工具族：r_nhanes_catalog；副作用：write；query：false；执行：sync。
- 确认字段：confirm。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "download_job_id": {
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
      "download_job_id"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## r.nhanes.preview

Preview bounded rows and selected columns from an NHANES XPT, TSV, DAT, or SAS7BDAT file. Original files are read-only.

- 工具族：r_nhanes_catalog；副作用：write；query：false；执行：sync。
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
      "dataset": {
        "type": "object",
        "properties": {
          "path": {
            "type": "string",
            "maxLength": 1024,
            "description": "Path relative to the NHANES root, for example 2019-2020/Demographics/p_demo.xpt"
          },
          "cycle": {
            "type": "string",
            "pattern": "^[0-9]{4}-[0-9]{4}$",
            "description": "NHANES cycle, for example 2019-2020"
          },
          "domain": {
            "type": "string",
            "maxLength": 80,
            "description": "NHANES domain, for example Demographics or Laboratory"
          },
          "dataset": {
            "type": "string",
            "maxLength": 160
          },
          "columns": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "maxItems": 500
          },
          "ensure_available": {
            "type": "boolean",
            "default": false
          }
        },
        "additionalProperties": false
      },
      "max_rows": {
        "type": "integer",
        "minimum": 1,
        "maximum": 1000,
        "default": 100
      }
    },
    "required": [
      "project_id",
      "dataset"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## r.nhanes.query

Run a bounded parameterized NHANES query with selected columns and filters. Optionally writes a CSV/TSV/RDS result to the project workspace.

- 工具族：r_nhanes_analysis；副作用：write；query：false；执行：sync。
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
      "dataset": {
        "type": "object",
        "properties": {
          "path": {
            "type": "string",
            "maxLength": 1024,
            "description": "Path relative to the NHANES root, for example 2019-2020/Demographics/p_demo.xpt"
          },
          "cycle": {
            "type": "string",
            "pattern": "^[0-9]{4}-[0-9]{4}$",
            "description": "NHANES cycle, for example 2019-2020"
          },
          "domain": {
            "type": "string",
            "maxLength": 80,
            "description": "NHANES domain, for example Demographics or Laboratory"
          },
          "dataset": {
            "type": "string",
            "maxLength": 160
          },
          "columns": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "maxItems": 500
          },
          "ensure_available": {
            "type": "boolean",
            "default": false
          }
        },
        "additionalProperties": false
      },
      "columns": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "maxItems": 500
      },
      "filters": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "column": {
              "type": "string",
              "minLength": 1,
              "maxLength": 128
            },
            "op": {
              "type": "string",
              "enum": [
                "eq",
                "ne",
                "gt",
                "gte",
                "lt",
                "lte",
                "in",
                "contains"
              ]
            },
            "value": {}
          },
          "required": [
            "column",
            "op"
          ],
          "additionalProperties": false
        },
        "maxItems": 50,
        "default": []
      },
      "sort": {
        "type": "object",
        "properties": {
          "column": {
            "type": "string"
          },
          "direction": {
            "type": "string",
            "enum": [
              "asc",
              "desc"
            ],
            "default": "asc"
          }
        },
        "required": [
          "column"
        ],
        "additionalProperties": false
      },
      "limit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 10000,
        "default": 100
      },
      "output_path": {
        "type": "string",
        "maxLength": 1024,
        "default": "",
        "description": "Path relative to the project root; absolute paths and symbolic links are rejected"
      },
      "output_format": {
        "type": "string",
        "enum": [
          "csv",
          "tsv",
          "rds",
          "parquet"
        ],
        "default": "csv"
      }
    },
    "required": [
      "project_id",
      "dataset"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## r.nhanes.join

Join two to ten NHANES datasets by SEQN or another key and return bounded rows plus input manifests.

- 工具族：r_nhanes_analysis；副作用：write；query：false；执行：sync。
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
      "datasets": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "path": {
              "type": "string",
              "maxLength": 1024,
              "description": "Path relative to the NHANES root, for example 2019-2020/Demographics/p_demo.xpt"
            },
            "cycle": {
              "type": "string",
              "pattern": "^[0-9]{4}-[0-9]{4}$",
              "description": "NHANES cycle, for example 2019-2020"
            },
            "domain": {
              "type": "string",
              "maxLength": 80,
              "description": "NHANES domain, for example Demographics or Laboratory"
            },
            "dataset": {
              "type": "string",
              "maxLength": 160
            },
            "columns": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "maxItems": 500
            },
            "ensure_available": {
              "type": "boolean",
              "default": false
            }
          },
          "additionalProperties": false
        },
        "minItems": 2,
        "maxItems": 10
      },
      "key": {
        "type": "string",
        "default": "SEQN"
      },
      "all": {
        "type": "boolean",
        "default": false
      },
      "limit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 10000,
        "default": 1000
      },
      "output_path": {
        "type": "string",
        "maxLength": 1024,
        "default": "",
        "description": "Path relative to the project root; absolute paths and symbolic links are rejected"
      },
      "output_format": {
        "type": "string",
        "enum": [
          "csv",
          "tsv",
          "rds",
          "parquet"
        ],
        "default": "csv"
      }
    },
    "required": [
      "project_id",
      "datasets"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## r.nhanes.merge.cycles

Run a standard SEQN-based cross-cycle merge using explicit cycle dataset specifications. Returns merged rows and cycle provenance.

- 工具族：r_nhanes_analysis；副作用：write；query：false；执行：sync。
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
      "datasets": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "path": {
              "type": "string",
              "maxLength": 1024,
              "description": "Path relative to the NHANES root, for example 2019-2020/Demographics/p_demo.xpt"
            },
            "cycle": {
              "type": "string",
              "pattern": "^[0-9]{4}-[0-9]{4}$",
              "description": "NHANES cycle, for example 2019-2020"
            },
            "domain": {
              "type": "string",
              "maxLength": 80,
              "description": "NHANES domain, for example Demographics or Laboratory"
            },
            "dataset": {
              "type": "string",
              "maxLength": 160
            },
            "columns": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "maxItems": 500
            },
            "ensure_available": {
              "type": "boolean",
              "default": false
            }
          },
          "additionalProperties": false
        },
        "minItems": 2,
        "maxItems": 12
      },
      "key": {
        "type": "string",
        "default": "SEQN"
      },
      "all": {
        "type": "boolean",
        "default": false
      },
      "limit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 10000,
        "default": 1000
      },
      "output_path": {
        "type": "string",
        "maxLength": 1024,
        "default": "",
        "description": "Path relative to the project root; absolute paths and symbolic links are rejected"
      },
      "output_format": {
        "type": "string",
        "enum": [
          "csv",
          "tsv",
          "rds",
          "parquet"
        ],
        "default": "csv"
      }
    },
    "required": [
      "project_id",
      "datasets"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## r.nhanes.export.dataset

Materialize a bounded NHANES query into the project workspace as CSV, TSV, RDS, or Parquet and return a checksum manifest.

- 工具族：r_nhanes_artifacts；副作用：write；query：false；执行：sync。
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
      "dataset": {
        "type": "object",
        "properties": {
          "path": {
            "type": "string",
            "maxLength": 1024,
            "description": "Path relative to the NHANES root, for example 2019-2020/Demographics/p_demo.xpt"
          },
          "cycle": {
            "type": "string",
            "pattern": "^[0-9]{4}-[0-9]{4}$",
            "description": "NHANES cycle, for example 2019-2020"
          },
          "domain": {
            "type": "string",
            "maxLength": 80,
            "description": "NHANES domain, for example Demographics or Laboratory"
          },
          "dataset": {
            "type": "string",
            "maxLength": 160
          },
          "columns": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "maxItems": 500
          },
          "ensure_available": {
            "type": "boolean",
            "default": false
          }
        },
        "additionalProperties": false
      },
      "columns": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "maxItems": 500
      },
      "filters": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "column": {
              "type": "string",
              "minLength": 1,
              "maxLength": 128
            },
            "op": {
              "type": "string",
              "enum": [
                "eq",
                "ne",
                "gt",
                "gte",
                "lt",
                "lte",
                "in",
                "contains"
              ]
            },
            "value": {}
          },
          "required": [
            "column",
            "op"
          ],
          "additionalProperties": false
        },
        "maxItems": 50,
        "default": []
      },
      "limit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 200000,
        "default": 10000
      },
      "output_path": {
        "type": "string",
        "maxLength": 1024,
        "default": "",
        "description": "Path relative to the project root; absolute paths and symbolic links are rejected"
      },
      "output_format": {
        "type": "string",
        "enum": [
          "csv",
          "tsv",
          "rds",
          "parquet"
        ],
        "default": "csv"
      },
      "confirm": {
        "type": "boolean",
        "default": false,
        "description": "Must be true for file writes, destructive actions, code execution, and package changes"
      }
    },
    "required": [
      "project_id",
      "dataset"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## r.nhanes.survey.summary

Compute NHANES survey-weighted mean or proportion with optional grouping, PSU, strata, and weight variables.

- 工具族：r_nhanes_analysis；副作用：write；query：false；执行：sync。
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
      "datasets": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "path": {
              "type": "string",
              "maxLength": 1024,
              "description": "Path relative to the NHANES root, for example 2019-2020/Demographics/p_demo.xpt"
            },
            "cycle": {
              "type": "string",
              "pattern": "^[0-9]{4}-[0-9]{4}$",
              "description": "NHANES cycle, for example 2019-2020"
            },
            "domain": {
              "type": "string",
              "maxLength": 80,
              "description": "NHANES domain, for example Demographics or Laboratory"
            },
            "dataset": {
              "type": "string",
              "maxLength": 160
            },
            "columns": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "maxItems": 500
            },
            "ensure_available": {
              "type": "boolean",
              "default": false
            }
          },
          "additionalProperties": false
        },
        "minItems": 1,
        "maxItems": 10
      },
      "variable": {
        "type": "string"
      },
      "group_by": {
        "type": "string"
      },
      "weight": {
        "type": "string",
        "default": "WTMEC2YR"
      },
      "strata": {
        "type": "string",
        "default": "SDMVSTRA"
      },
      "psu": {
        "type": "string",
        "default": "SDMVPSU"
      },
      "key": {
        "type": "string",
        "default": "SEQN"
      },
      "all": {
        "type": "boolean",
        "default": false
      }
    },
    "required": [
      "project_id",
      "datasets",
      "variable"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## r.nhanes.survey.regression

Run a validated NHANES survey-weighted linear or logistic regression and return coefficients with standard errors.

- 工具族：r_nhanes_analysis；副作用：write；query：false；执行：sync。
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
      "datasets": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "path": {
              "type": "string",
              "maxLength": 1024,
              "description": "Path relative to the NHANES root, for example 2019-2020/Demographics/p_demo.xpt"
            },
            "cycle": {
              "type": "string",
              "pattern": "^[0-9]{4}-[0-9]{4}$",
              "description": "NHANES cycle, for example 2019-2020"
            },
            "domain": {
              "type": "string",
              "maxLength": 80,
              "description": "NHANES domain, for example Demographics or Laboratory"
            },
            "dataset": {
              "type": "string",
              "maxLength": 160
            },
            "columns": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "maxItems": 500
            },
            "ensure_available": {
              "type": "boolean",
              "default": false
            }
          },
          "additionalProperties": false
        },
        "minItems": 1,
        "maxItems": 10
      },
      "outcome": {
        "type": "string"
      },
      "predictors": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "maxItems": 50
      },
      "family": {
        "type": "string",
        "enum": [
          "gaussian",
          "binomial",
          "quasibinomial"
        ],
        "default": "gaussian"
      },
      "weight": {
        "type": "string",
        "default": "WTMEC2YR"
      },
      "strata": {
        "type": "string",
        "default": "SDMVSTRA"
      },
      "psu": {
        "type": "string",
        "default": "SDMVPSU"
      },
      "key": {
        "type": "string",
        "default": "SEQN"
      },
      "all": {
        "type": "boolean",
        "default": false
      }
    },
    "required": [
      "project_id",
      "datasets",
      "outcome",
      "predictors"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## r.nhanes.survey.tabulate

Compute survey-weighted proportions for a categorical NHANES variable.

- 工具族：r_nhanes_analysis；副作用：write；query：false；执行：sync。
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
      "datasets": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "path": {
              "type": "string",
              "maxLength": 1024,
              "description": "Path relative to the NHANES root, for example 2019-2020/Demographics/p_demo.xpt"
            },
            "cycle": {
              "type": "string",
              "pattern": "^[0-9]{4}-[0-9]{4}$",
              "description": "NHANES cycle, for example 2019-2020"
            },
            "domain": {
              "type": "string",
              "maxLength": 80,
              "description": "NHANES domain, for example Demographics or Laboratory"
            },
            "dataset": {
              "type": "string",
              "maxLength": 160
            },
            "columns": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "maxItems": 500
            },
            "ensure_available": {
              "type": "boolean",
              "default": false
            }
          },
          "additionalProperties": false
        },
        "minItems": 1,
        "maxItems": 10
      },
      "variable": {
        "type": "string"
      },
      "weight": {
        "type": "string",
        "default": "WTMEC2YR"
      },
      "strata": {
        "type": "string",
        "default": "SDMVSTRA"
      },
      "psu": {
        "type": "string",
        "default": "SDMVPSU"
      },
      "key": {
        "type": "string",
        "default": "SEQN"
      },
      "all": {
        "type": "boolean",
        "default": false
      }
    },
    "required": [
      "project_id",
      "datasets",
      "variable"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## r.nhanes.plot

Generate an NHANES PNG and return a native MCP image. Supports histogram, density, boxplot, bar, and scatter charts.

- 工具族：r_nhanes_analysis；副作用：write；query：false；执行：sync。
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
      "dataset": {
        "type": "object",
        "properties": {
          "path": {
            "type": "string",
            "maxLength": 1024,
            "description": "Path relative to the NHANES root, for example 2019-2020/Demographics/p_demo.xpt"
          },
          "cycle": {
            "type": "string",
            "pattern": "^[0-9]{4}-[0-9]{4}$",
            "description": "NHANES cycle, for example 2019-2020"
          },
          "domain": {
            "type": "string",
            "maxLength": 80,
            "description": "NHANES domain, for example Demographics or Laboratory"
          },
          "dataset": {
            "type": "string",
            "maxLength": 160
          },
          "columns": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "maxItems": 500
          },
          "ensure_available": {
            "type": "boolean",
            "default": false
          }
        },
        "additionalProperties": false
      },
      "variable": {
        "type": "string"
      },
      "y": {
        "type": "string"
      },
      "chart": {
        "type": "string",
        "enum": [
          "histogram",
          "density",
          "boxplot",
          "bar",
          "scatter"
        ]
      },
      "group_by": {
        "type": "string"
      },
      "columns": {
        "type": "array",
        "items": {
          "type": "string"
        }
      },
      "filters": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "column": {
              "type": "string",
              "minLength": 1,
              "maxLength": 128
            },
            "op": {
              "type": "string",
              "enum": [
                "eq",
                "ne",
                "gt",
                "gte",
                "lt",
                "lte",
                "in",
                "contains"
              ]
            },
            "value": {}
          },
          "required": [
            "column",
            "op"
          ],
          "additionalProperties": false
        },
        "maxItems": 50,
        "default": []
      },
      "limit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 200000,
        "default": 10000
      },
      "output_path": {
        "type": "string",
        "maxLength": 1024,
        "default": "",
        "description": "Path relative to the project root; absolute paths and symbolic links are rejected"
      },
      "title": {
        "type": "string",
        "maxLength": 200
      },
      "width": {
        "type": "integer",
        "minimum": 320,
        "maximum": 4000,
        "default": 1200
      },
      "height": {
        "type": "integer",
        "minimum": 240,
        "maximum": 4000,
        "default": 800
      }
    },
    "required": [
      "project_id",
      "dataset",
      "variable"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## r.nhanes.survey.plot

Generate a survey-weighted NHANES PNG. Supports weighted histogram, category proportions, and grouped trends with weight, strata, and PSU validation.

- 工具族：r_nhanes_analysis；副作用：write；query：false；执行：sync。
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
      "datasets": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "path": {
              "type": "string",
              "maxLength": 1024,
              "description": "Path relative to the NHANES root, for example 2019-2020/Demographics/p_demo.xpt"
            },
            "cycle": {
              "type": "string",
              "pattern": "^[0-9]{4}-[0-9]{4}$",
              "description": "NHANES cycle, for example 2019-2020"
            },
            "domain": {
              "type": "string",
              "maxLength": 80,
              "description": "NHANES domain, for example Demographics or Laboratory"
            },
            "dataset": {
              "type": "string",
              "maxLength": 160
            },
            "columns": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "maxItems": 500
            },
            "ensure_available": {
              "type": "boolean",
              "default": false
            }
          },
          "additionalProperties": false
        },
        "minItems": 1,
        "maxItems": 10
      },
      "variable": {
        "type": "string"
      },
      "chart": {
        "type": "string",
        "enum": [
          "histogram",
          "bar",
          "proportion",
          "trend"
        ],
        "default": "histogram"
      },
      "group_by": {
        "type": "string"
      },
      "filters": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "column": {
              "type": "string",
              "minLength": 1,
              "maxLength": 128
            },
            "op": {
              "type": "string",
              "enum": [
                "eq",
                "ne",
                "gt",
                "gte",
                "lt",
                "lte",
                "in",
                "contains"
              ]
            },
            "value": {}
          },
          "required": [
            "column",
            "op"
          ],
          "additionalProperties": false
        },
        "maxItems": 50,
        "default": []
      },
      "weight": {
        "type": "string",
        "default": "WTMEC2YR"
      },
      "strata": {
        "type": "string",
        "default": "SDMVSTRA"
      },
      "psu": {
        "type": "string",
        "default": "SDMVPSU"
      },
      "key": {
        "type": "string",
        "default": "SEQN"
      },
      "all": {
        "type": "boolean",
        "default": false
      },
      "output_path": {
        "type": "string",
        "maxLength": 1024,
        "default": "",
        "description": "Path relative to the project root; absolute paths and symbolic links are rejected"
      },
      "title": {
        "type": "string",
        "maxLength": 200
      },
      "width": {
        "type": "integer",
        "minimum": 320,
        "maximum": 4000,
        "default": 1400
      },
      "height": {
        "type": "integer",
        "minimum": 240,
        "maximum": 4000,
        "default": 900
      }
    },
    "required": [
      "project_id",
      "datasets",
      "variable"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## r.nhanes.create.analysis.plan

Save a versioned NHANES analysis plan in the ZeroWall project for later validation and asynchronous execution.

- 工具族：r_nhanes_analysis；副作用：write；query：false；执行：sync。
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
      "name": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      },
      "plan": {
        "type": "object",
        "additionalProperties": {}
      }
    },
    "required": [
      "project_id",
      "name",
      "plan"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## r.nhanes.list.analysis.plans

List saved NHANES analysis plans for a project.

- 工具族：r_nhanes_artifacts；副作用：read；query：true；执行：sync。
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
      "limit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 100,
        "default": 50
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

## r.nhanes.get.analysis.plan

Get one saved NHANES analysis plan, including its structured definition and catalog version.

- 工具族：r_nhanes_artifacts；副作用：read；query：true；执行：sync。
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
      "plan_id": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128,
        "description": "R job id returned by r_submit_script"
      }
    },
    "required": [
      "project_id",
      "plan_id"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## r.nhanes.run.analysis.plan

Validate and asynchronously run a saved NHANES analysis plan. Results include reproducible R code and manifests.

- 工具族：r_nhanes_analysis；副作用：execute；query：false；执行：async_or_cached。
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
        "maximum": 3600000,
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
      "plan_id"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": {
    "id_fields": [
      "run_id",
      "id"
    ],
    "argument": "run_id",
    "status": "r.nhanes.get.analysis.run",
    "cancel": "r.nhanes.cancel.analysis.run",
    "manifest": "r.nhanes.get.analysis.manifest"
  }
}
```

## r.nhanes.get.analysis.run

Get the current status and underlying job record for a NHANES analysis run.

- 工具族：r_nhanes_artifacts；副作用：read；query：true；执行：sync。
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

## r.nhanes.cancel.analysis.run

Cancel a queued or running NHANES analysis run. Requires confirm=true.

- 工具族：r_nhanes_artifacts；副作用：write；query：false；执行：sync。
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

## r.nhanes.get.analysis.manifest

List CSV, RDS, PNG, JSON, and generated R script artifacts for a NHANES analysis run.

- 工具族：r_nhanes_artifacts；副作用：read；query：true；执行：sync。
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

## r.nhanes.get.analysis.result

Read a NHANES analysis result file as text, native image, or bounded base64 chunk.

- 工具族：r_nhanes_artifacts；副作用：read；query：true；执行：sync。
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

## r.nhanes.table.one

Run an asynchronous NHANES table_one analysis using installed R/Bioconductor packages. Validates inputs, records runtime/package versions, and returns a job id; requires confirm=true.

- 工具族：r_nhanes_analysis；副作用：execute；query：false；执行：async_or_cached。
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
      "inputs": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": {}
        },
        "minItems": 1,
        "maxItems": 20
      },
      "accession": {
        "type": "string",
        "pattern": "^(GSE|GSM|GPL)[1-9][0-9]*$",
        "description": "Public GEO accession, for example GSE1000"
      },
      "path": {
        "type": "string",
        "maxLength": 1024,
        "default": "",
        "description": "Path relative to the project root; absolute paths and symbolic links are rejected"
      },
      "datasets": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": {}
        },
        "maxItems": 20
      },
      "operation": {
        "type": "string",
        "const": "table_one"
      },
      "method": {
        "anyOf": [
          {
            "type": "object",
            "additionalProperties": {}
          },
          {
            "type": "string"
          }
        ]
      },
      "design": {
        "type": "object",
        "additionalProperties": {}
      },
      "sample_groups": {
        "type": "object",
        "additionalProperties": {
          "type": "string"
        }
      },
      "feature_id": {
        "type": "string",
        "maxLength": 128
      },
      "genes": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "maxItems": 100000
      },
      "ontology": {
        "type": "string",
        "enum": [
          "BP",
          "MF",
          "CC"
        ]
      },
      "key_type": {
        "type": "string",
        "maxLength": 40
      },
      "variables": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "maxItems": 500
      },
      "group_by": {
        "type": "string",
        "maxLength": 128
      },
      "formula": {
        "type": "string",
        "maxLength": 1000
      },
      "time": {
        "type": "string",
        "maxLength": 128
      },
      "event": {
        "type": "string",
        "maxLength": 128
      },
      "effect_sizes": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "maxItems": 1000
      },
      "variances": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "maxItems": 1000
      },
      "outputs": {
        "type": "object",
        "additionalProperties": {}
      },
      "normalization": {
        "type": "string",
        "maxLength": 40
      },
      "harmony": {
        "type": "boolean"
      },
      "batch_field": {
        "type": "string",
        "maxLength": 128
      },
      "checkpoint": {
        "type": "boolean",
        "default": true
      },
      "apply_filters": {
        "type": "boolean"
      },
      "min_features": {
        "type": "integer",
        "minimum": 0
      },
      "max_features": {
        "type": "integer",
        "minimum": 1
      },
      "min_counts": {
        "type": "integer",
        "minimum": 0
      },
      "max_counts": {
        "type": "integer",
        "minimum": 1
      },
      "max_percent_mt": {
        "type": "number",
        "minimum": 0,
        "maximum": 100
      },
      "nfeatures": {
        "type": "integer",
        "minimum": 100,
        "maximum": 10000
      },
      "npcs": {
        "type": "integer",
        "minimum": 2,
        "maximum": 100
      },
      "dims": {
        "type": "integer",
        "minimum": 2,
        "maximum": 100
      },
      "resolution": {
        "type": "number",
        "minimum": 0.01,
        "maximum": 10
      },
      "markers": {
        "type": "boolean"
      },
      "min_pct": {
        "type": "number",
        "minimum": 0,
        "maximum": 1
      },
      "logfc_threshold": {
        "type": "number",
        "minimum": 0
      },
      "doublet_detection": {
        "type": "boolean"
      },
      "reference": {
        "type": "string",
        "maxLength": 80
      },
      "treatment": {
        "type": "string",
        "maxLength": 128
      },
      "matching_method": {
        "type": "string",
        "maxLength": 40
      },
      "distance": {
        "type": "string",
        "maxLength": 40
      },
      "ratio": {
        "type": "integer",
        "minimum": 1,
        "maximum": 20
      },
      "caliper": {
        "type": "number",
        "exclusiveMinimum": 0
      },
      "m": {
        "type": "integer",
        "minimum": 2,
        "maximum": 100
      },
      "maxit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 100
      },
      "REML": {
        "type": "boolean"
      },
      "metadata": {
        "type": "object",
        "additionalProperties": {}
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
        "maximum": 14400000
      },
      "confirm": {
        "type": "boolean",
        "default": false,
        "description": "Must be true for file writes, destructive actions, code execution, and package changes"
      }
    },
    "required": [
      "project_id",
      "operation"
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
    "status": "r.get.job",
    "cancel": "r.cancel.job",
    "manifest": "r.get.job.manifest",
    "log": "r.get.job.log"
  }
}
```

## r.nhanes.survival

Run an asynchronous NHANES survival analysis using installed R/Bioconductor packages. Validates inputs, records runtime/package versions, and returns a job id; requires confirm=true.

- 工具族：r_nhanes_analysis；副作用：execute；query：false；执行：async_or_cached。
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
      "inputs": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": {}
        },
        "minItems": 1,
        "maxItems": 20
      },
      "accession": {
        "type": "string",
        "pattern": "^(GSE|GSM|GPL)[1-9][0-9]*$",
        "description": "Public GEO accession, for example GSE1000"
      },
      "path": {
        "type": "string",
        "maxLength": 1024,
        "default": "",
        "description": "Path relative to the project root; absolute paths and symbolic links are rejected"
      },
      "datasets": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": {}
        },
        "maxItems": 20
      },
      "operation": {
        "type": "string",
        "const": "survival"
      },
      "method": {
        "anyOf": [
          {
            "type": "object",
            "additionalProperties": {}
          },
          {
            "type": "string"
          }
        ]
      },
      "design": {
        "type": "object",
        "additionalProperties": {}
      },
      "sample_groups": {
        "type": "object",
        "additionalProperties": {
          "type": "string"
        }
      },
      "feature_id": {
        "type": "string",
        "maxLength": 128
      },
      "genes": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "maxItems": 100000
      },
      "ontology": {
        "type": "string",
        "enum": [
          "BP",
          "MF",
          "CC"
        ]
      },
      "key_type": {
        "type": "string",
        "maxLength": 40
      },
      "variables": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "maxItems": 500
      },
      "group_by": {
        "type": "string",
        "maxLength": 128
      },
      "formula": {
        "type": "string",
        "maxLength": 1000
      },
      "time": {
        "type": "string",
        "maxLength": 128
      },
      "event": {
        "type": "string",
        "maxLength": 128
      },
      "effect_sizes": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "maxItems": 1000
      },
      "variances": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "maxItems": 1000
      },
      "outputs": {
        "type": "object",
        "additionalProperties": {}
      },
      "normalization": {
        "type": "string",
        "maxLength": 40
      },
      "harmony": {
        "type": "boolean"
      },
      "batch_field": {
        "type": "string",
        "maxLength": 128
      },
      "checkpoint": {
        "type": "boolean",
        "default": true
      },
      "apply_filters": {
        "type": "boolean"
      },
      "min_features": {
        "type": "integer",
        "minimum": 0
      },
      "max_features": {
        "type": "integer",
        "minimum": 1
      },
      "min_counts": {
        "type": "integer",
        "minimum": 0
      },
      "max_counts": {
        "type": "integer",
        "minimum": 1
      },
      "max_percent_mt": {
        "type": "number",
        "minimum": 0,
        "maximum": 100
      },
      "nfeatures": {
        "type": "integer",
        "minimum": 100,
        "maximum": 10000
      },
      "npcs": {
        "type": "integer",
        "minimum": 2,
        "maximum": 100
      },
      "dims": {
        "type": "integer",
        "minimum": 2,
        "maximum": 100
      },
      "resolution": {
        "type": "number",
        "minimum": 0.01,
        "maximum": 10
      },
      "markers": {
        "type": "boolean"
      },
      "min_pct": {
        "type": "number",
        "minimum": 0,
        "maximum": 1
      },
      "logfc_threshold": {
        "type": "number",
        "minimum": 0
      },
      "doublet_detection": {
        "type": "boolean"
      },
      "reference": {
        "type": "string",
        "maxLength": 80
      },
      "treatment": {
        "type": "string",
        "maxLength": 128
      },
      "matching_method": {
        "type": "string",
        "maxLength": 40
      },
      "distance": {
        "type": "string",
        "maxLength": 40
      },
      "ratio": {
        "type": "integer",
        "minimum": 1,
        "maximum": 20
      },
      "caliper": {
        "type": "number",
        "exclusiveMinimum": 0
      },
      "m": {
        "type": "integer",
        "minimum": 2,
        "maximum": 100
      },
      "maxit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 100
      },
      "REML": {
        "type": "boolean"
      },
      "metadata": {
        "type": "object",
        "additionalProperties": {}
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
        "maximum": 14400000
      },
      "confirm": {
        "type": "boolean",
        "default": false,
        "description": "Must be true for file writes, destructive actions, code execution, and package changes"
      }
    },
    "required": [
      "project_id",
      "operation"
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
    "status": "r.get.job",
    "cancel": "r.cancel.job",
    "manifest": "r.get.job.manifest",
    "log": "r.get.job.log"
  }
}
```

## r.nhanes.mixed.model

Run an asynchronous NHANES mixed_model analysis using installed R/Bioconductor packages. Validates inputs, records runtime/package versions, and returns a job id; requires confirm=true.

- 工具族：r_nhanes_analysis；副作用：execute；query：false；执行：async_or_cached。
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
      "inputs": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": {}
        },
        "minItems": 1,
        "maxItems": 20
      },
      "accession": {
        "type": "string",
        "pattern": "^(GSE|GSM|GPL)[1-9][0-9]*$",
        "description": "Public GEO accession, for example GSE1000"
      },
      "path": {
        "type": "string",
        "maxLength": 1024,
        "default": "",
        "description": "Path relative to the project root; absolute paths and symbolic links are rejected"
      },
      "datasets": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": {}
        },
        "maxItems": 20
      },
      "operation": {
        "type": "string",
        "const": "mixed_model"
      },
      "method": {
        "anyOf": [
          {
            "type": "object",
            "additionalProperties": {}
          },
          {
            "type": "string"
          }
        ]
      },
      "design": {
        "type": "object",
        "additionalProperties": {}
      },
      "sample_groups": {
        "type": "object",
        "additionalProperties": {
          "type": "string"
        }
      },
      "feature_id": {
        "type": "string",
        "maxLength": 128
      },
      "genes": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "maxItems": 100000
      },
      "ontology": {
        "type": "string",
        "enum": [
          "BP",
          "MF",
          "CC"
        ]
      },
      "key_type": {
        "type": "string",
        "maxLength": 40
      },
      "variables": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "maxItems": 500
      },
      "group_by": {
        "type": "string",
        "maxLength": 128
      },
      "formula": {
        "type": "string",
        "maxLength": 1000
      },
      "time": {
        "type": "string",
        "maxLength": 128
      },
      "event": {
        "type": "string",
        "maxLength": 128
      },
      "effect_sizes": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "maxItems": 1000
      },
      "variances": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "maxItems": 1000
      },
      "outputs": {
        "type": "object",
        "additionalProperties": {}
      },
      "normalization": {
        "type": "string",
        "maxLength": 40
      },
      "harmony": {
        "type": "boolean"
      },
      "batch_field": {
        "type": "string",
        "maxLength": 128
      },
      "checkpoint": {
        "type": "boolean",
        "default": true
      },
      "apply_filters": {
        "type": "boolean"
      },
      "min_features": {
        "type": "integer",
        "minimum": 0
      },
      "max_features": {
        "type": "integer",
        "minimum": 1
      },
      "min_counts": {
        "type": "integer",
        "minimum": 0
      },
      "max_counts": {
        "type": "integer",
        "minimum": 1
      },
      "max_percent_mt": {
        "type": "number",
        "minimum": 0,
        "maximum": 100
      },
      "nfeatures": {
        "type": "integer",
        "minimum": 100,
        "maximum": 10000
      },
      "npcs": {
        "type": "integer",
        "minimum": 2,
        "maximum": 100
      },
      "dims": {
        "type": "integer",
        "minimum": 2,
        "maximum": 100
      },
      "resolution": {
        "type": "number",
        "minimum": 0.01,
        "maximum": 10
      },
      "markers": {
        "type": "boolean"
      },
      "min_pct": {
        "type": "number",
        "minimum": 0,
        "maximum": 1
      },
      "logfc_threshold": {
        "type": "number",
        "minimum": 0
      },
      "doublet_detection": {
        "type": "boolean"
      },
      "reference": {
        "type": "string",
        "maxLength": 80
      },
      "treatment": {
        "type": "string",
        "maxLength": 128
      },
      "matching_method": {
        "type": "string",
        "maxLength": 40
      },
      "distance": {
        "type": "string",
        "maxLength": 40
      },
      "ratio": {
        "type": "integer",
        "minimum": 1,
        "maximum": 20
      },
      "caliper": {
        "type": "number",
        "exclusiveMinimum": 0
      },
      "m": {
        "type": "integer",
        "minimum": 2,
        "maximum": 100
      },
      "maxit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 100
      },
      "REML": {
        "type": "boolean"
      },
      "metadata": {
        "type": "object",
        "additionalProperties": {}
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
        "maximum": 14400000
      },
      "confirm": {
        "type": "boolean",
        "default": false,
        "description": "Must be true for file writes, destructive actions, code execution, and package changes"
      }
    },
    "required": [
      "project_id",
      "operation"
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
    "status": "r.get.job",
    "cancel": "r.cancel.job",
    "manifest": "r.get.job.manifest",
    "log": "r.get.job.log"
  }
}
```

## r.nhanes.multiple.imputation

Run an asynchronous NHANES multiple_imputation analysis using installed R/Bioconductor packages. Validates inputs, records runtime/package versions, and returns a job id; requires confirm=true.

- 工具族：r_nhanes_analysis；副作用：execute；query：false；执行：async_or_cached。
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
      "inputs": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": {}
        },
        "minItems": 1,
        "maxItems": 20
      },
      "accession": {
        "type": "string",
        "pattern": "^(GSE|GSM|GPL)[1-9][0-9]*$",
        "description": "Public GEO accession, for example GSE1000"
      },
      "path": {
        "type": "string",
        "maxLength": 1024,
        "default": "",
        "description": "Path relative to the project root; absolute paths and symbolic links are rejected"
      },
      "datasets": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": {}
        },
        "maxItems": 20
      },
      "operation": {
        "type": "string",
        "const": "multiple_imputation"
      },
      "method": {
        "anyOf": [
          {
            "type": "object",
            "additionalProperties": {}
          },
          {
            "type": "string"
          }
        ]
      },
      "design": {
        "type": "object",
        "additionalProperties": {}
      },
      "sample_groups": {
        "type": "object",
        "additionalProperties": {
          "type": "string"
        }
      },
      "feature_id": {
        "type": "string",
        "maxLength": 128
      },
      "genes": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "maxItems": 100000
      },
      "ontology": {
        "type": "string",
        "enum": [
          "BP",
          "MF",
          "CC"
        ]
      },
      "key_type": {
        "type": "string",
        "maxLength": 40
      },
      "variables": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "maxItems": 500
      },
      "group_by": {
        "type": "string",
        "maxLength": 128
      },
      "formula": {
        "type": "string",
        "maxLength": 1000
      },
      "time": {
        "type": "string",
        "maxLength": 128
      },
      "event": {
        "type": "string",
        "maxLength": 128
      },
      "effect_sizes": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "maxItems": 1000
      },
      "variances": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "maxItems": 1000
      },
      "outputs": {
        "type": "object",
        "additionalProperties": {}
      },
      "normalization": {
        "type": "string",
        "maxLength": 40
      },
      "harmony": {
        "type": "boolean"
      },
      "batch_field": {
        "type": "string",
        "maxLength": 128
      },
      "checkpoint": {
        "type": "boolean",
        "default": true
      },
      "apply_filters": {
        "type": "boolean"
      },
      "min_features": {
        "type": "integer",
        "minimum": 0
      },
      "max_features": {
        "type": "integer",
        "minimum": 1
      },
      "min_counts": {
        "type": "integer",
        "minimum": 0
      },
      "max_counts": {
        "type": "integer",
        "minimum": 1
      },
      "max_percent_mt": {
        "type": "number",
        "minimum": 0,
        "maximum": 100
      },
      "nfeatures": {
        "type": "integer",
        "minimum": 100,
        "maximum": 10000
      },
      "npcs": {
        "type": "integer",
        "minimum": 2,
        "maximum": 100
      },
      "dims": {
        "type": "integer",
        "minimum": 2,
        "maximum": 100
      },
      "resolution": {
        "type": "number",
        "minimum": 0.01,
        "maximum": 10
      },
      "markers": {
        "type": "boolean"
      },
      "min_pct": {
        "type": "number",
        "minimum": 0,
        "maximum": 1
      },
      "logfc_threshold": {
        "type": "number",
        "minimum": 0
      },
      "doublet_detection": {
        "type": "boolean"
      },
      "reference": {
        "type": "string",
        "maxLength": 80
      },
      "treatment": {
        "type": "string",
        "maxLength": 128
      },
      "matching_method": {
        "type": "string",
        "maxLength": 40
      },
      "distance": {
        "type": "string",
        "maxLength": 40
      },
      "ratio": {
        "type": "integer",
        "minimum": 1,
        "maximum": 20
      },
      "caliper": {
        "type": "number",
        "exclusiveMinimum": 0
      },
      "m": {
        "type": "integer",
        "minimum": 2,
        "maximum": 100
      },
      "maxit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 100
      },
      "REML": {
        "type": "boolean"
      },
      "metadata": {
        "type": "object",
        "additionalProperties": {}
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
        "maximum": 14400000
      },
      "confirm": {
        "type": "boolean",
        "default": false,
        "description": "Must be true for file writes, destructive actions, code execution, and package changes"
      }
    },
    "required": [
      "project_id",
      "operation"
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
    "status": "r.get.job",
    "cancel": "r.cancel.job",
    "manifest": "r.get.job.manifest",
    "log": "r.get.job.log"
  }
}
```

## r.nhanes.propensity.score

Run an asynchronous NHANES propensity_score analysis using installed R/Bioconductor packages. Validates inputs, records runtime/package versions, and returns a job id; requires confirm=true.

- 工具族：r_nhanes_analysis；副作用：execute；query：false；执行：async_or_cached。
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
      "inputs": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": {}
        },
        "minItems": 1,
        "maxItems": 20
      },
      "accession": {
        "type": "string",
        "pattern": "^(GSE|GSM|GPL)[1-9][0-9]*$",
        "description": "Public GEO accession, for example GSE1000"
      },
      "path": {
        "type": "string",
        "maxLength": 1024,
        "default": "",
        "description": "Path relative to the project root; absolute paths and symbolic links are rejected"
      },
      "datasets": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": {}
        },
        "maxItems": 20
      },
      "operation": {
        "type": "string",
        "const": "propensity_score"
      },
      "method": {
        "anyOf": [
          {
            "type": "object",
            "additionalProperties": {}
          },
          {
            "type": "string"
          }
        ]
      },
      "design": {
        "type": "object",
        "additionalProperties": {}
      },
      "sample_groups": {
        "type": "object",
        "additionalProperties": {
          "type": "string"
        }
      },
      "feature_id": {
        "type": "string",
        "maxLength": 128
      },
      "genes": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "maxItems": 100000
      },
      "ontology": {
        "type": "string",
        "enum": [
          "BP",
          "MF",
          "CC"
        ]
      },
      "key_type": {
        "type": "string",
        "maxLength": 40
      },
      "variables": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "maxItems": 500
      },
      "group_by": {
        "type": "string",
        "maxLength": 128
      },
      "formula": {
        "type": "string",
        "maxLength": 1000
      },
      "time": {
        "type": "string",
        "maxLength": 128
      },
      "event": {
        "type": "string",
        "maxLength": 128
      },
      "effect_sizes": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "maxItems": 1000
      },
      "variances": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "maxItems": 1000
      },
      "outputs": {
        "type": "object",
        "additionalProperties": {}
      },
      "normalization": {
        "type": "string",
        "maxLength": 40
      },
      "harmony": {
        "type": "boolean"
      },
      "batch_field": {
        "type": "string",
        "maxLength": 128
      },
      "checkpoint": {
        "type": "boolean",
        "default": true
      },
      "apply_filters": {
        "type": "boolean"
      },
      "min_features": {
        "type": "integer",
        "minimum": 0
      },
      "max_features": {
        "type": "integer",
        "minimum": 1
      },
      "min_counts": {
        "type": "integer",
        "minimum": 0
      },
      "max_counts": {
        "type": "integer",
        "minimum": 1
      },
      "max_percent_mt": {
        "type": "number",
        "minimum": 0,
        "maximum": 100
      },
      "nfeatures": {
        "type": "integer",
        "minimum": 100,
        "maximum": 10000
      },
      "npcs": {
        "type": "integer",
        "minimum": 2,
        "maximum": 100
      },
      "dims": {
        "type": "integer",
        "minimum": 2,
        "maximum": 100
      },
      "resolution": {
        "type": "number",
        "minimum": 0.01,
        "maximum": 10
      },
      "markers": {
        "type": "boolean"
      },
      "min_pct": {
        "type": "number",
        "minimum": 0,
        "maximum": 1
      },
      "logfc_threshold": {
        "type": "number",
        "minimum": 0
      },
      "doublet_detection": {
        "type": "boolean"
      },
      "reference": {
        "type": "string",
        "maxLength": 80
      },
      "treatment": {
        "type": "string",
        "maxLength": 128
      },
      "matching_method": {
        "type": "string",
        "maxLength": 40
      },
      "distance": {
        "type": "string",
        "maxLength": 40
      },
      "ratio": {
        "type": "integer",
        "minimum": 1,
        "maximum": 20
      },
      "caliper": {
        "type": "number",
        "exclusiveMinimum": 0
      },
      "m": {
        "type": "integer",
        "minimum": 2,
        "maximum": 100
      },
      "maxit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 100
      },
      "REML": {
        "type": "boolean"
      },
      "metadata": {
        "type": "object",
        "additionalProperties": {}
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
        "maximum": 14400000
      },
      "confirm": {
        "type": "boolean",
        "default": false,
        "description": "Must be true for file writes, destructive actions, code execution, and package changes"
      }
    },
    "required": [
      "project_id",
      "operation"
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
    "status": "r.get.job",
    "cancel": "r.cancel.job",
    "manifest": "r.get.job.manifest",
    "log": "r.get.job.log"
  }
}
```

## r.nhanes.meta.analysis

Run an asynchronous NHANES meta_analysis analysis using installed R/Bioconductor packages. Validates inputs, records runtime/package versions, and returns a job id; requires confirm=true.

- 工具族：r_nhanes_analysis；副作用：execute；query：false；执行：async_or_cached。
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
      "inputs": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": {}
        },
        "minItems": 1,
        "maxItems": 20
      },
      "accession": {
        "type": "string",
        "pattern": "^(GSE|GSM|GPL)[1-9][0-9]*$",
        "description": "Public GEO accession, for example GSE1000"
      },
      "path": {
        "type": "string",
        "maxLength": 1024,
        "default": "",
        "description": "Path relative to the project root; absolute paths and symbolic links are rejected"
      },
      "datasets": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": {}
        },
        "maxItems": 20
      },
      "operation": {
        "type": "string",
        "const": "meta_analysis"
      },
      "method": {
        "anyOf": [
          {
            "type": "object",
            "additionalProperties": {}
          },
          {
            "type": "string"
          }
        ]
      },
      "design": {
        "type": "object",
        "additionalProperties": {}
      },
      "sample_groups": {
        "type": "object",
        "additionalProperties": {
          "type": "string"
        }
      },
      "feature_id": {
        "type": "string",
        "maxLength": 128
      },
      "genes": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "maxItems": 100000
      },
      "ontology": {
        "type": "string",
        "enum": [
          "BP",
          "MF",
          "CC"
        ]
      },
      "key_type": {
        "type": "string",
        "maxLength": 40
      },
      "variables": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "maxItems": 500
      },
      "group_by": {
        "type": "string",
        "maxLength": 128
      },
      "formula": {
        "type": "string",
        "maxLength": 1000
      },
      "time": {
        "type": "string",
        "maxLength": 128
      },
      "event": {
        "type": "string",
        "maxLength": 128
      },
      "effect_sizes": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "maxItems": 1000
      },
      "variances": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "maxItems": 1000
      },
      "outputs": {
        "type": "object",
        "additionalProperties": {}
      },
      "normalization": {
        "type": "string",
        "maxLength": 40
      },
      "harmony": {
        "type": "boolean"
      },
      "batch_field": {
        "type": "string",
        "maxLength": 128
      },
      "checkpoint": {
        "type": "boolean",
        "default": true
      },
      "apply_filters": {
        "type": "boolean"
      },
      "min_features": {
        "type": "integer",
        "minimum": 0
      },
      "max_features": {
        "type": "integer",
        "minimum": 1
      },
      "min_counts": {
        "type": "integer",
        "minimum": 0
      },
      "max_counts": {
        "type": "integer",
        "minimum": 1
      },
      "max_percent_mt": {
        "type": "number",
        "minimum": 0,
        "maximum": 100
      },
      "nfeatures": {
        "type": "integer",
        "minimum": 100,
        "maximum": 10000
      },
      "npcs": {
        "type": "integer",
        "minimum": 2,
        "maximum": 100
      },
      "dims": {
        "type": "integer",
        "minimum": 2,
        "maximum": 100
      },
      "resolution": {
        "type": "number",
        "minimum": 0.01,
        "maximum": 10
      },
      "markers": {
        "type": "boolean"
      },
      "min_pct": {
        "type": "number",
        "minimum": 0,
        "maximum": 1
      },
      "logfc_threshold": {
        "type": "number",
        "minimum": 0
      },
      "doublet_detection": {
        "type": "boolean"
      },
      "reference": {
        "type": "string",
        "maxLength": 80
      },
      "treatment": {
        "type": "string",
        "maxLength": 128
      },
      "matching_method": {
        "type": "string",
        "maxLength": 40
      },
      "distance": {
        "type": "string",
        "maxLength": 40
      },
      "ratio": {
        "type": "integer",
        "minimum": 1,
        "maximum": 20
      },
      "caliper": {
        "type": "number",
        "exclusiveMinimum": 0
      },
      "m": {
        "type": "integer",
        "minimum": 2,
        "maximum": 100
      },
      "maxit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 100
      },
      "REML": {
        "type": "boolean"
      },
      "metadata": {
        "type": "object",
        "additionalProperties": {}
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
        "maximum": 14400000
      },
      "confirm": {
        "type": "boolean",
        "default": false,
        "description": "Must be true for file writes, destructive actions, code execution, and package changes"
      }
    },
    "required": [
      "project_id",
      "operation"
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
    "status": "r.get.job",
    "cancel": "r.cancel.job",
    "manifest": "r.get.job.manifest",
    "log": "r.get.job.log"
  }
}
```

## r.nhanes.generate.km.plot

Run an asynchronous NHANES generate_km_plot analysis using installed R/Bioconductor packages. Validates inputs, records runtime/package versions, and returns a job id; requires confirm=true.

- 工具族：r_nhanes_analysis；副作用：execute；query：false；执行：async_or_cached。
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
      "inputs": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": {}
        },
        "minItems": 1,
        "maxItems": 20
      },
      "accession": {
        "type": "string",
        "pattern": "^(GSE|GSM|GPL)[1-9][0-9]*$",
        "description": "Public GEO accession, for example GSE1000"
      },
      "path": {
        "type": "string",
        "maxLength": 1024,
        "default": "",
        "description": "Path relative to the project root; absolute paths and symbolic links are rejected"
      },
      "datasets": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": {}
        },
        "maxItems": 20
      },
      "operation": {
        "type": "string",
        "const": "generate_km_plot"
      },
      "method": {
        "anyOf": [
          {
            "type": "object",
            "additionalProperties": {}
          },
          {
            "type": "string"
          }
        ]
      },
      "design": {
        "type": "object",
        "additionalProperties": {}
      },
      "sample_groups": {
        "type": "object",
        "additionalProperties": {
          "type": "string"
        }
      },
      "feature_id": {
        "type": "string",
        "maxLength": 128
      },
      "genes": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "maxItems": 100000
      },
      "ontology": {
        "type": "string",
        "enum": [
          "BP",
          "MF",
          "CC"
        ]
      },
      "key_type": {
        "type": "string",
        "maxLength": 40
      },
      "variables": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "maxItems": 500
      },
      "group_by": {
        "type": "string",
        "maxLength": 128
      },
      "formula": {
        "type": "string",
        "maxLength": 1000
      },
      "time": {
        "type": "string",
        "maxLength": 128
      },
      "event": {
        "type": "string",
        "maxLength": 128
      },
      "effect_sizes": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "maxItems": 1000
      },
      "variances": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "maxItems": 1000
      },
      "outputs": {
        "type": "object",
        "additionalProperties": {}
      },
      "normalization": {
        "type": "string",
        "maxLength": 40
      },
      "harmony": {
        "type": "boolean"
      },
      "batch_field": {
        "type": "string",
        "maxLength": 128
      },
      "checkpoint": {
        "type": "boolean",
        "default": true
      },
      "apply_filters": {
        "type": "boolean"
      },
      "min_features": {
        "type": "integer",
        "minimum": 0
      },
      "max_features": {
        "type": "integer",
        "minimum": 1
      },
      "min_counts": {
        "type": "integer",
        "minimum": 0
      },
      "max_counts": {
        "type": "integer",
        "minimum": 1
      },
      "max_percent_mt": {
        "type": "number",
        "minimum": 0,
        "maximum": 100
      },
      "nfeatures": {
        "type": "integer",
        "minimum": 100,
        "maximum": 10000
      },
      "npcs": {
        "type": "integer",
        "minimum": 2,
        "maximum": 100
      },
      "dims": {
        "type": "integer",
        "minimum": 2,
        "maximum": 100
      },
      "resolution": {
        "type": "number",
        "minimum": 0.01,
        "maximum": 10
      },
      "markers": {
        "type": "boolean"
      },
      "min_pct": {
        "type": "number",
        "minimum": 0,
        "maximum": 1
      },
      "logfc_threshold": {
        "type": "number",
        "minimum": 0
      },
      "doublet_detection": {
        "type": "boolean"
      },
      "reference": {
        "type": "string",
        "maxLength": 80
      },
      "treatment": {
        "type": "string",
        "maxLength": 128
      },
      "matching_method": {
        "type": "string",
        "maxLength": 40
      },
      "distance": {
        "type": "string",
        "maxLength": 40
      },
      "ratio": {
        "type": "integer",
        "minimum": 1,
        "maximum": 20
      },
      "caliper": {
        "type": "number",
        "exclusiveMinimum": 0
      },
      "m": {
        "type": "integer",
        "minimum": 2,
        "maximum": 100
      },
      "maxit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 100
      },
      "REML": {
        "type": "boolean"
      },
      "metadata": {
        "type": "object",
        "additionalProperties": {}
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
        "maximum": 14400000
      },
      "confirm": {
        "type": "boolean",
        "default": false,
        "description": "Must be true for file writes, destructive actions, code execution, and package changes"
      }
    },
    "required": [
      "project_id",
      "operation"
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
    "status": "r.get.job",
    "cancel": "r.cancel.job",
    "manifest": "r.get.job.manifest",
    "log": "r.get.job.log"
  }
}
```

## r.nhanes.generate.roc.plot

Run an asynchronous NHANES generate_roc_plot analysis using installed R/Bioconductor packages. Validates inputs, records runtime/package versions, and returns a job id; requires confirm=true.

- 工具族：r_nhanes_analysis；副作用：execute；query：false；执行：async_or_cached。
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
      "inputs": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": {}
        },
        "minItems": 1,
        "maxItems": 20
      },
      "accession": {
        "type": "string",
        "pattern": "^(GSE|GSM|GPL)[1-9][0-9]*$",
        "description": "Public GEO accession, for example GSE1000"
      },
      "path": {
        "type": "string",
        "maxLength": 1024,
        "default": "",
        "description": "Path relative to the project root; absolute paths and symbolic links are rejected"
      },
      "datasets": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": {}
        },
        "maxItems": 20
      },
      "operation": {
        "type": "string",
        "const": "generate_roc_plot"
      },
      "method": {
        "anyOf": [
          {
            "type": "object",
            "additionalProperties": {}
          },
          {
            "type": "string"
          }
        ]
      },
      "design": {
        "type": "object",
        "additionalProperties": {}
      },
      "sample_groups": {
        "type": "object",
        "additionalProperties": {
          "type": "string"
        }
      },
      "feature_id": {
        "type": "string",
        "maxLength": 128
      },
      "genes": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "maxItems": 100000
      },
      "ontology": {
        "type": "string",
        "enum": [
          "BP",
          "MF",
          "CC"
        ]
      },
      "key_type": {
        "type": "string",
        "maxLength": 40
      },
      "variables": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "maxItems": 500
      },
      "group_by": {
        "type": "string",
        "maxLength": 128
      },
      "formula": {
        "type": "string",
        "maxLength": 1000
      },
      "time": {
        "type": "string",
        "maxLength": 128
      },
      "event": {
        "type": "string",
        "maxLength": 128
      },
      "effect_sizes": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "maxItems": 1000
      },
      "variances": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "maxItems": 1000
      },
      "outputs": {
        "type": "object",
        "additionalProperties": {}
      },
      "normalization": {
        "type": "string",
        "maxLength": 40
      },
      "harmony": {
        "type": "boolean"
      },
      "batch_field": {
        "type": "string",
        "maxLength": 128
      },
      "checkpoint": {
        "type": "boolean",
        "default": true
      },
      "apply_filters": {
        "type": "boolean"
      },
      "min_features": {
        "type": "integer",
        "minimum": 0
      },
      "max_features": {
        "type": "integer",
        "minimum": 1
      },
      "min_counts": {
        "type": "integer",
        "minimum": 0
      },
      "max_counts": {
        "type": "integer",
        "minimum": 1
      },
      "max_percent_mt": {
        "type": "number",
        "minimum": 0,
        "maximum": 100
      },
      "nfeatures": {
        "type": "integer",
        "minimum": 100,
        "maximum": 10000
      },
      "npcs": {
        "type": "integer",
        "minimum": 2,
        "maximum": 100
      },
      "dims": {
        "type": "integer",
        "minimum": 2,
        "maximum": 100
      },
      "resolution": {
        "type": "number",
        "minimum": 0.01,
        "maximum": 10
      },
      "markers": {
        "type": "boolean"
      },
      "min_pct": {
        "type": "number",
        "minimum": 0,
        "maximum": 1
      },
      "logfc_threshold": {
        "type": "number",
        "minimum": 0
      },
      "doublet_detection": {
        "type": "boolean"
      },
      "reference": {
        "type": "string",
        "maxLength": 80
      },
      "treatment": {
        "type": "string",
        "maxLength": 128
      },
      "matching_method": {
        "type": "string",
        "maxLength": 40
      },
      "distance": {
        "type": "string",
        "maxLength": 40
      },
      "ratio": {
        "type": "integer",
        "minimum": 1,
        "maximum": 20
      },
      "caliper": {
        "type": "number",
        "exclusiveMinimum": 0
      },
      "m": {
        "type": "integer",
        "minimum": 2,
        "maximum": 100
      },
      "maxit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 100
      },
      "REML": {
        "type": "boolean"
      },
      "metadata": {
        "type": "object",
        "additionalProperties": {}
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
        "maximum": 14400000
      },
      "confirm": {
        "type": "boolean",
        "default": false,
        "description": "Must be true for file writes, destructive actions, code execution, and package changes"
      }
    },
    "required": [
      "project_id",
      "operation"
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
    "status": "r.get.job",
    "cancel": "r.cancel.job",
    "manifest": "r.get.job.manifest",
    "log": "r.get.job.log"
  }
}
```

## r.nhanes.generate.forest.plot

Run an asynchronous NHANES generate_forest_plot analysis using installed R/Bioconductor packages. Validates inputs, records runtime/package versions, and returns a job id; requires confirm=true.

- 工具族：r_nhanes_analysis；副作用：execute；query：false；执行：async_or_cached。
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
      "inputs": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": {}
        },
        "minItems": 1,
        "maxItems": 20
      },
      "accession": {
        "type": "string",
        "pattern": "^(GSE|GSM|GPL)[1-9][0-9]*$",
        "description": "Public GEO accession, for example GSE1000"
      },
      "path": {
        "type": "string",
        "maxLength": 1024,
        "default": "",
        "description": "Path relative to the project root; absolute paths and symbolic links are rejected"
      },
      "datasets": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": {}
        },
        "maxItems": 20
      },
      "operation": {
        "type": "string",
        "const": "generate_forest_plot"
      },
      "method": {
        "anyOf": [
          {
            "type": "object",
            "additionalProperties": {}
          },
          {
            "type": "string"
          }
        ]
      },
      "design": {
        "type": "object",
        "additionalProperties": {}
      },
      "sample_groups": {
        "type": "object",
        "additionalProperties": {
          "type": "string"
        }
      },
      "feature_id": {
        "type": "string",
        "maxLength": 128
      },
      "genes": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "maxItems": 100000
      },
      "ontology": {
        "type": "string",
        "enum": [
          "BP",
          "MF",
          "CC"
        ]
      },
      "key_type": {
        "type": "string",
        "maxLength": 40
      },
      "variables": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "maxItems": 500
      },
      "group_by": {
        "type": "string",
        "maxLength": 128
      },
      "formula": {
        "type": "string",
        "maxLength": 1000
      },
      "time": {
        "type": "string",
        "maxLength": 128
      },
      "event": {
        "type": "string",
        "maxLength": 128
      },
      "effect_sizes": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "maxItems": 1000
      },
      "variances": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "maxItems": 1000
      },
      "outputs": {
        "type": "object",
        "additionalProperties": {}
      },
      "normalization": {
        "type": "string",
        "maxLength": 40
      },
      "harmony": {
        "type": "boolean"
      },
      "batch_field": {
        "type": "string",
        "maxLength": 128
      },
      "checkpoint": {
        "type": "boolean",
        "default": true
      },
      "apply_filters": {
        "type": "boolean"
      },
      "min_features": {
        "type": "integer",
        "minimum": 0
      },
      "max_features": {
        "type": "integer",
        "minimum": 1
      },
      "min_counts": {
        "type": "integer",
        "minimum": 0
      },
      "max_counts": {
        "type": "integer",
        "minimum": 1
      },
      "max_percent_mt": {
        "type": "number",
        "minimum": 0,
        "maximum": 100
      },
      "nfeatures": {
        "type": "integer",
        "minimum": 100,
        "maximum": 10000
      },
      "npcs": {
        "type": "integer",
        "minimum": 2,
        "maximum": 100
      },
      "dims": {
        "type": "integer",
        "minimum": 2,
        "maximum": 100
      },
      "resolution": {
        "type": "number",
        "minimum": 0.01,
        "maximum": 10
      },
      "markers": {
        "type": "boolean"
      },
      "min_pct": {
        "type": "number",
        "minimum": 0,
        "maximum": 1
      },
      "logfc_threshold": {
        "type": "number",
        "minimum": 0
      },
      "doublet_detection": {
        "type": "boolean"
      },
      "reference": {
        "type": "string",
        "maxLength": 80
      },
      "treatment": {
        "type": "string",
        "maxLength": 128
      },
      "matching_method": {
        "type": "string",
        "maxLength": 40
      },
      "distance": {
        "type": "string",
        "maxLength": 40
      },
      "ratio": {
        "type": "integer",
        "minimum": 1,
        "maximum": 20
      },
      "caliper": {
        "type": "number",
        "exclusiveMinimum": 0
      },
      "m": {
        "type": "integer",
        "minimum": 2,
        "maximum": 100
      },
      "maxit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 100
      },
      "REML": {
        "type": "boolean"
      },
      "metadata": {
        "type": "object",
        "additionalProperties": {}
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
        "maximum": 14400000
      },
      "confirm": {
        "type": "boolean",
        "default": false,
        "description": "Must be true for file writes, destructive actions, code execution, and package changes"
      }
    },
    "required": [
      "project_id",
      "operation"
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
    "status": "r.get.job",
    "cancel": "r.cancel.job",
    "manifest": "r.get.job.manifest",
    "log": "r.get.job.log"
  }
}
```

## r.nhanes.create.report

Run an asynchronous NHANES create_report analysis using installed R/Bioconductor packages. Validates inputs, records runtime/package versions, and returns a job id; requires confirm=true.

- 工具族：r_nhanes_analysis；副作用：execute；query：false；执行：async_or_cached。
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
      "inputs": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": {}
        },
        "minItems": 1,
        "maxItems": 20
      },
      "accession": {
        "type": "string",
        "pattern": "^(GSE|GSM|GPL)[1-9][0-9]*$",
        "description": "Public GEO accession, for example GSE1000"
      },
      "path": {
        "type": "string",
        "maxLength": 1024,
        "default": "",
        "description": "Path relative to the project root; absolute paths and symbolic links are rejected"
      },
      "datasets": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": {}
        },
        "maxItems": 20
      },
      "operation": {
        "type": "string",
        "const": "create_report"
      },
      "method": {
        "anyOf": [
          {
            "type": "object",
            "additionalProperties": {}
          },
          {
            "type": "string"
          }
        ]
      },
      "design": {
        "type": "object",
        "additionalProperties": {}
      },
      "sample_groups": {
        "type": "object",
        "additionalProperties": {
          "type": "string"
        }
      },
      "feature_id": {
        "type": "string",
        "maxLength": 128
      },
      "genes": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "maxItems": 100000
      },
      "ontology": {
        "type": "string",
        "enum": [
          "BP",
          "MF",
          "CC"
        ]
      },
      "key_type": {
        "type": "string",
        "maxLength": 40
      },
      "variables": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "maxItems": 500
      },
      "group_by": {
        "type": "string",
        "maxLength": 128
      },
      "formula": {
        "type": "string",
        "maxLength": 1000
      },
      "time": {
        "type": "string",
        "maxLength": 128
      },
      "event": {
        "type": "string",
        "maxLength": 128
      },
      "effect_sizes": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "maxItems": 1000
      },
      "variances": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "maxItems": 1000
      },
      "outputs": {
        "type": "object",
        "additionalProperties": {}
      },
      "normalization": {
        "type": "string",
        "maxLength": 40
      },
      "harmony": {
        "type": "boolean"
      },
      "batch_field": {
        "type": "string",
        "maxLength": 128
      },
      "checkpoint": {
        "type": "boolean",
        "default": true
      },
      "apply_filters": {
        "type": "boolean"
      },
      "min_features": {
        "type": "integer",
        "minimum": 0
      },
      "max_features": {
        "type": "integer",
        "minimum": 1
      },
      "min_counts": {
        "type": "integer",
        "minimum": 0
      },
      "max_counts": {
        "type": "integer",
        "minimum": 1
      },
      "max_percent_mt": {
        "type": "number",
        "minimum": 0,
        "maximum": 100
      },
      "nfeatures": {
        "type": "integer",
        "minimum": 100,
        "maximum": 10000
      },
      "npcs": {
        "type": "integer",
        "minimum": 2,
        "maximum": 100
      },
      "dims": {
        "type": "integer",
        "minimum": 2,
        "maximum": 100
      },
      "resolution": {
        "type": "number",
        "minimum": 0.01,
        "maximum": 10
      },
      "markers": {
        "type": "boolean"
      },
      "min_pct": {
        "type": "number",
        "minimum": 0,
        "maximum": 1
      },
      "logfc_threshold": {
        "type": "number",
        "minimum": 0
      },
      "doublet_detection": {
        "type": "boolean"
      },
      "reference": {
        "type": "string",
        "maxLength": 80
      },
      "treatment": {
        "type": "string",
        "maxLength": 128
      },
      "matching_method": {
        "type": "string",
        "maxLength": 40
      },
      "distance": {
        "type": "string",
        "maxLength": 40
      },
      "ratio": {
        "type": "integer",
        "minimum": 1,
        "maximum": 20
      },
      "caliper": {
        "type": "number",
        "exclusiveMinimum": 0
      },
      "m": {
        "type": "integer",
        "minimum": 2,
        "maximum": 100
      },
      "maxit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 100
      },
      "REML": {
        "type": "boolean"
      },
      "metadata": {
        "type": "object",
        "additionalProperties": {}
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
        "maximum": 14400000
      },
      "confirm": {
        "type": "boolean",
        "default": false,
        "description": "Must be true for file writes, destructive actions, code execution, and package changes"
      }
    },
    "required": [
      "project_id",
      "operation"
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
    "status": "r.get.job",
    "cancel": "r.cancel.job",
    "manifest": "r.get.job.manifest",
    "log": "r.get.job.log"
  }
}
```
