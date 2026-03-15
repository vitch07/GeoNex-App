import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import MapView, { Marker, Polyline, Polygon, MapPressEvent, LongPressEvent } from 'react-native-maps';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../config/api';
import {
  saveFeatureLocally,
  getLocalFeatures,
  deleteLocalFeature,
  getCachedLayers,
  cacheLayers,
} from '../database/LocalDatabase';

type DrawMode = 'none' | 'point' | 'line' | 'polygon';

interface MapScreenProps {
  route?: any;
  navigation?: any;
}

export default function MapScreen({ route, navigation }: MapScreenProps) {
  const assignment = route?.params?.assignment;
  const [drawMode, setDrawMode] = useState<DrawMode>('none');
  const [drawPoints, setDrawPoints] = useState<{ latitude: number; longitude: number }[]>([]);
  const [features, setFeatures] = useState<any[]>([]);
  const [layers, setLayers] = useState<any[]>([]);
  const [selectedLayer, setSelectedLayer] = useState<string>('');
  const [selectedFeature, setSelectedFeature] = useState<any>(null);
  const [showPropertyModal, setShowPropertyModal] = useState(false);
  const [propertyValues, setPropertyValues] = useState<Record<string, string>>({});
  const [pendingGeometry, setPendingGeometry] = useState<any>(null);
  const [showLayerPicker, setShowLayerPicker] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  // Create layer state
  const [showCreateLayer, setShowCreateLayer] = useState(false);
  const [newLayerName, setNewLayerName] = useState('');
  const [newLayerType, setNewLayerType] = useState('Point');
  const [projects, setProjects] = useState<any[]>([]);
  const [newLayerProject, setNewLayerProject] = useState('');
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    loadData();
    checkRole();
  }, []);

  const checkRole = async () => {
    const user = JSON.parse((await AsyncStorage.getItem('geonex_user')) || '{}');
    setIsAdmin(user.role === 'admin');
  };

  const loadData = async () => {
    try {
      // Try to fetch layers from server first
      const res = await api.get<any>('/layers');
      const serverLayers = Array.isArray(res) ? res : (res.data || []);
      if (serverLayers.length > 0) {
        await cacheLayers(serverLayers);
        setLayers(serverLayers);
        if (!selectedLayer && serverLayers.length > 0) setSelectedLayer(serverLayers[0].id);
      } else {
        const cachedLayers = await getCachedLayers();
        setLayers(cachedLayers);
        if (cachedLayers.length > 0 && !selectedLayer) setSelectedLayer(cachedLayers[0].id);
      }
    } catch {
      const cachedLayers = await getCachedLayers();
      setLayers(cachedLayers);
      if (cachedLayers.length > 0 && !selectedLayer) setSelectedLayer(cachedLayers[0].id);
    }
    const localFeatures = await getLocalFeatures();
    setFeatures(localFeatures);
  };

  const loadProjects = async () => {
    try {
      const res = await api.get<any>('/projects');
      setProjects(Array.isArray(res) ? res : (res.data || []));
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
    setShowCreateLayer(true);
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
        schema: [],
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
      showPropertyEditor({ type: 'Point', coordinates: [longitude, latitude] });
      setDrawMode('none');
      return;
    }

    setDrawPoints((prev) => [...prev, { latitude, longitude }]);
  };

  const handleMapLongPress = (e: LongPressEvent) => {
    if (drawMode === 'line' && drawPoints.length >= 2) {
      const coords = drawPoints.map((p) => [p.longitude, p.latitude]);
      showPropertyEditor({ type: 'LineString', coordinates: coords });
      setDrawPoints([]);
      setDrawMode('none');
    } else if (drawMode === 'polygon' && drawPoints.length >= 3) {
      const coords = drawPoints.map((p) => [p.longitude, p.latitude]);
      coords.push(coords[0]);
      showPropertyEditor({ type: 'Polygon', coordinates: [coords] });
      setDrawPoints([]);
      setDrawMode('none');
    }
  };

  const showPropertyEditor = (geometry: any) => {
    setPendingGeometry(geometry);
    setPropertyValues({});
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
    await loadData();
  };

  // Convert GeoJSON coords to map coords
  const toLatLng = (coords: number[]) => ({ latitude: coords[1], longitude: coords[0] });

  // Render features on map
  const renderFeatures = () => {
    return features.map((f) => {
      const geo = f.geometry;
      const syncColor = f.sync_status === 'new' ? '#f59e0b' : f.sync_status === 'modified' ? '#f97316' : '#2563eb';

      if (geo.type === 'Point') {
        return (
          <Marker
            key={f.id}
            coordinate={toLatLng(geo.coordinates)}
            pinColor={syncColor}
            onPress={() => {
              setSelectedFeature(f);
              setPropertyValues(f.properties || {});
            }}
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
            onPress={() => {
              setSelectedFeature(f);
              setPropertyValues(f.properties || {});
            }}
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
            onPress={() => {
              setSelectedFeature(f);
              setPropertyValues(f.properties || {});
            }}
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

  const currentLayerSchema = layers.find((l) => l.id === selectedLayer)?.schema || [];
  const currentLayerName = layers.find((l) => l.id === selectedLayer)?.name || 'No Layer';

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
        {/* 360 Photo shortcut - only when feature selected and in assignment stack */}
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
        <View style={styles.featurePanel}>
          <Text style={styles.featurePanelTitle}>Feature Properties</Text>
          <Text style={styles.featurePanelInfo}>
            Status: {selectedFeature.sync_status || 'unknown'} | Type: {selectedFeature.geometry?.type}
          </Text>
          {Object.entries(propertyValues)
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
            ))}

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
                onPress={() => navigation.navigate('PhotoViewer', { featureId: selectedFeature.id })}
              >
                <Text style={styles.viewPhotosBtnText}>View</Text>
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
            <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedFeature(null)}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Layer picker modal */}
      <Modal visible={showLayerPicker} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowLayerPicker(false)}>
          <View style={styles.layerPickerModal}>
            <Text style={styles.modalTitle}>Select Layer</Text>
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

      {/* Create Layer modal */}
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
            <ScrollView>
              {currentLayerSchema.map((attr: any) => (
                <View key={attr.name} style={styles.formGroup}>
                  <Text style={styles.formLabel}>
                    {attr.name} {attr.required && '*'}
                  </Text>
                  {attr.type === 'select' ? (
                    <View style={styles.selectContainer}>
                      {(attr.options || []).map((opt: string) => (
                        <TouchableOpacity
                          key={opt}
                          style={[
                            styles.selectOption,
                            propertyValues[attr.name] === opt && styles.selectOptionActive,
                          ]}
                          onPress={() => setPropertyValues({ ...propertyValues, [attr.name]: opt })}
                        >
                          <Text
                            style={[
                              styles.selectOptionText,
                              propertyValues[attr.name] === opt && styles.selectOptionTextActive,
                            ]}
                          >
                            {opt}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : (
                    <TextInput
                      style={styles.modalInput}
                      placeholder={`Enter ${attr.name}`}
                      value={propertyValues[attr.name] || ''}
                      onChangeText={(v) => setPropertyValues({ ...propertyValues, [attr.name]: v })}
                      keyboardType={attr.type === 'number' ? 'numeric' : 'default'}
                      placeholderTextColor="#9ca3af"
                    />
                  )}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
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
    bottom: 24,
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
    padding: 20,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    maxHeight: '50%',
  },
  featurePanelTitle: { fontSize: 17, fontWeight: '700', marginBottom: 4, color: '#111827' },
  featurePanelInfo: { fontSize: 12, color: '#6b7280', marginBottom: 12 },
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
    maxHeight: '70%',
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
});
