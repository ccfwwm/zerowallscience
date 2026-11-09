/** Generated from models.dev; gateway metadata always wins over this fallback. */
export const MODELS_DEV_SOURCE = "https://models.dev/api.json" as const
export const MODELS_DEV_FETCHED_AT = "2026-10-30T08:13:47.117Z" as const
export const MODELS_DEV_CONTEXT: Readonly<Record<string, { context: number; output?: number }>> = {
  "@cf/aisingapore/gemma-sea-lion-v4-27b-it": {
    "context": 128000,
    "output": 128000
  },
  "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b": {
    "context": 80000,
    "output": 80000
  },
  "@cf/deepseek-ai/deepseek-v4-flash-0731": {
    "context": 1048576,
    "output": 1048576
  },
  "@cf/deepseek-ai/deepseek-v4-pro-0813": {
    "context": 1048576,
    "output": 1048576
  },
  "@cf/deepseek-ai/deepseek-v4.1-flash-1017": {
    "context": 1048576,
    "output": 1048576
  },
  "@cf/google/gemma-4-26b-a4b-it": {
    "context": 256000,
    "output": 16384
  },
  "@cf/ibm-granite/granite-4.0-h-micro": {
    "context": 131000,
    "output": 131000
  },
  "@cf/meta/llama-3.1-8b-instruct-fp8": {
    "context": 32000,
    "output": 32000
  },
  "@cf/meta/llama-3.2-11b-vision-instruct": {
    "context": 128000,
    "output": 128000
  },
  "@cf/meta/llama-3.2-1b-instruct": {
    "context": 60000,
    "output": 60000
  },
  "@cf/meta/llama-3.2-3b-instruct": {
    "context": 80000,
    "output": 80000
  },
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast": {
    "context": 24000,
    "output": 24000
  },
  "@cf/meta/llama-4-scout-17b-16e-instruct": {
    "context": 131000,
    "output": 16384
  },
  "@cf/meta/llama-guard-3-8b": {
    "context": 131072,
    "output": 131072
  },
  "@cf/mistralai/mistral-small-3.1-24b-instruct": {
    "context": 128000,
    "output": 128000
  },
  "@cf/moonshotai/kimi-k2.6": {
    "context": 262144,
    "output": 256000
  },
  "@cf/moonshotai/kimi-k2.7-code": {
    "context": 262144,
    "output": 262144
  },
  "@cf/nvidia/nemotron-3-120b-a12b": {
    "context": 256000,
    "output": 256000
  },
  "@cf/openai/gpt-oss-120b": {
    "context": 128000,
    "output": 16384
  },
  "@cf/openai/gpt-oss-20b": {
    "context": 128000,
    "output": 16384
  },
  "@cf/qwen/qwen2.5-coder-32b-instruct": {
    "context": 32768,
    "output": 32768
  },
  "@cf/qwen/qwen3-30b-a3b-fp8": {
    "context": 32768,
    "output": 32768
  },
  "@cf/qwen/qwen3.8-27b": {
    "context": 262144,
    "output": 262144
  },
  "@cf/qwen/qwq-32b": {
    "context": 24000,
    "output": 24000
  },
  "@cf/zai-org/glm-4.7-flash": {
    "context": 131072,
    "output": 131072
  },
  "@cf/zai-org/glm-5.2": {
    "context": 262144,
    "output": 256000
  },
  "@cf/zai-org/glm-5.3": {
    "context": 1048576,
    "output": 1048576
  },
  "@cf/zai-org/glm-5.3-flash": {
    "context": 1048576,
    "output": 1048576
  },
  "~anthropic/claude-fable-latest": {
    "context": 1000000,
    "output": 128000
  },
  "~anthropic/claude-haiku-latest": {
    "context": 1000000,
    "output": 128000
  },
  "~anthropic/claude-opus-latest": {
    "context": 1000000,
    "output": 128000
  },
  "~anthropic/claude-sonnet-latest": {
    "context": 1000000,
    "output": 128000
  },
  "~deepseek/deepseek-flash-latest": {
    "context": 1048576,
    "output": 943718
  },
  "~deepseek/deepseek-pro-latest": {
    "context": 1048576,
    "output": 393216
  },
  "~deepseek/deepseek-v4-flash-latest": {
    "context": 1048576,
    "output": 943718
  },
  "~google/gemini-flash-latest": {
    "context": 1048576,
    "output": 65536
  },
  "~google/gemini-pro-latest": {
    "context": 1048576,
    "output": 943718
  },
  "~moonshotai/kimi-latest": {
    "context": 1048576,
    "output": 943718
  },
  "~openai/gpt-astra-latest": {
    "context": 1050000,
    "output": 128000
  },
  "~openai/gpt-luna-latest": {
    "context": 1050000,
    "output": 128000
  },
  "~openai/gpt-mini-latest": {
    "context": 400000,
    "output": 128000
  },
  "~openai/gpt-sol-latest": {
    "context": 1050000,
    "output": 128000
  },
  "~openai/gpt-terra-latest": {
    "context": 1050000,
    "output": 128000
  },
  "~unbiased/pareto-latest": {
    "context": 1048576,
    "output": 131072
  },
  "~x-ai/grok-latest": {
    "context": 500000,
    "output": 450000
  },
  "~z-ai/glm-flash-latest": {
    "context": 1048576,
    "output": 943718
  },
  "~z-ai/glm-latest": {
    "context": 1048576,
    "output": 943718
  },
  "abacusai/Dracarys-72B-Instruct": {
    "context": 32768,
    "output": 8192
  },
  "abliterated-model": {
    "context": 150000,
    "output": 8192
  },
  "abliterated-model-large": {
    "context": 1000000,
    "output": 999990
  },
  "abliterated-model-large-v2": {
    "context": 1000000,
    "output": 999990
  },
  "abliteration-abliterated-model-large-flash": {
    "context": 1000000,
    "output": 131072
  },
  "abliteration-abliterated-model-large-v2": {
    "context": 1000000,
    "output": 32768
  },
  "abliteration-ai/abliterated-model": {
    "context": 262144,
    "output": 262134
  },
  "abliteration-ai/abliterated-model-large": {
    "context": 1000000,
    "output": 999990
  },
  "abliteration-ai/abliterated-model-large-flash": {
    "context": 1048576,
    "output": 262144
  },
  "abliteration-ai/abliterated-model-large-v2": {
    "context": 1048576,
    "output": 999990
  },
  "accounts/fireworks/models/deepseek-v4p1-flash": {
    "context": 1000000,
    "output": 384000
  },
  "accounts/fireworks/models/deepseek-v4p1-flash-1017": {
    "context": 1000000,
    "output": 384000
  },
  "accounts/fireworks/models/ember-1": {
    "context": 1048576,
    "output": 131072
  },
  "accounts/fireworks/models/glm-5p3": {
    "context": 1048573,
    "output": 262144
  },
  "accounts/fireworks/models/glm-5p3-flash": {
    "context": 1048573,
    "output": 131072
  },
  "accounts/fireworks/models/gpt-oss-120b": {
    "context": 131072,
    "output": 32768
  },
  "accounts/fireworks/models/inkling": {
    "context": 1048576,
    "output": 1048576
  },
  "accounts/fireworks/models/kimi-k3": {
    "context": 1048576,
    "output": 131072
  },
  "accounts/fireworks/models/minimax-m3": {
    "context": 512000,
    "output": 512000
  },
  "accounts/fireworks/models/minimax-m3p1-flash": {
    "context": 1000000,
    "output": 512000
  },
  "accounts/fireworks/models/muse-spark-open": {
    "context": 1048576,
    "output": 131072
  },
  "accounts/fireworks/models/nemotron-3-ultra-nvfp4": {
    "context": 262144,
    "output": 128000
  },
  "accounts/fireworks/models/nemotron-lightning-3p5-30b-a3b": {
    "context": 262144,
    "output": 262144
  },
  "accounts/fireworks/models/qwen3p8-2p4t-a95b": {
    "context": 262144,
    "output": 131072
  },
  "accounts/fireworks/models/qwen3p8-max": {
    "context": 262144,
    "output": 131072
  },
  "accounts/fireworks/routers/deepseek-flash-latest": {
    "context": 1000000,
    "output": 384000
  },
  "accounts/fireworks/routers/deepseek-v4p1-flash-1017-spot": {
    "context": 1000000,
    "output": 384000
  },
  "accounts/fireworks/routers/deepseek-v4p1-flash-spot": {
    "context": 1000000,
    "output": 384000
  },
  "accounts/fireworks/routers/glm-5p3-fast": {
    "context": 1048572,
    "output": 262144
  },
  "accounts/fireworks/routers/glm-5p3-spot": {
    "context": 1048573,
    "output": 262144
  },
  "accounts/fireworks/routers/glm-fast-latest": {
    "context": 1048572,
    "output": 262144
  },
  "accounts/fireworks/routers/glm-flash-latest": {
    "context": 1048573,
    "output": 131072
  },
  "accounts/fireworks/routers/glm-latest": {
    "context": 1048573,
    "output": 262144
  },
  "accounts/fireworks/routers/kimi-fast-latest": {
    "context": 1048576,
    "output": 131072
  },
  "accounts/fireworks/routers/kimi-k3-fast": {
    "context": 1048576,
    "output": 131072
  },
  "accounts/fireworks/routers/kimi-k3-spot": {
    "context": 1048576,
    "output": 131072
  },
  "accounts/fireworks/routers/kimi-latest": {
    "context": 1048576,
    "output": 131072
  },
  "accounts/fireworks/routers/minimax-latest": {
    "context": 512000,
    "output": 512000
  },
  "accounts/fireworks/routers/qwen-max-latest": {
    "context": 262144,
    "output": 131072
  },
  "agent-max": {
    "context": 1000000,
    "output": 128000
  },
  "agent-prime": {
    "context": 196608,
    "output": 131072
  },
  "agent-standard": {
    "context": 128000,
    "output": 65536
  },
  "Agents-A1": {
    "context": 262000,
    "output": 100000
  },
  "agnes-2.0-flash": {
    "context": 512000,
    "output": 65536
  },
  "agnes-2.5-flash": {
    "context": 512000,
    "output": 65536
  },
  "agnes-2.5-pro-alpha": {
    "context": 1000000,
    "output": 65536
  },
  "aion-labs-aion-3-0": {
    "context": 128000,
    "output": 32768
  },
  "aion-labs-aion-3-0-mini": {
    "context": 128000,
    "output": 32768
  },
  "aion-labs-aion-3-5": {
    "context": 262144,
    "output": 32768
  },
  "aion-labs-aion-3-5-mini": {
    "context": 262144,
    "output": 32768
  },
  "aion-labs/aion-2.0": {
    "context": 131072,
    "output": 32768
  },
  "aion-labs/aion-3.0": {
    "context": 131072,
    "output": 32768
  },
  "aion-labs/aion-3.0-mini": {
    "context": 131072,
    "output": 32768
  },
  "aion-labs/aion-3.5": {
    "context": 262144,
    "output": 32768
  },
  "aion-labs/aion-3.5-mini": {
    "context": 262144,
    "output": 32768
  },
  "aion-labs/aion-rp-llama-3.1-8b": {
    "context": 32768
  },
  "aisingapore/gemma-sea-lion-v4-27b-it": {
    "context": 131072,
    "output": 128000
  },
  "aisingapore/qwen-sea-lion-v4-32b-it": {
    "context": 131072,
    "output": 131072
  },
  "aleph-alpha/kolibri-1": {
    "context": 1048576,
    "output": 943718
  },
  "alibaba/deepseek-v4-flash": {
    "context": 1000000,
    "output": 393216
  },
  "alibaba/deepseek-v4-pro": {
    "context": 1000000,
    "output": 393216
  },
  "alibaba/deepseek-v4.1-flash": {
    "context": 1000000,
    "output": 393216
  },
  "alibaba/deepseek-v4.1-flash-1017": {
    "context": 1000000,
    "output": 393216
  },
  "alibaba/glm-5": {
    "context": 202752,
    "output": 16384
  },
  "alibaba/glm-5.2": {
    "context": 1000000,
    "output": 131072
  },
  "alibaba/glm-5.3": {
    "context": 1048576,
    "output": 131072
  },
  "alibaba/kimi-k2.5": {
    "context": 262144,
    "output": 98304
  },
  "alibaba/kimi-k3": {
    "context": 1048576,
    "output": 1048576
  },
  "alibaba/qwen-3-14b": {
    "context": 40960,
    "output": 16384
  },
  "alibaba/qwen-3-235b": {
    "context": 262144,
    "output": 16384
  },
  "alibaba/qwen-3-30b": {
    "context": 40960,
    "output": 16384
  },
  "alibaba/qwen-3-32b": {
    "context": 128000,
    "output": 8192
  },
  "alibaba/qwen-flash": {
    "context": 1000000,
    "output": 32000
  },
  "alibaba/qwen-plus-latest": {
    "context": 1000000,
    "output": 32000
  },
  "alibaba/qwen3-coder": {
    "context": 262144,
    "output": 32768
  },
  "alibaba/qwen3-coder-30b-a3b": {
    "context": 262144,
    "output": 8192
  },
  "alibaba/qwen3-coder-480b-a35b-instruct": {
    "context": 262000,
    "output": 65536
  },
  "alibaba/qwen3-coder-flash": {
    "context": 997952,
    "output": 65536
  },
  "alibaba/qwen3-coder-next": {
    "context": 256000,
    "output": 256000
  },
  "alibaba/qwen3-embedding-0.6b": {
    "context": 32768
  },
  "alibaba/qwen3-embedding-4b": {
    "context": 32768
  },
  "alibaba/qwen3-embedding-8b": {
    "context": 32768
  },
  "alibaba/qwen3-max": {
    "context": 262144,
    "output": 65536
  },
  "alibaba/qwen3-max-thinking": {
    "context": 256000,
    "output": 65536
  },
  "alibaba/qwen3-next-80b-a3b-thinking": {
    "context": 262144,
    "output": 262144
  },
  "alibaba/qwen3-vl-instruct": {
    "context": 262144,
    "output": 262144
  },
  "alibaba/qwen3-vl-plus": {
    "context": 262144,
    "output": 32768
  },
  "alibaba/qwen3.5-122b-a10b": {
    "context": 262144,
    "output": 65536
  },
  "alibaba/qwen3.5-27b": {
    "context": 262144,
    "output": 65536
  },
  "alibaba/qwen3.5-35b-a3b": {
    "context": 262144,
    "output": 65536
  },
  "alibaba/qwen3.5-397b-a17b": {
    "context": 262144,
    "output": 65536
  },
  "alibaba/qwen3.5-flash": {
    "context": 1000000,
    "output": 64000
  },
  "alibaba/qwen3.5-plus": {
    "context": 1000000,
    "output": 64000
  },
  "alibaba/qwen3.6-27b": {
    "context": 256000,
    "output": 65536
  },
  "alibaba/qwen3.6-35b-a3b": {
    "context": 262144,
    "output": 65536
  },
  "alibaba/qwen3.6-flash": {
    "context": 983616,
    "output": 65536
  },
  "alibaba/qwen3.8-2.4t-a95b": {
    "context": 262144
  },
  "alibaba/qwen3.8-max-0902": {
    "context": 991000,
    "output": 128000
  },
  "alibaba/qwen3.8-max-prime": {
    "context": 1000000,
    "output": 131072
  },
  "alibaba/qwen35-397b-a17b": {
    "context": 262144,
    "output": 65536
  },
  "alicloud-deepseek-v4-flash": {
    "context": 1000000,
    "output": 384000
  },
  "alicloud-deepseek-v4-pro": {
    "context": 1000000,
    "output": 384000
  },
  "alicloud-glm-5.1": {
    "context": 200000,
    "output": 128000
  },
  "all-mini-lm-l6-v2": {
    "context": 256,
    "output": 384
  },
  "allam-2-7b": {
    "context": 4096,
    "output": 4096
  },
  "amazon--nova-lite": {
    "context": 1000000,
    "output": 64000
  },
  "amazon--nova-micro": {
    "context": 128000,
    "output": 8192
  },
  "amazon--nova-pro": {
    "context": 300000,
    "output": 8192
  },
  "amazon--titan-embed-text": {
    "context": 8192,
    "output": 1536
  },
  "amazon.nova-2-lite-v1:0": {
    "context": 1000000,
    "output": 65535
  },
  "amazon.nova-lite-v1:0": {
    "context": 300000,
    "output": 10000
  },
  "amazon.nova-micro-v1:0": {
    "context": 128000,
    "output": 10000
  },
  "amazon.nova-pro-v1:0": {
    "context": 300000,
    "output": 10000
  },
  "amazon/amazon.nova-lite-v1:0": {
    "context": 300000,
    "output": 10000
  },
  "amazon/amazon.nova-lite-v1:0@us": {
    "context": 300000,
    "output": 10000
  },
  "amazon/amazon.nova-micro-v1:0": {
    "context": 128000,
    "output": 10000
  },
  "amazon/amazon.nova-micro-v1:0@us": {
    "context": 128000,
    "output": 10000
  },
  "amazon/amazon.nova-pro-v1:0": {
    "context": 300000,
    "output": 10000
  },
  "amazon/amazon.nova-pro-v1:0@us": {
    "context": 300000,
    "output": 10000
  },
  "amazon/google.gemma-3-12b-it": {
    "context": 128000,
    "output": 131072
  },
  "amazon/google.gemma-3-12b-it@us": {
    "context": 128000,
    "output": 131072
  },
  "amazon/google.gemma-3-27b-it": {
    "context": 128000,
    "output": 131072
  },
  "amazon/google.gemma-3-27b-it@us": {
    "context": 128000,
    "output": 131072
  },
  "amazon/google.gemma-3-4b-it": {
    "context": 128000,
    "output": 131072
  },
  "amazon/google.gemma-3-4b-it@us": {
    "context": 128000,
    "output": 131072
  },
  "amazon/mistral.pixtral-large-2502-v1:0": {
    "context": 128000,
    "output": 8192
  },
  "amazon/mistral.pixtral-large-2502-v1:0@us": {
    "context": 128000,
    "output": 8192
  },
  "amazon/mistral.voxtral-mini-3b-2507": {
    "context": 32768,
    "output": 32768
  },
  "amazon/mistral.voxtral-mini-3b-2507@us": {
    "context": 32768,
    "output": 32768
  },
  "amazon/mistral.voxtral-small-24b-2507": {
    "context": 32768,
    "output": 32768
  },
  "amazon/mistral.voxtral-small-24b-2507@us": {
    "context": 32768,
    "output": 32768
  },
  "amazon/moonshot.kimi-k2-thinking": {
    "context": 256000,
    "output": 262144
  },
  "amazon/moonshotai.kimi-k2.5": {
    "context": 262144,
    "output": 262144
  },
  "amazon/nova-2-lite": {
    "context": 1000000,
    "output": 65535
  },
  "amazon/nova-2-lite-v1": {
    "context": 1000000,
    "output": 65535
  },
  "amazon/nova-lite": {
    "context": 300000,
    "output": 10000
  },
  "amazon/nova-lite-v1": {
    "context": 300000,
    "output": 5120
  },
  "amazon/nova-micro": {
    "context": 128000,
    "output": 10000
  },
  "amazon/nova-micro-v1": {
    "context": 128000,
    "output": 5120
  },
  "amazon/nova-premier-v1": {
    "context": 1000000,
    "output": 32000
  },
  "amazon/nova-pro": {
    "context": 300000,
    "output": 10000
  },
  "amazon/nova-pro-v1": {
    "context": 300000
  },
  "amazon/openai.gpt-oss-safeguard-20b": {
    "context": 128000,
    "output": 131072
  },
  "amazon/openai.gpt-oss-safeguard-20b@us": {
    "context": 128000,
    "output": 131072
  },
  "amazon/qwen.qwen3-coder-next": {
    "context": 262144,
    "output": 65536
  },
  "amazon/titan-embed-text-v2": {
    "context": 8192
  },
  "amazon/zai.glm-4.7-flash": {
    "context": 203000,
    "output": 131072
  },
  "amazon/zai.glm-4.7-flash@us": {
    "context": 203000,
    "output": 131072
  },
  "ambient/large": {
    "context": 202752,
    "output": 202752
  },
  "ambient/small": {
    "context": 101072,
    "output": 101072
  },
  "anthracite-org/magnum-v2-72b": {
    "context": 16384,
    "output": 8192
  },
  "anthropic--claude-3-haiku": {
    "context": 200000,
    "output": 4096
  },
  "anthropic--claude-4-opus": {
    "context": 200000,
    "output": 32000
  },
  "anthropic--claude-4-sonnet": {
    "context": 200000,
    "output": 64000
  },
  "anthropic--claude-4.5-haiku": {
    "context": 200000,
    "output": 64000
  },
  "anthropic--claude-4.5-opus": {
    "context": 200000,
    "output": 64000
  },
  "anthropic--claude-4.5-sonnet": {
    "context": 200000,
    "output": 64000
  },
  "anthropic--claude-4.6-opus": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic--claude-4.6-sonnet": {
    "context": 1000000,
    "output": 64000
  },
  "anthropic--claude-4.7-opus": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic--claude-4.8-opus": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic-claude-4.5-sonnet": {
    "context": 200000,
    "output": 64000
  },
  "anthropic-claude-4.6-sonnet": {
    "context": 200000,
    "output": 8192
  },
  "anthropic-claude-5-sonnet": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic-claude-5.5-haiku": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic-claude-fable-5": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic-claude-fable-5.1": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic-claude-haiku-4.5": {
    "context": 200000,
    "output": 8192
  },
  "anthropic-claude-opus-4.5": {
    "context": 200000,
    "output": 8192
  },
  "anthropic-claude-opus-4.6": {
    "context": 200000,
    "output": 8192
  },
  "anthropic-claude-opus-4.7": {
    "context": 200000,
    "output": 8192
  },
  "anthropic-claude-opus-4.8": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic-claude-opus-5": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic-claude-opus-5.5": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic-claude-sonnet-5.5": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic.claude-fable-5": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic.claude-fable-5-1": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic.claude-haiku-4-5-20251001-v1:0": {
    "context": 200000,
    "output": 64000
  },
  "anthropic.claude-haiku-5-5": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic.claude-opus-4-1-20250805-v1:0": {
    "context": 200000,
    "output": 32000
  },
  "anthropic.claude-opus-4-5-20251101-v1:0": {
    "context": 200000,
    "output": 64000
  },
  "anthropic.claude-opus-4-6-v1": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic.claude-opus-4-7": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic.claude-opus-4-8": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic.claude-opus-5": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic.claude-opus-5-5": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic.claude-sonnet-4-5-20250929-v1:0": {
    "context": 200000,
    "output": 64000
  },
  "anthropic.claude-sonnet-4-6": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic.claude-sonnet-5": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic.claude-sonnet-5-5": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic/claude-fable-5": {
    "context": 1000000
  },
  "anthropic/claude-fable-5-1": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic/claude-fable-5.1": {
    "context": 1000000
  },
  "anthropic/claude-fable-latest": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic/claude-haiku-3": {
    "context": 189096,
    "output": 8192
  },
  "anthropic/claude-haiku-3.5": {
    "context": 189096,
    "output": 8192
  },
  "anthropic/claude-haiku-4-5": {
    "context": 200000,
    "output": 64000
  },
  "anthropic/claude-haiku-4-5-20251001": {
    "context": 200000,
    "output": 64000
  },
  "anthropic/claude-haiku-4.5:thinking": {
    "context": 200000,
    "output": 64000
  },
  "anthropic/claude-haiku-5-5": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic/claude-haiku-5.5": {
    "context": 1000000
  },
  "anthropic/claude-haiku-latest": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic/claude-opus-4": {
    "context": 192512,
    "output": 28672
  },
  "anthropic/claude-opus-4-1-20250805": {
    "context": 200000,
    "output": 32000
  },
  "anthropic/claude-opus-4-5": {
    "context": 200000,
    "output": 64000
  },
  "anthropic/claude-opus-4-5-20251101": {
    "context": 200000
  },
  "anthropic/claude-opus-4-7": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic/claude-opus-4-8": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic/claude-opus-4.1:thinking": {
    "context": 200000,
    "output": 32000
  },
  "anthropic/claude-opus-4.1:thinking:1024": {
    "context": 200000,
    "output": 32000
  },
  "anthropic/claude-opus-4.1:thinking:32768": {
    "context": 200000,
    "output": 32000
  },
  "anthropic/claude-opus-4.1:thinking:8192": {
    "context": 200000,
    "output": 32000
  },
  "anthropic/claude-opus-4.5:thinking": {
    "context": 200000,
    "output": 64000
  },
  "anthropic/claude-opus-4.6:thinking": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic/claude-opus-4.6:thinking:low": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic/claude-opus-4.6:thinking:max": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic/claude-opus-4.6:thinking:medium": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic/claude-opus-4.7:thinking": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic/claude-opus-4.8-fast": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic/claude-opus-4.8:thinking": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic/claude-opus-5": {
    "context": 1000000
  },
  "anthropic/claude-opus-5-5": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic/claude-opus-5-fast": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic/claude-opus-5.5": {
    "context": 1000000
  },
  "anthropic/claude-opus-5.5-fast": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic/claude-opus-latest": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic/claude-sonnet-3.5": {
    "context": 189096,
    "output": 8192
  },
  "anthropic/claude-sonnet-3.5-june": {
    "context": 189096,
    "output": 8192
  },
  "anthropic/claude-sonnet-3.7": {
    "context": 196608,
    "output": 128000
  },
  "anthropic/claude-sonnet-4": {
    "context": 983040,
    "output": 64000
  },
  "anthropic/claude-sonnet-4-5": {
    "context": 200000,
    "output": 64000
  },
  "anthropic/claude-sonnet-4-5-20250929": {
    "context": 200000,
    "output": 64000
  },
  "anthropic/claude-sonnet-4.5:thinking": {
    "context": 200000,
    "output": 64000
  },
  "anthropic/claude-sonnet-4.6:thinking": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic/claude-sonnet-5": {
    "context": 1000000
  },
  "anthropic/claude-sonnet-5-5": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic/claude-sonnet-5:thinking": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic/claude-sonnet-5.5": {
    "context": 1000000
  },
  "anthropic/claude-sonnet-5.5:thinking": {
    "context": 1000000,
    "output": 128000
  },
  "anthropic/claude-sonnet-latest": {
    "context": 1000000,
    "output": 128000
  },
  "apac.amazon.nova-lite-v1:0": {
    "context": 300000,
    "output": 10000
  },
  "apac.amazon.nova-micro-v1:0": {
    "context": 128000,
    "output": 10000
  },
  "apac.amazon.nova-pro-v1:0": {
    "context": 300000,
    "output": 10000
  },
  "apac.anthropic.claude-sonnet-4-20250514-v1:0": {
    "context": 200000,
    "output": 64000
  },
  "apodex/apodex-1.1-mini": {
    "context": 262144,
    "output": 262144
  },
  "arcee_ai/AFM/models/trinity-mini": {
    "context": 131072,
    "output": 131072
  },
  "arcee-trinity-large-thinking": {
    "context": 128000,
    "output": 32000
  },
  "arkanecloud/deepseek-ai/DeepSeek-V4-Flash-0731": {
    "context": 1048576,
    "output": 384000
  },
  "arkanecloud/deepseek-ai/DeepSeek-V4.1-Flash": {
    "context": 1048576,
    "output": 384000
  },
  "arkanecloud/deepseek-ai/DeepSeek-V4.1-Flash-1017": {
    "context": 1048576,
    "output": 384000
  },
  "arkanecloud/meta-llama/Llama-3.1-70B-Instruct": {
    "context": 131072,
    "output": 4096
  },
  "arkanecloud/meta-llama/Llama-3.1-8B-Instruct": {
    "context": 131072,
    "output": 4096
  },
  "arkanecloud/meta-llama/Llama-3.3-70B-Instruct": {
    "context": 128000,
    "output": 4096
  },
  "arkanecloud/ministral-14b": {
    "context": 32768,
    "output": 262144
  },
  "arkanecloud/nvidia/nemotron-3-super-120b-a12b": {
    "context": 256000,
    "output": 262144
  },
  "arkanecloud/nvidia/nemotron-3-ultra-550b-a55b": {
    "context": 512288,
    "output": 128000
  },
  "arkanecloud/openai/gpt-oss-120b": {
    "context": 131072,
    "output": 32768
  },
  "arkanecloud/openai/gpt-oss-20b": {
    "context": 131072,
    "output": 32768
  },
  "arkanecloud/Qwen/Qwen3-235B-A22B-Instruct-2507": {
    "context": 262000,
    "output": 16384
  },
  "asi1-mini": {
    "context": 128000,
    "output": 16384
  },
  "au.anthropic.claude-haiku-4-5-20251001-v1:0": {
    "context": 200000,
    "output": 64000
  },
  "au.anthropic.claude-haiku-5-5": {
    "context": 1000000,
    "output": 128000
  },
  "au.anthropic.claude-opus-4-6-v1": {
    "context": 1000000,
    "output": 128000
  },
  "au.anthropic.claude-opus-4-7": {
    "context": 1000000,
    "output": 128000
  },
  "au.anthropic.claude-opus-4-8": {
    "context": 1000000,
    "output": 128000
  },
  "au.anthropic.claude-opus-5": {
    "context": 1000000,
    "output": 128000
  },
  "au.anthropic.claude-opus-5-5": {
    "context": 1000000,
    "output": 128000
  },
  "au.anthropic.claude-sonnet-4-5-20250929-v1:0": {
    "context": 200000,
    "output": 64000
  },
  "au.anthropic.claude-sonnet-4-6": {
    "context": 1000000,
    "output": 128000
  },
  "au.anthropic.claude-sonnet-5": {
    "context": 1000000,
    "output": 128000
  },
  "au.anthropic.claude-sonnet-5-5": {
    "context": 1000000,
    "output": 128000
  },
  "auto-model": {
    "context": 1000000,
    "output": 1000000
  },
  "auto-model-basic": {
    "context": 1000000,
    "output": 1000000
  },
  "auto-model-premium": {
    "context": 1000000,
    "output": 1000000
  },
  "auto-model-standard": {
    "context": 1000000,
    "output": 1000000
  },
  "auto/mistralai/codestral-2508": {
    "context": 128000,
    "output": 8192
  },
  "auto/mistralai/ministral-14b-2512": {
    "context": 262144,
    "output": 262144
  },
  "auto/mistralai/ministral-3b-2512": {
    "context": 262144,
    "output": 262144
  },
  "auto/mistralai/ministral-8b-2512": {
    "context": 262144,
    "output": 262144
  },
  "auto/mistralai/mistral-large-2512": {
    "context": 262144,
    "output": 262144
  },
  "auto/mistralai/mistral-large-4": {
    "context": 524288,
    "output": 262144
  },
  "auto/mistralai/mistral-medium-3.5": {
    "context": 262144,
    "output": 262144
  },
  "auto/mistralai/mistral-small-2603": {
    "context": 256000,
    "output": 256000
  },
  "auto/openai/gpt-4.1": {
    "context": 1047576,
    "output": 32768
  },
  "auto/openai/gpt-4.1-mini": {
    "context": 1047576,
    "output": 32768
  },
  "auto/openai/gpt-4o": {
    "context": 128000,
    "output": 16384
  },
  "auto/openai/gpt-4o-mini": {
    "context": 128000,
    "output": 16384
  },
  "auto/openai/gpt-5": {
    "context": 400000,
    "output": 128000
  },
  "auto/openai/gpt-5-mini": {
    "context": 400000,
    "output": 128000
  },
  "auto/openai/gpt-5-nano": {
    "context": 400000,
    "output": 128000
  },
  "auto/openai/gpt-5.2": {
    "context": 400000,
    "output": 128000
  },
  "auto/openai/gpt-5.4": {
    "context": 1050000,
    "output": 128000
  },
  "auto/openai/gpt-5.4-mini": {
    "context": 400000,
    "output": 128000
  },
  "auto/openai/gpt-5.5": {
    "context": 1050000,
    "output": 128000
  },
  "auto/openai/gpt-5.6-luna": {
    "context": 1050000,
    "output": 128000
  },
  "auto/openai/gpt-5.6-sol": {
    "context": 1050000,
    "output": 128000
  },
  "auto/openai/gpt-5.6-terra": {
    "context": 1050000,
    "output": 128000
  },
  "auto/openai/gpt-6-astra": {
    "context": 1050000,
    "output": 128000
  },
  "auto/openai/gpt-6-luna": {
    "context": 1050000,
    "output": 128000
  },
  "auto/openai/gpt-6-sol": {
    "context": 1050000,
    "output": 128000
  },
  "auto/openai/gpt-6.1-sol": {
    "context": 1050000,
    "output": 128000
  },
  "auto/openai/gpt-6.1-terra": {
    "context": 1050000,
    "output": 128000
  },
  "auto/openai/gpt-oss-120b": {
    "context": 131072,
    "output": 32768
  },
  "auto/openai/gpt-oss-20b": {
    "context": 131072,
    "output": 32768
  },
  "auto/openai/gpt-oss-safeguard-120b": {
    "context": 131072,
    "output": 32768
  },
  "auto/openai/gpt-oss-safeguard-20b": {
    "context": 131072,
    "output": 131072
  },
  "auto/openai/o3": {
    "context": 200000,
    "output": 100000
  },
  "aws-bedrock/claude-fable-5": {
    "context": 1000000,
    "output": 128000
  },
  "aws-bedrock/claude-fable-5-1": {
    "context": 1000000,
    "output": 128000
  },
  "aws-bedrock/claude-haiku-4-5": {
    "context": 200000,
    "output": 64000
  },
  "aws-bedrock/claude-haiku-4-5-20251001": {
    "context": 200000,
    "output": 64000
  },
  "aws-bedrock/claude-haiku-5-5": {
    "context": 1000000,
    "output": 128000
  },
  "aws-bedrock/claude-opus-4-5-20251101": {
    "context": 200000,
    "output": 32000
  },
  "aws-bedrock/claude-opus-4-6": {
    "context": 1000000,
    "output": 128000
  },
  "aws-bedrock/claude-opus-4-7": {
    "context": 1000000,
    "output": 128000
  },
  "aws-bedrock/claude-opus-4-8": {
    "context": 1000000,
    "output": 128000
  },
  "aws-bedrock/claude-opus-5": {
    "context": 1000000,
    "output": 128000
  },
  "aws-bedrock/claude-opus-5-5": {
    "context": 1000000,
    "output": 128000
  },
  "aws-bedrock/claude-sonnet-4-5": {
    "context": 200000,
    "output": 8192
  },
  "aws-bedrock/claude-sonnet-4-5-20250929": {
    "context": 200000,
    "output": 8192
  },
  "aws-bedrock/claude-sonnet-4-6": {
    "context": 1000000,
    "output": 64000
  },
  "aws-bedrock/claude-sonnet-5": {
    "context": 1000000,
    "output": 128000
  },
  "aws-bedrock/claude-sonnet-5-5": {
    "context": 1000000,
    "output": 128000
  },
  "aws-bedrock/grok-4-3": {
    "context": 1000000,
    "output": 131072
  },
  "aws-bedrock/grok-4-6": {
    "context": 500000,
    "output": 500000
  },
  "aws-bedrock/grok-4-7": {
    "context": 524288,
    "output": 524288
  },
  "aws-bedrock/kimi-k3": {
    "context": 1048576,
    "output": 1048576
  },
  "aws-bedrock/llama-3.1-70b-instruct": {
    "context": 128000,
    "output": 2048
  },
  "aws-bedrock/llama-4-maverick-17b-instruct": {
    "context": 8192,
    "output": 2048
  },
  "aws-bedrock/llama-4-scout-17b-instruct": {
    "context": 8192,
    "output": 2048
  },
  "aws-mantle/gpt-5.6-luna": {
    "context": 921600,
    "output": 128000
  },
  "aws-mantle/gpt-5.6-sol": {
    "context": 921600,
    "output": 128000
  },
  "aws-mantle/gpt-5.6-terra": {
    "context": 921600,
    "output": 128000
  },
  "aws-mantle/gpt-6-astra": {
    "context": 1050000,
    "output": 128000
  },
  "azure-ai-foundry/grok-4-1-fast-reasoning": {
    "context": 2000000,
    "output": 30000
  },
  "azure-ai-foundry/grok-4-3": {
    "context": 20000,
    "output": 8192
  },
  "azure-anthropic/claude-fable-5": {
    "context": 1000000,
    "output": 128000
  },
  "azure-anthropic/claude-fable-5-1": {
    "context": 1000000,
    "output": 128000
  },
  "azure-anthropic/claude-opus-4-6": {
    "context": 1000000,
    "output": 128000
  },
  "azure-anthropic/claude-opus-4-7": {
    "context": 1000000,
    "output": 128000
  },
  "azure-anthropic/claude-opus-4-8": {
    "context": 1000000,
    "output": 128000
  },
  "azure-anthropic/claude-opus-5": {
    "context": 1000000,
    "output": 128000
  },
  "azure-anthropic/claude-opus-5-5": {
    "context": 1000000,
    "output": 128000
  },
  "azure-anthropic/claude-sonnet-5": {
    "context": 1000000,
    "output": 128000
  },
  "azure-anthropic/claude-sonnet-5-5": {
    "context": 1000000,
    "output": 128000
  },
  "azure/gpt-4.1": {
    "context": 1000000,
    "output": 32768
  },
  "azure/gpt-4.1-mini": {
    "context": 1000000,
    "output": 32768
  },
  "azure/gpt-4.1-nano": {
    "context": 1047576,
    "output": 32768
  },
  "azure/gpt-4.1-nano@eu": {
    "context": 1047576,
    "output": 32768
  },
  "azure/gpt-4o": {
    "context": 128000,
    "output": 16384
  },
  "azure/gpt-5": {
    "context": 400000,
    "output": 128000
  },
  "azure/gpt-5-mini": {
    "context": 400000,
    "output": 128000
  },
  "azure/gpt-5-nano": {
    "context": 400000,
    "output": 128000
  },
  "azure/gpt-5.1": {
    "context": 400000,
    "output": 128000
  },
  "azure/gpt-5.1-codex-max": {
    "context": 272000,
    "output": 128000
  },
  "azure/gpt-5.2": {
    "context": 400000,
    "output": 128000
  },
  "azure/gpt-5.3-codex": {
    "context": 400000,
    "output": 128000
  },
  "azure/gpt-5.4": {
    "context": 1050000,
    "output": 128000
  },
  "azure/gpt-5.4-mini": {
    "context": 400000,
    "output": 128000
  },
  "azure/gpt-5.4-nano": {
    "context": 400000,
    "output": 128000
  },
  "azure/gpt-5.4-pro": {
    "context": 1050000,
    "output": 128000
  },
  "azure/gpt-5.5": {
    "context": 1050000,
    "output": 128000
  },
  "azure/gpt-5.6-luna": {
    "context": 1050000,
    "output": 128000
  },
  "azure/gpt-5.6-sol": {
    "context": 1050000,
    "output": 128000
  },
  "azure/gpt-5.6-terra": {
    "context": 1050000,
    "output": 128000
  },
  "azure/gpt-6-astra": {
    "context": 1050000,
    "output": 128000
  },
  "azure/gpt-6-luna": {
    "context": 1050000,
    "output": 128000
  },
  "azure/gpt-6-sol": {
    "context": 1050000,
    "output": 128000
  },
  "azure/gpt-6.1-sol": {
    "context": 1050000,
    "output": 128000
  },
  "azure/gpt-oss-120b": {
    "context": 131072,
    "output": 32768
  },
  "baai/bge-m3": {
    "context": 8192
  },
  "baai/bge-reranker-v2-m3": {
    "context": 8000
  },
  "baichuan/baichuan-m2-32b": {
    "context": 131072,
    "output": 131072
  },
  "baidu/cobuddy": {
    "context": 131072,
    "output": 65536
  },
  "baidu/deepseek-v4-flash": {
    "context": 1048576,
    "output": 131072
  },
  "baidu/deepseek-v4-pro": {
    "context": 1048576,
    "output": 131072
  },
  "baidu/deepseek-v4.1-flash": {
    "context": 1048576,
    "output": 393216
  },
  "baidu/deepseek-v4.1-flash-1017": {
    "context": 1048576,
    "output": 393216
  },
  "baidu/ernie-4.5-21B-a3b": {
    "context": 120000,
    "output": 8000
  },
  "baidu/ernie-4.5-300b-a47b-paddle": {
    "context": 123000,
    "output": 12000
  },
  "baidu/ernie-4.5-vl-424b-a47b": {
    "context": 123000,
    "output": 16000
  },
  "baidu/ernie-5.0-thinking-preview": {
    "context": 128000,
    "output": 64000
  },
  "baidu/glm-5.1": {
    "context": 202752,
    "output": 131072
  },
  "baidu/glm-5.2": {
    "context": 1048576,
    "output": 131072
  },
  "baidu/glm-5.3": {
    "context": 1048576,
    "output": 131072
  },
  "baidu/glm-5.3-flash": {
    "context": 1048576,
    "output": 131072
  },
  "bailian/qwen-flash": {
    "context": 1000000,
    "output": 32768
  },
  "bailian/qwen-max": {
    "context": 32768,
    "output": 8192
  },
  "bailian/qwen-plus": {
    "context": 1000000,
    "output": 32768
  },
  "bailian/qwen-turbo": {
    "context": 128000,
    "output": 16384
  },
  "bailian/qwen-vl-max": {
    "context": 131072,
    "output": 8192
  },
  "bailian/qwen3-coder-flash": {
    "context": 1000000,
    "output": 65536
  },
  "bailian/qwen3-coder-next": {
    "context": 262144,
    "output": 65536
  },
  "bailian/qwen3-coder-plus": {
    "context": 1048576,
    "output": 65536
  },
  "bailian/qwen3-max": {
    "context": 262144,
    "output": 65536
  },
  "bailian/qwen3.5-122b-a10b": {
    "context": 256000,
    "output": 64000
  },
  "bailian/qwen3.5-27b": {
    "context": 262144,
    "output": 65536
  },
  "bailian/qwen3.5-35b-a3b": {
    "context": 262144,
    "output": 65536
  },
  "bailian/qwen3.5-397b-a17b": {
    "context": 256000,
    "output": 64000
  },
  "bailian/qwen3.5-flash": {
    "context": 1000000,
    "output": 65536
  },
  "bailian/qwen3.5-plus": {
    "context": 1000000,
    "output": 65536
  },
  "bailian/qwen3.6-27b": {
    "context": 256000,
    "output": 64000
  },
  "bailian/qwen3.6-flash": {
    "context": 1000000,
    "output": 65536
  },
  "bailian/qwen3.6-max-preview": {
    "context": 262144,
    "output": 65536
  },
  "bailian/qwen3.6-plus": {
    "context": 1000000,
    "output": 65536
  },
  "bailian/qwen3.7-max": {
    "context": 1000000,
    "output": 131072
  },
  "bailian/qwen3.7-plus": {
    "context": 1000000,
    "output": 64000
  },
  "bailian/qwen3.8-27b": {
    "context": 1131072,
    "output": 131072
  },
  "bailian/qwen3.8-flash": {
    "context": 1000000,
    "output": 131072
  },
  "bailian/qwen3.8-max": {
    "context": 1000000,
    "output": 131072
  },
  "bailian/qwen3.8-max-0902": {
    "context": 1000000,
    "output": 131072
  },
  "baseten/Kimi-K2-Instruct-FP4": {
    "context": 131072,
    "output": 131072
  },
  "beam": {
    "context": 1048576,
    "output": 131072
  },
  "Beam-1.0-501B-A23B": {
    "context": 1048576,
    "output": 131072
  },
  "beam-free": {
    "context": 1048576,
    "output": 131072
  },
  "bee-brood": {
    "context": 262144,
    "output": 16384
  },
  "bee-buzz": {
    "context": 262144,
    "output": 24576
  },
  "bee-cell": {
    "context": 131072,
    "output": 8192
  },
  "bee-comb": {
    "context": 262144,
    "output": 16384
  },
  "bee-hive": {
    "context": 262144,
    "output": 32768
  },
  "bee-swarm": {
    "context": 1000000,
    "output": 64000
  },
  "bfl/flux-2-max": {
    "context": 67300,
    "output": 67300
  },
  "bfl/flux-2-pro": {
    "context": 67300,
    "output": 67300
  },
  "bfl/flux-kontext-max": {
    "context": 512
  },
  "bfl/flux-kontext-pro": {
    "context": 512
  },
  "bfl/flux-pro-1.0-fill": {
    "context": 512
  },
  "bfl/flux-pro-1.1": {
    "context": 512
  },
  "bfl/flux-pro-1.1-ultra": {
    "context": 512
  },
  "bge_multilingual_gemma2": {
    "context": 8000,
    "output": 3584
  },
  "bge-m3": {
    "context": 8192,
    "output": 1024
  },
  "bge-multilingual-gemma2": {
    "context": 8191
  },
  "bge-reranker-v2-m3": {
    "context": 8192,
    "output": 1
  },
  "big-pickle": {
    "context": 200000,
    "output": 32000
  },
  "brick-complexity-pro": {
    "context": 100000,
    "output": 15000
  },
  "brick-v1-beta": {
    "context": 100000,
    "output": 15000
  },
  "bytedance-pro-latest": {
    "context": 262144,
    "output": 131072
  },
  "bytedance-seed/seed-1.6": {
    "context": 262144,
    "output": 32768
  },
  "bytedance-seed/seed-1.6-flash": {
    "context": 262144,
    "output": 32768
  },
  "bytedance-seed/seed-2-1-turbo": {
    "context": 262144,
    "output": 235929
  },
  "bytedance-seed/seed-2.0-code": {
    "context": 262144,
    "output": 131072
  },
  "bytedance-seed/seed-2.0-lite": {
    "context": 262144,
    "output": 131072
  },
  "bytedance-seed/seed-2.0-mini": {
    "context": 262144,
    "output": 131072
  },
  "ByteDance-Seed/Seed-OSS-36B-Instruct": {
    "context": 262000,
    "output": 262000
  },
  "bytedance/deepseek-v3.2": {
    "context": 131072,
    "output": 32768
  },
  "bytedance/deepseek-v4-flash": {
    "context": 1048576,
    "output": 393216
  },
  "bytedance/deepseek-v4-pro": {
    "context": 1048576,
    "output": 393216
  },
  "bytedance/dola-seed-2.0-code": {
    "context": 256000,
    "output": 128000
  },
  "bytedance/dola-seed-2.0-code-preview": {
    "context": 131072,
    "output": 32768
  },
  "bytedance/dola-seed-2.0-lite": {
    "context": 256000,
    "output": 128000
  },
  "bytedance/dola-seed-2.0-mini": {
    "context": 256000,
    "output": 128000
  },
  "bytedance/dola-seed-2.0-pro": {
    "context": 256000,
    "output": 128000
  },
  "bytedance/doubao-seed-1.8": {
    "context": 256000,
    "output": 32000
  },
  "bytedance/doubao-seed-2.0-code": {
    "context": 256000,
    "output": 32000
  },
  "bytedance/doubao-seed-2.0-lite": {
    "context": 256000,
    "output": 32000
  },
  "bytedance/doubao-seed-2.0-mini": {
    "context": 256000,
    "output": 32000
  },
  "bytedance/doubao-seed-2.0-pro": {
    "context": 256000,
    "output": 32000
  },
  "bytedance/doubao-seed-2.1-pro": {
    "context": 256000,
    "output": 128000
  },
  "bytedance/doubao-seed-2.1-turbo": {
    "context": 256000,
    "output": 128000
  },
  "bytedance/doubao-seed-character": {
    "context": 128000,
    "output": 32768
  },
  "bytedance/doubao-seed-code": {
    "context": 256000,
    "output": 32000
  },
  "bytedance/glm-4.7": {
    "context": 200000,
    "output": 128000
  },
  "bytedance/glm-5.2": {
    "context": 1024000,
    "output": 128000
  },
  "bytedance/gpt-oss-120b": {
    "context": 128000,
    "output": 32000
  },
  "bytedance/seed-1-6-250615": {
    "context": 256000,
    "output": 256000
  },
  "bytedance/seed-1-6-250915": {
    "context": 256000,
    "output": 256000
  },
  "bytedance/seed-1-6-flash-250715": {
    "context": 256000,
    "output": 256000
  },
  "bytedance/seed-1-8-251228": {
    "context": 256000,
    "output": 256000
  },
  "bytedance/seed-1.6": {
    "context": 256000,
    "output": 32000
  },
  "bytedance/seed-1.8": {
    "context": 256000,
    "output": 32768
  },
  "bytedance/seed-2-0-code-preview-260328": {
    "context": 262144,
    "output": 131072
  },
  "bytedance/seed-2-0-lite-260428": {
    "context": 262144,
    "output": 131072
  },
  "bytedance/seed-2-0-mini-260428": {
    "context": 262144,
    "output": 131072
  },
  "bytedance/seed-2-0-pro-260328": {
    "context": 262144,
    "output": 131072
  },
  "ByteDance/Seed-2.0-code": {
    "context": 256000,
    "output": 131072
  },
  "ByteDance/Seed-2.0-mini": {
    "context": 256000,
    "output": 32000
  },
  "ByteDance/Seed-2.0-pro": {
    "context": 256000,
    "output": 128000
  },
  "bytedance/seed-2.1-turbo": {
    "context": 262144,
    "output": 262144
  },
  "bytedance/seedance-2": {
    "context": 4096
  },
  "bytedance/ui-tars-1.5-7b": {
    "context": 128000,
    "output": 2048
  },
  "c4ai-aya-expanse-32b": {
    "context": 128000,
    "output": 4000
  },
  "c4ai-aya-vision-32b": {
    "context": 16000,
    "output": 4000
  },
  "ca.amazon.nova-lite-v1:0": {
    "context": 300000,
    "output": 10000
  },
  "callstack/apex": {
    "context": 262144,
    "output": 131072
  },
  "canopylabs/orpheus-arabic-saudi": {
    "context": 4000,
    "output": 50000
  },
  "canopylabs/orpheus-v1-english": {
    "context": 4000,
    "output": 50000
  },
  "canopywave/deepseek-v4-flash": {
    "context": 1000000,
    "output": 393216
  },
  "canopywave/deepseek-v4-pro": {
    "context": 1000000,
    "output": 393216
  },
  "canopywave/glm-5.2": {
    "context": 200000,
    "output": 32768
  },
  "canopywave/kimi-k2.6": {
    "context": 262144,
    "output": 32768
  },
  "canopywave/kimi-k3": {
    "context": 1048576,
    "output": 1048576
  },
  "cat-jam-free": {
    "context": 1048576,
    "output": 131072
  },
  "celeris-1": {
    "context": 8192,
    "output": 8192
  },
  "cerebras/gpt-oss-120b": {
    "context": 131072
  },
  "cerebras/gpt-oss-120b-cs": {
    "context": 128000
  },
  "cerebras/llama-3.1-8b-cs": {
    "context": 128000
  },
  "cerebras/qwen-3.8-27b": {
    "context": 131072,
    "output": 40960
  },
  "chatgpt-4o-latest": {
    "context": 128000,
    "output": 16384
  },
  "clarifai/main/models/mm-poly-8b": {
    "context": 32768,
    "output": 4096
  },
  "claude-3-5-haiku": {
    "context": 200000,
    "output": 8192
  },
  "claude-3-7-sonnet-20250219": {
    "context": 200000,
    "output": 64000
  },
  "claude-3-haiku-20240307": {
    "context": 200000,
    "output": 4096
  },
  "claude-3.5-haiku": {
    "context": 200000,
    "output": 8192
  },
  "claude-3.5-sonnet": {
    "context": 200000,
    "output": 8192
  },
  "claude-3.5-sonnet-v2": {
    "context": 200000,
    "output": 8192
  },
  "claude-3.7-sonnet": {
    "context": 200000
  },
  "claude-4-5-sonnet": {
    "context": 200000,
    "output": 64000
  },
  "claude-4-6-sonnet": {
    "context": 1000000,
    "output": 128000
  },
  "claude-4.0-opus": {
    "context": 200000,
    "output": 32000
  },
  "claude-4.0-sonnet": {
    "context": 200000,
    "output": 64000
  },
  "claude-4.1-opus": {
    "context": 200000,
    "output": 32000
  },
  "claude-4.5-haiku": {
    "context": 200000
  },
  "claude-4.5-opus": {
    "context": 200000
  },
  "claude-4.5-sonnet": {
    "context": 200000,
    "output": 64000
  },
  "claude-fable-5": {
    "context": 1000000,
    "output": 128000
  },
  "claude-fable-5-1": {
    "context": 1000000,
    "output": 128000
  },
  "claude-fable-5-1@default": {
    "context": 1000000,
    "output": 128000
  },
  "claude-fable-5.1@eu": {
    "context": 1000000,
    "output": 128000
  },
  "claude-fable-5@default": {
    "context": 1000000,
    "output": 128000
  },
  "claude-fable-5@eu": {
    "context": 1000000,
    "output": 128000
  },
  "claude-haiku-4-5": {
    "context": 200000,
    "output": 64000
  },
  "claude-haiku-4-5-20251001": {
    "context": 200000,
    "output": 64000
  },
  "claude-haiku-4-5@20251001": {
    "context": 200000,
    "output": 64000
  },
  "claude-haiku-4-5@eu": {
    "context": 200000,
    "output": 64000
  },
  "claude-haiku-4.5": {
    "context": 200000,
    "output": 64000
  },
  "claude-haiku-5-5": {
    "context": 1000000,
    "output": 128000
  },
  "claude-haiku-5-5@default": {
    "context": 1000000,
    "output": 128000
  },
  "claude-haiku-5-5@eu": {
    "context": 1000000,
    "output": 128000
  },
  "claude-haiku-5.5": {
    "context": 1000000,
    "output": 128000
  },
  "claude-mythos-5": {
    "context": 1000000,
    "output": 128000
  },
  "claude-opus-4": {
    "context": 200000,
    "output": 32000
  },
  "claude-opus-4-1": {
    "context": 200000,
    "output": 32000
  },
  "claude-opus-4-1-20250805": {
    "context": 200000,
    "output": 32000
  },
  "claude-opus-4-1-20250805-thinking": {
    "context": 200000,
    "output": 32000
  },
  "claude-opus-4-1@20250805": {
    "context": 200000,
    "output": 32000
  },
  "claude-opus-4-20250514": {
    "context": 200000,
    "output": 32000
  },
  "claude-opus-4-5": {
    "context": 200000,
    "output": 64000
  },
  "claude-opus-4-5-20251101": {
    "context": 200000,
    "output": 64000
  },
  "claude-opus-4-5-think": {
    "context": 200000,
    "output": 64000
  },
  "claude-opus-4-5@20251101": {
    "context": 200000,
    "output": 64000
  },
  "claude-opus-4-5@eu": {
    "context": 200000,
    "output": 64000
  },
  "claude-opus-4-6": {
    "context": 1000000,
    "output": 128000
  },
  "claude-opus-4-6-think": {
    "context": 1000000,
    "output": 128000
  },
  "claude-opus-4-6@default": {
    "context": 1000000,
    "output": 128000
  },
  "claude-opus-4-6@eu": {
    "context": 1000000,
    "output": 128000
  },
  "claude-opus-4-7": {
    "context": 1000000,
    "output": 128000
  },
  "claude-opus-4-7-think": {
    "context": 1000000,
    "output": 128000
  },
  "claude-opus-4-7-thinking": {
    "context": 1000000,
    "output": 128000
  },
  "claude-opus-4-7@default": {
    "context": 1000000,
    "output": 128000
  },
  "claude-opus-4-7@eu": {
    "context": 1000000,
    "output": 128000
  },
  "claude-opus-4-8": {
    "context": 1000000,
    "output": 128000
  },
  "claude-opus-4-8-fast": {
    "context": 1000000,
    "output": 128000
  },
  "claude-opus-4-8-think": {
    "context": 1000000,
    "output": 128000
  },
  "claude-opus-4-8@default": {
    "context": 1000000,
    "output": 128000
  },
  "claude-opus-4-8@eu": {
    "context": 1000000,
    "output": 128000
  },
  "claude-opus-4.7": {
    "context": 200000,
    "output": 32000
  },
  "claude-opus-4@20250514": {
    "context": 200000,
    "output": 32000
  },
  "claude-opus-5": {
    "context": 1000000,
    "output": 128000
  },
  "claude-opus-5-5": {
    "context": 1000000,
    "output": 128000
  },
  "claude-opus-5-5-fast": {
    "context": 1000000,
    "output": 128000
  },
  "claude-opus-5-5@default": {
    "context": 1000000,
    "output": 128000
  },
  "claude-opus-5-5@eu": {
    "context": 1000000,
    "output": 128000
  },
  "claude-opus-5-fast": {
    "context": 1000000,
    "output": 128000
  },
  "claude-opus-5-thinking": {
    "context": 1000000,
    "output": 128000
  },
  "claude-opus-5.5": {
    "context": 1000000,
    "output": 128000
  },
  "claude-opus-5@default": {
    "context": 1000000,
    "output": 128000
  },
  "claude-opus-5@eu": {
    "context": 1000000,
    "output": 128000
  },
  "claude-opus-latest": {
    "context": 1000000,
    "output": 128000
  },
  "claude-opus4-5": {
    "context": 200000,
    "output": 64000
  },
  "claude-opus4-6": {
    "context": 1000000,
    "output": 128000
  },
  "claude-opus4-7": {
    "context": 1000000,
    "output": 128000
  },
  "claude-opus4-8": {
    "context": 1000000,
    "output": 128000
  },
  "claude-sonnet-4-20250514": {
    "context": 200000,
    "output": 64000
  },
  "claude-sonnet-4-5": {
    "context": 200000,
    "output": 64000
  },
  "claude-sonnet-4-5-20250929": {
    "context": 200000,
    "output": 64000
  },
  "claude-sonnet-4-5-20250929-thinking": {
    "context": 200000,
    "output": 64000
  },
  "claude-sonnet-4-5-think": {
    "context": 200000,
    "output": 64000
  },
  "claude-sonnet-4-5@20250929": {
    "context": 200000,
    "output": 64000
  },
  "claude-sonnet-4-5@eu": {
    "context": 1000000,
    "output": 64000
  },
  "claude-sonnet-4-6": {
    "context": 1000000,
    "output": 128000
  },
  "claude-sonnet-4-6-think": {
    "context": 1000000,
    "output": 64000
  },
  "claude-sonnet-4-6-thinking": {
    "context": 1000000,
    "output": 64000
  },
  "claude-sonnet-4-6@default": {
    "context": 1000000,
    "output": 128000
  },
  "claude-sonnet-4-6@eu": {
    "context": 1000000,
    "output": 64000
  },
  "claude-sonnet-4.6": {
    "context": 200000,
    "output": 32000
  },
  "claude-sonnet-4@20250514": {
    "context": 200000,
    "output": 64000
  },
  "claude-sonnet-4@eu": {
    "context": 1000000,
    "output": 64000
  },
  "claude-sonnet-5": {
    "context": 1000000,
    "output": 128000
  },
  "claude-sonnet-5-5": {
    "context": 1000000,
    "output": 128000
  },
  "claude-sonnet-5-5@default": {
    "context": 1000000,
    "output": 128000
  },
  "claude-sonnet-5-5@eu": {
    "context": 1000000,
    "output": 128000
  },
  "claude-sonnet-5.5": {
    "context": 1000000,
    "output": 128000
  },
  "claude-sonnet-5@default": {
    "context": 1000000,
    "output": 128000
  },
  "claude-sonnet-5@eu": {
    "context": 1000000,
    "output": 128000
  },
  "claudinio": {
    "context": 256000,
    "output": 64000
  },
  "claudius": {
    "context": 256000,
    "output": 64000
  },
  "claw-high": {
    "context": 1048576,
    "output": 131072
  },
  "claw-low": {
    "context": 1048576,
    "output": 131072
  },
  "claw-medium": {
    "context": 1048576,
    "output": 131072
  },
  "cline-pass/deepseek-v4-flash": {
    "context": 1000000,
    "output": 384000
  },
  "cline-pass/deepseek-v4-pro": {
    "context": 1000000,
    "output": 384000
  },
  "cline-pass/deepseek-v4.1-flash": {
    "context": 1000000,
    "output": 384000
  },
  "cline-pass/glm-5.2": {
    "context": 1000000,
    "output": 131072
  },
  "cline-pass/glm-5.3": {
    "context": 1000000,
    "output": 131072
  },
  "cline-pass/glm-5.3-flash": {
    "context": 1000000,
    "output": 131072
  },
  "cline-pass/kimi-k2.6": {
    "context": 262144,
    "output": 262144
  },
  "cline-pass/kimi-k2.7-code": {
    "context": 262144,
    "output": 262144
  },
  "cline-pass/kimi-k3": {
    "context": 1048576,
    "output": 131072
  },
  "cline-pass/mimo-v2.5": {
    "context": 1048576,
    "output": 131072
  },
  "cline-pass/mimo-v2.5-pro": {
    "context": 1048576,
    "output": 131072
  },
  "cline-pass/mimo-v2.6-flash": {
    "context": 1048576,
    "output": 131072
  },
  "cline-pass/mimo-v2.6-pro": {
    "context": 1048576,
    "output": 131072
  },
  "cline-pass/minimax-m3": {
    "context": 1048576,
    "output": 512000
  },
  "cline-pass/muse-spark-1.3-contributor": {
    "context": 1048576,
    "output": 131072
  },
  "cline-pass/qwen3.7-max": {
    "context": 1000000,
    "output": 131072
  },
  "cline-pass/qwen3.7-plus": {
    "context": 1000000,
    "output": 64000
  },
  "cline-pass/qwen3.8-max": {
    "context": 1000000,
    "output": 131072
  },
  "cloudflare/@cf/aisingapore/gemma-sea-lion-v4-27b-it": {
    "context": 128000,
    "output": 128000
  },
  "cloudflare/@cf/deepseek-ai/deepseek-v4-flash-0731": {
    "context": 1048576,
    "output": 384000
  },
  "cloudflare/@cf/deepseek-ai/deepseek-v4-pro-0813": {
    "context": 1048576,
    "output": 384000
  },
  "cloudflare/@cf/deepseek-ai/deepseek-v4.1-flash-1017": {
    "context": 1048576,
    "output": 384000
  },
  "cloudflare/@cf/meta/llama-3.2-1b-instruct": {
    "context": 60000,
    "output": 32000
  },
  "cloudflare/@cf/meta/llama-3.2-3b-instruct": {
    "context": 80000,
    "output": 131072
  },
  "cloudflare/@cf/meta/llama-guard-3-8b": {
    "context": 131072,
    "output": 4096
  },
  "cloudflare/@cf/mistralai/mistral-small-3.1-24b-instruct": {
    "context": 128000,
    "output": 102400
  },
  "cloudflare/@cf/openai/gpt-oss-120b": {
    "context": 128000,
    "output": 32768
  },
  "cloudflare/@cf/openai/gpt-oss-20b": {
    "context": 128000,
    "output": 32768
  },
  "cloudflare/@cf/qwen/qwen2.5-coder-32b-instruct": {
    "context": 32768,
    "output": 8192
  },
  "cloudflare/@cf/zai-org/glm-4.7-flash": {
    "context": 131072,
    "output": 131072
  },
  "cloudflare/deepseek-v4-flash": {
    "context": 1048576,
    "output": 393216
  },
  "cloudflare/deepseek-v4-pro": {
    "context": 1048576,
    "output": 393216
  },
  "cloudflare/deepseek-v4.1-flash-1017": {
    "context": 1048576,
    "output": 393216
  },
  "cloudflare/glm-5.3": {
    "context": 1048576,
    "output": 131072
  },
  "cloudflare/glm-5.3-flash": {
    "context": 1048576,
    "output": 131072
  },
  "code-max": {
    "context": 1000000,
    "output": 128000
  },
  "code-prime": {
    "context": 196608,
    "output": 131072
  },
  "code-standard": {
    "context": 128000,
    "output": 65536
  },
  "codestral-2": {
    "context": 128000,
    "output": 8192
  },
  "codestral-2501": {
    "context": 256000,
    "output": 256000
  },
  "codestral-2508": {
    "context": 256000
  },
  "codestral-latest": {
    "context": 256000,
    "output": 4096
  },
  "codex-mini": {
    "context": 200000,
    "output": 100000
  },
  "coding-glm-5.1": {
    "context": 200000,
    "output": 131072
  },
  "coding-glm-5.1-free": {
    "context": 200000,
    "output": 131072
  },
  "coding-glm-5.2-free": {
    "context": 1000000,
    "output": 131072
  },
  "coding-glm-5.3-flash-free": {
    "context": 1000000,
    "output": 131072
  },
  "coding-glm-5.3-free": {
    "context": 1000000,
    "output": 131072
  },
  "coding-minimax-m2.7": {
    "context": 204800,
    "output": 128100
  },
  "coding-minimax-m2.7-free": {
    "context": 204800,
    "output": 128100
  },
  "coding-minimax-m2.7-highspeed": {
    "context": 204800,
    "output": 128100
  },
  "coding-xiaomi-mimo-v2.5": {
    "context": 1048576,
    "output": 131072
  },
  "coding-xiaomi-mimo-v2.5-pro": {
    "context": 1048576,
    "output": 131072
  },
  "cognitivecomputations/dolphin-mistral-24b-venice-edition": {
    "context": 128000,
    "output": 8192
  },
  "cohere--command-a-reasoning": {
    "context": 256000,
    "output": 32000
  },
  "cohere-command-a": {
    "context": 131072,
    "output": 8192
  },
  "cohere-embed-v-4-0": {
    "context": 128000,
    "output": 1536
  },
  "cohere-embed-v3-english": {
    "context": 512,
    "output": 1024
  },
  "cohere-embed-v3-multilingual": {
    "context": 512,
    "output": 1024
  },
  "cohere/c4ai-aya-expanse-32b": {
    "context": 128000,
    "output": 4000
  },
  "cohere/command-a": {
    "context": 256000
  },
  "cohere/command-a-plus": {
    "context": 192000,
    "output": 64000
  },
  "cohere/command-r-08-2024": {
    "context": 128000,
    "output": 4000
  },
  "cohere/command-r-plus-08-2024": {
    "context": 128000
  },
  "cohere/embed-v4.0": {
    "context": 128000,
    "output": 1536
  },
  "cohere/embed-v5.0-fast": {
    "context": 128000,
    "output": 2048
  },
  "cohere/embed-v5.0-pro": {
    "context": 128000,
    "output": 2048
  },
  "cohere/north-mini-code:free": {
    "context": 256000,
    "output": 64000
  },
  "cohere/rerank-v3.5": {
    "context": 4096
  },
  "cohere/rerank-v4-fast": {
    "context": 32000
  },
  "cohere/rerank-v4-pro": {
    "context": 32000
  },
  "cohere/rerank-v5-fast": {
    "context": 32768
  },
  "cohere/rerank-v5-pro": {
    "context": 32768
  },
  "command-a-03-2025": {
    "context": 256000,
    "output": 8000
  },
  "command-a-plus-05-2026": {
    "context": 128000,
    "output": 64000
  },
  "command-a-reasoning-08-2025": {
    "context": 256000
  },
  "command-a-translate-08-2025": {
    "context": 8000,
    "output": 8000
  },
  "command-a-vision-07-2025": {
    "context": 128000,
    "output": 8000
  },
  "command-r-08-2024": {
    "context": 128000,
    "output": 4000
  },
  "command-r-plus-08-2024": {
    "context": 128000,
    "output": 4000
  },
  "command-r7b-12-2024": {
    "context": 128000,
    "output": 4000
  },
  "command-r7b-arabic-02-2025": {
    "context": 128000,
    "output": 4000
  },
  "consensusprotocol/deepseek-v4-flash": {
    "context": 1000000,
    "output": 384000
  },
  "consensusprotocol/deepseek-v4.1-flash": {
    "context": 1048576,
    "output": 384000
  },
  "consensusprotocol/gemma-4-31b-it": {
    "context": 262144,
    "output": 32768
  },
  "consensusprotocol/glm-5.3-flash": {
    "context": 1048576,
    "output": 131072
  },
  "consensusprotocol/gpt-oss-20b": {
    "context": 128000,
    "output": 32768
  },
  "consensusprotocol/mimo-v2.6-flash": {
    "context": 1048576,
    "output": 131072
  },
  "consensusprotocol/minimax-m3": {
    "context": 1048576,
    "output": 512000
  },
  "consensusprotocol/Qwen3.8-27B": {
    "context": 262000,
    "output": 32768
  },
  "cortecs/Llama-3.3-70B-Instruct-FP8-Dynamic": {
    "context": 128000,
    "output": 4096
  },
  "custom": {
    "context": 128000,
    "output": 16384
  },
  "databricks-claude-haiku-4-5": {
    "context": 200000,
    "output": 64000
  },
  "databricks-claude-opus-4-1": {
    "context": 200000,
    "output": 32000
  },
  "databricks-claude-opus-4-5": {
    "context": 200000,
    "output": 64000
  },
  "databricks-claude-opus-4-6": {
    "context": 1000000,
    "output": 128000
  },
  "databricks-claude-opus-4-7": {
    "context": 1000000,
    "output": 128000
  },
  "databricks-claude-sonnet-4": {
    "context": 200000,
    "output": 64000
  },
  "databricks-claude-sonnet-4-5": {
    "context": 200000,
    "output": 64000
  },
  "databricks-claude-sonnet-4-6": {
    "context": 1000000,
    "output": 64000
  },
  "databricks-gemini-2-5-flash": {
    "context": 1048576,
    "output": 65536
  },
  "databricks-gemini-2-5-pro": {
    "context": 1048576,
    "output": 65536
  },
  "databricks-gemini-3-1-flash-lite": {
    "context": 1048576,
    "output": 65536
  },
  "databricks-gemini-3-1-pro": {
    "context": 1048576,
    "output": 65536
  },
  "databricks-gemini-3-5-flash": {
    "context": 1048576,
    "output": 65536
  },
  "databricks-gemini-3-flash": {
    "context": 1048576,
    "output": 65536
  },
  "databricks-gemini-3-pro": {
    "context": 1048576,
    "output": 65536
  },
  "databricks-glm-5-2": {
    "context": 1000000,
    "output": 131072
  },
  "databricks-gpt-5": {
    "context": 400000,
    "output": 128000
  },
  "databricks-gpt-5-1": {
    "context": 400000,
    "output": 128000
  },
  "databricks-gpt-5-2": {
    "context": 400000,
    "output": 128000
  },
  "databricks-gpt-5-4": {
    "context": 1050000,
    "output": 128000
  },
  "databricks-gpt-5-4-mini": {
    "context": 400000,
    "output": 128000
  },
  "databricks-gpt-5-4-nano": {
    "context": 400000,
    "output": 128000
  },
  "databricks-gpt-5-5": {
    "context": 1050000,
    "output": 128000
  },
  "databricks-gpt-5-6-luna": {
    "context": 1050000,
    "output": 128000
  },
  "databricks-gpt-5-6-sol": {
    "context": 1050000,
    "output": 128000
  },
  "databricks-gpt-5-6-terra": {
    "context": 1050000,
    "output": 128000
  },
  "databricks-gpt-5-mini": {
    "context": 400000,
    "output": 128000
  },
  "databricks-gpt-5-nano": {
    "context": 400000,
    "output": 128000
  },
  "databricks-gpt-oss-120b": {
    "context": 131072,
    "output": 25000
  },
  "databricks-gpt-oss-20b": {
    "context": 131072,
    "output": 25000
  },
  "databricks-kimi-k2-7-code": {
    "context": 262144,
    "output": 262144
  },
  "databricks/databricks-deepseek-v4-flash-0731": {
    "context": 1000000,
    "output": 384000
  },
  "databricks/databricks-deepseek-v4-pro-0813": {
    "context": 1000000,
    "output": 384000
  },
  "databricks/databricks-gpt-oss-120b": {
    "context": 131072,
    "output": 32768
  },
  "databricks/databricks-gpt-oss-120b@eu": {
    "context": 131072,
    "output": 32768
  },
  "databricks/databricks-gpt-oss-20b": {
    "context": 131072,
    "output": 32768
  },
  "databricks/databricks-gpt-oss-20b@eu": {
    "context": 131072,
    "output": 32768
  },
  "databricks/databricks-inkling": {
    "context": 1000000,
    "output": 1048576
  },
  "databricks/databricks-qwen3-next-80b-a3b-instruct": {
    "context": 262144,
    "output": 32768
  },
  "databricks/databricks-qwen3-next-80b-a3b-instruct@eu": {
    "context": 262144,
    "output": 32768
  },
  "deep-deepseek-v4-flash": {
    "context": 1000000,
    "output": 384000
  },
  "deep-deepseek-v4-pro": {
    "context": 1000000,
    "output": 384000
  },
  "deep-research-max-preview-04-2026": {
    "context": 131072,
    "output": 65536
  },
  "deep-research-preview-04-2026": {
    "context": 131072,
    "output": 65536
  },
  "deepcogito/cogito-v1-preview-qwen-32B": {
    "context": 128000,
    "output": 32768
  },
  "deepinfra/ByteDance/Seed-2.0-code": {
    "context": 256000,
    "output": 131072
  },
  "deepinfra/ByteDance/Seed-2.0-mini": {
    "context": 256000,
    "output": 32000
  },
  "deepinfra/deepseek-ai/DeepSeek-R1": {
    "context": 163840,
    "output": 32768
  },
  "deepinfra/deepseek-ai/DeepSeek-R1-0528": {
    "context": 163840,
    "output": 32768
  },
  "deepinfra/deepseek-ai/DeepSeek-V3": {
    "context": 163840,
    "output": 8192
  },
  "deepinfra/deepseek-ai/DeepSeek-V3-0324": {
    "context": 163840,
    "output": 163840
  },
  "deepinfra/deepseek-ai/DeepSeek-V4-Flash-0731": {
    "context": 1048576,
    "output": 384000
  },
  "deepinfra/deepseek-ai/DeepSeek-V4-Pro-0813": {
    "context": 1048576,
    "output": 384000
  },
  "deepinfra/deepseek-ai/DeepSeek-V4.1-Flash": {
    "context": 1048576,
    "output": 384000
  },
  "deepinfra/deepseek-ai/DeepSeek-V4.1-Flash-1017": {
    "context": 1048576,
    "output": 384000
  },
  "deepinfra/deepseek-v3.2": {
    "context": 160000,
    "output": 65536
  },
  "deepinfra/deepseek-v4-flash": {
    "context": 1000000,
    "output": 393216
  },
  "deepinfra/deepseek-v4-pro": {
    "context": 1048576,
    "output": 64000
  },
  "deepinfra/deepseek-v4.1-flash": {
    "context": 1048576,
    "output": 393216
  },
  "deepinfra/deepseek-v4.1-flash-1017": {
    "context": 1048576,
    "output": 393216
  },
  "deepinfra/gemma-4-26b-a4b-it": {
    "context": 262144,
    "output": 32768
  },
  "deepinfra/gemma-4-31b-it": {
    "context": 262144,
    "output": 32768
  },
  "deepinfra/google/gemma-3-12b-it": {
    "context": 131072,
    "output": 131072
  },
  "deepinfra/google/gemma-3-27b-it": {
    "context": 131072,
    "output": 131072
  },
  "deepinfra/google/gemma-3-4b-it": {
    "context": 131072,
    "output": 131072
  },
  "deepinfra/granite-4.2-8b": {
    "context": 131072,
    "output": 117964
  },
  "deepinfra/Gryphe/MythoMax-L2-13b": {
    "context": 4096,
    "output": 3200
  },
  "deepinfra/ibm-granite/granite-4.2-8b": {
    "context": 131072,
    "output": 117964
  },
  "deepinfra/ling-3.0-flash": {
    "context": 262144,
    "output": 32768
  },
  "deepinfra/ling-3.0-flash-vl": {
    "context": 131072,
    "output": 32768
  },
  "deepinfra/meta-llama/Llama-3.2-11B-Vision-Instruct": {
    "context": 131072,
    "output": 4096
  },
  "deepinfra/meta-llama/Llama-3.2-3B-Instruct": {
    "context": 131072,
    "output": 131072
  },
  "deepinfra/meta-llama/Llama-3.3-70B-Instruct": {
    "context": 131072,
    "output": 4096
  },
  "deepinfra/meta-llama/Llama-Guard-3-8B": {
    "context": 131072,
    "output": 4096
  },
  "deepinfra/meta-llama/Llama-Guard-4-12B": {
    "context": 163840,
    "output": 163840
  },
  "deepinfra/meta-models/Muse-Glimmer-30B": {
    "context": 131072,
    "output": 131072
  },
  "deepinfra/microsoft/WizardLM-2-8x22B": {
    "context": 65536,
    "output": 8000
  },
  "deepinfra/mimo-v2.6-flash": {
    "context": 1048576,
    "output": 65536
  },
  "deepinfra/mimo-v2.6-pro": {
    "context": 1048576,
    "output": 65536
  },
  "deepinfra/mistralai/Mistral-Small-24B-Instruct-2501": {
    "context": 32768,
    "output": 16384
  },
  "deepinfra/mistralai/Mixtral-8x7B-Instruct-v0.1": {
    "context": 32768,
    "output": 32768
  },
  "deepinfra/moonshotai/Kimi-K2-Instruct": {
    "context": 131072,
    "output": 32768
  },
  "deepinfra/moonshotai/Kimi-K2.5": {
    "context": 262144,
    "output": 262144
  },
  "deepinfra/muse-glimmer-30b": {
    "context": 131072,
    "output": 16384
  },
  "deepinfra/nemotron-3-super-120b-a12b": {
    "context": 262144,
    "output": 262144
  },
  "deepinfra/nemotron-3-ultra-550b": {
    "context": 262144,
    "output": 262144
  },
  "deepinfra/nemotron-3-ultra-550b-a55b": {
    "context": 262144,
    "output": 128000
  },
  "deepinfra/NousResearch/Hermes-3-Llama-3.1-405B": {
    "context": 131072,
    "output": 16384
  },
  "deepinfra/NousResearch/Hermes-3-Llama-3.1-70B": {
    "context": 131072,
    "output": 16384
  },
  "deepinfra/nvidia/Llama-3.1-Nemotron-70B-Instruct": {
    "context": 131072,
    "output": 8192
  },
  "deepinfra/nvidia/Nemotron-3-Nano-30B-A3B": {
    "context": 262144,
    "output": 262144
  },
  "deepinfra/openai/gpt-oss-120b": {
    "context": 131072,
    "output": 32768
  },
  "deepinfra/openai/gpt-oss-20b": {
    "context": 131072,
    "output": 32768
  },
  "deepinfra/Qwen/Qwen2.5-7B-Instruct": {
    "context": 32768,
    "output": 8192
  },
  "deepinfra/Qwen/Qwen3-235B-A22B-Instruct-2507": {
    "context": 262144,
    "output": 16384
  },
  "deepinfra/Qwen/Qwen3-235B-A22B-Thinking-2507": {
    "context": 262144,
    "output": 81920
  },
  "deepinfra/Qwen/Qwen3-Coder-480B-A35B-Instruct": {
    "context": 262144,
    "output": 65536
  },
  "deepinfra/Qwen/Qwen3-Max": {
    "context": 256000,
    "output": 65536
  },
  "deepinfra/Qwen/Qwen3-Next-80B-A3B-Instruct": {
    "context": 262144,
    "output": 32768
  },
  "deepinfra/Qwen/Qwen3-VL-235B-A22B-Instruct": {
    "context": 262144,
    "output": 32768
  },
  "deepinfra/Qwen/Qwen3-VL-30B-A3B-Instruct": {
    "context": 262144,
    "output": 32768
  },
  "deepinfra/qwen3-vl-235b-a22b-instruct": {
    "context": 262144,
    "output": 32768
  },
  "deepinfra/qwen3-vl-30b-a3b-instruct": {
    "context": 262144,
    "output": 32768
  },
  "deepinfra/qwen3.5-9b": {
    "context": 262144,
    "output": 32768
  },
  "deepinfra/stepfun-ai/Step-3.5-Flash": {
    "context": 262144,
    "output": 256000
  },
  "deepinfra/stepfun-ai/Step-3.7-Flash": {
    "context": 262144,
    "output": 256000
  },
  "deepinfra/stepfun-ai/Step-5-Preview": {
    "context": 1048576,
    "output": 1000000
  },
  "deepinfra/tencent/Hy3": {
    "context": 262144,
    "output": 128000
  },
  "deepinfra/tencent/Hy4-preview": {
    "context": 1048576,
    "output": 64000
  },
  "deepinfra/thinkingmachines/Inkling": {
    "context": 524288,
    "output": 1048576
  },
  "deepinfra/thinkingmachines/Inkling-Small": {
    "context": 524288,
    "output": 1048576
  },
  "deepinfra/zai-org/GLM-4.7-Flash": {
    "context": 202752,
    "output": 131072
  },
  "deepseek-3.2": {
    "context": 163840,
    "output": 163840
  },
  "deepseek-4-flash": {
    "context": 1048576,
    "output": 384000
  },
  "deepseek-ai/DeepSeek-OCR": {
    "context": 8192,
    "output": 8192
  },
  "deepseek-ai/deepseek-ocr/models/DeepSeek-OCR": {
    "context": 8192,
    "output": 8192
  },
  "deepseek-ai/DeepSeek-V3-1": {
    "context": 131072,
    "output": 131072
  },
  "deepseek-ai/deepseek-v3.1-maas": {
    "context": 163840,
    "output": 32768
  },
  "deepseek-ai/DeepSeek-V3.1-Terminus:thinking": {
    "context": 128000,
    "output": 65536
  },
  "deepseek-ai/DeepSeek-V3.1:thinking": {
    "context": 128000,
    "output": 65536
  },
  "deepseek-ai/deepseek-v3.2-exp": {
    "context": 163840,
    "output": 65536
  },
  "deepseek-ai/DeepSeek-V3.2-Exp": {
    "context": 164000,
    "output": 164000
  },
  "deepseek-ai/deepseek-v3.2-exp-thinking": {
    "context": 163840,
    "output": 65536
  },
  "deepseek-ai/deepseek-v3.2-maas": {
    "context": 163840,
    "output": 65536
  },
  "deepseek-ai/DeepSeek-V3.2-TEE": {
    "context": 131072,
    "output": 65536
  },
  "deepseek-ai/deepseek-v4-flash": {
    "context": 1048576,
    "output": 943718
  },
  "deepseek-ai/deepseek-v4-flash-0731": {
    "context": 1000000,
    "output": 384000
  },
  "deepseek-ai/DeepSeek-V4-Flash-0731-TEE": {
    "context": 1048576,
    "output": 131072
  },
  "deepseek-ai/deepseek-v4-pro": {
    "context": 1048576,
    "output": 384000
  },
  "deepseek-ai/deepseek-v4.1-flash-1017": {
    "context": 1048576
  },
  "deepseek-ai/DeepSeek-V4.1-Flash-1017-abliterated": {
    "context": 1048576,
    "output": 384000
  },
  "deepseek-ai/DeepSeek-V4.1-Flash-1017-Fast": {
    "context": 1048576,
    "output": 262144
  },
  "deepseek-ai/DeepSeek-V4.1-Flash-1017:peft:262144": {
    "context": 262144,
    "output": 262144
  },
  "deepseek-ai/DeepSeek-V4.1-Flash-Fast": {
    "context": 1048576,
    "output": 32768
  },
  "deepseek-ai/DeepSeek-V4.1-Flash:peft:262144": {
    "context": 262144,
    "output": 262144
  },
  "deepseek-chat": {
    "context": 128000,
    "output": 8192
  },
  "deepseek-chat-cheaper": {
    "context": 128000,
    "output": 8192
  },
  "deepseek-flash": {
    "context": 1048576,
    "output": 393216
  },
  "deepseek-pro-latest": {
    "context": 1000000,
    "output": 384000
  },
  "deepseek-r1-distill-llama-8b": {
    "context": 32768,
    "output": 16384
  },
  "deepseek-r1-distill-qwen-1-5b": {
    "context": 32768,
    "output": 16384
  },
  "deepseek-r1-distill-qwen-14b": {
    "context": 32768,
    "output": 16384
  },
  "deepseek-r1-distill-qwen-32b": {
    "context": 32768,
    "output": 16384
  },
  "deepseek-r1-distill-qwen-7b": {
    "context": 32768,
    "output": 16384
  },
  "deepseek-reasoner": {
    "context": 128000,
    "output": 64000
  },
  "deepseek-tng-r1t2-chimera": {
    "context": 130000,
    "output": 163840
  },
  "deepseek-v3-0324": {
    "context": 128000,
    "output": 8192
  },
  "deepseek-v3-1": {
    "context": 131072,
    "output": 65536
  },
  "deepseek-v3-2-exp": {
    "context": 131072,
    "output": 65536
  },
  "deepseek-v3.1": {
    "context": 128000,
    "output": 32000
  },
  "DeepSeek-V3.1": {
    "context": 131072,
    "output": 7168
  },
  "deepseek-v3.1-terminus": {
    "context": 128000,
    "output": 16384
  },
  "DeepSeek-V3.2": {
    "context": 32768,
    "output": 7168
  },
  "deepseek-v3.2-speciale": {
    "context": 128000,
    "output": 128000
  },
  "deepseek-v3.2-thinking": {
    "context": 128000,
    "output": 128000
  },
  "deepseek-v4-1-flash-1017-uncensored": {
    "context": 1000000,
    "output": 131072
  },
  "deepseek-v4-1-flash-uncensored": {
    "context": 1000000,
    "output": 131072
  },
  "deepseek-v4-flash": {
    "context": 1048576,
    "output": 393216
  },
  "DeepSeek-V4-Flash-0731": {
    "context": 1000000,
    "output": 384000
  },
  "deepseek-v4-flash-0731-fast": {
    "context": 1000000
  },
  "deepseek-v4-flash-0731@eu": {
    "context": 1048576,
    "output": 131072
  },
  "deepseek-v4-flash-flex": {
    "context": 1048560,
    "output": 393216
  },
  "deepseek-v4-flash-free": {
    "context": 200000,
    "output": 128000
  },
  "deepseek-v4-flash-ga-260731": {
    "context": 1000000,
    "output": 384000
  },
  "deepseek-v4-flash-speed": {
    "context": 1048560,
    "output": 393216
  },
  "deepseek-v4-flash-vision-exp": {
    "context": 1048576,
    "output": 393216
  },
  "DeepSeek-V4-Flash-Vision-Exp": {
    "context": 1000000,
    "output": 384000
  },
  "deepseek-v4-flash:free": {
    "context": 1000000,
    "output": 384000
  },
  "deepseek-v4-pro": {
    "context": 1048576,
    "output": 393216
  },
  "DeepSeek-V4-Pro-0813": {
    "context": 1000000,
    "output": 384000
  },
  "deepseek-v4-pro-0813@eu": {
    "context": 1048576,
    "output": 65536
  },
  "deepseek-v4-pro-ga-260813": {
    "context": 1000000,
    "output": 384000
  },
  "deepseek-v4-pro:0813": {
    "context": 1048576,
    "output": 1048576
  },
  "deepseek-v4-pro:free": {
    "context": 1000000,
    "output": 384000
  },
  "deepseek-v4-pro@eu": {
    "context": 1048576,
    "output": 1048576
  },
  "deepseek-v4.1-flash-1017@eu": {
    "context": 1048576,
    "output": 393216
  },
  "deepseek-v4.1-flash-552b": {
    "context": 1048576,
    "output": 81920
  },
  "deepseek-v4.1-flash-cyber": {
    "context": 1040000,
    "output": 1040000
  },
  "deepseek-v4.1-flash-fast": {
    "context": 1048576,
    "output": 393216
  },
  "deepseek-v4.1-flash-flex": {
    "context": 1048560,
    "output": 393216
  },
  "deepseek-v4.1-flash-free": {
    "context": 200000,
    "output": 32000
  },
  "deepseek-v4.1-flash:1017": {
    "context": 1048576,
    "output": 384000
  },
  "deepseek-v4.1-flash:fast": {
    "context": 1000000,
    "output": 384000
  },
  "deepseek-v4.1-flash@eu": {
    "context": 1048576,
    "output": 393216
  },
  "deepseek.r1-v1:0": {
    "context": 128000,
    "output": 32768
  },
  "deepseek.v3-v1:0": {
    "context": 163840,
    "output": 81920
  },
  "deepseek.v3.2": {
    "context": 163840,
    "output": 81920
  },
  "deepseek/deepseek_v3": {
    "context": 64000,
    "output": 16000
  },
  "deepseek/deepseek-chat-v3.1": {
    "context": 163840,
    "output": 147456
  },
  "deepseek/deepseek-flash": {
    "context": 1000000,
    "output": 384000
  },
  "deepseek/deepseek-latest": {
    "context": 1048576,
    "output": 384000
  },
  "deepseek/deepseek-math-v2": {
    "context": 160000,
    "output": 160000
  },
  "deepseek/deepseek-ocr-2": {
    "context": 8192,
    "output": 8192
  },
  "deepseek/deepseek-r1-0528-qwen3-8b": {
    "context": 128000,
    "output": 32000
  },
  "deepseek/deepseek-r1-turbo": {
    "context": 64000,
    "output": 16000
  },
  "deepseek/deepseek-reasoner": {
    "context": 1000000,
    "output": 384000
  },
  "deepseek/deepseek-v3": {
    "context": 163840,
    "output": 81920
  },
  "deepseek/deepseek-v3-0324": {
    "context": 163840,
    "output": 163840
  },
  "deepseek/deepseek-v3.1-terminus-thinking": {
    "context": 128000,
    "output": 32000
  },
  "deepseek/deepseek-v3.2-251201": {
    "context": 128000,
    "output": 32000
  },
  "deepseek/deepseek-v3.2-exp-thinking": {
    "context": 128000,
    "output": 32000
  },
  "deepseek/deepseek-v3.2-thinking": {
    "context": 128000,
    "output": 8000
  },
  "deepseek/deepseek-v3.2:thinking": {
    "context": 163000,
    "output": 65536
  },
  "deepseek/deepseek-v4-flash-0423:thinking": {
    "context": 1048576,
    "output": 384000
  },
  "deepseek/deepseek-v4-flash-0731-fast": {
    "context": 1000000,
    "output": 384000
  },
  "deepseek/deepseek-v4-flash-0731:thinking": {
    "context": 1048576,
    "output": 131072
  },
  "deepseek/deepseek-v4-flash-fast": {
    "context": 1000000,
    "output": 384000
  },
  "deepseek/deepseek-v4-flash-free": {
    "context": 1000000,
    "output": 384000
  },
  "deepseek/deepseek-v4-flash-latest": {
    "context": 1048576
  },
  "deepseek/deepseek-v4-flash:thinking": {
    "context": 1048576,
    "output": 384000
  },
  "deepseek/deepseek-v4-pro-0423": {
    "context": 1000000
  },
  "deepseek/deepseek-v4-pro-0813:thinking": {
    "context": 1048576,
    "output": 384000
  },
  "deepseek/deepseek-v4-pro:thinking": {
    "context": 1048576,
    "output": 384000
  },
  "deepseek/deepseek-v4.1-flash-0910-uncensored": {
    "context": 524288,
    "output": 32768
  },
  "deepseek/deepseek-v4.1-flash-0910-uncensored:thinking": {
    "context": 524288,
    "output": 32768
  },
  "deepseek/deepseek-v4.1-flash-1017-fast": {
    "context": 1048576,
    "output": 262144
  },
  "deepseek/deepseek-v4.1-flash-1017-uncensored": {
    "context": 1048576,
    "output": 393216
  },
  "deepseek/deepseek-v4.1-flash-1017-uncensored:thinking": {
    "context": 1048576,
    "output": 393216
  },
  "deepseek/deepseek-v4.1-flash-1017:thinking": {
    "context": 1048576,
    "output": 393216
  },
  "deepseek/deepseek-v4.1-flash-uncensored": {
    "context": 1048576,
    "output": 393216
  },
  "deepseek/deepseek-v4.1-flash-uncensored:thinking": {
    "context": 1048576,
    "output": 393216
  },
  "deepseek/deepseek-v4.1-flash:thinking": {
    "context": 1000000,
    "output": 384000
  },
  "devstral-2-123b-instruct-2512": {
    "context": 200000,
    "output": 16384
  },
  "Devstral-2-123B-Instruct-2512-int4-AutoRound": {
    "context": 128000,
    "output": 128000
  },
  "devstral-latest@eu": {
    "context": 256000,
    "output": 256000
  },
  "devstral-medium-latest": {
    "context": 262144,
    "output": 262144
  },
  "Doctor-Shotgun/MS3.2-24B-Magnum-Diamond": {
    "context": 32768,
    "output": 32768
  },
  "dots-studio/dots-3-note-preview:free": {
    "context": 512000,
    "output": 460800
  },
  "doubao-1.5-pro-32k": {
    "context": 128000,
    "output": 12000
  },
  "doubao-1.5-thinking-pro": {
    "context": 128000,
    "output": 16000
  },
  "doubao-1.5-vision-pro": {
    "context": 128000,
    "output": 16000
  },
  "doubao-seed-1-6-251015": {
    "context": 256000,
    "output": 64000
  },
  "doubao-seed-1-6-flash-250828": {
    "context": 256000,
    "output": 32000
  },
  "doubao-seed-1-6-thinking-250715": {
    "context": 256000,
    "output": 16000
  },
  "doubao-seed-1-6-vision-250815": {
    "context": 256000,
    "output": 32000
  },
  "doubao-seed-1-8-251215": {
    "context": 224000,
    "output": 64000
  },
  "doubao-seed-1-8-251228": {
    "context": 256000,
    "output": 64000
  },
  "doubao-seed-1.6": {
    "context": 256000,
    "output": 32000
  },
  "doubao-seed-1.6-flash": {
    "context": 256000,
    "output": 32000
  },
  "doubao-seed-1.6-thinking": {
    "context": 256000,
    "output": 32000
  },
  "doubao-seed-2-0-code-preview": {
    "context": 256000,
    "output": 128000
  },
  "doubao-seed-2-0-lite-260215": {
    "context": 256000,
    "output": 32000
  },
  "doubao-seed-2-0-lite-260428": {
    "context": 256000
  },
  "doubao-seed-2-0-mini-260215": {
    "context": 256000,
    "output": 32000
  },
  "doubao-seed-2-0-mini-260428": {
    "context": 256000
  },
  "doubao-seed-2-0-pro": {
    "context": 256000,
    "output": 128000
  },
  "doubao-seed-2-0-pro-260215": {
    "context": 256000,
    "output": 128000
  },
  "doubao-seed-2-1-pro-260628": {
    "context": 256000,
    "output": 256000
  },
  "doubao-seed-2-1-turbo-260628": {
    "context": 256000,
    "output": 256000
  },
  "doubao-seed-2.0-code": {
    "context": 256000,
    "output": 128000
  },
  "doubao-seed-2.0-lite": {
    "context": 256000,
    "output": 32000
  },
  "doubao-seed-2.0-mini": {
    "context": 256000,
    "output": 32000
  },
  "doubao-seed-2.0-pro": {
    "context": 256000,
    "output": 128000
  },
  "doubao-seed-2.1-turbo": {
    "context": 256000,
    "output": 256000
  },
  "doubao-seed-character-260628": {
    "context": 256000,
    "output": 256000
  },
  "doubao-seed-evolving": {
    "context": 256000,
    "output": 256000
  },
  "dsv4": {
    "context": 1048576,
    "output": 384000
  },
  "duo-chat-fable-5": {
    "context": 1000000,
    "output": 128000
  },
  "duo-chat-fable-5-1": {
    "context": 1000000,
    "output": 128000
  },
  "duo-chat-gpt-5-1": {
    "context": 400000,
    "output": 128000
  },
  "duo-chat-gpt-5-2": {
    "context": 400000,
    "output": 128000
  },
  "duo-chat-gpt-5-2-codex": {
    "context": 400000,
    "output": 128000
  },
  "duo-chat-gpt-5-3-codex": {
    "context": 400000,
    "output": 128000
  },
  "duo-chat-gpt-5-4": {
    "context": 1050000,
    "output": 128000
  },
  "duo-chat-gpt-5-4-mini": {
    "context": 400000,
    "output": 128000
  },
  "duo-chat-gpt-5-4-nano": {
    "context": 400000,
    "output": 128000
  },
  "duo-chat-gpt-5-5": {
    "context": 1050000,
    "output": 128000
  },
  "duo-chat-gpt-5-6-luna": {
    "context": 1050000,
    "output": 128000
  },
  "duo-chat-gpt-5-6-sol": {
    "context": 1050000,
    "output": 128000
  },
  "duo-chat-gpt-5-6-terra": {
    "context": 1050000,
    "output": 128000
  },
  "duo-chat-gpt-5-codex": {
    "context": 400000,
    "output": 128000
  },
  "duo-chat-gpt-5-mini": {
    "context": 400000,
    "output": 128000
  },
  "duo-chat-gpt-6-1-sol": {
    "context": 1050000,
    "output": 128000
  },
  "duo-chat-gpt-6-astra": {
    "context": 1050000,
    "output": 128000
  },
  "duo-chat-gpt-6-luna": {
    "context": 1050000,
    "output": 128000
  },
  "duo-chat-gpt-6-sol": {
    "context": 1050000,
    "output": 128000
  },
  "duo-chat-haiku-4-5": {
    "context": 200000,
    "output": 64000
  },
  "duo-chat-haiku-5-5": {
    "context": 1000000,
    "output": 128000
  },
  "duo-chat-opus-4-5": {
    "context": 200000,
    "output": 64000
  },
  "duo-chat-opus-4-6": {
    "context": 1000000,
    "output": 128000
  },
  "duo-chat-opus-4-7": {
    "context": 1000000,
    "output": 128000
  },
  "duo-chat-opus-4-8": {
    "context": 1000000,
    "output": 128000
  },
  "duo-chat-opus-5": {
    "context": 1000000,
    "output": 128000
  },
  "duo-chat-opus-5-5": {
    "context": 1000000,
    "output": 128000
  },
  "duo-chat-sonnet-4-5": {
    "context": 200000,
    "output": 64000
  },
  "duo-chat-sonnet-4-6": {
    "context": 1000000,
    "output": 64000
  },
  "duo-chat-sonnet-5": {
    "context": 1000000,
    "output": 64000
  },
  "duo-chat-sonnet-5-5": {
    "context": 1000000,
    "output": 64000
  },
  "e5-large-v2": {
    "context": 512,
    "output": 1024
  },
  "echo": {
    "context": 262144,
    "output": 65536
  },
  "elevenlabs/elevenlabs-music": {
    "context": 2000
  },
  "elevenlabs/elevenlabs-v2.5-turbo": {
    "context": 128000
  },
  "elevenlabs/elevenlabs-v3": {
    "context": 128000
  },
  "empiriolabs/deepseek-v4-flash-el": {
    "context": 1000000,
    "output": 384000
  },
  "empiriolabs/deepseek-v4-pro-el": {
    "context": 1000000,
    "output": 384000
  },
  "entrim/deepseek-v4.1-flash-1017": {
    "context": 1048576,
    "output": 384000
  },
  "entrim/glm-5.3": {
    "context": 1048576,
    "output": 131072
  },
  "entrim/glm-5.3-flash": {
    "context": 1048576,
    "output": 131072
  },
  "Envoid/Llama-3.05-Nemotron-Tenyxchat-Storybreaker-70B": {
    "context": 16384,
    "output": 8192
  },
  "Envoid/Llama-3.05-NT-Storybreaker-Ministral-70B": {
    "context": 16384,
    "output": 8192
  },
  "ernie-4.5-21b-a3b-thinking": {
    "context": 128000,
    "output": 8000
  },
  "ernie-5.0-thinking-preview": {
    "context": 128000,
    "output": 16384
  },
  "ernie-5.1": {
    "context": 119000,
    "output": 64000
  },
  "ernie-5.1:thinking": {
    "context": 119000,
    "output": 64000
  },
  "essentialai/Rnj-1-Instruct": {
    "context": 32768,
    "output": 32768
  },
  "eu.amazon.nova-2-lite-v1:0": {
    "context": 1000000,
    "output": 65535
  },
  "eu.amazon.nova-lite-v1:0": {
    "context": 300000,
    "output": 10000
  },
  "eu.amazon.nova-micro-v1:0": {
    "context": 128000,
    "output": 10000
  },
  "eu.amazon.nova-pro-v1:0": {
    "context": 300000,
    "output": 10000
  },
  "eu.anthropic.claude-fable-5": {
    "context": 1000000,
    "output": 128000
  },
  "eu.anthropic.claude-haiku-4-5-20251001-v1:0": {
    "context": 200000,
    "output": 64000
  },
  "eu.anthropic.claude-haiku-5-5": {
    "context": 1000000,
    "output": 128000
  },
  "eu.anthropic.claude-opus-4-5-20251101-v1:0": {
    "context": 200000,
    "output": 64000
  },
  "eu.anthropic.claude-opus-4-6-v1": {
    "context": 1000000,
    "output": 128000
  },
  "eu.anthropic.claude-opus-4-7": {
    "context": 1000000,
    "output": 128000
  },
  "eu.anthropic.claude-opus-4-8": {
    "context": 1000000,
    "output": 128000
  },
  "eu.anthropic.claude-opus-5": {
    "context": 1000000,
    "output": 128000
  },
  "eu.anthropic.claude-opus-5-5": {
    "context": 1000000,
    "output": 128000
  },
  "eu.anthropic.claude-sonnet-4-20250514-v1:0": {
    "context": 200000,
    "output": 64000
  },
  "eu.anthropic.claude-sonnet-4-5-20250929-v1:0": {
    "context": 200000,
    "output": 64000
  },
  "eu.anthropic.claude-sonnet-4-6": {
    "context": 1000000,
    "output": 128000
  },
  "eu.anthropic.claude-sonnet-5": {
    "context": 1000000,
    "output": 128000
  },
  "eu.anthropic.claude-sonnet-5-5": {
    "context": 1000000,
    "output": 128000
  },
  "eu.mistral.pixtral-large-2502-v1:0": {
    "context": 128000,
    "output": 8192
  },
  "EVA-UNIT-01/EVA-LLaMA-3.33-70B-v0.0": {
    "context": 32768,
    "output": 16384
  },
  "EVA-UNIT-01/EVA-LLaMA-3.33-70B-v0.1": {
    "context": 32768,
    "output": 16384
  },
  "EVA-UNIT-01/EVA-Qwen2.5-32B-v0.2": {
    "context": 16384,
    "output": 8192
  },
  "EVA-UNIT-01/EVA-Qwen2.5-72B-v0.2": {
    "context": 16384,
    "output": 8192
  },
  "evroc/roc": {
    "context": 262144,
    "output": 262144
  },
  "exo-free": {
    "context": 1048576,
    "output": 131072
  },
  "failspy/Meta-Llama-3-70B-Instruct-abliterated-v3.5": {
    "context": 8192,
    "output": 8192
  },
  "faster-whisper-large-v3": {
    "context": 448,
    "output": 4096
  },
  "fastgpt": {
    "context": 32768,
    "output": 32768
  },
  "fastino/gliguard-LLMGuardrails-300M": {
    "context": 8192,
    "output": 8192
  },
  "fastino/gliguard-PII-multi": {
    "context": 8192,
    "output": 8192
  },
  "fastino/GLiNER-2.5-Decide": {
    "context": 8192,
    "output": 8192
  },
  "fastino/gliner2-base-v1": {
    "context": 2048,
    "output": 2048
  },
  "fastino/gliner2-large-v1": {
    "context": 8192,
    "output": 8192
  },
  "fastino/gliner2-multi-large-v1": {
    "context": 8192,
    "output": 8192
  },
  "fastino/gliner2-multi-v1": {
    "context": 8192,
    "output": 8192
  },
  "fastino/gliner2-privacy-filter-PII-multi": {
    "context": 8192,
    "output": 8192
  },
  "fastino/gliner2.5-base-v1": {
    "context": 4096,
    "output": 4096
  },
  "fastino/gliner2.5-multi-v1": {
    "context": 4096,
    "output": 4096
  },
  "featherless-ai/Qwerky-72B": {
    "context": 32000,
    "output": 8192
  },
  "fireworks_ai/accounts/fireworks/models/ember-1": {
    "context": 1048576,
    "output": 131072
  },
  "fireworks_ai/accounts/fireworks/models/gpt-oss-120b": {
    "context": 131072,
    "output": 32768
  },
  "fireworks_ai/accounts/fireworks/models/inkling": {
    "context": 1048576,
    "output": 1048576
  },
  "fireworks_ai/accounts/fireworks/models/muse-spark-open": {
    "context": 1048576,
    "output": 131072
  },
  "fireworks_ai/gpt-oss-120b": {
    "context": 131072,
    "output": 32768
  },
  "fireworks-ai/kimi-k2.5-fw": {
    "context": 262144,
    "output": 16384
  },
  "fireworks/deepseek-v4.1-flash": {
    "context": 1048576,
    "output": 393216
  },
  "fireworks/glm-5.2": {
    "context": 1000000,
    "output": 131072
  },
  "fireworks/glm-5.3": {
    "context": 1048576,
    "output": 131072
  },
  "fireworks/glm-5.3-flash": {
    "context": 1048576,
    "output": 131072
  },
  "fireworks/gpt-oss-120b": {
    "context": 131072,
    "output": 32768
  },
  "fireworks/gpt-oss-20b": {
    "context": 131072,
    "output": 32768
  },
  "fireworks/kimi-k3": {
    "context": 1040384,
    "output": 1040384
  },
  "fireworks/kimi-k3-fast": {
    "context": 1040384,
    "output": 1040384
  },
  "fledge-alpha-free": {
    "context": 1048576,
    "output": 131072
  },
  "flexai/DeepSeek-V4-Flash-0731": {
    "context": 1048576,
    "output": 384000
  },
  "flexai/DeepSeek-V4-Flash-0731@eu": {
    "context": 1048576,
    "output": 384000
  },
  "flexai/DeepSeek-V4.1-Flash-1017": {
    "context": 1048576,
    "output": 384000
  },
  "flexai/gpt-oss-120b": {
    "context": 131072,
    "output": 32768
  },
  "flexai/gpt-oss-20b": {
    "context": 131072,
    "output": 32768
  },
  "flexai/Muse-Glimmer-30B": {
    "context": 131072,
    "output": 131072
  },
  "flexai/Step-3.7-Flash": {
    "context": 262144,
    "output": 256000
  },
  "flint-40b-free": {
    "context": 262144,
    "output": 65536
  },
  "fugu": {
    "context": 1000000,
    "output": 1000000
  },
  "fugu-max": {
    "context": 1000000
  },
  "fugu-ultra-20260615": {
    "context": 1000000,
    "output": 1000000
  },
  "fugu-ultra-v1-0": {
    "context": 1000000,
    "output": 131072
  },
  "fugu-ultra-v1-1": {
    "context": 1000000,
    "output": 131072
  },
  "fugu-ultra-v2-0": {
    "context": 1000000,
    "output": 131072
  },
  "fugu-ultra-v2.0": {
    "context": 1000000,
    "output": 1000000
  },
  "GalrionSoftworks/MN-LooseCannon-12B-v1": {
    "context": 16384,
    "output": 8192
  },
  "gemini-2-5-flash": {
    "context": 1048576,
    "output": 65536
  },
  "gemini-2-5-flash-lite": {
    "context": 1048576,
    "output": 65536
  },
  "gemini-2.0-flash": {
    "context": 1048576,
    "output": 8192
  },
  "gemini-2.0-pro-exp-02-05": {
    "context": 2097152,
    "output": 8192
  },
  "gemini-2.0-pro-reasoner": {
    "context": 128000,
    "output": 65536
  },
  "gemini-2.5-computer-use-preview-10-2025": {
    "context": 128000,
    "output": 64000
  },
  "gemini-2.5-flash-image": {
    "context": 32768
  },
  "gemini-2.5-flash-lite": {
    "context": 1048576
  },
  "gemini-2.5-flash-lite-preview-06-17": {
    "context": 1048576
  },
  "gemini-2.5-flash-lite-preview-09-2025-thinking": {
    "context": 1048576,
    "output": 65536
  },
  "gemini-2.5-flash-lite@eu": {
    "context": 1048576,
    "output": 65535
  },
  "gemini-2.5-flash-nothink": {
    "context": 1000000,
    "output": 65536
  },
  "gemini-2.5-flash-nothinking": {
    "context": 1048576,
    "output": 65536
  },
  "gemini-2.5-flash-preview-04-17": {
    "context": 1048576,
    "output": 65536
  },
  "gemini-2.5-flash-preview-04-17:thinking": {
    "context": 1048576,
    "output": 65536
  },
  "gemini-2.5-flash-preview-05-20:thinking": {
    "context": 1048000,
    "output": 65536
  },
  "gemini-2.5-flash-preview-09-2025-thinking": {
    "context": 1048576,
    "output": 65536
  },
  "gemini-2.5-flash-preview-tts": {
    "context": 8192,
    "output": 16384
  },
  "gemini-2.5-flash-tts": {
    "context": 32768,
    "output": 16384
  },
  "gemini-2.5-flash@eu": {
    "context": 1048576,
    "output": 65535
  },
  "gemini-2.5-pro-exp-03-25": {
    "context": 1048576,
    "output": 65536
  },
  "gemini-2.5-pro-preview-03-25": {
    "context": 1048576,
    "output": 65536
  },
  "gemini-2.5-pro-preview-05-06": {
    "context": 1048576,
    "output": 65536
  },
  "gemini-2.5-pro-preview-06-05": {
    "context": 1048576,
    "output": 65536
  },
  "gemini-2.5-pro-preview-tts": {
    "context": 8192,
    "output": 16384
  },
  "gemini-2.5-pro-tts": {
    "context": 32768,
    "output": 16384
  },
  "gemini-2.5-pro@eu": {
    "context": 1048576,
    "output": 65535
  },
  "gemini-3-1-flash-lite": {
    "context": 1048576,
    "output": 65536
  },
  "gemini-3-1-flash-tts": {
    "context": 8192,
    "output": 16384
  },
  "gemini-3-1-pro": {
    "context": 1048576,
    "output": 65536
  },
  "gemini-3-1-pro-preview": {
    "context": 1000000
  },
  "gemini-3-flash": {
    "context": 1048576,
    "output": 65536
  },
  "gemini-3-pro": {
    "context": 1048576,
    "output": 65536
  },
  "gemini-3.0-flash-preview": {
    "context": 1000000,
    "output": 64000
  },
  "gemini-3.0-pro-image-preview": {
    "context": 32768,
    "output": 8192
  },
  "gemini-3.0-pro-preview": {
    "context": 1000000,
    "output": 64000
  },
  "gemini-3.1-flash-lite": {
    "context": 1048576
  },
  "gemini-3.1-flash-lite-image": {
    "context": 65536,
    "output": 4096
  },
  "gemini-3.1-flash-lite-preview": {
    "context": 1048576,
    "output": 65536
  },
  "gemini-3.1-flash-lite@eu": {
    "context": 1048576,
    "output": 65535
  },
  "gemini-3.1-flash-live-preview": {
    "context": 131072,
    "output": 65536
  },
  "gemini-3.1-flash-tts-preview": {
    "context": 8192,
    "output": 16384
  },
  "gemini-3.1-pro-preview": {
    "context": 1048576
  },
  "gemini-3.1-pro-preview-customtools": {
    "context": 1048576,
    "output": 65536
  },
  "gemini-3.5-flash-lite": {
    "context": 1048576
  },
  "gemini-3.5-flash-lite@eu": {
    "context": 1048576,
    "output": 65535
  },
  "gemini-3.5-flash-thinking": {
    "context": 1048576,
    "output": 65536
  },
  "gemini-3.5-flash@eu": {
    "context": 1048576,
    "output": 65535
  },
  "gemini-3.5-live-translate-preview": {
    "context": 16384,
    "output": 32768
  },
  "gemini-3.7-flash@eu": {
    "context": 1048576,
    "output": 65535
  },
  "gemini-3.8-flash@eu": {
    "context": 1048576,
    "output": 65535
  },
  "gemini-4-argon-contributor": {
    "context": 1048576,
    "output": 65536
  },
  "gemini-4-argon@eu": {
    "context": 1048576,
    "output": 65536
  },
  "gemini-embedding": {
    "context": 2048,
    "output": 1
  },
  "gemini-embedding-001": {
    "context": 2048,
    "output": 1
  },
  "gemini-embedding-2": {
    "context": 8192
  },
  "gemini-exp-1206": {
    "context": 2097152,
    "output": 8192
  },
  "gemini-flash-latest": {
    "context": 1048576,
    "output": 65536
  },
  "gemini-flash-lite-latest": {
    "context": 1048576,
    "output": 65536
  },
  "gemini-nano-banana-2.1": {
    "context": 131072,
    "output": 32768
  },
  "gemini-omni-flash-preview": {
    "context": 131072,
    "output": 65536
  },
  "gemini/gemini-2.5-flash": {
    "context": 1048576,
    "output": 65536
  },
  "gemini/gemini-2.5-flash-lite": {
    "context": 1048576,
    "output": 65536
  },
  "gemini/gemini-2.5-pro": {
    "context": 1048576,
    "output": 65536
  },
  "gemini/gemini-3-flash-preview": {
    "context": 1048576,
    "output": 65536
  },
  "gemini/gemini-3.1-pro-preview": {
    "context": 1048576,
    "output": 65536
  },
  "gemini/gemini-3.5-flash": {
    "context": 1048576,
    "output": 65536
  },
  "gemini/gemini-3.5-flash-lite": {
    "context": 1048576,
    "output": 65536
  },
  "gemini/gemini-3.6-flash": {
    "context": 1048576,
    "output": 65536
  },
  "gemini/gemini-3.7-flash": {
    "context": 1048576,
    "output": 65536
  },
  "gemini/gemini-3.8-flash": {
    "context": 1048576,
    "output": 65536
  },
  "gemini/gemini-4-argon": {
    "context": 1048576
  },
  "gemma-3-12b": {
    "context": 131072,
    "output": 8192
  },
  "gemma-3-12b-it": {
    "context": 131072,
    "output": 8192
  },
  "gemma-3-27b": {
    "context": 128000,
    "output": 16384
  },
  "gemma-4": {
    "context": 131072,
    "output": 131072
  },
  "gemma-4-12b-it": {
    "context": 131072,
    "output": 32768
  },
  "gemma-4-12b-it-semancer": {
    "context": 131072,
    "output": 32768
  },
  "gemma-4-12b-it-starry-ocean": {
    "context": 131072,
    "output": 131072
  },
  "gemma-4-12b-it-station-keeper": {
    "context": 131072,
    "output": 32768
  },
  "gemma-4-26b-a4b": {
    "context": 262144,
    "output": 32768
  },
  "gemma-4-26b-a4b-it-chimerax": {
    "context": 262144,
    "output": 32768
  },
  "gemma-4-26b-a4b-it-chimeraxheretic": {
    "context": 262144,
    "output": 32768
  },
  "gemma-4-26b-a4b-it-darksoul": {
    "context": 262144,
    "output": 32768
  },
  "gemma-4-26b-a4b-it-luminous": {
    "context": 262144,
    "output": 32768
  },
  "gemma-4-26b-a4b-it-moonlight": {
    "context": 262144,
    "output": 32768
  },
  "gemma-4-26b-a4b-it-musica": {
    "context": 262144,
    "output": 32768
  },
  "gemma-4-26b-a4b-it-opusdistill": {
    "context": 262144,
    "output": 32768
  },
  "gemma-4-26b-a4b-it-shadowsiren": {
    "context": 262144,
    "output": 32768
  },
  "Gemma-4-26B-A4B-MeroMero": {
    "context": 262144,
    "output": 32768
  },
  "Gemma-4-26B-A4B-MeroMero:thinking": {
    "context": 262144,
    "output": 32768
  },
  "gemma-4-31b": {
    "context": 262128,
    "output": 16384
  },
  "Gemma-4-31B-Agares-v1": {
    "context": 262144,
    "output": 262144
  },
  "Gemma-4-31B-Animus-V14.1": {
    "context": 262144,
    "output": 262144
  },
  "Gemma-4-31B-AssGuard": {
    "context": 262144,
    "output": 262144
  },
  "Gemma-4-31B-Claude-4.6-Opus-Reasoning-Distilled": {
    "context": 262144,
    "output": 16384
  },
  "Gemma-4-31B-Cognitive-Unshackled": {
    "context": 262144,
    "output": 16384
  },
  "Gemma-4-31B-Dark-Gemistry": {
    "context": 262144,
    "output": 262144
  },
  "Gemma-4-31B-DarkIdol": {
    "context": 262144,
    "output": 16384
  },
  "Gemma-4-31B-Fabled": {
    "context": 262144,
    "output": 262144
  },
  "Gemma-4-31B-GarnetV2": {
    "context": 262144,
    "output": 16384
  },
  "Gemma-4-31B-Gembrain-uncensored-heretic": {
    "context": 262144,
    "output": 262144
  },
  "Gemma-4-31B-Gembrain-X-Core": {
    "context": 262144,
    "output": 262144
  },
  "Gemma-4-31B-Isometry-RP": {
    "context": 262144,
    "output": 262144
  },
  "Gemma-4-31B-IT": {
    "context": 262144,
    "output": 32768
  },
  "gemma-4-31b-it-darkidol": {
    "context": 262144,
    "output": 32768
  },
  "gemma-4-31b-it-fabled": {
    "context": 262144,
    "output": 32768
  },
  "gemma-4-31B-it-fp8": {
    "context": 262144,
    "output": 32768
  },
  "gemma-4-31b-it-garnet": {
    "context": 262144,
    "output": 32768
  },
  "gemma-4-31b-it-gembrain": {
    "context": 262144,
    "output": 32768
  },
  "gemma-4-31b-it-gemsicle": {
    "context": 262144,
    "output": 32768
  },
  "gemma-4-31b-it-isometry": {
    "context": 262144,
    "output": 32768
  },
  "gemma-4-31b-it-novelist": {
    "context": 262144,
    "output": 32768
  },
  "gemma-4-31b-it-scarlet": {
    "context": 262144,
    "output": 32768
  },
  "gemma-4-31b-it:free": {
    "context": 262144,
    "output": 32768
  },
  "Gemma-4-31B-K1-v5": {
    "context": 262144,
    "output": 262144
  },
  "Gemma-4-31B-MeroMero": {
    "context": 262144,
    "output": 262144
  },
  "Gemma-4-31B-MeroMero-v2": {
    "context": 262144,
    "output": 32768
  },
  "Gemma-4-31B-MeroMero-v2:thinking": {
    "context": 262144,
    "output": 32768
  },
  "Gemma-4-31B-Novelist": {
    "context": 262144,
    "output": 262144
  },
  "Gemma-4-31B-Queen": {
    "context": 262144,
    "output": 16384
  },
  "Gemma-4-31B-SDFT-Heretic-RP": {
    "context": 262144,
    "output": 262144
  },
  "Gemma-4-31B-StyleTune": {
    "context": 262144,
    "output": 262144
  },
  "gemma-4-E4B-it-IQ4_XS": {
    "context": 32768,
    "output": 8192
  },
  "gemma-4-E4B-it-MLX-4bit": {
    "context": 32768,
    "output": 8192
  },
  "gemma-4-uncensored": {
    "context": 256000,
    "output": 8192
  },
  "gemma2-9b-it": {
    "context": 8192,
    "output": 8192
  },
  "gemma4": {
    "context": 262144,
    "output": 32768
  },
  "gemma4-26b": {
    "context": 256000,
    "output": 32768
  },
  "gemma4:31b": {
    "context": 262144,
    "output": 262144
  },
  "glm-4-32b-0414-128k": {
    "context": 128000,
    "output": 16384
  },
  "glm-4-5-flash": {
    "context": 200000,
    "output": 98304
  },
  "glm-4-6v-flash": {
    "context": 128000,
    "output": 32768
  },
  "glm-4-7-flash": {
    "context": 200000,
    "output": 131072
  },
  "glm-4-7-flash:free": {
    "context": 200000,
    "output": 131072
  },
  "glm-4-7-flashx": {
    "context": 200000,
    "output": 131072
  },
  "glm-4-long": {
    "context": 1000000,
    "output": 4095
  },
  "glm-4.5-airx": {
    "context": 128000,
    "output": 16384
  },
  "glm-4.5-flash": {
    "context": 131072,
    "output": 98304
  },
  "glm-4.5-flash:free": {
    "context": 131072,
    "output": 98304
  },
  "glm-4.5-x": {
    "context": 128000,
    "output": 16384
  },
  "GLM-4.6-Derestricted-v5": {
    "context": 131072,
    "output": 8192
  },
  "glm-4.6v-flash": {
    "context": 128000,
    "output": 32768
  },
  "glm-4.6v-flashx": {
    "context": 128000,
    "output": 16000
  },
  "GLM-4.7": {
    "context": 204800,
    "output": 131072
  },
  "glm-4.7-flash-free": {
    "context": 200000,
    "output": 131072
  },
  "glm-4.7-flashx": {
    "context": 200000,
    "output": 131072
  },
  "glm-4.7-free": {
    "context": 204800,
    "output": 131072
  },
  "GLM-5": {
    "context": 204800,
    "output": 131072
  },
  "glm-5-2-260617": {
    "context": 1000000,
    "output": 131072
  },
  "glm-5-3-flash-260828": {
    "context": 1000000,
    "output": 131072
  },
  "glm-5-free": {
    "context": 204800,
    "output": 131072
  },
  "glm-5-turbo": {
    "context": 200000,
    "output": 131072
  },
  "glm-5.1@eu": {
    "context": 200000,
    "output": 131072
  },
  "glm-5.2-caveman": {
    "context": 1000000,
    "output": 131072
  },
  "glm-5.2-caveman-lite": {
    "context": 1000000,
    "output": 131072
  },
  "glm-5.2-caveman-ultra": {
    "context": 1000000,
    "output": 131072
  },
  "glm-5.2-fast": {
    "context": 1000000,
    "output": 131072
  },
  "glm-5.2-highspeed": {
    "context": 1000000,
    "output": 131072
  },
  "glm-5.2-honey": {
    "context": 1000000,
    "output": 131072
  },
  "glm-5.2-honey-lite": {
    "context": 1000000,
    "output": 131072
  },
  "glm-5.2-honey-ultra": {
    "context": 1000000,
    "output": 131072
  },
  "glm-5.2-nitro": {
    "context": 200000,
    "output": 32000
  },
  "glm-5.2-ponytail": {
    "context": 1000000,
    "output": 131072
  },
  "glm-5.2-ponytail-lite": {
    "context": 1000000,
    "output": 131072
  },
  "glm-5.2-ponytail-ultra": {
    "context": 1000000,
    "output": 131072
  },
  "glm-5.2:free": {
    "context": 1000000,
    "output": 131072
  },
  "glm-5.2@eu": {
    "context": 1048576,
    "output": 131072
  },
  "GLM-5.3": {
    "context": 1000000,
    "output": 131072
  },
  "glm-5.3-fast": {
    "context": 1000000,
    "output": 131072
  },
  "glm-5.3-flash-flex": {
    "context": 1048560,
    "output": 1048560
  },
  "glm-5.3-flash-free": {
    "context": 200000,
    "output": 32000
  },
  "glm-5.3-flash:fast": {
    "context": 1000000,
    "output": 131072
  },
  "glm-5.3-flash@eu": {
    "context": 1000000,
    "output": 262144
  },
  "glm-5.3-flashx": {
    "context": 1000000
  },
  "glm-5.3-flex": {
    "context": 1048560,
    "output": 1048560
  },
  "glm-5.3-highspeed": {
    "context": 1000000,
    "output": 131072
  },
  "glm-5.3:fast": {
    "context": 1000000,
    "output": 131072
  },
  "glm-5.3@eu": {
    "context": 1048576,
    "output": 1048576
  },
  "glm-5.x-menthol": {
    "context": 202752,
    "output": 131072
  },
  "glm-5v-turbo": {
    "context": 200000,
    "output": 131072
  },
  "glm-flash-latest": {
    "context": 1000000,
    "output": 131072
  },
  "glm5.2": {
    "context": 96000,
    "output": 96000
  },
  "glm5.2-fast": {
    "context": 1048576,
    "output": 131072
  },
  "glm5.3": {
    "context": 1000000,
    "output": 131072
  },
  "glm5.3-754b": {
    "context": 524288,
    "output": 81920
  },
  "glm5.3-flash": {
    "context": 1000000,
    "output": 131072
  },
  "global.amazon.nova-2-lite-v1:0": {
    "context": 1000000,
    "output": 65535
  },
  "global.anthropic.claude-fable-5": {
    "context": 1000000,
    "output": 128000
  },
  "global.anthropic.claude-fable-5-1": {
    "context": 1000000,
    "output": 128000
  },
  "global.anthropic.claude-haiku-4-5-20251001-v1:0": {
    "context": 200000,
    "output": 64000
  },
  "global.anthropic.claude-haiku-5-5": {
    "context": 1000000,
    "output": 128000
  },
  "global.anthropic.claude-opus-4-5-20251101-v1:0": {
    "context": 200000,
    "output": 64000
  },
  "global.anthropic.claude-opus-4-6-v1": {
    "context": 1000000,
    "output": 128000
  },
  "global.anthropic.claude-opus-4-7": {
    "context": 1000000,
    "output": 128000
  },
  "global.anthropic.claude-opus-4-8": {
    "context": 1000000,
    "output": 128000
  },
  "global.anthropic.claude-opus-5": {
    "context": 1000000,
    "output": 128000
  },
  "global.anthropic.claude-opus-5-5": {
    "context": 1000000,
    "output": 128000
  },
  "global.anthropic.claude-sonnet-4-20250514-v1:0": {
    "context": 200000,
    "output": 64000
  },
  "global.anthropic.claude-sonnet-4-5-20250929-v1:0": {
    "context": 200000,
    "output": 64000
  },
  "global.anthropic.claude-sonnet-4-6": {
    "context": 1000000,
    "output": 128000
  },
  "global.anthropic.claude-sonnet-5": {
    "context": 1000000,
    "output": 128000
  },
  "global.anthropic.claude-sonnet-5-5": {
    "context": 1000000,
    "output": 128000
  },
  "global.moonshotai.kimi-k3": {
    "context": 1048576,
    "output": 128000
  },
  "global.openai.gpt-5.6-luna": {
    "context": 1050000,
    "output": 128000
  },
  "global.openai.gpt-5.6-sol": {
    "context": 1050000,
    "output": 128000
  },
  "global.openai.gpt-5.6-terra": {
    "context": 1050000,
    "output": 128000
  },
  "global.openai.gpt-6-astra": {
    "context": 1050000,
    "output": 128000
  },
  "global.openai.gpt-6-luna": {
    "context": 1050000,
    "output": 128000
  },
  "global.openai.gpt-6-sol": {
    "context": 1050000,
    "output": 128000
  },
  "global.openai.gpt-6.1-sol": {
    "context": 1050000,
    "output": 128000
  },
  "global.openai.gpt-6.1-terra": {
    "context": 1050000,
    "output": 128000
  },
  "global.xai.grok-4.6": {
    "context": 500000,
    "output": 500000
  },
  "global.xai.grok-4.7": {
    "context": 500000,
    "output": 500000
  },
  "global.zai.glm-5.3": {
    "context": 1000000,
    "output": 128000
  },
  "google-ai-studio/gemini-3-flash-preview": {
    "context": 1048576,
    "output": 65535
  },
  "google-ai-studio/gemini-3.1-flash-lite": {
    "context": 1048576,
    "output": 65536
  },
  "google-ai-studio/gemini-3.1-pro-preview": {
    "context": 1048576,
    "output": 65536
  },
  "google-ai-studio/gemini-3.5-flash-lite": {
    "context": 1048576,
    "output": 65536
  },
  "google-ai-studio/gemini-3.6-flash": {
    "context": 1048576,
    "output": 65536
  },
  "google-ai-studio/gemini-3.8-flash": {
    "context": 1048576,
    "output": 65536
  },
  "google-ai-studio/gemini-4-argon": {
    "context": 1048576,
    "output": 1048576
  },
  "google-ai-studio/gemini-pro-latest": {
    "context": 1048576,
    "output": 65536
  },
  "google-gemma-3-27b-it": {
    "context": 198000,
    "output": 16384
  },
  "google-gemma-4-26b-a4b-it": {
    "context": 256000,
    "output": 8192
  },
  "google-gemma-4-31b-it": {
    "context": 256000,
    "output": 8192
  },
  "google-vertex/gemini-3-flash-preview": {
    "context": 1048576,
    "output": 65535
  },
  "google-vertex/gemini-3.1-flash-lite": {
    "context": 1048576,
    "output": 65536
  },
  "google-vertex/gemini-3.1-pro-preview": {
    "context": 1048576,
    "output": 65536
  },
  "google-vertex/gemini-3.5-flash": {
    "context": 1048576,
    "output": 65536
  },
  "google-vertex/gemini-3.5-flash-lite": {
    "context": 1048576,
    "output": 65536
  },
  "google-vertex/gemini-3.6-flash": {
    "context": 1048576,
    "output": 65536
  },
  "google-vertex/gemini-3.7-flash": {
    "context": 1048576,
    "output": 65536
  },
  "google-vertex/gemini-3.8-flash": {
    "context": 1048576,
    "output": 65536
  },
  "google-vertex/gemini-4-argon": {
    "context": 1048576,
    "output": 1048576
  },
  "google.gemma-3-12b-it": {
    "context": 131072,
    "output": 8192
  },
  "google.gemma-3-27b-it": {
    "context": 131072,
    "output": 8192
  },
  "google.gemma-3-4b-it": {
    "context": 131072,
    "output": 4096
  },
  "google.gemma-4-26b-a4b": {
    "context": 262144,
    "output": 32768
  },
  "google.gemma-4-31b": {
    "context": 262144,
    "output": 32768
  },
  "google.gemma-4-e2b": {
    "context": 131072,
    "output": 8192
  },
  "google/deep-research-max-preview-04-2026": {
    "context": 1048576,
    "output": 65536
  },
  "google/deep-research-preview-04-2026": {
    "context": 1048576,
    "output": 65536
  },
  "google/diffusiongemma": {
    "context": 262144,
    "output": 32768
  },
  "google/diffusiongemma-26b-a4b-it": {
    "context": 250000,
    "output": 32768
  },
  "google/gemini-2.0-flash": {
    "context": 990000,
    "output": 8192
  },
  "google/gemini-2.0-flash-lite": {
    "context": 990000,
    "output": 8192
  },
  "google/gemini-2.5-computer-use-preview-10-2025": {
    "context": 128000,
    "output": 64000
  },
  "google/gemini-2.5-flash-image": {
    "context": 32768
  },
  "google/gemini-2.5-pro-preview": {
    "context": 1048576,
    "output": 65536
  },
  "google/gemini-3-8-flash": {
    "context": 1048576,
    "output": 65536
  },
  "google/gemini-3-flash-preview-thinking": {
    "context": 1048576,
    "output": 65536
  },
  "google/gemini-3-pro-image-preview": {
    "context": 65536,
    "output": 32768
  },
  "google/gemini-3-pro-preview": {
    "context": 1048576,
    "output": 65536
  },
  "google/gemini-3.1-flash-lite-image": {
    "context": 65536
  },
  "google/gemini-3.1-pro-preview-high": {
    "context": 1048576,
    "output": 65536
  },
  "google/gemini-3.1-pro-preview-low": {
    "context": 1048576,
    "output": 65536
  },
  "google/gemini-3.5-flash-thinking": {
    "context": 1048576,
    "output": 65536
  },
  "google/gemini-3.5-transcribe": {
    "context": 98304,
    "output": 32768
  },
  "google/gemini-3.8-flash-lite-tts": {
    "context": 8192,
    "output": 16384
  },
  "google/gemini-3.8-flash-tts": {
    "context": 8192,
    "output": 16384
  },
  "google/gemini-3.8-live": {
    "context": 131072,
    "output": 65536
  },
  "google/gemini-3.8-live-extended-thinking": {
    "context": 131072,
    "output": 65536
  },
  "google/gemini-deep-research": {
    "context": 1048576
  },
  "google/gemini-embedding-001": {
    "context": 2048
  },
  "google/gemini-embedding-2": {
    "context": 8192
  },
  "google/gemini-flash-latest": {
    "context": 1048576,
    "output": 65536
  },
  "google/gemini-flash-lite-latest": {
    "context": 1048576,
    "output": 65536
  },
  "google/gemini-omni-1.1-flash": {
    "context": 131072,
    "output": 57920
  },
  "google/gemini-omni-flash-preview": {
    "context": 1000000,
    "output": 57920
  },
  "google/gemini-pro-latest": {
    "context": 1048576,
    "output": 65536
  },
  "google/gemini-robotics-er-1.6-preview": {
    "context": 131072,
    "output": 65536
  },
  "google/gemini-robotics-er-2-preview": {
    "context": 131072,
    "output": 65536
  },
  "google/gemma-2-27b-it": {
    "context": 8192,
    "output": 2048
  },
  "google/gemma-3": {
    "context": 125000,
    "output": 4096
  },
  "google/gemma-4-12B-it": {
    "context": 262144,
    "output": 262144
  },
  "google/gemma-4-26b-a4b-it": {
    "context": 262144
  },
  "google/gemma-4-26B-A4B-it": {
    "context": 262144
  },
  "google/gemma-4-26b-a4b-it-cybersecurity": {
    "context": 262144,
    "output": 32768
  },
  "google/gemma-4-26b-a4b-it-maas": {
    "context": 262144,
    "output": 128000
  },
  "google/gemma-4-26b-a4b-it:free": {
    "context": 262144,
    "output": 32768
  },
  "google/gemma-4-26b-a4b-it:thinking": {
    "context": 262144,
    "output": 131072
  },
  "google/gemma-4-31b": {
    "context": 262144,
    "output": 8192
  },
  "google/gemma-4-31b-it:free": {
    "context": 262144,
    "output": 32768
  },
  "google/gemma-4-31b-it:thinking": {
    "context": 262144,
    "output": 131072
  },
  "google/gemma-4-31B-turbo-TEE": {
    "context": 131072,
    "output": 65536
  },
  "google/gemma-4-E4B-it": {
    "context": 131072,
    "output": 8192
  },
  "google/gemma4-31b-splituntied": {
    "context": 262144,
    "output": 32768
  },
  "google/google-paligemma": {
    "context": 128000,
    "output": 8192
  },
  "google/imagen-3": {
    "context": 480
  },
  "google/imagen-3-fast": {
    "context": 480
  },
  "google/imagen-4": {
    "context": 480
  },
  "google/imagen-4-fast": {
    "context": 480
  },
  "google/imagen-4-ultra": {
    "context": 480
  },
  "google/lyria-3-clip-preview": {
    "context": 1048576,
    "output": 65536
  },
  "google/lyria-3-pro-preview": {
    "context": 1048576,
    "output": 65536
  },
  "google/nano-banana": {
    "context": 65536
  },
  "google/nano-banana-pro": {
    "context": 65536
  },
  "google/text-embedding-005": {
    "context": 8192
  },
  "google/text-multilingual-embedding-002": {
    "context": 8192
  },
  "google/veo-2": {
    "context": 480
  },
  "google/veo-3": {
    "context": 480
  },
  "google/veo-3-fast": {
    "context": 480
  },
  "google/veo-3.1": {
    "context": 480
  },
  "google/veo-3.1-fast": {
    "context": 480
  },
  "google/veo3.1": {
    "context": 400000
  },
  "google/veo3.1-fast": {
    "context": 400000
  },
  "google/veo3.1-lite": {
    "context": 400000
  },
  "gpt-3.5-turbo": {
    "context": 16385,
    "output": 4096
  },
  "gpt-3.5-turbo-0125": {
    "context": 16384,
    "output": 4096
  },
  "gpt-3.5-turbo-1106": {
    "context": 16384,
    "output": 4096
  },
  "gpt-3.5-turbo-instruct": {
    "context": 4096,
    "output": 4096
  },
  "gpt-4": {
    "context": 8192,
    "output": 8192
  },
  "gpt-4-turbo": {
    "context": 128000,
    "output": 4096
  },
  "gpt-4-turbo-vision": {
    "context": 128000,
    "output": 4096
  },
  "gpt-4.1": {
    "context": 1047576,
    "output": 32768
  },
  "gpt-4.1-mini": {
    "context": 1047576,
    "output": 32768
  },
  "gpt-4.1-mini-2025-04-14": {
    "context": 1047576,
    "output": 32768
  },
  "gpt-4.1-mini@eu": {
    "context": 1047576,
    "output": 32768
  },
  "gpt-4.1-nano": {
    "context": 1047576,
    "output": 32768
  },
  "gpt-4.1-nano@eu": {
    "context": 1047576,
    "output": 32768
  },
  "gpt-4.1@eu": {
    "context": 1047576,
    "output": 32768
  },
  "gpt-4o": {
    "context": 128000,
    "output": 16384
  },
  "gpt-4o-2024-05-13": {
    "context": 128000,
    "output": 4096
  },
  "gpt-4o-2024-08-06": {
    "context": 128000,
    "output": 16384
  },
  "gpt-4o-2024-11-20": {
    "context": 128000,
    "output": 16384
  },
  "gpt-4o-mini": {
    "context": 128000,
    "output": 16384
  },
  "gpt-4o-mini-transcribe": {
    "context": 16000,
    "output": 16000
  },
  "gpt-4o-mini@eu": {
    "context": 128000,
    "output": 16000
  },
  "gpt-4o-transcribe": {
    "context": 16000,
    "output": 16000
  },
  "gpt-5": {
    "context": 400000,
    "output": 128000
  },
  "gpt-5-1": {
    "context": 400000,
    "output": 128000
  },
  "gpt-5-2": {
    "context": 400000,
    "output": 128000
  },
  "gpt-5-3-codex": {
    "context": 400000,
    "output": 128000
  },
  "gpt-5-4": {
    "context": 1050000,
    "output": 128000
  },
  "gpt-5-4-mini": {
    "context": 400000,
    "output": 128000
  },
  "gpt-5-4-nano": {
    "context": 400000,
    "output": 128000
  },
  "gpt-5-5-pro": {
    "context": 1050000,
    "output": 128000
  },
  "gpt-5-6-luna": {
    "context": 1050000,
    "output": 128000
  },
  "gpt-5-6-sol": {
    "context": 1050000,
    "output": 128000
  },
  "gpt-5-6-terra": {
    "context": 1050000,
    "output": 128000
  },
  "gpt-5-codex": {
    "context": 400000,
    "output": 128000
  },
  "gpt-5-mini": {
    "context": 400000,
    "output": 128000
  },
  "gpt-5-mini@eu": {
    "context": 200000,
    "output": 100000
  },
  "gpt-5-nano": {
    "context": 400000,
    "output": 128000
  },
  "gpt-5-nano@eu": {
    "context": 200000,
    "output": 100000
  },
  "gpt-5-pro": {
    "context": 400000,
    "output": 272000
  },
  "gpt-5-thinking": {
    "context": 400000,
    "output": 128000
  },
  "gpt-5.1": {
    "context": 400000,
    "output": 128000
  },
  "gpt-5.1-codex": {
    "context": 400000,
    "output": 128000
  },
  "gpt-5.1-codex-max": {
    "context": 400000,
    "output": 128000
  },
  "gpt-5.1-codex-mini": {
    "context": 400000,
    "output": 128000
  },
  "gpt-5.1@eu": {
    "context": 400000,
    "output": 128000
  },
  "gpt-5.2": {
    "context": 400000,
    "output": 128000
  },
  "gpt-5.2-codex": {
    "context": 400000,
    "output": 128000
  },
  "gpt-5.2-pro": {
    "context": 400000,
    "output": 128000
  },
  "gpt-5.3-codex": {
    "context": 400000,
    "output": 128000
  },
  "gpt-5.3-codex-spark": {
    "context": 128000,
    "output": 32000
  },
  "gpt-5.3-codex-xhigh": {
    "context": 400000,
    "output": 128000
  },
  "gpt-5.4": {
    "context": 1050000,
    "output": 128000
  },
  "gpt-5.4-mini": {
    "context": 400000,
    "output": 128000
  },
  "gpt-5.4-nano": {
    "context": 400000,
    "output": 128000
  },
  "gpt-5.4-pro": {
    "context": 1050000,
    "output": 128000
  },
  "gpt-5.4:free": {
    "context": 1050000,
    "output": 128000
  },
  "gpt-5.4@eu": {
    "context": 1050000,
    "output": 128000
  },
  "gpt-5.5": {
    "context": 1050000,
    "output": 128000
  },
  "gpt-5.5-pro": {
    "context": 1050000,
    "output": 128000
  },
  "gpt-5.5:free": {
    "context": 1050000,
    "output": 128000
  },
  "gpt-5.5@eu": {
    "context": 1050000,
    "output": 128000
  },
  "gpt-5.6": {
    "context": 1050000,
    "output": 128000
  },
  "gpt-5.6-luna": {
    "context": 1050000,
    "output": 128000
  },
  "gpt-5.6-luna-pro": {
    "context": 1050000,
    "output": 128000
  },
  "gpt-5.6-luna@eu": {
    "context": 1050000,
    "output": 128000
  },
  "gpt-5.6-sol": {
    "context": 1050000,
    "output": 128000
  },
  "gpt-5.6-sol-pro": {
    "context": 1050000,
    "output": 128000
  },
  "gpt-5.6-sol@eu": {
    "context": 1050000,
    "output": 128000
  },
  "gpt-5.6-terra": {
    "context": 1050000,
    "output": 128000
  },
  "gpt-5.6-terra-pro": {
    "context": 1050000,
    "output": 128000
  },
  "gpt-5.6-terra@eu": {
    "context": 1050000,
    "output": 128000
  },
  "gpt-5@eu": {
    "context": 400000,
    "output": 128000
  },
  "gpt-6-1-sol": {
    "context": 1050000,
    "output": 128000
  },
  "gpt-6-astra": {
    "context": 1050000,
    "output": 128000
  },
  "gpt-6-luna": {
    "context": 1050000,
    "output": 128000
  },
  "gpt-6-luna@eu": {
    "context": 1050000,
    "output": 128000
  },
  "gpt-6-sol": {
    "context": 1050000,
    "output": 128000
  },
  "gpt-6-sol@eu": {
    "context": 1050000,
    "output": 128000
  },
  "gpt-6.1-sol": {
    "context": 1050000,
    "output": 128000
  },
  "gpt-6.1-sol@eu": {
    "context": 1050000,
    "output": 128000
  },
  "gpt-6.1-terra": {
    "context": 1050000,
    "output": 128000
  },
  "gpt-6.1-terra@eu": {
    "context": 1050000,
    "output": 128000
  },
  "gpt-chat-latest": {
    "context": 400000,
    "output": 128000
  },
  "gpt-daybreak-blue-latest": {
    "context": 1050000,
    "output": 128000
  },
  "gpt-daybreak-red-latest": {
    "context": 400000,
    "output": 128000
  },
  "gpt-image-2": {
    "context": 272000,
    "output": 16384
  },
  "gpt-oss:120b": {
    "context": 131072,
    "output": 32768
  },
  "gpt-oss:20b": {
    "context": 131072,
    "output": 32768
  },
  "gpt-realtime-2.1": {
    "context": 128000,
    "output": 32000
  },
  "gpt-sol-latest": {
    "context": 1000000,
    "output": 128000
  },
  "granite-4.2-8b": {
    "context": 131072,
    "output": 131072
  },
  "green-l": {
    "context": 128000,
    "output": 32768
  },
  "green-l-raw": {
    "context": 128000,
    "output": 32768
  },
  "green-r": {
    "context": 131072,
    "output": 32768
  },
  "green-r-raw": {
    "context": 131072,
    "output": 32768
  },
  "greenference/glm-5.3-flash": {
    "context": 1048576,
    "output": 131072
  },
  "greenference/gpt-oss-20b": {
    "context": 131072,
    "output": 32768
  },
  "greenference/qwen3-14b": {
    "context": 16384,
    "output": 8192
  },
  "greenference/qwen3-30b-a3b": {
    "context": 8192,
    "output": 4096
  },
  "greenference/qwen3.6-27b": {
    "context": 16384,
    "output": 8192
  },
  "greenpt/deepseek-v4-flash-0731": {
    "context": 1000000,
    "output": 384000
  },
  "greenpt/deepseek-v4.1-flash": {
    "context": 1000000,
    "output": 384000
  },
  "greenpt/gpt-oss-120b": {
    "context": 128000,
    "output": 32768
  },
  "greenpt/llama-3.3-70b-instruct": {
    "context": 128000,
    "output": 4096
  },
  "greenpt/qwen3-235b-a22b-instruct-2507": {
    "context": 250000,
    "output": 16384
  },
  "grok-3": {
    "context": 131072,
    "output": 131072
  },
  "grok-3-mini": {
    "context": 131072,
    "output": 131072
  },
  "grok-4": {
    "context": 256000,
    "output": 256000
  },
  "grok-4-0709": {
    "context": 256000
  },
  "grok-4-20": {
    "context": 2000000,
    "output": 128000
  },
  "grok-4-20-beta-0309-non-reasoning": {
    "context": 2000000,
    "output": 30000
  },
  "grok-4-20-beta-0309-reasoning": {
    "context": 2000000,
    "output": 30000
  },
  "grok-4-20-multi-agent": {
    "context": 2000000,
    "output": 128000
  },
  "grok-4-3": {
    "context": 1000000
  },
  "grok-4-5": {
    "context": 500000
  },
  "grok-4-6": {
    "context": 500000
  },
  "grok-4-fast-non-reasoning": {
    "context": 2000000
  },
  "grok-4-fast-reasoning": {
    "context": 2000000
  },
  "grok-4.1": {
    "context": 200000,
    "output": 64000
  },
  "grok-4.2-beta": {
    "context": 2000000,
    "output": 30000
  },
  "grok-4.20-0309-non-reasoning": {
    "context": 1000000,
    "output": 30000
  },
  "grok-4.20-0309-reasoning": {
    "context": 1000000,
    "output": 30000
  },
  "grok-4.20-beta-0309-reasoning": {
    "context": 2000000,
    "output": 30000
  },
  "grok-4.20-multi-agent-0309": {
    "context": 1000000,
    "output": 30000
  },
  "grok-4.3": {
    "context": 1000000
  },
  "grok-4.5": {
    "context": 500000
  },
  "grok-4.7": {
    "context": 500000
  },
  "grok-build-0-1": {
    "context": 256000
  },
  "grok-build-0.1": {
    "context": 256000,
    "output": 256000
  },
  "grok-code": {
    "context": 256000,
    "output": 256000
  },
  "grok-code-fast-1": {
    "context": 256000
  },
  "grok-imagine-image": {
    "context": 16000
  },
  "grok-imagine-image-2-0": {
    "context": 64000
  },
  "grok-imagine-image-quality": {
    "context": 16000
  },
  "grok-imagine-video": {
    "context": 1024
  },
  "grok-imagine-video-1.5": {
    "context": 1024
  },
  "grok-imagine-video-1.5-lite": {
    "context": 1024
  },
  "grok/grok-4.3": {
    "context": 1000000,
    "output": 30000
  },
  "grok/grok-4.5": {
    "context": 500000,
    "output": 500000
  },
  "grok/grok-4.6": {
    "context": 500000,
    "output": 500000
  },
  "groq/allam-2-7b": {
    "context": 4096,
    "output": 4096
  },
  "groq/gpt-oss-120b": {
    "context": 131072
  },
  "groq/gpt-oss-20b": {
    "context": 131072
  },
  "groq/meta-llama/llama-prompt-guard-2-22m": {
    "context": 512,
    "output": 512
  },
  "groq/meta-llama/llama-prompt-guard-2-86m": {
    "context": 512,
    "output": 512
  },
  "groq/openai/gpt-oss-120b": {
    "context": 131072
  },
  "groq/openai/gpt-oss-20b": {
    "context": 131072
  },
  "groq/openai/gpt-oss-safeguard-20b": {
    "context": 131072,
    "output": 131072
  },
  "groq/qwen/qwen3.8-27b": {
    "context": 131042,
    "output": 16384
  },
  "Gryphe/MythoMax-L2-13b": {
    "context": 4096,
    "output": 3686
  },
  "gte-large-en-v1.5": {
    "context": 8192,
    "output": 1024
  },
  "heabsy/cyberheabsy": {
    "context": 1048576,
    "output": 65536
  },
  "heabsy/qwen3.8-27b-uncensored-fast": {
    "context": 524288,
    "output": 235929
  },
  "hermes-2-pro-llama-3-8b": {
    "context": 131072,
    "output": 131072
  },
  "hermes-3-llama-3.1-405b": {
    "context": 128000,
    "output": 16384
  },
  "hermes-4-405b": {
    "context": 128000,
    "output": 128000
  },
  "hermes-high": {
    "context": 1048576,
    "output": 131072
  },
  "hermes-low": {
    "context": 1048576,
    "output": 131072
  },
  "hermes-medium": {
    "context": 1048576,
    "output": 131072
  },
  "hf:deepseek-ai/DeepSeek-V4.1-Flash": {
    "context": 524288,
    "output": 65536
  },
  "hf:deepseek-ai/DeepSeek-V4.1-Flash-1017": {
    "context": 524288,
    "output": 65536
  },
  "hf:MiniMaxAI/MiniMax-M3": {
    "context": 524288,
    "output": 65536
  },
  "hf:moonshotai/Kimi-K2.7-Code": {
    "context": 262144,
    "output": 65536
  },
  "hf:moonshotai/Kimi-K3": {
    "context": 524288,
    "output": 65536
  },
  "hf:nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4": {
    "context": 262144,
    "output": 65536
  },
  "hf:openai/gpt-oss-120b": {
    "context": 131072,
    "output": 65536
  },
  "hf:Qwen/Qwen3.6-27B": {
    "context": 262144,
    "output": 65536
  },
  "hf:zai-org/GLM-4.7-Flash": {
    "context": 196608,
    "output": 65536
  },
  "hf:zai-org/GLM-5.2": {
    "context": 524288,
    "output": 65536
  },
  "hf:zai-org/GLM-5.3": {
    "context": 524288,
    "output": 65536
  },
  "hf:zai-org/GLM-5.3-Flash": {
    "context": 524288,
    "output": 65536
  },
  "holo2-30b-a3b": {
    "context": 22016,
    "output": 16384
  },
  "holo3-35b-a3b": {
    "context": 65536,
    "output": 8192
  },
  "holo3-35b-a3b:thinking": {
    "context": 65536,
    "output": 8192
  },
  "huihui-ai/DeepSeek-R1-Distill-Llama-70B-abliterated": {
    "context": 16384,
    "output": 8192
  },
  "huihui-ai/DeepSeek-R1-Distill-Qwen-32B-abliterated": {
    "context": 16384,
    "output": 8192
  },
  "huihui-ai/Llama-3.3-70B-Instruct-abliterated": {
    "context": 32768,
    "output": 16384
  },
  "huihui-ai/Qwen2.5-32B-Instruct-abliterated": {
    "context": 32768,
    "output": 8192
  },
  "hunyuan-2.0-instruct": {
    "context": 131072,
    "output": 16384
  },
  "hunyuan-2.0-thinking": {
    "context": 131072,
    "output": 16384
  },
  "hunyuan-t1": {
    "context": 131072,
    "output": 16384
  },
  "hunyuan-turbos": {
    "context": 131072,
    "output": 16384
  },
  "hy-mt2-plus": {
    "context": 8192,
    "output": 8192
  },
  "Hy3": {
    "context": 202752,
    "output": 128000
  },
  "hy3-free": {
    "context": 190000,
    "output": 64000
  },
  "hy3-preview": {
    "context": 256000
  },
  "hy3-preview-free": {
    "context": 256000,
    "output": 64000
  },
  "hy3:free": {
    "context": 256000,
    "output": 128000
  },
  "ibm-granite/granite-4.0-h-micro": {
    "context": 131000,
    "output": 131000
  },
  "ibm-granite/granite-4.2-8b": {
    "context": 131072
  },
  "ibm/granite-4-h-small": {
    "context": 131072,
    "output": 131072
  },
  "iceman-contributor-free": {
    "context": 262144,
    "output": 131072
  },
  "ideogramai/ideogram": {
    "context": 150
  },
  "ideogramai/ideogram-v2": {
    "context": 150
  },
  "ideogramai/ideogram-v2a": {
    "context": 150
  },
  "ideogramai/ideogram-v2a-turbo": {
    "context": 150
  },
  "in.anthropic.claude-haiku-4-5-20251001-v1:0": {
    "context": 200000,
    "output": 64000
  },
  "in.anthropic.claude-opus-5": {
    "context": 1000000,
    "output": 128000
  },
  "in.anthropic.claude-sonnet-5": {
    "context": 1000000,
    "output": 128000
  },
  "in.openai.gpt-5.6-luna": {
    "context": 1050000,
    "output": 128000
  },
  "in.openai.gpt-5.6-terra": {
    "context": 1050000,
    "output": 128000
  },
  "inception/mercury-2": {
    "context": 128000,
    "output": 50000
  },
  "inception/mercury-2.5": {
    "context": 260000,
    "output": 65536
  },
  "inception/mercury-2.5-preview": {
    "context": 260000,
    "output": 65536
  },
  "inception/mercury-3": {
    "context": 1000000,
    "output": 131072
  },
  "inception/mercury-coder-small": {
    "context": 32000,
    "output": 16384
  },
  "inclusionai/ling-3.0-flash:thinking": {
    "context": 262144,
    "output": 32768
  },
  "inclusionai/ling-3.1-flash:free": {
    "context": 262144,
    "output": 32768
  },
  "inclusionAI/Ling-flash-2.0": {
    "context": 131000,
    "output": 131000
  },
  "inclusionai/ring-2.6-1t": {
    "context": 262000,
    "output": 65000
  },
  "infer/gpt-5.6-sol:official": {
    "context": 271999,
    "output": 128000
  },
  "infer/gpt-6-astra:official": {
    "context": 271999,
    "output": 128000
  },
  "Inferact/Qwen3.8-2.4T-A95B-NVFP4": {
    "context": 262144,
    "output": 32768
  },
  "inference-net/schematron-v2-small": {
    "context": 128000,
    "output": 4096
  },
  "inference-net/schematron-v2-turbo": {
    "context": 128000,
    "output": 8192
  },
  "inference.net/deepseek-v4.1-flash-1017": {
    "context": 262144,
    "output": 131072
  },
  "inference.net/deepseek-v4.1-flash-cyber": {
    "context": 1040000,
    "output": 393216
  },
  "inference.net/glm-5.3": {
    "context": 1048576,
    "output": 131072
  },
  "inference.net/glm-5.3-flash": {
    "context": 1048576,
    "output": 128000
  },
  "inference.net/llama-3.2-11b-instruct": {
    "context": 128000,
    "output": 128000
  },
  "inference.net/minimax-m3.1-flash": {
    "context": 1000000,
    "output": 524288
  },
  "inflatebot/MN-12B-Mag-Mell-R1": {
    "context": 16384,
    "output": 8192
  },
  "infomaniak/mistralai/Ministral-3-14B-Instruct-2512": {
    "context": 100000,
    "output": 262144
  },
  "inkling-256k": {
    "context": 262144,
    "output": 32768
  },
  "Intel/Qwen3-Coder-480B-A35B-Instruct-int4-mixed-ar": {
    "context": 106000,
    "output": 4096
  },
  "interfaze/interfaze-beta": {
    "context": 1000000,
    "output": 32000
  },
  "intfloat/e5-mistral-7b-instruct": {
    "context": 4096,
    "output": 4096
  },
  "intfloat/multilingual-e5-large-instruct": {
    "context": 512,
    "output": 512
  },
  "ionos/meta-llama/Llama-3.3-70B-Instruct": {
    "context": 128000,
    "output": 4096
  },
  "ionos/openai/gpt-oss-120b": {
    "context": 128000,
    "output": 32768
  },
  "ionos/Qwen/Qwen3-Coder-Next": {
    "context": 128000,
    "output": 65536
  },
  "jamba-large": {
    "context": 256000,
    "output": 4096
  },
  "jamba-mini": {
    "context": 256000,
    "output": 4096
  },
  "jp.amazon.nova-2-lite-v1:0": {
    "context": 1000000,
    "output": 65535
  },
  "jp.anthropic.claude-haiku-4-5-20251001-v1:0": {
    "context": 200000,
    "output": 64000
  },
  "jp.anthropic.claude-haiku-5-5": {
    "context": 1000000,
    "output": 128000
  },
  "jp.anthropic.claude-opus-4-7": {
    "context": 1000000,
    "output": 128000
  },
  "jp.anthropic.claude-opus-4-8": {
    "context": 1000000,
    "output": 128000
  },
  "jp.anthropic.claude-opus-5": {
    "context": 1000000,
    "output": 128000
  },
  "jp.anthropic.claude-opus-5-5": {
    "context": 1000000,
    "output": 128000
  },
  "jp.anthropic.claude-sonnet-4-5-20250929-v1:0": {
    "context": 200000,
    "output": 64000
  },
  "jp.anthropic.claude-sonnet-4-6": {
    "context": 1000000,
    "output": 128000
  },
  "jp.anthropic.claude-sonnet-5": {
    "context": 1000000,
    "output": 128000
  },
  "k3": {
    "context": 1048576,
    "output": 131072
  },
  "k3-256k": {
    "context": 262144,
    "output": 131072
  },
  "k3.1-pro": {
    "context": 1048576,
    "output": 131072
  },
  "k3.1-pro-highspeed": {
    "context": 1048576,
    "output": 131072
  },
  "kat-coder-pro": {
    "context": 256000,
    "output": 256000
  },
  "KBLab/kb-whisper-large": {
    "context": 448,
    "output": 448
  },
  "kilo-auto/balanced": {
    "context": 1000000,
    "output": 65536
  },
  "kilo-auto/efficient": {
    "context": 1000000,
    "output": 65536
  },
  "kilo-auto/free": {
    "context": 256000,
    "output": 32768
  },
  "kilo-auto/frontier": {
    "context": 1000000,
    "output": 128000
  },
  "kilo-auto/small": {
    "context": 262144,
    "output": 32768
  },
  "kimi-for-coding": {
    "context": 1048576,
    "output": 32768
  },
  "kimi-for-coding-highspeed": {
    "context": 262144,
    "output": 32768
  },
  "kimi-k2-0711": {
    "context": 131072,
    "output": 16384
  },
  "kimi-k2-0905": {
    "context": 262144,
    "output": 16384
  },
  "kimi-k2-0905-preview": {
    "context": 262144,
    "output": 262144
  },
  "kimi-k2-5": {
    "context": 256000,
    "output": 65536
  },
  "kimi-k2-6:free": {
    "context": 262144,
    "output": 262144
  },
  "kimi-k2-7-code-highspeed": {
    "context": 256000,
    "output": 131072
  },
  "kimi-k2-7-code:free": {
    "context": 262144,
    "output": 262144
  },
  "kimi-k2-instruct-fast": {
    "context": 131072,
    "output": 16384
  },
  "kimi-k2-turbo-preview": {
    "context": 256000,
    "output": 8192
  },
  "Kimi-K2.5": {
    "context": 262144
  },
  "kimi-k2.5-free": {
    "context": 262144,
    "output": 262144
  },
  "kimi-k2.5@eu": {
    "context": 128000,
    "output": 16000
  },
  "Kimi-K2.6": {
    "context": 262144
  },
  "kimi-k2.6-fast": {
    "context": 262144,
    "output": 262144
  },
  "kimi-k2.6-nitro": {
    "context": 200000,
    "output": 32000
  },
  "kimi-k2.6@eu": {
    "context": 256000,
    "output": 128000
  },
  "kimi-k2.7-code-fast": {
    "context": 262128,
    "output": 262128
  },
  "kimi-k2.7-code-flex": {
    "context": 262128,
    "output": 262128
  },
  "kimi-k2.7-code-highspeed": {
    "context": 262144
  },
  "kimi-k2.7-code-nitro": {
    "context": 200000,
    "output": 32000
  },
  "kimi-k2.7-code@eu": {
    "context": 262144,
    "output": 262144
  },
  "kimi-k2.8-preview": {
    "context": 1000000,
    "output": 1000000
  },
  "kimi-k3-1-pro": {
    "context": 1000000,
    "output": 131072
  },
  "kimi-k3-1-pro-highspeed": {
    "context": 1000000,
    "output": 131072
  },
  "kimi-k3-fast-api": {
    "context": 1000000,
    "output": 131072
  },
  "kimi-k3-flex": {
    "context": 1048560,
    "output": 1048560
  },
  "kimi-k3:fast": {
    "context": 1048576,
    "output": 131072
  },
  "kimi-k3.1-pro": {
    "context": 1048576
  },
  "kimi-k3.1-pro-highspeed": {
    "context": 1048576,
    "output": 1048576
  },
  "kimi-k3@eu": {
    "context": 1048576,
    "output": 262144
  },
  "kimi/kimi-k2.5": {
    "context": 262144
  },
  "kimi/kimi-k2.6": {
    "context": 262144,
    "output": 32768
  },
  "kimi/kimi-k2.7-code": {
    "context": 262144,
    "output": 262144
  },
  "kimi/kimi-k3": {
    "context": 1048576,
    "output": 131072
  },
  "kling-v2-6": {
    "context": 99999999,
    "output": 99999999
  },
  "Kloker": {
    "context": 200000,
    "output": 50000
  },
  "Kloker-Integration-Architect": {
    "context": 200000,
    "output": 50000
  },
  "Kloker-Integration-Developer": {
    "context": 200000,
    "output": 50000
  },
  "kolibri-1": {
    "context": 262144,
    "output": 81920
  },
  "labs-devstral-small-2512": {
    "context": 256000,
    "output": 256000
  },
  "labs-leanstral-1-5-1": {
    "context": 262144,
    "output": 128000
  },
  "laguna-m.1": {
    "context": 32768,
    "output": 32768
  },
  "laguna-s-2.1": {
    "context": 1048576,
    "output": 32768
  },
  "laguna-s-2.1-free": {
    "context": 256000,
    "output": 32000
  },
  "laguna-xs.2": {
    "context": 32768,
    "output": 32768
  },
  "LatitudeGames/Wayfarer-Large-70B-Llama-3.3": {
    "context": 32768,
    "output": 16384
  },
  "leanstral-1-5": {
    "context": 262144,
    "output": 32768
  },
  "leanstral-1-5@eu": {
    "context": 262144,
    "output": 32768
  },
  "leonardo-ai/lucid-origin": {
    "context": 4096
  },
  "leonardo-ai/lucid-realism": {
    "context": 4096
  },
  "lightonai/LightOnOCR-2-1B": {
    "context": 32768,
    "output": 8192
  },
  "lightonocr-3-0.8b": {
    "context": 262144,
    "output": 16384
  },
  "Ling-1T": {
    "context": 128000,
    "output": 32000
  },
  "ling-2.6-1t": {
    "context": 262144,
    "output": 262144
  },
  "ling-2.6-flash": {
    "context": 262144,
    "output": 262144
  },
  "ling-2.6-flash-free": {
    "context": 262100,
    "output": 32800
  },
  "ling-3.0-flash": {
    "context": 262144,
    "output": 262144
  },
  "ling-3.0-flash-fin-free": {
    "context": 262144,
    "output": 32768
  },
  "ling-3.0-flash-free": {
    "context": 262144,
    "output": 32768
  },
  "ling-3.0-flash-vl": {
    "context": 131072,
    "output": 131072
  },
  "ling-3.0-tiny": {
    "context": 262144,
    "output": 32768
  },
  "ling-3.0-tiny-free": {
    "context": 262144,
    "output": 32768
  },
  "ling-3.1-flash-free": {
    "context": 262144,
    "output": 32768
  },
  "liquid.auto": {
    "context": 10000000,
    "output": 1048576
  },
  "liquid/lfm-2.5-2.6b": {
    "context": 128000
  },
  "liquid/lfm-2.5-2.6b:free": {
    "context": 65536,
    "output": 8192
  },
  "liquid/lfm-2.5-24b-a2b": {
    "context": 128000,
    "output": 8192
  },
  "liquid/lfm2.5-24b-a2b": {
    "context": 128000,
    "output": 8200
  },
  "LiquidAI/LFM2-24B-A2B": {
    "context": 32768,
    "output": 32768
  },
  "ll-alpha-free": {
    "context": 262144,
    "output": 65536
  },
  "llama-3.1-70b-instruct": {
    "context": 128000,
    "output": 2048
  },
  "llama-3.1-8b-instant": {
    "context": 131072
  },
  "llama-3.1-8b-instruct": {
    "context": 16384,
    "output": 16384
  },
  "llama-3.1-8b-instruct-turbo": {
    "context": 128000,
    "output": 128000
  },
  "llama-3.2-11b-instruct": {
    "context": 128000,
    "output": 8192
  },
  "llama-3.2-3b": {
    "context": 128000,
    "output": 4096
  },
  "llama-3.3-70b": {
    "context": 128000,
    "output": 4096
  },
  "llama-4-maverick-17b-128e-instruct-fp8": {
    "context": 1000000,
    "output": 16384
  },
  "llama-4-maverick-17b-instruct": {
    "context": 1048576,
    "output": 2048
  },
  "llama-4-scout": {
    "context": 131072,
    "output": 8192
  },
  "llama-4-scout-17b-16e-instruct": {
    "context": 128000,
    "output": 8192
  },
  "llama-4-scout-17b-instruct": {
    "context": 131072,
    "output": 2048
  },
  "llama-guard-4": {
    "context": 131072,
    "output": 1024
  },
  "llama-prompt-guard-2-22m": {
    "context": 512,
    "output": 2
  },
  "llama-prompt-guard-2-86m": {
    "context": 512,
    "output": 2
  },
  "llama3-3-70b": {
    "context": 131072,
    "output": 4096
  },
  "llama3.3:70b": {
    "context": 128000,
    "output": 4096
  },
  "LLM360/K2-Think": {
    "context": 128000,
    "output": 32768
  },
  "longcat-2.0": {
    "context": 1000000,
    "output": 131072
  },
  "LongCat-2.0": {
    "context": 1048576,
    "output": 131072
  },
  "longcat-2.0-free": {
    "context": 1000000,
    "output": 131072
  },
  "longcat-2.0:thinking": {
    "context": 1000000,
    "output": 131072
  },
  "LongCat-2.5-Preview": {
    "context": 1048576,
    "output": 262144
  },
  "longcat-2.5-preview-free": {
    "context": 1000000,
    "output": 131072
  },
  "lucidnova-rf1-100b": {
    "context": 120000,
    "output": 8000
  },
  "lucidquery-agi-01-frontier": {
    "context": 300000,
    "output": 120000
  },
  "lucidquery-agi-01-swift": {
    "context": 300000,
    "output": 120000
  },
  "lucidquery-nexus-coder": {
    "context": 250000,
    "output": 60000
  },
  "lumalabs/ray2": {
    "context": 5000
  },
  "luminal/deepseek-v4.1-flash": {
    "context": 1000000,
    "output": 384000
  },
  "lynkr-auto": {
    "context": 128000,
    "output": 8192
  },
  "lyria-3-clip-preview": {
    "context": 1048576,
    "output": 65536
  },
  "lyria-3-pro-preview": {
    "context": 1048576,
    "output": 65536
  },
  "magibu-11b-v8": {
    "context": 8192,
    "output": 8192
  },
  "magistral-medium-latest": {
    "context": 262144,
    "output": 16384
  },
  "mai-code-1.1-flash": {
    "context": 256000,
    "output": 128000
  },
  "mancer/weaver": {
    "context": 8000
  },
  "MarinaraSpaghetti/NemoMix-Unleashed-12B": {
    "context": 32768,
    "output": 8192
  },
  "medgemma-4b": {
    "context": 8192,
    "output": 8192
  },
  "meganova-ai/manta-flash-1.0": {
    "context": 16384,
    "output": 16384
  },
  "meganova-ai/manta-mini-1.0": {
    "context": 8192,
    "output": 8192
  },
  "meganova-ai/manta-pro-1.0": {
    "context": 65536,
    "output": 32768
  },
  "meituan-longcat/LongCat-2.0": {
    "context": 1049000,
    "output": 131072
  },
  "meituan/longcat-2.0": {
    "context": 1048756,
    "output": 262144
  },
  "meituan/longcat-flash-chat": {
    "context": 131072,
    "output": 131072
  },
  "meituan/longcat-flash-lite": {
    "context": 256000,
    "output": 320000
  },
  "mercury-2": {
    "context": 128000,
    "output": 50000
  },
  "mercury-2-5": {
    "context": 260000,
    "output": 65536
  },
  "mercury-2.5": {
    "context": 260000,
    "output": 65536
  },
  "mercury-3": {
    "context": 1000000,
    "output": 131072
  },
  "mercury-coder-small": {
    "context": 32768,
    "output": 16384
  },
  "mercury-edit-2": {
    "context": 32000,
    "output": 8192
  },
  "meta-contributor/muse-spark-1.2-contributor": {
    "context": 1048576,
    "output": 131072
  },
  "meta-contributor/muse-spark-1.3-contributor": {
    "context": 1048576,
    "output": 1048576
  },
  "Meta-Llama-3_1-8B-Instruct-GGUF": {
    "context": 131072,
    "output": 4096
  },
  "meta-llama-3_3-70b-instruct": {
    "context": 131072,
    "output": 131072
  },
  "meta-llama-3-1-8b-instruct": {
    "context": 131072,
    "output": 8192
  },
  "Meta-Llama-3-1-8B-Instruct-FP8": {
    "context": 128000,
    "output": 16384
  },
  "meta-llama-3-3-70b-instruct": {
    "context": 128000,
    "output": 8192
  },
  "Meta-Llama-3.3-70B-Instruct": {
    "context": 131072,
    "output": 3072
  },
  "meta-llama/llama-3-3-70b-instruct": {
    "context": 131072,
    "output": 4096
  },
  "meta-llama/llama-3.1-70b-instruct": {
    "context": 131072,
    "output": 16384
  },
  "meta-llama/Llama-3.1-8B-Instruct": {
    "context": 131072
  },
  "meta-llama/llama-3.2-3b-instruct": {
    "context": 131072
  },
  "meta-llama/Llama-3.2-90B-Vision-Instruct": {
    "context": 16000,
    "output": 4096
  },
  "meta-llama/llama-4-scout-17b-16e-instruct": {
    "context": 131072,
    "output": 131072
  },
  "meta-llama/Llama-4-Scout-17B-16E-Instruct": {
    "context": 327680,
    "output": 16384
  },
  "meta-llama/llama-guard-4-12b": {
    "context": 163840,
    "output": 16384
  },
  "meta-llama/Llama-Guard-4-12B": {
    "context": 163840,
    "output": 163840
  },
  "meta-llama/llama-prompt-guard-2-22m": {
    "context": 512,
    "output": 512
  },
  "meta-llama/llama-prompt-guard-2-86m": {
    "context": 512,
    "output": 512
  },
  "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo": {
    "context": 128000,
    "output": 4096
  },
  "meta-llama/Meta-Llama-3.1-8B-Instruct": {
    "context": 128000,
    "output": 4096
  },
  "meta-llama/Meta-Llama-3.3-70B-Instruct": {
    "context": 131072,
    "output": 8192
  },
  "meta-models/muse-spark-open": {
    "context": 1048576,
    "output": 1048576
  },
  "meta-models/Muse-Spark-Open-816B-A42B": {
    "context": 1048576,
    "output": 131072
  },
  "meta.llama-3.3-70b-instruct": {
    "context": 128000,
    "output": 4096
  },
  "meta.llama-4-maverick-17b-128e-instruct-fp8": {
    "context": 512000,
    "output": 16384
  },
  "meta.llama-4-scout-17b-16e-instruct": {
    "context": 192000,
    "output": 16384
  },
  "meta.llama3-1-70b-instruct-v1:0": {
    "context": 128000,
    "output": 4096
  },
  "meta.llama3-1-8b-instruct-v1:0": {
    "context": 128000,
    "output": 4096
  },
  "meta.llama3-3-70b-instruct-v1:0": {
    "context": 128000,
    "output": 4096
  },
  "meta.llama4-maverick-17b-instruct-v1:0": {
    "context": 1000000,
    "output": 8192
  },
  "meta.llama4-scout-17b-instruct-v1:0": {
    "context": 10000000,
    "output": 8192
  },
  "meta/llama-3.1-70b": {
    "context": 128000,
    "output": 8192
  },
  "meta/llama-3.1-70b-instruct": {
    "context": 128000,
    "output": 2048
  },
  "meta/llama-3.1-8b": {
    "context": 128000,
    "output": 8192
  },
  "meta/llama-3.2-1b-instruct": {
    "context": 16000,
    "output": 4096
  },
  "meta/llama-3.2-3b-instruct": {
    "context": 16000,
    "output": 4096
  },
  "meta/llama-3.2-90b-vision-instruct": {
    "context": 128000,
    "output": 8192
  },
  "meta/llama-3.3-70b": {
    "context": 128000,
    "output": 8192
  },
  "meta/llama-3.3-70b-instruct": {
    "context": 131072,
    "output": 32768
  },
  "meta/llama-3.3-70b-instruct-maas": {
    "context": 128000,
    "output": 8192
  },
  "meta/llama-4-maverick": {
    "context": 128000,
    "output": 8192
  },
  "meta/llama-4-maverick-17b-128e-instruct-maas": {
    "context": 524288,
    "output": 8192
  },
  "meta/llama-4-scout": {
    "context": 128000,
    "output": 8192
  },
  "meta/llama-4-scout-17b-16e-instruct-maas": {
    "context": 1310720,
    "output": 8192
  },
  "meta/llama-guard-4-12b": {
    "context": 163840,
    "output": 16384
  },
  "meta/muse-glimmer-30b": {
    "context": 131072
  },
  "meta/muse-spark-1.3": {
    "context": 1048576
  },
  "meta/muse-spark-1.3-contributor": {
    "context": 1048576
  },
  "meta/muse-wonder": {
    "context": 1048576
  },
  "meta/muse-wonder-1.0": {
    "context": 1048576
  },
  "microsoft/gpt-4": {
    "context": 8191,
    "output": 8192
  },
  "microsoft/o3-mini": {
    "context": 200000,
    "output": 100000
  },
  "microsoft/phi-4": {
    "context": 16384,
    "output": 14745
  },
  "mimo-v2-5": {
    "context": 1048576,
    "output": 131072
  },
  "mimo-v2-5-pro": {
    "context": 1048576,
    "output": 131072
  },
  "mimo-v2-5:free": {
    "context": 1048576,
    "output": 131072
  },
  "mimo-v2-6-flash": {
    "context": 1000000,
    "output": 131072
  },
  "mimo-v2-6-pro": {
    "context": 1000000,
    "output": 131072
  },
  "mimo-v2-6-pro-ultraspeed": {
    "context": 1000000,
    "output": 131072
  },
  "mimo-v2-flash": {
    "context": 256000,
    "output": 256000
  },
  "mimo-v2-flash-free": {
    "context": 262144,
    "output": 65536
  },
  "mimo-v2-omni-free": {
    "context": 262144,
    "output": 64000
  },
  "mimo-v2-pro": {
    "context": 1048576,
    "output": 131072
  },
  "mimo-v2-pro-free": {
    "context": 1048576,
    "output": 64000
  },
  "mimo-v2.5-free": {
    "context": 200000,
    "output": 32000
  },
  "mimo-v2.5-pro-ultraspeed": {
    "context": 1048576,
    "output": 131072
  },
  "mimo-v2.5-tts": {
    "context": 8192,
    "output": 8192
  },
  "mimo-v2.5-tts-voiceclone": {
    "context": 8192,
    "output": 8192
  },
  "mimo-v2.5-tts-voicedesign": {
    "context": 8192,
    "output": 8192
  },
  "mimo-v2.6-flash": {
    "context": 1048576,
    "output": 131072
  },
  "MiMo-V2.6-Flash": {
    "context": 1048576,
    "output": 131072
  },
  "mimo-v2.6-flash-free": {
    "context": 200000,
    "output": 32000
  },
  "mimo-v2.6-flash-rl": {
    "context": 1048576,
    "output": 131072
  },
  "mimo-v2.6-pro-flex": {
    "context": 1048560,
    "output": 393216
  },
  "mimo-v2.6-pro-rl": {
    "context": 1048576,
    "output": 131072
  },
  "mimo-v2.6-pro-ultraspeed": {
    "context": 1048576,
    "output": 131072
  },
  "mimo-v25": {
    "context": 1000000,
    "output": 100000
  },
  "mimo/mimo-v2.5": {
    "context": 1000000,
    "output": 131072
  },
  "mimo/mimo-v2.5-pro": {
    "context": 1000000,
    "output": 131072
  },
  "mindai/macaron-v1-tall": {
    "context": 262144,
    "output": 32768
  },
  "mindai/macaron-v1-venti": {
    "context": 1048576,
    "output": 131072
  },
  "mini_lm_l12_v2": {
    "context": 128,
    "output": 384
  },
  "minicpm-v-4.5": {
    "context": 32000,
    "output": 32000
  },
  "MiniCPM-V-4.7-1B": {
    "context": 262144,
    "output": 262144
  },
  "MiniCPM-V-4.7-35B-A3B": {
    "context": 262144,
    "output": 262144
  },
  "MiniCPM5-2B": {
    "context": 131072,
    "output": 131072
  },
  "minimax-latest": {
    "context": 1000000,
    "output": 512000
  },
  "MiniMax-M1": {
    "context": 1000000
  },
  "minimax-m2-5": {
    "context": 192000,
    "output": 8192
  },
  "MiniMax-M2.1": {
    "context": 204800,
    "output": 131072
  },
  "minimax-m2.1-free": {
    "context": 204800,
    "output": 131072
  },
  "minimax-m2.1-lightning": {
    "context": 196608,
    "output": 131072
  },
  "minimax-m2.5-free": {
    "context": 204800,
    "output": 131072
  },
  "minimax-m2.5-highspeed": {
    "context": 204800,
    "output": 131072
  },
  "MiniMax-M2.5-highspeed": {
    "context": 204800,
    "output": 131072
  },
  "MiniMax-M2.7-highspeed": {
    "context": 204800,
    "output": 131072
  },
  "minimax-m2.7:free": {
    "context": 204800,
    "output": 131072
  },
  "minimax-m25": {
    "context": 198000,
    "output": 32768
  },
  "minimax-m27": {
    "context": 198000,
    "output": 32768
  },
  "minimax-m3-1-flash": {
    "context": 1000000
  },
  "minimax-m3-free": {
    "context": 200000,
    "output": 32000
  },
  "minimax-m3-preview": {
    "context": 524288,
    "output": 65536
  },
  "minimax-m3:fast": {
    "context": 1048576,
    "output": 512000
  },
  "MiniMax-M3.1-Flash": {
    "context": 1000000,
    "output": 524288
  },
  "minimax-m3.1-flash-free": {
    "context": 1000000,
    "output": 512000
  },
  "MiniMax-M3.1-Flash-Preview": {
    "context": 1000000,
    "output": 512000
  },
  "minimax-m3.1-flash@eu": {
    "context": 1048576,
    "output": 1048576
  },
  "minimax-m3@eu": {
    "context": 1048576,
    "output": 1048576
  },
  "minimax-text-01": {
    "context": 1000000,
    "output": 131072
  },
  "minimax.minimax-m2": {
    "context": 204608,
    "output": 128000
  },
  "minimax.minimax-m2.1": {
    "context": 196608,
    "output": 131072
  },
  "minimax.minimax-m2.5": {
    "context": 196608,
    "output": 98304
  },
  "minimax/m2-her": {
    "context": 65536,
    "output": 2048
  },
  "minimax/m3.1-flash": {
    "context": 1000000,
    "output": 512000
  },
  "minimax/minimax-01": {
    "context": 1000192
  },
  "minimax/minimax-latest": {
    "context": 512000,
    "output": 80000
  },
  "minimax/minimax-m1": {
    "context": 1000000,
    "output": 40000
  },
  "minimax/MiniMax-M2": {
    "context": 204800,
    "output": 131072
  },
  "minimax/MiniMax-M2.1": {
    "context": 204800,
    "output": 131072
  },
  "minimax/MiniMax-M2.5": {
    "context": 204800,
    "output": 131072
  },
  "minimax/minimax-m2.5-highspeed": {
    "context": 204800
  },
  "minimax/minimax-m2.5-lightning": {
    "context": 204800,
    "output": 131072
  },
  "minimax/minimax-m2.7": {
    "context": 204800
  },
  "minimax/MiniMax-M2.7": {
    "context": 204800,
    "output": 131072
  },
  "MiniMax/MiniMax-M2.7": {
    "context": 204800,
    "output": 131072
  },
  "minimax/minimax-m2.7-highspeed": {
    "context": 204800
  },
  "minimax/MiniMax-M2.7-highspeed": {
    "context": 204800,
    "output": 131072
  },
  "minimax/minimax-m2.7-turbo": {
    "context": 204800,
    "output": 131072
  },
  "minimax/minimax-m3:thinking": {
    "context": 512000,
    "output": 80000
  },
  "minimax/MiniMax-M3.1-Flash": {
    "context": 1048576,
    "output": 512000
  },
  "minimax/minimax-text-01": {
    "context": 1000000,
    "output": 131072
  },
  "minimaxai/chat-completion/models/MiniMax-M2_5-high-throughput": {
    "context": 204800,
    "output": 131072
  },
  "minimaxai/minimax-m1-80k": {
    "context": 1000000,
    "output": 40000
  },
  "MiniMaxAI/MiniMax-M1-80k": {
    "context": 1000000
  },
  "MiniMaxAI/MiniMax-M2": {
    "context": 204800,
    "output": 131072
  },
  "minimaxai/minimax-m3": {
    "context": 1048576,
    "output": 1048576
  },
  "minimaxai/minimax-m3.1-flash": {
    "context": 262144,
    "output": 262144
  },
  "ministral-3b": {
    "context": 128000,
    "output": 8192
  },
  "ministral-3b-latest": {
    "context": 131072,
    "output": 128000
  },
  "ministral-8b-latest": {
    "context": 262144,
    "output": 128000
  },
  "mistral-3-14B": {
    "context": 262144,
    "output": 128000
  },
  "mistral-7b-instruct-v0.2": {
    "context": 32000,
    "output": 8192
  },
  "mistral-code-agent-latest": {
    "context": 262144,
    "output": 32768
  },
  "mistral-code-latest": {
    "context": 256000,
    "output": 32768
  },
  "mistral-embed": {
    "context": 8000,
    "output": 3072
  },
  "mistral-large-2402": {
    "context": 32000,
    "output": 8192
  },
  "mistral-large-2411": {
    "context": 128000,
    "output": 32768
  },
  "mistral-large-3:675b": {
    "context": 262144,
    "output": 262144
  },
  "mistral-large-4-0": {
    "context": 1000000,
    "output": 262144
  },
  "mistral-large-4-0-8": {
    "context": 1048576,
    "output": 262144
  },
  "mistral-large-4@eu": {
    "context": 524288,
    "output": 262144
  },
  "mistral-large:free": {
    "context": 262144,
    "output": 262144
  },
  "mistral-large2": {
    "context": 128000,
    "output": 8192
  },
  "mistral-medium-2508": {
    "context": 262144,
    "output": 262144
  },
  "mistral-medium-2604": {
    "context": 262144,
    "output": 262144
  },
  "mistral-medium-3": {
    "context": 131072,
    "output": 131072
  },
  "mistral-medium-3-5": {
    "context": 262144
  },
  "mistral-medium-3-5:free": {
    "context": 262144,
    "output": 262144
  },
  "mistral-medium-3-5@eu": {
    "context": 262144,
    "output": 209715
  },
  "mistral-medium-3.5": {
    "context": 256000,
    "output": 256000
  },
  "mistral-medium-latest@eu": {
    "context": 131072,
    "output": 131072
  },
  "mistral-nemo": {
    "context": 128000,
    "output": 16400
  },
  "mistral-small": {
    "context": 128000,
    "output": 16384
  },
  "mistral-small-2503": {
    "context": 128000
  },
  "mistral-small-2506": {
    "context": 128000,
    "output": 16384
  },
  "mistral-small-2603@eu": {
    "context": 256000,
    "output": 256000
  },
  "mistral-small-3-2-24b-instruct": {
    "context": 256000,
    "output": 16384
  },
  "mistral-small-4": {
    "context": 256000,
    "output": 65536
  },
  "mistral-small-4-119b": {
    "context": 256000,
    "output": 16384
  },
  "mistral-small-latest": {
    "context": 262144,
    "output": 256000
  },
  "mistral.devstral-2-123b": {
    "context": 262144,
    "output": 8192
  },
  "mistral.magistral-small-2509": {
    "context": 128000,
    "output": 40000
  },
  "mistral.ministral-3-14b-instruct": {
    "context": 128000,
    "output": 4096
  },
  "mistral.ministral-3-3b-instruct": {
    "context": 256000,
    "output": 8192
  },
  "mistral.ministral-3-8b-instruct": {
    "context": 128000,
    "output": 4096
  },
  "mistral.mistral-large-3-675b-instruct": {
    "context": 262144,
    "output": 8192
  },
  "mistral.pixtral-large-2502-v1:0": {
    "context": 128000,
    "output": 8192
  },
  "mistral.voxtral-mini-3b-2507": {
    "context": 32768,
    "output": 4096
  },
  "mistral.voxtral-small-24b-2507": {
    "context": 32768,
    "output": 8192
  },
  "mistral/codestral": {
    "context": 128000,
    "output": 4000
  },
  "mistral/codestral-2508": {
    "context": 256000
  },
  "mistral/codestral-2508@eu": {
    "context": 256000,
    "output": 8192
  },
  "mistral/codestral-embed": {
    "context": 8192,
    "output": 3072
  },
  "mistral/codestral-latest": {
    "context": 256000,
    "output": 4096
  },
  "mistral/codestral-latest@eu": {
    "context": 256000,
    "output": 4096
  },
  "mistral/devstral-2512@eu": {
    "context": 262144,
    "output": 262144
  },
  "mistral/devstral-medium-latest": {
    "context": 262144,
    "output": 262144
  },
  "mistral/devstral-medium-latest@eu": {
    "context": 262144,
    "output": 262144
  },
  "mistral/glm-5.3": {
    "context": 1048576,
    "output": 131072
  },
  "mistral/magistral-medium-latest@eu": {
    "context": 262144,
    "output": 16384
  },
  "mistral/ministral-14b": {
    "context": 262144,
    "output": 256000
  },
  "mistral/ministral-14b-2512": {
    "context": 262144
  },
  "mistral/ministral-14b-2512@eu": {
    "context": 262144,
    "output": 209715
  },
  "mistral/ministral-3b": {
    "context": 131072,
    "output": 4000
  },
  "mistral/ministral-3b-2512": {
    "context": 131072
  },
  "mistral/ministral-3b-2512@eu": {
    "context": 131072,
    "output": 104857
  },
  "mistral/ministral-8b": {
    "context": 262144,
    "output": 4000
  },
  "mistral/ministral-8b-2512": {
    "context": 262144
  },
  "mistral/ministral-8b-2512@eu": {
    "context": 262144,
    "output": 209715
  },
  "mistral/mistral-embed": {
    "context": 8000,
    "output": 3072
  },
  "mistral/mistral-large-2407": {
    "context": 131072,
    "output": 104857
  },
  "mistral/mistral-large-2407@eu": {
    "context": 131072,
    "output": 104857
  },
  "mistral/mistral-large-2512@eu": {
    "context": 262144,
    "output": 262144
  },
  "mistral/mistral-large-3": {
    "context": 262144,
    "output": 256000
  },
  "mistral/mistral-large-4@eu": {
    "context": 524288,
    "output": 262144
  },
  "mistral/mistral-large-latest@eu": {
    "context": 262144,
    "output": 262144
  },
  "mistral/mistral-medium-2505@eu": {
    "context": 131072,
    "output": 131072
  },
  "mistral/mistral-medium-2604": {
    "context": 262144,
    "output": 262144
  },
  "mistral/mistral-medium-2604@eu": {
    "context": 262144,
    "output": 262144
  },
  "mistral/mistral-medium-3": {
    "context": 262144,
    "output": 104857
  },
  "mistral/mistral-medium-3-5": {
    "context": 262144
  },
  "mistral/mistral-medium-3-5@eu": {
    "context": 262144,
    "output": 209715
  },
  "mistral/mistral-medium-3.5": {
    "context": 262144,
    "output": 256000
  },
  "mistral/mistral-medium-3@eu": {
    "context": 262144,
    "output": 104857
  },
  "mistral/mistral-medium-latest": {
    "context": 262144,
    "output": 262144
  },
  "mistral/mistral-medium-latest@eu": {
    "context": 262144,
    "output": 262144
  },
  "mistral/mistral-nemo": {
    "context": 131072,
    "output": 131072
  },
  "mistral/mistral-nemo-12b-instruct": {
    "context": 16000,
    "output": 4096
  },
  "mistral/mistral-small": {
    "context": 262144,
    "output": 4000
  },
  "mistral/mistral-small-2506": {
    "context": 128000,
    "output": 16384
  },
  "mistral/mistral-small-2603@eu": {
    "context": 262144,
    "output": 256000
  },
  "mistral/mistral-small-latest@eu": {
    "context": 262144,
    "output": 256000
  },
  "mistral/pixtral-large-latest": {
    "context": 128000,
    "output": 128000
  },
  "mistral/voxtral-small-latest@eu": {
    "context": 32768,
    "output": 32000
  },
  "mistral/zai-glm-5-2": {
    "context": 1000000,
    "output": 131072
  },
  "mistral/zai-glm-5-3": {
    "context": 1000000,
    "output": 131072
  },
  "mistral4-119b": {
    "context": 262144,
    "output": 81920
  },
  "mistralai--mistral-medium": {
    "context": 262144,
    "output": 262144
  },
  "mistralai--mistral-medium-instruct": {
    "context": 128000,
    "output": 128000
  },
  "mistralai--mistral-small": {
    "context": 128000,
    "output": 128000
  },
  "mistralai/codestral-2508": {
    "context": 256000
  },
  "mistralai/completion/models/Ministral-3-14B-Reasoning-2512": {
    "context": 262144,
    "output": 262144
  },
  "mistralai/completion/models/Ministral-3-3B-Reasoning-2512": {
    "context": 262144,
    "output": 262144
  },
  "mistralai/devstral-2-123b-instruct-2512": {
    "context": 262144,
    "output": 65536
  },
  "mistralai/devstral-2512": {
    "context": 262144
  },
  "mistralai/devstral-small-2505": {
    "context": 32768,
    "output": 8192
  },
  "mistralai/Devstral-Small-2505": {
    "context": 128000,
    "output": 4096
  },
  "mistralai/magistral-small-2506": {
    "context": 32768,
    "output": 32768
  },
  "mistralai/Magistral-Small-2506": {
    "context": 128000,
    "output": 4096
  },
  "mistralai/ministral-14b-2512": {
    "context": 262144
  },
  "mistralai/ministral-14b-instruct-2512": {
    "context": 262144,
    "output": 32768
  },
  "mistralai/Ministral-3-14B-Instruct-2512": {
    "context": 100000,
    "output": 25600
  },
  "mistralai/ministral-3b-2512": {
    "context": 131072
  },
  "mistralai/ministral-8b-2512": {
    "context": 262144
  },
  "mistralai/mistral-7b-instruct-v0.3": {
    "context": 65536,
    "output": 65536
  },
  "mistralai/mistral-large": {
    "context": 128000,
    "output": 102400
  },
  "mistralai/mistral-large-2407": {
    "context": 131072,
    "output": 104857
  },
  "mistralai/mistral-large-2512": {
    "context": 262144
  },
  "mistralai/mistral-large-4": {
    "context": 524288,
    "output": 262144
  },
  "mistralai/mistral-large-4-0": {
    "context": 1048576
  },
  "mistralai/Mistral-Large-Instruct-2411": {
    "context": 128000,
    "output": 4096
  },
  "mistralai/mistral-medium-3": {
    "context": 131072
  },
  "mistralai/mistral-medium-3-5": {
    "context": 262144,
    "output": 209715
  },
  "mistralai/mistral-medium-3-instruct": {
    "context": 131072,
    "output": 32768
  },
  "mistralai/mistral-medium-3.1": {
    "context": 131072
  },
  "mistralai/mistral-medium-3.5": {
    "context": 256000,
    "output": 32768
  },
  "mistralai/Mistral-Medium-3.5-128B": {
    "context": 262144,
    "output": 262144
  },
  "mistralai/mistral-medium-3.5:thinking": {
    "context": 256000,
    "output": 32768
  },
  "mistralai/mistral-nemo-instruct-2407": {
    "context": 16384,
    "output": 8192
  },
  "mistralai/mistral-saba": {
    "context": 32768,
    "output": 26214
  },
  "mistralai/mistral-small-24b-instruct-2501": {
    "context": 32768
  },
  "mistralai/Mistral-Small-24B-Instruct-2501": {
    "context": 32768,
    "output": 16384
  },
  "mistralai/mistral-small-2603": {
    "context": 262144
  },
  "mistralai/mistral-small-3-1-24b-instruct-2503": {
    "context": 131072,
    "output": 16384
  },
  "mistralai/mistral-small-3.1-24b-instruct": {
    "context": 128000
  },
  "mistralai/mistral-small-4-119b-2603": {
    "context": 262144,
    "output": 16384
  },
  "mistralai/Mistral-Small-4-119B-2603": {
    "context": 256000,
    "output": 256000
  },
  "mistralai/mistral-small-4-119b-2603:thinking": {
    "context": 262144,
    "output": 16384
  },
  "mistralai/mixtral-8x22b-instruct": {
    "context": 65536,
    "output": 52428
  },
  "mistralai/mixtral-8x22b-instruct-v0.1": {
    "context": 65536,
    "output": 52428
  },
  "mistralai/Voxtral-Small-24B-2507": {
    "context": 32000,
    "output": 32000
  },
  "mixedbread/toast-1": {
    "context": 131000,
    "output": 4000
  },
  "mixtral-8x7B-instruct-v0.1": {
    "context": 32000,
    "output": 4096
  },
  "mlabonne/NeuralDaredevil-8B-abliterated": {
    "context": 8192,
    "output": 8192
  },
  "model-router": {
    "context": 200000,
    "output": 16384
  },
  "moondream/moondream3-preview": {
    "context": 32000,
    "output": 4096
  },
  "moondream/moondream3.1-9b-a2b": {
    "context": 32000,
    "output": 4096
  },
  "moonshot-ai/kimi-k2.7-code": {
    "context": 262144,
    "output": 262144
  },
  "moonshot-ai/kimi-k3": {
    "context": 1048576,
    "output": 131072
  },
  "moonshot-kimi-k2-instruct": {
    "context": 131072,
    "output": 8192
  },
  "moonshot.kimi-k2-thinking": {
    "context": 262144,
    "output": 16000
  },
  "moonshot/kimi-k2.5": {
    "context": 262144
  },
  "moonshot/kimi-k2.7-code-highspeed": {
    "context": 262144
  },
  "moonshot/kimi-k3": {
    "context": 1048576
  },
  "moonshot/kimi-k3.1-pro": {
    "context": 1048576
  },
  "moonshot/kimi-k3.1-pro-highspeed": {
    "context": 1048576,
    "output": 1048576
  },
  "moonshotai.kimi-k2.5": {
    "context": 262144,
    "output": 16384
  },
  "moonshotai/chat-completion/models/Kimi-K2_6": {
    "context": 262144,
    "output": 262144
  },
  "moonshotai/kimi-k2": {
    "context": 131072
  },
  "moonshotai/Kimi-K2-Instruct": {
    "context": 131072,
    "output": 16384
  },
  "moonshotai/kimi-k2-instruct-0711": {
    "context": 128000,
    "output": 8192
  },
  "moonshotai/kimi-k2-thinking-maas": {
    "context": 262144,
    "output": 262144
  },
  "moonshotai/kimi-k2.5:thinking": {
    "context": 262144,
    "output": 65536
  },
  "moonshotai/Kimi-K2.6-TEE": {
    "context": 262144,
    "output": 65535
  },
  "moonshotai/Kimi-K2.6:peft:131072": {
    "context": 131072,
    "output": 131072
  },
  "moonshotai/kimi-k2.6:thinking": {
    "context": 262144,
    "output": 65536
  },
  "moonshotai/kimi-k2.7-code-highspeed": {
    "context": 262144
  },
  "moonshotai/Kimi-K2.7-Code-Highspeed": {
    "context": 262000,
    "output": 262000
  },
  "moonshotai/kimi-k3-fast": {
    "context": 1000000,
    "output": 131072
  },
  "moonshotai/Kimi-K3-Fast": {
    "context": 1000000,
    "output": 131072
  },
  "moonshotai/Kimi-K3-TEE": {
    "context": 1048576,
    "output": 65535
  },
  "moonshotai/kimi-k3.1-pro": {
    "context": 1048576
  },
  "moonshotai/kimi-k3.1-pro-highspeed": {
    "context": 1048576,
    "output": 1048576
  },
  "moonshotai/kimi-latest": {
    "context": 1048576,
    "output": 943718
  },
  "morph-dsv41flash": {
    "context": 1048576,
    "output": 1048576
  },
  "morph-dsv41flash-1017": {
    "context": 1048576,
    "output": 1048576
  },
  "morph-dsv4flash": {
    "context": 1048576,
    "output": 1048576
  },
  "morph-glm52-744b": {
    "context": 1048576,
    "output": 1048576
  },
  "morph-glm53-744b": {
    "context": 1048576,
    "output": 1048576
  },
  "morph-glm53flash": {
    "context": 1048576,
    "output": 1048576
  },
  "morph-kimik3": {
    "context": 1048576,
    "output": 1048576
  },
  "morph-kimik3-fast": {
    "context": 1048576,
    "output": 1048576
  },
  "morph-v3-fast": {
    "context": 262144,
    "output": 131072
  },
  "morph-v3-large": {
    "context": 262144,
    "output": 131072
  },
  "morph/morph-v3-large": {
    "context": 262144,
    "output": 131072
  },
  "motif-technologies/motif-3": {
    "context": 262144,
    "output": 262144
  },
  "multi-qa-mpnet-base-dot-v1": {
    "context": 512,
    "output": 768
  },
  "muse-glimmer-30b": {
    "context": 131072
  },
  "muse-glimmer-30b-tr": {
    "context": 131072,
    "output": 131072
  },
  "muse-spark-1-1": {
    "context": 1048576,
    "output": 131072
  },
  "muse-spark-1-2": {
    "context": 1048576,
    "output": 131072
  },
  "muse-spark-1-3": {
    "context": 1048576,
    "output": 131072
  },
  "muse-spark-1.2": {
    "context": 1048576,
    "output": 131072
  },
  "muse-spark-1.2-contributor": {
    "context": 1048576
  },
  "muse-spark-1.2-contributor-free": {
    "context": 1048576,
    "output": 131072
  },
  "muse-spark-1.3": {
    "context": 1048576
  },
  "muse-spark-1.3-contributor": {
    "context": 1048576
  },
  "muse-spark-1.3-contributor-free": {
    "context": 1048576,
    "output": 131072
  },
  "muse-spark-open": {
    "context": 1048576,
    "output": 131072
  },
  "muse-wonder": {
    "context": 1048576,
    "output": 131072
  },
  "muse-wonder-1.0": {
    "context": 1048576
  },
  "nano-banana-2": {
    "context": 131072,
    "output": 32768
  },
  "nano-banana-2-lite": {
    "context": 65536,
    "output": 4096
  },
  "nano-banana-pro": {
    "context": 65536,
    "output": 32768
  },
  "nano-gpt-help": {
    "context": 6000,
    "output": 512
  },
  "nanogpt/coding-router": {
    "context": 1000000,
    "output": 128000
  },
  "nanogpt/coding-router:high": {
    "context": 1000000,
    "output": 128000
  },
  "nanogpt/coding-router:low": {
    "context": 1000000,
    "output": 128000
  },
  "nanogpt/coding-router:max": {
    "context": 1000000,
    "output": 128000
  },
  "nanogpt/coding-router:medium": {
    "context": 1000000,
    "output": 128000
  },
  "nebius/deepseek-ai/DeepSeek-V4-Flash-0731": {
    "context": 1024000,
    "output": 384000
  },
  "nebius/deepseek-ai/DeepSeek-V4-Pro-0813": {
    "context": 979000,
    "output": 384000
  },
  "nebius/deepseek-ai/DeepSeek-V4.1-Flash": {
    "context": 1048000,
    "output": 384000
  },
  "nebius/deepseek-ai/DeepSeek-V4.1-Flash-1017": {
    "context": 1048576,
    "output": 384000
  },
  "nebius/google/gemma-3-27b-it": {
    "context": 110000,
    "output": 131072
  },
  "nebius/meta-models/muse-spark-open": {
    "context": 1048576,
    "output": 131072
  },
  "nebius/minimax-m3.1-flash": {
    "context": 1048576,
    "output": 1048576
  },
  "nebius/nvidia/nemotron-3-super-120b-a12b": {
    "context": 262144,
    "output": 262144
  },
  "nebius/nvidia/Nemotron-3-Ultra-550b-a55b": {
    "context": 1048576,
    "output": 128000
  },
  "nebius/openai/gpt-oss-120b": {
    "context": 131072,
    "output": 32768
  },
  "nebius/Qwen/Qwen3-235B-A22B-Instruct-2507": {
    "context": 262144,
    "output": 16384
  },
  "nebius/Qwen/Qwen3-30B-A3B-Instruct-2507": {
    "context": 262144,
    "output": 16384
  },
  "nemotron-3-nano-30b-a3b": {
    "context": 262144,
    "output": 262144
  },
  "nemotron-3-nano-omni-30b-a3b-reasoning-free": {
    "context": 256000,
    "output": 65536
  },
  "nemotron-3-nano-omni@eu": {
    "context": 300000,
    "output": 300000
  },
  "nemotron-3-nano:30b": {
    "context": 1048576,
    "output": 131072
  },
  "nemotron-3-super": {
    "context": 262144,
    "output": 65536
  },
  "nemotron-3-super-120b-a12b-free": {
    "context": 262144,
    "output": 262144
  },
  "nemotron-3-super-120b-a12b:free": {
    "context": 262144,
    "output": 262144
  },
  "nemotron-3-super-free": {
    "context": 204800,
    "output": 128000
  },
  "nemotron-3-ultra-550b-a55b-free": {
    "context": 1000000,
    "output": 128000
  },
  "nemotron-3-ultra-550b-a55b:free": {
    "context": 1000000,
    "output": 128000
  },
  "nemotron-3-ultra-free": {
    "context": 1000000,
    "output": 128000
  },
  "nemotron-3-ultra-nvfp4": {
    "context": 262144,
    "output": 262144
  },
  "nemotron-3.5-content-safety": {
    "context": 131072,
    "output": 8192
  },
  "nemotron-3.5-content-safety-free": {
    "context": 128000,
    "output": 8192
  },
  "nemotron-3.5-lightning-30b-a3b": {
    "context": 1048576,
    "output": 65536
  },
  "nemotron-3.5-lightning-free": {
    "context": 262144,
    "output": 262144
  },
  "nemotron-3.5-super-vl": {
    "context": 1048576,
    "output": 1048576
  },
  "nemotron-3.5-super-vl-free": {
    "context": 1048576,
    "output": 131072
  },
  "nemotron-lightning-3.5-30b-a3b": {
    "context": 262144,
    "output": 262144
  },
  "nemotron-nano-12b-v2-vl": {
    "context": 128000,
    "output": 16384
  },
  "nemotron-nano-v2-12b": {
    "context": 128000,
    "output": 128000
  },
  "nemotron3-super": {
    "context": 262144,
    "output": 262144
  },
  "neosmith.intelligent-basic": {
    "context": 1000000,
    "output": 128000
  },
  "neosmith.intelligent-maestro": {
    "context": 1000000,
    "output": 128000
  },
  "neosmith.intelligent-pro": {
    "context": 1000000,
    "output": 128000
  },
  "neosmith.neolite": {
    "context": 512000,
    "output": 64000
  },
  "NeverSleep/Lumimaid-v0.2-70B": {
    "context": 16384,
    "output": 8192
  },
  "nex-agi/Nex-N2-Pro": {
    "context": 262144,
    "output": 256000
  },
  "nex-agi/nex-n2.5-mini": {
    "context": 262144
  },
  "nex-agi/nex-n2.5-pro": {
    "context": 262144
  },
  "nomic-embed-text": {
    "context": 8192,
    "output": 768
  },
  "north-mini-code-1-0": {
    "context": 256000,
    "output": 64000
  },
  "north-mini-code-free": {
    "context": 256000,
    "output": 64000
  },
  "north-small-translate-09-2026": {
    "context": 32768,
    "output": 16000
  },
  "nothingiisreal/L3.1-70B-Celeste-V0.1-BF16": {
    "context": 32768,
    "output": 16384
  },
  "nousresearch/hermes-2-pro-llama-3-8b": {
    "context": 8192,
    "output": 8192
  },
  "nousresearch/hermes-3-llama-3.1-405b": {
    "context": 131072,
    "output": 16384
  },
  "nousresearch/hermes-3-llama-3.1-70b": {
    "context": 131072,
    "output": 16384
  },
  "NousResearch/hermes-3-llama-3.1-70b": {
    "context": 65536,
    "output": 8192
  },
  "nousresearch/hermes-4-405b": {
    "context": 131072,
    "output": 117964
  },
  "NousResearch/hermes-4-405b": {
    "context": 128000,
    "output": 8192
  },
  "NousResearch/Hermes-4-405B": {
    "context": 131072,
    "output": 8192
  },
  "NousResearch/hermes-4-405b:thinking": {
    "context": 128000,
    "output": 8192
  },
  "nova-2-lite": {
    "context": 1000000,
    "output": 65535
  },
  "nova-2-lite-v1": {
    "context": 1000000,
    "output": 64000
  },
  "nova-2-pro-v1": {
    "context": 1000000,
    "output": 64000
  },
  "nova-lite-v1": {
    "context": 300000,
    "output": 10000
  },
  "nova-micro-v1": {
    "context": 128000,
    "output": 10000
  },
  "nova-pro-v1": {
    "context": 300000,
    "output": 10000
  },
  "novita/deepseek-v3.2": {
    "context": 128000
  },
  "novita/deepseek-v4-flash": {
    "context": 1050000,
    "output": 393216
  },
  "novita/deepseek-v4.1-flash": {
    "context": 1048576,
    "output": 393216
  },
  "novita/deepseek-v4.1-flash-1017": {
    "context": 1048576,
    "output": 393216
  },
  "novita/gemma-4-26b-a4b-it": {
    "context": 262144,
    "output": 32768
  },
  "novita/gemma-4-31b-it": {
    "context": 262144,
    "output": 32768
  },
  "novita/glm-4.5v": {
    "context": 65536,
    "output": 16000
  },
  "novita/glm-4.6": {
    "context": 204800,
    "output": 131072
  },
  "novita/glm-4.7-flash": {
    "context": 200000,
    "output": 65500
  },
  "novita/glm-4.7-n": {
    "context": 205000,
    "output": 131072
  },
  "novita/glm-5.1": {
    "context": 204800,
    "output": 131072
  },
  "novita/glm-5.2": {
    "context": 1048576,
    "output": 131072
  },
  "novita/glm-5.3": {
    "context": 1048576,
    "output": 131072
  },
  "novita/glm-5.3-flash": {
    "context": 1048576,
    "output": 131072
  },
  "novita/hy3": {
    "context": 262144,
    "output": 262144
  },
  "novita/kimi-k2": {
    "context": 131072,
    "output": 131072
  },
  "novita/kimi-k2-thinking": {
    "context": 256000
  },
  "novita/kimi-k2.5": {
    "context": 128000,
    "output": 262144
  },
  "novita/kimi-k2.6": {
    "context": 262144,
    "output": 262144
  },
  "novita/kimi-k2.7-code": {
    "context": 262144,
    "output": 262144
  },
  "novita/kimi-k3": {
    "context": 1048576,
    "output": 1048576
  },
  "novita/ling-3.0-flash": {
    "context": 262144,
    "output": 32768
  },
  "novita/llama-3.3-70b-instruct": {
    "context": 131072,
    "output": 120000
  },
  "novita/llama-4-maverick-17b-instruct": {
    "context": 1048576,
    "output": 8192
  },
  "novita/llama-4-scout-17b-instruct": {
    "context": 131072,
    "output": 131072
  },
  "novita/minimax-m2.1": {
    "context": 205000,
    "output": 131072
  },
  "novita/minimax-m2.5": {
    "context": 204800,
    "output": 131100
  },
  "novita/minimax-m2.7": {
    "context": 204800,
    "output": 131100
  },
  "novita/minimax-m3.1-flash": {
    "context": 1000000,
    "output": 524288
  },
  "novita/qwen3-vl-30b-a3b-instruct": {
    "context": 131072,
    "output": 32768
  },
  "novita/qwen3.5-122b-a10b": {
    "context": 262144,
    "output": 65536
  },
  "novita/qwen3.6-35b-a3b": {
    "context": 262144,
    "output": 64000
  },
  "novita/qwen3.7-max": {
    "context": 1000000,
    "output": 65536
  },
  "novita/qwen3.8-2.4t-a95b": {
    "context": 1000000,
    "output": 131072
  },
  "novita/qwen3.8-27b": {
    "context": 1000000,
    "output": 131072
  },
  "novita/qwen3.8-flash": {
    "context": 1000000,
    "output": 131072
  },
  "novita/qwen3.8-max": {
    "context": 1000000,
    "output": 131072
  },
  "novita/qwen35-397b-a17b": {
    "context": 262144,
    "output": 64000
  },
  "novita/step-3.7-flash": {
    "context": 262144,
    "output": 256000
  },
  "nvidia--llama-3.2-nv-embedqa-1b": {
    "context": 8192,
    "output": 4096
  },
  "nvidia--llama-nemotron-embed-1b": {
    "context": 8192,
    "output": 2048
  },
  "nvidia-nemotron-3-5-super-vl-120b-a12b": {
    "context": 262144,
    "output": 32768
  },
  "nvidia-nemotron-3-super-120b-a12b": {
    "context": 262144,
    "output": 262144
  },
  "nvidia-nemotron-3-ultra": {
    "context": 262144,
    "output": 131072
  },
  "nvidia-nemotron-3-ultra-550b-a55b": {
    "context": 256000,
    "output": 32768
  },
  "nvidia.nemotron-nano-12b-v2": {
    "context": 131072,
    "output": 8192
  },
  "nvidia.nemotron-nano-3-30b": {
    "context": 262144,
    "output": 8192
  },
  "nvidia.nemotron-nano-9b-v2": {
    "context": 131072,
    "output": 8192
  },
  "nvidia.nemotron-super-3-120b": {
    "context": 262144,
    "output": 131072
  },
  "nvidia/bevformer": {
    "context": 128000,
    "output": 8192
  },
  "nvidia/cosmos-reason2-8b": {
    "context": 131072,
    "output": 16384
  },
  "nvidia/GLM-5.3-Flash-NVFP4": {
    "context": 1000000,
    "output": 131072
  },
  "nvidia/llama-3.1-nemotron-70b-instruct": {
    "context": 128000,
    "output": 8192
  },
  "nvidia/Llama-3.1-Nemotron-70B-Instruct-HF": {
    "context": 16384,
    "output": 8192
  },
  "nvidia/llama-3.1-nemotron-safety-guard-8b-v3": {
    "context": 128000,
    "output": 4096
  },
  "nvidia/llama-3.1-nemotron-ultra-253b-v1": {
    "context": 128000,
    "output": 16384
  },
  "nvidia/Llama-3.3-70B-Instruct-FP8": {
    "context": 128000,
    "output": 4096
  },
  "nvidia/Llama-3.3-Nemotron-Super-49B-v1": {
    "context": 128000,
    "output": 16384
  },
  "nvidia/Llama-3.3-Nemotron-Super-49B-v1.5": {
    "context": 131072,
    "output": 131072
  },
  "nvidia/llama-nemotron-embed-vl-1b-v2": {
    "context": 8192,
    "output": 2048
  },
  "nvidia/llama-nemotron-rerank-vl-1b-v2": {
    "context": 10240,
    "output": 4096
  },
  "nvidia/Nemotron-3_5-Lightning": {
    "context": 1048576,
    "output": 1048576
  },
  "nvidia/Nemotron-3-Nano-30B-A3B": {
    "context": 262144,
    "output": 262144
  },
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning": {
    "context": 256000,
    "output": 65536
  },
  "nvidia/Nemotron-3-Nano-Omni-30B-A3B-Reasoning": {
    "context": 262144,
    "output": 65536
  },
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free": {
    "context": 256000,
    "output": 65536
  },
  "nvidia/Nemotron-3-Nano-Omni-Reasoning-30B-A3B": {
    "context": 256000,
    "output": 65536
  },
  "nvidia/nemotron-3-super-120b-a12b:thinking": {
    "context": 262144,
    "output": 16384
  },
  "nvidia/Nemotron-3-Ultra-550b-a55b": {
    "context": 1048576,
    "output": 1048576
  },
  "nvidia/nemotron-3-ultra-550b-a55b:free": {
    "context": 1000000,
    "output": 65536
  },
  "nvidia/nemotron-3-ultra-550b-a55b:thinking": {
    "context": 1000000,
    "output": 65536
  },
  "nvidia/nemotron-3.5-content-safety:free": {
    "context": 128000,
    "output": 8192
  },
  "nvidia/nemotron-3.5-lightning-free": {
    "context": 1000000,
    "output": 65000
  },
  "nvidia/nemotron-3.5-lightning:free": {
    "context": 1000000,
    "output": 65536
  },
  "nvidia/nemotron-3.5-lightning:thinking": {
    "context": 1000000,
    "output": 65536
  },
  "nvidia/Nemotron-3.5-Super-VL": {
    "context": 1048576,
    "output": 1048576
  },
  "nvidia/nemotron-3.5-super-vl-120b-a12b": {
    "context": 1048576,
    "output": 8192
  },
  "nvidia/nemotron-3.5-super-vl:free": {
    "context": 1000000,
    "output": 131072
  },
  "nvidia/nemotron-nano-12b-v2-vl": {
    "context": 131072,
    "output": 131072
  },
  "nvidia/nemotron-voicechat": {
    "context": 128000,
    "output": 8192
  },
  "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B": {
    "context": 262144,
    "output": 262144
  },
  "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16": {
    "context": 65536,
    "output": 65536
  },
  "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-FP8": {
    "context": 1000000,
    "output": 262144
  },
  "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B": {
    "context": 262144,
    "output": 262144
  },
  "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-BF16": {
    "context": 65536,
    "output": 65536
  },
  "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-BF16:peft:262144": {
    "context": 262144,
    "output": 262144
  },
  "nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-BF16": {
    "context": 65536,
    "output": 65536
  },
  "nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-BF16:peft:262144": {
    "context": 262144,
    "output": 262144
  },
  "nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B": {
    "context": 262144,
    "output": 262144
  },
  "nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-BF16:peft:262144": {
    "context": 262144,
    "output": 262144
  },
  "nvidia/NVIDIA-Nemotron-3.5-Super-VL": {
    "context": 262144,
    "output": 262144
  },
  "nvidia/NVIDIA-Nemotron-3.5-Super-VL-120B-A12B": {
    "context": 1048576,
    "output": 1048576
  },
  "nvidia/NVIDIA-Nemotron-3.5-Super-VL-120B-A12B-BF16": {
    "context": 65536,
    "output": 65536
  },
  "nvidia/NVIDIA-Nemotron-3.5-Super-VL-120B-A12B-BF16:peft:262144": {
    "context": 262144,
    "output": 262144
  },
  "nvidia/NVIDIA-Nemotron-3.5-Super-VL-120B-A12B-NVFP4": {
    "context": 262144,
    "output": 4096
  },
  "nvidia/Qwen3.8-27B-NVFP4": {
    "context": 262144,
    "output": 32768
  },
  "nvidia/rerank-qa-mistral-4b": {
    "context": 128000,
    "output": 4096
  },
  "nvidia/riva-translate-4b-instruct-v1.1": {
    "context": 128000,
    "output": 4096
  },
  "nvidia/sparsedrive": {
    "context": 128000,
    "output": 8192
  },
  "nvidia/streampetr": {
    "context": 128000,
    "output": 8192
  },
  "nvidia/usdcode": {
    "context": 128000,
    "output": 4096
  },
  "o1": {
    "context": 200000,
    "output": 100000
  },
  "o1-mini": {
    "context": 128000,
    "output": 65536
  },
  "o1-pro": {
    "context": 200000,
    "output": 100000
  },
  "o3": {
    "context": 200000,
    "output": 100000
  },
  "o3-mini": {
    "context": 200000,
    "output": 100000
  },
  "o3-pro": {
    "context": 200000,
    "output": 100000
  },
  "o4-mini": {
    "context": 200000,
    "output": 100000
  },
  "o4-mini@eu": {
    "context": 200000,
    "output": 100000
  },
  "olafangensan-glm-4.7-flash-heretic": {
    "context": 200000,
    "output": 24000
  },
  "open-mistral-nemo": {
    "context": 128000,
    "output": 128000
  },
  "openai-gpt-4o": {
    "context": 128000,
    "output": 16384
  },
  "openai-gpt-4o-2024-11-20": {
    "context": 128000,
    "output": 16384
  },
  "openai-gpt-4o-mini": {
    "context": 128000,
    "output": 16384
  },
  "openai-gpt-4o-mini-2024-07-18": {
    "context": 128000,
    "output": 16384
  },
  "openai-gpt-5.1": {
    "context": 272000,
    "output": 8192
  },
  "openai-gpt-5.2": {
    "context": 400000,
    "output": 128000
  },
  "openai-gpt-5.2-pro": {
    "context": 400000,
    "output": 128000
  },
  "openai-gpt-5.3-codex": {
    "context": 400000,
    "output": 128000
  },
  "openai-gpt-5.4-mini": {
    "context": 400000,
    "output": 128000
  },
  "openai-gpt-5.4-nano": {
    "context": 400000,
    "output": 128000
  },
  "openai-gpt-5.4-pro": {
    "context": 1050000,
    "output": 128000
  },
  "openai-gpt-5.6-luna": {
    "context": 1050000,
    "output": 128000
  },
  "openai-gpt-5.6-sol": {
    "context": 1050000,
    "output": 128000
  },
  "openai-gpt-5.6-terra": {
    "context": 1050000,
    "output": 128000
  },
  "openai-gpt-52": {
    "context": 256000,
    "output": 65536
  },
  "openai-gpt-53-codex": {
    "context": 400000,
    "output": 128000
  },
  "openai-gpt-54": {
    "context": 1000000,
    "output": 131072
  },
  "openai-gpt-54-mini": {
    "context": 400000,
    "output": 128000
  },
  "openai-gpt-54-pro": {
    "context": 1000000,
    "output": 128000
  },
  "openai-gpt-55": {
    "context": 1000000,
    "output": 131072
  },
  "openai-gpt-55-pro": {
    "context": 1000000,
    "output": 128000
  },
  "openai-gpt-56-luna": {
    "context": 1000000,
    "output": 128000
  },
  "openai-gpt-56-luna-pro": {
    "context": 1000000,
    "output": 128000
  },
  "openai-gpt-56-sol": {
    "context": 1000000,
    "output": 128000
  },
  "openai-gpt-56-sol-pro": {
    "context": 1000000,
    "output": 128000
  },
  "openai-gpt-56-terra": {
    "context": 1000000,
    "output": 128000
  },
  "openai-gpt-56-terra-pro": {
    "context": 1000000,
    "output": 128000
  },
  "openai-gpt-6-1-sol": {
    "context": 1050000,
    "output": 128000
  },
  "openai-gpt-6-astra": {
    "context": 1050000,
    "output": 128000
  },
  "openai-gpt-6-astra-pro": {
    "context": 1050000,
    "output": 128000
  },
  "openai-gpt-6-luna": {
    "context": 1050000,
    "output": 128000
  },
  "openai-gpt-6-sol": {
    "context": 1050000,
    "output": 128000
  },
  "openai-gpt-61-sol": {
    "context": 1050000,
    "output": 128000
  },
  "openai-gpt-61-sol-ultrafast": {
    "context": 1050000,
    "output": 128000
  },
  "openai-gpt-61-terra": {
    "context": 1050000,
    "output": 128000
  },
  "openai-gpt-oss-120b": {
    "context": 128000
  },
  "openai-gpt-oss-20b": {
    "context": 128000,
    "output": 4096
  },
  "openai-o1": {
    "context": 200000,
    "output": 100000
  },
  "openai-o3": {
    "context": 200000,
    "output": 100000
  },
  "openai-o3-mini": {
    "context": 200000,
    "output": 100000
  },
  "openai.gpt-5.4": {
    "context": 1000000,
    "output": 128000
  },
  "openai.gpt-5.5": {
    "context": 1000000,
    "output": 128000
  },
  "openai.gpt-5.6-luna": {
    "context": 1050000,
    "output": 128000
  },
  "openai.gpt-5.6-sol": {
    "context": 1050000,
    "output": 128000
  },
  "openai.gpt-5.6-terra": {
    "context": 1050000,
    "output": 128000
  },
  "openai.gpt-6-astra": {
    "context": 1050000,
    "output": 128000
  },
  "openai.gpt-6-luna": {
    "context": 1050000,
    "output": 128000
  },
  "openai.gpt-6-sol": {
    "context": 1050000,
    "output": 128000
  },
  "openai.gpt-6.1-sol": {
    "context": 1050000,
    "output": 128000
  },
  "openai.gpt-6.1-terra": {
    "context": 1050000,
    "output": 128000
  },
  "openai.gpt-oss-120b-1:0": {
    "context": 131072,
    "output": 128000
  },
  "openai.gpt-oss-20b-1:0": {
    "context": 131072,
    "output": 128000
  },
  "openai.gpt-oss-safeguard-120b": {
    "context": 128000,
    "output": 16384
  },
  "openai.gpt-oss-safeguard-20b": {
    "context": 128000,
    "output": 16384
  },
  "openai/chat-completion/models/gpt-oss-120b-high-throughput": {
    "context": 131072,
    "output": 16384
  },
  "openai/chat-completion/models/gpt-oss-20b": {
    "context": 131072,
    "output": 16384
  },
  "openai/chat-latest": {
    "context": 400000,
    "output": 128000
  },
  "openai/chatgpt-4o-latest": {
    "context": 128000,
    "output": 8192
  },
  "openai/dall-e-3": {
    "context": 800
  },
  "openai/gpt-3.5-turbo-0613": {
    "context": 4095,
    "output": 3685
  },
  "openai/gpt-3.5-turbo-16k": {
    "context": 16385,
    "output": 4096
  },
  "openai/gpt-3.5-turbo-instruct": {
    "context": 3500,
    "output": 1024
  },
  "openai/gpt-3.5-turbo-raw": {
    "context": 4524,
    "output": 2048
  },
  "openai/gpt-4-turbo": {
    "context": 128000,
    "output": 4096
  },
  "openai/gpt-4.1-fast": {
    "context": 1047576,
    "output": 32768
  },
  "openai/gpt-4.1-mini-fast": {
    "context": 1047576,
    "output": 32768
  },
  "openai/gpt-4o": {
    "context": 128000
  },
  "openai/gpt-4o-2024-05-13": {
    "context": 128000
  },
  "openai/gpt-4o-2024-08-06": {
    "context": 128000,
    "output": 16384
  },
  "openai/gpt-4o-2024-11-20": {
    "context": 128000,
    "output": 16384
  },
  "openai/gpt-4o-aug": {
    "context": 128000,
    "output": 8192
  },
  "openai/gpt-4o-fast": {
    "context": 128000,
    "output": 16384
  },
  "openai/gpt-4o-mini-2024-07-18": {
    "context": 128000,
    "output": 16384
  },
  "openai/gpt-4o-mini-fast": {
    "context": 128000,
    "output": 16384
  },
  "openai/gpt-4o-mini-search": {
    "context": 128000,
    "output": 8192
  },
  "openai/gpt-4o-mini-transcribe": {
    "context": 16000,
    "output": 2000
  },
  "openai/gpt-4o-search": {
    "context": 128000,
    "output": 8192
  },
  "openai/gpt-4o-transcribe": {
    "context": 16000,
    "output": 2000
  },
  "openai/gpt-5-1": {
    "context": 400000,
    "output": 128000
  },
  "openai/gpt-5-2": {
    "context": 400000,
    "output": 128000
  },
  "openai/gpt-5-4": {
    "context": 1050000,
    "output": 128000
  },
  "openai/gpt-5-5": {
    "context": 1050000,
    "output": 128000
  },
  "openai/gpt-5-chat": {
    "context": 128000,
    "output": 16384
  },
  "openai/gpt-5-codex": {
    "context": 400000,
    "output": 128000
  },
  "openai/gpt-5-fast": {
    "context": 400000,
    "output": 128000
  },
  "openai/gpt-5-image": {
    "context": 400000,
    "output": 128000
  },
  "openai/gpt-5-image-mini": {
    "context": 400000,
    "output": 128000
  },
  "openai/gpt-5-mini-fast": {
    "context": 400000,
    "output": 128000
  },
  "openai/gpt-5-pro": {
    "context": 400000
  },
  "openai/gpt-5-search-api": {
    "context": 272000
  },
  "openai/gpt-5.1-2025-11-13": {
    "context": 400000,
    "output": 128000
  },
  "openai/gpt-5.1-chat-latest": {
    "context": 128000,
    "output": 16384
  },
  "openai/gpt-5.1-codex": {
    "context": 400000,
    "output": 128000
  },
  "openai/gpt-5.1-instant": {
    "context": 128000,
    "output": 16384
  },
  "openai/gpt-5.1-thinking": {
    "context": 400000,
    "output": 128000
  },
  "openai/gpt-5.1-thinking-fast": {
    "context": 400000,
    "output": 128000
  },
  "openai/gpt-5.2": {
    "context": 400000,
    "output": 128000
  },
  "openai/gpt-5.2-chat-latest": {
    "context": 128000,
    "output": 16384
  },
  "openai/gpt-5.2-codex": {
    "context": 400000,
    "output": 128000
  },
  "openai/gpt-5.2-fast": {
    "context": 400000,
    "output": 128000
  },
  "openai/gpt-5.2-instant": {
    "context": 128000,
    "output": 16384
  },
  "openai/gpt-5.2-pro": {
    "context": 400000
  },
  "openai/gpt-5.3-chat-latest": {
    "context": 128000,
    "output": 16384
  },
  "openai/gpt-5.3-codex": {
    "context": 400000,
    "output": 128000
  },
  "openai/gpt-5.3-codex-fast": {
    "context": 400000,
    "output": 128000
  },
  "openai/gpt-5.3-codex-spark": {
    "context": 128000,
    "output": 16384
  },
  "openai/gpt-5.3-instant": {
    "context": 128000,
    "output": 16384
  },
  "openai/gpt-5.4-fast": {
    "context": 1050000,
    "output": 128000
  },
  "openai/gpt-5.4-image-2": {
    "context": 272000,
    "output": 128000
  },
  "openai/gpt-5.4-mini-fast": {
    "context": 400000,
    "output": 128000
  },
  "openai/gpt-5.5-fast": {
    "context": 1000000,
    "output": 128000
  },
  "openai/gpt-5.6-luna": {
    "context": 1050000
  },
  "openai/gpt-5.6-luna-fast": {
    "context": 1050000,
    "output": 128000
  },
  "openai/gpt-5.6-luna-pro": {
    "context": 1050000,
    "output": 128000
  },
  "openai/gpt-5.6-sol": {
    "context": 1050000
  },
  "openai/gpt-5.6-sol-fast": {
    "context": 1050000,
    "output": 128000
  },
  "openai/gpt-5.6-sol-pro": {
    "context": 1050000,
    "output": 128000
  },
  "openai/gpt-5.6-terra": {
    "context": 1050000
  },
  "openai/gpt-5.6-terra-fast": {
    "context": 1050000,
    "output": 128000
  },
  "openai/gpt-5.6-terra-pro": {
    "context": 1050000,
    "output": 128000
  },
  "openai/gpt-6-astra": {
    "context": 1050000
  },
  "openai/gpt-6-astra-fast": {
    "context": 1050000,
    "output": 128000
  },
  "openai/gpt-6-astra-pro": {
    "context": 1050000,
    "output": 128000
  },
  "openai/gpt-6-luna": {
    "context": 1050000
  },
  "openai/gpt-6-luna-fast": {
    "context": 1050000,
    "output": 128000
  },
  "openai/gpt-6-luna-pro": {
    "context": 1050000,
    "output": 128000
  },
  "openai/gpt-6-sol": {
    "context": 1050000,
    "output": 128000
  },
  "openai/gpt-6-sol-fast": {
    "context": 1050000,
    "output": 128000
  },
  "openai/gpt-6-sol-pro": {
    "context": 1050000,
    "output": 128000
  },
  "openai/gpt-6.1-sol": {
    "context": 1050000,
    "output": 128000
  },
  "openai/gpt-6.1-sol-fast": {
    "context": 1050000,
    "output": 128000
  },
  "openai/gpt-6.1-sol-pro": {
    "context": 1050000,
    "output": 128000
  },
  "openai/gpt-6.1-terra": {
    "context": 1050000,
    "output": 128000
  },
  "openai/gpt-6.1-terra-fast": {
    "context": 1050000,
    "output": 128000
  },
  "openai/gpt-6.1-terra-pro": {
    "context": 1050000,
    "output": 128000
  },
  "openai/gpt-astra-latest": {
    "context": 1050000,
    "output": 128000
  },
  "openai/gpt-audio": {
    "context": 128000,
    "output": 16384
  },
  "openai/gpt-audio-mini": {
    "context": 128000,
    "output": 16384
  },
  "openai/gpt-image-1": {
    "context": 128000
  },
  "openai/gpt-image-1.5": {
    "context": 128000
  },
  "openai/gpt-image-2": {
    "context": 128000
  },
  "openai/gpt-latest": {
    "context": 1050000,
    "output": 128000
  },
  "openai/gpt-luna-latest": {
    "context": 1050000,
    "output": 128000
  },
  "openai/gpt-mini-latest": {
    "context": 1050000,
    "output": 128000
  },
  "openai/gpt-oss-120b-maas": {
    "context": 131072,
    "output": 131072
  },
  "openai/gpt-oss-120b:peft:131072": {
    "context": 131072,
    "output": 131072
  },
  "openai/gpt-oss-20b-maas": {
    "context": 131072,
    "output": 32768
  },
  "openai/gpt-pro-latest": {
    "context": 1050000,
    "output": 128000
  },
  "openai/gpt-realtime-1.5": {
    "context": 32000,
    "output": 4096
  },
  "openai/gpt-realtime-2": {
    "context": 128000,
    "output": 32000
  },
  "openai/gpt-realtime-2.1": {
    "context": 128000,
    "output": 32000
  },
  "openai/gpt-realtime-mini": {
    "context": 32000,
    "output": 4096
  },
  "openai/gpt-realtime-whisper": {
    "context": 16000,
    "output": 2000
  },
  "openai/gpt-sol-latest": {
    "context": 1050000,
    "output": 128000
  },
  "openai/gpt-terra-latest": {
    "context": 1050000,
    "output": 128000
  },
  "openai/o1": {
    "context": 200000,
    "output": 100000
  },
  "openai/o1-pro": {
    "context": 200000,
    "output": 100000
  },
  "openai/o3": {
    "context": 200000,
    "output": 100000
  },
  "openai/o3-deep-research": {
    "context": 200000,
    "output": 100000
  },
  "openai/o3-fast": {
    "context": 200000,
    "output": 100000
  },
  "openai/o3-mini": {
    "context": 200000,
    "output": 100000
  },
  "openai/o3-mini-high": {
    "context": 200000,
    "output": 100000
  },
  "openai/o3-mini-low": {
    "context": 200000,
    "output": 100000
  },
  "openai/o3-pro": {
    "context": 200000,
    "output": 100000
  },
  "openai/o3-pro-2025-06-10": {
    "context": 200000,
    "output": 100000
  },
  "openai/o4-mini": {
    "context": 200000,
    "output": 100000
  },
  "openai/o4-mini-deep-research": {
    "context": 200000,
    "output": 100000
  },
  "openai/o4-mini-high": {
    "context": 200000,
    "output": 100000
  },
  "openai/text-embedding-3-large": {
    "context": 8192
  },
  "openai/text-embedding-3-small": {
    "context": 8192
  },
  "openai/text-embedding-ada-002": {
    "context": 8192
  },
  "openai/whisper-1": {
    "context": 448000,
    "output": 4096
  },
  "openai/whisper-large-v3": {
    "context": 448
  },
  "openai/whisper-large-v3-turbo": {
    "context": 448,
    "output": 448
  },
  "openrouter/auto": {
    "context": 2000000
  },
  "openrouter/bodybuilder": {
    "context": 128000
  },
  "openrouter/free": {
    "context": 200000
  },
  "openrouter/fusion": {
    "context": 1000000,
    "output": 128000
  },
  "orcarouter/auto": {
    "context": 128000,
    "output": 16384
  },
  "orcarouter/free": {
    "context": 65536,
    "output": 32768
  },
  "orcarouter/fusion": {
    "context": 1000000,
    "output": 128000
  },
  "orcarouter/fusion-flash": {
    "context": 200000,
    "output": 128000
  },
  "orcarouter/fusion-mini": {
    "context": 1000000,
    "output": 128000
  },
  "Ornith-1.0-35B-FP8": {
    "context": 262000,
    "output": 100000
  },
  "ornith-ai/ornith-1.5-122b": {
    "context": 262144,
    "output": 32768
  },
  "ornith-ai/ornith-1.5-35b-a3b": {
    "context": 262144,
    "output": 32768
  },
  "ornith-ai/Ornith-1.5-35B-A3B": {
    "context": 262144,
    "output": 32768
  },
  "ornith-ai/ornith-1.5-35b-a3b:thinking": {
    "context": 262144,
    "output": 32768
  },
  "osmosis/osmosis-structure-0.6b": {
    "context": 4000,
    "output": 2048
  },
  "ovhcloud/gpt-oss-120b": {
    "context": 131072,
    "output": 32768
  },
  "ovhcloud/gpt-oss-20b": {
    "context": 131072,
    "output": 32768
  },
  "paddlepaddle/paddleocr-vl": {
    "context": 16384,
    "output": 16384
  },
  "PaddlePaddle/PaddleOCR-VL-1.5": {
    "context": 16384,
    "output": 16384
  },
  "pamanseau/OpenReasoning-Nemotron-32B": {
    "context": 32768,
    "output": 65536
  },
  "particle-ai/particle-1": {
    "context": 1048576,
    "output": 131072
  },
  "particle/particle-1": {
    "context": 1048576,
    "output": 131072
  },
  "perceptron/perceptron-mk1": {
    "context": 32768,
    "output": 8192
  },
  "perceptron/perceptron-mk1.5": {
    "context": 36864,
    "output": 8192
  },
  "perplexity/deepseek-v4-pro-0813": {
    "context": 1000000,
    "output": 384000
  },
  "perplexity/glm-5.3": {
    "context": 1000000,
    "output": 131072
  },
  "perplexity/glm-5.3-flash": {
    "context": 1000000,
    "output": 131072
  },
  "perplexity/kimi-k3": {
    "context": 1048576,
    "output": 131072
  },
  "perplexity/nemotron-3.5-super-120b-a12b": {
    "context": 1048576,
    "output": 131072
  },
  "perplexity/pplx-embed-v1-0.6b": {
    "context": 32000
  },
  "perplexity/pplx-embed-v1-4b": {
    "context": 32000
  },
  "perplexity/sonar-deep-research": {
    "context": 128000
  },
  "perplexity/sonar-pro": {
    "context": 200000
  },
  "perplexity/sonar-pro-search": {
    "context": 200000,
    "output": 8000
  },
  "perplexity/sonar-reasoning-pro": {
    "context": 128000
  },
  "perplexityai/sonar": {
    "context": 127072,
    "output": 4096
  },
  "perplexityai/sonar-deep-research": {
    "context": 128000,
    "output": 32768
  },
  "perplexityai/sonar-pro": {
    "context": 200000,
    "output": 8192
  },
  "perplexityai/sonar-reasoning-pro": {
    "context": 128000,
    "output": 4096
  },
  "phi-4": {
    "context": 128000,
    "output": 4096
  },
  "phi-4-mini": {
    "context": 128000,
    "output": 4096
  },
  "phi-4-mini-instruct": {
    "context": 128000,
    "output": 16384
  },
  "phi-4-mini-reasoning": {
    "context": 128000,
    "output": 4096
  },
  "phi-4-multimodal": {
    "context": 128000,
    "output": 4096
  },
  "phi-4-multimodal-instruct": {
    "context": 128000,
    "output": 16384
  },
  "phi-4-reasoning": {
    "context": 32000,
    "output": 4096
  },
  "phi-4-reasoning-plus": {
    "context": 32000,
    "output": 4096
  },
  "pixtral-12b": {
    "context": 128000,
    "output": 128000
  },
  "pixtral-12b-2409": {
    "context": 128000,
    "output": 4096
  },
  "pixtral-large-2502": {
    "context": 128000,
    "output": 128000
  },
  "pokee-isaac": {
    "context": 10000000,
    "output": 60000
  },
  "poolside/laguna-m.1": {
    "context": 262144,
    "output": 32768
  },
  "poolside/laguna-s-2.1-free": {
    "context": 256000,
    "output": 32768
  },
  "poolside/laguna-s-2.1:free": {
    "context": 262144,
    "output": 32768
  },
  "poolside/laguna-s-2.1:thinking": {
    "context": 1048576,
    "output": 131072
  },
  "poolside/laguna-xs-2.1": {
    "context": 262144
  },
  "poolside/laguna-xs-2.1:free": {
    "context": 262144,
    "output": 32768
  },
  "prism": {
    "context": 1000000,
    "output": 16000
  },
  "prism-ml/ternary-bonsai-2-27b": {
    "context": 262144,
    "output": 32768
  },
  "prism-ml/ternary-bonsai-2-9b": {
    "context": 262144,
    "output": 65536
  },
  "Pro/deepseek-ai/DeepSeek-R1": {
    "context": 164000,
    "output": 164000
  },
  "Pro/deepseek-ai/DeepSeek-V3": {
    "context": 164000,
    "output": 164000
  },
  "Pro/deepseek-ai/DeepSeek-V3.1-Terminus": {
    "context": 164000,
    "output": 164000
  },
  "Pro/deepseek-ai/DeepSeek-V3.2": {
    "context": 164000,
    "output": 164000
  },
  "Pro/moonshotai/Kimi-K2.5": {
    "context": 262000,
    "output": 262000
  },
  "Pro/moonshotai/Kimi-K2.6": {
    "context": 262000,
    "output": 262000
  },
  "Pro/zai-org/GLM-5": {
    "context": 205000,
    "output": 205000
  },
  "Pro/zai-org/GLM-5.1": {
    "context": 205000,
    "output": 205000
  },
  "public/deepseek-r1": {
    "context": 131072,
    "output": 32000
  },
  "public/deepseek-v3": {
    "context": 131072,
    "output": 8192
  },
  "public/minimax-m25": {
    "context": 204800,
    "output": 131072
  },
  "publicai/apertus-70b-instruct": {
    "context": 65536,
    "output": 8192
  },
  "publicai/apertus-8b-instruct": {
    "context": 65536,
    "output": 8192
  },
  "quartz/gemini-3.1-pro-preview": {
    "context": 1048576,
    "output": 65536
  },
  "quiverai/arrow-2": {
    "context": 131072,
    "output": 65536
  },
  "quiverai/arrow-2-telos": {
    "context": 131072,
    "output": 65536
  },
  "qvq-max": {
    "context": 131072,
    "output": 8192
  },
  "qwen-2.5-coder-32b": {
    "context": 128000,
    "output": 8192
  },
  "qwen-3-6-plus": {
    "context": 1000000
  },
  "qwen-3-7-max": {
    "context": 1000000,
    "output": 65536
  },
  "qwen-3-7-plus": {
    "context": 1000000,
    "output": 65536
  },
  "qwen-3-8-2-4t-a95b": {
    "context": 262144,
    "output": 65536
  },
  "qwen-3-8-27b": {
    "context": 262144,
    "output": 65536
  },
  "qwen-3-8-flash": {
    "context": 1000000,
    "output": 131072
  },
  "qwen-3-8-max": {
    "context": 1000000,
    "output": 131072
  },
  "qwen-3.6-plus": {
    "context": 1000000,
    "output": 65536
  },
  "qwen-3.8-27b-flex": {
    "context": 262128,
    "output": 131072
  },
  "qwen-deep-research": {
    "context": 1000000,
    "output": 32768
  },
  "qwen-doc-turbo": {
    "context": 131072,
    "output": 8192
  },
  "qwen-flash": {
    "context": 1000000,
    "output": 32768
  },
  "qwen-image": {
    "context": 8192,
    "output": 4096
  },
  "qwen-image-2.0": {
    "context": 8192
  },
  "qwen-image-2.0-pro": {
    "context": 8192
  },
  "qwen-image-2.1": {
    "context": 8192
  },
  "qwen-long": {
    "context": 10000000,
    "output": 8192
  },
  "qwen-math-plus": {
    "context": 4096,
    "output": 3072
  },
  "qwen-math-turbo": {
    "context": 4096,
    "output": 3072
  },
  "qwen-max-2025-01-25": {
    "context": 128000,
    "output": 4096
  },
  "qwen-mt-plus": {
    "context": 16384,
    "output": 8192
  },
  "qwen-mt-turbo": {
    "context": 16384,
    "output": 8192
  },
  "qwen-omni-turbo": {
    "context": 32768,
    "output": 2048
  },
  "qwen-omni-turbo-realtime": {
    "context": 32768,
    "output": 2048
  },
  "qwen-plus-character": {
    "context": 32768,
    "output": 4096
  },
  "qwen-plus-character-ja": {
    "context": 8192,
    "output": 512
  },
  "qwen-plus-latest": {
    "context": 1000000,
    "output": 8192
  },
  "qwen-turbo": {
    "context": 1000000
  },
  "qwen-vl-max": {
    "context": 131072,
    "output": 8192
  },
  "qwen-vl-max-2025-01-25": {
    "context": 128000,
    "output": 4096
  },
  "qwen-vl-ocr": {
    "context": 34096,
    "output": 4096
  },
  "qwen-vl-plus": {
    "context": 131072,
    "output": 8192
  },
  "qwen.qwen3-235b-a22b-2507-v1:0": {
    "context": 262144,
    "output": 131072
  },
  "qwen.qwen3-32b-v1:0": {
    "context": 32768,
    "output": 16384
  },
  "qwen.qwen3-coder-30b-a3b-v1:0": {
    "context": 262144,
    "output": 131072
  },
  "qwen.qwen3-coder-480b-a35b-v1:0": {
    "context": 131072,
    "output": 65536
  },
  "qwen.qwen3-coder-next": {
    "context": 262144,
    "output": 65536
  },
  "qwen.qwen3-next-80b-a3b": {
    "context": 262144,
    "output": 262000
  },
  "qwen.qwen3-vl-235b-a22b": {
    "context": 262144,
    "output": 262000
  },
  "qwen/deepseek-v4-flash-0731": {
    "context": 1000000,
    "output": 384000
  },
  "qwen/deepseek-v4-pro-0813": {
    "context": 1000000,
    "output": 384000
  },
  "qwen/deepseek-v4.1-flash": {
    "context": 1000000,
    "output": 384000
  },
  "qwen/deepseek-v4.1-flash-1017": {
    "context": 1000000,
    "output": 384000
  },
  "qwen/qwen-2.5-7b-instruct": {
    "context": 32768,
    "output": 29491
  },
  "qwen/qwen-2.5-7b-vision-instruct": {
    "context": 125000,
    "output": 4096
  },
  "qwen/qwen-2.5-coder-32b-instruct": {
    "context": 32768,
    "output": 29491
  },
  "qwen/qwen-flash": {
    "context": 1000000
  },
  "qwen/qwen-long": {
    "context": 10000000,
    "output": 8192
  },
  "qwen/qwen-vl-max": {
    "context": 128000,
    "output": 8000
  },
  "Qwen/Qwen2.5-7B-Instruct": {
    "context": 33000,
    "output": 4000
  },
  "Qwen/Qwen2.5-7B-Instruct-Turbo": {
    "context": 32768,
    "output": 32768
  },
  "qwen/qwen2.5-coder-32b-instruct": {
    "context": 32000,
    "output": 8192
  },
  "Qwen/Qwen2.5-Coder-32B-Instruct": {
    "context": 131072,
    "output": 8192
  },
  "Qwen/Qwen3-14B": {
    "context": 131000,
    "output": 131000
  },
  "Qwen/Qwen3-235B-A22B": {
    "context": 40960,
    "output": 16384
  },
  "qwen/qwen3-235b-a22b-fp8": {
    "context": 40960,
    "output": 20000
  },
  "qwen/qwen3-235b-a22b-instruct-2507-maas": {
    "context": 262144,
    "output": 16384
  },
  "Qwen/Qwen3-235B-A22B-Instruct-2507-tput": {
    "context": 262144,
    "output": 262144
  },
  "Qwen/Qwen3-235B-A22B-Thinking-2507": {
    "context": 262144
  },
  "Qwen/Qwen3-30B-A3B": {
    "context": 40960,
    "output": 16384
  },
  "qwen/qwen3-30b-a3b-2507": {
    "context": 262144,
    "output": 16384
  },
  "qwen/qwen3-30b-a3b-fp8": {
    "context": 40960,
    "output": 20000
  },
  "Qwen/Qwen3-30B-A3B-Thinking-2507": {
    "context": 262144,
    "output": 32768
  },
  "qwen/qwen3-32b-fp8": {
    "context": 40960,
    "output": 20000
  },
  "qwen/qwen3-8b": {
    "context": 41000,
    "output": 32768
  },
  "qwen/qwen3-coder-30b": {
    "context": 262144,
    "output": 65536
  },
  "Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8": {
    "context": 262144,
    "output": 262144
  },
  "Qwen/Qwen3-Coder-480B-A35B-Instruct-Turbo": {
    "context": 262144,
    "output": 66536
  },
  "Qwen/Qwen3-Coder-Next": {
    "context": 262144,
    "output": 65536
  },
  "Qwen/Qwen3-Coder-Next-FP8": {
    "context": 262144,
    "output": 262144
  },
  "qwen/qwen3-coder-plus": {
    "context": 1000000
  },
  "Qwen/Qwen3-Embedding-0.6B": {
    "context": 32768,
    "output": 1024
  },
  "qwen/qwen3-embedding-4b": {
    "context": 32000,
    "output": 2048
  },
  "Qwen/Qwen3-Embedding-4B": {
    "context": 32768
  },
  "qwen/qwen3-embedding-8b": {
    "context": 32768
  },
  "Qwen/Qwen3-Max": {
    "context": 256000,
    "output": 65536
  },
  "qwen/qwen3-max-preview": {
    "context": 256000,
    "output": 65536
  },
  "Qwen/Qwen3-Next-80B-A3B-Instruct": {
    "context": 262144
  },
  "qwen/qwen3-omni-30b-a3b-thinking": {
    "context": 65536,
    "output": 16384
  },
  "Qwen/Qwen3-Reranker-0.6B": {
    "context": 40960,
    "output": 1024
  },
  "Qwen/Qwen3-Reranker-4B": {
    "context": 32000,
    "output": 4096
  },
  "qwen/qwen3-reranker-8b": {
    "context": 32768
  },
  "Qwen/Qwen3-VL-235B-A22B-Instruct-FP8": {
    "context": 218000,
    "output": 16384
  },
  "qwen/qwen3-vl-235b-a22b-thinking": {
    "context": 131072
  },
  "Qwen/Qwen3-VL-235B-A22B-Thinking": {
    "context": 131072,
    "output": 32768
  },
  "qwen/qwen3-vl-30b-a3b-thinking": {
    "context": 262144,
    "output": 235929
  },
  "Qwen/Qwen3-VL-30B-A3B-Thinking": {
    "context": 262000,
    "output": 262000
  },
  "Qwen/Qwen3-VL-32B-Instruct": {
    "context": 262000,
    "output": 262000
  },
  "Qwen/Qwen3-VL-32B-Thinking": {
    "context": 262000,
    "output": 262000
  },
  "qwen/qwen3-vl-8b-instruct": {
    "context": 262144,
    "output": 235929
  },
  "Qwen/Qwen3-VL-8B-Instruct": {
    "context": 262000,
    "output": 262000
  },
  "Qwen/Qwen3-VL-Embedding-8B": {
    "context": 32000,
    "output": 4096
  },
  "qwen/qwen3-vl-flash": {
    "context": 262144,
    "output": 65536
  },
  "Qwen/Qwen3.5-122B-A10B": {
    "context": 262144
  },
  "Qwen/Qwen3.5-122B-A10B-FP8": {
    "context": 200000,
    "output": 65536
  },
  "qwen/qwen3.5-122b-a10b:thinking": {
    "context": 262144,
    "output": 32768
  },
  "Qwen/Qwen3.5-27B": {
    "context": 262144
  },
  "qwen/qwen3.5-27b:thinking": {
    "context": 260096,
    "output": 65536
  },
  "Qwen/Qwen3.5-35B-A3B": {
    "context": 262144
  },
  "Qwen/Qwen3.5-35B-A3B-Base": {
    "context": 65536,
    "output": 65536
  },
  "qwen/qwen3.5-35b-a3b:thinking": {
    "context": 260096,
    "output": 65536
  },
  "Qwen/Qwen3.5-397B-A17B-FP8": {
    "context": 200000,
    "output": 65536
  },
  "Qwen/Qwen3.5-397B-A17B-TEE": {
    "context": 262144,
    "output": 65536
  },
  "Qwen/Qwen3.5-397B-A17B:peft:262144": {
    "context": 262144,
    "output": 262144
  },
  "qwen/qwen3.5-397b-a17b:thinking": {
    "context": 262144,
    "output": 65536
  },
  "qwen/qwen3.5-4b": {
    "context": 262144,
    "output": 32768
  },
  "Qwen/Qwen3.5-4B:peft:262144": {
    "context": 262144,
    "output": 262144
  },
  "qwen/qwen3.5-9b": {
    "context": 262144
  },
  "Qwen/Qwen3.5-9B-Base": {
    "context": 65536,
    "output": 65536
  },
  "qwen/qwen3.5-flash-02-23": {
    "context": 1000000,
    "output": 65536
  },
  "qwen/qwen3.5-flash:thinking": {
    "context": 991808,
    "output": 65536
  },
  "qwen/qwen3.5-omni-flash": {
    "context": 49152,
    "output": 16384
  },
  "qwen/qwen3.5-omni-plus": {
    "context": 983616,
    "output": 65536
  },
  "Qwen/Qwen3.5-Plus": {
    "context": 1000000,
    "output": 65536
  },
  "qwen/qwen3.5-plus-02-15": {
    "context": 1000000,
    "output": 65536
  },
  "qwen/qwen3.5-plus-20260420": {
    "context": 1000000,
    "output": 65536
  },
  "qwen/qwen3.5-plus:thinking": {
    "context": 983616,
    "output": 65536
  },
  "Qwen/Qwen3.6-27B-TEE": {
    "context": 262144,
    "output": 65536
  },
  "qwen/qwen3.6-27b:thinking": {
    "context": 262144,
    "output": 65536
  },
  "Qwen/Qwen3.6-35B-A3B-FP8": {
    "context": 262144
  },
  "Qwen/Qwen3.6-35B-A3B:peft:262144": {
    "context": 262144,
    "output": 262144
  },
  "qwen/qwen3.6-35b-a3b:thinking": {
    "context": 1048576,
    "output": 16384
  },
  "Qwen/Qwen3.6-Plus": {
    "context": 1000000,
    "output": 65536
  },
  "qwen/qwen3.7-flash:thinking": {
    "context": 983616,
    "output": 65536
  },
  "qwen/qwen3.7-max:thinking": {
    "context": 1000000,
    "output": 65536
  },
  "qwen/qwen3.7-plus:thinking": {
    "context": 983616,
    "output": 65536
  },
  "Qwen/Qwen3.8-27B-abliterated": {
    "context": 262144,
    "output": 32768
  },
  "qwen/qwen3.8-27b-antislop": {
    "context": 262144,
    "output": 32768
  },
  "qwen/qwen3.8-27b-cybersecurity": {
    "context": 262144,
    "output": 32768
  },
  "qwen/qwen3.8-27b-darkidol": {
    "context": 262144,
    "output": 32768
  },
  "qwen/qwen3.8-27b-fable": {
    "context": 524288,
    "output": 32768
  },
  "qwen/qwen3.8-27b-fimi": {
    "context": 262144,
    "output": 32768
  },
  "Qwen/Qwen3.8-27B-FP8": {
    "context": 262144,
    "output": 65536
  },
  "qwen/qwen3.8-27b-hemmingway": {
    "context": 262144,
    "output": 32768
  },
  "qwen/qwen3.8-27b-kimiko": {
    "context": 262144,
    "output": 32768
  },
  "qwen/qwen3.8-27b-kiwen": {
    "context": 262144,
    "output": 32768
  },
  "qwen/qwen3.8-27b-novelist": {
    "context": 262144,
    "output": 32768
  },
  "qwen/qwen3.8-27b-queen": {
    "context": 524288,
    "output": 32768
  },
  "qwen/qwen3.8-27b-swift": {
    "context": 262144,
    "output": 32768
  },
  "qwen/qwen3.8-27b-synthia": {
    "context": 262144,
    "output": 32768
  },
  "Qwen/Qwen3.8-27B-TEE": {
    "context": 262144,
    "output": 65536
  },
  "qwen/qwen3.8-27b-uncensored": {
    "context": 1048576,
    "output": 65536
  },
  "qwen/qwen3.8-27b-uncensored:thinking": {
    "context": 1048576,
    "output": 65536
  },
  "Qwen/Qwen3.8-27B:peft:262144": {
    "context": 262144,
    "output": 262144
  },
  "qwen/qwen3.8-27b:thinking": {
    "context": 1048576,
    "output": 32768
  },
  "qwen/qwen3.8-flash-next": {
    "context": 262144,
    "output": 64000
  },
  "Qwen/Qwen3.8-Max-0902": {
    "context": 1000000,
    "output": 131072
  },
  "qwen/qwen3.8-max-preview": {
    "context": 1000000,
    "output": 131072
  },
  "qwen/qwen3.8-max-prime": {
    "context": 1000000,
    "output": 131072
  },
  "qwen/qwen3.8-max:thinking": {
    "context": 991000,
    "output": 131072
  },
  "Qwen/Qwen3.8-Omni-Flash": {
    "context": 1000000,
    "output": 131072
  },
  "qwen/qwenCoder/models/Qwen3-Coder-30B-A3B-Instruct": {
    "context": 262144,
    "output": 65536
  },
  "qwen/qwenLM/models/Qwen3-30B-A3B-Instruct-2507": {
    "context": 262144,
    "output": 262144
  },
  "qwen/qwenLM/models/Qwen3-30B-A3B-Thinking-2507": {
    "context": 262144,
    "output": 131072
  },
  "Qwen/QwQ-32B": {
    "context": 32768,
    "output": 32768
  },
  "qwen2-5-omni-7b": {
    "context": 32768,
    "output": 2048
  },
  "qwen2.5-coder-7b-fast": {
    "context": 32000,
    "output": 8192
  },
  "Qwen3_5-9B-MLX-4bit": {
    "context": 32768,
    "output": 8192
  },
  "Qwen3_5-9B-Q4_K_M": {
    "context": 32768,
    "output": 8192
  },
  "qwen3-235b-a22b-thinking": {
    "context": 262144,
    "output": 81920
  },
  "qwen3-30b-a3b-thinking-2507": {
    "context": 126000,
    "output": 32000
  },
  "qwen3-5-122b-a10b": {
    "context": 256000,
    "output": 64000
  },
  "qwen3-5-27b": {
    "context": 256000,
    "output": 64000
  },
  "qwen3-5-35b-a3b": {
    "context": 256000
  },
  "qwen3-5-4b": {
    "context": 262144,
    "output": 32768
  },
  "qwen3-5-9b": {
    "context": 262144,
    "output": 32768
  },
  "qwen3-5-flash": {
    "context": 1000000,
    "output": 32768
  },
  "qwen3-5-plus": {
    "context": 1000000,
    "output": 65536
  },
  "qwen3-6-27b": {
    "context": 256000
  },
  "qwen3-6-35b": {
    "context": 16384,
    "output": 16384
  },
  "qwen3-6-flash": {
    "context": 1000000,
    "output": 65536
  },
  "qwen3-6-plus": {
    "context": 1000000,
    "output": 65536
  },
  "qwen3-7-flash": {
    "context": 1000000,
    "output": 65536
  },
  "qwen3-7-max": {
    "context": 1000000,
    "output": 65536
  },
  "qwen3-7-plus": {
    "context": 1000000
  },
  "qwen3-8-27b": {
    "context": 262144,
    "output": 32768
  },
  "qwen3-8-flash": {
    "context": 1000000,
    "output": 131072
  },
  "qwen3-8-max": {
    "context": 1000000,
    "output": 131072
  },
  "qwen3-8-max-0902": {
    "context": 1000000,
    "output": 131072
  },
  "qwen3-8-omni-flash": {
    "context": 1000000,
    "output": 131072
  },
  "qwen3-8b": {
    "context": 131072,
    "output": 8192
  },
  "qwen3-asr-flash": {
    "context": 53248,
    "output": 4096
  },
  "qwen3-coder": {
    "context": 262144
  },
  "qwen3-coder-480b-a35b-instruct-turbo": {
    "context": 256000,
    "output": 65536
  },
  "Qwen3-Coder-Next-FP8": {
    "context": 256144,
    "output": 65536
  },
  "Qwen3-Coder-Next-FP8-no-thinking": {
    "context": 260000,
    "output": 65536
  },
  "qwen3-coder:30b": {
    "context": 262144,
    "output": 65536
  },
  "qwen3-embedding-0.6b": {
    "context": 8000,
    "output": 1024
  },
  "qwen3-embedding-4b": {
    "context": 32000,
    "output": 2560
  },
  "qwen3-embedding-8b": {
    "context": 32768,
    "output": 8192
  },
  "Qwen3-Embedding-8B": {
    "context": 32768
  },
  "qwen3-livetranslate-flash-realtime": {
    "context": 53248,
    "output": 4096
  },
  "qwen3-max-2025-09-23": {
    "context": 258048,
    "output": 65536
  },
  "qwen3-max-2026-01-23": {
    "context": 262144,
    "output": 32768
  },
  "qwen3-max-preview": {
    "context": 256000,
    "output": 64000
  },
  "qwen3-next-80b": {
    "context": 256000,
    "output": 16384
  },
  "Qwen3-Next-80B-A3B-Instruct": {
    "context": 129024,
    "output": 32768
  },
  "qwen3-next-80b-a3b-thinking": {
    "context": 131072,
    "output": 32768
  },
  "Qwen3-Next-80B-A3B-Thinking": {
    "context": 262144,
    "output": 32768
  },
  "qwen3-omni-flash": {
    "context": 65536,
    "output": 16384
  },
  "qwen3-omni-flash-realtime": {
    "context": 65536,
    "output": 16384
  },
  "qwen3-reranker-4b": {
    "context": 32768,
    "output": 8192
  },
  "qwen3-tts-voicedesign": {
    "context": 32768,
    "output": 1
  },
  "Qwen3-VL-235B-A22B-Instruct": {
    "context": 129024,
    "output": 32768
  },
  "qwen3-vl-235b-a22b-instruct-original": {
    "context": 32768,
    "output": 32768
  },
  "Qwen3-VL-235B-A22B-Thinking": {
    "context": 131072,
    "output": 32768
  },
  "qwen3-vl-30b-a3b": {
    "context": 131072,
    "output": 32768
  },
  "qwen3-vl-30b-a3b-instruct": {
    "context": 262144,
    "output": 8192
  },
  "qwen3-vl-30b-a3b-thinking": {
    "context": 128000,
    "output": 32000
  },
  "qwen3-vl-plus": {
    "context": 262144,
    "output": 32768
  },
  "qwen3.5-0.8b": {
    "context": 32768,
    "output": 8192
  },
  "qwen3.5-122b": {
    "context": 262144,
    "output": 16384
  },
  "qwen3.5-122b-a10b": {
    "context": 262144,
    "output": 65536
  },
  "Qwen3.5-122B-A10B": {
    "context": 262144,
    "output": 65536
  },
  "qwen3.5-27b": {
    "context": 262144,
    "output": 65536
  },
  "Qwen3.5-27B": {
    "context": 262144,
    "output": 65536
  },
  "Qwen3.5-27B-Blossom-V6.4-Derestricted": {
    "context": 262144,
    "output": 262144
  },
  "Qwen3.5-27B-BlueStar-v3-Derestricted": {
    "context": 262144,
    "output": 16384
  },
  "Qwen3.5-27B-Claude-4.6-Opus-Reasoning-Distilled-Derestricted": {
    "context": 262144,
    "output": 262144
  },
  "Qwen3.5-27B-Claude-4.6-Opus-Reasoning-Distilled-Derestricted-Lite": {
    "context": 262144,
    "output": 262144
  },
  "Qwen3.5-27B-Queen-Derestricted": {
    "context": 262144,
    "output": 16384
  },
  "qwen3.5-35b-a3b": {
    "context": 262144,
    "output": 65536
  },
  "Qwen3.5-35B-A3B": {
    "context": 262144,
    "output": 65536
  },
  "Qwen3.5-397B-A17B": {
    "context": 262144,
    "output": 65536
  },
  "qwen3.5-397b-a17b:free": {
    "context": 262144,
    "output": 65536
  },
  "qwen3.5-4b": {
    "context": 32768,
    "output": 8192
  },
  "qwen3.5-flash": {
    "context": 1000000,
    "output": 65536
  },
  "qwen3.6": {
    "context": 262144,
    "output": 65536
  },
  "Qwen3.6-27B-FP8": {
    "context": 262144,
    "output": 65536
  },
  "Qwen3.6-35B-A3B-FP8": {
    "context": 262000,
    "output": 65536
  },
  "Qwen3.6-35B-A3B-fp8-no-thinking": {
    "context": 262000,
    "output": 65536
  },
  "qwen3.6-35b-fast": {
    "context": 131056,
    "output": 131056
  },
  "qwen3.6-35b-flex": {
    "context": 131056,
    "output": 131056
  },
  "Qwen3.6-Flash": {
    "context": 1000000,
    "output": 65536
  },
  "qwen3.6-plus-free": {
    "context": 262144,
    "output": 65536
  },
  "qwen3.6:27b": {
    "context": 262144,
    "output": 65536
  },
  "qwen3.7-max-2026-06-08": {
    "context": 1000000,
    "output": 131072
  },
  "qwen3.8-2.4T-A95B": {
    "context": 262144,
    "output": 262144
  },
  "qwen3.8-2.4T-A95B@eu": {
    "context": 1000000,
    "output": 262144
  },
  "Qwen3.8-Flash": {
    "context": 1000000,
    "output": 131072
  },
  "qwen3.8-flash-free": {
    "context": 1000000,
    "output": 131072
  },
  "qwen3.8-flash-next": {
    "context": 262144
  },
  "Qwen3.8-Flash-Next": {
    "context": 262144,
    "output": 131072
  },
  "qwen3.8-flash-next@eu": {
    "context": 262144,
    "output": 262144
  },
  "Qwen3.8-Max": {
    "context": 1000000,
    "output": 131072
  },
  "qwen3.8-max-free": {
    "context": 1000000,
    "output": 131072
  },
  "qwen3.8-max-preview": {
    "context": 1000000,
    "output": 131072
  },
  "qwen35-122b-a10b": {
    "context": 262144,
    "output": 25000
  },
  "qwen35-397b-a17b": {
    "context": 262144,
    "output": 65536
  },
  "qwq-plus": {
    "context": 131072,
    "output": 8192
  },
  "ranoai/deepseek-v4-flash": {
    "context": 1000000,
    "output": 393216
  },
  "ReadyArt/MS3.2-The-Omega-Directive-24B-Unslop-v2.0": {
    "context": 32768,
    "output": 32768
  },
  "recraft/recraft-v2": {
    "context": 512
  },
  "recraft/recraft-v3": {
    "context": 512
  },
  "recursive/flint-v1.0:free": {
    "context": 262144,
    "output": 235929
  },
  "reflection-ai/beam-1.0-501b-a23b": {
    "context": 262144,
    "output": 131072
  },
  "reflection-beam": {
    "context": 1048576,
    "output": 1048576
  },
  "reflection/beam": {
    "context": 1048576,
    "output": 131072
  },
  "reflection/beam-1.0": {
    "context": 1048576,
    "output": 131072
  },
  "reflection/beam-1.0-501b-a23b": {
    "context": 1048576,
    "output": 131072
  },
  "reflection/Beam-1.0-501B-A23B": {
    "context": 1048576
  },
  "reflection/beam-free": {
    "context": 1048576,
    "output": 131072
  },
  "reka-ai/deepseek-v4.1-flash": {
    "context": 1048576,
    "output": 393216
  },
  "reka-ai/deepseek-v4.1-flash-1017": {
    "context": 1048576,
    "output": 393216
  },
  "reka-ai/glm-5.3": {
    "context": 1048576,
    "output": 262144
  },
  "reka-ai/glm-5.3-flash": {
    "context": 1048576,
    "output": 262144
  },
  "reka-ai/reka-edge-2603": {
    "context": 16384,
    "output": 16384
  },
  "reka-edge-2603": {
    "context": 16384,
    "output": 16384
  },
  "reka/reka-edge-2603": {
    "context": 16384,
    "output": 16384
  },
  "reka/reka-flash-3": {
    "context": 65536,
    "output": 65536
  },
  "rekaai/reka-edge": {
    "context": 16384
  },
  "rekaai/reka-flash-3": {
    "context": 65536,
    "output": 58982
  },
  "relace/relace-apply-3": {
    "context": 256000,
    "output": 128000
  },
  "relace/relace-search": {
    "context": 256000,
    "output": 128000
  },
  "Ring-1T": {
    "context": 128000,
    "output": 32000
  },
  "ring-2.6-1t": {
    "context": 262144,
    "output": 262144
  },
  "ring-2.6-1t-free": {
    "context": 262000,
    "output": 66000
  },
  "route-llm": {
    "context": 128000,
    "output": 64000
  },
  "runpod/kimi-k3": {
    "context": 1048576,
    "output": 1048576
  },
  "runware/deepseek-v4-flash": {
    "context": 1048576,
    "output": 384000
  },
  "runware/deepseek-v4-pro": {
    "context": 1048576,
    "output": 384000
  },
  "runware/deepseek-v4.1-flash": {
    "context": 1048576,
    "output": 384000
  },
  "runware/deepseek-v4.1-flash-1017": {
    "context": 1048576,
    "output": 1048576
  },
  "runware/gemma-4-31b-it": {
    "context": 262144,
    "output": 65536
  },
  "runware/glm-5.2": {
    "context": 1024000,
    "output": 128000
  },
  "runware/glm-5.3": {
    "context": 1000000,
    "output": 131072
  },
  "runware/glm-5.3-flash": {
    "context": 1000000,
    "output": 131072
  },
  "runware/gpt-oss-120b": {
    "context": 131072,
    "output": 32768
  },
  "runware/kimi-k2.6": {
    "context": 262144,
    "output": 131072
  },
  "runware/kimi-k3": {
    "context": 1048576,
    "output": 1048576
  },
  "runwayml/runway": {
    "context": 256
  },
  "runwayml/runway-gen-4-turbo": {
    "context": 256
  },
  "sakana-namazu": {
    "context": 262144,
    "output": 65536
  },
  "sakana/fugu-max": {
    "context": 1000000
  },
  "sakana/fugu-ultra": {
    "context": 1000000
  },
  "sakana/fugu-ultra-v1.1": {
    "context": 1000000,
    "output": 16384
  },
  "sakana/fugu-ultra-v2": {
    "context": 1000000
  },
  "sakana/fugu-ultra-v2.0": {
    "context": 1000000,
    "output": 1000000
  },
  "sakana/namazu": {
    "context": 256000,
    "output": 256000
  },
  "sakana/sakana-namazu": {
    "context": 262144,
    "output": 65536
  },
  "Salesforce/Llama-xLAM-2-70b-fc-r": {
    "context": 128000,
    "output": 16384
  },
  "Sao10K/L3-8B-Stheno-v3.2": {
    "context": 16384,
    "output": 8192
  },
  "sao10k/l3-lunaris-8b": {
    "context": 8192,
    "output": 7372
  },
  "Sao10K/L3.1-70B-Euryale-v2.2": {
    "context": 20480,
    "output": 16384
  },
  "Sao10K/L3.1-70B-Hanami-x1": {
    "context": 32768,
    "output": 16384
  },
  "sao10k/l3.1-euryale-70b": {
    "context": 131072,
    "output": 16384
  },
  "Sao10K/L3.3-70B-Euryale-v2.3": {
    "context": 20480,
    "output": 16384
  },
  "sao10k/l3.3-euryale-70b": {
    "context": 131072,
    "output": 16384
  },
  "sap-abap-1": {
    "context": 32768,
    "output": 4096
  },
  "sarvam-105b": {
    "context": 131072
  },
  "sarvam-30b": {
    "context": 65536,
    "output": 65536
  },
  "sarvam/sarvam-105b": {
    "context": 131072,
    "output": 131072
  },
  "scaledown/extract": {
    "context": 1000000,
    "output": 900000
  },
  "scaledown/scaledown-extract-1": {
    "context": 1000000,
    "output": 1000000
  },
  "scaledown/scaledown-summarize-1": {
    "context": 1000000,
    "output": 1000
  },
  "scaledown/summarize": {
    "context": 1000000,
    "output": 4000
  },
  "scaleway/deepseek-v4-flash-0731": {
    "context": 256000,
    "output": 384000
  },
  "scaleway/deepseek-v4.1-flash": {
    "context": 256000,
    "output": 384000
  },
  "scaleway/deepseek-v4.1-flash-1017": {
    "context": 1000000,
    "output": 384000
  },
  "scaleway/gemma-3-27b-it": {
    "context": 40000,
    "output": 131072
  },
  "scaleway/gpt-oss-120b": {
    "context": 128000,
    "output": 32768
  },
  "scaleway/llama-3.3-70b-instruct": {
    "context": 128000,
    "output": 4096
  },
  "scaleway/qwen3-235b-a22b-instruct-2507": {
    "context": 250000,
    "output": 16384
  },
  "scaleway/qwen3-coder-30b-a3b-instruct": {
    "context": 128000,
    "output": 65536
  },
  "sciforium/deepseek-v4.1-flash-1017": {
    "context": 1056784,
    "output": 384000
  },
  "scx-ai-gp/deepseek-v4.1-flash": {
    "context": 1000000,
    "output": 384000
  },
  "scx-ai-gp/glm-5.2": {
    "context": 1000000,
    "output": 131072
  },
  "scx-ai-gp/glm-5.2-fast": {
    "context": 1000000,
    "output": 131072
  },
  "scx-ai-gp/glm-5.3": {
    "context": 1000000,
    "output": 128000
  },
  "scx-ai-gp/glm-5.3-fast": {
    "context": 1000000,
    "output": 128000
  },
  "scx-ai-gp/glm-5.3-flash": {
    "context": 1048576,
    "output": 131072
  },
  "scx-ai-gp/kimi-k2.7-code": {
    "context": 262144,
    "output": 262144
  },
  "scx-ai-gp/kimi-k3": {
    "context": 1048576,
    "output": 1048576
  },
  "scx-ai-gp/qwen3.8-max": {
    "context": 1000000,
    "output": 131072
  },
  "scx-ai/gpt-oss-120b": {
    "context": 131072,
    "output": 32768
  },
  "scx-ai/minimax-m2.7": {
    "context": 196608,
    "output": 196608
  },
  "scx-ai/qwen3-32b": {
    "context": 32768,
    "output": 8192
  },
  "seed-1-6-250615": {
    "context": 256000,
    "output": 8192
  },
  "seed-1-6-250915": {
    "context": 256000,
    "output": 8192
  },
  "seed-1-6-flash-250715": {
    "context": 256000,
    "output": 8192
  },
  "seed-1-8-251228": {
    "context": 256000,
    "output": 8192
  },
  "seed-1.8": {
    "context": 256000,
    "output": 64000
  },
  "seed-2-0-code": {
    "context": 256000,
    "output": 128000
  },
  "seed-2-0-code-preview-260328": {
    "context": 262144,
    "output": 262144
  },
  "seed-2-0-lite": {
    "context": 256000,
    "output": 128000
  },
  "seed-2-0-lite-260428": {
    "context": 262144,
    "output": 262144
  },
  "seed-2-0-mini": {
    "context": 256000,
    "output": 128000
  },
  "seed-2-0-mini-260428": {
    "context": 262144,
    "output": 262144
  },
  "seed-2-0-pro": {
    "context": 256000,
    "output": 128000
  },
  "seed-2-0-pro-260328": {
    "context": 262144,
    "output": 262144
  },
  "seed-2-1-turbo": {
    "context": 256000,
    "output": 65536
  },
  "seed-2.0-code": {
    "context": 256000,
    "output": 131072
  },
  "seed-2.0-mini": {
    "context": 256000,
    "output": 32000
  },
  "seed-2.0-pro": {
    "context": 256000,
    "output": 128000
  },
  "sensenova-6.8-flash-lite": {
    "context": 262144,
    "output": 65536
  },
  "sference/deepseek-ai/DeepSeek-V4-Flash-0731": {
    "context": 1048576,
    "output": 384000
  },
  "sference/deepseek-ai/DeepSeek-V4.1-Flash-1017": {
    "context": 1048576,
    "output": 384000
  },
  "shisa-ai/shisa-v2-llama3.3-70b": {
    "context": 128000,
    "output": 16384
  },
  "shisa-ai/shisa-v2.1-llama3.3-70b": {
    "context": 32768,
    "output": 4096
  },
  "siliconflow/deepseek-r1-0528": {
    "context": 163840,
    "output": 32768
  },
  "siliconflow/deepseek-v3-0324": {
    "context": 163840,
    "output": 163840
  },
  "siliconflow/deepseek-v3.1-terminus": {
    "context": 163840,
    "output": 65536
  },
  "siliconflow/deepseek-v3.2": {
    "context": 163840,
    "output": 65536
  },
  "snowflake-llama3.3-70b": {
    "context": 128000,
    "output": 4096
  },
  "solar-mini": {
    "context": 32768,
    "output": 4096
  },
  "solar-mini4": {
    "context": 524288,
    "output": 131072
  },
  "solar-pro2": {
    "context": 65536,
    "output": 8192
  },
  "solar-pro3": {
    "context": 131072,
    "output": 8192
  },
  "solar-pro4": {
    "context": 524288,
    "output": 131072
  },
  "sonar-pro": {
    "context": 200000
  },
  "sonar-reasoning": {
    "context": 127000,
    "output": 4096
  },
  "soob3123/amoral-gemma3-27B-v2": {
    "context": 32768,
    "output": 8192
  },
  "soob3123/Veiled-Calla-12B": {
    "context": 32768,
    "output": 8192
  },
  "space-bunny": {
    "context": 1048576,
    "output": 524288
  },
  "space-bunny-free": {
    "context": 1048576,
    "output": 524288
  },
  "spacexai/grok-4.20-multi-agent": {
    "context": 2000000,
    "output": 2000000
  },
  "spacexai/grok-4.20-multi-agent-beta": {
    "context": 2000000,
    "output": 2000000
  },
  "spacexai/grok-4.20-non-reasoning": {
    "context": 2000000,
    "output": 2000000
  },
  "spacexai/grok-4.20-non-reasoning-beta": {
    "context": 2000000,
    "output": 2000000
  },
  "spacexai/grok-4.20-reasoning": {
    "context": 2000000,
    "output": 2000000
  },
  "spacexai/grok-4.20-reasoning-beta": {
    "context": 2000000,
    "output": 2000000
  },
  "spacexai/grok-4.3": {
    "context": 1000000,
    "output": 1000000
  },
  "spacexai/grok-4.5": {
    "context": 500000,
    "output": 500000
  },
  "spacexai/grok-4.6": {
    "context": 500000,
    "output": 500000
  },
  "spacexai/grok-4.7": {
    "context": 500000,
    "output": 500000
  },
  "spacexai/grok-build-0.1": {
    "context": 256000,
    "output": 256000
  },
  "spacexai/grok-imagine-image": {
    "context": 16000
  },
  "spacexai/grok-imagine-image-2.0": {
    "context": 64000
  },
  "spacexai/grok-imagine-video-1.5": {
    "context": 1024
  },
  "spacexai/grok-imagine-video-1.5-lite": {
    "context": 1024
  },
  "spacexai/grok-tts": {
    "context": 15000,
    "output": 15000
  },
  "speakleash/bielik-11b-v3.0-instruct": {
    "context": 32768,
    "output": 32768
  },
  "speakleash/Bielik-11B-v3.0-Instruct": {
    "context": 32000,
    "output": 32000
  },
  "stabilityai/stablediffusionxl": {
    "context": 200
  },
  "stable-diffusion-3.5-large": {
    "context": 256,
    "output": 1
  },
  "standardcompute": {
    "context": 1000000,
    "output": 50000
  },
  "stealth/glyph-cluster": {
    "context": 256000,
    "output": 256000
  },
  "Steelskull/L3.3-Cu-Mai-R1-70b": {
    "context": 32768,
    "output": 16384
  },
  "Steelskull/L3.3-Electra-R1-70b": {
    "context": 32768,
    "output": 16384
  },
  "Steelskull/L3.3-MS-Nevoria-70b": {
    "context": 32768,
    "output": 16384
  },
  "Steelskull/L3.3-Nevoria-R1-70b": {
    "context": 32768,
    "output": 16384
  },
  "step-3-5-flash": {
    "context": 256000,
    "output": 131072
  },
  "step-3-5-flash-2603": {
    "context": 256000,
    "output": 131072
  },
  "step-3-7-flash": {
    "context": 256000
  },
  "step-3-7-flash:free": {
    "context": 256000,
    "output": 256000
  },
  "step-3.5-flash": {
    "context": 256000,
    "output": 256000
  },
  "step-3.5-flash-2603": {
    "context": 256000,
    "output": 256000
  },
  "step-3.7-flash:free": {
    "context": 256000,
    "output": 256000
  },
  "step-5-preview-free": {
    "context": 1000000,
    "output": 65536
  },
  "step-router-v1": {
    "context": 256000,
    "output": 256000
  },
  "stepfun-ai/gelab-zero-4b-preview": {
    "context": 8192,
    "output": 4096
  },
  "stepfun-ai/step-3.5-flash": {
    "context": 262144,
    "output": 65536
  },
  "stepfun-ai/step-3.5-flash-2603": {
    "context": 262144,
    "output": 65536
  },
  "stepfun-ai/Step-3.7-Flash": {
    "context": 262144,
    "output": 256000
  },
  "stepfun-ai/step-5-preview": {
    "context": 1048576,
    "output": 1048576
  },
  "stepfun-ai/Step-5-Preview": {
    "context": 1048576,
    "output": 1000000
  },
  "stepfun/Step-3.5-Flash": {
    "context": 256000,
    "output": 256000
  },
  "stepfun/Step-3.7-Flash": {
    "context": 256000,
    "output": 256000
  },
  "stepfun/step-3.7-flash:thinking": {
    "context": 262144,
    "output": 256000
  },
  "stepfun/Step-5-Preview": {
    "context": 1000000,
    "output": 1000000
  },
  "subconscious/deepseek-v4.1-flash-marathon": {
    "context": 5000000,
    "output": 384000
  },
  "subconscious/glm-5.3-marathon": {
    "context": 5000000,
    "output": 131072
  },
  "swiss-ai/Apertus-v1.5-70B": {
    "context": 100000,
    "output": 8192
  },
  "synth-2.5-flash": {
    "context": 30000,
    "output": 30000
  },
  "synth-2.5-pro": {
    "context": 30000,
    "output": 30000
  },
  "tc-code-latest": {
    "context": 131072,
    "output": 16384
  },
  "TEE/deepseek-v3.2": {
    "context": 164000,
    "output": 65536
  },
  "TEE/deepseek-v4.1-flash": {
    "context": 1048576,
    "output": 384000
  },
  "TEE/gemma-4-26b-a4b-uncensored": {
    "context": 65536,
    "output": 65536
  },
  "TEE/gemma-4-31b-it": {
    "context": 262144,
    "output": 262144
  },
  "TEE/gemma4-31b": {
    "context": 262144,
    "output": 131072
  },
  "TEE/gemma4-31b:thinking": {
    "context": 262144,
    "output": 131072
  },
  "TEE/glm-5.1": {
    "context": 202752,
    "output": 65535
  },
  "TEE/glm-5.1-thinking": {
    "context": 202752,
    "output": 65535
  },
  "TEE/glm-5.2": {
    "context": 1048576,
    "output": 131072
  },
  "TEE/glm-5.2:thinking": {
    "context": 1048576,
    "output": 131072
  },
  "TEE/glm-5.3": {
    "context": 1048576,
    "output": 131072
  },
  "TEE/glm-5.3-flash": {
    "context": 1048576,
    "output": 131072
  },
  "TEE/gpt-oss-120b": {
    "context": 131072,
    "output": 16384
  },
  "TEE/kimi-k2.6": {
    "context": 262144,
    "output": 65536
  },
  "TEE/kimi-k2.7-code": {
    "context": 262144,
    "output": 65536
  },
  "TEE/kimi-k3": {
    "context": 1048576,
    "output": 65535
  },
  "TEE/llama3-3-70b": {
    "context": 128000,
    "output": 16384
  },
  "TEE/nemotron-3.5-lightning": {
    "context": 262144,
    "output": 65536
  },
  "TEE/qwen2.5-vl-72b-instruct": {
    "context": 65536,
    "output": 8192
  },
  "TEE/qwen3.5-27b": {
    "context": 262144,
    "output": 65536
  },
  "TEE/qwen3.5-397b-a17b": {
    "context": 262144,
    "output": 65536
  },
  "TEE/qwen3.6-27b": {
    "context": 262144,
    "output": 65536
  },
  "TEE/qwen3.6-35b-a3b": {
    "context": 262144,
    "output": 262144
  },
  "TEE/qwen3.8-27b": {
    "context": 262144,
    "output": 262144
  },
  "tencent/deepseek-v4-flash": {
    "context": 1000000,
    "output": 393216
  },
  "tencent/deepseek-v4-pro": {
    "context": 1000000,
    "output": 393216
  },
  "tencent/deepseek-v4-pro-0813": {
    "context": 1000000,
    "output": 384000
  },
  "tencent/deepseek-v4.1-flash": {
    "context": 1000000
  },
  "tencent/deepseek-v4.1-flash-1017": {
    "context": 1000000
  },
  "tencent/glm-5": {
    "context": 200000,
    "output": 128000
  },
  "tencent/glm-5-turbo": {
    "context": 200000,
    "output": 128000
  },
  "tencent/glm-5.1": {
    "context": 200000,
    "output": 128000
  },
  "tencent/glm-5.2": {
    "context": 1000000,
    "output": 128000
  },
  "tencent/glm-5.3": {
    "context": 1000000,
    "output": 128000
  },
  "tencent/glm-5.3-flash": {
    "context": 1000000,
    "output": 131072
  },
  "tencent/glm-5.3-flashx": {
    "context": 1000000,
    "output": 131072
  },
  "tencent/glm-5v-turbo": {
    "context": 200000,
    "output": 128000
  },
  "tencent/hunyuan-a13b-instruct": {
    "context": 131072,
    "output": 117964
  },
  "tencent/Hunyuan-A13B-Instruct": {
    "context": 131000,
    "output": 131000
  },
  "tencent/hy-mt2-1.8b": {
    "context": 8192,
    "output": 4096
  },
  "tencent/hy-mt2-30b-a3b": {
    "context": 8192,
    "output": 4096
  },
  "tencent/hy-mt2-7b": {
    "context": 8192,
    "output": 4096
  },
  "tencent/hy-mt2-lite": {
    "context": 8000,
    "output": 4000
  },
  "tencent/hy-mt2-pro": {
    "context": 8000,
    "output": 4000
  },
  "tencent/Hy3": {
    "context": 262144
  },
  "tencent/hy3-free": {
    "context": 256000,
    "output": 128000
  },
  "tencent/hy3-paid": {
    "context": 256000,
    "output": 128000
  },
  "tencent/hy3-preview": {
    "context": 262144,
    "output": 235929
  },
  "tencent/kimi-k2.6": {
    "context": 262144,
    "output": 262144
  },
  "tencent/kimi-k2.7-code": {
    "context": 262144,
    "output": 262144
  },
  "tencent/kimi-k2.7-code-highspeed": {
    "context": 262144,
    "output": 262144
  },
  "tencent/kimi-k2.8-preview": {
    "context": 1000000,
    "output": 1000000
  },
  "tencent/kimi-k3": {
    "context": 1048576,
    "output": 1048576
  },
  "tencent/mimo-v2.6-flash": {
    "context": 1000000,
    "output": 131072
  },
  "tencent/mimo-v2.6-pro": {
    "context": 1000000,
    "output": 131072
  },
  "tencent/minimax-m2.7": {
    "context": 200000,
    "output": 128000
  },
  "tencent/minimax-m3": {
    "context": 1000000,
    "output": 131072
  },
  "tencent/step-5-preview": {
    "context": 1000000
  },
  "tensorx/deepseek/deepseek-r1-0528": {
    "context": 164000,
    "output": 32768
  },
  "tensorx/deepseek/deepseek-v4-flash-0731": {
    "context": 1048576,
    "output": 384000
  },
  "tensorx/deepseek/deepseek-v4-pro-0813": {
    "context": 1048576,
    "output": 384000
  },
  "tensorx/deepseek/deepseek-v4.1-flash": {
    "context": 1048576,
    "output": 384000
  },
  "tensorx/deepseek/deepseek-v4.1-flash-1017": {
    "context": 1048576,
    "output": 384000
  },
  "tensorx/moonshotai/kimi-k2.5": {
    "context": 262144,
    "output": 262144
  },
  "text-embedding-3-large": {
    "context": 8191,
    "output": 3072
  },
  "text-embedding-3-small": {
    "context": 8191,
    "output": 1536
  },
  "text-embedding-ada-002": {
    "context": 8192,
    "output": 1536
  },
  "text-max": {
    "context": 1000000,
    "output": 128000
  },
  "text-prime": {
    "context": 196608,
    "output": 131072
  },
  "text-standard": {
    "context": 128000,
    "output": 65536
  },
  "TheDrummer/Anubis-70B-v1": {
    "context": 65536,
    "output": 16384
  },
  "TheDrummer/Anubis-70B-v1.1": {
    "context": 32000,
    "output": 16384
  },
  "TheDrummer/Artemis-v1.1": {
    "context": 262144,
    "output": 32768
  },
  "TheDrummer/Cydonia-24B-v2": {
    "context": 32768,
    "output": 32768
  },
  "TheDrummer/Cydonia-24B-v4": {
    "context": 32768,
    "output": 32768
  },
  "thedrummer/cydonia-24b-v4.1": {
    "context": 131072
  },
  "TheDrummer/Cydonia-24B-v4.1": {
    "context": 131072,
    "output": 117964
  },
  "TheDrummer/Cydonia-24B-v4.3": {
    "context": 131072,
    "output": 32768
  },
  "TheDrummer/Magidonia-24B-v4.3": {
    "context": 32768,
    "output": 32768
  },
  "TheDrummer/Rocinante-12B-v1.1": {
    "context": 16384,
    "output": 8192
  },
  "thedrummer/skyfall-36b-v2": {
    "context": 32768
  },
  "TheDrummer/skyfall-36b-v2": {
    "context": 32768,
    "output": 29491
  },
  "TheDrummer/UnslopNemo-12B-v4.1": {
    "context": 8192,
    "output": 26214
  },
  "thinkingmachines/Inkling-NVFP4": {
    "context": 1048576,
    "output": 262144
  },
  "thinkingmachines/inkling-small:free": {
    "context": 1048576,
    "output": 262144
  },
  "thinkingmachines/Inkling-Small:peft:262144": {
    "context": 262144,
    "output": 262144
  },
  "thinkingmachines/Inkling-Small:peft:262144:sampling-nvfp4": {
    "context": 262144,
    "output": 262144
  },
  "thinkingmachines/Inkling-Small:thinking": {
    "context": 524288,
    "output": 32768
  },
  "thinkingmachines/inkling:free": {
    "context": 1048576,
    "output": 262144
  },
  "thinkingmachines/Inkling:peft:262144": {
    "context": 262144,
    "output": 262144
  },
  "thinkingmachines/Inkling:peft:262144:sampling-nvfp4": {
    "context": 262144,
    "output": 262144
  },
  "thinkingmachines/inkling:thinking": {
    "context": 1040000,
    "output": 32768
  },
  "tiny-aya-earth": {
    "context": 8000,
    "output": 8000
  },
  "tiny-aya-fire": {
    "context": 8000,
    "output": 8000
  },
  "tiny-aya-global": {
    "context": 8000,
    "output": 8000
  },
  "tiny-aya-water": {
    "context": 8000,
    "output": 8000
  },
  "together_ai/deepseek-ai/DeepSeek-V4-Pro-0813": {
    "context": 1048576,
    "output": 384000
  },
  "together_ai/deepseek-ai/DeepSeek-V4.1-Flash": {
    "context": 1048576,
    "output": 384000
  },
  "together_ai/deepseek-ai/DeepSeek-V4.1-Flash-1017": {
    "context": 1048576,
    "output": 384000
  },
  "together_ai/meta-models/Muse-Glimmer-30B": {
    "context": 131072,
    "output": 131072
  },
  "together_ai/openai/gpt-oss-120b": {
    "context": 131072,
    "output": 32768
  },
  "together_ai/reflection/Beam-1.0-501B-A23B": {
    "context": 1048576,
    "output": 131072
  },
  "together_ai/thinkingmachines/Inkling": {
    "context": 524288,
    "output": 1048576
  },
  "together-ai/deepseek-v4-pro": {
    "context": 1048576,
    "output": 163840
  },
  "together-ai/deepseek-v4.1-flash": {
    "context": 1048576,
    "output": 393216
  },
  "together-ai/deepseek-v4.1-flash-1017": {
    "context": 1048576,
    "output": 393216
  },
  "together-ai/glm-4.7": {
    "context": 202752,
    "output": 128000
  },
  "together-ai/glm-5.3": {
    "context": 1048576,
    "output": 943717
  },
  "together-ai/glm-5.3-flash": {
    "context": 1048576,
    "output": 943717
  },
  "together-ai/gpt-oss-120b": {
    "context": 131072,
    "output": 32768
  },
  "together-ai/kimi-k3": {
    "context": 1000000,
    "output": 1000000
  },
  "together-ai/minimax-m3": {
    "context": 524288,
    "output": 131072
  },
  "together-ai/minimax-m3.1-flash": {
    "context": 1048576,
    "output": 1048576
  },
  "together-ai/muse-glimmer-30b": {
    "context": 131072,
    "output": 117964
  },
  "together-ai/qwen3.8-2.4t-a95b": {
    "context": 1010000,
    "output": 909000
  },
  "tongyi-intent-detect-v3": {
    "context": 8192,
    "output": 1024
  },
  "topazlabs-co/topazlabs": {
    "context": 204
  },
  "trendyol-asure-12b": {
    "context": 40960,
    "output": 40960
  },
  "trinity-large-preview-free": {
    "context": 131072,
    "output": 131072
  },
  "trinity-large-thinking": {
    "context": 262144,
    "output": 80000
  },
  "trustedrouter/auto": {
    "context": 1000000,
    "output": 131072
  },
  "trustedrouter/cheap": {
    "context": 1000000,
    "output": 131072
  },
  "trustedrouter/e2e": {
    "context": 1000000,
    "output": 131072
  },
  "trustedrouter/fast": {
    "context": 1000000,
    "output": 131072
  },
  "trustedrouter/synth": {
    "context": 1000000,
    "output": 131072
  },
  "trustedrouter/synth-code": {
    "context": 1000000,
    "output": 131072
  },
  "trustedrouter/zdr": {
    "context": 1000000,
    "output": 131072
  },
  "trytako/tako": {
    "context": 2048
  },
  "umans-coder": {
    "context": 1048576,
    "output": 131071
  },
  "umans-deepseek-v4-flash-0731": {
    "context": 1048576,
    "output": 393215
  },
  "umans-deepseek-v4.1-flash": {
    "context": 1048576,
    "output": 393215
  },
  "umans-deepseek-v4.1-flash-1017": {
    "context": 1048576,
    "output": 393215
  },
  "umans-flash": {
    "context": 262144
  },
  "umans-glm-5.3": {
    "context": 1048576,
    "output": 131071
  },
  "umans-glm-5.3-flash": {
    "context": 1048576,
    "output": 131071
  },
  "umans-kimi-k3": {
    "context": 1048576,
    "output": 131072
  },
  "umans-qwen3.6-35b-a3b": {
    "context": 262144,
    "output": 262144
  },
  "unbiased/pareto": {
    "context": 262144,
    "output": 131072
  },
  "unbiased/pareto-26.10": {
    "context": 1048576,
    "output": 131072
  },
  "unbiased/pareto-26.9": {
    "context": 262144,
    "output": 131072
  },
  "undi95/remm-slerp-l2-13b": {
    "context": 6144
  },
  "universal-summarizer": {
    "context": 32768,
    "output": 32768
  },
  "unsloth/gemma-3-12b-it": {
    "context": 131072,
    "output": 16384
  },
  "unsloth/gemma-3-27b-it": {
    "context": 128000,
    "output": 96000
  },
  "unsloth/gemma-3-4b-it": {
    "context": 128000,
    "output": 8192
  },
  "unsloth/qwen3.8-27b-gguf": {
    "context": 101072,
    "output": 101072
  },
  "upstage/solar-mini4": {
    "context": 524288,
    "output": 131072
  },
  "upstage/solar-mini4:thinking": {
    "context": 524288,
    "output": 131072
  },
  "upstage/solar-pro2": {
    "context": 65536,
    "output": 8192
  },
  "upstage/solar-pro3": {
    "context": 131072,
    "output": 8192
  },
  "upstage/solar-pro4": {
    "context": 524288,
    "output": 131072
  },
  "upstage/solar-pro4:thinking": {
    "context": 524288,
    "output": 131072
  },
  "us-gov.openai.gpt-oss-120b-1:0": {
    "context": 128000,
    "output": 16384
  },
  "us-gov.openai.gpt-oss-20b-1:0": {
    "context": 128000,
    "output": 16384
  },
  "us.amazon.nova-2-lite-v1:0": {
    "context": 1000000,
    "output": 65535
  },
  "us.amazon.nova-lite-v1:0": {
    "context": 300000,
    "output": 10000
  },
  "us.amazon.nova-micro-v1:0": {
    "context": 128000,
    "output": 10000
  },
  "us.amazon.nova-premier-v1:0": {
    "context": 1000000,
    "output": 10000
  },
  "us.amazon.nova-pro-v1:0": {
    "context": 300000,
    "output": 10000
  },
  "us.anthropic.claude-fable-5": {
    "context": 1000000,
    "output": 128000
  },
  "us.anthropic.claude-fable-5-1": {
    "context": 1000000,
    "output": 128000
  },
  "us.anthropic.claude-haiku-4-5-20251001-v1:0": {
    "context": 200000,
    "output": 64000
  },
  "us.anthropic.claude-haiku-5-5": {
    "context": 1000000,
    "output": 128000
  },
  "us.anthropic.claude-opus-4-1-20250805-v1:0": {
    "context": 200000,
    "output": 32000
  },
  "us.anthropic.claude-opus-4-5-20251101-v1:0": {
    "context": 200000,
    "output": 64000
  },
  "us.anthropic.claude-opus-4-6-v1": {
    "context": 1000000,
    "output": 128000
  },
  "us.anthropic.claude-opus-4-7": {
    "context": 1000000,
    "output": 128000
  },
  "us.anthropic.claude-opus-4-8": {
    "context": 1000000,
    "output": 128000
  },
  "us.anthropic.claude-opus-5": {
    "context": 1000000,
    "output": 128000
  },
  "us.anthropic.claude-opus-5-5": {
    "context": 1000000,
    "output": 128000
  },
  "us.anthropic.claude-sonnet-4-20250514-v1:0": {
    "context": 200000,
    "output": 64000
  },
  "us.anthropic.claude-sonnet-4-5-20250929-v1:0": {
    "context": 200000,
    "output": 64000
  },
  "us.anthropic.claude-sonnet-4-6": {
    "context": 1000000,
    "output": 128000
  },
  "us.anthropic.claude-sonnet-5": {
    "context": 1000000,
    "output": 128000
  },
  "us.anthropic.claude-sonnet-5-5": {
    "context": 1000000,
    "output": 128000
  },
  "us.deepseek.r1-v1:0": {
    "context": 128000,
    "output": 32768
  },
  "us.meta.llama3-1-70b-instruct-v1:0": {
    "context": 128000,
    "output": 4096
  },
  "us.meta.llama3-1-8b-instruct-v1:0": {
    "context": 128000,
    "output": 4096
  },
  "us.meta.llama3-3-70b-instruct-v1:0": {
    "context": 128000,
    "output": 4096
  },
  "us.meta.llama4-maverick-17b-instruct-v1:0": {
    "context": 1000000,
    "output": 8192
  },
  "us.meta.llama4-scout-17b-instruct-v1:0": {
    "context": 10000000,
    "output": 8192
  },
  "us.mistral.pixtral-large-2502-v1:0": {
    "context": 128000,
    "output": 8192
  },
  "us.moonshotai.kimi-k3": {
    "context": 1048576,
    "output": 128000
  },
  "us.openai.gpt-5.6-luna": {
    "context": 1050000,
    "output": 128000
  },
  "us.openai.gpt-5.6-sol": {
    "context": 1050000,
    "output": 128000
  },
  "us.openai.gpt-5.6-terra": {
    "context": 1050000,
    "output": 128000
  },
  "us.openai.gpt-6-astra": {
    "context": 1050000,
    "output": 128000
  },
  "us.openai.gpt-6-luna": {
    "context": 1050000,
    "output": 128000
  },
  "us.openai.gpt-6-sol": {
    "context": 1050000,
    "output": 128000
  },
  "us.openai.gpt-6.1-sol": {
    "context": 1050000,
    "output": 128000
  },
  "us.openai.gpt-6.1-terra": {
    "context": 1050000,
    "output": 128000
  },
  "us.writer.palmyra-x4-v1:0": {
    "context": 122880,
    "output": 8192
  },
  "us.writer.palmyra-x5-v1:0": {
    "context": 1040000,
    "output": 8192
  },
  "us.xai.grok-4.6": {
    "context": 500000,
    "output": 500000
  },
  "us.xai.grok-4.7": {
    "context": 500000,
    "output": 500000
  },
  "us.zai.glm-5.3": {
    "context": 1000000,
    "output": 128000
  },
  "venice-uncensored": {
    "context": 128000,
    "output": 8192
  },
  "venice-uncensored-1-2": {
    "context": 128000,
    "output": 8192
  },
  "venice-uncensored-role-play": {
    "context": 128000,
    "output": 4096
  },
  "vertex-anthropic/claude-haiku-4-5": {
    "context": 200000,
    "output": 64000
  },
  "vertex-anthropic/claude-opus-4-5-20251101": {
    "context": 200000,
    "output": 32000
  },
  "vertex-anthropic/claude-opus-4-6": {
    "context": 1000000,
    "output": 128000
  },
  "vertex-anthropic/claude-opus-4-7": {
    "context": 1000000,
    "output": 128000
  },
  "vertex-anthropic/claude-sonnet-4-5": {
    "context": 200000,
    "output": 64000
  },
  "vertex-anthropic/claude-sonnet-4-6": {
    "context": 1000000,
    "output": 64000
  },
  "vertex-anthropic/claude-sonnet-5": {
    "context": 1000000,
    "output": 128000
  },
  "vertex-openai/grok-4-20-non-reasoning": {
    "context": 2000000,
    "output": 30000
  },
  "vertex-openai/grok-4-20-reasoning": {
    "context": 2000000,
    "output": 30000
  },
  "vertex-openai/grok-4-6": {
    "context": 500000,
    "output": 500000
  },
  "vertex-openai/grok-4-7": {
    "context": 524288,
    "output": 524288
  },
  "vertex/gemini-2.5-flash-image": {
    "context": 32768,
    "output": 32768
  },
  "vertex/gemini-3-flash-preview": {
    "context": 1048576,
    "output": 65536
  },
  "vertex/gemini-3-pro-image": {
    "context": 65536,
    "output": 32768
  },
  "vertex/gemini-3.1-flash-image": {
    "context": 131072,
    "output": 32768
  },
  "vertex/gemini-3.1-flash-lite": {
    "context": 1048576,
    "output": 65536
  },
  "vertex/gemini-3.1-flash-lite-image": {
    "context": 65536,
    "output": 4096
  },
  "vertex/gemini-3.1-flash-lite@eu": {
    "context": 1048576,
    "output": 65536
  },
  "vertex/gemini-3.1-flash-lite@us": {
    "context": 1048576,
    "output": 65536
  },
  "vertex/gemini-3.1-pro-preview": {
    "context": 1048576,
    "output": 65536
  },
  "vertex/gemini-3.5-flash": {
    "context": 1048576,
    "output": 65536
  },
  "vertex/gemini-3.5-flash-lite": {
    "context": 1048576,
    "output": 65536
  },
  "vertex/gemini-3.5-flash-lite@eu": {
    "context": 1048576,
    "output": 65536
  },
  "vertex/gemini-3.5-flash-lite@us": {
    "context": 1048576,
    "output": 65536
  },
  "vertex/gemini-3.5-flash@eu": {
    "context": 1048576,
    "output": 65536
  },
  "vertex/gemini-3.5-flash@us": {
    "context": 1048576,
    "output": 65536
  },
  "vertex/gemini-3.6-flash": {
    "context": 1048576,
    "output": 65536
  },
  "vertex/gemini-3.6-flash@eu": {
    "context": 1048576,
    "output": 65536
  },
  "vertex/gemini-3.6-flash@us": {
    "context": 1048576,
    "output": 65536
  },
  "vertex/gemini-3.7-flash": {
    "context": 1048576,
    "output": 65536
  },
  "vertex/gemini-3.7-flash@eu": {
    "context": 1048576,
    "output": 65536
  },
  "vertex/gemini-3.7-flash@us": {
    "context": 1048576,
    "output": 65536
  },
  "vertex/gemini-3.8-flash": {
    "context": 1048576,
    "output": 65536
  },
  "vertex/gemini-3.8-flash@eu": {
    "context": 1048576,
    "output": 65536
  },
  "vertex/gemini-3.8-flash@us": {
    "context": 1048576,
    "output": 65536
  },
  "vertex/gemini-4-argon": {
    "context": 1048576,
    "output": 65536
  },
  "vertex/gemini-4-argon@eu": {
    "context": 1048576,
    "output": 65536
  },
  "vertex/gemini-4-argon@us": {
    "context": 1048576,
    "output": 65536
  },
  "vertex/gemini-flash-latest": {
    "context": 1048576,
    "output": 65536
  },
  "vertex/gemini-nano-banana-2.1": {
    "context": 131072,
    "output": 32768
  },
  "vertex/gemini-pro-latest": {
    "context": 1048576,
    "output": 65536
  },
  "vispark/vision-large": {
    "context": 1000000,
    "output": 65536
  },
  "vispark/vision-medium": {
    "context": 1000000,
    "output": 65536
  },
  "vispark/vision-small": {
    "context": 1000000,
    "output": 65536
  },
  "viv-fast": {
    "context": 1000000,
    "output": 256000
  },
  "volcengine/doubao-seed-1.8": {
    "context": 256000,
    "output": 64000
  },
  "volcengine/doubao-seed-2.0-code": {
    "context": 256000
  },
  "volcengine/doubao-seed-2.0-lite": {
    "context": 256000
  },
  "volcengine/doubao-seed-2.0-mini": {
    "context": 256000
  },
  "volcengine/doubao-seed-2.0-pro": {
    "context": 256000
  },
  "volcengine/doubao-seed-2.1-pro": {
    "context": 256000,
    "output": 256000
  },
  "volcengine/doubao-seed-2.1-turbo": {
    "context": 256000,
    "output": 256000
  },
  "volcengine/doubao-seed-character": {
    "context": 256000,
    "output": 256000
  },
  "volcengine/doubao-seed-code": {
    "context": 256000,
    "output": 64000
  },
  "volcengine/doubao-seed-evolving": {
    "context": 256000,
    "output": 256000
  },
  "VongolaChouko/Starcannon-Unleashed-12B-v1.0": {
    "context": 16384,
    "output": 8192
  },
  "voxtral-mini-3b": {
    "context": 32000,
    "output": 32000
  },
  "voxtral-small-24b-2507": {
    "context": 32768,
    "output": 16384
  },
  "voxtral-small-latest": {
    "context": 32768,
    "output": 32000
  },
  "voyage/rerank-2.5": {
    "context": 32000
  },
  "voyage/rerank-2.5-lite": {
    "context": 32000
  },
  "voyage/rerank-3": {
    "context": 32000
  },
  "voyage/rerank-3-lite": {
    "context": 32000
  },
  "voyage/voyage-3-large": {
    "context": 32000
  },
  "voyage/voyage-3.5": {
    "context": 32000
  },
  "voyage/voyage-3.5-lite": {
    "context": 32000
  },
  "voyage/voyage-4": {
    "context": 32000
  },
  "voyage/voyage-4-large": {
    "context": 32000
  },
  "voyage/voyage-4-lite": {
    "context": 32000
  },
  "voyage/voyage-code-2": {
    "context": 16000
  },
  "voyage/voyage-code-3": {
    "context": 32000
  },
  "voyage/voyage-finance-2": {
    "context": 32000
  },
  "voyage/voyage-law-2": {
    "context": 16000
  },
  "wan2-2-t2v-a14b": {
    "context": 100,
    "output": 1
  },
  "wan2.7-image": {
    "context": 8192
  },
  "wan2.7-image-pro": {
    "context": 8192
  },
  "wanx/wan-v2-6": {
    "context": 400000
  },
  "whisper-large-v3": {
    "context": 448
  },
  "whisper-large-v3-turbo": {
    "context": 448,
    "output": 448
  },
  "writer.palmyra-x4-v1:0": {
    "context": 122880,
    "output": 8192
  },
  "writer.palmyra-x5-v1:0": {
    "context": 1040000,
    "output": 8192
  },
  "writer/palmyra-x4": {
    "context": 128000,
    "output": 32000
  },
  "x-ai/grok-4": {
    "context": 256000,
    "output": 64000
  },
  "x-ai/grok-4-20-0309-non-reasoning": {
    "context": 2000000,
    "output": 1999000
  },
  "x-ai/grok-4-fast": {
    "context": 2000000,
    "output": 2000000
  },
  "x-ai/grok-4-fast-non-reasoning": {
    "context": 2000000
  },
  "x-ai/grok-4-fast-reasoning": {
    "context": 2000000,
    "output": 2000000
  },
  "x-ai/grok-4.1-fast": {
    "context": 2000000
  },
  "x-ai/grok-4.1-fast-non-reasoning": {
    "context": 2000000,
    "output": 2000000
  },
  "x-ai/grok-4.1-fast-reasoning": {
    "context": 20000000,
    "output": 2000000
  },
  "x-ai/grok-4.2-fast": {
    "context": 2000000,
    "output": 30000
  },
  "x-ai/grok-4.2-fast-non-reasoning": {
    "context": 2000000,
    "output": 30000
  },
  "x-ai/grok-4.20": {
    "context": 2000000
  },
  "x-ai/grok-4.20-multi-agent": {
    "context": 2000000
  },
  "x-ai/grok-4.3": {
    "context": 1000000
  },
  "x-ai/grok-4.5": {
    "context": 500000
  },
  "x-ai/grok-4.6": {
    "context": 500000
  },
  "x-ai/grok-4.7": {
    "context": 500000
  },
  "x-ai/grok-build-0.1": {
    "context": 256000
  },
  "x-ai/grok-code-fast-1": {
    "context": 256000,
    "output": 10000
  },
  "x-ai/grok-imagine-image-2.0": {
    "context": 66000
  },
  "x-ai/grok-latest": {
    "context": 500000,
    "output": 450000
  },
  "x-ai/grok-voice-stt-1.0": {
    "context": 15000,
    "output": 15000
  },
  "x-ai/grok-voice-tts-1.0": {
    "context": 15000,
    "output": 15000
  },
  "x-preview-f-free": {
    "context": 1000000,
    "output": 131072
  },
  "xai.grok-4.20-non-reasoning": {
    "context": 1000000,
    "output": 30000
  },
  "xai.grok-4.20-reasoning": {
    "context": 1000000,
    "output": 30000
  },
  "xai.grok-4.3": {
    "context": 1000000
  },
  "xai.grok-4.6": {
    "context": 500000,
    "output": 500000
  },
  "xai/grok-3": {
    "context": 131072,
    "output": 8192
  },
  "xai/grok-3-mini": {
    "context": 131072,
    "output": 8192
  },
  "xai/grok-4": {
    "context": 256000
  },
  "xai/grok-4-1-fast-non-reasoning": {
    "context": 2000000,
    "output": 30000
  },
  "xai/grok-4-20-beta-0309-non-reasoning": {
    "context": 2000000,
    "output": 30000
  },
  "xai/grok-4-20-beta-0309-reasoning": {
    "context": 2000000,
    "output": 30000
  },
  "xai/grok-4-3": {
    "context": 1000000,
    "output": 1000000
  },
  "xai/grok-4-5": {
    "context": 500000,
    "output": 500000
  },
  "xai/grok-4-6": {
    "context": 500000,
    "output": 500000
  },
  "xai/grok-4-7": {
    "context": 500000,
    "output": 500000
  },
  "xai/grok-4-fast-non-reasoning": {
    "context": 2000000
  },
  "xai/grok-4-fast-reasoning": {
    "context": 2000000,
    "output": 128000
  },
  "xai/grok-4.20-multi-agent": {
    "context": 128000
  },
  "xai/grok-4.20-non-reasoning": {
    "context": 2000000,
    "output": 30000
  },
  "xai/grok-4.20-reasoning": {
    "context": 2000000,
    "output": 30000
  },
  "xai/grok-4.5": {
    "context": 500000,
    "output": 500000
  },
  "xai/grok-build-0-1": {
    "context": 256000,
    "output": 256000
  },
  "xai/grok-build-0.1": {
    "context": 256000,
    "output": 256000
  },
  "xai/grok-code-fast-1": {
    "context": 256000,
    "output": 128000
  },
  "xai/grok-latest": {
    "context": 500000,
    "output": 500000
  },
  "xiaomi-mimo-v2-5": {
    "context": 1000000,
    "output": 65536
  },
  "xiaomi-mimo-v2-6-flash": {
    "context": 1000000,
    "output": 131072
  },
  "xiaomi-mimo-v2.5": {
    "context": 1048576,
    "output": 131072
  },
  "xiaomi-mimo-v2.5-free": {
    "context": 1048576,
    "output": 131072
  },
  "xiaomi-mimo-v2.5-pro": {
    "context": 1048576,
    "output": 131072
  },
  "xiaomi-mimo-v2.5-pro-free": {
    "context": 1048576,
    "output": 131072
  },
  "xiaomi-mimo/mimo-v2.6-flash": {
    "context": 1048576,
    "output": 131072
  },
  "xiaomi-mimo/mimo-v2.6-pro": {
    "context": 1048576,
    "output": 131072
  },
  "xiaomi-mimo/mimo-v2.6-pro-ultraspeed": {
    "context": 1048576,
    "output": 131072
  },
  "xiaomi/mimo-v2.5-pro:thinking": {
    "context": 1048576,
    "output": 131072
  },
  "xiaomi/mimo-v2.5:thinking": {
    "context": 1048576,
    "output": 131072
  },
  "xiaomi/mimo-v2.6-flash-abliterated": {
    "context": 1048576,
    "output": 65536
  },
  "xiaomi/mimo-v2.6-flash-uncensored": {
    "context": 1048576,
    "output": 65536
  },
  "xiaomi/mimo-v2.6-flash-uncensored:thinking": {
    "context": 1048576,
    "output": 65536
  },
  "xiaomi/mimo-v2.6-pro-ultraspeed": {
    "context": 1048576,
    "output": 131072
  },
  "xiaomimimo/mimo-v2-flash": {
    "context": 262144,
    "output": 131072
  },
  "XiaomiMiMo/MiMo-V2-Flash": {
    "context": 262144,
    "output": 32000
  },
  "xiaomimimo/mimo-v2.5": {
    "context": 1048576,
    "output": 131072
  },
  "XiaomiMiMo/MiMo-V2.5": {
    "context": 262144
  },
  "xiaomimimo/mimo-v2.5-pro": {
    "context": 1048576,
    "output": 131072
  },
  "XiaomiMiMo/MiMo-V2.5-Pro": {
    "context": 1048576
  },
  "xiaomimimo/mimo-v2.6-flash": {
    "context": 1048576,
    "output": 131072
  },
  "XiaomiMiMo/MiMo-V2.6-Flash": {
    "context": 1048576,
    "output": 131072
  },
  "xiaomimimo/mimo-v2.6-pro": {
    "context": 1048576,
    "output": 131072
  },
  "XiaomiMiMo/MiMo-V2.6-Pro": {
    "context": 1048576,
    "output": 131072
  },
  "xingchen-agi/xing4.0-29b-a4b": {
    "context": 262144,
    "output": 262144
  },
  "xingchen-agi/xing4.0-29b-a4b:free": {
    "context": 262144,
    "output": 235929
  },
  "xpersona-frieren-coder": {
    "context": 1000000,
    "output": 384000
  },
  "xpersona-gpt-5.5": {
    "context": 1000000,
    "output": 128000
  },
  "z-ai-glm-5-3": {
    "context": 1000000,
    "output": 131072
  },
  "z-ai-glm-5-3-flash": {
    "context": 1048576,
    "output": 131072
  },
  "z-ai-glm-5-turbo": {
    "context": 200000,
    "output": 32768
  },
  "z-ai-glm-5v-turbo": {
    "context": 200000,
    "output": 32768
  },
  "z-ai/autoglm-phone-9b": {
    "context": 12800,
    "output": 4096
  },
  "z-ai/GLM-4.5-Air": {
    "context": 128000,
    "output": 98304
  },
  "z-ai/GLM-4.5-Air:thinking": {
    "context": 128000,
    "output": 98304
  },
  "z-ai/GLM-4.5:thinking": {
    "context": 128000,
    "output": 65536
  },
  "z-ai/glm-4.5v": {
    "context": 65536,
    "output": 16384
  },
  "z-ai/glm-4.5v:thinking": {
    "context": 65536,
    "output": 16384
  },
  "z-ai/glm-4.6-original": {
    "context": 256000,
    "output": 65535
  },
  "z-ai/GLM-4.6-turbo": {
    "context": 204800,
    "output": 131072
  },
  "z-ai/GLM-4.6-turbo:thinking": {
    "context": 204800,
    "output": 131072
  },
  "z-ai/glm-4.6:thinking": {
    "context": 200000,
    "output": 65535
  },
  "z-ai/glm-4.6v-flash": {
    "context": 200000,
    "output": 128000
  },
  "z-ai/glm-4.6v-flash-free": {
    "context": 200000,
    "output": 128000
  },
  "z-ai/glm-4.6v-original": {
    "context": 128000,
    "output": 24000
  },
  "z-ai/glm-4.7-flash-free": {
    "context": 200000,
    "output": 128000
  },
  "z-ai/glm-4.7-flash:thinking": {
    "context": 200000,
    "output": 128000
  },
  "z-ai/glm-4.7-flashx": {
    "context": 200000,
    "output": 128000
  },
  "z-ai/glm-4.7-original": {
    "context": 200000,
    "output": 65535
  },
  "z-ai/glm-4.7-original:thinking": {
    "context": 200000,
    "output": 65535
  },
  "z-ai/glm-4.7:thinking": {
    "context": 200000,
    "output": 65535
  },
  "z-ai/glm-5-original": {
    "context": 200000,
    "output": 128000
  },
  "z-ai/glm-5-original:thinking": {
    "context": 200000,
    "output": 128000
  },
  "z-ai/glm-5:thinking": {
    "context": 200000,
    "output": 128000
  },
  "z-ai/glm-5.1:thinking": {
    "context": 200000,
    "output": 131072
  },
  "z-ai/glm-5.2:thinking": {
    "context": 1048576,
    "output": 131072
  },
  "z-ai/glm-5.3-flash-apex": {
    "context": 1048576,
    "output": 32768
  },
  "z-ai/glm-5.3-flash-apex-abliterated": {
    "context": 1048576,
    "output": 32768
  },
  "z-ai/glm-5.3-flash-cybersecurity": {
    "context": 1048576,
    "output": 32768
  },
  "z-ai/glm-5.3-flash-free": {
    "context": 1000000,
    "output": 128000
  },
  "z-ai/glm-5.3-flash-uncensored": {
    "context": 1048576,
    "output": 32768
  },
  "z-ai/glm-5.3-free": {
    "context": 1000000,
    "output": 131072
  },
  "z-ai/glm-5.3-prime": {
    "context": 1000000,
    "output": 131072
  },
  "z-ai/glm-5.3-uncensored": {
    "context": 1048576,
    "output": 131072
  },
  "z-ai/glm-5.3:thinking": {
    "context": 1048576,
    "output": 131072
  },
  "z-ai/glm-5v-turbo:thinking": {
    "context": 202800,
    "output": 131072
  },
  "z-ai/glm-image": {
    "context": 10240
  },
  "z-ai/glm-latest": {
    "context": 1048576,
    "output": 131072
  },
  "zai-glm-5-1": {
    "context": 198000,
    "output": 8192
  },
  "zai-glm-5-2": {
    "context": 1048576,
    "output": 131072
  },
  "zai-glm-5-3": {
    "context": 1048576,
    "output": 131072
  },
  "zai-glm-5-3-flash": {
    "context": 1048576,
    "output": 131072
  },
  "zai-glm-5.1": {
    "context": 200000,
    "output": 128000
  },
  "zai-org-glm-4.6": {
    "context": 198000,
    "output": 16384
  },
  "zai-org-glm-4.7": {
    "context": 198000,
    "output": 16384
  },
  "zai-org-glm-5": {
    "context": 198000,
    "output": 32000
  },
  "zai-org-glm-5-1": {
    "context": 200000,
    "output": 80000
  },
  "zai-org-glm-5-2": {
    "context": 1000000,
    "output": 131072
  },
  "zai-org/autoglm-phone-9b-multilingual": {
    "context": 65536,
    "output": 65536
  },
  "zai-org/AutoGLM-Phone-9B-Multilingual": {
    "context": 65536,
    "output": 65536
  },
  "zai-org/glm-4.5": {
    "context": 131072,
    "output": 98304
  },
  "zai-org/GLM-4.5": {
    "context": 131072,
    "output": 96000
  },
  "zai-org/glm-4.5-air": {
    "context": 131072,
    "output": 98304
  },
  "zai-org/GLM-4.5-FP8": {
    "context": 131072,
    "output": 131072
  },
  "zai-org/glm-4.5v": {
    "context": 65536,
    "output": 16384
  },
  "zai-org/GLM-4.5V": {
    "context": 65536,
    "output": 16384
  },
  "zai-org/glm-4.6": {
    "context": 204800,
    "output": 131072
  },
  "zai-org/glm-4.6v": {
    "context": 131072,
    "output": 32768
  },
  "zai-org/GLM-4.6V-Flash": {
    "context": 131072,
    "output": 32768
  },
  "zai-org/glm-4.7": {
    "context": 204800,
    "output": 131072
  },
  "zai-org/glm-4.7-flash": {
    "context": 200000,
    "output": 128000
  },
  "zai-org/glm-4.7-maas": {
    "context": 200000,
    "output": 128000
  },
  "zai-org/glm-5": {
    "context": 202800,
    "output": 131072
  },
  "zai-org/GLM-5-FP8": {
    "context": 202752,
    "output": 131072
  },
  "zai-org/glm-5-maas": {
    "context": 200000,
    "output": 128000
  },
  "zai-org/GLM-5.1-FP8": {
    "context": 202752,
    "output": 131072
  },
  "zai-org/GLM-5.1-TEE": {
    "context": 202752,
    "output": 65535
  },
  "zai-org/glm-5.2-maas": {
    "context": 1000000,
    "output": 64000
  },
  "zai-org/GLM-5.2-TEE": {
    "context": 1048576,
    "output": 65535
  },
  "zai-org/GLM-5.3-Fast": {
    "context": 1048576,
    "output": 262144
  },
  "zai-org/GLM-5.3-Flash:peft:262144": {
    "context": 262144,
    "output": 262144
  },
  "zai-org/GLM-5.3:peft:262144": {
    "context": 262144,
    "output": 262144
  },
  "zai-org/GLM-5V-Turbo": {
    "context": 200000,
    "output": 131072
  },
  "zai.glm-4.7": {
    "context": 202752,
    "output": 131072
  },
  "zai.glm-4.7-flash": {
    "context": 202752,
    "output": 131072
  },
  "zai.glm-5": {
    "context": 202752,
    "output": 131072
  },
  "zai/glm-4-32b-0414-128k": {
    "context": 128000,
    "output": 128000
  },
  "zai/glm-4.5-airx": {
    "context": 128000,
    "output": 128000
  },
  "zai/glm-4.5-flash": {
    "context": 131072,
    "output": 98304
  },
  "zai/glm-4.5-x": {
    "context": 128000,
    "output": 128000
  },
  "zai/glm-4.6v-flash": {
    "context": 128000,
    "output": 32768
  },
  "zai/glm-4.6v-flashx": {
    "context": 128000,
    "output": 16000
  },
  "zai/glm-4.7-flash": {
    "context": 200000
  },
  "zai/glm-4.7-flashx": {
    "context": 200000
  },
  "zai/GLM-5.1": {
    "context": 200000,
    "output": 131072
  },
  "zai/GLM-5.2": {
    "context": 1000000,
    "output": 131072
  },
  "zai/glm-5.2-fast": {
    "context": 1000000,
    "output": 128000
  },
  "zai/glm-5.3-fast": {
    "context": 1048576,
    "output": 262144
  },
  "zai/glm-5.3-flashx": {
    "context": 1000000,
    "output": 131072
  },
  "zdev": {
    "context": 1000000,
    "output": 131072
  },
  "zhipu/glm-5.2": {
    "context": 1000000,
    "output": 131072
  },
  "zhipu/glm-5.3": {
    "context": 1024000,
    "output": 131072
  },
  "ZhipuAI/GLM-4.5": {
    "context": 131072,
    "output": 98304
  },
  "ZhipuAI/GLM-4.6": {
    "context": 202752,
    "output": 98304
  }
}
