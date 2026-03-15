import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

type ModalMode = 'create' | 'edit';

export default function AssignmentsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  const [assignments, setAssignments] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [editingId, setEditingId] = useState<string>('');
  const [form, setForm] = useState({ project_id: '', assigned_to: '', due_date: '' });
  const [drawnArea, setDrawnArea] = useState<any>(null);
  const modalMapRef = useRef<HTMLDivElement>(null);
  const modalMap = useRef<maplibregl.Map | null>(null);
  const drawPointsRef = useRef<[number, number][]>([]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [aRes, pRes, uRes] = await Promise.all([
        api.get('/assignments'),
        api.get('/projects'),
        api.get('/auth/users').catch(() => ({ data: { data: [] } })),
      ]);
      setAssignments(aRes.data.data || []);
      setProjects(pRes.data.data || []);
      setUsers(uRes.data.data || []);
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    if (modalMap.current) { modalMap.current.remove(); modalMap.current = null; }
    setForm({ project_id: '', assigned_to: '', due_date: '' });
    setDrawnArea(null);
    setEditingId('');
  };

  const openCreateModal = () => {
    setModalMode('create');
    setForm({ project_id: '', assigned_to: '', due_date: '' });
    setDrawnArea(null);
    drawPointsRef.current = [];
    setShowModal(true);
    setTimeout(() => initModalMap(), 100);
  };

  const openEditModal = (assignment: any) => {
    setModalMode('edit');
    setEditingId(assignment.id);
    setForm({
      project_id: assignment.project_id,
      assigned_to: assignment.assigned_to,
      due_date: assignment.due_date ? assignment.due_date.split('T')[0] : '',
    });
    setDrawnArea(assignment.area);
    drawPointsRef.current = [];
    setShowModal(true);
    setTimeout(() => initModalMap(assignment.area, assignment.project_id), 100);
  };

  const initModalMap = (existingArea?: any, projectIdForBoundary?: string) => {
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
      // Project boundary layer
      map.addSource('project-boundary', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'project-boundary-fill',
        type: 'fill',
        source: 'project-boundary',
        paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.08 },
      });
      map.addLayer({
        id: 'project-boundary-outline',
        type: 'line',
        source: 'project-boundary',
        paint: { 'line-color': '#2563eb', 'line-width': 2, 'line-dasharray': [6, 3] },
      });

      // Show project boundary if available
      const pid = projectIdForBoundary || form.project_id;
      if (pid) {
        const proj = projects.find((p) => p.id === pid);
        if (proj?.boundary) {
          (map.getSource('project-boundary') as maplibregl.GeoJSONSource).setData({
            type: 'FeatureCollection',
            features: [{ type: 'Feature', geometry: proj.boundary, properties: {} }],
          });
          if (!existingArea) {
            const coords = proj.boundary.coordinates?.[0];
            if (coords?.length > 0) {
              const bounds = coords.reduce(
                (b: maplibregl.LngLatBounds, c: number[]) => b.extend(c as [number, number]),
                new maplibregl.LngLatBounds(coords[0] as [number, number], coords[0] as [number, number])
              );
              map.fitBounds(bounds, { padding: 40 });
            }
          }
        }
      }

      map.addSource('draw-area', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'draw-area-fill',
        type: 'fill',
        source: 'draw-area',
        paint: { 'fill-color': '#8b5cf6', 'fill-opacity': 0.3 },
      });
      map.addLayer({
        id: 'draw-area-line',
        type: 'line',
        source: 'draw-area',
        paint: { 'line-color': '#8b5cf6', 'line-width': 2 },
      });
      map.addLayer({
        id: 'draw-area-points',
        type: 'circle',
        source: 'draw-area',
        filter: ['==', '$type', 'Point'],
        paint: { 'circle-radius': 5, 'circle-color': '#8b5cf6', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' },
      });

      // Show existing area if editing
      if (existingArea?.coordinates) {
        (map.getSource('draw-area') as maplibregl.GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', geometry: existingArea, properties: {} }],
        });
        const coords = existingArea.coordinates[0];
        if (coords?.length > 0) {
          const bounds = coords.reduce(
            (b: maplibregl.LngLatBounds, c: number[]) => b.extend(c as [number, number]),
            new maplibregl.LngLatBounds(coords[0] as [number, number], coords[0] as [number, number])
          );
          map.fitBounds(bounds, { padding: 40 });
        }
      }
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
        setDrawnArea(polygon);
        (map.getSource('draw-area') as maplibregl.GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', geometry: polygon, properties: {} }],
        });
      }
    });

    modalMap.current = map;
  };

  const clearDrawing = () => {
    drawPointsRef.current = [];
    setDrawnArea(null);
    if (modalMap.current?.getSource('draw-area')) {
      (modalMap.current.getSource('draw-area') as maplibregl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: [],
      });
    }
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
    (map.getSource('draw-area') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features,
    });
  };

  const createAssignment = async () => {
    if (!drawnArea) {
      alert('Please draw an area on the map (click corners, double-click to finish)');
      return;
    }
    try {
      await api.post('/assignments', {
        ...form,
        area: drawnArea,
        due_date: form.due_date || undefined,
      });
      closeModal();
      loadData();
    } catch (error) {
      console.error('Failed to create assignment:', error);
    }
  };

  const updateAssignment = async () => {
    try {
      const updateData: any = {};
      if (form.assigned_to) updateData.assigned_to = form.assigned_to;
      if (form.due_date) updateData.due_date = form.due_date;
      if (drawnArea) updateData.area = drawnArea;
      await api.put(`/assignments/${editingId}`, updateData);
      closeModal();
      loadData();
    } catch (error) {
      console.error('Failed to update assignment:', error);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await api.put(`/assignments/${id}`, { status });
      loadData();
    } catch (error) {
      console.error('Failed to update assignment:', error);
    }
  };

  const deleteAssignment = async (id: string) => {
    if (!confirm('Delete this assignment?')) return;
    try {
      await api.delete(`/assignments/${id}`);
      loadData();
    } catch (error) {
      console.error('Failed to delete assignment:', error);
    }
  };

  const viewOnMap = (assignment: any) => {
    navigate(`/map/assignment/${assignment.id}`);
  };

  return (
    <>
      <div className="page-header">
        <h2>Work Assignments</h2>
        {isAdmin && <button className="btn-primary" onClick={openCreateModal}>+ New Assignment</button>}
      </div>
      <div className="page-body">
        <table>
          <thead>
            <tr>
              <th>Project</th>
              <th>Assigned To</th>
              <th>Status</th>
              <th>Due Date</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <tr key={a.id}>
                <td>{a.project_name}</td>
                <td>{a.assigned_user}</td>
                <td>
                  <select
                    value={a.status}
                    onChange={(e) => updateStatus(a.id, e.target.value)}
                    style={{ width: 'auto' }}
                  >
                    <option value="pending">Pending</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </td>
                <td>{a.due_date ? new Date(a.due_date).toLocaleDateString() : '-'}</td>
                <td>{new Date(a.created_at).toLocaleDateString()}</td>
                <td style={{ display: 'flex', gap: 4 }}>
                  <button className="btn-secondary" onClick={() => viewOnMap(a)} style={{ padding: '4px 10px', fontSize: 12 }}>
                    Map
                  </button>
                  {isAdmin && (
                    <>
                      <button className="btn-primary" onClick={() => openEditModal(a)} style={{ padding: '4px 10px', fontSize: 12 }}>
                        Edit
                      </button>
                      <button className="btn-danger" onClick={() => deleteAssignment(a.id)} style={{ padding: '4px 10px', fontSize: 12 }}>
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {assignments.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--gray-500)' }}>No assignments yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 700 }}>
            <h3>{modalMode === 'create' ? 'Create Work Assignment' : 'Edit Assignment'}</h3>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ flex: 1 }}>
                {modalMode === 'create' && (
                  <div className="form-group">
                    <label>Project</label>
                    <select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
                      <option value="">Select project</option>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                )}
                <div className="form-group">
                  <label>Assign To</label>
                  <select value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}>
                    <option value="">Select user</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.username} ({u.role})</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Due Date</label>
                  <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                </div>
                <p style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                  {drawnArea ? 'Area drawn. Click "Redraw" to change.' : 'Click on map to draw corners. Double-click to finish.'}
                </p>
                {drawnArea && (
                  <button className="btn-secondary" onClick={clearDrawing} style={{ fontSize: 12, padding: '4px 10px' }}>
                    Redraw Area
                  </button>
                )}
              </div>
              <div style={{ width: 350, height: 300 }}>
                <div ref={modalMapRef} style={{ width: '100%', height: '100%', borderRadius: 8 }} />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={closeModal}>Cancel</button>
              {modalMode === 'create' ? (
                <button
                  className="btn-primary"
                  onClick={createAssignment}
                  disabled={!form.project_id || !form.assigned_to || !drawnArea}
                >
                  Create Assignment
                </button>
              ) : (
                <button className="btn-primary" onClick={updateAssignment}>
                  Save Changes
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
