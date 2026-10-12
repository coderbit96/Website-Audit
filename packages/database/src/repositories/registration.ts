import { type ClientSession } from "mongoose";

import { connectToDatabase } from "../connection.js";
import { UserModel, WorkspaceMemberModel, WorkspaceModel } from "../models.js";
import { WorkspaceRole } from "../enums.js";

export type PersonalAccountRecord = {
  name: string;
  email: string;
  passwordHash: string;
  workspaceName: string;
  workspaceSlug: string;
};

export type PersonalAccountRecordResult = {
  userId: string;
  workspaceId: string;
};

export async function userEmailExists(email: string): Promise<boolean> {
  await connectToDatabase();
  return (await UserModel.exists({ email })) !== null;
}

async function createRecords(
  account: PersonalAccountRecord,
  session: ClientSession,
): Promise<PersonalAccountRecordResult> {
  const [user] = await UserModel.create(
    [
      {
        name: account.name,
        email: account.email,
        passwordHash: account.passwordHash,
      },
    ],
    { session },
  );

  const [workspace] = await WorkspaceModel.create(
    [{ name: account.workspaceName, slug: account.workspaceSlug }],
    { session },
  );

  if (!user || !workspace) {
    throw new Error("MongoDB did not return the created account records.");
  }

  await WorkspaceMemberModel.create(
    [
      {
        userId: user._id,
        workspaceId: workspace._id,
        role: WorkspaceRole.OWNER,
      },
    ],
    { session },
  );

  return {
    userId: user._id.toString(),
    workspaceId: workspace._id.toString(),
  };
}

async function createRecordsWithCompensation(
  account: PersonalAccountRecord,
): Promise<PersonalAccountRecordResult> {
  let userId: string | undefined;
  let workspaceId: string | undefined;

  try {
    const user = await UserModel.create({
      name: account.name,
      email: account.email,
      passwordHash: account.passwordHash,
    });
    userId = user._id.toString();

    const workspace = await WorkspaceModel.create({
      name: account.workspaceName,
      slug: account.workspaceSlug,
    });
    workspaceId = workspace._id.toString();

    await WorkspaceMemberModel.create({
      userId: user._id,
      workspaceId: workspace._id,
      role: WorkspaceRole.OWNER,
    });

    return {
      userId: user._id.toString(),
      workspaceId: workspace._id.toString(),
    };
  } catch (error) {
    await Promise.allSettled([
      workspaceId
        ? WorkspaceMemberModel.deleteMany({ workspaceId })
        : Promise.resolve(),
      workspaceId
        ? WorkspaceModel.deleteOne({ _id: workspaceId })
        : Promise.resolve(),
      userId ? UserModel.deleteOne({ _id: userId }) : Promise.resolve(),
    ]);
    throw error;
  }
}

function transactionIsUnavailable(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("Transaction numbers are only allowed") ||
    error.message.includes("does not support retryable writes")
  );
}

export async function createPersonalAccountRecords(
  account: PersonalAccountRecord,
): Promise<PersonalAccountRecordResult> {
  const mongo = await connectToDatabase();
  const session = await mongo.connection.startSession();
  let result: PersonalAccountRecordResult | undefined;

  try {
    try {
      await session.withTransaction(async () => {
        result = await createRecords(account, session);
      });
    } catch (error) {
      if (!transactionIsUnavailable(error)) {
        throw error;
      }

      return await createRecordsWithCompensation(account);
    }

    if (!result) {
      throw new Error("Account transaction completed without a result.");
    }

    return result;
  } finally {
    await session.endSession();
  }
}
