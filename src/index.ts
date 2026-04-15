#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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
  const model = options.model ?? "grok-4.20-reasoning";

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
  "Ask Grok a question. Grok is great for thinking, planning, architecture, and real-time search via web and X/Twitter. Use web_search for current information from the internet. Use x_search to find and analyze posts on X/Twitter.",
  {
    prompt: z.string().describe("The question or task for Grok"),
    system_prompt: z
      .string()
      .optional()
      .describe("Custom system prompt to guide Grok's behavior"),
    model: z
      .string()
      .optional()
      .describe(
        "Model to use. Defaults to grok-4.20-reasoning. Options: grok-4.20-reasoning, grok-4.20-non-reasoning, grok-4.20-multi-agent, grok-4.1-fast-reasoning, grok-4.1-fast-non-reasoning"
      ),
    web_search: z
      .boolean()
      .optional()
      .describe("Enable web search for real-time internet information"),
    x_search: z
      .boolean()
      .optional()
      .describe("Enable X/Twitter search to find and analyze posts"),
  },
  async ({ prompt, system_prompt, model, web_search, x_search }) => {
    const messages: GrokMessage[] = [];

    if (system_prompt) {
      messages.push({ role: "system", content: system_prompt });
    }

    messages.push({ role: "user", content: prompt });

    const tools: GrokTool[] = [];
    if (web_search) {
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
