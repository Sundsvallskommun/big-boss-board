import { CalendarDays } from "lucide-react";
import { BrandLockup } from "@/components/BrandLockup";
import { UserBadge } from "@/components/UserBadge";

/** Topbar för projektstatus-sidan (kommunens logotyp + "Dialogstöd", Verktyg-stil). */
export function StatusHeader({ uppdaterad }: { uppdaterad: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-background-content">
      <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-16 px-24 py-16 md:px-32">
        <BrandLockup />
        <span className="flex items-center gap-16">
          {uppdaterad && (
            <span className="eyebrow-sm hidden items-center gap-6 sm:flex">
              <CalendarDays size={13} aria-hidden="true" />
              Uppdaterad {uppdaterad}
            </span>
          )}
          <UserBadge />
        </span>
      </div>
    </header>
  );
}
