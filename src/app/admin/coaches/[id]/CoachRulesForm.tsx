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
import { serializeRules, type EditableRules } from "@/lib/coaches/rules";
import { updateCoachRules, type RulesFormState } from "./actions";

type CoachRulesFormProps = {
  coachId: string;
  initialRules: EditableRules;
};

type ToggleRuleProps = {
  name: keyof EditableRules;
  label: string;
  description: string;
  checked: boolean;
  onToggle: (name: keyof EditableRules, checked: boolean) => void;
};

type TimeFieldProps = {
  name: keyof EditableRules;
  label: string;
  value: string | null;
  onChangeValue: (name: keyof EditableRules, value: string) => void;
};

const initialState: RulesFormState = { error: null, message: null, savedAt: null };

const areRulesEqual = (a: EditableRules, b: EditableRules): boolean => {
  const sa = serializeRules(a);
  const sb = serializeRules(b);
  return Object.keys(sa).every((key) => sa[key] === sb[key]);
};

const ToggleRule = ({ name, label, description, checked, onToggle }: ToggleRuleProps) => (
  <label
    htmlFor={name}
    className="flex cursor-pointer items-start justify-between gap-4 rounded-md border border-border p-3 transition-colors hover:bg-muted/40"
  >
    <span className="flex flex-col gap-0.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </span>
    <input
      id={name}
      name={name}
      type="checkbox"
      checked={checked}
      onChange={(event) => onToggle(name, event.target.checked)}
      className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-border text-primary focus:ring-ring"
    />
  </label>
);

const TimeField = ({ name, label, value, onChangeValue }: TimeFieldProps) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={name} className="text-xs font-medium text-foreground">
      {label}
    </label>
    <input
      id={name}
      name={name}
      type="time"
      value={value ?? ""}
      onChange={(event) => onChangeValue(name, event.target.value)}
      className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
    />
  </div>
);

const SaveButton = ({ disabled }: { disabled: boolean }) => {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" disabled={disabled || pending} aria-label="Save rule changes">
      {pending ? "Saving…" : "Save changes"}
    </Button>
  );
};

export const CoachRulesForm = ({ coachId, initialRules }: CoachRulesFormProps) => {
  const [state, formAction] = useFormState(updateCoachRules, initialState);
  const [rules, setRules] = useState<EditableRules>(initialRules);
  const [baseline, setBaseline] = useState<EditableRules>(initialRules);

  // After a successful save the server revalidates and sends fresh defaults;
  // re-sync the baseline so the form is no longer considered dirty.
  useEffect(() => {
    if (state.savedAt && !state.error) setBaseline(rules);
    // Only react to a new save result, not to every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.savedAt, state.error]);

  const handleToggle = (name: keyof EditableRules, checked: boolean) =>
    setRules((previous) => ({ ...previous, [name]: checked }));

  const handleTimeChange = (name: keyof EditableRules, value: string) =>
    setRules((previous) => ({ ...previous, [name]: value === "" ? null : value }));

  const isDirty = !areRulesEqual(rules, baseline);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="coach_id" value={coachId} />

      <Card>
        <CardHeader>
          <CardTitle>Restrictions</CardTitle>
          <CardDescription>Hard rules that block matching assignments.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ToggleRule
            name="no_camp"
            label="No Camp"
            description="Blocks assignment to any camp session."
            checked={rules.no_camp}
            onToggle={handleToggle}
          />
          <ToggleRule
            name="no_bt"
            label="No BT"
            description="Blocks assignment to Breakthrough (BT) sessions."
            checked={rules.no_bt}
            onToggle={handleToggle}
          />
          <ToggleRule
            name="no_drive"
            label="No Driving"
            description="Cannot be assigned the driver role on travel."
            checked={rules.no_drive}
            onToggle={handleToggle}
          />
          <ToggleRule
            name="travel_restricted"
            label="No Travel Outside Bradenton"
            description="Blocks non-local tournament assignments."
            checked={rules.travel_restricted}
            onToggle={handleToggle}
          />
          <ToggleRule
            name="adults_only"
            label="Adults Only"
            description="Can only be assigned to adults / legacy sessions."
            checked={rules.adults_only}
            onToggle={handleToggle}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Time windows</CardTitle>
          <CardDescription>
            Leave both midday fields empty for no midday block. Leave start / end empty for no time limit.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TimeField
            name="earliest_start"
            label="Earliest start"
            value={rules.earliest_start}
            onChangeValue={handleTimeChange}
          />
          <TimeField
            name="latest_end"
            label="Latest end"
            value={rules.latest_end}
            onChangeValue={handleTimeChange}
          />
          <TimeField
            name="midday_block_start"
            label="Midday block start"
            value={rules.midday_block_start}
            onChangeValue={handleTimeChange}
          />
          <TimeField
            name="midday_block_end"
            label="Midday block end"
            value={rules.midday_block_end}
            onChangeValue={handleTimeChange}
          />
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <SaveButton disabled={!isDirty} />
        {isDirty ? <span className="text-xs text-amber-600">Unsaved changes</span> : null}
        {state.error ? (
          <span role="alert" className="text-sm text-destructive">
            {state.error}
          </span>
        ) : null}
        {!state.error && state.message ? (
          <span role="status" className="text-sm text-green-600">
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  );
};
