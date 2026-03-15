import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';

import authRoutes from './routes/auth';
import projectRoutes from './routes/projects';
import assignmentRoutes from './routes/assignments';
import layerRoutes from './routes/layers';
import featureRoutes from './routes/features';
import photoRoutes from './routes/photos';
import syncRoutes from './routes/sync';
import { errorHandler } from './middleware/errorHandler';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads directory exists
const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.resolve(uploadDir)));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/layers', layerRoutes);
app.use('/api/features', featureRoutes);
app.use('/api/photos', photoRoutes);
app.use('/api/sync', syncRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`GeoNex server running on port ${PORT}`);
});

export default app;
