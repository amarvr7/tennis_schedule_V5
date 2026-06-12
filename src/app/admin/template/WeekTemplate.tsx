"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Calendar03Icon, Delete02Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TemplateSlot } from "@/lib/schedule/load";
import { formatTime, normalizeTime } from "@/lib/coaches/rules";
import {
  addTemplateSlot,
  archiveTemplateSlot,
  updateTemplateSlot,
  type TemplateSlotInput,
} from "./actions";

export type TemplateProgramOption = { id: string; name: string };
export type TemplateZoneOption = { name: string; surface: string | null };

type WeekTemplateProps = {
  slots: TemplateSlot[];
  programs: TemplateProgramOption[];
  zones: TemplateZoneOption[];
};

const DAY_ORDER = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

const DAY_LABEL: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

const inputClass =
  "h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

type SlotFormState = TemplateSlotInput;

const EMPTY_FORM: SlotFormState = {
  programId: "",
  dayOfWeek: "monday",
  startTime: "08:00",
  endTime: "10:00",
  courtZone: "",
  courtNumbers: "",
  surface: "",
  notes: "",
};

type SlotFormProps = {
  form: SlotFormState;
  programs: TemplateProgramOption[];
  zones: TemplateZoneOption[];
  busy: boolean;
  submitLabel: string;
  onChange: (form: SlotFormState) => void;
  onSubmit: () => void;
  onCancel?: () => void;
};

