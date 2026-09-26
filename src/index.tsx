import "dotenv/config";

import { HumanMessage } from "@langchain/core/messages";
import { Box, render, Text, useApp, useInput } from "ink";
import React, { useState } from "react";

import { graph } from "./agent/graph.js";

type Turn = { role: "user" | "agent" | "error"; text: string };

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  return JSON.stringify(content, null, 2);
}

async function ask(prompt: string, threadId: string): Promise<string> {
  const result = await graph.invoke(
    { messages: [new HumanMessage(prompt)] },
    { configurable: { thread_id: threadId } },
  );
  return contentToText(result.messages.at(-1)?.content ?? "No answer returned.");
}

function Chat() {
  const { exit } = useApp();
  const [threadId, setThreadId] = useState(() => crypto.randomUUID());
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

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
      setBusy(true);
      void ask(prompt, threadId)
        .then(text => setTurns(previous => [...previous, { role: "agent", text }]))
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
          <Text>{turn.text}</Text>
        </Box>
      ))}
      {busy && <Box marginTop={1}><Text color="yellow">Thinking…</Text></Box>}
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
