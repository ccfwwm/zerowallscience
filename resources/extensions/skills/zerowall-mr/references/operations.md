# 生成操作目录

此文件来自实际服务端注册。离线注册不等于运行时可用；精确执行前使用 describe。

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

## r.get.job

Get current state, timestamps, exit code, failure reason, and result summary for an R job.

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

## r.wait.job

Wait up to 30 seconds for a queued or running job to change state, then return its latest record. Call again while still queued or running.

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

## r.list.jobs

List up to 100 recent asynchronous R jobs for a project.

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
      "limit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 100,
        "default": 20
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

## r.get.job.log

Read bounded stdout and stderr tails for an R job.

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
      "job_id"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## r.cancel.job

Request cancellation of a queued or running R job. Requires confirm=true.

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

## r.get.job.manifest

List result files produced in R_PLATFORM_RESULT_DIR with MIME type, byte size, and SHA-256.

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

## r.get.job.result

Read a job result by manifest path. Text is returned as text, images as native MCP images, and other binary data as bounded base64 chunks.

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
      "job_id"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "lifecycle": null
}
```

## r.genetics.run

Run versioned prepared MR or complete-region coloc in the existing persistent R queue. Idempotent request_id; deterministic templates only. Results/manifest are retrieved with r.get.job.manifest and r_files. Missing methods or dependencies stop explicitly. Requires confirm=true.

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
        "pattern": "^[A-Za-z0-9._-]{1,128}$"
      },
      "request_id": {
        "type": "string",
        "pattern": "^[A-Za-z0-9._:-]{1,128}$"
      },
      "request": {
        "anyOf": [
          {
            "type": "object",
            "properties": {
              "runner_contract": {
                "type": "string",
                "const": "7.0.0-genetics.1"
              },
              "study_id": {
                "type": "string",
                "minLength": 1,
                "maxLength": 4096
              },
              "task_id": {
                "$ref": "#/properties/request/anyOf/0/properties/study_id"
              },
              "plan_id": {
                "$ref": "#/properties/request/anyOf/0/properties/study_id"
              },
              "freeze_id": {
                "$ref": "#/properties/request/anyOf/0/properties/study_id"
              },
              "exploratory": {
                "type": "boolean"
              },
              "analysis": {
                "type": "string",
                "const": "mr"
              },
              "exposure": {
                "type": "object",
                "properties": {
                  "trait": {
                    "$ref": "#/properties/request/anyOf/0/properties/study_id"
                  },
                  "unit": {
                    "$ref": "#/properties/request/anyOf/0/properties/study_id"
                  },
                  "ancestry": {
                    "$ref": "#/properties/request/anyOf/0/properties/study_id"
                  },
                  "genome_build": {
                    "$ref": "#/properties/request/anyOf/0/properties/study_id"
                  },
                  "source": {
                    "$ref": "#/properties/request/anyOf/0/properties/study_id"
                  },
                  "sample_size": {
                    "type": "number",
                    "exclusiveMinimum": 0
                  }
                },
                "required": [
                  "trait",
                  "unit",
                  "ancestry",
                  "genome_build",
                  "source",
                  "sample_size"
                ],
                "additionalProperties": false
              },
              "outcome": {
                "$ref": "#/properties/request/anyOf/0/properties/exposure"
              },
              "methods": {
                "type": "array",
                "items": {
                  "type": "string",
                  "enum": [
                    "wald",
                    "ivw",
                    "egger"
                  ]
                },
                "minItems": 1,
                "maxItems": 3
              },
              "min_f": {
                "type": "number",
                "minimum": 10
              },
              "egger_min_i2gx": {
                "type": "number",
                "minimum": 0.9,
                "maximum": 1
              },
              "ld_independent": {
                "type": "boolean",
                "const": true
              },
              "ld_source": {
                "$ref": "#/properties/request/anyOf/0/properties/study_id"
              },
              "sample_overlap": {
                "type": "string",
                "const": "none"
              },
              "sample_overlap_source": {
                "$ref": "#/properties/request/anyOf/0/properties/study_id"
              },
              "harmonization_source": {
                "$ref": "#/properties/request/anyOf/0/properties/study_id"
              },
              "instruments": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "snp": {
                      "$ref": "#/properties/request/anyOf/0/properties/study_id"
                    },
                    "beta_exposure": {
                      "type": "number"
                    },
                    "se_exposure": {
                      "$ref": "#/properties/request/anyOf/0/properties/exposure/properties/sample_size"
                    },
                    "beta_outcome": {
                      "$ref": "#/properties/request/anyOf/0/properties/instruments/items/properties/beta_exposure"
                    },
                    "se_outcome": {
                      "$ref": "#/properties/request/anyOf/0/properties/exposure/properties/sample_size"
                    },
                    "exposure_effect_allele": {
                      "type": "string",
                      "enum": [
                        "A",
                        "C",
                        "G",
                        "T"
                      ]
                    },
                    "exposure_other_allele": {
                      "$ref": "#/properties/request/anyOf/0/properties/instruments/items/properties/exposure_effect_allele"
                    },
                    "outcome_effect_allele": {
                      "$ref": "#/properties/request/anyOf/0/properties/instruments/items/properties/exposure_effect_allele"
                    },
                    "outcome_other_allele": {
                      "$ref": "#/properties/request/anyOf/0/properties/instruments/items/properties/exposure_effect_allele"
                    },
                    "harmonization_status": {
                      "type": "string",
                      "enum": [
                        "aligned",
                        "unresolved",
                        "mismatched"
                      ]
                    }
                  },
                  "required": [
                    "snp",
                    "beta_exposure",
                    "se_exposure",
                    "beta_outcome",
                    "se_outcome",
                    "exposure_effect_allele",
                    "exposure_other_allele",
                    "outcome_effect_allele",
                    "outcome_other_allele",
                    "harmonization_status"
                  ],
                  "additionalProperties": false
                },
                "minItems": 1,
                "maxItems": 100000
              }
            },
            "required": [
              "runner_contract",
              "exploratory",
              "analysis",
              "exposure",
              "outcome",
              "methods",
              "min_f",
              "ld_independent",
              "ld_source",
              "sample_overlap",
              "sample_overlap_source",
              "harmonization_source",
              "instruments"
            ],
            "additionalProperties": false
          },
          {
            "type": "object",
            "properties": {
              "runner_contract": {
                "$ref": "#/properties/request/anyOf/0/properties/runner_contract"
              },
              "study_id": {
                "$ref": "#/properties/request/anyOf/0/properties/study_id"
              },
              "task_id": {
                "$ref": "#/properties/request/anyOf/0/properties/task_id"
              },
              "plan_id": {
                "$ref": "#/properties/request/anyOf/0/properties/plan_id"
              },
              "freeze_id": {
                "$ref": "#/properties/request/anyOf/0/properties/freeze_id"
              },
              "exploratory": {
                "$ref": "#/properties/request/anyOf/0/properties/exploratory"
              },
              "analysis": {
                "type": "string",
                "const": "coloc"
              },
              "trait1": {
                "type": "object",
                "properties": {
                  "trait": {
                    "$ref": "#/properties/request/anyOf/0/properties/study_id"
                  },
                  "unit": {
                    "$ref": "#/properties/request/anyOf/0/properties/study_id"
                  },
                  "ancestry": {
                    "$ref": "#/properties/request/anyOf/0/properties/study_id"
                  },
                  "genome_build": {
                    "$ref": "#/properties/request/anyOf/0/properties/study_id"
                  },
                  "source": {
                    "$ref": "#/properties/request/anyOf/0/properties/study_id"
                  },
                  "sample_size": {
                    "$ref": "#/properties/request/anyOf/0/properties/exposure/properties/sample_size"
                  },
                  "type": {
                    "type": "string",
                    "enum": [
                      "quant",
                      "cc"
                    ]
                  },
                  "sdY": {
                    "$ref": "#/properties/request/anyOf/0/properties/exposure/properties/sample_size"
                  },
                  "case_fraction": {
                    "type": "number",
                    "exclusiveMinimum": 0,
                    "exclusiveMaximum": 1
                  }
                },
                "required": [
                  "trait",
                  "unit",
                  "ancestry",
                  "genome_build",
                  "source",
                  "sample_size",
                  "type"
                ],
                "additionalProperties": false
              },
              "trait2": {
                "$ref": "#/properties/request/anyOf/1/properties/trait1"
              },
              "complete_region": {
                "type": "boolean",
                "const": true
              },
              "single_causal_variant_assumption": {
                "type": "boolean",
                "const": true
              },
              "region": {
                "type": "object",
                "properties": {
                  "chromosome": {
                    "$ref": "#/properties/request/anyOf/0/properties/study_id"
                  },
                  "start": {
                    "type": "integer",
                    "exclusiveMinimum": 0
                  },
                  "end": {
                    "type": "integer",
                    "exclusiveMinimum": 0
                  },
                  "genome_build": {
                    "$ref": "#/properties/request/anyOf/0/properties/study_id"
                  },
                  "source": {
                    "$ref": "#/properties/request/anyOf/0/properties/study_id"
                  }
                },
                "required": [
                  "chromosome",
                  "start",
                  "end",
                  "genome_build",
                  "source"
                ],
                "additionalProperties": false
              },
              "priors": {
                "type": "object",
                "properties": {
                  "p1": {
                    "type": "number",
                    "exclusiveMinimum": 0,
                    "exclusiveMaximum": 1
                  },
                  "p2": {
                    "type": "number",
                    "exclusiveMinimum": 0,
                    "exclusiveMaximum": 1
                  },
                  "p12": {
                    "type": "number",
                    "exclusiveMinimum": 0,
                    "exclusiveMaximum": 1
                  }
                },
                "required": [
                  "p1",
                  "p2",
                  "p12"
                ],
                "additionalProperties": false
              },
              "variants": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "snp": {
                      "$ref": "#/properties/request/anyOf/0/properties/study_id"
                    },
                    "position": {
                      "type": "integer",
                      "exclusiveMinimum": 0
                    },
                    "beta1": {
                      "$ref": "#/properties/request/anyOf/0/properties/instruments/items/properties/beta_exposure"
                    },
                    "beta2": {
                      "$ref": "#/properties/request/anyOf/0/properties/instruments/items/properties/beta_exposure"
                    },
                    "varbeta1": {
                      "$ref": "#/properties/request/anyOf/0/properties/exposure/properties/sample_size"
                    },
                    "varbeta2": {
                      "$ref": "#/properties/request/anyOf/0/properties/exposure/properties/sample_size"
                    },
                    "maf": {
                      "type": "number",
                      "exclusiveMinimum": 0,
                      "maximum": 0.5
                    }
                  },
                  "required": [
                    "snp",
                    "position",
                    "beta1",
                    "beta2",
                    "varbeta1",
                    "varbeta2",
                    "maf"
                  ],
                  "additionalProperties": false
                },
                "minItems": 2,
                "maxItems": 1000000
              }
            },
            "required": [
              "runner_contract",
              "exploratory",
              "analysis",
              "trait1",
              "trait2",
              "complete_region",
              "single_causal_variant_assumption",
              "region",
              "priors",
              "variants"
            ],
            "additionalProperties": false
          }
        ]
      },
      "threads": {
        "type": "integer",
        "minimum": 1,
        "maximum": 8,
        "default": 1
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
      }
    },
    "required": [
      "project_id",
      "request_id",
      "request",
      "confirm"
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
