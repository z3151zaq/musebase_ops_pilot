import {
  Annotation,
  MessagesAnnotation,
} from "@langchain/langgraph";
import type { Evidence } from "./evidence.js";

export const OpsPilotState = Annotation.Root({
  ...MessagesAnnotation.spec,

  incidentId: Annotation<string>,

  environment: Annotation<string>,

  service: Annotation<string>,

  evidence: Annotation<Evidence[]>({
    reducer: (current, update) => [
      ...current,
      ...update,
    ],
    default: () => [],
  }),

  investigationSteps: Annotation<number>({
    reducer: (current, update) => current + update,
    default: () => 0,
  }),

  maxInvestigationSteps: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 10,
  }),
});

export type OpsPilotStateType =
  typeof OpsPilotState.State;