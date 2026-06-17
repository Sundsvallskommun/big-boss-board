// Importeras från subpaketet (inte umbrella) så server-grafen slipper forms/RHF.
import { Logo } from "@sk-web-gui/logo";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main
      id="huvudinnehall"
      tabIndex={-1}
      className="mx-auto flex min-h-screen max-w-[420px] flex-col justify-center px-6 py-16 outline-none"
    >
      <span className="mb-8 flex h-9 items-center [&_svg]:h-9 [&_svg]:w-auto">
        <Logo variant="logo" />
      </span>
      <h1 className="font-header text-h3 font-bold tracking-tight">Logga in</h1>
      <p className="mb-6 mt-2 text-base leading-relaxed text-dark-secondary">
        Ange åtkomstkoden för att öppna dialogstödet.
      </p>
      <LoginForm />
      <p className="mt-8 text-small text-dark-secondary">
        Använd endast öppen och publik information i dialogen.
      </p>
    </main>
  );
}
