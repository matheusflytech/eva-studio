import {
  PlayCircle,
  MessageCircle,
  ListChecks,
  Aperture,
  GitBranch,
  Braces,
  Webhook,
  UserCheck,
  Clock,
  Square,
  Globe,
  Mail,
  BrainCircuit,
  BookOpen,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const ICON_REGISTRY = {
  start: PlayCircle,
  message: MessageCircle,
  capture: ListChecks,
  agent: Aperture,
  condition: GitBranch,
  variable: Braces,
  webhook: Webhook,
  human: UserCheck,
  wait: Clock,
  end: Square,
  http: Globe,
  email: Mail,
  "ai-agent": BrainCircuit,
  "tool-http": Globe,
  "tool-knowledge": BookOpen,
} satisfies Record<string, LucideIcon>;

export type IconKey = keyof typeof ICON_REGISTRY;
