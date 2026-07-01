"use client";

import { useActionState, useEffect, useRef } from "react";
import { Send, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button, Textarea, FormControl, FormLabel } from "@/components/ui";
import { submitSynpunkt, type SubmitState } from "./actions";

export function SubmitForm() {
  const [state, formAction, pending] = useActionState(submitSynpunkt, {} as SubmitState);
  const formRef = useRef<HTMLFormElement>(null);

  // Töm fältet efter en lyckad inlämning så att fler kan skickas in.
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={formAction} className="space-y-16">
      <FormControl>
        <FormLabel htmlFor="text">Din fråga, synpunkt eller aktivitet</FormLabel>
        <Textarea
          id="text"
          name="text"
          rows={6}
          required
          maxLength={4000}
          placeholder="Skriv fritt — t.ex. en fråga du vill lyfta, en synpunkt på arbetet eller en aktivitet att ta med."
        />
        <p className="text-small leading-relaxed text-dark-secondary">
          Skriv endast öppen information — inga personuppgifter eller känsliga uppgifter.
        </p>
      </FormControl>

      {/* Honeypot: dolt för människor, fångar enkla bottar. Lämnas alltid tomt. */}
      <div aria-hidden="true" className="hidden">
        <label htmlFor="kontakt">Lämna detta fält tomt</label>
        <input id="kontakt" name="kontakt" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <Button
        type="submit"
        variant="primary"
        loading={pending}
        disabled={pending}
        leftIcon={<Send size={16} aria-hidden="true" />}
      >
        Skicka in
      </Button>

      {state.message &&
        (state.ok ? (
          <p
            role="status"
            aria-live="polite"
            className="flex items-center gap-8 rounded-12 bg-success-background-200 p-16 text-small font-semibold text-success-text"
          >
            <CheckCircle2 size={16} className="shrink-0" aria-hidden="true" />
            {state.message}
          </p>
        ) : (
          <p
            role="status"
            aria-live="polite"
            className="flex items-start gap-8 rounded-12 bg-error-background-200 p-16 text-small text-error-text"
          >
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            {state.message}
          </p>
        ))}
    </form>
  );
}