const SlotForm = ({
  form,
  programs,
  zones,
  busy,
  submitLabel,
  onChange,
  onSubmit,
  onCancel,
}: SlotFormProps) => {
  const set = (patch: Partial<SlotFormState>) => onChange({ ...form, ...patch });

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex min-w-44 flex-1 flex-col gap-1 text-[0.625rem] font-medium text-muted-foreground">
        Group
        <select
          value={form.programId}
          onChange={(event) => set({ programId: event.target.value })}
          className={inputClass}
          aria-label="Group for the slot"
        >
          <option value="">Pick a group…</option>
          {programs.map((program) => (
            <option key={program.id} value={program.id}>
              {program.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[0.625rem] font-medium text-muted-foreground">
        Day
        <select
          value={form.dayOfWeek}
          onChange={(event) => set({ dayOfWeek: event.target.value })}
          className={inputClass}
          aria-label="Day of week"
        >
          {DAY_ORDER.map((day) => (
            <option key={day} value={day}>
              {DAY_LABEL[day]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[0.625rem] font-medium text-muted-foreground">
        Start
        <input
          type="time"
          value={form.startTime}
          onChange={(event) => set({ startTime: event.target.value })}
          className={inputClass}
          aria-label="Start time"
        />
      </label>
      <label className="flex flex-col gap-1 text-[0.625rem] font-medium text-muted-foreground">
        End
        <input
          type="time"
          value={form.endTime}
          onChange={(event) => set({ endTime: event.target.value })}
          className={inputClass}
          aria-label="End time"
        />
      </label>
      <label className="flex flex-col gap-1 text-[0.625rem] font-medium text-muted-foreground">
        Court zone
        <select
          value={form.courtZone}
          onChange={(event) => {
            const zone = zones.find((entry) => entry.name === event.target.value);
            set({ courtZone: event.target.value, surface: zone?.surface ?? form.surface });
          }}
          className={inputClass}
          aria-label="Court zone"
        >
          <option value="">—</option>
          {zones.map((zone) => (
            <option key={zone.name} value={zone.name}>
              {zone.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[0.625rem] font-medium text-muted-foreground">
        Courts
        <input
          type="text"
          value={form.courtNumbers}
          onChange={(event) => set({ courtNumbers: event.target.value })}
          placeholder="e.g. Hard 15-18"
          className={cn(inputClass, "w-32")}
          aria-label="Court numbers"
        />
      </label>
      <label className="flex min-w-36 flex-1 flex-col gap-1 text-[0.625rem] font-medium text-muted-foreground">
        Notes
        <input
          type="text"
          value={form.notes}
          onChange={(event) => set({ notes: event.target.value })}
          placeholder="Optional"
          className={inputClass}
          aria-label="Slot notes"
        />
      </label>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={onSubmit} disabled={busy || !form.programId}>
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
};

export const WeekTemplate = ({ slots, programs, zones }: WeekTemplateProps) => {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [addForm, setAddForm] = useState<SlotFormState>(EMPTY_FORM);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<SlotFormState>(EMPTY_FORM);
  const [isPending, startTransition] = useTransition();

  const slotsByDay = useMemo(() => {
    const map = new Map<string, TemplateSlot[]>();
    for (const slot of slots) {
      const day = slot.dayOfWeek ?? "monday";
      const list = map.get(day) ?? [];
      list.push(slot);
      map.set(day, list);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          a.startTime.localeCompare(b.startTime) || a.programName.localeCompare(b.programName),
      );
    }
    return map;
  }, [slots]);

  const handleAdd = () => {
    setError(null);
    startTransition(async () => {
      const result = await addTemplateSlot(addForm);
      if (!result.ok && result.error) {
        setError(result.error);
      } else {
        setAddForm({ ...EMPTY_FORM, dayOfWeek: addForm.dayOfWeek });
      }
      router.refresh();
    });
  };

  const handleStartEdit = (slot: TemplateSlot) => {
    setError(null);
    setEditingSlotId(slot.id);
    setEditForm({
      programId: slot.programId ?? "",
      dayOfWeek: slot.dayOfWeek ?? "monday",
      startTime: normalizeTime(slot.startTime) ?? "08:00",
      endTime: normalizeTime(slot.endTime) ?? "10:00",
      courtZone: slot.courtZone ?? "",
      courtNumbers: slot.courtNumbers ?? "",
      surface: slot.surface ?? "",
      notes: slot.notes ?? "",
    });
  };

  const handleSaveEdit = () => {
    if (!editingSlotId) return;
    setError(null);
    startTransition(async () => {
      const result = await updateTemplateSlot(editingSlotId, editForm);
      if (!result.ok && result.error) {
        setError(result.error);
      } else {
        setEditingSlotId(null);
      }
      router.refresh();
    });
  };

  const handleArchive = (slotId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await archiveTemplateSlot(slotId);
      if (!result.ok && result.error) setError(result.error);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={Calendar03Icon} className="text-primary" aria-hidden="true" />
          <h1 className="text-xl font-semibold text-foreground">Week Template</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          The master week for the season. Creating a week clones these slots into that
          week&rsquo;s own copy — edits here affect only weeks created afterward, and week
          edits never change this master.
        </p>
      </header>

      {error ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <section className="flex flex-col gap-3 rounded-lg bg-card p-4 ring-1 ring-foreground/10">
        <h2 className="text-sm font-semibold text-foreground">Add a slot</h2>
        <SlotForm
          form={addForm}
          programs={programs}
          zones={zones}
          busy={isPending}
          submitLabel="Add slot"
          onChange={setAddForm}
          onSubmit={handleAdd}
        />
      </section>

      {slots.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-10 text-center">
          <HugeiconsIcon icon={Calendar03Icon} size={28} className="text-muted-foreground/60" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">The master template is empty</p>
          <p className="text-xs text-muted-foreground">
            Add every recurring slot of the weekly grid (A/B schedules, PM, Pro/Elite,
            camps, adults, evening practice). Weeks are created from this template.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {DAY_ORDER.filter((day) => (slotsByDay.get(day) ?? []).length > 0).map((day) => (
            <section key={day} className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-foreground">{DAY_LABEL[day]}</h2>
              <ul className="flex flex-col gap-1.5">
                {(slotsByDay.get(day) ?? []).map((slot) => (
                  <li
                    key={slot.id}
                    className="flex flex-col gap-2 rounded-md bg-card p-3 ring-1 ring-foreground/10"
                  >
                    {editingSlotId === slot.id ? (
                      <SlotForm
                        form={editForm}
                        programs={programs}
                        zones={zones}
                        busy={isPending}
                        submitLabel="Save"
                        onChange={setEditForm}
                        onSubmit={handleSaveEdit}
                        onCancel={() => setEditingSlotId(null)}
                      />
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-semibold text-foreground">
                            {slot.programName}
                          </span>
                          <span className="text-[0.6875rem] text-muted-foreground">
                            {formatTime(normalizeTime(slot.startTime) ?? slot.startTime)} –{" "}
                            {formatTime(normalizeTime(slot.endTime) ?? slot.endTime)}
                            {slot.courtNumbers || slot.courtZone
                              ? ` · ${slot.courtNumbers ?? slot.courtZone}`
                              : ""}
                            {slot.notes ? ` · ${slot.notes}` : ""}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(slot)}
                            disabled={isPending}
                            aria-label={`Edit ${slot.programName} slot`}
                            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
                          >
                            <HugeiconsIcon icon={PencilEdit02Icon} size={14} strokeWidth={2} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleArchive(slot.id)}
                            disabled={isPending}
                            aria-label={`Remove ${slot.programName} slot from the master template`}
                            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
                          >
                            <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
