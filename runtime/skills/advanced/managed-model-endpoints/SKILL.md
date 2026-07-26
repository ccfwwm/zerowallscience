---
name: managed-model-endpoints
description: >
  Set up and manage custom model endpoints for self-hosted or third-party models.
  Use this skill to configure OpenAI-compatible endpoints, local model servers,
  or custom inference APIs for use in ZeroWall Science workflows.
---

# Managed Model Endpoints

Configure and manage custom model endpoints to extend ZeroWall Science with
self-hosted models, third-party APIs, or specialized domain models. This skill
covers endpoint configuration, authentication, and integration patterns.

## When to use

- Integrating self-hosted LLMs (Ollama, vLLM, LM Studio)
- Connecting to third-party model APIs (OpenRouter, Together AI, Replicate)
- Using specialized domain models (protein language models, chemistry models)
- Managing multiple model endpoints for different tasks

## Endpoint configuration

Model endpoints are configured in ZeroWall's settings or via environment variables.

### OpenAI-compatible endpoints

Most local and third-party model servers implement the OpenAI API format:

```json
{
  "name": "local-llama",
  "type": "openai-compatible",
  "baseURL": "http://localhost:11434/v1",
  "apiKey": "optional-key",
  "models": ["llama3.1:70b", "codellama:34b"]
}
```

### Supported endpoint types

- **OpenAI-compatible**: Ollama, vLLM, LM Studio, LocalAI, OpenRouter
- **Anthropic-compatible**: Self-hosted Claude alternatives
- **Custom**: Domain-specific models with REST APIs

## Local model servers

### Ollama
```bash
# Install and run Ollama
ollama serve

# Pull models
ollama pull llama3.1:70b

# Endpoint: http://localhost:11434/v1
```

### vLLM
```bash
# Run vLLM OpenAI-compatible server
python -m vllm.entrypoints.openai.api_server \
  --model meta-llama/Llama-3.1-70B-Instruct \
  --port 8000

# Endpoint: http://localhost:8000/v1
```

### LM Studio
- Launch LM Studio GUI
- Load a model
- Enable "Local Server" in settings
- Endpoint: `http://localhost:1234/v1`

## Authentication

### API keys
Store API keys in the OS keychain (recommended) or environment variables:

```bash
export CUSTOM_MODEL_API_KEY="sk-..."
```

### Token-based auth
For services requiring bearer tokens:

```json
{
  "name": "custom-endpoint",
  "baseURL": "https://api.example.com/v1",
  "headers": {
    "Authorization": "Bearer YOUR_TOKEN"
  }
}
```

## Testing endpoints

Verify endpoint connectivity:

```bash
curl http://localhost:11434/v1/models
```

Test inference:

```bash
curl http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama3.1:70b",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

## Best practices

- **Use keychain storage**: Never hardcode API keys in configuration files
- **Test connectivity first**: Verify endpoints before adding to workflows
- **Document model capabilities**: Note context limits, special tokens, formatting requirements
- **Monitor costs**: Track usage for paid endpoints
- **Version models**: Pin model versions for reproducibility

## Common issues

| Issue | Solution |
|---|---|
| Connection refused | Check server is running; verify firewall settings |
| Authentication failed | Verify API key in keychain; check header format |
| Model not found | List available models; check model name spelling |
| Timeout errors | Increase timeout; check model size vs. hardware |
| Incompatible API | Verify OpenAI compatibility; implement custom adapter if needed |

## Security considerations

- **Local endpoints**: Bind to `127.0.0.1` not `0.0.0.0` unless needed
- **Remote endpoints**: Use HTTPS; never send API keys over HTTP
- **API key rotation**: Rotate keys periodically for production use
- **Rate limiting**: Implement client-side rate limiting for shared endpoints

## Related skills

- `using-model-endpoint` — Use configured endpoints in analysis workflows
- `skill-creator` — Create Skills that leverage custom model endpoints

---

**Next:** Configure endpoint in ZeroWall settings, test with a simple query, or
integrate into a custom Skill.
