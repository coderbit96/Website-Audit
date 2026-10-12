import { config as loadEnv } from "dotenv";
import mongoose, { type Mongoose } from "mongoose";
import { fileURLToPath } from "node:url";
import { parseDatabaseEnvironment } from "@website-audit/shared/environment/server";

if (!process.env.MONGODB_URI) {
  loadEnv({
    path: fileURLToPath(new URL("../../../.env", import.meta.url)),
    quiet: true,
  });
}

type MongoConnectionCache = {
  connection: Mongoose | null;
  promise: Promise<Mongoose> | null;
};

const globalWithMongo = globalThis as typeof globalThis & {
  websiteAuditMongo?: MongoConnectionCache;
};

const cache = globalWithMongo.websiteAuditMongo ?? {
  connection: null,
  promise: null,
};

if (process.env.NODE_ENV !== "production") {
  globalWithMongo.websiteAuditMongo = cache;
}

export async function connectToDatabase(): Promise<Mongoose> {
  if (cache.connection) {
    return cache.connection;
  }

  const environment = parseDatabaseEnvironment(process.env);

  cache.promise ??= mongoose.connect(environment.MONGODB_URI, {
    autoIndex: environment.NODE_ENV !== "production",
    maxPoolSize: 20,
    minPoolSize: 0,
    serverSelectionTimeoutMS: 5_000,
  });

  try {
    cache.connection = await cache.promise;
    return cache.connection;
  } catch (error) {
    cache.promise = null;
    throw error;
  }
}

export async function disconnectFromDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  cache.connection = null;
  cache.promise = null;
}

export function getDatabaseConnectionState(): number {
  return mongoose.connection.readyState;
}
