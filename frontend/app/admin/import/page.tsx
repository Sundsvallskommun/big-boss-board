import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { isAdmin } from "@/lib/auth";
import { BrandBar } from "@/components/BrandBar";
import { ImportForm } from "./ImportForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Importera data",
  robots: { index: false, follow: false },
};

export default async function AdminImportPage() {
  // Syns endast för admin (inloggad med ADMIN_ACCESSCODE). Annars: finns inte.
  if (!(await isAdmin())) {
    notFound();
  }

  return (
    <>
      <BrandBar />
      <main
        id="huvudinnehall"
        tabIndex={-1}
        className="mx-auto max-w-[940px] px-24 pb-[96px] pt-32 outline-none md:px-32 md:pt-40"
      >
        <Link
          href="/"
          className="mb-16 inline-flex items-center gap-4 rounded-md text-small font-semibold text-dark-secondary transition hover:text-dark-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ChevronLeft size={16} aria-hidden="true" />
          Till förvaltningar
        </Link>

        <div className="mb-24">
          <div className="eyebrow mb-8">Admin · dataimport</div>
          <h1 className="font-header text-h3 font-bold tracking-tight">Importera data</h1>
          <p className="mt-12 text-small leading-relaxed text-dark-secondary">
            Ladda upp HME-totalindex (JSON) eller ekonomirapporten (JSON eller CSV) — filtypen känns igen automatiskt.
            Värdena uppsertas per förvaltning: det aktuella nyckeltalet ersätts med filens, medan
            övriga nyckeltal och aktiviteter lämnas orörda. Säkert att köra om vid ny data.
          </p>
        </div>

        <div className="rounded-12 border border-hairline bg-background-content p-24 md:p-28">
          <ImportForm />
        </div>
      </main>
    </>
  );
}
