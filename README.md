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

## Tools

### `ask_grok`

Ask Grok a question with optional file context, web search, and X/Twitter search.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | yes | The question or task for Grok |
| `files` | string[] | no | Files to include in context (see file syntax below) |
| `max_files` | number | no | Override max file count (default 50) |
| `max_file_size` | number | no | Override max per-file size in KB (default 32) |
| `system_prompt` | string | no | Custom system prompt |
| `model` | string | no | Model to use (default: `grok-4.20-multi-agent`) |
| `web_search` | boolean | no | Web search, enabled by default |
| `x_search` | boolean | no | Enable X/Twitter search |

### `check_files`

Dry-run file resolution. Validates all files and shows sizes without calling Grok. If `check_files` passes, `ask_grok` will too.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `files` | string[] | yes | Files to check (same syntax as `ask_grok`) |
| `max_files` | number | no | Override max file count (default 50) |
| `max_file_size` | number | no | Override max per-file size in KB (default 32) |

### File syntax

Files are passed as an array of strings with compact syntax:

| Syntax | Description |
|--------|-------------|
| `"src/index.ts"` | Whole file |
| `"src/index.ts:10-30"` | Lines 10 to 30 |
| `"src/index.ts:10"` | Just line 10 |
| `"src/**/*.ts"` | Glob pattern |
| `"large-file.ts:force"` | Bypass per-file size limit |
| `"large-file.ts:1-100:force"` | Combine line range with force |

### Safety limits

| Limit | Default | Override |
|-------|---------|----------|
| Files per call | 50 | `max_files` param |
| Per-file size | 32 KB | `max_file_size` param or `:force` suffix |
| Total context | 256 KB | Hard cap, not overridable |

### Available models

- `grok-4.20-multi-agent` — multi-agent mode, great for architecture and planning (default)
- `grok-4.20-reasoning` — flagship reasoning
- `grok-4.20-non-reasoning` — fast, no reasoning
- `grok-4.1-fast-reasoning` — cheaper reasoning
- `grok-4.1-fast-non-reasoning` — cheapest, fast

### Examples

**Ask with file context:**
```
prompt: "Review this code for bugs"
files: ["src/index.ts", "src/utils.ts:20-50"]
```

**Search the web:**
```
prompt: "What happened in tech news today?"
```

**Search X/Twitter:**
```
prompt: "What are people saying about the new React release?"
x_search: true
```

**Check files before asking:**
```
files: ["src/**/*.ts"]
```

## License

MIT
