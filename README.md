# UI 
<img width="1920" height="870" alt="Screenshot (144)" src="https://github.com/user-attachments/assets/76d345de-4afa-4bcf-9439-56d1ec6e8b29" />
<img width="1591" height="727" alt="image" src="https://github.com/user-attachments/assets/67eee9d9-74c9-4615-9f23-44404b36f8af" />


# GeoNex — Mobile GIS Field Data Collection Platform

A full-stack GIS platform for field data collection with offline capability. Work is assigned via a Web GIS application, collected on mobile devices (online or offline), and synced back to a central PostgreSQL/PostGIS database.

---

### Web Application (Admin/Office)

| Feature | Description |
|---------|-------------|
| **Dashboard** | Overview of projects, assignments, pending/completed statistics |
| **Project Management** | Create projects with optional geographic boundaries (drawn on map) |
| **Layer Management** | Create layers with geometry type (Point/Line/Polygon) and custom attribute schemas (text, number, date, boolean, select) |
| **Work Assignments** | Draw assignment areas on map, assign to field users, set due dates; assignment areas are validated against project boundaries |
| **Interactive Map** | MapLibre GL JS map with feature drawing, editing, and deletion |
| **Cursor Coordinates** | Real-time latitude/longitude display as cursor moves over map |
| **Geometry Measurements** | Automatic display of: lat/lng for points, length for lines, area + perimeter for polygons |
| **Layer Filtering** | Filter displayed features by selected layer or show all layers |
| **Assignment-Specific View** | View only features within a specific assignment's boundary |
| **Feature Property Editing** | Schema-aware property editor with typed inputs (text, number, date, boolean toggle, dropdown select) |
| **Photo Management** | Upload photos (standard + 360), view in gallery, delete, 360 panorama viewer with Pannellum |
| **User Management** | Create and manage admin and field_user accounts |
| **Boundary Enforcement** | Server-side validation: assignments must be within project boundaries; field users can only create features within their assigned areas |

### Mobile Application (Field Users + Admin)

| Feature | Description |
|---------|-------------|
| **Role-Based Navigation** | Admin sees Dashboard, Assignments, Map, Projects, More (Users/Sync); Field users see Dashboard, Assignments, Map, Projects, Sync |
| **GPS Coordinate Display** | Real-time GPS position shown on map overlay |
| **Feature Drawing** | Tap to place points, tap vertices + long-press to finish lines/polygons |
| **Geometry Measurements** | Automatic display when selecting features: lat/lng for points, length for lines, area + perimeter for polygons |
| **Layer Filtering** | Filter map features by selected layer; "All Layers" option available |
| **Custom Schema Fields** | Admin can create layers with custom attribute schemas (text, number, date, boolean, select) directly from mobile |
| **Schema-Aware Property Editor** | Typed input controls: text fields, numeric keyboard, date input, boolean toggle switch, dropdown select |
| **Assignment-Specific View** | When viewing an assignment, map zooms to assignment area and filters features to only those within the boundary |
| **Boundary Enforcement** | Client-side validation prevents field users from adding features outside their assigned area; server also validates |
| **Photo Capture** | Standard photos and 360 panorama capture (8-direction compass guide) |
| **Photo Management** | View, count, and delete photos per feature |
| **Photo Viewer** | View captured photos with compass bearing navigation for 360 photos |
| **Offline Data Capture** | All features saved to local SQLite database; works without internet |
| **Automatic Sync** | Auto-syncs when device comes online; periodic sync every 5 minutes if pending changes exist; syncs on app foreground resume |
| **Manual Sync** | Full sync from Sync screen with detailed results (pushed/pulled/conflicts/photos) |
| **Conflict Resolution** | Server-wins strategy with conflict logging; conflicts are reported to user |
| **Assignment Management** | Admin can create new assignments (select project, user, due date) and edit existing ones from mobile |
| **Assignment Status** | Update assignment status (pending/in_progress/completed/cancelled) |
| **Project Management** | View all projects with "Open Map" button; admin can create/delete projects |
| **Server Feature Loading** | When online, fetches features from server and merges with local data |

