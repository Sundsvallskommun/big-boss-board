import { BrandLockup } from "@/components/BrandLockup";
import { UserBadge } from "@/components/UserBadge";

/** Topbar med kommunens logotyp + produktnamn "Dialogstöd" (samma stil som Verktyg). */
export function BrandBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-background-content">
      <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-16 px-24 py-16 md:px-32">
        <BrandLockup />
        <UserBadge />
      </div>
    </header>
  );
}
