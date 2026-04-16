# grok-mcp

MCP server that wraps the xAI Grok API. Lets Claude and other AI agents delegate thinking, planning, and real-time search to Grok.

## Quick Start

One-liner to add to Claude Code on any device:

```bash
claude mcp add grok -e XAI_API_KEY=your-key -- npx -y @pkwadsy/grok-mcp
```

You need an xAI API key from [console.x.ai](https://console.x.ai).

### Alternative: project config

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "grok": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@pkwadsy/grok-mcp"],
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
| `files` | array | no | Files to include in context (path, optional start_line/end_line) |
| `system_prompt` | string | no | Custom system prompt |
| `model` | string | no | Model to use (default: `grok-4.20-multi-agent`) |
| `web_search` | boolean | no | Web search, enabled by default |
| `x_search` | boolean | no | Enable X/Twitter search |

### Available Models

- `grok-4.20-multi-agent` — multi-agent mode, great for architecture and planning (default)
- `grok-4.20-reasoning` — flagship reasoning
- `grok-4.20-non-reasoning` — fast, no reasoning
- `grok-4.1-fast-reasoning` — cheaper reasoning
- `grok-4.1-fast-non-reasoning` — cheapest, fast

### Examples

**Ask a question:**
```
prompt: "What are the trade-offs between microservices and monoliths?"
```

**Deep architecture planning (multi-agent):**
```
prompt: "Design a system architecture for a real-time collaborative editor"
model: "grok-4.20-multi-agent"
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
