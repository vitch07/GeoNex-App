import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  Switch,
  Platform,
} from 'react-native';
import MapView, { Marker, Polyline, Polygon, MapPressEvent, LongPressEvent } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as turf from '@turf/turf';
import api from '../config/api';
import {
  saveFeatureLocally,
  getLocalFeatures,
  deleteLocalFeature,
  getCachedLayers,
  cacheLayers,
  getLocalPhotos,
  deleteLocalPhoto,
} from '../database/LocalDatabase';

type DrawMode = 'none' | 'point' | 'line' | 'polygon';
type SchemaFieldType = 'text' | 'number' | 'date' | 'boolean' | 'select';

interface SchemaField {
  name: string;
  type: SchemaFieldType;
  options?: string[];
}

interface MapScreenProps {
  route?: any;
  navigation?: any;
}

export default function MapScreen({ route, navigation }: MapScreenProps) {
  const assignment = route?.params?.assignment;
  const [drawMode, setDrawMode] = useState<DrawMode>('none');
  const [drawPoints, setDrawPoints] = useState<{ latitude: number; longitude: number }[]>([]);
  const [allFeatures, setAllFeatures] = useState<any[]>([]);
  const [displayFeatures, setDisplayFeatures] = useState<any[]>([]);
  const [layers, setLayers] = useState<any[]>([]);
  const [selectedLayer, setSelectedLayer] = useState<string>('');
  const [selectedFeature, setSelectedFeature] = useState<any>(null);
  const [showPropertyModal, setShowPropertyModal] = useState(false);
  const [propertyValues, setPropertyValues] = useState<Record<string, string>>({});
  const [pendingGeometry, setPendingGeometry] = useState<any>(null);
  const [showLayerPicker, setShowLayerPicker] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isFieldUser, setIsFieldUser] = useState(false);
  // GPS coordinates display
  const [gpsCoords, setGpsCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  // Geometry measurements
  const [geoMeasurements, setGeoMeasurements] = useState<Record<string, string>>({});
  // Create layer state
  const [showCreateLayer, setShowCreateLayer] = useState(false);
  const [newLayerName, setNewLayerName] = useState('');
  const [newLayerType, setNewLayerType] = useState('Point');
  const [projects, setProjects] = useState<any[]>([]);
  const [newLayerProject, setNewLayerProject] = useState('');
  // Schema builder state
  const [schemaFields, setSchemaFields] = useState<SchemaField[]>([]);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<SchemaFieldType>('text');
  const [newFieldOptions, setNewFieldOptions] = useState('');
  // Photo management
  const [featurePhotos, setFeaturePhotos] = useState<any[]>([]);
  const [showPhotos, setShowPhotos] = useState(false);

  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    loadData();
    checkRole();
    startLocationTracking();
  }, []);

  // Filter features when selectedLayer changes
  useEffect(() => {
    filterFeatures();
  }, [selectedLayer, allFeatures]);

  // Fit map to assignment area when assignment is provided
  useEffect(() => {
    if (assignment?.area?.coordinates) {
      const coords = assignment.area.coordinates[0];
      if (coords?.length > 0) {
        setTimeout(() => {
          if (mapRef.current) {
            const lats = coords.map((c: number[]) => c[1]);
            const lngs = coords.map((c: number[]) => c[0]);
            mapRef.current.fitToCoordinates(
              coords.map((c: number[]) => ({ latitude: c[1], longitude: c[0] })),
              { edgePadding: { top: 80, right: 40, bottom: 80, left: 40 }, animated: true }
            );
          }
        }, 500);
      }
    }
  }, [assignment]);

  const startLocationTracking = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;

    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 1 },
      (location) => {
        setGpsCoords({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
      }
    );
  };

  const checkRole = async () => {
    const user = JSON.parse((await AsyncStorage.getItem('geonex_user')) || '{}');
    setIsAdmin(user.role === 'admin');
    setIsFieldUser(user.role === 'field_user');
  };

  const loadData = async () => {
    let isOnlineNow = false;
    try {
      const res = await api.get<any>('/layers');
      const layersData = res?.data !== undefined ? res.data : res;
      const serverLayers = Array.isArray(layersData) ? layersData : [];
      if (serverLayers.length > 0) {
        await cacheLayers(serverLayers);
        setLayers(serverLayers);
      } else {
        const cachedLayers = await getCachedLayers();
        setLayers(cachedLayers);
      }
      isOnlineNow = true;
    } catch {
      const cachedLayers = await getCachedLayers();
      setLayers(cachedLayers);
    }

    // Load local features first
    const localFeatures = await getLocalFeatures();

    // If online, also fetch server features and merge
    if (isOnlineNow) {
      try {
        const serverFeatures = await fetchServerFeatures();
        // Merge: local unsynced features take priority, add server features not in local
        const localIds = new Set(localFeatures.map((f) => f.id));
        const merged = [...localFeatures];
        for (const sf of serverFeatures) {
          if (!localIds.has(sf.id)) {
            // Save server feature locally as synced
            await saveFeatureLocally({
              id: sf.id,
              layer_id: sf.layer_id,
              geometry: sf.geometry,
              properties: sf.properties || {},
              created_by: sf.created_by || 'unknown',
              sync_status: 'synced',
            });
            merged.push({ ...sf, sync_status: 'synced' });
          }
        }
        setAllFeatures(merged);
      } catch {
        setAllFeatures(localFeatures);
      }
    } else {
      setAllFeatures(localFeatures);
    }
  };

  const fetchServerFeatures = async (): Promise<any[]> => {
    // If viewing an assignment, fetch features for that assignment's project layers
    if (assignment) {
      try {
        const res = await api.get<any>(`/features?bbox=`);
        const data = res?.data !== undefined ? res.data : res;
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    }
    // Otherwise fetch all features
    try {
      const res = await api.get<any>('/features');
      const data = res?.data !== undefined ? res.data : res;
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  };

  const filterFeatures = () => {
    let filtered = allFeatures;

    // Filter by layer if one is selected
    if (selectedLayer) {
      filtered = filtered.filter((f) => f.layer_id === selectedLayer);
    }

    // Filter by assignment boundary if viewing an assignment
    if (assignment?.area?.coordinates) {
      const assignmentPoly = turf.polygon(assignment.area.coordinates);
      filtered = filtered.filter((f) => {
        try {
          const geo = f.geometry;
          if (geo.type === 'Point') {
            return turf.booleanPointInPolygon(turf.point(geo.coordinates), assignmentPoly);
          } else if (geo.type === 'LineString') {
            return turf.booleanWithin(turf.lineString(geo.coordinates), assignmentPoly);
          } else if (geo.type === 'Polygon') {
            return turf.booleanWithin(turf.polygon(geo.coordinates), assignmentPoly);
          }
        } catch {
          return false;
        }
        return false;
      });
    }

    setDisplayFeatures(filtered);
  };

  const computeMeasurements = (geometry: any): Record<string, string> => {
    const m: Record<string, string> = {};
    try {
      if (geometry.type === 'Point') {
        m['Latitude'] = geometry.coordinates[1].toFixed(6);
        m['Longitude'] = geometry.coordinates[0].toFixed(6);
      } else if (geometry.type === 'LineString') {
        const line = turf.lineString(geometry.coordinates);
        const len = turf.length(line, { units: 'meters' });
        m['Length'] = len >= 1000 ? `${(len / 1000).toFixed(2)} km` : `${len.toFixed(1)} m`;
      } else if (geometry.type === 'Polygon') {
        const poly = turf.polygon(geometry.coordinates);
        const areaM2 = turf.area(poly);
        const line = turf.lineString(geometry.coordinates[0]);
        const perimeterM = turf.length(line, { units: 'meters' });

        if (areaM2 >= 1_000_000) {
          m['Area'] = `${(areaM2 / 1_000_000).toFixed(2)} km²`;
        } else if (areaM2 >= 10_000) {
          m['Area'] = `${(areaM2 / 10_000).toFixed(2)} ha`;
        } else {
          m['Area'] = `${areaM2.toFixed(1)} m²`;
        }
        m['Perimeter'] = perimeterM >= 1000 ? `${(perimeterM / 1000).toFixed(2)} km` : `${perimeterM.toFixed(1)} m`;
      }
    } catch {}
    return m;
  };

  const isWithinAssignmentBoundary = (geometry: any): boolean => {
    if (!assignment?.area?.coordinates) return true; // No boundary = allow
    try {
      const assignmentPoly = turf.polygon(assignment.area.coordinates);
      if (geometry.type === 'Point') {
        return turf.booleanPointInPolygon(turf.point(geometry.coordinates), assignmentPoly);
      } else if (geometry.type === 'LineString') {
        return turf.booleanWithin(turf.lineString(geometry.coordinates), assignmentPoly);
      } else if (geometry.type === 'Polygon') {
        return turf.booleanWithin(turf.polygon(geometry.coordinates), assignmentPoly);
      }
    } catch {}
    return true;
  };

  const loadProjects = async () => {
    try {
      const res = await api.get<any>('/projects');
      const data = res?.data !== undefined ? res.data : res;
      setProjects(Array.isArray(data) ? data : []);
    } catch {
      setProjects([]);
    }
  };

  const openCreateLayer = () => {
    setShowLayerPicker(false);
    loadProjects();
    setNewLayerName('');
    setNewLayerType('Point');
    setNewLayerProject('');
    setSchemaFields([]);
    setNewFieldName('');
    setNewFieldType('text');
    setNewFieldOptions('');
    setShowCreateLayer(true);
  };

  const addSchemaField = () => {
    if (!newFieldName.trim()) {
      Alert.alert('Error', 'Field name is required');
      return;
    }
    if (schemaFields.some((f) => f.name === newFieldName.trim())) {
      Alert.alert('Error', 'Field name already exists');
      return;
    }
    const field: SchemaField = {
      name: newFieldName.trim(),
      type: newFieldType,
    };
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
      Alert.alert('Error', 'Layer name is required');
      return;
    }
    if (!newLayerProject) {
      Alert.alert('Error', 'Please select a project');
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
      await loadData();
      Alert.alert('Success', 'Layer created');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create layer');
    }
  };

  const handleMapPress = (e: MapPressEvent) => {
    if (drawMode === 'none') return;

    const { latitude, longitude } = e.nativeEvent.coordinate;

    if (drawMode === 'point') {
      const geometry = { type: 'Point', coordinates: [longitude, latitude] };

      // Boundary enforcement for field users
      if (isFieldUser && !isWithinAssignmentBoundary(geometry)) {
        Alert.alert('Out of Bounds', 'You cannot add features outside your assigned area boundary.');
        return;
      }

      showPropertyEditor(geometry);
      setDrawMode('none');
      return;
    }

    setDrawPoints((prev) => [...prev, { latitude, longitude }]);
  };

  const handleMapLongPress = (_e: LongPressEvent) => {
    if (drawMode === 'line' && drawPoints.length >= 2) {
      const coords = drawPoints.map((p) => [p.longitude, p.latitude]);
      const geometry = { type: 'LineString', coordinates: coords };

      if (isFieldUser && !isWithinAssignmentBoundary(geometry)) {
        Alert.alert('Out of Bounds', 'This line extends outside your assigned area boundary.');
        setDrawPoints([]);
        setDrawMode('none');
        return;
      }

      showPropertyEditor(geometry);
      setDrawPoints([]);
      setDrawMode('none');
    } else if (drawMode === 'polygon' && drawPoints.length >= 3) {
      const coords = drawPoints.map((p) => [p.longitude, p.latitude]);
      coords.push(coords[0]);
      const geometry = { type: 'Polygon', coordinates: [coords] };

      if (isFieldUser && !isWithinAssignmentBoundary(geometry)) {
        Alert.alert('Out of Bounds', 'This polygon extends outside your assigned area boundary.');
        setDrawPoints([]);
        setDrawMode('none');
        return;
      }

      showPropertyEditor(geometry);
      setDrawPoints([]);
      setDrawMode('none');
    }
  };

  const showPropertyEditor = (geometry: any) => {
    setPendingGeometry(geometry);
    // Initialize property values with defaults from schema
    const layer = layers.find((l) => l.id === selectedLayer);
    const schema = layer?.schema || [];
    const defaults: Record<string, string> = {};
    for (const field of schema) {
      if (field.type === 'boolean') defaults[field.name] = 'false';
      else if (field.type === 'number') defaults[field.name] = '';
      else defaults[field.name] = '';
    }
    setPropertyValues(defaults);
    setShowPropertyModal(true);
  };

  const saveNewFeature = async () => {
    if (!selectedLayer || !pendingGeometry) {
      Alert.alert('Error', 'Please select a layer first');
      return;
    }

    const user = JSON.parse((await AsyncStorage.getItem('geonex_user')) || '{}');
    const id = Crypto.randomUUID();
    const feature = {
      id,
      layer_id: selectedLayer,
      geometry: pendingGeometry,
      properties: propertyValues,
      created_by: user.id || 'unknown',
      sync_status: 'new',
    };

    await saveFeatureLocally(feature);
    setShowPropertyModal(false);
    setPendingGeometry(null);
    await loadData();
  };

  const handleDeleteFeature = async () => {
    if (!selectedFeature) return;
    Alert.alert('Delete Feature', 'Are you sure?', [
      { text: 'Cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteLocalFeature(selectedFeature.id);
          setSelectedFeature(null);
          setGeoMeasurements({});
          await loadData();
        },
      },
    ]);
  };

  const handleUpdateFeature = async () => {
    if (!selectedFeature) return;
    await saveFeatureLocally({
      ...selectedFeature,
      properties: propertyValues,
      sync_status: selectedFeature.sync_status === 'synced' ? 'modified' : selectedFeature.sync_status,
    });
    setSelectedFeature(null);
    setGeoMeasurements({});
    await loadData();
  };

  const selectFeature = (f: any) => {
    setSelectedFeature(f);
    setPropertyValues(f.properties || {});
    setGeoMeasurements(computeMeasurements(f.geometry));
    loadFeaturePhotos(f.id);
  };

  const loadFeaturePhotos = async (featureId: string) => {
    const photos = await getLocalPhotos(featureId);
    setFeaturePhotos(photos);
  };

  const handleDeletePhoto = (photoId: string) => {
    Alert.alert('Delete Photo', 'Are you sure?', [
      { text: 'Cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteLocalPhoto(photoId);
          if (selectedFeature) {
            await loadFeaturePhotos(selectedFeature.id);
          }
        },
      },
    ]);
  };

  // Convert GeoJSON coords to map coords
  const toLatLng = (coords: number[]) => ({ latitude: coords[1], longitude: coords[0] });

  // Render features on map
  const renderFeatures = () => {
    return displayFeatures.map((f) => {
      const geo = f.geometry;
      const syncColor = f.sync_status === 'new' ? '#f59e0b' : f.sync_status === 'modified' ? '#f97316' : '#2563eb';

      if (geo.type === 'Point') {
        return (
          <Marker
            key={f.id}
            coordinate={toLatLng(geo.coordinates)}
            pinColor={syncColor}
            onPress={() => selectFeature(f)}
          />
        );
      }
      if (geo.type === 'LineString') {
        return (
          <Polyline
            key={f.id}
            coordinates={geo.coordinates.map(toLatLng)}
            strokeColor="#dc2626"
            strokeWidth={3}
            tappable
            onPress={() => selectFeature(f)}
          />
        );
      }
      if (geo.type === 'Polygon') {
        return (
          <Polygon
            key={f.id}
            coordinates={geo.coordinates[0].map(toLatLng)}
            fillColor="rgba(22,163,106,0.3)"
            strokeColor="#16a34a"
            strokeWidth={2}
            tappable
            onPress={() => selectFeature(f)}
          />
        );
      }
      return null;
    });
  };

  // Render assignment area
  const renderAssignmentArea = () => {
    if (!assignment?.area?.coordinates) return null;
    const coords = assignment.area.coordinates[0];
    if (!coords) return null;
    return (
      <Polygon
        coordinates={coords.map(toLatLng)}
        fillColor="rgba(139,92,246,0.15)"
        strokeColor="#8b5cf6"
        strokeWidth={2}
        lineDashPattern={[8, 4]}
      />
    );
  };

  const currentLayer = layers.find((l) => l.id === selectedLayer);
  const currentLayerSchema: SchemaField[] = currentLayer?.schema || [];
  const currentLayerName = selectedLayer ? (currentLayer?.name || 'Unknown') : 'All Layers';

  // Get the selected feature's layer schema for proper property editing
  const selectedFeatureLayer = selectedFeature ? layers.find((l) => l.id === selectedFeature.layer_id) : null;
  const selectedFeatureSchema: SchemaField[] = selectedFeatureLayer?.schema || [];

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: 20.5937,
          longitude: 78.9629,
          latitudeDelta: 20,
          longitudeDelta: 20,
        }}
        showsUserLocation
        showsMyLocationButton
        onPress={handleMapPress}
        onLongPress={handleMapLongPress}
      >
        {renderAssignmentArea()}
        {renderFeatures()}

        {/* Draw preview markers */}
        {drawPoints.map((p, i) => (
          <Marker
            key={`draw-${i}`}
            coordinate={p}
            pinColor="#f59e0b"
            anchor={{ x: 0.5, y: 0.5 }}
          />
        ))}

        {/* Draw preview line */}
        {drawPoints.length >= 2 && (
          <Polyline
            coordinates={drawPoints}
            strokeColor="#f59e0b"
            strokeWidth={2}
            lineDashPattern={[6, 4]}
          />
        )}
      </MapView>

      {/* GPS coordinates display */}
      {gpsCoords && (
        <View style={styles.coordsOverlay}>
          <Text style={styles.coordsText}>
            {gpsCoords.latitude.toFixed(6)}, {gpsCoords.longitude.toFixed(6)}
          </Text>
        </View>
      )}

      {/* Assignment info header */}
      {assignment && (
        <View style={styles.assignmentHeader}>
          <Text style={styles.assignmentHeaderText} numberOfLines={1}>
            {assignment.project_name} — {assignment.assigned_user || 'Assigned'}
          </Text>
        </View>
      )}

      {/* Layer selector */}
      <TouchableOpacity
        style={styles.layerSelector}
        onPress={() => setShowLayerPicker(true)}
      >
        <Text style={styles.layerSelectorText} numberOfLines={1}>
          Layer: {currentLayerName}
        </Text>
      </TouchableOpacity>

      {/* Toolbar */}
      <View style={styles.toolbar}>
        {(['point', 'line', 'polygon'] as DrawMode[]).map((mode) => (
          <TouchableOpacity
            key={mode}
            style={[styles.toolBtn, drawMode === mode && styles.toolBtnActive]}
            onPress={() => { setDrawMode(drawMode === mode ? 'none' : mode); setDrawPoints([]); }}
          >
            <Text style={[styles.toolBtnText, drawMode === mode && styles.toolBtnTextActive]}>
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
        {drawMode !== 'none' && (
          <TouchableOpacity
            style={styles.toolBtn}
            onPress={() => { setDrawMode('none'); setDrawPoints([]); }}
          >
            <Text style={[styles.toolBtnText, { color: '#dc2626' }]}>Cancel</Text>
          </TouchableOpacity>
        )}
        {/* Photo shortcuts when feature selected */}
        {selectedFeature && navigation && (
          <>
            <View style={styles.toolDivider} />
            <TouchableOpacity
              style={[styles.toolBtn, { backgroundColor: '#0891b2' }]}
              onPress={() => navigation.navigate('PhotoCapture', { featureId: selectedFeature.id, start360: true })}
            >
              <Text style={[styles.toolBtnText, { color: '#fff' }]}>360</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toolBtn, { backgroundColor: '#7c3aed' }]}
              onPress={() => navigation.navigate('PhotoCapture', { featureId: selectedFeature.id })}
            >
              <Text style={[styles.toolBtnText, { color: '#fff' }]}>Photo</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {drawMode !== 'none' && (
        <View style={styles.drawHint}>
          <Text style={styles.drawHintText}>
            {drawMode === 'point'
              ? 'Tap on map to place a point'
              : `Tap to add vertices (${drawPoints.length} added). Long-press to finish.`}
          </Text>
        </View>
      )}

      {/* Feature detail panel */}
      {selectedFeature && !showPropertyModal && (
        <ScrollView style={styles.featurePanel} contentContainerStyle={styles.featurePanelContent}>
          <Text style={styles.featurePanelTitle}>Feature Properties</Text>
          <Text style={styles.featurePanelInfo}>
            Status: {selectedFeature.sync_status || 'unknown'} | Type: {selectedFeature.geometry?.type}
          </Text>

          {/* Geometry measurements */}
          {Object.keys(geoMeasurements).length > 0 && (
            <View style={styles.measurementBox}>
              {Object.entries(geoMeasurements).map(([key, value]) => (
                <View key={key} style={styles.measurementRow}>
                  <Text style={styles.measurementLabel}>{key}:</Text>
                  <Text style={styles.measurementValue}>{value}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Schema-based property editing */}
          {selectedFeatureSchema.length > 0 ? (
            selectedFeatureSchema.map((attr) => (
              <View key={attr.name} style={styles.propertyRow}>
                <Text style={styles.propertyKey}>{attr.name}</Text>
                {renderPropertyInput(attr, propertyValues, setPropertyValues)}
              </View>
            ))
          ) : (
            /* Non-schema custom properties */
            Object.entries(propertyValues)
              .filter(([k]) => !k.startsWith('_'))
              .map(([key, value]) => (
                <View key={key} style={styles.propertyRow}>
                  <Text style={styles.propertyKey}>{key}</Text>
                  <TextInput
                    style={styles.propertyInput}
                    value={String(value)}
                    onChangeText={(v) => setPropertyValues({ ...propertyValues, [key]: v })}
                  />
                </View>
              ))
          )}

          {/* Photo buttons */}
          {navigation && (
            <View style={styles.photoActions}>
              <TouchableOpacity
                style={styles.photoBtn}
                onPress={() => navigation.navigate('PhotoCapture', { featureId: selectedFeature.id })}
              >
                <Text style={styles.photoBtnText}>Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.photo360Btn}
                onPress={() => navigation.navigate('PhotoCapture', { featureId: selectedFeature.id, start360: true })}
              >
                <Text style={styles.photo360BtnText}>360</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.viewPhotosBtn}
                onPress={() => {
                  loadFeaturePhotos(selectedFeature.id);
                  setShowPhotos(true);
                }}
              >
                <Text style={styles.viewPhotosBtnText}>
                  Photos ({featurePhotos.length})
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.featurePanelActions}>
            <TouchableOpacity style={styles.saveBtn} onPress={handleUpdateFeature}>
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteFeature}>
              <Text style={styles.deleteBtnText}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeBtn} onPress={() => { setSelectedFeature(null); setGeoMeasurements({}); }}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* Layer picker modal */}
      <Modal visible={showLayerPicker} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowLayerPicker(false)}>
          <View style={styles.layerPickerModal}>
            <Text style={styles.modalTitle}>Select Layer</Text>
            {/* All Layers option */}
            <TouchableOpacity
              style={[styles.layerOption, !selectedLayer && styles.layerOptionActive]}
              onPress={() => { setSelectedLayer(''); setShowLayerPicker(false); }}
            >
              <Text style={[styles.layerOptionText, !selectedLayer && styles.layerOptionTextActive]}>
                All Layers
              </Text>
            </TouchableOpacity>
            {layers.length === 0 && (
              <Text style={styles.noSchemaText}>No layers available. Create one first.</Text>
            )}
            {layers.map((l) => (
              <TouchableOpacity
                key={l.id}
                style={[styles.layerOption, selectedLayer === l.id && styles.layerOptionActive]}
                onPress={() => { setSelectedLayer(l.id); setShowLayerPicker(false); }}
              >
                <Text style={[styles.layerOptionText, selectedLayer === l.id && styles.layerOptionTextActive]}>
                  {l.name} ({l.geometry_type})
                </Text>
              </TouchableOpacity>
            ))}
            {isAdmin && (
              <TouchableOpacity style={styles.createLayerBtn} onPress={openCreateLayer}>
                <Text style={styles.createLayerBtnText}>+ Create New Layer</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Create Layer modal with schema builder */}
      <Modal visible={showCreateLayer} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Create New Layer</Text>
            <ScrollView>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Project</Text>
                {projects.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.selectOption, newLayerProject === p.id && styles.selectOptionActive]}
                    onPress={() => setNewLayerProject(p.id)}
                  >
                    <Text style={[styles.selectOptionText, newLayerProject === p.id && styles.selectOptionTextActive]}>
                      {p.name}
                    </Text>
                  </TouchableOpacity>
                ))}
                {projects.length === 0 && (
                  <Text style={styles.noSchemaText}>No projects found. Create one first.</Text>
                )}
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Layer Name</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. Roads, Buildings"
                  value={newLayerName}
                  onChangeText={setNewLayerName}
                  placeholderTextColor="#9ca3af"
                />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Geometry Type</Text>
                <View style={styles.selectContainer}>
                  {[{ key: 'Point', label: 'Point' }, { key: 'LineString', label: 'Line' }, { key: 'Polygon', label: 'Polygon' }].map((t) => (
                    <TouchableOpacity
                      key={t.key}
                      style={[styles.selectOption, newLayerType === t.key && styles.selectOptionActive]}
                      onPress={() => setNewLayerType(t.key)}
                    >
                      <Text style={[styles.selectOptionText, newLayerType === t.key && styles.selectOptionTextActive]}>
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Schema builder */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Custom Fields (Schema)</Text>
                {schemaFields.map((field, idx) => (
                  <View key={idx} style={styles.schemaFieldRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.schemaFieldName}>{field.name}</Text>
                      <Text style={styles.schemaFieldType}>
                        {field.type}{field.options ? ` (${field.options.join(', ')})` : ''}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => removeSchemaField(idx)}>
                      <Text style={styles.removeFieldBtn}>X</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                <View style={styles.addFieldSection}>
                  <TextInput
                    style={[styles.modalInput, { marginBottom: 8 }]}
                    placeholder="Field name"
                    value={newFieldName}
                    onChangeText={setNewFieldName}
                    placeholderTextColor="#9ca3af"
                  />
                  <View style={styles.selectContainer}>
                    {(['text', 'number', 'date', 'boolean', 'select'] as SchemaFieldType[]).map((t) => (
                      <TouchableOpacity
                        key={t}
                        style={[styles.selectOption, { paddingHorizontal: 8, paddingVertical: 4 }, newFieldType === t && styles.selectOptionActive]}
                        onPress={() => setNewFieldType(t)}
                      >
                        <Text style={[styles.selectOptionText, { fontSize: 11 }, newFieldType === t && styles.selectOptionTextActive]}>
                          {t}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {newFieldType === 'select' && (
                    <TextInput
                      style={[styles.modalInput, { marginTop: 8 }]}
                      placeholder="Options (comma-separated)"
                      value={newFieldOptions}
                      onChangeText={setNewFieldOptions}
                      placeholderTextColor="#9ca3af"
                    />
                  )}
                  <TouchableOpacity style={styles.addFieldBtn} onPress={addSchemaField}>
                    <Text style={styles.addFieldBtnText}>+ Add Field</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowCreateLayer(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={createLayer}>
                <Text style={styles.modalSaveText}>Create Layer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Property editor modal for new features */}
      <Modal visible={showPropertyModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Feature Properties</Text>

            {/* Show measurements for pending geometry */}
            {pendingGeometry && (
              <View style={styles.measurementBox}>
                {Object.entries(computeMeasurements(pendingGeometry)).map(([key, value]) => (
                  <View key={key} style={styles.measurementRow}>
                    <Text style={styles.measurementLabel}>{key}:</Text>
                    <Text style={styles.measurementValue}>{value}</Text>
                  </View>
                ))}
              </View>
            )}

            <ScrollView>
              {currentLayerSchema.map((attr) => (
                <View key={attr.name} style={styles.formGroup}>
                  <Text style={styles.formLabel}>{attr.name}</Text>
                  {renderPropertyInput(attr, propertyValues, setPropertyValues)}
                </View>
              ))}
              {currentLayerSchema.length === 0 && (
                <Text style={styles.noSchemaText}>
                  No attribute schema defined. Feature will be saved with geometry only.
                </Text>
              )}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => { setShowPropertyModal(false); setPendingGeometry(null); }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={saveNewFeature}>
                <Text style={styles.modalSaveText}>Save Feature</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Photos modal */}
      <Modal visible={showPhotos} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Feature Photos ({featurePhotos.length})</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {featurePhotos.length === 0 ? (
                <Text style={styles.noSchemaText}>No photos captured for this feature.</Text>
              ) : (
                featurePhotos.map((photo) => (
                  <View key={photo.id} style={styles.photoItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.photoItemText}>
                        {photo.is_360 ? '360 Photo' : 'Photo'} — {photo.captured_at || 'Unknown date'}
                      </Text>
                      <Text style={styles.photoItemSub}>
                        {photo.uploaded ? 'Uploaded' : 'Pending upload'}
                        {photo.bearing != null ? ` | Bearing: ${photo.bearing}°` : ''}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => handleDeletePhoto(photo.id)}>
                      <Text style={styles.photoDeleteBtn}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowPhotos(false)}>
                <Text style={styles.modalCancelText}>Close</Text>
              </TouchableOpacity>
              {navigation && selectedFeature && (
                <TouchableOpacity
                  style={styles.modalSaveBtn}
                  onPress={() => {
                    setShowPhotos(false);
                    navigation.navigate('PhotoViewer', { featureId: selectedFeature.id });
                  }}
                >
                  <Text style={styles.modalSaveText}>Open Viewer</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Render typed property input based on schema field type
function renderPropertyInput(
  attr: SchemaField,
  values: Record<string, string>,
  setValues: (v: Record<string, string>) => void,
) {
  const value = values[attr.name] || '';

  switch (attr.type) {
    case 'boolean':
      return (
        <View style={styles.booleanContainer}>
          <Switch
            value={value === 'true'}
            onValueChange={(v) => setValues({ ...values, [attr.name]: v ? 'true' : 'false' })}
            trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
            thumbColor={value === 'true' ? '#2563eb' : '#9ca3af'}
          />
          <Text style={styles.booleanLabel}>{value === 'true' ? 'Yes' : 'No'}</Text>
        </View>
      );
    case 'select':
      return (
        <View style={styles.selectContainer}>
          {(attr.options || []).map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[styles.selectOption, value === opt && styles.selectOptionActive]}
              onPress={() => setValues({ ...values, [attr.name]: opt })}
            >
              <Text style={[styles.selectOptionText, value === opt && styles.selectOptionTextActive]}>
                {opt}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      );
    case 'number':
      return (
        <TextInput
          style={styles.propertyInput}
          value={value}
          onChangeText={(v) => setValues({ ...values, [attr.name]: v })}
          keyboardType="numeric"
          placeholder={`Enter ${attr.name}`}
          placeholderTextColor="#9ca3af"
        />
      );
    case 'date':
      return (
        <TextInput
          style={styles.propertyInput}
          value={value}
          onChangeText={(v) => setValues({ ...values, [attr.name]: v })}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#9ca3af"
        />
      );
    default:
      return (
        <TextInput
          style={styles.propertyInput}
          value={value}
          onChangeText={(v) => setValues({ ...values, [attr.name]: v })}
          placeholder={`Enter ${attr.name}`}
          placeholderTextColor="#9ca3af"
        />
      );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  coordsOverlay: {
    position: 'absolute',
    bottom: 16,
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  coordsText: { color: '#fff', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  assignmentHeader: {
    position: 'absolute',
    top: 10,
    left: 12,
    right: 12,
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  assignmentHeaderText: { color: '#fff', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  layerSelector: {
    position: 'absolute',
    top: 50,
    left: 12,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
    maxWidth: 200,
  },
  layerSelectorText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  toolbar: {
    position: 'absolute',
    top: 50,
    right: 12,
    flexDirection: 'column',
    gap: 8,
  },
  toolBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  toolBtnActive: { backgroundColor: '#2563eb' },
  toolDivider: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 4 },
  toolBtnText: { fontSize: 13, fontWeight: '600', color: '#374151', textAlign: 'center' },
  toolBtnTextActive: { color: '#fff' },
  drawHint: {
    position: 'absolute',
    bottom: 44,
    left: 16,
    right: 16,
    backgroundColor: '#1f2937',
    padding: 12,
    borderRadius: 8,
  },
  drawHintText: { color: '#fff', fontSize: 13, textAlign: 'center' },
  featurePanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    maxHeight: '55%',
  },
  featurePanelContent: { padding: 20 },
  featurePanelTitle: { fontSize: 17, fontWeight: '700', marginBottom: 4, color: '#111827' },
  featurePanelInfo: { fontSize: 12, color: '#6b7280', marginBottom: 8 },
  measurementBox: {
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  measurementRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  measurementLabel: { fontSize: 13, fontWeight: '600', color: '#166534' },
  measurementValue: { fontSize: 13, color: '#166534', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  propertyRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  propertyKey: { width: 100, fontSize: 13, fontWeight: '500', color: '#374151' },
  propertyInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    padding: 8,
    fontSize: 14,
    color: '#111827',
  },
  booleanContainer: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 },
  booleanLabel: { fontSize: 14, color: '#374151' },
  photoActions: { flexDirection: 'row', gap: 8, marginBottom: 8, marginTop: 4 },
  photoBtn: { flex: 1, backgroundColor: '#7c3aed', padding: 10, borderRadius: 6, alignItems: 'center' },
  photoBtnText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  photo360Btn: { flex: 1, backgroundColor: '#0891b2', padding: 10, borderRadius: 6, alignItems: 'center' },
  photo360BtnText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  viewPhotosBtn: { flex: 1, backgroundColor: '#e5e7eb', padding: 10, borderRadius: 6, alignItems: 'center' },
  viewPhotosBtnText: { color: '#374151', fontWeight: '600', fontSize: 12 },
  featurePanelActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  saveBtn: { flex: 1, backgroundColor: '#2563eb', padding: 10, borderRadius: 6, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '600' },
  deleteBtn: { flex: 1, backgroundColor: '#dc2626', padding: 10, borderRadius: 6, alignItems: 'center' },
  deleteBtnText: { color: '#fff', fontWeight: '600' },
  closeBtn: { flex: 1, backgroundColor: '#e5e7eb', padding: 10, borderRadius: 6, alignItems: 'center' },
  closeBtnText: { color: '#374151', fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
    maxHeight: '80%',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16, color: '#111827' },
  formGroup: { marginBottom: 16 },
  formLabel: { fontSize: 13, fontWeight: '500', color: '#374151', marginBottom: 4 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    color: '#111827',
  },
  selectContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  selectOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d1d5db',
    marginBottom: 4,
  },
  selectOptionActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  selectOptionText: { fontSize: 13, color: '#374151' },
  selectOptionTextActive: { color: '#fff' },
  noSchemaText: { color: '#6b7280', fontSize: 14, fontStyle: 'italic' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalCancelBtn: { flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#e5e7eb', alignItems: 'center' },
  modalCancelText: { fontWeight: '600', color: '#374151' },
  modalSaveBtn: { flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#2563eb', alignItems: 'center' },
  modalSaveText: { fontWeight: '600', color: '#fff' },
  layerPickerModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
  },
  layerOption: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 6,
    backgroundColor: '#f3f4f6',
  },
  layerOptionActive: { backgroundColor: '#dbeafe' },
  layerOptionText: { fontSize: 15, color: '#374151', fontWeight: '500' },
  layerOptionTextActive: { color: '#2563eb', fontWeight: '700' },
  createLayerBtn: {
    marginTop: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#2563eb',
    alignItems: 'center',
  },
  createLayerBtnText: { fontSize: 15, color: '#fff', fontWeight: '600' },
  // Schema builder styles
  schemaFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
  },
  schemaFieldName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  schemaFieldType: { fontSize: 12, color: '#6b7280' },
  removeFieldBtn: { color: '#dc2626', fontWeight: '700', fontSize: 16, paddingHorizontal: 8 },
  addFieldSection: {
    marginTop: 8,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  addFieldBtn: {
    marginTop: 8,
    padding: 10,
    backgroundColor: '#16a34a',
    borderRadius: 6,
    alignItems: 'center',
  },
  addFieldBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  // Photo list styles
  photoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  photoItemText: { fontSize: 14, fontWeight: '500', color: '#111827' },
  photoItemSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  photoDeleteBtn: { color: '#dc2626', fontWeight: '600', fontSize: 13, paddingHorizontal: 8 },
});
