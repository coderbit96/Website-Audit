import { connectToDatabase, disconnectFromDatabase } from "./connection.js";
import { databaseModels } from "./models.js";

try {
  await connectToDatabase();

  for (const databaseModel of databaseModels) {
    await databaseModel.createIndexes();
    console.info(`[ok] Ensured indexes for ${databaseModel.collection.name}.`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[error] MongoDB index creation failed: ${message}`);
  process.exitCode = 1;
} finally {
  await disconnectFromDatabase();
}
