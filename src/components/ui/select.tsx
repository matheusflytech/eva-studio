"use client";

import * as React from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { fieldBase, overlayBox } from "./styles";

/* Seleção de uma opção. Mesma API do <select> (value, onChange com
   e.target.value, <option> e <optgroup> como filhos), mas a lista é a da Eva,
   não a do sistema: vidro, check na escolhida, mola ao abrir, busca por
   digitação (Radix). Um <select> escondido continua no formulário (name,
   required). Para múltipla escolha com busca, use FilterButton. */

interface Opcao {
  value: string;
  label: React.ReactNode;
  texto: string;
  disabled: boolean;
}
interface Grupo {
  label: string | null;
  opcoes: Opcao[];
}

function textoDe(no: React.ReactNode): string {
  if (no === null || no === undefined || typeof no === "boolean") return "";
  if (typeof no === "string" || typeof no === "number") return String(no);
  if (Array.isArray(no)) return no.map(textoDe).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(no)) return textoDe(no.props.children);
  return "";
}

/** Lê os <option>/<optgroup> (inclusive dentro de fragmentos e listas). */
export function lerOpcoes(children: React.ReactNode): Grupo[] {
  const grupos: Grupo[] = [{ label: null, opcoes: [] }];
  const visitar = (nos: React.ReactNode, grupo: Grupo) => {
    React.Children.forEach(nos, (no) => {
      if (!React.isValidElement<{ children?: React.ReactNode; value?: unknown; disabled?: boolean; label?: string }>(no)) return;
      if (no.type === React.Fragment) return visitar(no.props.children, grupo);
      if (no.type === "optgroup") {
        const g: Grupo = { label: no.props.label ?? "", opcoes: [] };
        grupos.push(g);
        return visitar(no.props.children, g);
      }
      if (no.type === "option") {
        const texto = textoDe(no.props.children);
        grupo.opcoes.push({
          value: no.props.value === undefined ? texto : String(no.props.value),
          label: no.props.children,
          texto,
          disabled: !!no.props.disabled,
        });
      }
    });
  };
  visitar(children, grupos[0]);
  return grupos.filter((g) => g.opcoes.length > 0);
}

type Props = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "multiple" | "size">;

export const Select = React.forwardRef<HTMLSelectElement, Props>(
  ({ className, children, value, defaultValue, onChange, disabled, id, name, required, ...rest }, ref) => {
    const grupos = React.useMemo(() => lerOpcoes(children), [children]);
    const todas = grupos.flatMap((g) => g.opcoes);
    const controlado = value !== undefined;
    const [interno, setInterno] = React.useState(() => String(defaultValue ?? todas[0]?.value ?? ""));
    const atual = controlado ? String(value ?? "") : interno;
    const escolhida = todas.find((o) => o.value === atual) ?? null;
    const [aberto, setAberto] = React.useState(false);
    const nativo = React.useRef<HTMLSelectElement | null>(null);
    const juntarRef = (el: HTMLSelectElement | null) => {
      nativo.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) ref.current = el;
    };

    function escolher(v: string) {
      if (v === atual) return;
      if (!controlado) setInterno(v);
      const el = nativo.current;
      if (el) el.value = v;
      // Quem usa lê e.target.value, como no <select> de sempre.
      const alvo = el ?? ({ value: v, name } as HTMLSelectElement);
      onChange?.({ target: alvo, currentTarget: alvo } as React.ChangeEvent<HTMLSelectElement>);
    }

    const ariaInvalid = rest["aria-invalid"];
    return (
      <div className={cn("relative", className?.match(/\b(w-|flex-|min-w-|max-w-)\S+/g)?.join(" "))}>
        <select
          ref={juntarRef}
          tabIndex={-1}
          aria-hidden="true"
          name={name}
          required={required}
          disabled={disabled}
          value={atual}
          onChange={() => {}}
          className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        >
          {todas.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.texto}
            </option>
          ))}
        </select>
        <Menu.Root open={aberto} onOpenChange={setAberto} modal={false}>
          <Menu.Trigger asChild disabled={disabled}>
            <button
              type="button"
              id={id}
              aria-label={rest["aria-label"]}
              aria-labelledby={rest["aria-labelledby"]}
              aria-describedby={rest["aria-describedby"]}
              aria-invalid={ariaInvalid}
              title={rest.title}
              className={cn(
                fieldBase,
                "group flex h-8 items-center gap-2 pl-2.5 pr-2 text-left",
                "data-[state=open]:border-focus data-[state=open]:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-focus)_18%,transparent)]",
                className
              )}
            >
              <span className={cn("min-w-0 flex-1 truncate", !escolhida?.value && "text-text-tertiary")}>{escolhida?.label ?? ""}</span>
              <ChevronDown
                size={14}
                aria-hidden="true"
                className="shrink-0 text-text-tertiary transition-transform duration-[var(--dur-base)] ease-out group-data-[state=open]:rotate-180"
              />
            </button>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content
              align="start"
              sideOffset={6}
              collisionPadding={12}
              className={cn(
                overlayBox,
                "max-h-[min(320px,var(--radix-dropdown-menu-content-available-height))] min-w-[max(var(--radix-dropdown-menu-trigger-width),180px)] overflow-y-auto overscroll-contain outline-none"
              )}
            >
              <Menu.RadioGroup value={atual} onValueChange={escolher}>
                {grupos.map((g, gi) => (
                  <React.Fragment key={`${g.label ?? ""}-${gi}`}>
                    {gi > 0 && g.label !== null && <Menu.Separator className="-mx-1 my-1 h-px bg-border-subtle" />}
                    {g.label && <Menu.Label className="px-2.5 pb-1 pt-1.5 text-caption font-medium uppercase tracking-[0.06em] text-text-tertiary">{g.label}</Menu.Label>}
                    {g.opcoes.map((o) => (
                      <Menu.RadioItem
                        key={o.value}
                        value={o.value}
                        disabled={o.disabled}
                        textValue={o.texto}
                        className={cn(
                          "relative flex min-h-9 cursor-pointer select-none items-center gap-2 rounded-[10px] py-1.5 pl-2.5 pr-8 text-small text-text-primary outline-none",
                          "transition-colors duration-100 data-[highlighted]:bg-hover data-[state=checked]:font-medium",
                          "data-[disabled]:pointer-events-none data-[disabled]:text-text-disabled"
                        )}
                      >
                        <span className={cn("min-w-0 flex-1 truncate", !o.value && "text-text-tertiary")}>{o.label}</span>
                        <Menu.ItemIndicator className="absolute right-2.5 flex items-center">
                          <Check size={14} className="text-accent-fg" aria-hidden="true" />
                        </Menu.ItemIndicator>
                      </Menu.RadioItem>
                    ))}
                  </React.Fragment>
                ))}
              </Menu.RadioGroup>
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>
      </div>
    );
  }
);
Select.displayName = "Select";