### Sync & Offline

| Feature | Description |
|---------|-------------|
| **Offline-First** | All data collection works offline; features stored locally in SQLite |
| **Auto-Sync** | NetInfo listener detects connectivity changes; triggers sync when device comes online |
| **Periodic Sync** | Background check every 5 minutes; auto-uploads pending features and photos |
| **Foreground Sync** | Sync triggered when app returns to foreground |
| **Manual Sync** | One-tap full sync from the Sync screen |
| **Bidirectional** | Push local changes to server, pull server changes to device |
| **Photo Upload** | Pending photos automatically uploaded during sync |
| **Conflict Handling** | Server-wins resolution; conflicting features overwritten with server version |

---

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────────────┐
│  Web App     │     │  Mobile App │     │  PostgreSQL      │
│  (React +    │────▶│  (React     │     │  + PostGIS       │
│   MapLibre)  │     │   Native +  │     │                  │
│              │     │   Expo)     │     │  Spatial DB with │
└──────┬───────┘     └──────┬──────┘     │  GeoJSON support │
       │                    │            └────────▲─────────┘
       │                    │                     │
       └────────┬───────────┘                     │
                │                                 │
         ┌──────▼──────┐                          │
         │  Express    │──────────────────────────┘
         │  REST API   │
         │  (Node.js)  │
         └─────────────┘
