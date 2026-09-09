export interface FlowCondition {
  trigger: string;
  action: string;
}

export interface FlowStep {
  id: string;
  title: string;
  objective: string;
  contextAction?: string;
  bullets?: string[];
  conditions?: FlowCondition[];
}
