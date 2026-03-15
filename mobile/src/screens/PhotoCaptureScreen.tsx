import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';
import { savePhotoLocally } from '../database/LocalDatabase';

interface PhotoCaptureScreenProps {
  route: any;
  navigation: any;
}

interface CapturedPhoto {
  id: string;
  uri: string;
  fileName: string;
  bearing: number;
  latitude?: number;
  longitude?: number;
}

export default function PhotoCaptureScreen({ route, navigation }: PhotoCaptureScreenProps) {
  const { featureId, start360 } = route.params || {};
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [is360Mode, setIs360Mode] = useState(!!start360);
  const [capturing, setCapturing] = useState(false);
  const [currentBearing, setCurrentBearing] = useState(0);
  const bearingAngles = [0, 45, 90, 135, 180, 225, 270, 315];

  const getCurrentLocation = async (): Promise<{ latitude: number; longitude: number }> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return { latitude: 0, longitude: 0 };

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
    } catch {
      return { latitude: 0, longitude: 0 };
    }
  };

  const capturePhoto = async () => {
    setCapturing(true);
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Camera permission is required to capture photos');
        setCapturing(false);
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        exif: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        setCapturing(false);
        return;
      }

      const asset = result.assets[0];
      const location = await getCurrentLocation();

      const photo: CapturedPhoto = {
        id: Crypto.randomUUID(),
        uri: asset.uri,
        fileName: asset.fileName || `photo_${Date.now()}.jpg`,
        bearing: is360Mode ? bearingAngles[photos.length % bearingAngles.length] : 0,
        latitude: location.latitude,
        longitude: location.longitude,
      };

      setPhotos((prev) => [...prev, photo]);

      if (is360Mode) {
        const nextIndex = photos.length + 1;
        if (nextIndex < bearingAngles.length) {
          setCurrentBearing(bearingAngles[nextIndex]);
        } else {
          Alert.alert('360 Capture Complete', 'All 8 directions captured!');
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to capture photo');
    } finally {
      setCapturing(false);
    }
  };

  const pickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Media library permission is required');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      allowsMultipleSelection: true,
      selectionLimit: is360Mode ? 8 : 5,
    });

    if (result.canceled || !result.assets) return;

    const newPhotos: CapturedPhoto[] = result.assets.map((asset, index) => ({
      id: Crypto.randomUUID(),
      uri: asset.uri,
      fileName: asset.fileName || `photo_${Date.now()}_${index}.jpg`,
      bearing: is360Mode ? bearingAngles[index % bearingAngles.length] : 0,
    }));

    setPhotos((prev) => [...prev, ...newPhotos]);
  };

  const removePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const handleSave = async () => {
    if (photos.length === 0) {
      Alert.alert('No Photos', 'Please capture at least one photo');
      return;
    }

    // Save photos to local database
    if (featureId) {
      for (const photo of photos) {
        await savePhotoLocally({
          id: photo.id,
          feature_id: featureId,
          file_path: photo.uri,
          is_360: is360Mode,
          metadata: {
            bearing: photo.bearing,
            latitude: photo.latitude,
            longitude: photo.longitude,
            fileName: photo.fileName,
          },
        });
      }
    }

    Alert.alert('Saved', `${photos.length} photo(s) saved successfully`, [
      { text: 'OK', onPress: () => navigation.goBack() },
    ]);
  };

  const getBearingLabel = (bearing: number): string => {
    const labels: Record<number, string> = {
      0: 'N', 45: 'NE', 90: 'E', 135: 'SE',
      180: 'S', 225: 'SW', 270: 'W', 315: 'NW',
    };
    return labels[bearing] || `${bearing}°`;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backBtn}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>
          {is360Mode ? '360° Photo Capture' : 'Photo Capture'}
        </Text>
        <TouchableOpacity onPress={handleSave}>
          <Text style={styles.saveHeaderBtn}>Done</Text>
        </TouchableOpacity>
      </View>

      {/* Mode toggle */}
      <View style={styles.modeToggle}>
        <TouchableOpacity
          style={[styles.modeBtn, !is360Mode && styles.modeBtnActive]}
          onPress={() => setIs360Mode(false)}
        >
          <Text style={[styles.modeBtnText, !is360Mode && styles.modeBtnTextActive]}>
            Standard
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, is360Mode && styles.modeBtnActive]}
          onPress={() => { setIs360Mode(true); setPhotos([]); setCurrentBearing(0); }}
        >
          <Text style={[styles.modeBtnText, is360Mode && styles.modeBtnTextActive]}>
            360° Panorama
          </Text>
        </TouchableOpacity>
      </View>

      {/* 360 direction guide */}
      {is360Mode && (
        <View style={styles.directionGuide}>
          <Text style={styles.directionTitle}>
            Capture photos in all 8 directions
          </Text>
          <View style={styles.compassGrid}>
            {bearingAngles.map((angle, idx) => {
              const captured = photos.length > idx;
              return (
                <View
                  key={angle}
                  style={[
                    styles.compassPoint,
                    captured && styles.compassPointCaptured,
                    photos.length === idx && styles.compassPointNext,
                  ]}
                >
                  <Text style={[
                    styles.compassLabel,
                    captured && styles.compassLabelCaptured,
                  ]}>
                    {getBearingLabel(angle)}
                  </Text>
                </View>
              );
            })}
          </View>
          <Text style={styles.progressText}>
            {photos.length} / 8 directions captured
          </Text>
        </View>
      )}

      {/* Photo grid */}
      <ScrollView style={styles.photoGrid} contentContainerStyle={styles.photoGridContent}>
        {photos.map((photo) => (
          <View key={photo.id} style={styles.photoCard}>
            <Image source={{ uri: photo.uri }} style={styles.photoThumb} />
            <View style={styles.photoInfo}>
              {is360Mode && (
                <Text style={styles.photoBearing}>
                  {getBearingLabel(photo.bearing)}
                </Text>
              )}
              {photo.latitude ? (
                <Text style={styles.photoCoords}>
                  {photo.latitude.toFixed(5)}, {photo.longitude?.toFixed(5)}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              style={styles.removeBtn}
              onPress={() => removePhoto(photo.id)}
            >
              <Text style={styles.removeBtnText}>X</Text>
            </TouchableOpacity>
          </View>
        ))}
        {photos.length === 0 && (
          <Text style={styles.emptyText}>
            No photos captured yet. Use the buttons below.
          </Text>
        )}
      </ScrollView>

      {/* Capture buttons */}
      <View style={styles.captureBar}>
        <TouchableOpacity style={styles.galleryBtn} onPress={pickFromGallery}>
          <Text style={styles.galleryBtnText}>Gallery</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.captureBtn, capturing && styles.captureBtnDisabled]}
          onPress={capturePhoto}
          disabled={capturing}
        >
          {capturing ? (
            <ActivityIndicator color="#fff" size="large" />
          ) : (
            <View style={styles.captureInner}>
              {is360Mode && (
                <Text style={styles.captureBearingText}>
                  {getBearingLabel(currentBearing)}
                </Text>
              )}
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>
            Save ({photos.length})
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 48,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backBtn: { fontSize: 16, color: '#2563eb', fontWeight: '600' },
  title: { fontSize: 17, fontWeight: '700', color: '#111827' },
  saveHeaderBtn: { fontSize: 16, color: '#2563eb', fontWeight: '600' },
  modeToggle: {
    flexDirection: 'row',
    margin: 16,
    backgroundColor: '#e5e7eb',
    borderRadius: 8,
    padding: 3,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
  },
  modeBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  modeBtnText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  modeBtnTextActive: { color: '#2563eb' },
  directionGuide: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  directionTitle: { fontSize: 14, color: '#374151', fontWeight: '500', marginBottom: 12 },
  compassGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  compassPoint: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
  },
  compassPointCaptured: { borderColor: '#16a34a', backgroundColor: '#dcfce7' },
  compassPointNext: { borderColor: '#2563eb', borderWidth: 3 },
  compassLabel: { fontSize: 13, fontWeight: '700', color: '#6b7280' },
  compassLabelCaptured: { color: '#16a34a' },
  progressText: { fontSize: 13, color: '#6b7280', marginTop: 8 },
  photoGrid: { flex: 1 },
  photoGridContent: { padding: 16, gap: 8 },
  photoCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  photoThumb: { width: 70, height: 70 },
  photoInfo: { flex: 1, padding: 10 },
  photoBearing: { fontSize: 15, fontWeight: '700', color: '#2563eb' },
  photoCoords: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  removeBtn: { padding: 12, marginRight: 4 },
  removeBtnText: { fontSize: 16, color: '#dc2626', fontWeight: '700' },
  emptyText: { textAlign: 'center', color: '#9ca3af', marginTop: 40, fontSize: 15 },
  captureBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    padding: 16,
    paddingBottom: 32,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  galleryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#e5e7eb',
    borderRadius: 8,
  },
  galleryBtnText: { fontWeight: '600', color: '#374151' },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#93c5fd',
  },
  captureBtnDisabled: { opacity: 0.5 },
  captureInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureBearingText: { fontSize: 14, fontWeight: '800', color: '#2563eb' },
  saveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#16a34a',
    borderRadius: 8,
  },
  saveBtnText: { fontWeight: '600', color: '#fff' },
});
