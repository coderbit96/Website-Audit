import Link from "next/link";

export function StartAuditButton({
  websiteId,
  disabled = false,
}: {
  websiteId: string;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <button
        className="website-audit-button"
        type="button"
        disabled
        title="Only active websites can be audited by workspace owners or admins"
      >
        Start audit
      </button>
    );
  }

  return (
    <Link
      className="website-audit-button"
      href={`/dashboard/audits/new?websiteId=${encodeURIComponent(websiteId)}`}
    >
      Start audit
    </Link>
  );
}
