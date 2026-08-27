#!/usr/bin/env node

import { spawn } from "node:child_process";
import readline from "node:readline";

const SERVER_INFO = {
  name: "sts-model-integrations",
  version: "1.0.0",
};

const TOOLS = [
  {
    name: "codex_luna_max",
    description:
      "Run OpenAI Codex CLI with gpt-5.6-luna and its highest supported xhigh reasoning setting. Uses a read-only sandbox.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "The task or question for Codex." },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
  },
  {
    name: "deepseek_v4_pro",
    description: "Run DeepSeek v4 Pro through the direct DeepSeek API.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "The task or question for DeepSeek." },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
  },
  {
    name: "grok_4_6",
    description: "Run xAI Grok 4.6 through the direct xAI API.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "The task or question for Grok." },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
  },
  {
    name: "grok_build",
    description: "Run xAI Grok Build 0.1 through the direct xAI API.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "The task or question for Grok Build." },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
  },
  {
    name: "gemini_3_7_flash",
    description: "Run Gemini 3.7 Flash through the direct Google Gemini API.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "The task or question for Gemini." },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
  },
];

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function textResult(text, isError = false) {
  return {
    content: [{ type: "text", text }],
    ...(isError ? { isError: true } : {}),
  };
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value?.trim()) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

async function readError(response) {
  const body = await response.text();
  return `${response.status} ${response.statusText}: ${body.slice(0, 800)}`;
}

async function openAiCompatible({ baseUrl, envName, model, prompt, effort }) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requiredEnv(envName)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      ...(effort ? { reasoning_effort: effort } : {}),
    }),
  });
  if (!response.ok) throw new Error(await readError(response));
  const body = await response.json();
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error(`${model} returned no text content.`);
  }
  return content;
}

function runCodex(prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "codex",
      [
        "exec",
        "--ephemeral",
        "--skip-git-repo-check",
        "-m",
        "gpt-5.6-luna",
        "-c",
        'model_reasoning_effort="xhigh"',
        "--sandbox",
        "read-only",
        "-",
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          CODEX_API_KEY: requiredEnv("OPENAI_API_KEY"),
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Codex exited with ${code}: ${stderr.slice(-1200)}`));
        return;
      }
      resolve(stdout.trim() || stderr.trim());
    });
    child.stdin.end(prompt);
  });
}

async function runGemini(prompt) {
  const apiKey = requiredEnv("GEMINI_API_KEY");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
    },
  );
  if (!response.ok) throw new Error(await readError(response));
  const body = await response.json();
  const content = body.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter(Boolean)
    .join("");
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("gemini-3.7-flash returned no text content.");
  }
  return content;
}

async function callTool(name, args) {
  const prompt = args?.prompt;
  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new Error("prompt must be a non-empty string.");
  }
  switch (name) {
    case "codex_luna_max":
      return runCodex(prompt);
    case "deepseek_v4_pro":
      return openAiCompatible({
        baseUrl: "https://api.deepseek.com/v1",
        envName: "DEEPSEEK_API_KEY",
        model: "deepseek-v4-pro",
        prompt,
      });
    case "grok_4_6":
      return openAiCompatible({
        baseUrl: "https://api.x.ai/v1",
        envName: "XAI_API_KEY",
        model: "grok-4.6",
        prompt,
      });
    case "grok_build":
      return openAiCompatible({
        baseUrl: "https://api.x.ai/v1",
        envName: "XAI_API_KEY",
        model: "grok-build-0.1",
        prompt,
      });
    case "gemini_3_7_flash":
      return runGemini(prompt);
    default:
      throw new Error(`Unknown integration tool: ${name}`);
  }
}

const input = readline.createInterface({ input: process.stdin });
input.on("line", async (line) => {
  if (!line.trim()) return;
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    return;
  }
  if (!("id" in request)) return;

  try {
    if (request.method === "initialize") {
      send({
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: request.params?.protocolVersion ?? "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        },
      });
    } else if (request.method === "tools/list") {
      send({ jsonrpc: "2.0", id: request.id, result: { tools: TOOLS } });
    } else if (request.method === "tools/call") {
      const result = await callTool(request.params?.name, request.params?.arguments);
      send({ jsonrpc: "2.0", id: request.id, result: textResult(result) });
    } else {
      send({
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32601, message: `Unsupported method: ${request.method}` },
      });
    }
  } catch (error) {
    send({
      jsonrpc: "2.0",
      id: request.id,
      result: textResult(error instanceof Error ? error.message : String(error), true),
    });
  }
});