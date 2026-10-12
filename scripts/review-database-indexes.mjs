/** Read-only comparison of Mongoose-declared and installed MongoDB indexes. */
process.env.NODE_ENV = "production";

const { connectToDatabase, disconnectFromDatabase, databaseModels } =
  await import("@website-audit/database");

function sameKeys(left, right) {
  return (
    JSON.stringify(Object.entries(left)) ===
    JSON.stringify(Object.entries(right))
  );
}

try {
  const mongo = await connectToDatabase();
  const database = mongo.connection.db;
  if (!database) throw new Error("MongoDB did not return a database handle.");
  const collectionNames = new Set(
    (await database.listCollections({}, { nameOnly: true }).toArray()).map(
      (collection) => collection.name,
    ),
  );
  let missing = 0;
  let absentCollections = 0;

  for (const model of databaseModels) {
    const collectionName = model.collection.name;
    if (!collectionNames.has(collectionName)) {
      absentCollections += 1;
      console.info(
        `[pending] ${collectionName}: collection does not exist yet.`,
      );
      continue;
    }
    const installed = await database
      .collection(collectionName)
      .listIndexes()
      .toArray();
    for (const [keys, options] of model.schema.indexes()) {
      const matching = installed.some(
        (index) =>
          sameKeys(index.key, keys) &&
          Boolean(index.unique) === Boolean(options.unique) &&
          (index.expireAfterSeconds ?? null) ===
            (options.expireAfterSeconds ?? null),
      );
      if (!matching) {
        missing += 1;
        console.info(
          `[missing] ${collectionName}: ${options.name ?? Object.keys(keys).join(", ")}${options.unique ? " (unique)" : ""}.`,
        );
      }
    }
  }
  console.info(
    `[summary] ${missing} declared index(es) missing; ${absentCollections} unused collection(s) absent. No changes made.`,
  );
  if (missing > 0) process.exitCode = 1;
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[error] Database index review failed: ${message}`);
  process.exitCode = 1;
} finally {
  await disconnectFromDatabase();
}
