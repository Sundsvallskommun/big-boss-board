import * as React from "react";

/** Lättvikts-textfält (ersätter @sk-web-gui Input). Forwardar alla props. */
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={[
          "block w-full rounded-12 border border-hairline bg-background-content px-12 py-10",
          "text-base text-dark-primary placeholder:text-dark-secondary",
          "transition focus:border-vattjom-surface-primary",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          "aria-[invalid=true]:border-error",
          className,
        ].join(" ")}
        {...rest}
      />
    );
  },
);
