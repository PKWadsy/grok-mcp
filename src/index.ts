#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFile } from "node:fs/promises";
import { z } from "zod";

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
      .array(
        z.object({
          path: z.string().describe("Absolute path to the file"),
          start_line: z.number().optional().describe("First line to include (1-based, inclusive)"),
          end_line: z.number().optional().describe("Last line to include (1-based, inclusive)"),
        })
      )
      .optional()
      .describe("Files to read and include in the context sent to Grok. Each file is included with its path and line numbers. Use start_line/end_line to include only a specific range"),
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
  async ({ prompt, files, system_prompt, model, web_search, x_search }) => {
    const messages: GrokMessage[] = [];

    if (system_prompt) {
      messages.push({ role: "system", content: system_prompt });
    }

    let userContent = prompt;

    if (files && files.length > 0) {
      const cwd = process.cwd();
      const fileBlocks: string[] = [`Working directory: ${cwd}\n`];
      for (const file of files) {
        try {
          const raw = await readFile(file.path, "utf-8");
          const allLines = raw.split("\n");
          const start = file.start_line ? file.start_line - 1 : 0;
          const end = file.end_line ? file.end_line : allLines.length;
          const sliced = allLines.slice(start, end);
          const numbered = sliced
            .map((line, i) => `${start + i + 1}\t${line}`)
            .join("\n");
          const range =
            file.start_line || file.end_line
              ? `:${file.start_line ?? 1}-${file.end_line ?? allLines.length}`
              : "";
          fileBlocks.push(`--- ${file.path}${range} ---\n${numbered}\n---`);
        } catch (err) {
          fileBlocks.push(`--- ${file.path} --- ERROR: ${err instanceof Error ? err.message : String(err)} ---`);
        }
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

const transport = new StdioServerTransport();
await server.connect(transport);
