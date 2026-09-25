export type EvidenceSource =
  | "logs"
  | "deployment"
  | "github";

export type EvidenceType =
  | "error"
  | "deployment"
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