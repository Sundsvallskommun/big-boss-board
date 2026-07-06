import * as React from "react";

/** Lättvikts-knapp i kommunens visuella språk (ersätter @sk-web-gui Button).
 *  Stödjer de varianter appen använder: primary (fylld vattjom) och ghost. */
type ButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "color"> & {
  variant?: "primary" | "ghost";
  /** Kvar för API-paritet med tidigare anrop (endast "vattjom" används). */
  color?: string;
  loading?: boolean;
  leftIcon?: React.ReactNode;
};

const VARIANT: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-vattjom-surface-primary text-white hover:bg-vattjom-surface-primary-hover",
  ghost: "bg-transparent text-vattjom-text-primary hover:bg-vattjom-background-100",
};

export function Button({
  variant = "primary",
  color: _color,
  loading = false,
  leftIcon,
  disabled,
  className = "",
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[
        "inline-flex items-center justify-center gap-8 rounded-12 px-16 py-10",
        "text-base font-semibold leading-none transition",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "disabled:cursor-not-allowed disabled:opacity-60",
        VARIANT[variant],
        className,
      ].join(" ")}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="h-16 w-16 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
      ) : (
        leftIcon
      )}
      {children}
    </button>
  );
}
