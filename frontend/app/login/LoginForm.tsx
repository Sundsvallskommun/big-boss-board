"use client";

import { useActionState } from "react";
import { Button, FormControl, FormLabel, Input } from "@/components/ui";
import { login, type LoginState } from "./actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, {} as LoginState);

  return (
    <form action={formAction} className="space-y-4">
      <FormControl className="w-full">
        <FormLabel htmlFor="code">Åtkomstkod</FormLabel>
        <Input
          id="code"
          name="code"
          type="password"
          autoComplete="off"
          required
          aria-describedby={state.error ? "login-error" : undefined}
          aria-invalid={state.error ? true : undefined}
        />
      </FormControl>

      {state.error && (
        <p id="login-error" role="alert" className="text-small text-error">
          {state.error}
        </p>
      )}

      <Button type="submit" color="vattjom" variant="primary" loading={pending} className="w-full">
        Logga in
      </Button>
    </form>
  );
}
