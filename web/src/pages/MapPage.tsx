import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import PhotoPanel from '../components/PhotoPanel';

type DrawMode = 'none' | 'point' | 'line' | 'polygon';

interface SchemaField {
  name: string;
  type: 'text' | 'number' | 'date' | 'boolean' | 'select';
  options?: string[]; // for select type
}

export default function MapPage() {
  const { projectId, assignmentId } = useParams();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [drawMode, setDrawMode] = useState<DrawMode>('none');
  const [layers, setLayers] = useState<any[]>([]);
  const [selectedLayer, setSelectedLayer] = useState<string>('');
  const [selectedFeature, setSelectedFeature] = useState<any>(null);
  const [showPhotoPanel, setShowPhotoPanel] = useState(false);
  const [featureProperties, setFeatureProperties] = useState<Record<string, string>>({});
  const [showCreateLayer, setShowCreateLayer] = useState(false);
  const [newLayerName, setNewLayerName] = useState('');
  const [newLayerType, setNewLayerType] = useState('Point');
  const [projects, setProjects] = useState<any[]>([]);
  const [newLayerProject, setNewLayerProject] = useState('');
  const [cursorCoords, setCursorCoords] = useState<{ lng: number; lat: number } | null>(null);
  const [schemaFields, setSchemaFields] = useState<SchemaField[]>([]);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<SchemaField['type']>('text');
  const [newFieldOptions, setNewFieldOptions] = useState('');
  const [geoMeasurements, setGeoMeasurements] = useState<{ label: string; value: string }[]>([]);
  const [currentAssignment, setCurrentAssignment] = useState<any>(null);
  const [layerSchema, setLayerSchema] = useState<SchemaField[]>([]);
  const allFeaturesRef = useRef<any[]>([]);
  const drawPoints = useRef<[number, number][]>([]);

  useEffect(() => {
    if (!mapContainer.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors',
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      center: [78.9629, 20.5937],
      zoom: 5,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-left');
    map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: true }), 'top-left');
    map.addControl(new maplibregl.ScaleControl(), 'bottom-left');

    // Cursor coordinates
    map.on('mousemove', (e) => {
      setCursorCoords({ lng: e.lngLat.lng, lat: e.lngLat.lat });
    });
    map.on('mouseout', () => setCursorCoords(null));

    map.on('load', () => {
      // Features source
      map.addSource('features', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'features-point',
        type: 'circle',
        source: 'features',
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': 7,
          'circle-color': '#2563eb',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });

      map.addLayer({
        id: 'features-line',
        type: 'line',
        source: 'features',
        filter: ['==', '$type', 'LineString'],
        paint: { 'line-color': '#dc2626', 'line-width': 3 },
      });

      map.addLayer({
        id: 'features-polygon-fill',
        type: 'fill',
        source: 'features',
        filter: ['==', '$type', 'Polygon'],
        paint: { 'fill-color': '#16a34a', 'fill-opacity': 0.3 },
      });

      map.addLayer({
        id: 'features-polygon-outline',
        type: 'line',
        source: 'features',
        filter: ['==', '$type', 'Polygon'],
        paint: { 'line-color': '#16a34a', 'line-width': 2 },
      });

      // Drawing source
      map.addSource('drawing', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'drawing-points',
        type: 'circle',
        source: 'drawing',
        paint: {
          'circle-radius': 5,
          'circle-color': '#f59e0b',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
        },
      });

      map.addLayer({
        id: 'drawing-line',
        type: 'line',
        source: 'drawing',
        paint: {
          'line-color': '#f59e0b',
          'line-width': 2,
          'line-dasharray': [2, 2],
        },
      });

      // Assignment areas
      map.addSource('assignments', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'assignments-fill',
        type: 'fill',
        source: 'assignments',
        paint: { 'fill-color': '#8b5cf6', 'fill-opacity': 0.15 },
      });

      map.addLayer({
        id: 'assignments-outline',
        type: 'line',
        source: 'assignments',
        paint: { 'line-color': '#8b5cf6', 'line-width': 2, 'line-dasharray': [4, 2] },
      });

      map.addLayer({
        id: 'assignments-labels',
        type: 'symbol',
        source: 'assignments',
        layout: {
          'text-field': ['get', 'assigned_user'],
          'text-size': 12,
          'text-anchor': 'center',
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#6d28d9',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5,
        },
      });

      // Project boundary
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
        paint: { 'line-color': '#2563eb', 'line-width': 3, 'line-dasharray': [6, 3] },
      });

      loadMapData(map);
    });

    // Click handler for feature selection
    map.on('click', (e) => {
      const currentDrawMode = drawMode;
      if (currentDrawMode !== 'none') return;

      const features = map.queryRenderedFeatures(e.point, {
        layers: ['features-point', 'features-line', 'features-polygon-fill'],
      });

      if (features.length > 0) {
        const feature = features[0];
        setSelectedFeature(feature);
        setFeatureProperties(feature.properties as Record<string, string>);
        computeMeasurements(feature);
        loadLayerSchema(feature.properties?.layer_id);
      } else {
        setSelectedFeature(null);
        setGeoMeasurements([]);
        setLayerSchema([]);
      }
    });

    mapRef.current = map;
    return () => map.remove();
  }, []);

  // Handle draw mode clicks
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleDrawClick = (e: maplibregl.MapMouseEvent) => {
      const point: [number, number] = [e.lngLat.lng, e.lngLat.lat];

      if (drawMode === 'point') {
        saveFeature({ type: 'Point', coordinates: point });
        setDrawMode('none');
        drawPoints.current = [];
        return;
      }

      drawPoints.current.push(point);
      updateDrawingPreview(map);
    };

    const handleDrawDblClick = (e: maplibregl.MapMouseEvent) => {
      e.preventDefault();
      if (drawPoints.current.length < 2) return;

      if (drawMode === 'line') {
        saveFeature({ type: 'LineString', coordinates: drawPoints.current });
      } else if (drawMode === 'polygon' && drawPoints.current.length >= 3) {
        const coords = [...drawPoints.current, drawPoints.current[0]];
        saveFeature({ type: 'Polygon', coordinates: [coords] });
      }

      drawPoints.current = [];
      setDrawMode('none');
      clearDrawingPreview(map);
    };

    if (drawMode !== 'none') {
      map.getCanvas().style.cursor = 'crosshair';
      map.on('click', handleDrawClick);
      map.on('dblclick', handleDrawDblClick);
    } else {
      map.getCanvas().style.cursor = '';
    }

    return () => {
      map.off('click', handleDrawClick);
      map.off('dblclick', handleDrawDblClick);
    };
  }, [drawMode, selectedLayer]);

  // Filter features when selected layer changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const source = map.getSource('features') as maplibregl.GeoJSONSource;
    if (!source) return;

    if (selectedLayer) {
      const filtered = allFeaturesRef.current.filter(
        (f: any) => f.properties.layer_id === selectedLayer
      );
      source.setData({ type: 'FeatureCollection', features: filtered });
    } else {
      source.setData({ type: 'FeatureCollection', features: allFeaturesRef.current });
    }
  }, [selectedLayer]);

  const computeMeasurements = (feature: any) => {
    const measurements: { label: string; value: string }[] = [];
    const geom = feature.geometry;

    if (geom.type === 'Point') {
      measurements.push({ label: 'Latitude', value: geom.coordinates[1].toFixed(6) });
      measurements.push({ label: 'Longitude', value: geom.coordinates[0].toFixed(6) });
    } else if (geom.type === 'LineString') {
      const line = turf.lineString(geom.coordinates);
      const lengthKm = turf.length(line, { units: 'kilometers' });
      if (lengthKm < 1) {
        measurements.push({ label: 'Length', value: `${(lengthKm * 1000).toFixed(1)} m` });
      } else {
        measurements.push({ label: 'Length', value: `${lengthKm.toFixed(3)} km` });
      }
    } else if (geom.type === 'Polygon') {
      const poly = turf.polygon(geom.coordinates);
      const areaM2 = turf.area(poly);
      const perimeterLine = turf.lineString(geom.coordinates[0]);
      const perimeterKm = turf.length(perimeterLine, { units: 'kilometers' });

      if (areaM2 < 10000) {
        measurements.push({ label: 'Area', value: `${areaM2.toFixed(1)} m²` });
      } else if (areaM2 < 1000000) {
        measurements.push({ label: 'Area', value: `${(areaM2 / 10000).toFixed(3)} ha` });
      } else {
        measurements.push({ label: 'Area', value: `${(areaM2 / 1000000).toFixed(3)} km²` });
      }

      if (perimeterKm < 1) {
        measurements.push({ label: 'Perimeter', value: `${(perimeterKm * 1000).toFixed(1)} m` });
      } else {
        measurements.push({ label: 'Perimeter', value: `${perimeterKm.toFixed(3)} km` });
      }
    }

    setGeoMeasurements(measurements);
  };

  const loadLayerSchema = async (layerId: string) => {
    if (!layerId) { setLayerSchema([]); return; }
    try {
      const res = await api.get(`/layers/${layerId}`);
      const layer = res.data.data;
      const schema = Array.isArray(layer?.schema) ? layer.schema : [];
      setLayerSchema(schema);
    } catch {
      setLayerSchema([]);
    }
  };

  const updateDrawingPreview = (map: maplibregl.Map) => {
    const points = drawPoints.current;
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

    (map.getSource('drawing') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features,
    });
  };

  const clearDrawingPreview = (map: maplibregl.Map) => {
    (map.getSource('drawing') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: [],
    });
  };

  const addSchemaField = () => {
    if (!newFieldName.trim()) return;
    const field: SchemaField = { name: newFieldName.trim(), type: newFieldType };
    if (newFieldType === 'select' && newFieldOptions.trim()) {
      field.options = newFieldOptions.split(',').map((o) => o.trim()).filter(Boolean);
    }
    setSchemaFields([...schemaFields, field]);
    setNewFieldName('');
    setNewFieldType('text');
    setNewFieldOptions('');
  };

  const removeSchemaField = (index: number) => {
    setSchemaFields(schemaFields.filter((_, i) => i !== index));
  };

  const createLayer = async () => {
    if (!newLayerName.trim()) {
      alert('Layer name is required');
      return;
    }
    if (!newLayerProject) {
      alert('Please select a project');
      return;
    }
    try {
      await api.post('/layers', {
        project_id: newLayerProject,
        name: newLayerName.trim(),
        geometry_type: newLayerType,
        schema: schemaFields,
      });
      setShowCreateLayer(false);
      setNewLayerName('');
      setNewLayerType('Point');
      setSchemaFields([]);
      if (mapRef.current) loadMapData(mapRef.current);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to create layer');
    }
  };

  const loadMapData = async (map: maplibregl.Map) => {
    try {
      // Load projects
      const projectsRes = await api.get('/projects');
      const allProjects = projectsRes.data.data || [];
      setProjects(allProjects);

      // Determine the effective project ID
      let effectiveProjectId = projectId;
      let assignmentData: any = null;

      // If viewing a specific assignment, load it and use its project
      if (assignmentId) {
        const assignRes = await api.get(`/assignments/${assignmentId}`);
        assignmentData = assignRes.data.data;
        setCurrentAssignment(assignmentData);
        effectiveProjectId = assignmentData.project_id;
      }

      // Show project boundary
      if (effectiveProjectId) {
        const currentProject = allProjects.find((p: any) => p.id === effectiveProjectId);
        if (currentProject?.boundary) {
          (map.getSource('project-boundary') as maplibregl.GeoJSONSource)?.setData({
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              geometry: currentProject.boundary,
              properties: { name: currentProject.name },
            }],
          });
        }
      }

      // Load layers
      const layerParams = effectiveProjectId ? `?project_id=${effectiveProjectId}` : '';
      const layersRes = await api.get(`/layers${layerParams}`);
      const loadedLayers = layersRes.data.data || [];
      setLayers(loadedLayers);
      if (loadedLayers.length > 0 && !selectedLayer) setSelectedLayer(loadedLayers[0].id);

      // Load features for all layers
      const allFeatures: any[] = [];
      for (const layer of loadedLayers) {
        const featuresRes = await api.get(`/features?layer_id=${layer.id}`);
        const features = featuresRes.data.data || [];
        allFeatures.push(
          ...features.map((f: any) => ({
            type: 'Feature',
            id: f.id,
            geometry: f.geometry,
            properties: { ...f.properties, layer_id: f.layer_id, feature_id: f.id },
          }))
        );
      }

      // If viewing a specific assignment, filter features to those within the assignment area
      let displayFeatures = allFeatures;
      if (assignmentData?.area) {
        const assignmentPoly = turf.polygon(assignmentData.area.coordinates);
        displayFeatures = allFeatures.filter((f: any) => {
          try {
            if (f.geometry.type === 'Point') {
              return turf.booleanPointInPolygon(f.geometry.coordinates, assignmentPoly);
            } else if (f.geometry.type === 'LineString') {
              return turf.booleanWithin(turf.lineString(f.geometry.coordinates), assignmentPoly);
            } else if (f.geometry.type === 'Polygon') {
              return turf.booleanWithin(turf.polygon(f.geometry.coordinates), assignmentPoly);
            }
          } catch { /* include feature if check fails */ }
          return true;
        });
      }

      allFeaturesRef.current = displayFeatures;

      // Apply layer filter if active
      const visibleFeatures = selectedLayer
        ? displayFeatures.filter((f: any) => f.properties.layer_id === selectedLayer)
        : displayFeatures;

      (map.getSource('features') as maplibregl.GeoJSONSource)?.setData({
        type: 'FeatureCollection',
        features: visibleFeatures,
      });

      // Load assignments
      if (assignmentId && assignmentData) {
        // Show only this specific assignment
        (map.getSource('assignments') as maplibregl.GeoJSONSource)?.setData({
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            id: assignmentData.id,
            geometry: assignmentData.area,
            properties: { status: assignmentData.status, project_name: assignmentData.project_name, assigned_user: assignmentData.assigned_user },
          }],
        });
        // Fit to assignment area
        if (assignmentData.area?.coordinates?.[0]) {
          const coords = assignmentData.area.coordinates[0];
          const bounds = coords.reduce(
            (b: maplibregl.LngLatBounds, c: number[]) => b.extend(c as [number, number]),
            new maplibregl.LngLatBounds(coords[0] as [number, number], coords[0] as [number, number])
          );
          map.fitBounds(bounds, { padding: 60 });
        }
      } else {
        // Show project assignments
        const assignmentsRes = await api.get('/assignments');
        const allAssignments = assignmentsRes.data.data || [];
        const assignments = effectiveProjectId
          ? allAssignments.filter((a: any) => a.project_id === effectiveProjectId)
          : allAssignments;
        (map.getSource('assignments') as maplibregl.GeoJSONSource)?.setData({
          type: 'FeatureCollection',
          features: assignments.map((a: any) => ({
            type: 'Feature',
            id: a.id,
            geometry: a.area,
            properties: { status: a.status, project_name: a.project_name, assigned_user: a.assigned_user },
          })),
        });

        // Fit to project boundary if viewing a project
        if (effectiveProjectId) {
          const currentProject = allProjects.find((p: any) => p.id === effectiveProjectId);
          if (currentProject?.boundary?.coordinates?.[0]) {
            const coords = currentProject.boundary.coordinates[0];
            const bounds = coords.reduce(
              (b: maplibregl.LngLatBounds, c: number[]) => b.extend(c as [number, number]),
              new maplibregl.LngLatBounds(coords[0] as [number, number], coords[0] as [number, number])
            );
            map.fitBounds(bounds, { padding: 60 });
          }
        }
      }
    } catch (error) {
      console.error('Failed to load map data:', error);
    }
  };

  const saveFeature = async (geometry: any) => {
    if (!selectedLayer) {
      alert('Please select a layer first');
      return;
    }

    // Build initial properties from layer schema
    const layer = layers.find((l) => l.id === selectedLayer);
    const schema: SchemaField[] = Array.isArray(layer?.schema) ? layer.schema : [];
    const initialProps: Record<string, any> = {};
    for (const field of schema) {
      if (field.type === 'boolean') initialProps[field.name] = false;
      else if (field.type === 'number') initialProps[field.name] = 0;
      else initialProps[field.name] = '';
    }

    try {
      await api.post('/features', {
        layer_id: selectedLayer,
        geometry,
        properties: initialProps,
      });
      if (mapRef.current) loadMapData(mapRef.current);
    } catch (error: any) {
      const msg = error.response?.data?.error || 'Failed to save feature';
      alert(msg);
    }
  };

  const updateFeature = async () => {
    if (!selectedFeature) return;
    try {
      await api.put(`/features/${selectedFeature.properties.feature_id}`, {
        properties: featureProperties,
      });
      setSelectedFeature(null);
      setGeoMeasurements([]);
      setLayerSchema([]);
      if (mapRef.current) loadMapData(mapRef.current);
    } catch (error) {
      console.error('Failed to update feature:', error);
    }
  };

  const deleteFeature = async () => {
    if (!selectedFeature) return;
    try {
      await api.delete(`/features/${selectedFeature.properties.feature_id}`);
      setSelectedFeature(null);
      setGeoMeasurements([]);
      setLayerSchema([]);
      if (mapRef.current) loadMapData(mapRef.current);
    } catch (error) {
      console.error('Failed to delete feature:', error);
    }
  };

  return (
    <>
      <div className="page-header">
        <h2>
          Map View
          {currentAssignment && (
            <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--gray-500)', marginLeft: 8 }}>
              — {currentAssignment.project_name} / {currentAssignment.assigned_user}
            </span>
          )}
        </h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            value={selectedLayer}
            onChange={(e) => setSelectedLayer(e.target.value)}
            style={{ width: 200 }}
          >
            <option value="">All Layers</option>
            {layers.map((l) => (
              <option key={l.id} value={l.id}>{l.name} ({l.geometry_type})</option>
            ))}
          </select>
          {isAdmin && (
            <button className="btn-primary" onClick={() => setShowCreateLayer(true)} style={{ whiteSpace: 'nowrap' }}>
              + Layer
            </button>
          )}
        </div>
      </div>
      <div className="map-container">
        <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

        {/* Cursor coordinates */}
        {cursorCoords && (
          <div style={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            background: 'rgba(0,0,0,0.7)',
            color: '#fff',
            padding: '4px 10px',
            borderRadius: 4,
            fontSize: 12,
            fontFamily: 'monospace',
            zIndex: 10,
            pointerEvents: 'none',
          }}>
            Lat: {cursorCoords.lat.toFixed(6)}, Lng: {cursorCoords.lng.toFixed(6)}
          </div>
        )}

        <div className="map-toolbar">
          <button
            className={drawMode === 'point' ? 'active' : ''}
            onClick={() => { setDrawMode(drawMode === 'point' ? 'none' : 'point'); drawPoints.current = []; }}
          >
            Point
          </button>
          <button
            className={drawMode === 'line' ? 'active' : ''}
            onClick={() => { setDrawMode(drawMode === 'line' ? 'none' : 'line'); drawPoints.current = []; }}
          >
            Line
          </button>
          <button
            className={drawMode === 'polygon' ? 'active' : ''}
            onClick={() => { setDrawMode(drawMode === 'polygon' ? 'none' : 'polygon'); drawPoints.current = []; }}
          >
            Polygon
          </button>
          {drawMode !== 'none' && (
            <button onClick={() => { setDrawMode('none'); drawPoints.current = []; if (mapRef.current) clearDrawingPreview(mapRef.current); }}>
              Cancel
            </button>
          )}
        </div>

        {selectedFeature && (
          <div className="feature-panel">
            <h3>
              Feature Properties
              <button className="btn-secondary" onClick={() => { setSelectedFeature(null); setGeoMeasurements([]); setLayerSchema([]); }} style={{ padding: '4px 8px' }}>
                X
              </button>
            </h3>
            <div className="form-group">
              <label>ID</label>
              <input value={selectedFeature.properties.feature_id || selectedFeature.id} readOnly />
            </div>
            <div className="form-group">
              <label>Type</label>
              <input value={selectedFeature.geometry.type} readOnly />
            </div>

            {/* Geometry measurements */}
            {geoMeasurements.map((m) => (
              <div className="form-group" key={m.label}>
                <label>{m.label}</label>
                <input value={m.value} readOnly style={{ background: '#f0f9ff', color: '#0369a1', fontWeight: 600 }} />
              </div>
            ))}

            {/* Schema-based fields */}
            {layerSchema.length > 0 && layerSchema.map((field) => (
              <div className="form-group" key={field.name}>
                <label>{field.name}</label>
                {field.type === 'boolean' ? (
                  <select
                    value={String(featureProperties[field.name] ?? 'false')}
                    onChange={(e) => setFeatureProperties({ ...featureProperties, [field.name]: e.target.value })}
                  >
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                ) : field.type === 'select' && field.options ? (
                  <select
                    value={String(featureProperties[field.name] ?? '')}
                    onChange={(e) => setFeatureProperties({ ...featureProperties, [field.name]: e.target.value })}
                  >
                    <option value="">Select...</option>
                    {field.options.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                    value={String(featureProperties[field.name] ?? '')}
                    onChange={(e) => setFeatureProperties({ ...featureProperties, [field.name]: e.target.value })}
                  />
                )}
              </div>
            ))}

            {/* Non-schema custom properties */}
            {Object.entries(featureProperties)
              .filter(([key]) => !['layer_id', 'feature_id', 'created_by', 'sync_version'].includes(key))
              .filter(([key]) => !layerSchema.some((f) => f.name === key))
              .map(([key, value]) => (
                <div className="form-group" key={key}>
                  <label>{key}</label>
                  <input
                    value={String(value)}
                    onChange={(e) => setFeatureProperties({ ...featureProperties, [key]: e.target.value })}
                  />
                </div>
              ))}

            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button className="btn-primary" onClick={updateFeature}>Save</button>
              <button className="btn-danger" onClick={deleteFeature}>Delete</button>
            </div>
            <button
              className="btn-secondary"
              onClick={() => setShowPhotoPanel(true)}
              style={{ width: '100%', background: '#0891b2', color: '#fff', fontSize: 13 }}
            >
              Photos & 360° Viewer
            </button>
          </div>
        )}

        {showPhotoPanel && selectedFeature && (
          <PhotoPanel
            featureId={selectedFeature.properties.feature_id || selectedFeature.id}
            onClose={() => setShowPhotoPanel(false)}
          />
        )}
      </div>

      {/* Create Layer Modal */}
      {showCreateLayer && (
        <div className="modal-overlay" onClick={() => setShowCreateLayer(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 550 }}>
            <h3>Create New Layer</h3>
            <div className="form-group">
              <label>Project</label>
              <select value={newLayerProject} onChange={(e) => setNewLayerProject(e.target.value)}>
                <option value="">Select Project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Layer Name</label>
              <input
                value={newLayerName}
                onChange={(e) => setNewLayerName(e.target.value)}
                placeholder="e.g. Roads, Buildings, Survey Points"
              />
            </div>
            <div className="form-group">
              <label>Geometry Type</label>
              <select value={newLayerType} onChange={(e) => setNewLayerType(e.target.value)}>
                <option value="Point">Point</option>
                <option value="LineString">Line</option>
                <option value="Polygon">Polygon</option>
              </select>
            </div>

            {/* Custom Schema Fields */}
            <div style={{ borderTop: '1px solid var(--gray-200)', paddingTop: 12, marginTop: 12 }}>
              <label style={{ fontWeight: 600, fontSize: 14, marginBottom: 8, display: 'block' }}>
                Custom Fields (data to collect)
              </label>

              {schemaFields.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  {schemaFields.map((field, idx) => (
                    <div key={idx} style={{
                      display: 'flex', gap: 8, alignItems: 'center',
                      padding: '6px 10px', background: 'var(--gray-50)',
                      borderRadius: 6, marginBottom: 4, fontSize: 13,
                    }}>
                      <span style={{ flex: 1, fontWeight: 500 }}>{field.name}</span>
                      <span style={{ color: 'var(--gray-500)', fontSize: 12 }}>
                        {field.type}{field.options ? ` (${field.options.join(', ')})` : ''}
                      </span>
                      <button
                        onClick={() => removeSchemaField(idx)}
                        style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <label style={{ fontSize: 12 }}>Field Name</label>
                  <input
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)}
                    placeholder="e.g. material, condition"
                    style={{ fontSize: 13 }}
                  />
                </div>
                <div style={{ width: 110 }}>
                  <label style={{ fontSize: 12 }}>Type</label>
                  <select value={newFieldType} onChange={(e) => setNewFieldType(e.target.value as SchemaField['type'])} style={{ fontSize: 13 }}>
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                    <option value="boolean">Yes/No</option>
                    <option value="select">Dropdown</option>
                  </select>
                </div>
                {newFieldType === 'select' && (
                  <div style={{ width: 160 }}>
                    <label style={{ fontSize: 12 }}>Options (comma-separated)</label>
                    <input
                      value={newFieldOptions}
                      onChange={(e) => setNewFieldOptions(e.target.value)}
                      placeholder="good, fair, poor"
                      style={{ fontSize: 13 }}
                    />
                  </div>
                )}
                <button
                  className="btn-secondary"
                  onClick={addSchemaField}
                  style={{ padding: '6px 12px', fontSize: 13, whiteSpace: 'nowrap' }}
                >
                  + Add
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn-primary" onClick={createLayer}>Create Layer</button>
              <button className="btn-secondary" onClick={() => { setShowCreateLayer(false); setSchemaFields([]); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
