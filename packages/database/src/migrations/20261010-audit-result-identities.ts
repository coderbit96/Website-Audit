import {
  AUDIT_FINDING_IDENTITY_INDEX,
  AUDIT_FINDING_IDENTITY_KEYS,
  AUDIT_METRIC_IDENTITY_INDEX,
  AUDIT_METRIC_IDENTITY_KEYS,
} from "../integrity-indexes.js";

type IdentityIndex = {
  collection: string;
  name: string;
  keys: Readonly<Record<string, 1>>;
};

const identityIndexes: readonly IdentityIndex[] = [
  {
    collection: "audit_findings",
    name: AUDIT_FINDING_IDENTITY_INDEX,
    keys: AUDIT_FINDING_IDENTITY_KEYS,
  },
  {
    collection: "audit_metrics",
    name: AUDIT_METRIC_IDENTITY_INDEX,
    keys: AUDIT_METRIC_IDENTITY_KEYS,
  },
];

const mode = process.argv[2];
if (mode !== "--check" && mode !== "--apply") {
  console.error(
    "Pass --check for a read-only preflight or --apply to add indexes.",
  );
  process.exitCode = 1;
} else {
  // Index inspection must never trigger Mongoose's development auto-indexing.
  process.env.NODE_ENV = "production";
  const { connectToDatabase, disconnectFromDatabase } =
    await import("../connection.js");

  try {
    const mongo = await connectToDatabase();
    const database = mongo.connection.db;
    if (!database) throw new Error("MongoDB did not return a database handle.");

    const duplicateCollections: string[] = [];
    for (const definition of identityIndexes) {
      const collection = database.collection(definition.collection);
      const identity: Record<string, string> = {};
      for (const key of Object.keys(definition.keys)) {
        identity[key] = `$${key}`;
      }
      const duplicate = await collection
        .aggregate(
          [
            { $group: { _id: identity, count: { $sum: 1 } } },
            { $match: { count: { $gt: 1 } } },
            { $limit: 1 },
          ],
          { allowDiskUse: true },
        )
        .hasNext();
      if (duplicate) duplicateCollections.push(definition.collection);
      console.info(
        `[${duplicate ? "blocked" : "ok"}] ${definition.collection}: ${duplicate ? "duplicate identities exist" : "no duplicate identities"}.`,
      );
    }

    if (duplicateCollections.length > 0) {
      throw new Error(
        "Unique indexes were not applied. Review duplicate audit result records manually; this migration never removes them.",
      );
    }

    if (mode === "--apply") {
      for (const definition of identityIndexes) {
        await database
          .collection(definition.collection)
          .createIndex(definition.keys, {
            name: definition.name,
            unique: true,
          });
        console.info(`[ok] Added ${definition.name}.`);
      }
    } else {
      console.info(
        "[ok] Read-only preflight complete. No indexes were changed.",
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[error] Audit identity migration: ${message}`);
    process.exitCode = 1;
  } finally {
    await disconnectFromDatabase();
  }
}
