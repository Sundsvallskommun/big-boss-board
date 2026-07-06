import { Button, Logo } from "@/components/ui";
import { isSamlMode } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

/** Felkoder från backendens SAML-callback (?failMessage=...) → saklig svensk text. */
const FAIL_MESSAGES: Record<string, string> = {
  SAML_MISSING_GROUP: "Ditt konto saknar behörighet till dialogstödet.",
  SAML_MISSING_ATTRIBUTES:
    "Inloggningen kunde inte slutföras — nödvändiga kontouppgifter saknas.",
  SAML_UNKNOWN_ERROR: "Inloggningen misslyckades. Försök igen.",
  NO_USER: "Inloggningen misslyckades. Försök igen.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ failMessage?: string }>;
}) {
  const saml = isSamlMode();
  const { failMessage } = await searchParams;
  const fel = failMessage
    ? (FAIL_MESSAGES[failMessage] ?? FAIL_MESSAGES.SAML_UNKNOWN_ERROR)
    : null;

  return (
    <main
      id="huvudinnehall"
      tabIndex={-1}
      className="mx-auto flex min-h-screen max-w-[420px] flex-col justify-center px-6 py-16 outline-none"
    >
      <span className="mb-8 flex items-center">
        <Logo variant="logo" />
      </span>
      <h1 className="font-header text-h3 font-bold tracking-tight">Logga in</h1>
      <p className="mb-6 mt-2 text-base leading-relaxed text-dark-secondary">
        {saml
          ? "Logga in med ditt konto i kommunen för att öppna dialogstödet."
          : "Ange åtkomstkoden för att öppna dialogstödet."}
      </p>
      {saml ? (
        <>
          {fel && (
            <p role="alert" className="mb-4 text-base text-error-text">
              {fel}
            </p>
          )}
          {/* GET-formulär → backendens SAML-login (302 till IdP). Funkar utan JS. */}
          <form action="/api/auth/saml/login" method="get">
            <Button type="submit" className="w-full">
              Logga in
            </Button>
          </form>
        </>
      ) : (
        <LoginForm />
      )}
      <p className="mt-8 text-small text-dark-secondary">
        Använd endast öppen och publik information i dialogen.
      </p>
    </main>
  );
}
