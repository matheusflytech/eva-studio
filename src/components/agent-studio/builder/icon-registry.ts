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
} satisfies Record<string, LucideIcon>;

export type IconKey = keyof typeof ICON_REGISTRY;
