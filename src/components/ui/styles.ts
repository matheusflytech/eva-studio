/**
 * Classes compartilhadas pelos componentes do design system.
 * Só tokens semânticos aqui; nenhum hex.
 */

/** Anel de foco visível (teclado). 2px, cor --focus-ring, afastado 2px. */
export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** Moldura de campo (input, select, textarea, gatilho de filtro). */
export const fieldBase =
  "w-full rounded-[10px] border border-border-subtle bg-raised text-body text-text-primary placeholder:text-text-tertiary " +
  "transition-colors duration-120 hover:border-border-default " +
  "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus focus-visible:border-focus " +
  "disabled:cursor-not-allowed disabled:bg-raised disabled:text-text-disabled " +
  "aria-[invalid=true]:border-danger";

/** Item de menu (dropdown, filtro). */
export const menuItemBase =
  "flex min-h-8 cursor-pointer select-none items-center gap-2 rounded-lg px-2 text-small text-text-primary outline-none " +
  "data-[highlighted]:bg-hover data-[disabled]:pointer-events-none data-[disabled]:text-text-disabled";

/** Caixa de overlay (menu, popover). Única superfície com sombra. */
export const overlayBox =
  "z-50 rounded-[14px] border border-border-subtle bg-overlay p-1.5 text-text-primary shadow-overlay " +
  "origin-[var(--radix-dropdown-menu-content-transform-origin,var(--radix-popover-content-transform-origin,top))] " +
  "data-[state=open]:animate-[ds-menu-in_var(--dur-base)_var(--ease-out)] data-[state=closed]:animate-[ds-menu-out_var(--dur-fast)_var(--ease-in)]";