```

- **Web App**: React + Vite + MapLibre GL JS — admin dashboard, project management, assignment creation, data review
- **Mobile App**: React Native + Expo + react-native-maps — field data collection, offline storage, photo capture
- **Server**: Express + TypeScript — REST API, JWT auth, PostGIS spatial queries, sync protocol
- **Database**: PostgreSQL 16 + PostGIS 3.4 — spatial data storage, geometry validation, sync versioning

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile App | React Native 0.81 + TypeScript + Expo 54 |
| Mobile Maps | react-native-maps 1.20 |
| Mobile Offline | expo-sqlite (SQLite) |
| Mobile Geo | @turf/turf (geometry measurements & spatial checks) |
| Mobile Network | @react-native-community/netinfo (auto-sync) |
| Web Frontend | React 19 + TypeScript + Vite |
| Web Maps | MapLibre GL JS |
| Web Geo | @turf/turf |
| Web 360 Viewer | Pannellum |
| Backend API | Node.js + Express + TypeScript |
| Database | PostgreSQL 16 + PostGIS 3.4 |
| Auth | JWT (7-day expiration) |
| File Storage | Local disk (multer, 50MB max per photo) |
| Container | Docker Compose (PostgreSQL) |

---

## Project Structure

```
geonex/
├── mobile/                       # React Native (Expo) mobile app
│   ├── src/
│   │   ├── screens/              # App screens
│   │   │   ├── LoginScreen.tsx       # Email/password login
│   │   │   ├── DashboardScreen.tsx   # Admin dashboard stats
│   │   │   ├── AssignmentsScreen.tsx # Assignment list + status mgmt
│   │   │   ├── MapScreen.tsx         # Map with drawing, measurements, filtering
│   │   │   ├── PhotoCaptureScreen.tsx# Standard + 360 photo capture
│   │   │   ├── PhotoViewerScreen.tsx # Photo gallery with compass nav
│   │   │   ├── ProjectsScreen.tsx    # Project CRUD (admin)
│   │   │   ├── UsersScreen.tsx       # User management (admin)
│   │   │   └── SyncScreen.tsx        # Sync status + manual sync
│   │   ├── database/
│   │   │   └── LocalDatabase.ts      # SQLite schema + CRUD operations
│   │   ├── services/
│   │   │   └── SyncService.ts        # Sync logic + auto-sync with NetInfo
│   │   ├── config/
│   │   │   └── api.ts                # API client (fetch wrapper)
│   │   └── App.tsx                   # Navigation + auth + auto-sync init
│   └── package.json
├── web/                          # React web app (Vite)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── MapPage.tsx           # Full GIS map with all features
│   │   │   ├── DashboardPage.tsx     # Dashboard with statistics
│   │   │   ├── AssignmentsPage.tsx   # Assignment management
│   │   │   ├── ProjectsPage.tsx      # Project management
│   │   │   ├── UsersPage.tsx         # User management
│   │   │   └── LoginPage.tsx         # Login page
│   │   ├── components/
│   │   │   ├── Layout.tsx            # Sidebar navigation
│   │   │   ├── PhotoPanel.tsx        # Photo upload + gallery
│   │   │   └── PanoramaViewer.tsx    # 360 photo viewer (Pannellum)
│   │   ├── services/
│   │   │   └── api.ts                # Axios API client
│   │   └── context/
│   │       └── AuthContext.tsx        # Auth context + token management
│   └── package.json
├── server/                       # Express API server
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.ts               # Login, register, user list
│   │   │   ├── projects.ts           # Project CRUD with boundaries
│   │   │   ├── layers.ts             # Layer CRUD with custom schemas
│   │   │   ├── features.ts           # Feature CRUD with spatial validation
│   │   │   ├── assignments.ts        # Assignment CRUD with boundary checks
│   │   │   ├── photos.ts             # Photo upload/delete with file mgmt
│   │   │   └── sync.ts               # Pull/push sync protocol
│   │   ├── config/
│   │   │   ├── database.ts           # PostgreSQL pool
│   │   │   └── migrate.ts            # Schema migrations
│   │   ├── middleware/
│   │   │   └── auth.ts               # JWT authentication middleware
│   │   └── index.ts                  # Express app setup
│   └── package.json
├── shared/                       # Shared TypeScript types
│   └── src/types/
│       ├── user.ts, project.ts, layer.ts, feature.ts
│       ├── assignment.ts, photo.ts, sync.ts, api.ts
│       └── index.ts
├── docker-compose.yml            # PostgreSQL + PostGIS container
└── README.md                     # This file
```

---

## Setup & Installation

### Prerequisites

- Node.js >= 20
- Docker & Docker Compose
- Expo CLI (`npm install -g expo-cli`)
- Android/iOS device or emulator (for mobile app)

### 1. Start the Database

```bash
docker-compose up -d
```

This starts PostgreSQL 16 + PostGIS 3.4 on port 5432.

### 2. Start the Server

```bash
cd server
npm install
npm run dev
```

The API server starts on `http://localhost:3000`. Database tables are auto-created on first run.


### 3. Start the Web App

```bash
cd web
npm install
npm run dev
```

The web app opens on `http://localhost:5175`.

### 4. Start the Mobile App

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with Expo Go on your device, or press `a` for Android emulator / `i` for iOS simulator.

**Important**: Update the API URL in `mobile/src/config/api.ts` to your machine's local IP address (e.g., `http://192.168.1.100:3000/api`).

---

## Usage & Workflows

### Use Case 1: Admin Sets Up a Survey Project

1. **Login** to the web app as admin 
2. **Create a Project**: Go to Projects > + New Project, draw a boundary on the map (optional)
3. **Create Layers**: Go to Map > Select Layer > + Create New Layer
   - Name the layer (e.g., "Roads", "Buildings", "Trees")
   - Choose geometry type (Point, Line, or Polygon)
   - Add custom fields (e.g., "Road Type" as select with options "Paved,Unpaved,Dirt"; "Width" as number; "Survey Date" as date)
4. **Create Assignments**: Go to Assignments > + New Assignment
   - Select the project
   - Draw the area to be surveyed on the map
   - Assign to a field user
   - Set a due date
5. The assignment area is validated to be within the project boundary (if defined)

### Use Case 2: Field User Collects Data on Mobile

