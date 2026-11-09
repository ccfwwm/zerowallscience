# 生成操作目录

此文件来自实际服务端注册。离线注册不等于运行时可用；精确执行前使用 describe。

## r.geo.catalog

List locally available public GEO accessions, download status, file counts, and total bytes.

- 工具族：r_geo_catalog；副作用：read；query：true；执行：sync。
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

## r.geo.resolve

Resolve a public GEO GSE, GSM, or GPL accession to bounded CNCB/NCBI file metadata without downloading.

- 工具族：r_geo_catalog；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "accession": {
        "type": "string",
        "pattern": "^(GSE|GSM|GPL)[1-9][0-9]*$",
        "description": "Public GEO accession, for example GSE1000"
      }
    },
    "required": [
      "accession"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## r.geo.list.files

List files already indexed for a GEO accession, including source, size, checksum, and completion state.

- 工具族：r_geo_catalog；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "accession": {
        "type": "string",
        "pattern": "^(GSE|GSM|GPL)[1-9][0-9]*$",
        "description": "Public GEO accession, for example GSE1000"
      }
    },
    "required": [
      "accession"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## r.geo.get.status

Return the GEO accession download status, queued requests, and manifest.

- 工具族：r_geo_catalog；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "accession": {
        "type": "string",
        "pattern": "^(GSE|GSM|GPL)[1-9][0-9]*$",
        "description": "Public GEO accession, for example GSE1000"
      }
    },
    "required": [
      "accession"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## r.geo.download

Queue an asynchronous public GEO download or dry-run plan. The paper profile includes matrix, soft, miniml, and supplementary files while excluding RAW archives. Supports section, exact-file, and exclusion filters; RAW requires confirm_large=true. Returns a job id and requires download permission.

- 工具族：r_geo_catalog；副作用：execute；query：false；执行：async_or_cached。
- 确认字段：confirm_large。
- 输出：Submission with remote identifier; status and manifest are separate operations.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "accession": {
        "type": "string",
        "pattern": "^(GSE|GSM|GPL)[1-9][0-9]*$",
        "description": "Public GEO accession, for example GSE1000"
      },
      "project_id": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128,
        "pattern": "^[A-Za-z0-9._-]+$",
        "description": "ZeroWall project id"
      },
      "include_suppl": {
        "type": "boolean",
        "default": true
      },
      "profile": {
        "type": "string",
        "enum": [
          "core",
          "expression",
          "metadata",
          "paper",
          "all"
        ],
        "default": "paper"
      },
      "include_sections": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": [
            "matrix",
            "soft",
            "miniml",
            "suppl",
            "annot"
          ]
        },
        "maxItems": 10
      },
      "include_files": {
        "type": "array",
        "items": {
          "type": "string",
          "minLength": 1,
          "maxLength": 512
        },
        "maxItems": 500
      },
      "exclude_patterns": {
        "type": "array",
        "items": {
          "type": "string",
          "minLength": 1,
          "maxLength": 512
        },
        "maxItems": 50
      },
      "confirm_large": {
        "type": "boolean",
        "default": false
      },
      "dry_run": {
        "type": "boolean",
        "default": false
      }
    },
    "required": [
      "accession",
      "project_id"
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
    "status": "r.geo.wait.download",
    "cancel": "r.geo.cancel.download",
    "log": "r.geo.get.download.log"
  }
}
```

## r.geo.wait.download

Poll a GEO download request and return its latest state.

- 工具族：r_geo_catalog；副作用：read；query：true；执行：sync。
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

## r.geo.cancel.download

Cancel a queued or running GEO download request. Requires confirm=true.

- 工具族：r_geo_catalog；副作用：write；query：false；执行：sync。
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

## r.geo.get.download.log

Read the bounded log for a GEO download request.

- 工具族：r_geo_catalog；副作用：read；query：true；执行：sync。
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

## r.geo.preview

Preview bounded rows from a downloaded GEO matrix, CSV, TSV, or text table.

- 工具族：r_geo_catalog；副作用：read；query：true；执行：sync。
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
          "accession": {
            "type": "string",
            "pattern": "^(GSE|GSM|GPL)[1-9][0-9]*$",
            "description": "Public GEO accession, for example GSE1000"
          },
          "path": {
            "type": "string",
            "minLength": 1,
            "maxLength": 1024
          },
          "columns": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "maxItems": 500
          }
        },
        "required": [
          "accession",
          "path"
        ],
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

## r.geo.query

Run a bounded GEO query with selected columns and safe filters; optionally materialize a project result.

- 工具族：r_geo_analysis；副作用：write；query：false；执行：sync。
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
          "accession": {
            "type": "string",
            "pattern": "^(GSE|GSM|GPL)[1-9][0-9]*$",
            "description": "Public GEO accession, for example GSE1000"
          },
          "path": {
            "type": "string",
            "minLength": 1,
            "maxLength": 1024
          },
          "columns": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "maxItems": 500
          }
        },
        "required": [
          "accession",
          "path"
        ],
        "additionalProperties": false
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
      "dataset"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## r.geo.aggregate

Compute reproducible GEO grouped statistics. Supports count, sum, mean, median, min, max, and sd; returns bounded JSON and optional project output.

- 工具族：r_geo_analysis；副作用：write；query：false；执行：sync。
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
          "accession": {
            "type": "string",
            "pattern": "^(GSE|GSM|GPL)[1-9][0-9]*$",
            "description": "Public GEO accession, for example GSE1000"
          },
          "path": {
            "type": "string",
            "minLength": 1,
            "maxLength": 1024
          },
          "columns": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "maxItems": 500
          }
        },
        "required": [
          "accession",
          "path"
        ],
        "additionalProperties": false
      },
      "group_by": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "maxItems": 30,
        "default": []
      },
      "aggregations": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "column": {
              "type": "string",
              "default": ""
            },
            "function": {
              "type": "string",
              "enum": [
                "count",
                "sum",
                "mean",
                "median",
                "min",
                "max",
                "sd"
              ],
              "default": "mean"
            },
            "alias": {
              "type": "string"
            }
          },
          "additionalProperties": false
        },
        "minItems": 1,
        "maxItems": 50
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
      "dataset",
      "aggregations"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## r.geo.correlation

Compute a Pearson, Spearman, or Kendall correlation matrix for numeric GEO columns with pairwise missing-value handling.

- 工具族：r_geo_analysis；副作用：write；query：false；执行：sync。
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
          "accession": {
            "type": "string",
            "pattern": "^(GSE|GSM|GPL)[1-9][0-9]*$",
            "description": "Public GEO accession, for example GSE1000"
          },
          "path": {
            "type": "string",
            "minLength": 1,
            "maxLength": 1024
          },
          "columns": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "maxItems": 500
          }
        },
        "required": [
          "accession",
          "path"
        ],
        "additionalProperties": false
      },
      "columns": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "minItems": 2,
        "maxItems": 100
      },
      "method": {
        "type": "string",
        "enum": [
          "pearson",
          "spearman",
          "kendall"
        ],
        "default": "pearson"
      },
      "use": {
        "type": "string",
        "enum": [
          "everything",
          "all.obs",
          "complete.obs",
          "na.or.complete",
          "pairwise.complete.obs"
        ],
        "default": "pairwise.complete.obs"
      }
    },
    "required": [
      "project_id",
      "dataset",
      "columns"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## r.geo.describe.dataset

Describe a downloaded GEO file with format, size, columns, inferred types, sample rows, and manifest metadata.

- 工具族：r_geo_catalog；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "dataset": {
        "type": "object",
        "properties": {
          "accession": {
            "type": "string",
            "pattern": "^(GSE|GSM|GPL)[1-9][0-9]*$",
            "description": "Public GEO accession, for example GSE1000"
          },
          "path": {
            "type": "string",
            "minLength": 1,
            "maxLength": 1024
          },
          "columns": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "maxItems": 500
          }
        },
        "required": [
          "accession",
          "path"
        ],
        "additionalProperties": false
      },
      "sample_rows": {
        "type": "integer",
        "minimum": 1,
        "maximum": 1000,
        "default": 100
      }
    },
    "required": [
      "dataset"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## r.geo.get.codebook

List GEO SOFT, MINiML, platform, annotation, label, and README files associated with an accession.

- 工具族：r_geo_catalog；副作用：read；query：true；执行：sync。
- 确认字段：无。
- 输出：Immediate structured result; no background task is implied.

```json
{
  "input_schema": {
    "type": "object",
    "properties": {
      "accession": {
        "type": "string",
        "pattern": "^(GSE|GSM|GPL)[1-9][0-9]*$",
        "description": "Public GEO accession, for example GSE1000"
      }
    },
    "required": [
      "accession"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## r.geo.stat.test

Run a reproducible GEO group comparison: t_test, wilcox, anova, or kruskal. Returns statistic, p-value, estimates, and group counts.

- 工具族：r_geo_analysis；副作用：write；query：false；执行：sync。
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
          "accession": {
            "type": "string",
            "pattern": "^(GSE|GSM|GPL)[1-9][0-9]*$",
            "description": "Public GEO accession, for example GSE1000"
          },
          "path": {
            "type": "string",
            "minLength": 1,
            "maxLength": 1024
          },
          "columns": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "maxItems": 500
          }
        },
        "required": [
          "accession",
          "path"
        ],
        "additionalProperties": false
      },
      "variable": {
        "type": "string",
        "minLength": 1
      },
      "group_by": {
        "type": "string",
        "minLength": 1
      },
      "method": {
        "type": "string",
        "enum": [
          "t_test",
          "wilcox",
          "anova",
          "kruskal"
        ],
        "default": "t_test"
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
      }
    },
    "required": [
      "project_id",
      "dataset",
      "variable",
      "group_by"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## r.geo.regression

Run a reproducible GEO linear or logistic regression and return coefficients, AIC, sample size, and formula.

- 工具族：r_geo_analysis；副作用：write；query：false；执行：sync。
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
          "accession": {
            "type": "string",
            "pattern": "^(GSE|GSM|GPL)[1-9][0-9]*$",
            "description": "Public GEO accession, for example GSE1000"
          },
          "path": {
            "type": "string",
            "minLength": 1,
            "maxLength": 1024
          },
          "columns": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "maxItems": 500
          }
        },
        "required": [
          "accession",
          "path"
        ],
        "additionalProperties": false
      },
      "outcome": {
        "type": "string",
        "minLength": 1
      },
      "predictors": {
        "type": "array",
        "items": {
          "type": "string",
          "minLength": 1
        },
        "minItems": 1,
        "maxItems": 50
      },
      "family": {
        "type": "string",
        "enum": [
          "gaussian",
          "binomial"
        ],
        "default": "gaussian"
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
      }
    },
    "required": [
      "project_id",
      "dataset",
      "outcome",
      "predictors"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## r.geo.differential.expression

Run a bounded two-group GEO expression comparison on a matrix. Returns feature IDs, logFC, raw p-values, BH-adjusted p-values, detection counts, and optional CSV Manifest.

- 工具族：r_geo_analysis；副作用：write；query：false；执行：sync。
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
          "accession": {
            "type": "string",
            "pattern": "^(GSE|GSM|GPL)[1-9][0-9]*$",
            "description": "Public GEO accession, for example GSE1000"
          },
          "path": {
            "type": "string",
            "minLength": 1,
            "maxLength": 1024
          },
          "columns": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "maxItems": 500
          }
        },
        "required": [
          "accession",
          "path"
        ],
        "additionalProperties": false
      },
      "sample_groups": {
        "type": "object",
        "additionalProperties": {
          "type": "string",
          "minLength": 1
        }
      },
      "feature_id": {
        "type": "string"
      },
      "method": {
        "type": "string",
        "enum": [
          "t_test",
          "wilcox"
        ],
        "default": "t_test"
      },
      "min_detected": {
        "type": "integer",
        "minimum": 1,
        "maximum": 1000,
        "default": 3
      },
      "top_n": {
        "type": "integer",
        "minimum": 1,
        "maximum": 100000,
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
      },
      "confirm": {
        "type": "boolean",
        "default": false,
        "description": "Must be true for file writes, destructive actions, code execution, and package changes"
      }
    },
    "required": [
      "project_id",
      "dataset",
      "sample_groups"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## r.geo.plot

Generate a GEO PNG and return it as a native MCP image when it fits the inline limit. Supports histogram, density, boxplot, bar, scatter, and correlation heatmap.

- 工具族：r_geo_analysis；副作用：write；query：false；执行：sync。
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
          "accession": {
            "type": "string",
            "pattern": "^(GSE|GSM|GPL)[1-9][0-9]*$",
            "description": "Public GEO accession, for example GSE1000"
          },
          "path": {
            "type": "string",
            "minLength": 1,
            "maxLength": 1024
          },
          "columns": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "maxItems": 500
          }
        },
        "required": [
          "accession",
          "path"
        ],
        "additionalProperties": false
      },
      "chart": {
        "type": "string",
        "enum": [
          "histogram",
          "density",
          "boxplot",
          "bar",
          "scatter",
          "heatmap"
        ],
        "default": "histogram"
      },
      "variable": {
        "type": "string"
      },
      "x": {
        "type": "string"
      },
      "y": {
        "type": "string"
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
      "dataset"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## r.geo.join

Join two GEO tabular files using a shared column and return bounded rows.

- 工具族：r_geo_analysis；副作用：write；query：false；执行：sync。
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
            "accession": {
              "type": "string",
              "pattern": "^(GSE|GSM|GPL)[1-9][0-9]*$",
              "description": "Public GEO accession, for example GSE1000"
            },
            "path": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            },
            "columns": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "maxItems": 500
            }
          },
          "required": [
            "accession",
            "path"
          ],
          "additionalProperties": false
        },
        "minItems": 2,
        "maxItems": 10
      },
      "key": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128,
        "default": "ID_REF"
      },
      "all": {
        "type": "boolean",
        "default": false
      },
      "limit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 200000,
        "default": 1000
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

