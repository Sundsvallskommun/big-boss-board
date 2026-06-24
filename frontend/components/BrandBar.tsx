"use client";

import Link from "next/link";
import { Logo } from "@sk-web-gui/react";

/** Topbar med SK-logo + produktetikett. Klientkomponent eftersom @sk-web-gui
 *  inte kan importeras i en server-komponent (barrel-importen drar in trasig forms-export). */
export function BrandBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-background-content">
      <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-16 px-24 py-16 md:px-32">
        <div className="flex min-w-0 items-center gap-14">
          <Link
            href="/"
            aria-label="Till startsidan"
            className="flex items-center rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_.sk-logo-figure]:!h-[48px] [&_.sk-logo-figure]:!w-[109px]"
          >
            <Logo variant="logo" />
          </Link>
          <span className="h-36 w-px shrink-0 bg-divider" aria-hidden="true" />
          <span className="truncate text-base font-semibold tracking-tight">Dialogstöd</span>
        </div>
      </div>
    </header>
  );
}
