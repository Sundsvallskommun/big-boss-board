import * as React from "react";

/** Lättvikts-textarea (ersätter @sk-web-gui Textarea). Forwardar alla props. */
export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className = "", ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={[
        "block w-full rounded-12 border border-hairline bg-background-content px-12 py-10",
        "text-base text-dark-primary placeholder:text-dark-secondary",
        "transition focus:border-vattjom-surface-primary",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      ].join(" ")}
      {...rest}
    />
  );
});
