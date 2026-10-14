import "server-only";

import {
  connectToDatabase,
  RateLimitError,
  UserModel,
  WorkspaceMemberModel,
} from "@website-audit/database";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { loginSchema } from "./validation";
import { hashPassword, verifyPassword } from "./password";
import {
  anonymousRateLimitSubjectsFromHeaders,
  enforceRateLimit,
} from "../rate-limit/service";
import { webLogger } from "../logging/logger";
import { getWebServerEnvironment } from "../environment/server";

const dummyPasswordHash = hashPassword(
  "This-password-is-only-for-timing-equalization-7",
);

const authOptionsBase = {
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCredentials, request) {
        const parsed = loginSchema.safeParse(rawCredentials);

        if (!parsed.success) {
          webLogger("warn", "security.login_rejected", {
            reason: "invalid_credentials_shape",
          });
          return null;
        }

        try {
          await enforceRateLimit(
            "LOGIN",
            anonymousRateLimitSubjectsFromHeaders(
              request.headers ?? {},
              parsed.data.email,
            ),
          );
        } catch (error) {
          if (error instanceof RateLimitError) return null;
          throw error;
        }

        await connectToDatabase();
        const user = await UserModel.findOne({ email: parsed.data.email })
          .select("+passwordHash")
          .lean()
          .exec();
        const passwordHash = user?.passwordHash ?? (await dummyPasswordHash);
        const passwordMatches = await verifyPassword(
          passwordHash,
          parsed.data.password,
        );

        if (!user || !user.passwordHash || !passwordMatches) {
          webLogger("warn", "security.login_rejected", {
            reason: "invalid_credentials",
          });
          return null;
        }

        const membershipExists =
          (await WorkspaceMemberModel.exists({ userId: user._id })) !== null;

        if (!membershipExists) {
          webLogger("warn", "security.login_rejected", {
            reason: "workspace_membership_missing",
            userId: user._id.toString(),
          });
          return null;
        }

        return {
          id: user._id.toString(),
          email: user.email,
          name: user.name ?? undefined,
          image: user.image ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }

      return session;
    },
  },
  events: {
    signIn({ user }) {
      webLogger("info", "auth.login_completed", { userId: user.id });
    },
    signOut({ token }) {
      webLogger("info", "auth.logout_completed", {
        userId: token?.sub,
      });
    },
  },
} satisfies Omit<NextAuthOptions, "secret">;

/** Validate server credentials only when an authentication request is handled. */
export function getAuthOptions(): NextAuthOptions {
  const environment = getWebServerEnvironment();

  // Auth.js v4 still reads NEXTAUTH_URL. Keep AUTH_URL as the public project
  // setting while providing the compatibility name expected by this version.
  if (!process.env.NEXTAUTH_URL && environment.AUTH_URL) {
    process.env.NEXTAUTH_URL = environment.AUTH_URL;
  }

  return { ...authOptionsBase, secret: environment.AUTH_SECRET };
}
