import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { StatusHeader } from "../StatusHeader";
import { SubmitForm } from "./SubmitForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Lämna en fråga eller synpunkt",
  description: "Skicka in en fråga, synpunkt eller aktivitet till projektets arbetsgrupp.",
  robots: { index: false, follow: false },
};

export default function SkickaInPage() {
  return (
    <>
      <StatusHeader uppdaterad="" />

      <main
        id="huvudinnehall"
        tabIndex={-1}
        className="mx-auto max-w-[680px] px-24 pb-[96px] pt-32 outline-none md:px-32 md:pt-40"
      >
        <Link
          href="/status"
          className="mb-16 inline-flex items-center gap-4 rounded-md text-small font-semibold text-dark-secondary transition hover:text-dark-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ChevronLeft size={16} aria-hidden="true" />
          Till frågor &amp; beslut
        </Link>

        <div className="mb-24">
          <p className="eyebrow mb-8">Projektdeltagare</p>
          <h1 className="font-header text-h3 font-bold tracking-tight">
            Lämna en fråga eller synpunkt
          </h1>
          <p className="mt-12 text-small leading-relaxed text-dark-secondary">
            Skriv in en fråga, synpunkt eller aktivitet du vill lyfta i projektet. Inlämningen
            hamnar i arbetsgruppens inkorg, där vi går igenom och bearbetar den innan något
            eventuellt publiceras på status-sidan.
          </p>
        </div>

        <div className="rounded-12 border border-hairline bg-background-content p-24 md:p-28">
          <SubmitForm />
        </div>
      </main>
    </>
  );
}
