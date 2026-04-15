# grok-mcp

MCP server that wraps the xAI Grok API. Lets Claude and other AI agents delegate thinking, planning, and real-time search to Grok.

## Setup

```bash
npm install -g grok-mcp
```

Or use directly with npx:

```bash
npx grok-mcp
```

You need an xAI API key from [console.x.ai](https://console.x.ai).

## Configure in Claude Code

Add to your Claude Code MCP settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "grok": {
      "command": "npx",
      "args": ["grok-mcp"],
      "env": {
        "XAI_API_KEY": "your-xai-api-key"
      }
    }
  }
}
```

## Tool: `ask_grok`

Single tool with options for different use cases.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | yes | The question or task for Grok |
| `system_prompt` | string | no | Custom system prompt |
| `model` | string | no | Model to use (default: `grok-4.20-reasoning`) |
| `web_search` | boolean | no | Enable real-time web search |
| `x_search` | boolean | no | Enable X/Twitter search |
| `reasoning_effort` | "low" \| "high" | no | Reasoning effort for reasoning models |

### Available Models

- `grok-4.20-reasoning` — flagship reasoning (default)
- `grok-4.20-non-reasoning` — fast, no reasoning
- `grok-4.1-fast-reasoning` — cheaper reasoning
- `grok-4.1-fast-non-reasoning` — cheapest, fast

### Examples

**Ask a question:**
```
prompt: "What are the trade-offs between microservices and monoliths?"
```

**Plan with deep thinking:**
```
prompt: "Design a caching strategy for a high-traffic API"
reasoning_effort: "high"
```

**Search the web:**
```
prompt: "What happened in tech news today?"
web_search: true
```

**Search X/Twitter:**
```
prompt: "What are people saying about the new React release?"
x_search: true
```

## License

MIT
