import assert from "node:assert/strict";
import test from "node:test";

import { NotificationType } from "@website-audit/database";

import { getNotificationPresentation } from "./presentation.js";

test("defines presentation metadata for every requested notification type", () => {
  for (const type of [
    NotificationType.AUDIT_COMPLETED,
    NotificationType.AUDIT_FAILED,
    NotificationType.SCORE_DROPPED,
    NotificationType.CRITICAL_ISSUE_FOUND,
    NotificationType.SCHEDULED_AUDIT_COMPLETED,
    NotificationType.SUBSCRIPTION_LIMIT_REACHED,
    NotificationType.TEAM_INVITATION,
    NotificationType.REPORT_READY,
  ]) {
    const presentation = getNotificationPresentation(type);
    assert.notEqual(presentation.label, "Notification");
    assert.equal(presentation.shortLabel.length, 2);
  }
});
