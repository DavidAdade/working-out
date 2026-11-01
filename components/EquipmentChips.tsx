"use client";

import { EQUIPMENT, type EquipmentId } from "@/lib/plan/equipment.ts";

/** One scrolling row of equipment filters: "Any" plus each kind. Used by the Library and the swap sheet. */
export default function EquipmentChips({ value, onChange }: { value: EquipmentId | null; onChange: (v: EquipmentId | null) => void }) {
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none]" role="group" aria-label="Equipment">
      {[null, ...EQUIPMENT.map((e) => e.id)].map((id) => (
        <button
          key={id ?? "any"}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className={`min-h-11 flex-none rounded-full border px-3 text-sm font-semibold ${value === id ? "border-accent bg-accent text-on-accent" : "border-line bg-surface"}`}
        >
          {id ? EQUIPMENT.find((e) => e.id === id)!.name : "Any equipment"}
        </button>
      ))}
    </div>
  );
}
