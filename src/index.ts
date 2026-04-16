#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { globSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

interface FileSpec {
  path: string;
  startLine?: number;
  endLine?: number;
  force?: boolean;
}

function parseFileArg(arg: string): FileSpec[] {
  // Strip :force suffix first
  let force = false;
  let input = arg;
  if (input.endsWith(":force")) {
    force = true;
    input = input.slice(0, -6);
  }

  // "path/to/file:10-30" or "path/to/file:10" or "path/to/file" or "src/**/*.ts"
  const match = input.match(/^(.+?):(\d+)(?:-(\d+))?$/);
  let pattern: string;
  let startLine: number | undefined;
  let endLine: number | undefined;

  if (match) {
    pattern = match[1];
    startLine = parseInt(match[2], 10);
    endLine = match[3] ? parseInt(match[3], 10) : startLine;
  } else {
    pattern = input;
  }

  const resolved = resolve(pattern);

  if (/[*?[\]]/.test(pattern)) {
    const paths = globSync(pattern).sort();
    if (paths.length === 0) {
      return [{ path: pattern, force }]; // will fail at read time with a clear error
    }
    return paths.map((p) => ({ path: resolve(p as string), startLine, endLine, force }));
  }

  return [{ path: resolved, startLine, endLine, force }];
}

const DEFAULT_MAX_FILES = 50;
const MAX_TOTAL_BYTES = 256 * 1024; // 256 KB hard cap
const DEFAULT_MAX_SINGLE_BYTES = 32 * 1024; // 32 KB

interface ResolvedFile {
  path: string;
  range: string;
  content: string;
  bytes: number;
}

interface ResolveOptions {
  maxFiles?: number;
  maxFileSize?: number; // KB
}

type ResolveResult = {
  ok: true;
  files: ResolvedFile[];
  totalBytes: number;
} | {
  ok: false;
  error: string;
};

