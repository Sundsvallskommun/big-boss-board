import * as React from "react";

/** Fält-grupp: etikett + kontroll med liten vertikal lucka (ersätter @sk-web-gui FormControl). */
export function FormControl({
  className = "",
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={["flex flex-col gap-6", className].join(" ")} {...rest}>
      {children}
    </div>
  );
}
