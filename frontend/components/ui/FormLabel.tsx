import * as React from "react";

/** Fält-etikett (ersätter @sk-web-gui FormLabel). */
export function FormLabel({
  className = "",
  children,
  ...rest
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={["text-small font-semibold text-dark-primary", className].join(" ")}
      {...rest}
    >
      {children}
    </label>
  );
}
