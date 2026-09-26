import {
  Annotation,
  MessagesAnnotation,
} from "@langchain/langgraph";
import type { Evidence } from "./evidence.js";

export type RequestIntent = "general" | "incident";

export const OpsPilotState = Annotation.Root({
  ...MessagesAnnotation.spec,

  incidentId: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),

  environment: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),

  service: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),

  intent: Annotation<RequestIntent>({
    reducer: (_, update) => update,
    default: () => "general",
  }),

  requestStartIndex: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 0,
  }),

  evidenceStartIndex: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 0,
  }),

  evidence: Annotation<Evidence[]>({
    reducer: (current, update) => [
      ...current,
      ...update,
    ],
    default: () => [],
  }),

  investigationSteps: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 0,
  }),

  generalSteps: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 0,
  }),

  maxGeneralSteps: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 6,
  }),

  maxInvestigationSteps: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 10,
  }),
});

export type OpsPilotStateType =
  typeof OpsPilotState.State;
