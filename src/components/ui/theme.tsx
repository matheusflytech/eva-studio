"use client";

import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import {
  THEME_STORAGE_KEY,
  nextThemePreference,
  parseThemePreference,
  resolveTheme,
  serializeThemeCookie,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/design-system/theme";
import { IconButton } from "./icon-button";

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
    return "system";
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
const snapshotServidor = () => "system|light";

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
