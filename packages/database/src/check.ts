import { connectToDatabase, disconnectFromDatabase } from "./connection.js";

try {
  const mongo = await connectToDatabase();
  const database = mongo.connection.db;

  if (!database) {
    throw new Error("MongoDB connected without selecting a database.");
  }

  await database.admin().ping();
  console.info(`[ok] MongoDB is reachable (${database.databaseName}).`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[error] MongoDB connection failed: ${message}`);
  process.exitCode = 1;
} finally {
  await disconnectFromDatabase();
}
