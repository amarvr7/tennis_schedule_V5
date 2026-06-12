"use client";

import { useFormState, useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { closeCollectionNow, type AdminActionResult } from "./actions";

const initialState: AdminActionResult = { ok: false, error: null, message: null };

const CloseButton = () => {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" disabled={pending} size="sm">
      {pending ? "Closing…" : "Close now"}
    </Button>
  );
};

type CloseCollectionFormProps = {
  disabled?: boolean;
};

export const CloseCollectionForm = ({ disabled }: CloseCollectionFormProps) => {
  const [state, formAction] = useFormState(closeCollectionNow, initialState);

  if (disabled) return null;

  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">{state.message}</p>
      ) : null}
      <CloseButton />
    </form>
  );
};
