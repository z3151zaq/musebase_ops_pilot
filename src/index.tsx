import "dotenv/config";

import { Box, render, Text, useApp, useInput } from "ink";
import { marked } from "marked";
import TerminalRenderer from "marked-terminal";
import React, { useState } from "react";

import { createRuntime } from "./agent/runtime.js";
import { localIdentity, type StoredTurn } from "./integrations/postgres/sessions.js";

type Turn = { role: "user" | "agent" | "error" | "notice"; text: string; steps?: string[] };

function terminalMarkdown(source: string): string {
  return marked.parse(source, {
    renderer: new TerminalRenderer({
      width: Math.max(40, (process.stdout.columns || 80) - 4),
      reflowText: true,
    }),
  }).trim();
}

const toolLabels: Record<string, string> = {
  started: "识别请求类型",
  router: "完成请求分类",
  general: "整理查询结果",
  investigator: "分析调查证据",
  generalTools: "工具查询已完成",
  tools: "工具查询已完成",
  extractEvidence: "提取调查证据",
  report: "生成调查报告",
  generalAnswer: "生成最终回答",
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

async function ask(
  prompt: string,
  threadId: string,
  ownerId: string,
  onProgress?: (step: string) => void,
): Promise<string> {
  return runtime.run(ownerId, threadId, prompt, step =>
    onProgress?.(toolLabels[step.startsWith("tool:") ? step.slice(5) : step] ?? step));
}

function Chat({ initialSessionId, initialTurns, ownerId, identityLabel }: {
  initialSessionId: string;
  initialTurns: StoredTurn[];
  ownerId: string;
  identityLabel: string;
}) {
  const { exit } = useApp();
  const [threadId, setThreadId] = useState(initialSessionId);
  const [turns, setTurns] = useState<Turn[]>(() =>
    initialTurns.map(turn => ({ role: turn.role, text: turn.content })));
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
      if (prompt.startsWith("/")) {
        setBusy(true);
        void (async () => {
          if (prompt === "/clear" || prompt === "/new") {
            const session = await sessions.create(ownerId);
            setThreadId(session.id);
            setTurns([]);
          } else if (prompt === "/sessions") {
            const items = await sessions.list(ownerId);
            setTurns(previous => [...previous, {
              role: "notice",
              text: items.map(item =>
                `${item.id === threadId ? "●" : " "} ${item.id}  ${item.title}`).join("\n"),
            }]);
          } else if (prompt.startsWith("/resume ")) {
            const sessionId = prompt.slice(8).trim();
            const session = await sessions.get(ownerId, sessionId);
            if (!session) throw new Error("Session not found for this local user.");
            const history = await sessions.turns(ownerId, session.id);
            await sessions.activate(ownerId, session.id);
            setThreadId(session.id);
            setTurns(history.map(turn => ({ role: turn.role, text: turn.content })));
          } else {
            setTurns(previous => [...previous, {
              role: "notice",
              text: "Commands: /sessions, /new, /resume <session-id>, /clear, /exit",
            }]);
          }
        })().catch(error => setTurns(previous => [...previous, {
          role: "error",
          text: error instanceof Error ? error.message : String(error),
        }])).finally(() => setBusy(false));
        return;
      }
      setTurns(previous => [...previous, { role: "user", text: prompt }]);
      const steps = ["识别请求类型"];
      setProgress(["识别请求类型"]);
      setBusy(true);
      void ask(prompt, threadId, ownerId, step => {
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
      <Text dimColor>{identityLabel} · session {threadId.slice(0, 8)} · /sessions /new /resume &lt;id&gt; /exit</Text>
      {turns.map((turn, index) => (
        <Box key={index} marginTop={1} flexDirection="column">
          <Text bold color={turn.role === "user" ? "cyan" : turn.role === "error" ? "red" : turn.role === "notice" ? "yellow" : "green"}>
            {turn.role === "user" ? "You" : turn.role === "error" ? "Error" : turn.role === "notice" ? "Sessions" : "OpsPilot"}
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

const runtime = await createRuntime();
const sessions = runtime.sessions;
const identity = localIdentity();

try {
  if (prompt) {
    const session = await sessions.create(identity.ownerId);
    console.log(await ask(prompt, session.id, identity.ownerId));
  } else if (!process.stdin.isTTY) {
    console.error('Interactive mode requires a terminal. For one question, run: pnpm start "Your question"');
    process.exitCode = 1;
  } else {
    const latest = (await sessions.list(identity.ownerId))[0] ??
      await sessions.create(identity.ownerId);
    const history = await sessions.turns(identity.ownerId, latest.id);
    await render(<Chat
      initialSessionId={latest.id}
      initialTurns={history}
      ownerId={identity.ownerId}
      identityLabel={identity.label}
    />).waitUntilExit();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await runtime.close();
}