## r.geo.export

Export a bounded GEO query to CSV, TSV, RDS, or Parquet in the project workspace.

- 工具族：r_geo_artifacts；副作用：write；query：false；执行：sync。
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
          "accession": {
            "type": "string",
            "pattern": "^(GSE|GSM|GPL)[1-9][0-9]*$",
            "description": "Public GEO accession, for example GSE1000"
          },
          "path": {
            "type": "string",
            "minLength": 1,
            "maxLength": 1024
          },
          "columns": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "maxItems": 500
          }
        },
        "required": [
          "accession",
          "path"
        ],
        "additionalProperties": false
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

## r.geo.create.analysis.plan

Create a versioned GEO analysis plan using the bounded query, aggregate, join, describe, or plot DSL.

- 工具族：r_geo_analysis；副作用：write；query：false；执行：sync。
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

## r.geo.list.analysis.plans

List saved GEO analysis plans for a project.

- 工具族：r_geo_artifacts；副作用：read；query：true；执行：sync。
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

## r.geo.run.analysis.plan

Run a saved GEO analysis plan asynchronously and produce reproducible result artifacts. Requires confirm=true.

- 工具族：r_geo_analysis；副作用：execute；query：false；执行：async_or_cached。
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
    "status": "r.geo.get.analysis.run",
    "cancel": "r.geo.cancel.analysis.run",
    "manifest": "r.geo.get.analysis.manifest"
  }
}
```

## r.geo.get.analysis.run

Get GEO analysis run status, job progress, and errors.

- 工具族：r_geo_artifacts；副作用：read；query：true；执行：sync。
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

## r.geo.cancel.analysis.run

Cancel a queued or running GEO analysis. Requires confirm=true.

- 工具族：r_geo_artifacts；副作用：write；query：false；执行：sync。
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

## r.geo.get.analysis.manifest

List GEO analysis result files, MIME types, sizes, and SHA-256 checksums.

- 工具族：r_geo_artifacts；副作用：read；query：true；执行：sync。
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

## r.geo.get.analysis.result

Read GEO analysis text, R code, images, or binary output using bounded inline content or chunks.

- 工具族：r_geo_artifacts；副作用：read；query：true；执行：sync。
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

## r.geo.prepare.expression

Run an asynchronous GEO prepare_expression analysis using installed R/Bioconductor packages. Validates inputs, records runtime/package versions, and returns a job id; requires confirm=true.

- 工具族：r_geo_analysis；副作用：execute；query：false；执行：async_or_cached。
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
        "const": "prepare_expression"
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

## r.geo.inspect.matrix

Run an asynchronous GEO inspect_matrix analysis using installed R/Bioconductor packages. Validates inputs, records runtime/package versions, and returns a job id; requires confirm=true.

- 工具族：r_geo_analysis；副作用：execute；query：false；执行：async_or_cached。
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
        "const": "inspect_matrix"
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

## r.geo.qc.bulk

Run an asynchronous GEO qc_bulk analysis using installed R/Bioconductor packages. Validates inputs, records runtime/package versions, and returns a job id; requires confirm=true.

- 工具族：r_geo_analysis；副作用：execute；query：false；执行：async_or_cached。
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
        "const": "qc_bulk"
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

## r.geo.normalize.expression

Run an asynchronous GEO normalize_expression analysis using installed R/Bioconductor packages. Validates inputs, records runtime/package versions, and returns a job id; requires confirm=true.

- 工具族：r_geo_analysis；副作用：execute；query：false；执行：async_or_cached。
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
        "const": "normalize_expression"
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

## r.geo.batch.correct

Run an asynchronous GEO batch_correct analysis using installed R/Bioconductor packages. Validates inputs, records runtime/package versions, and returns a job id; requires confirm=true.

- 工具族：r_geo_analysis；副作用：execute；query：false；执行：async_or_cached。
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
        "const": "batch_correct"
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

## r.geo.enrichment

Run an asynchronous GEO enrichment analysis using installed R/Bioconductor packages. Validates inputs, records runtime/package versions, and returns a job id; requires confirm=true.

- 工具族：r_geo_analysis；副作用：execute；query：false；执行：async_or_cached。
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
        "const": "enrichment"
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

## r.geo.gsea

Run an asynchronous GEO gsea analysis using installed R/Bioconductor packages. Validates inputs, records runtime/package versions, and returns a job id; requires confirm=true.

- 工具族：r_geo_analysis；副作用：execute；query：false；执行：async_or_cached。
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
        "const": "gsea"
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

## r.geo.generate.volcano

Run an asynchronous GEO generate_volcano analysis using installed R/Bioconductor packages. Validates inputs, records runtime/package versions, and returns a job id; requires confirm=true.

- 工具族：r_geo_analysis；副作用：execute；query：false；执行：async_or_cached。
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
        "const": "generate_volcano"
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

## r.geo.generate.ma.plot

Run an asynchronous GEO generate_ma_plot analysis using installed R/Bioconductor packages. Validates inputs, records runtime/package versions, and returns a job id; requires confirm=true.

- 工具族：r_geo_analysis；副作用：execute；query：false；执行：async_or_cached。
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
        "const": "generate_ma_plot"
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

## r.geo.generate.heatmap

Run an asynchronous GEO generate_heatmap analysis using installed R/Bioconductor packages. Validates inputs, records runtime/package versions, and returns a job id; requires confirm=true.

- 工具族：r_geo_analysis；副作用：execute；query：false；执行：async_or_cached。
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
        "const": "generate_heatmap"
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

## r.geo.generate.pca

Run an asynchronous GEO generate_pca analysis using installed R/Bioconductor packages. Validates inputs, records runtime/package versions, and returns a job id; requires confirm=true.

- 工具族：r_geo_analysis；副作用：execute；query：false；执行：async_or_cached。
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
        "const": "generate_pca"
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

## r.geo.single.cell.qc

Run the GEO single_cell_qc step as a persistent asynchronous R job. This is the required route for large single-cell workloads: it immediately returns job_id, allows up to four hours, emits QC/normalization/PCA/Harmony/UMAP/clustering progress, and writes restartable RDS checkpoints. Poll with r_get_job or r_wait_job; do not run the same workload through a synchronous local r.source call. Requires confirm=true.

- 工具族：r_geo_analysis；副作用：execute；query：false；执行：async_or_cached。
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
        "const": "single_cell_qc"
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

## r.geo.single.cell.normalize

Run the GEO single_cell_normalize step as a persistent asynchronous R job. This is the required route for large single-cell workloads: it immediately returns job_id, allows up to four hours, emits QC/normalization/PCA/Harmony/UMAP/clustering progress, and writes restartable RDS checkpoints. Poll with r_get_job or r_wait_job; do not run the same workload through a synchronous local r.source call. Requires confirm=true.

- 工具族：r_geo_analysis；副作用：execute；query：false；执行：async_or_cached。
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
        "const": "single_cell_normalize"
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

## r.geo.single.cell.integrate

Run the GEO single_cell_integrate step as a persistent asynchronous R job. This is the required route for large single-cell workloads: it immediately returns job_id, allows up to four hours, emits QC/normalization/PCA/Harmony/UMAP/clustering progress, and writes restartable RDS checkpoints. Poll with r_get_job or r_wait_job; do not run the same workload through a synchronous local r.source call. Requires confirm=true.

- 工具族：r_geo_analysis；副作用：execute；query：false；执行：async_or_cached。
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
        "const": "single_cell_integrate"
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

## r.geo.single.cell.reduce

Run the GEO single_cell_reduce step as a persistent asynchronous R job. This is the required route for large single-cell workloads: it immediately returns job_id, allows up to four hours, emits QC/normalization/PCA/Harmony/UMAP/clustering progress, and writes restartable RDS checkpoints. Poll with r_get_job or r_wait_job; do not run the same workload through a synchronous local r.source call. Requires confirm=true.

- 工具族：r_geo_analysis；副作用：execute；query：false；执行：async_or_cached。
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
        "const": "single_cell_reduce"
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

## r.geo.single.cell.cluster

Run the GEO single_cell_cluster step as a persistent asynchronous R job. This is the required route for large single-cell workloads: it immediately returns job_id, allows up to four hours, emits QC/normalization/PCA/Harmony/UMAP/clustering progress, and writes restartable RDS checkpoints. Poll with r_get_job or r_wait_job; do not run the same workload through a synchronous local r.source call. Requires confirm=true.

- 工具族：r_geo_analysis；副作用：execute；query：false；执行：async_or_cached。
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
        "const": "single_cell_cluster"
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

## r.geo.single.cell.markers

Run the GEO single_cell_markers step as a persistent asynchronous R job. This is the required route for large single-cell workloads: it immediately returns job_id, allows up to four hours, emits QC/normalization/PCA/Harmony/UMAP/clustering progress, and writes restartable RDS checkpoints. Poll with r_get_job or r_wait_job; do not run the same workload through a synchronous local r.source call. Requires confirm=true.

- 工具族：r_geo_analysis；副作用：execute；query：false；执行：async_or_cached。
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
        "const": "single_cell_markers"
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

## r.geo.single.cell.annotate

Run the GEO single_cell_annotate step as a persistent asynchronous R job. This is the required route for large single-cell workloads: it immediately returns job_id, allows up to four hours, emits QC/normalization/PCA/Harmony/UMAP/clustering progress, and writes restartable RDS checkpoints. Poll with r_get_job or r_wait_job; do not run the same workload through a synchronous local r.source call. Requires confirm=true.

- 工具族：r_geo_analysis；副作用：execute；query：false；执行：async_or_cached。
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
        "const": "single_cell_annotate"
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

## r.geo.single.cell.plot

Run the GEO single_cell_plot step as a persistent asynchronous R job. This is the required route for large single-cell workloads: it immediately returns job_id, allows up to four hours, emits QC/normalization/PCA/Harmony/UMAP/clustering progress, and writes restartable RDS checkpoints. Poll with r_get_job or r_wait_job; do not run the same workload through a synchronous local r.source call. Requires confirm=true.

- 工具族：r_geo_analysis；副作用：execute；query：false；执行：async_or_cached。
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
        "const": "single_cell_plot"
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

## r.geo.single.cell.report

Run the GEO single_cell_report step as a persistent asynchronous R job. This is the required route for large single-cell workloads: it immediately returns job_id, allows up to four hours, emits QC/normalization/PCA/Harmony/UMAP/clustering progress, and writes restartable RDS checkpoints. Poll with r_get_job or r_wait_job; do not run the same workload through a synchronous local r.source call. Requires confirm=true.

- 工具族：r_geo_analysis；副作用：execute；query：false；执行：async_or_cached。
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
        "const": "single_cell_report"
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

## r.geo.single.cell.pipeline

Run the GEO single_cell_pipeline step as a persistent asynchronous R job. This is the required route for large single-cell workloads: it immediately returns job_id, allows up to four hours, emits QC/normalization/PCA/Harmony/UMAP/clustering progress, and writes restartable RDS checkpoints. Poll with r_get_job or r_wait_job; do not run the same workload through a synchronous local r.source call. Requires confirm=true.

- 工具族：r_geo_analysis；副作用：execute；query：false；执行：async_or_cached。
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
        "const": "single_cell_pipeline"
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

## r.geo.create.report

Run an asynchronous GEO create_report analysis using installed R/Bioconductor packages. Validates inputs, records runtime/package versions, and returns a job id; requires confirm=true.

- 工具族：r_geo_analysis；副作用：execute；query：false；执行：async_or_cached。
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
