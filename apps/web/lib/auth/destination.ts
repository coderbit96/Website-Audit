const publicAuditTokenPattern = /^[A-Za-z0-9_-]{43}$/;

/** Only a server-issued public audit token may influence the post-login path. */
export function authenticatedDestination(auditToken?: string): string {
  return auditToken && publicAuditTokenPattern.test(auditToken)
    ? `/audit/${auditToken}`
    : "/account";
}