1. **Login** on mobile app as field user 
2. **View Assignments**: The Assignments tab shows assigned work areas
3. **Open Assignment Map**: Tap an assignment to open the map
   - Map zooms to the assignment area (purple dashed boundary)
   - Only features within this area are displayed
4. **Select a Layer**: Tap the layer selector to choose which layer to add features to
5. **Collect Data**:
   - **Point**: Tap "Point" tool, tap on map to place marker
   - **Line**: Tap "Line" tool, tap vertices, long-press to finish
   - **Polygon**: Tap "Polygon" tool, tap vertices, long-press to close
   - Boundary enforcement prevents placing features outside the assignment area
6. **Fill Properties**: A property form appears with typed inputs based on the layer schema
   - Text fields, numeric keyboards, date pickers, boolean toggles, dropdown selects
7. **View Measurements**: Selecting a feature shows:
   - Points: latitude and longitude
   - Lines: length in meters/kilometers
   - Polygons: area (m²/ha/km²) and perimeter (m/km)
8. **Capture Photos**: Select a feature > tap "Photo" or "360" button
   - Standard: single photo capture
   - 360: guided 8-direction panorama capture with compass
9. **Work Offline**: All data is saved locally — no internet required for data collection

### Use Case 3: Sync Field Data

1. **Automatic Sync**: When the device connects to the internet:
   - Auto-sync triggers immediately when connectivity is restored
   - Periodic sync runs every 5 minutes if there are pending changes
   - Sync also triggers when the app comes back to the foreground
2. **Manual Sync**: Go to the Sync tab > tap "Sync Now"
   - Shows count of pending features and photos
   - Displays results: pushed, pulled, conflicts
3. **Conflict Resolution**: If the same feature was edited on both server and device, server version wins (with conflict logged)

### Use Case 4: Admin Reviews Collected Data

1. **Web Map View**: Go to Map in the web app
   - All synced features appear on the map
   - Filter by layer to focus on specific data types
2. **Assignment View**: Go to Assignments > click "Map" on a specific assignment
   - See only features collected within that assignment area
3. **Edit Features**: Click any feature on the map to edit properties, view measurements, or delete
4. **View Photos**: Select a feature > open the photo panel
   - View uploaded photos in a gallery
   - Open 360 photos in the panorama viewer
5. **Review Measurements**: Feature properties panel shows automatic geometry calculations

### Use Case 5: Managing Users

1. **Web**: Go to Users page to create new accounts (admin or field_user)
2. **Mobile (Admin)**: More > Users to view and create users
3. Field users only see their own assignments; admins see all

---

## API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login with email/password, returns JWT |
| POST | `/api/auth/register` | Register new user (admin only) |
| GET | `/api/auth/me` | Get current user profile |
| GET | `/api/auth/users` | List all users (admin only) |

### Projects
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects` | List all projects |
| GET | `/api/projects/:id` | Get project by ID |
| POST | `/api/projects` | Create project (admin only) |
| PUT | `/api/projects/:id` | Update project (admin only) |
| DELETE | `/api/projects/:id` | Delete project (admin only) |

### Layers
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/layers?project_id=xxx` | List layers (optional project filter) |
| GET | `/api/layers/:id` | Get layer by ID |
| POST | `/api/layers` | Create layer with schema (admin only) |
| PUT | `/api/layers/:id` | Update layer (admin only) |
| DELETE | `/api/layers/:id` | Delete layer (admin only) |

### Features
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/features?layer_id=xxx&bbox=...` | List features with optional filters |
| GET | `/api/features/:id` | Get feature by ID |
| POST | `/api/features` | Create feature (boundary enforced for field users) |
| PUT | `/api/features/:id` | Update feature geometry/properties |
| DELETE | `/api/features/:id` | Delete feature |
| GET | `/api/features/geojson/:layer_id` | Get GeoJSON FeatureCollection |

### Assignments
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/assignments` | List assignments (filtered by role) |
| GET | `/api/assignments/:id` | Get assignment by ID |
| POST | `/api/assignments` | Create assignment (validates within project boundary) |
| PUT | `/api/assignments/:id` | Update assignment |
| DELETE | `/api/assignments/:id` | Delete assignment (admin only) |

