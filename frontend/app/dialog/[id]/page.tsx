import { notFound } from "next/navigation";
import { ApiError, getDialogue } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { Dashboard } from "@/components/Dashboard";

// Alltid färsk data (dialogen ändras under samtalet).
export const dynamic = "force-dynamic";

export default async function DialoguePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dialogueId = Number(id);
  if (!Number.isInteger(dialogueId) || dialogueId <= 0) {
    notFound();
  }

  let dialogue;
  try {
    dialogue = await getDialogue(dialogueId);
  } catch (err) {
    // Saknad dialog → 404-sida. Övriga fel bubblar till app/error.tsx ("Försök igen").
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const user = await getSessionUser();
  return (
    <Dashboard
      dialogue={dialogue}
      sessionUser={user && { name: user.name, email: user.email, role: user.role }}
    />
  );
}
