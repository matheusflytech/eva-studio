/**
 * Classes compartilhadas pelos componentes do design system.
 * Só tokens semânticos aqui; nenhum hex.
 */

/** Anel de foco visível (teclado). 2px, cor --focus-ring, afastado 2px. */
export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** Moldura de campo (input, select, textarea, gatilho de filtro). */
export const fieldBase =
  "w-full rounded-md border border-border-default bg-panel text-body text-text-primary placeholder:text-text-tertiary " +
  "transition-colors duration-120 hover:border-border-strong " +
  "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus focus-visible:border-focus " +
  "disabled:cursor-not-allowed disabled:bg-raised disabled:text-text-disabled " +
  "aria-[invalid=true]:border-danger";

/** Item de menu (dropdown, filtro). */
export const menuItemBase =
  "flex min-h-8 cursor-pointer select-none items-center gap-2 rounded-sm px-2 text-small text-text-primary outline-none " +
  "data-[highlighted]:bg-hover data-[disabled]:pointer-events-none data-[disabled]:text-text-disabled";

/** Caixa de overlay (menu, popover). Única superfície com sombra. */
export const overlayBox =
  "z-50 rounded-lg border border-border-default bg-overlay p-1 text-text-primary shadow-overlay " +
  "data-[state=open]:animate-[ds-pop-in_160ms_var(--ease-standard)]";
