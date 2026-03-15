import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function ProjectsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [projects, setProjects] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [drawnBoundary, setDrawnBoundary] = useState<any>(null);
  const modalMapRef = useRef<HTMLDivElement>(null);
  const modalMap = useRef<maplibregl.Map | null>(null);
  const drawPointsRef = useRef<[number, number][]>([]);

  useEffect(() => { loadProjects(); }, []);

  const loadProjects = async () => {
    try {
      const res = await api.get('/projects');
      setProjects(res.data.data || []);
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    if (modalMap.current) { modalMap.current.remove(); modalMap.current = null; }
    setForm({ name: '', description: '' });
    setDrawnBoundary(null);
    drawPointsRef.current = [];
  };

  const openModal = () => {
    setShowModal(true);
    setDrawnBoundary(null);
    drawPointsRef.current = [];
    setTimeout(initModalMap, 100);
  };

  const initModalMap = () => {
    if (!modalMapRef.current || modalMap.current) return;

    const map = new maplibregl.Map({
      container: modalMapRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      center: [78.9629, 20.5937],
      zoom: 5,
    });

    map.on('load', () => {
      map.addSource('draw-boundary', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'draw-boundary-fill',
        type: 'fill',
        source: 'draw-boundary',
        paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.2 },
      });
      map.addLayer({
        id: 'draw-boundary-line',
        type: 'line',
        source: 'draw-boundary',
        paint: { 'line-color': '#2563eb', 'line-width': 2 },
      });
      map.addLayer({
        id: 'draw-boundary-points',
        type: 'circle',
        source: 'draw-boundary',
        filter: ['==', '$type', 'Point'],
        paint: { 'circle-radius': 5, 'circle-color': '#2563eb', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' },
      });
    });

    map.getCanvas().style.cursor = 'crosshair';

    map.on('click', (e) => {
      drawPointsRef.current.push([e.lngLat.lng, e.lngLat.lat]);
      updateDrawPreview(map);
    });

    map.on('dblclick', (e) => {
      e.preventDefault();
      if (drawPointsRef.current.length >= 3) {
        const coords = [...drawPointsRef.current, drawPointsRef.current[0]];
        const polygon = { type: 'Polygon', coordinates: [coords] };
        setDrawnBoundary(polygon);
        (map.getSource('draw-boundary') as maplibregl.GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', geometry: polygon, properties: {} }],
        });
      }
    });

    modalMap.current = map;
  };

  const updateDrawPreview = (map: maplibregl.Map) => {
    const points = drawPointsRef.current;
    const features: any[] = points.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: p },
      properties: {},
    }));
    if (points.length >= 2) {
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: points },
        properties: {},
      });
    }
    (map.getSource('draw-boundary') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features,
    });
  };

  const clearDrawing = () => {
    drawPointsRef.current = [];
    setDrawnBoundary(null);
    if (modalMap.current?.getSource('draw-boundary')) {
      (modalMap.current.getSource('draw-boundary') as maplibregl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: [],
      });
    }
  };

  const createProject = async () => {
    try {
      await api.post('/projects', {
        ...form,
        boundary: drawnBoundary || undefined,
      });
      closeModal();
      loadProjects();
    } catch (error) {
      console.error('Failed to create project:', error);
    }
  };

  const deleteProject = async (id: string) => {
    if (!confirm('Delete this project and all its data?')) return;
    try {
      await api.delete(`/projects/${id}`);
      loadProjects();
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  return (
    <>
      <div className="page-header">
        <h2>Projects</h2>
        {isAdmin && (
          <button className="btn-primary" onClick={openModal}>
            + New Project
          </button>
        )}
      </div>
      <div className="page-body">
        <div className="card-grid">
          {projects.map((p) => (
            <div className="card" key={p.id}>
              <h3 style={{ marginBottom: 8 }}>{p.name}</h3>
              <p style={{ color: 'var(--gray-500)', fontSize: 14, marginBottom: 12 }}>
                {p.description || 'No description'}
              </p>
              <p style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 4 }}>
                Created: {new Date(p.created_at).toLocaleDateString()}
              </p>
              <p style={{ fontSize: 12, color: p.boundary ? 'var(--success)' : 'var(--gray-500)', marginBottom: 12 }}>
                {p.boundary ? 'Boundary defined' : 'No boundary set'}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <Link to={`/map/${p.id}`}>
                  <button className="btn-primary">Open Map</button>
                </Link>
                {isAdmin && (
                  <button className="btn-danger" onClick={() => deleteProject(p.id)}>
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
          {projects.length === 0 && (
            <p style={{ color: 'var(--gray-500)' }}>No projects yet. Create your first project to get started.</p>
          )}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 700 }}>
            <h3>Create New Project</h3>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div className="form-group">
                  <label>Project Name</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Enter project name"
                  />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Project description"
                    rows={3}
                  />
                </div>
                <p style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                  {drawnBoundary
                    ? 'Boundary drawn. Click "Redraw" to change.'
                    : 'Optional: Click on map to draw project boundary. Double-click to finish.'}
                </p>
                {drawnBoundary && (
                  <button className="btn-secondary" onClick={clearDrawing} style={{ fontSize: 12, padding: '4px 10px' }}>
                    Redraw Boundary
                  </button>
                )}
              </div>
              <div style={{ width: 350, height: 300 }}>
                <div ref={modalMapRef} style={{ width: '100%', height: '100%', borderRadius: 8 }} />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={closeModal}>Cancel</button>
              <button className="btn-primary" onClick={createProject} disabled={!form.name}>Create</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
