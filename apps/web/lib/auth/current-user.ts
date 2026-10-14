import "server-only";

import {
  connectToDatabase,
  type UserRole,
  UserModel,
  WorkspaceMemberModel,
  WorkspaceModel,
} from "@website-audit/database";
import { getServerSession } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { getAuthOptions } from "./auth-options";

export type CurrentAccount = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  workspace: {
    id: string;
    name: string;
    role: string;
  };
};

export const getCurrentAccount = cache(
  async (): Promise<CurrentAccount | null> => {
    // Session lookup requires an incoming request. Opt protected pages out of
    // prerendering before validating runtime-only authentication secrets.
    await headers();
    const session = await getServerSession(getAuthOptions());

    if (!session?.user?.id) {
      return null;
    }

    await connectToDatabase();
    const [user, membership] = await Promise.all([
      UserModel.findById(session.user.id).lean().exec(),
      WorkspaceMemberModel.findOne({ userId: session.user.id })
        .sort({ createdAt: 1 })
        .lean()
        .exec(),
    ]);

    if (!user || !membership) {
      return null;
    }

    const workspace = await WorkspaceModel.findById(membership.workspaceId)
      .lean()
      .exec();

    if (!workspace) {
      return null;
    }

    return {
      id: user._id.toString(),
      name: user.name ?? "SiteSignal user",
      email: user.email,
      role: user.role,
      workspace: {
        id: workspace._id.toString(),
        name: workspace.name,
        role: membership.role,
      },
    };
  },
);

export async function requireCurrentAccount(): Promise<CurrentAccount> {
  const account = await getCurrentAccount();

  if (!account) {
    redirect("/login");
  }

  return account;
}
