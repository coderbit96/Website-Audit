"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { IssueWorkflowAction } from "../../lib/issues/validation";

type WorkflowStatus = "OPEN" | "IGNORED" | "FIXED" | "REOPENED";

const actionLabels: Record<IssueWorkflowAction, string> = {
  ignore: "Ignore",
  mark_fixed: "Mark fixed",
  reopen: "Reopen",
};

export function IssueActions({
  findingId,
  status,
  canManage,
}: {
  findingId: string;
  status: WorkflowStatus;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<IssueWorkflowAction | null>(null);
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  async function updateStatus(action: IssueWorkflowAction) {
    setPending(action);
    setNotice(null);
    try {
      const response = await fetch(`/api/issues/${findingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(
          payload?.error ?? "Unable to update the issue workflow.",
        );
      }
      setNotice({
        type: "success",
        message:
          "Workflow status updated. This does not claim that the live website changed.",
      });
      router.refresh();
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to update the issue workflow.",
      });
    } finally {
      setPending(null);
    }
  }

  if (!canManage) {
    return (
      <p className="issue-workflow-note">
        You have read-only access. Workspace owners and admins can update issue
        workflow status.
      </p>
    );
  }

  const actions: IssueWorkflowAction[] = [];
  if (status !== "IGNORED") actions.push("ignore");
  if (status !== "FIXED") actions.push("mark_fixed");
  if (status === "IGNORED" || status === "FIXED") actions.push("reopen");

  return (
    <div className="issue-workflow-actions">
      <div>
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            data-action={action}
            disabled={pending !== null}
            onClick={() => void updateStatus(action)}
          >
            {pending === action ? "Updating…" : actionLabels[action]}
          </button>
        ))}
      </div>
      <p>
        These controls only update your team’s workflow status. They do not
        verify or modify the website.
      </p>
      {notice ? (
        <div
          className="issue-action-notice"
          data-type={notice.type}
          role={notice.type === "error" ? "alert" : "status"}
        >
          {notice.message}
        </div>
      ) : null}
    </div>
  );
}