function resolveFiles(fileArgs: string[], opts?: ResolveOptions): ResolveResult {
  const maxFiles = opts?.maxFiles ?? DEFAULT_MAX_FILES;
  const maxSingleBytes = opts?.maxFileSize ? opts.maxFileSize * 1024 : DEFAULT_MAX_SINGLE_BYTES;

  const errors: string[] = [];
  const resolved: ResolvedFile[] = [];
  const specs = fileArgs.flatMap(parseFileArg);

  if (specs.length > maxFiles) {
    return { ok: false, error: `Too many files: ${specs.length} resolved (limit ${maxFiles}). This usually means a glob matched more than intended (e.g. node_modules). Use a more specific pattern.` };
  }

  let totalBytes = 0;

  for (const spec of specs) {
    try {
      const raw = readFileSync(spec.path, "utf-8");

      if (!spec.force && raw.length > maxSingleBytes && !spec.startLine && !spec.endLine) {
        const kb = Math.round(raw.length / 1024);
        errors.push(`${spec.path}: file is ${kb} KB (limit ${maxSingleBytes / 1024} KB per file). Use ":force" to override, or line ranges to include only the relevant part, e.g. "${spec.path}:1-100"`);
        continue;
      }

      const allLines = raw.split("\n");
      const totalLines = allLines.length;
      if (spec.startLine && spec.startLine > totalLines) {
        errors.push(`${spec.path}: line ${spec.startLine} is past end of file (${totalLines} lines)`);
        continue;
      }
      if (spec.endLine && spec.endLine > totalLines) {
        errors.push(`${spec.path}: line ${spec.endLine} is past end of file (${totalLines} lines)`);
        continue;
      }
      if (spec.startLine && spec.endLine && spec.startLine > spec.endLine) {
        errors.push(`${spec.path}: start line ${spec.startLine} is after end line ${spec.endLine}`);
        continue;
      }
      const start = spec.startLine ? spec.startLine - 1 : 0;
      const end = spec.endLine ? spec.endLine : totalLines;
      const sliced = allLines.slice(start, end);
      const numbered = sliced
        .map((line, i) => `${start + i + 1}\t${line}`)
        .join("\n");

      totalBytes += numbered.length;
      if (totalBytes > MAX_TOTAL_BYTES) {
        const kb = Math.round(totalBytes / 1024);
        errors.push(`Total file context is ${kb} KB (hard limit ${MAX_TOTAL_BYTES / 1024} KB). Include fewer files or use line ranges to narrow down.`);
        break;
      }

      const range =
        spec.startLine || spec.endLine
          ? `:${spec.startLine ?? 1}-${spec.endLine ?? totalLines}`
          : "";
      resolved.push({ path: spec.path, range, content: numbered, bytes: numbered.length });
    } catch (err) {
      errors.push(`${spec.path}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, error: `File context error:\n${errors.join("\n")}\n\nFix and try again.` };
  }

  return { ok: true, files: resolved, totalBytes };
}

const apiKey = process.env.XAI_API_KEY;
if (!apiKey) {
  console.error("XAI_API_KEY environment variable is required");
  process.exit(1);
}

const server = new McpServer({
  name: "grok-mcp",
  version: "1.0.0",
});

interface GrokMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface GrokTool {
  type: string;
  [key: string]: unknown;
}

interface ResponsesApiResponse {
  output: Array<{
    type: string;
    role?: string;
    content?: Array<{
      type: string;
      text?: string;
    }>;
  }>;
}

async function callGrok(options: {
  messages: GrokMessage[];
  model?: string;
  tools?: GrokTool[];
}): Promise<string> {
  const model = options.model ?? "grok-4.20-multi-agent";

  const body: Record<string, unknown> = {
    model,
    input: options.messages,
  };

  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools;
  }

  const response = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Grok API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as ResponsesApiResponse;

  for (const item of data.output) {
    if (item.type === "message" && item.content) {
      for (const block of item.content) {
        if (block.type === "output_text" && block.text) {
          return block.text;
        }
      }
    }
  }

  throw new Error("No text content in Grok response");
}

server.tool(
  "ask_grok",
  `Ask Grok a question. Grok is great for thinking, planning, architecture, and real-time search via web and X/Twitter. Use web_search for current information from the internet. Use x_search to find and analyze posts on X/Twitter. IMPORTANT: Grok has no context about your conversation or codebase. Always include all relevant context directly in the prompt — file contents, error messages, architecture details, constraints, and goals. The more context you provide, the better Grok's response will be. Do not assume Grok knows anything about the current project. Use the files parameter to automatically include file contents with line numbers — this is preferred over pasting code into the prompt. File paths are resolved relative to the server working directory: ${process.cwd()}`,
  {
    prompt: z.string().describe("The question or task for Grok. Include all relevant context — constraints, background, and goals — since Grok has no access to your conversation or files. Use the files parameter to attach source code rather than pasting it inline"),
    files: z
      .array(z.string())
      .optional()
      .describe('Files to include in context. Compact syntax: "path/to/file" (whole file), "path/to/file:10-30" (lines 10-30), "path/to/file:10" (just line 10), "src/**/*.ts" (glob pattern), "large-file.ts:force" (bypass per-file size limit). Paths resolve relative to server cwd.'),
    max_files: z
      .number()
      .optional()
      .describe("Override max file count (default 50). Useful when a glob legitimately matches many files"),
    max_file_size: z
      .number()
      .optional()
      .describe("Override max per-file size in KB (default 32). Applies to all files without :force suffix"),
    system_prompt: z
      .string()
      .optional()
      .describe("Custom system prompt to guide Grok's behavior"),
    model: z
      .string()
      .optional()
      .describe(
        "Model to use. Defaults to grok-4.20-multi-agent. Options: grok-4.20-multi-agent, grok-4.20-reasoning, grok-4.20-non-reasoning, grok-4.1-fast-reasoning, grok-4.1-fast-non-reasoning"
      ),
    web_search: z
      .boolean()
      .optional()
      .default(true)
      .describe("Web search is enabled by default. Set to false to disable"),
    x_search: z
      .boolean()
      .optional()
      .describe("Enable X/Twitter search to find and analyze posts"),
  },
  async ({ prompt, files, max_files, max_file_size, system_prompt, model, web_search, x_search }) => {
    const messages: GrokMessage[] = [];

    if (system_prompt) {
      messages.push({ role: "system", content: system_prompt });
    }

    let userContent = prompt;

    if (files && files.length > 0) {
      const result = resolveFiles(files, { maxFiles: max_files, maxFileSize: max_file_size });
      if (!result.ok) {
        return { isError: true, content: [{ type: "text" as const, text: result.error }] };
      }
      const cwd = process.cwd();
      const fileBlocks = [`Working directory: ${cwd}\n`];
      for (const f of result.files) {
        fileBlocks.push(`--- ${f.path}${f.range} ---\n${f.content}\n---`);
      }
      userContent = `${fileBlocks.join("\n\n")}\n\n${prompt}`;
    }

    messages.push({ role: "user", content: userContent });

    const tools: GrokTool[] = [];
    if (web_search !== false) {
      tools.push({ type: "web_search" });
    }
    if (x_search) {
      tools.push({ type: "x_search" });
    }

    const response = await callGrok({
      messages,
      model,
      tools: tools.length > 0 ? tools : undefined,
    });

    return {
      content: [{ type: "text" as const, text: response }],
    };
  }
);

server.tool(
  "check_files",
  `Dry-run file resolution. Use this before ask_grok to verify files will resolve correctly and check context size. Uses the same validation as ask_grok — if check_files passes, ask_grok will too. File paths resolve relative to: ${process.cwd()}`,
  {
    files: z
      .array(z.string())
      .describe('Files to check. Same syntax as ask_grok: "path/to/file", "path/to/file:10-30", "src/**/*.ts", "large-file.ts:force"'),
    max_files: z
      .number()
      .optional()
      .describe("Override max file count (default 50)"),
    max_file_size: z
      .number()
      .optional()
      .describe("Override max per-file size in KB (default 32)"),
  },
  async ({ files, max_files, max_file_size }) => {
    const result = resolveFiles(files, { maxFiles: max_files, maxFileSize: max_file_size });
    if (!result.ok) {
      return { isError: true, content: [{ type: "text" as const, text: result.error }] };
    }

    const sorted = [...result.files].sort((a, b) => b.bytes - a.bytes);
    const lines = [
      `${result.files.length} file(s), ${Math.round(result.totalBytes / 1024)} KB total (limit ${MAX_TOTAL_BYTES / 1024} KB)`,
      "",
      ...sorted.map((f) => {
        const kb = (f.bytes / 1024).toFixed(1);
        return `  ${kb} KB  ${f.path}${f.range}`;
      }),
    ];

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
