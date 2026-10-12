import "dotenv/config";

import argon2 from "argon2";
import {
  connectToDatabase,
  UserModel,
  UserRole,
  WorkspaceMemberModel,
  WorkspaceModel,
  WorkspaceRole,
} from "@website-audit/database";
import { randomUUID } from "node:crypto";
import { parseSuperAdminBootstrapEnvironment } from "@website-audit/shared/environment/server";

const environment = parseSuperAdminBootstrapEnvironment({
  ...process.env,
  SUPER_ADMIN_EMAIL: process.env.SUPER_ADMIN_EMAIL ?? "admin@coderbit.in",
});
const email = environment.SUPER_ADMIN_EMAIL;
const password = environment.SUPER_ADMIN_INITIAL_PASSWORD;

function slugFromEmail(): string {
  return `system-admin-${randomUUID().replaceAll("-", "").slice(0, 10)}`;
}

async function bootstrap(): Promise<void> {
  await connectToDatabase();

  let user = await UserModel.findOne({ email }).select("+passwordHash").exec();
  if (!user) {
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65_536,
      timeCost: 3,
      parallelism: 1,
    });
    user = await UserModel.create({
      name: "System Administrator",
      email,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
    });
  } else if (user.role !== UserRole.SUPER_ADMIN) {
    user.role = UserRole.SUPER_ADMIN;
    await user.save();
  }

  const membership = await WorkspaceMemberModel.findOne({ userId: user._id })
    .sort({ createdAt: 1 })
    .exec();
  if (!membership) {
    const workspace = await WorkspaceModel.create({
      name: "System Administration",
      slug: slugFromEmail(),
    });
    await WorkspaceMemberModel.create({
      workspaceId: workspace._id,
      userId: user._id,
      role: WorkspaceRole.OWNER,
    });
  }

  console.log(`Super Admin is ready for ${email}.`);
}

bootstrap().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Super Admin bootstrap failed.",
  );
  process.exitCode = 1;
});
