import pool from './database';

const migrations = `
  -- Enable PostGIS extension
  CREATE EXTENSION IF NOT EXISTS postgis;
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

  -- Users table
  CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'field_user' CHECK (role IN ('admin', 'field_user')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- Projects table
  CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    boundary GEOMETRY(Geometry, 4326),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- Work assignments table
  CREATE TABLE IF NOT EXISTS work_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    assigned_to UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    area GEOMETRY(Geometry, 4326) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    due_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- Layers table
  CREATE TABLE IF NOT EXISTS layers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    geometry_type VARCHAR(20) NOT NULL CHECK (geometry_type IN ('Point', 'LineString', 'Polygon')),
    schema JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- Features table
  CREATE TABLE IF NOT EXISTS features (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    layer_id UUID NOT NULL REFERENCES layers(id) ON DELETE CASCADE,
    geometry GEOMETRY(Geometry, 4326) NOT NULL,
    properties JSONB NOT NULL DEFAULT '{}',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sync_version INTEGER NOT NULL DEFAULT 1
  );

  -- Photos table
  CREATE TABLE IF NOT EXISTS photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    feature_id UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,
    file_path VARCHAR(500) NOT NULL,
    is_360 BOOLEAN NOT NULL DEFAULT false,
    metadata JSONB DEFAULT '{}',
    captured_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- Sync log table
  CREATE TABLE IF NOT EXISTS sync_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(255) NOT NULL,
    sync_type VARCHAR(10) NOT NULL CHECK (sync_type IN ('pull', 'push')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
    features_count INTEGER NOT NULL DEFAULT 0,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- Indexes for performance
  CREATE INDEX IF NOT EXISTS idx_features_layer_id ON features(layer_id);
  CREATE INDEX IF NOT EXISTS idx_features_sync_version ON features(sync_version);
  CREATE INDEX IF NOT EXISTS idx_features_geometry ON features USING GIST(geometry);
  CREATE INDEX IF NOT EXISTS idx_work_assignments_assigned_to ON work_assignments(assigned_to);
  CREATE INDEX IF NOT EXISTS idx_work_assignments_project_id ON work_assignments(project_id);
  CREATE INDEX IF NOT EXISTS idx_projects_boundary ON projects USING GIST(boundary);
  CREATE INDEX IF NOT EXISTS idx_work_assignments_area ON work_assignments USING GIST(area);
`;

async function runMigrations() {
  try {
    console.log('Running migrations...');
    await pool.query(migrations);
    console.log('Migrations completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
