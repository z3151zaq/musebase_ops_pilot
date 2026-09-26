import "dotenv/config";

import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { Box, render, Text, useApp, useInput } from "ink";
import { marked } from "marked";
import TerminalRenderer from "marked-terminal";
import React, { useState } from "react";

import { graph } from "./agent/graph.js";

type Turn = { role: "user" | "agent" | "error"; text: string; steps?: string[] };

function terminalMarkdown(source: string): string {
  return marked.parse(source, {
    renderer: new TerminalRenderer({
      width: Math.max(40, (process.stdout.columns || 80) - 4),
      reflowText: true,
    }),
  }).trim();
}

export function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((block): block is { type: "text"; text: string } =>
        typeof block === "object" && block !== null &&
        block.type === "text" && typeof block.text === "string")
      .map(block => block.text)
      .join("\n\n");
  }
  return JSON.stringify(content, null, 2);
}

const toolLabels: Record<string, string> = {
  list_repositories: "查找可访问的仓库",
  list_repository_files: "浏览仓库目录",
  get_file_content: "读取源代码",
  list_recent_commits: "查看近期提交",
  get_commit: "查看提交详情",
  list_github_workflows: "查找部署工作流",
  list_github_workflow_runs: "查看工作流运行记录",
  inspect_github_workflow_run: "检查部署步骤",
  discover_log_groups: "发现日志组",
  search_logs: "查询日志",
};

function describeUpdate(node: string, update: unknown): string[] {
  if (node === "router") {
    const intent = (update as { intent?: string })?.intent;
    return [intent === "incident" ? "已识别为故障调查" : "已识别为通用查询"];
  }
  if (node === "general" || node === "investigator") {
    const message = (update as { messages?: unknown[] })?.messages?.at(-1);
    if (message instanceof AIMessage && message.tool_calls?.length) {
      return message.tool_calls.map(call => toolLabels[call.name] ?? `调用 ${call.name}`);
    }
    return [node === "investigator" ? "分析调查证据" : "整理查询结果"];
  }
  if (node === "generalTools" || node === "tools") return ["工具查询已完成"];
  if (node === "extractEvidence") return ["提取调查证据"];
  if (node === "report" || node === "generalAnswer") return ["生成最终回答"];
  return [];
}

async function ask(
  prompt: string,
  threadId: string,
  onProgress?: (step: string) => void,
): Promise<string> {
  const config = { configurable: { thread_id: threadId }, streamMode: "updates" as const };
  const originalLog = console.log;
  if (onProgress) console.log = () => {};
  try {
    const stream = await graph.stream({ messages: [new HumanMessage(prompt)] }, config);
    for await (const chunk of stream) {
      for (const [node, update] of Object.entries(chunk as Record<string, unknown>)) {
        for (const step of describeUpdate(node, update)) onProgress?.(step);
      }
    }
    const snapshot = await graph.getState(config);
    return contentToText(snapshot.values.messages.at(-1)?.content ?? "No answer returned.");
  } finally {
    console.log = originalLog;
  }
}

function Chat() {
  const { exit } = useApp();
  const [threadId, setThreadId] = useState(() => crypto.randomUUID());
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);

  useInput((character, key) => {
    if (key.ctrl && character === "c") {
      exit();
      return;
    }
    if (busy) return;
    if (key.return) {
      const prompt = input.trim();
      setInput("");
      if (!prompt) return;
      if (prompt === "/exit" || prompt === "/quit") {
        exit();
        return;
      }
      if (prompt === "/clear") {
        setThreadId(crypto.randomUUID());
        setTurns([]);
        return;
      }
      setTurns(previous => [...previous, { role: "user", text: prompt }]);
      const steps = ["识别请求类型"];
      setProgress(["识别请求类型"]);
      setBusy(true);
      void ask(prompt, threadId, step => {
        steps.push(step);
        setProgress([...steps]);
      })
        .then(text => setTurns(previous => [...previous, { role: "agent", text, steps: [...steps] }]))
        .catch(error => setTurns(previous => [...previous, {
          role: "error",
          text: error instanceof Error ? error.message : String(error),
        }]))
        .finally(() => setBusy(false));
      return;
    }
    if (key.backspace || key.delete) {
      setInput(previous => previous.slice(0, -1));
      return;
    }
    if (!key.ctrl && !key.meta && character) {
      setInput(previous => previous + character);
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="cyan">Musebase OpsPilot</Text>
      <Text dimColor>Ask about code, deployments, or incidents. /clear starts a new conversation; /exit quits.</Text>
      {turns.map((turn, index) => (
        <Box key={index} marginTop={1} flexDirection="column">
          <Text bold color={turn.role === "user" ? "cyan" : turn.role === "error" ? "red" : "green"}>
            {turn.role === "user" ? "You" : turn.role === "error" ? "Error" : "OpsPilot"}
          </Text>
          {turn.steps && <Text dimColor>已完成：{turn.steps.slice(1).join(" → ")}</Text>}
          <Text>{turn.role === "agent" ? terminalMarkdown(turn.text) : turn.text}</Text>
        </Box>
      ))}
      {busy && (
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow">Thinking · 调查进度（非模型内部推理）</Text>
          {progress.slice(-5).map((step, index) =>
            <Text key={index} dimColor>  {index === progress.slice(-5).length - 1 ? "›" : "✓"} {step}</Text>)}
        </Box>
      )}
      <Box marginTop={1}>
        <Text color="cyan">{busy ? "  " : "> "}</Text>
        <Text>{busy ? "" : `${input}▌`}</Text>
      </Box>
    </Box>
  );
}

const inputArgs = process.argv.slice(2);
const prompt = (inputArgs[0] === "--" ? inputArgs.slice(1) : inputArgs).join(" ").trim();

if (prompt) {
  try {
    console.log(await ask(prompt, crypto.randomUUID()));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
} else if (!process.stdin.isTTY) {
  console.error('Interactive mode requires a terminal. For one question, run: pnpm start "Your question"');
  process.exitCode = 1;
} else {
  render(<Chat />);
}
