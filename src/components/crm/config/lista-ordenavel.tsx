"use client";

import * as React from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

// Lista que se reordena arrastando (ou com o teclado, pela alça). Serve as
// etapas do funil e os campos personalizados.

export function ListaOrdenavel<T extends { id: string }>({
  itens,
  onReordenar,
  children,
}: {
  itens: T[];
  onReordenar: (novaOrdem: T[]) => void;
  children: (item: T, alca: React.ReactNode) => React.ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function aoSoltar(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const de = itens.findIndex((i) => i.id === active.id);
    const para = itens.findIndex((i) => i.id === over.id);
    if (de < 0 || para < 0) return;
    onReordenar(arrayMove(itens, de, para));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={aoSoltar}>
      <SortableContext items={itens.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {itens.map((item) => (
            <Linha key={item.id} id={item.id}>
              {(alca) => children(item, alca)}
            </Linha>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function Linha({ id, children }: { id: string; children: (alca: React.ReactNode) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const alca = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label="Arrastar para reordenar"
      className="flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-text-tertiary hover:text-text-primary active:cursor-grabbing"
    >
      <GripVertical size={16} />
    </button>
  );
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "relative z-10 opacity-80 shadow-2xl")}
    >
      {children(alca)}
    </div>
  );
}
