import { getDb, type DbClient } from '../db/client.js';
import { crossTenantEvents } from '../db/schema.js';

export async function emitCrossTenantEvent(
  sourceTenantId: string,
  targetTenantId: string,
  eventType: string,
  payload: Record<string, unknown>,
  dbClient?: DbClient,
) {
  const db = dbClient ?? await getDb();
  await db.insert(crossTenantEvents).values({
    sourceTenantId,
    targetTenantId,
    eventType,
    payloadJson: JSON.stringify(payload),
  });
}
