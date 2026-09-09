import { ICON_REGISTRY, type IconKey } from "./icon-registry";
import { BLOCK_DEFAULTS } from "./block-defaults";

export function BlockPalette({ onAdd }: { onAdd: (iconKey: IconKey) => void }) {
  return (
    <div className="glass-card w-[220px] shrink-0 rounded-3xl p-4">
      <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">Blocos</p>
      <p className="mb-3 px-1 text-[11.5px] text-text-tertiary">Clique para adicionar ao canvas.</p>
      <div className="flex flex-col gap-1">
        {BLOCK_DEFAULTS.map(({ key, paletteLabel }) => {
          const Icon = ICON_REGISTRY[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => onAdd(key)}
              className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-text-tertiary">
                <Icon size={14} />
              </span>
              {paletteLabel}
            </button>
          );
        })}
      </div>
    </div>
  );
}
