"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PreferredChannel } from "@/lib/availability/types";

import { updateCoachContact, type ContactFormState } from "./contact-actions";

type CoachContactFormProps = {
  coachId: string;
  initialEmail: string | null;
  initialPhone: string | null;
  initialChannel: PreferredChannel;
};

const initialState: ContactFormState = { error: null, message: null };

const CHANNEL_OPTIONS: Array<{ value: PreferredChannel; label: string }> = [
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
];

const SubmitButton = () => {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} size="sm">
      {pending ? "Saving…" : "Save contact"}
    </Button>
  );
};

export const CoachContactForm = ({
  coachId,
  initialEmail,
  initialPhone,
  initialChannel,
}: CoachContactFormProps) => {
  const updateWithId = updateCoachContact.bind(null, coachId);
  const [state, formAction] = useFormState(updateWithId, initialState);
  const [email, setEmail] = useState(initialEmail ?? "");
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [channel, setChannel] = useState<PreferredChannel>(initialChannel);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Contact &amp; availability channel</CardTitle>
        <CardDescription>
          Used for weekly availability magic-link requests (email or SMS).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          {state.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          {state.message ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">{state.message}</p>
          ) : null}

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Email</span>
            <input
              type="email"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="coach@imgacademy.com"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Phone (SMS)</span>
            <input
              type="tel"
              name="phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              autoComplete="tel"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="+1 555 555 5555"
            />
          </label>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-foreground">Preferred channel</legend>
            <div className="flex flex-wrap gap-3">
              {CHANNEL_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
                >
                  <input
                    type="radio"
                    name="preferred_channel"
                    value={option.value}
                    checked={channel === option.value}
                    onChange={() => setChannel(option.value)}
                    className="size-4 border-border text-primary focus:ring-ring"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <SubmitButton />
        </form>
      </CardContent>
    </Card>
  );
};
