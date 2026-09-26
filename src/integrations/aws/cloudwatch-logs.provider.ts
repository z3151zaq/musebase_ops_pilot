import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
  FilterLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";

const client = new CloudWatchLogsClient({});

export interface LogEvent {
  timestamp: string;
  message: string;
  logStreamName?: string;
}

export interface LogSearchResult {
  logGroupName: string;
  startTime: string;
  endTime: string;
  query?: string;
  events: LogEvent[];
  matchedEventsRead: number;
  truncated: boolean;
}

export function redactLogMessage(message: string): string {
  return message
    .replace(/(["']?authorization["']?\s*[:=]\s*["']?)(?:Bearer\s+)?[^"'\s,}]+/gi, "$1[REDACTED]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+/gi, "Bearer [REDACTED]")
    .replace(/(["']?(?:password|secret|token|api[_-]?key|authorization)["']?\s*[:=]\s*["']?)[^"'\s,}]+/gi, "$1[REDACTED]");
}

export async function discoverLogGroups(input: {
  prefix?: string;
  nextToken?: string;
  limit: number;
}) {
  const response = await client.send(new DescribeLogGroupsCommand({
    logGroupNamePrefix: input.prefix || undefined,
    nextToken: input.nextToken,
    limit: input.limit,
  }));

  return {
    groups: (response.logGroups ?? []).map(group => ({
      name: group.logGroupName,
      arn: group.arn,
      storedBytes: group.storedBytes,
    })),
    nextToken: response.nextToken ?? null,
  };
}

export async function searchCloudWatchLogs(input: {
  logGroupName: string;
  startTime: Date;
  endTime: Date;
  query?: string;
  limit: number;
}): Promise<LogSearchResult> {
  const events: LogEvent[] = [];
  let matchedEventsRead = 0;
  let nextToken: string | undefined;
  let pages = 0;

  do {
    const response = await client.send(new FilterLogEventsCommand({
      logGroupName: input.logGroupName,
      startTime: input.startTime.getTime(),
      endTime: input.endTime.getTime(),
      filterPattern: input.query ? `"${input.query}"` : undefined,
      limit: 100,
      nextToken,
    }));

    for (const event of response.events ?? []) {
      matchedEventsRead += 1;
      events.push({
        timestamp: new Date(event.timestamp ?? 0).toISOString(),
        message: redactLogMessage((event.message ?? "").slice(0, 2_000)),
        logStreamName: event.logStreamName,
      });
    }

    if (events.length > input.limit) {
      events.splice(0, events.length - input.limit);
    }

    nextToken = response.nextToken;
    pages += 1;
  } while (nextToken && pages < 5);

  return {
    logGroupName: input.logGroupName,
    startTime: input.startTime.toISOString(),
    endTime: input.endTime.toISOString(),
    query: input.query,
    events,
    matchedEventsRead,
    truncated: Boolean(nextToken),
  };
}
