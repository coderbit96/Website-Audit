import type { SVGProps } from "react";

/** The shared SiteSignal mark: a rising, evidence-driven signal line. */
export function SiteLogoMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 32 32"
      {...props}
    >
      <path
        d="M5.5 6.5v19M5.5 25.5h21"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.5"
      />
      <path
        d="m8.5 21 5.25-5.25 4 3.25 7.75-8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
      <circle cx="25.75" cy="11" fill="currentColor" r="2.75" />
    </svg>
  );
}
