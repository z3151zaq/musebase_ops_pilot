import {
  Annotation,
  MessagesAnnotation,
} from "@langchain/langgraph";

export const OpsPilotState = Annotation.Root({
  ...MessagesAnnotation.spec,

  incidentId: Annotation<string>,

  environment: Annotation<string>,

  service: Annotation<string>,

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