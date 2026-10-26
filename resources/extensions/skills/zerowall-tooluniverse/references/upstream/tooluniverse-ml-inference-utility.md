# ml inference utility

Generic ML/NLP/vision inference against any HuggingFace-hosted model (serverless hf-inference provider) — text classification/sentiment, dense text embeddings for semantic similarity, masked-token prediction (including protein language models), summarization, zero-shot classification against caller-supplied labels, named entity recognition, extractive question answering, translation, image classification, and object detection. Use when someone asks to "classify this text with a HuggingFace model", "embed this text for similarity search", "run NER on this passage", "summarize this with model X", "zero-shot classify this against these labels", "predict the masked token", "classify/detect objects in this image", or names a specific HuggingFace model_id to run inference with. NOT a domain-analysis skill itself — this is a generic cross-domain utility other skills should reach for as a supporting step, the same way tooluniverse-clinical-terminology-lookup is a supporting lookup step rather than a research domain. NOT for training/fine-tuning models (inference only, against already-hosted models). Honest: as of this writing, HuggingFace's serverless inference API requires a valid HF_TOKEN for every one of these 10 tools, on every model tested — live-verified, not assumed from the "optional" wording in the tools' own descriptions. Also covers finding a model_id first via HuggingFace Hub search (HuggingFace_search_models/get_model/search_datasets — a separate, token-free catalog API) and running inference on Replicate-hosted models (Replicate_run_prediction/get_prediction) as an alternative platform when a model isn't served by HuggingFace's hf-inference provider.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Honesty contract (read first) — the token requirement is not actually optional
- When to Use This Skill
- The 10 Tools
- Choosing a `model_id`
- Workflow
- Finding a model first: HuggingFace Hub search (a different API, no token needed)
- An alternative inference platform: Replicate

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.HFInference_classify_image`
- `tooluniverse.tool.HFInference_classify_text`
- `tooluniverse.tool.HFInference_detect_objects`
- `tooluniverse.tool.HFInference_embed_text`
- `tooluniverse.tool.HFInference_fill_mask`
- `tooluniverse.tool.HFInference_ner`
- `tooluniverse.tool.HFInference_question_answering`
- `tooluniverse.tool.HFInference_summarize`
- `tooluniverse.tool.HFInference_translate`
- `tooluniverse.tool.HFInference_zero_shot_classify`
- `tooluniverse.tool.HF_TOKEN`
- `tooluniverse.tool.HuggingFace_get_model`
- `tooluniverse.tool.HuggingFace_search_datasets`
- `tooluniverse.tool.HuggingFace_search_models`
- `tooluniverse.tool.REPLICATE_API_TOKEN`
- `tooluniverse.tool.Replicate_get_prediction`
- `tooluniverse.tool.Replicate_run_prediction`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-ml-inference-utility/SKILL.md)；Apache-2.0；原文 SHA-256：`ae4213917c21f8b03116b6a8419435231e4eb6f4f12f1facdb476432c54918e8`。
