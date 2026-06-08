"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  requestPasswordReset,
  type ForgotPasswordState,
} from "./actions";

const initialState: ForgotPasswordState = { error: null, success: false };

const inputClassName =
  "rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

const SubmitButton = () => {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} aria-label="Send reset link" className="w-full" size="lg">
      {pending ? "Sending…" : "Send reset link"}
    </Button>
  );
};

export const ForgotPasswordForm = () => {
  const [state, formAction] = useFormState(requestPasswordReset, initialState);

  if (state.success) {
    return (
      <div
        role="status"
        className="flex w-full max-w-sm flex-col gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-800 dark:text-emerald-300"
      >
        <p className="font-medium">Check your email</p>
        <p>
          If an account exists for that address, you&apos;ll receive a password
          reset link shortly.
        </p>
        <Link
          href="/login"
          className="mt-1 text-sm font-medium text-foreground underline-offset-2 hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium text-foreground">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className={inputClassName}
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />

      <Link
        href="/login"
        className="text-center text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        Back to sign in
      </Link>
    </form>
  );
};
