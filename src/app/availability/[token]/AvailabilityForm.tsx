"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AvailabilityStatus } from "@/lib/conflicts";
import type { DayOfWeek } from "@/lib/conflicts";
import { AVAILABILITY_DAYS } from "@/lib/availability/types";
import { cn } from "@/lib/utils";

import { saveAvailability, type AvailabilityFormState } from "./actions";

type AvailabilityFormProps = {
  token: string;
  coachName: string;
  weekLabel: string;
  initialDays: Partial<Record<DayOfWeek, AvailabilityStatus>>;
  initialNotes: string | null;
};

const STATUS_OPTIONS: Array<{ value: AvailabilityStatus; label: string }> = [
  { value: "available", label: "Available" },
  { value: "pto", label: "PTO" },
  { value: "traveling", label: "Traveling" },
];

const initialState: AvailabilityFormState = { ok: false, error: null, message: null };

const SubmitButton = () => {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? "Saving…" : "Submit availability"}
    </Button>
  );
};

export const AvailabilityForm = ({
  token,
  coachName,
  weekLabel,
  initialDays,
  initialNotes,
}: AvailabilityFormProps) => {
  const [state, formAction] = useFormState(saveAvailability, initialState);
  const [days, setDays] = useState<Record<DayOfWeek, AvailabilityStatus>>(() => {
    const defaults = {} as Record<DayOfWeek, AvailabilityStatus>;
    for (const day of AVAILABILITY_DAYS) {
      defaults[day.key] = initialDays[day.key] ?? "available";
    }
    return defaults;
  });
  const [notes, setNotes] = useState(initialNotes ?? "");

  useEffect(() => {
    if (state.ok) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [state.ok]);

  const handleStatusChange = (day: DayOfWeek, status: AvailabilityStatus) => {
    setDays((prev) => ({ ...prev, [day]: status }));
  };

  if (state.ok && state.message) {
    return (
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="text-primary">Submitted</CardTitle>
          <CardDescription>{state.message}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Week of {weekLabel}. You can revisit this link to update your answers before
            Thursday&apos;s deadline.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="token" value={token} />

      {state.error ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Hi, {coachName.split(" ")[0]}</CardTitle>
          <CardDescription>
            Mark your status for each day — week of {weekLabel}. The window closes Thursday.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {AVAILABILITY_DAYS.map((day) => (
            <fieldset
              key={day.key}
              className="rounded-md border border-border p-3"
              aria-label={`${day.label} availability`}
            >
              <legend className="px-1 text-sm font-medium text-foreground">{day.label}</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((option) => {
                  const selected = days[day.key] === option.value;
                  return (
                    <label
                      key={option.value}
                      className={cn(
                        "cursor-pointer rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                        "focus-within:ring-2 focus-within:ring-ring",
                        selected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted/40",
                      )}
                    >
                      <input
                        type="radio"
                        name={`day_${day.key}`}
                        value={option.value}
                        checked={selected}
                        onChange={() => handleStatusChange(day.key, option.value)}
                        className="sr-only"
                      />
                      {option.label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notes (optional)</CardTitle>
          <CardDescription>
            Travel details, partial-day constraints, or anything operations should know.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <textarea
            id="notes"
            name="notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="e.g. Traveling Tue–Thu for tournament"
            aria-label="Optional notes"
          />
        </CardContent>
      </Card>

      <SubmitButton />
    </form>
  );
};
