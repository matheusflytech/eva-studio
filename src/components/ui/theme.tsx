"use client";

import * as React from "react";
import { flushSync } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
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

/**
 * Troca o tema com a revelação em círculo a partir de onde se clicou (View
 * Transitions: o tema novo cresce por cima do antigo, só clip-path). Com
 * "reduzir movimento", um esmaecer curto. Sem suporte, troca direto.
 */
export function trocarTema(pref: ThemePreference, origem?: { x: number; y: number }) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
  const antes = document.documentElement.getAttribute("data-theme");
  const depois = resolveTheme(pref, sistemaEscuro());
  if (!doc.startViewTransition || antes === depois) return setThemePreference(pref);
  const calmo = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  document.documentElement.classList.add("trocando-tema");
  const t = doc.startViewTransition(() => flushSync(() => setThemePreference(pref)));
  void t.ready
    .then(() => {
      const x = origem?.x ?? window.innerWidth / 2;
      const y = origem?.y ?? window.innerHeight / 2;
      const raio = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      const anim = calmo
        ? document.documentElement.animate({ opacity: [0, 1] }, { duration: 320, easing: "ease-out", pseudoElement: "::view-transition-new(root)" })
        : document.documentElement.animate(
            { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${raio}px at ${x}px ${y}px)`] },
            // Medido no vídeo do Lumen: ~0,25 s acelerando até cobrir. Aqui um pouco mais
            // longo porque a tela do desktop é maior; acelera e termina fora da tela.
            { duration: 420, easing: "cubic-bezier(0.5, 0, 0.75, 0)", pseudoElement: "::view-transition-new(root)" }
          );
      return anim.finished;
    })
    .catch(() => undefined)
    .finally(() => document.documentElement.classList.remove("trocando-tema"));
}

const centroDe = (el: Element) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

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
  const { preference } = useTheme();
  const calmo = useReducedMotion();
  const Icone = preference === "light" ? Sun : preference === "dark" ? Moon : Monitor;
  return (
    <IconButton
      aria-label={`${ROTULO[preference]}. Clique para trocar.`}
      tooltip={ROTULO[preference]}
      variant="secondary"
      className={className}
      onClick={(e) => trocarTema(nextThemePreference(preference), centroDe(e.currentTarget))}
    >
      {/* O ícone gira para dentro com mola, como uma tecla que vira. */}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={preference}
          className="inline-flex"
          initial={calmo ? { opacity: 0 } : { opacity: 0, rotate: -90, scale: 0.4 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={calmo ? { opacity: 0 } : { opacity: 0, rotate: 90, scale: 0.4 }}
          transition={{ type: "spring", stiffness: 520, damping: 30, mass: 0.7 }}
        >
          <Icone />
        </motion.span>
      </AnimatePresence>
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
  const { preference } = useTheme();
  return (
    <SegmentedControl
      label="Tema"
      options={OPCOES_DE_TEMA}
      value={preference}
      // A revelação nasce do segmento clicado (é ele que está com o foco).
      onChange={(p) => trocarTema(p, document.activeElement instanceof HTMLElement ? centroDe(document.activeElement) : undefined)}
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
