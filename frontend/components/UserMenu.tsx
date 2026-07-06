"use client";

import { useEffect, useId, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { Avatar } from "@/components/ui";

/** Avatar-knapp i headern med meny: vem som är inloggad + "Logga ut".
 *  Samma mönster som shadcn Avatar/DropdownMenu men i appens eget token-lager.
 *  Stänger vid klick utanför och Escape; menyn öppnas med fokus på "Logga ut". */
export function UserMenu({
  user,
}: {
  user: { name: string; email: string; role: "admin" | "user" };
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const logoutRef = useRef<HTMLAnchorElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    logoutRef.current?.focus();
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        aria-label={`Inloggad som ${user.name}. Öppna användarmenyn`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={`grid place-items-center rounded-full transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
          open ? "ring-2 ring-vattjom-surface-primary ring-offset-2" : "hover:opacity-80"
        }`}
      >
        <Avatar name={user.name} />
      </button>

      {open && (
        <div
          id={id}
          role="menu"
          aria-label="Användarmeny"
          className="absolute right-0 top-full z-30 mt-8 w-[260px] rounded-12 border border-hairline bg-background-content py-8 shadow-lg"
        >
          <div className="flex items-center gap-12 px-16 py-8">
            <Avatar name={user.name} />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold leading-tight text-dark-primary">
                {user.name}
              </p>
              <p className="truncate text-small leading-tight text-dark-secondary">
                {user.email}
              </p>
            </div>
          </div>
          {user.role === "admin" && (
            <p className="px-16 pb-8">
              <span className="eyebrow-sm rounded-full bg-vattjom-background-100 px-8 py-2 text-vattjom-text-primary">
                Admin
              </span>
            </p>
          )}
          <div role="separator" className="my-4 border-t border-hairline" />
          <a
            ref={logoutRef}
            role="menuitem"
            href="/api/auth/saml/logout"
            className="flex items-center gap-8 px-16 py-8 text-base text-dark-primary transition hover:bg-background-200 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          >
            <LogOut size={16} aria-hidden="true" />
            Logga ut
          </a>
        </div>
      )}
    </div>
  );
}
