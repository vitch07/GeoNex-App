import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;

  db = await SQLite.openDatabaseAsync('geonex.db');

  await initializeSchema(db);
  return db;
}

async function initializeSchema(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS cached_assignments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      project_name TEXT,
      area_geojson TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      due_date TEXT,
      created_at TEXT
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS cached_layers (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      geometry_type TEXT NOT NULL,
      schema_json TEXT NOT NULL DEFAULT '[]'
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS local_features (
      id TEXT PRIMARY KEY,
      layer_id TEXT NOT NULL,
      geometry_geojson TEXT NOT NULL,
      properties_json TEXT NOT NULL DEFAULT '{}',
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      sync_version INTEGER DEFAULT 0,
      sync_status TEXT DEFAULT 'new' CHECK (sync_status IN ('synced', 'new', 'modified', 'deleted'))
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS local_photos (
      id TEXT PRIMARY KEY,
      feature_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      is_360 INTEGER DEFAULT 0,
      metadata_json TEXT DEFAULT '{}',
      captured_at TEXT DEFAULT (datetime('now')),
      uploaded INTEGER DEFAULT 0
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS sync_state (
      assignment_id TEXT PRIMARY KEY,
      last_sync_version INTEGER DEFAULT 0,
      last_synced_at TEXT
    );
  `);
}

// Feature CRUD operations
export async function saveFeatureLocally(feature: {
  id: string;
  layer_id: string;
  geometry: any;
  properties: Record<string, unknown>;
  created_by: string;
  sync_status: string;
}): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT OR REPLACE INTO local_features (id, layer_id, geometry_geojson, properties_json, created_by, sync_status, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    feature.id,
    feature.layer_id,
    JSON.stringify(feature.geometry),
    JSON.stringify(feature.properties),
    feature.created_by,
    feature.sync_status
  );
}

export async function getLocalFeatures(layerId?: string): Promise<any[]> {
  const database = await getDatabase();
  let rows: any[];
  if (layerId) {
    rows = await database.getAllAsync(
      'SELECT * FROM local_features WHERE layer_id = ? AND sync_status != ?',
      layerId, 'deleted'
    );
  } else {
    rows = await database.getAllAsync(
      'SELECT * FROM local_features WHERE sync_status != ?',
      'deleted'
    );
  }

  return rows.map((row: any) => ({
    id: row.id,
    layer_id: row.layer_id,
    geometry: JSON.parse(row.geometry_geojson),
    properties: JSON.parse(row.properties_json),
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    sync_version: row.sync_version,
    sync_status: row.sync_status,
  }));
}

export async function getUnsyncedFeatures(): Promise<any[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync(
    "SELECT * FROM local_features WHERE sync_status IN ('new', 'modified', 'deleted')"
  );

  return (rows as any[]).map((row: any) => ({
    id: row.id,
    layer_id: row.layer_id,
    geometry: JSON.parse(row.geometry_geojson),
    properties: JSON.parse(row.properties_json),
    sync_version: row.sync_version,
    sync_status: row.sync_status,
  }));
}

export async function markFeaturesSynced(featureIds: string[]): Promise<void> {
  const database = await getDatabase();
  for (const id of featureIds) {
    await database.runAsync(
      "UPDATE local_features SET sync_status = 'synced' WHERE id = ?",
      id
    );
  }
}

export async function deleteLocalFeature(id: string): Promise<void> {
  const database = await getDatabase();
  const row = await database.getFirstAsync(
    "SELECT sync_status FROM local_features WHERE id = ?",
    id
  ) as any;
  if (row && row.sync_status === 'new') {
    await database.runAsync("DELETE FROM local_features WHERE id = ?", id);
  } else {
    await database.runAsync(
      "UPDATE local_features SET sync_status = 'deleted', updated_at = datetime('now') WHERE id = ?",
      id
    );
  }
}

// Photo operations
export async function savePhotoLocally(photo: {
  id: string;
  feature_id: string;
  file_path: string;
  is_360: boolean;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT OR REPLACE INTO local_photos (id, feature_id, file_path, is_360, metadata_json)
     VALUES (?, ?, ?, ?, ?)`,
    photo.id, photo.feature_id, photo.file_path, photo.is_360 ? 1 : 0, JSON.stringify(photo.metadata)
  );
}

export async function getLocalPhotos(featureId: string): Promise<any[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync(
    'SELECT * FROM local_photos WHERE feature_id = ? ORDER BY captured_at DESC',
    featureId
  );
  return (rows as any[]).map((row: any) => ({
    id: row.id,
    feature_id: row.feature_id,
    file_path: row.file_path,
    uri: row.file_path,
    is_360: row.is_360 === 1,
    metadata: JSON.parse(row.metadata_json || '{}'),
    captured_at: row.captured_at,
    uploaded: row.uploaded === 1,
    bearing: JSON.parse(row.metadata_json || '{}').bearing,
  }));
}

// Delete a local photo
export async function deleteLocalPhoto(id: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM local_photos WHERE id = ?', id);
}

// Assignment cache
export async function cacheAssignments(assignments: any[]): Promise<void> {
  const database = await getDatabase();
  // Use INSERT OR REPLACE to avoid UNIQUE constraint errors from concurrent calls
  for (const a of assignments) {
    await database.runAsync(
      'INSERT OR REPLACE INTO cached_assignments (id, project_id, project_name, area_geojson, status, due_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      a.id, a.project_id, a.project_name, JSON.stringify(a.area), a.status, a.due_date, a.created_at
    );
  }
  // Remove assignments that no longer exist on server
  if (assignments.length > 0) {
    const ids = assignments.map((a) => a.id);
    const placeholders = ids.map(() => '?').join(',');
    await database.runAsync(
      `DELETE FROM cached_assignments WHERE id NOT IN (${placeholders})`,
      ...ids
    );
  }
}

export async function getCachedAssignments(): Promise<any[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync('SELECT * FROM cached_assignments');
  return (rows as any[]).map((row: any) => ({
    ...row,
    area: JSON.parse(row.area_geojson),
  }));
}

// Layer cache
export async function cacheLayers(layers: any[]): Promise<void> {
  const database = await getDatabase();
  for (const l of layers) {
    await database.runAsync(
      'INSERT OR REPLACE INTO cached_layers (id, project_id, name, geometry_type, schema_json) VALUES (?, ?, ?, ?, ?)',
      l.id, l.project_id, l.name, l.geometry_type, JSON.stringify(l.schema)
    );
  }
  if (layers.length > 0) {
    const ids = layers.map((l) => l.id);
    const placeholders = ids.map(() => '?').join(',');
    await database.runAsync(
      `DELETE FROM cached_layers WHERE id NOT IN (${placeholders})`,
      ...ids
    );
  }
}

export async function getCachedLayers(): Promise<any[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync('SELECT * FROM cached_layers');
  return (rows as any[]).map((row: any) => ({
    ...row,
    schema: JSON.parse(row.schema_json),
  }));
}

// Sync state
export async function getSyncVersion(assignmentId: string): Promise<number> {
  const database = await getDatabase();
  const row = await database.getFirstAsync(
    'SELECT last_sync_version FROM sync_state WHERE assignment_id = ?',
    assignmentId
  ) as any;
  return row ? row.last_sync_version : 0;
}

export async function updateSyncVersion(assignmentId: string, version: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT OR REPLACE INTO sync_state (assignment_id, last_sync_version, last_synced_at)
     VALUES (?, ?, datetime('now'))`,
    assignmentId, version
  );
}
