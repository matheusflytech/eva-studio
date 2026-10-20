"use client";

import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import {
  CANVAS_STORAGE_KEY,
  PREFERENCIA_PADRAO,
  THEME_STORAGE_KEY,
  parseCanvasPreference,
  resolveCanvasTheme,
  nextThemePreference,
  parseThemePreference,
  resolveTheme,
  serializeThemeCookie,
  type CanvasPreference,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/design-system/theme";
import { IconButton } from "./icon-button";
import { SegmentedControl } from "./segmented-control";
import { Switch } from "./switch";

/*
 * Tema no cliente. O <head> já aplicou data-theme antes da pintura (ver
 * THEME_INIT_SCRIPT); aqui só lemos/gravamos a preferência e reagimos à troca
 * de tema do sistema operacional quando a preferência é "system".
 */

const EVENTO = "eva-theme-change";
const MIDIA = "(prefers-color-scheme: dark)";

function lerPreferencia(): ThemePreference {
  try {
    return parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return PREFERENCIA_PADRAO;
  }
}

function sistemaEscuro(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.(MIDIA).matches;
}

function aplicar(pref: ThemePreference) {
  document.documentElement.setAttribute("data-theme", resolveTheme(pref, sistemaEscuro()));
}

function subscribe(avisar: () => void) {
  const midia = window.matchMedia?.(MIDIA);
  const aoMudarSistema = () => {
    if (lerPreferencia() === "system") aplicar("system");
    avisar();
  };
  window.addEventListener(EVENTO, avisar);
  window.addEventListener("storage", avisar);
  midia?.addEventListener("change", aoMudarSistema);
  return () => {
    window.removeEventListener(EVENTO, avisar);
    window.removeEventListener("storage", avisar);
    midia?.removeEventListener("change", aoMudarSistema);
  };
}

// Snapshot como string: useSyncExternalStore compara por ===.
const snapshot = () => `${lerPreferencia()}|${resolveTheme(lerPreferencia(), sistemaEscuro())}`;
const snapshotServidor = () => `${PREFERENCIA_PADRAO}|light`;

export function setThemePreference(pref: ThemePreference) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // aba anônima/bloqueada: o cookie ainda guarda
  }
  document.cookie = serializeThemeCookie(pref);
  aplicar(pref);
  window.dispatchEvent(new Event(EVENTO));
}

export function useTheme(): {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (pref: ThemePreference) => void;
} {
  const valor = React.useSyncExternalStore(subscribe, snapshot, snapshotServidor);
  const [pref, resolved] = valor.split("|") as [ThemePreference, ResolvedTheme];
  return { preference: pref, resolved, setPreference: setThemePreference };
}

/** Montado uma vez em Providers: mantém o tema "system" em dia com o SO. */
export function ThemeSync() {
  useTheme();
  return null;
}

const ROTULO: Record<ThemePreference, string> = {
  system: "Tema: segue o sistema",
  light: "Tema: claro",
  dark: "Tema: escuro",
};

/** Botão que alterna sistema → claro → escuro. */
export function ThemeToggle({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();
  const Icone = preference === "light" ? Sun : preference === "dark" ? Moon : Monitor;
  return (
    <IconButton
      aria-label={`${ROTULO[preference]}. Clique para trocar.`}
      tooltip={ROTULO[preference]}
      variant="secondary"
      className={className}
      onClick={() => setPreference(nextThemePreference(preference))}
    >
      <Icone />
    </IconButton>
  );
}

const OPCOES_DE_TEMA: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "Claro", icon: <Sun /> },
  { value: "dark", label: "Escuro", icon: <Moon /> },
  { value: "system", label: "Seguir o sistema", icon: <Monitor /> },
];

/** Escolha explícita do tema (Configurações → Sua conta). */
export function ThemeChooser({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();
  return (
    <SegmentedControl
      label="Tema"
      options={OPCOES_DE_TEMA}
      value={preference}
      onChange={setPreference}
      className={className}
    />
  );
}

/* ---- Canvas do builder: acompanha o tema ou fica sempre escuro ---- */

const EVENTO_CANVAS = "eva-canvas-change";

function lerCanvas(): CanvasPreference {
  try {
    return parseCanvasPreference(localStorage.getItem(CANVAS_STORAGE_KEY));
  } catch {
    return "tema";
  }
}

function subscribeCanvas(avisar: () => void) {
  window.addEventListener(EVENTO_CANVAS, avisar);
  window.addEventListener("storage", avisar);
  return () => {
    window.removeEventListener(EVENTO_CANVAS, avisar);
    window.removeEventListener("storage", avisar);
  };
}

export function setCanvasPreference(pref: CanvasPreference) {
  try {
    localStorage.setItem(CANVAS_STORAGE_KEY, pref);
  } catch {
    // aba anônima/bloqueada: vale só até recarregar
  }
  window.dispatchEvent(new Event(EVENTO_CANVAS));
}

/** Tema efetivo do canvas do builder (já considera "sempre escuro"). */
export function useCanvasTheme(): {
  preference: CanvasPreference;
  resolved: ResolvedTheme;
  setPreference: (pref: CanvasPreference) => void;
} {
  const { resolved: temaDoApp } = useTheme();
  const preference = React.useSyncExternalStore(subscribeCanvas, lerCanvas, () => "tema" as CanvasPreference);
  return { preference, resolved: resolveCanvasTheme(preference, temaDoApp), setPreference: setCanvasPreference };
}

/** Liga/desliga "canvas sempre escuro". */
export function CanvasThemeSwitch({ id = "canvas-sempre-escuro" }: { id?: string }) {
  const { preference, setPreference } = useCanvasTheme();
  return (
    <Switch
      id={id}
      checked={preference === "escuro"}
      onCheckedChange={(ligado) => setPreference(ligado ? "escuro" : "tema")}
    />
  );
}
