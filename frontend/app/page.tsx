import { getDialogue } from "@/lib/api";
import { Dashboard } from "@/components/Dashboard";

// Alltid färsk data (dialogen ändras under samtalet).
export const dynamic = "force-dynamic";

export default async function Home() {
  let dialogue;
  try {
    dialogue = await getDialogue(1);
  } catch {
    return (
      <main className="mx-auto max-w-[640px] px-6 py-24">
        <h1 className="font-header text-h3 font-bold tracking-tight">Dialogen kunde inte hämtas</h1>
        <p className="mt-3 text-base leading-relaxed text-dark-secondary">
          Tjänsten svarar inte just nu. Försök igen om en stund.
        </p>
      </main>
    );
  }

  return <Dashboard dialogue={dialogue} />;
}
