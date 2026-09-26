export type EvidenceSource =
  | "logs"
  | "deployment"
  | "github";

export type EvidenceType =
  | "error"
  | "log_event"
  | "log_search"
  | "deployment"
  | "deployment_attempt"
  | "workflow_run"
  | "code_change"
  | "source_code";

export interface Evidence {
  id: string;

  source: EvidenceSource;

  type: EvidenceType;

  summary: string;

  timestamp?: string;

  rawData?: unknown;

  resource?: string;
}