### Photos
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/photos?feature_id=xxx` | List photos for a feature |
| POST | `/api/photos/upload` | Upload photo (multipart, max 50MB) |
| DELETE | `/api/photos/:id` | Delete photo (removes file from disk) |

### Sync
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sync/pull?assignment_id=xxx&last_sync_version=N` | Pull features changed since version N |
| POST | `/api/sync/push` | Push local features (handles conflicts) |

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |

---

## Database Schema

### Tables

```sql
-- Users with role-based access
users (id UUID, username, email, password_hash, role ENUM('admin','field_user'), created_at)

-- Projects with optional geographic boundaries
projects (id UUID, name, description, boundary GEOMETRY(Polygon,4326), created_by, created_at)

-- Layers with custom attribute schemas
layers (id UUID, project_id FK, name, geometry_type, schema JSONB, created_at)

-- Geographic features with sync versioning
features (id UUID, layer_id FK, geometry GEOMETRY(Geometry,4326), properties JSONB,
          created_by, created_at, updated_at, sync_version INT)

-- Work assignments with area boundaries
work_assignments (id UUID, project_id FK, assigned_to FK, area GEOMETRY(Polygon,4326),
                  status, due_date, created_at)

-- Photos attached to features
photos (id UUID, feature_id FK, file_path, is_360 BOOL, metadata JSONB, captured_at)

-- Sync audit log
sync_log (id UUID, user_id FK, device_id, sync_type, status, features_count, synced_at)
```

### Layer Schema Format

The `schema` JSONB column on layers defines custom fields:

```json
[
  { "name": "Road Type", "type": "select", "options": ["Paved", "Unpaved", "Dirt"] },
  { "name": "Width (m)", "type": "number" },
  { "name": "Survey Date", "type": "date" },
  { "name": "Is Accessible", "type": "boolean" },
  { "name": "Notes", "type": "text" }
]
```

Supported types: `text`, `number`, `date`, `boolean`, `select`

---

## Offline & Sync

### How Offline Works

1. **Layers & Assignments** are cached to SQLite when the device is online
2. **Features** are created locally in SQLite with `sync_status = 'new'`
3. **Edited features** are marked `sync_status = 'modified'`
4. **Deleted features** are marked `sync_status = 'deleted'` (soft delete until synced)
5. **Photos** are stored locally and marked `uploaded = 0`

### Auto-Sync Triggers

| Trigger | Behavior |
|---------|----------|
| Device comes online | NetInfo detects connectivity change, triggers full sync |
| App returns to foreground | AppState listener triggers sync |
| Periodic (5 min) | Checks for pending changes, syncs if any exist |
| Manual | User taps "Sync Now" on Sync screen |

### Sync Protocol

**Push (device -> server):**
```
POST /api/sync/push
Body: { assignment_id, features: [...], device_id }
Response: { synced_count, conflicts: [...], new_version }
```

**Pull (server -> device):**
```
GET /api/sync/pull?assignment_id=xxx&last_sync_version=N
Response: { features: [...], current_version, has_more }
```

**Conflict Resolution**: Server-wins — if the same feature was modified on both server and device since the last sync, the server version is kept and the local version is overwritten. Conflicts are reported to the user.

### SQLite Tables (Mobile)

```sql
cached_assignments (id, project_id, project_name, area_geojson, status, due_date, created_at)
cached_layers (id, project_id, name, geometry_type, schema_json)
local_features (id, layer_id, geometry_geojson, properties_json, created_by,
                created_at, updated_at, sync_version, sync_status)
local_photos (id, feature_id, file_path, is_360, metadata_json, captured_at, uploaded)
sync_state (assignment_id, last_sync_version, last_synced_at)
```

---



