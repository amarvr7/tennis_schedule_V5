"use client";

import { useFormState, useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { resendRequest, type AdminActionResult } from "./actions";

const initialState: AdminActionResult = { ok: false, error: null, message: null };

const SubmitResend = () => {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? "Sending…" : "Resend"}
    </Button>
  );
};

type ResendButtonProps = {
  requestId: string;
  disabled?: boolean;
};

export const ResendButton = ({ requestId, disabled }: ResendButtonProps) => {
  const resendWithId = resendRequest.bind(null, requestId);
  const [state, formAction] = useFormState(resendWithId, initialState);

  if (disabled) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      {state.error ? (
        <span className="text-xs text-destructive">{state.error}</span>
      ) : null}
      {state.message ? (
        <span className="text-xs text-emerald-600 dark:text-emerald-400">{state.message}</span>
      ) : null}
      <SubmitResend />
    </form>
  );
};
