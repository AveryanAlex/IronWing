import { ExternalLink } from "lucide-react";

export type DocsLinkProps = {
  /** URL to the ArduPilot docs page. Renders nothing if null/undefined. */
  docsUrl: string | null | undefined;
  /** Link text. Defaults to "ArduPilot Docs". */
  docsLabel?: string;
  /** Visual variant: "inline" for description-level, "header" for card-header trailing. */
  variant?: "inline" | "header";
  className?: string;
};

/**
 * Lightweight external docs link with ExternalLink icon.
 * Renders nothing when `docsUrl` is nullish — safe to use unconditionally.
 */
export function DocsLink({
  docsUrl,
  docsLabel = "ArduPilot Docs",
  variant = "header",
  className,
}: DocsLinkProps) {
  if (!docsUrl) return null;

  const base =
    variant === "inline"
      ? "inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
      : "inline-flex items-center gap-1 text-[10px] text-text-muted hover:text-text-secondary transition-colors";

  return (
    <a
      href={docsUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`${base}${className ? ` ${className}` : ""}`}
    >
      {docsLabel}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}
