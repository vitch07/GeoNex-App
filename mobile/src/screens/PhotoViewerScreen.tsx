import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  Dimensions,
  Modal,
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface PhotoViewerScreenProps {
  route: any;
  navigation: any;
}

export default function PhotoViewerScreen({ route, navigation }: PhotoViewerScreenProps) {
  const { photos = [], featureId, is360 = false } = route.params || {};
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  const getBearingLabel = (bearing: number): string => {
    const labels: Record<number, string> = {
      0: 'North', 45: 'North-East', 90: 'East', 135: 'South-East',
      180: 'South', 225: 'South-West', 270: 'West', 315: 'North-West',
    };
    return labels[bearing] || `${bearing}°`;
  };

  if (photos.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backBtn}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Photos</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No photos available</Text>
        </View>
      </View>
    );
  }

  const selectedPhoto = photos[selectedIndex];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backBtn}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>
          {is360 ? '360° View' : 'Photos'} ({selectedIndex + 1}/{photos.length})
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Main photo view */}
      <TouchableOpacity
        style={styles.mainPhotoContainer}
        onPress={() => setFullscreen(true)}
        activeOpacity={0.9}
      >
        <Image
          source={{ uri: selectedPhoto.uri || selectedPhoto.file_path }}
          style={styles.mainPhoto}
          resizeMode="contain"
        />
        {is360 && selectedPhoto.bearing !== undefined && (
          <View style={styles.bearingOverlay}>
            <Text style={styles.bearingText}>
              {getBearingLabel(selectedPhoto.bearing)}
            </Text>
            <Text style={styles.bearingDegree}>{selectedPhoto.bearing}°</Text>
          </View>
        )}
        <View style={styles.tapHint}>
          <Text style={styles.tapHintText}>Tap for fullscreen</Text>
        </View>
      </TouchableOpacity>

      {/* 360 compass navigation */}
      {is360 && photos.length > 1 && (
        <View style={styles.compassNav}>
          <Text style={styles.compassTitle}>360° Navigation</Text>
          <View style={styles.compassContainer}>
            {/* Compass circle */}
            <View style={styles.compassCircle}>
              {photos.map((photo: any, index: number) => {
                const bearing = photo.bearing || 0;
                const angleRad = (bearing - 90) * (Math.PI / 180);
                const radius = 60;
                const x = Math.cos(angleRad) * radius;
                const y = Math.sin(angleRad) * radius;

                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.compassDot,
                      {
                        transform: [{ translateX: x }, { translateY: y }],
                      },
                      selectedIndex === index && styles.compassDotActive,
                    ]}
                    onPress={() => setSelectedIndex(index)}
                  >
                    <Text style={[
                      styles.compassDotLabel,
                      selectedIndex === index && styles.compassDotLabelActive,
                    ]}>
                      {getBearingLabel(bearing).substring(0, 2)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <Text style={styles.compassCenter}>N</Text>
            </View>
          </View>
        </View>
      )}

      {/* Photo strip */}
      <View style={styles.stripContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {photos.map((photo: any, index: number) => (
            <TouchableOpacity
              key={photo.id || index}
              style={[styles.stripItem, selectedIndex === index && styles.stripItemActive]}
              onPress={() => setSelectedIndex(index)}
            >
              <Image
                source={{ uri: photo.uri || photo.file_path }}
                style={styles.stripThumb}
              />
              {is360 && (
                <Text style={styles.stripLabel}>
                  {getBearingLabel(photo.bearing || 0).substring(0, 2)}
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Photo metadata */}
      <View style={styles.metadataBar}>
        {selectedPhoto.latitude ? (
          <Text style={styles.metadataText}>
            Location: {selectedPhoto.latitude?.toFixed(5)}, {selectedPhoto.longitude?.toFixed(5)}
          </Text>
        ) : null}
        {selectedPhoto.captured_at && (
          <Text style={styles.metadataText}>
            Captured: {new Date(selectedPhoto.captured_at).toLocaleString()}
          </Text>
        )}
      </View>

      {/* Fullscreen modal */}
      <Modal visible={fullscreen} transparent animationType="fade">
        <View style={styles.fullscreenContainer}>
          <TouchableOpacity
            style={styles.fullscreenClose}
            onPress={() => setFullscreen(false)}
          >
            <Text style={styles.fullscreenCloseText}>Close</Text>
          </TouchableOpacity>
          <Image
            source={{ uri: selectedPhoto.uri || selectedPhoto.file_path }}
            style={styles.fullscreenImage}
            resizeMode="contain"
          />
          {/* Swipe left/right */}
          <View style={styles.fullscreenNav}>
            <TouchableOpacity
              style={styles.fullscreenNavBtn}
              onPress={() => setSelectedIndex(Math.max(0, selectedIndex - 1))}
              disabled={selectedIndex === 0}
            >
              <Text style={styles.fullscreenNavText}>{'<'}</Text>
            </TouchableOpacity>
            <Text style={styles.fullscreenCounter}>
              {selectedIndex + 1} / {photos.length}
              {is360 && selectedPhoto.bearing !== undefined && ` - ${getBearingLabel(selectedPhoto.bearing)}`}
            </Text>
            <TouchableOpacity
              style={styles.fullscreenNavBtn}
              onPress={() => setSelectedIndex(Math.min(photos.length - 1, selectedIndex + 1))}
              disabled={selectedIndex === photos.length - 1}
            >
              <Text style={styles.fullscreenNavText}>{'>'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 48,
    backgroundColor: '#1f2937',
  },
  backBtn: { fontSize: 16, color: '#60a5fa', fontWeight: '600' },
  title: { fontSize: 17, fontWeight: '700', color: '#fff' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#6b7280', fontSize: 16 },
  mainPhotoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  mainPhoto: { width: '100%', height: '100%' },
  bearingOverlay: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  bearingText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  bearingDegree: { color: '#9ca3af', fontSize: 11 },
  tapHint: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  tapHintText: { color: '#9ca3af', fontSize: 11 },
  compassNav: {
    backgroundColor: '#1f2937',
    padding: 16,
    alignItems: 'center',
  },
  compassTitle: { color: '#9ca3af', fontSize: 12, marginBottom: 8 },
  compassContainer: { alignItems: 'center', justifyContent: 'center' },
  compassCircle: {
    width: 160,
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 80,
    borderWidth: 1,
    borderColor: '#374151',
  },
  compassDot: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
  },
  compassDotActive: { backgroundColor: '#2563eb' },
  compassDotLabel: { color: '#9ca3af', fontSize: 10, fontWeight: '700' },
  compassDotLabelActive: { color: '#fff' },
  compassCenter: { color: '#6b7280', fontSize: 12, fontWeight: '700' },
  stripContainer: {
    backgroundColor: '#1f2937',
    paddingVertical: 8,
  },
  strip: { paddingHorizontal: 12, gap: 8 },
  stripItem: {
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  stripItemActive: { borderColor: '#2563eb' },
  stripThumb: { width: 56, height: 56 },
  stripLabel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: '#fff',
    fontSize: 9,
    textAlign: 'center',
    paddingVertical: 1,
    fontWeight: '700',
  },
  metadataBar: {
    backgroundColor: '#1f2937',
    paddingHorizontal: 16,
    paddingVertical: 8,
    paddingBottom: 24,
  },
  metadataText: { color: '#6b7280', fontSize: 11, marginBottom: 2 },
  fullscreenContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
  },
  fullscreenClose: {
    position: 'absolute',
    top: 48,
    right: 16,
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  fullscreenCloseText: { color: '#fff', fontWeight: '600' },
  fullscreenImage: { width: '100%', height: '80%' },
  fullscreenNav: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  fullscreenNavBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenNavText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  fullscreenCounter: { color: '#fff', fontSize: 14 },
});
