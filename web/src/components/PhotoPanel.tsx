import { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import PanoramaViewer from './PanoramaViewer';

interface PhotoPanelProps {
  featureId: string;
  onClose: () => void;
}

export default function PhotoPanel({ featureId, onClose }: PhotoPanelProps) {
  const [photos, setPhotos] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showViewer, setShowViewer] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadIs360, setUploadIs360] = useState(false);

  useEffect(() => {
    loadPhotos();
  }, [featureId]);

  const loadPhotos = async () => {
    try {
      const res = await api.get(`/photos?feature_id=${featureId}`);
      setPhotos(res.data.data || []);
    } catch (error) {
      console.error('Failed to load photos:', error);
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const formData = new FormData();
        formData.append('photo', files[i]);
        formData.append('feature_id', featureId);
        formData.append('is_360', uploadIs360.toString());
        formData.append('metadata', JSON.stringify({
          bearing: uploadIs360 ? (i * 45) % 360 : undefined,
          original_name: files[i].name,
        }));

        await api.post('/photos/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        } as any);
      }
      loadPhotos();
    } catch (error) {
      console.error('Failed to upload photo:', error);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const deletePhoto = async (photoId: string) => {
    if (!confirm('Delete this photo?')) return;
    try {
      await api.delete(`/photos/${photoId}`);
      loadPhotos();
    } catch (error) {
      console.error('Failed to delete photo:', error);
    }
  };

  const openViewer = (index: number) => {
    setViewerIndex(index);
    setShowViewer(true);
  };

  const has360Photos = photos.some((p) => p.is_360);

  return (
    <>
      <div className="feature-panel" style={{ width: 400 }}>
        <h3>
          <span>Photos ({photos.length})</span>
          <button className="btn-secondary" onClick={onClose} style={{ padding: '4px 8px' }}>
            X
          </button>
        </h3>

        {/* Upload controls */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={uploadIs360}
                onChange={(e) => setUploadIs360(e.target.checked)}
              />
              360° photo
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn-primary"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{ flex: 1, fontSize: 13 }}
            >
              {uploading ? 'Uploading...' : uploadIs360 ? 'Upload 360° Photo' : 'Upload Photo'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleUpload}
              style={{ display: 'none' }}
            />
          </div>
        </div>

        {/* Quick view buttons for 360 */}
        {has360Photos && (
          <div style={{ marginBottom: 12 }}>
            <button
              className="btn-secondary"
              onClick={() => {
                const first360 = photos.findIndex((p) => p.is_360);
                if (first360 >= 0) openViewer(first360);
              }}
              style={{ width: '100%', background: '#0891b2', color: '#fff', fontSize: 13 }}
            >
              Open 360° Viewer
            </button>
          </div>
        )}

        {/* Photo grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 8,
          maxHeight: 'calc(100vh - 320px)',
          overflowY: 'auto',
        }}>
          {photos.map((photo, index) => (
            <div
              key={photo.id}
              style={{
                position: 'relative',
                borderRadius: 8,
                overflow: 'hidden',
                border: '1px solid var(--gray-200)',
                cursor: 'pointer',
                aspectRatio: '1',
              }}
            >
              <img
                src={`/uploads/${photo.file_path.replace(/\\/g, '/').split('/').pop()}`}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onClick={() => openViewer(index)}
              />
              {photo.is_360 && (
                <span style={{
                  position: 'absolute',
                  top: 4,
                  left: 4,
                  background: '#0891b2',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: 4,
                }}>
                  360°
                </span>
              )}
              {photo.metadata?.bearing !== undefined && (
                <span style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  background: 'rgba(0,0,0,0.6)',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: 4,
                }}>
                  {photo.metadata.bearing}°
                </span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); deletePhoto(photo.id); }}
                style={{
                  position: 'absolute',
                  bottom: 4,
                  right: 4,
                  background: 'rgba(220,38,38,0.8)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  padding: '2px 6px',
                  fontSize: 10,
                  cursor: 'pointer',
                }}
              >
                Delete
              </button>
              <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                background: 'linear-gradient(transparent, rgba(0,0,0,0.5))',
                padding: '12px 6px 4px',
              }}>
                <span style={{ color: '#fff', fontSize: 10 }}>
                  {new Date(photo.captured_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>

        {photos.length === 0 && (
          <p style={{ color: 'var(--gray-500)', textAlign: 'center', marginTop: 20, fontSize: 14 }}>
            No photos yet. Upload photos using the button above.
          </p>
        )}
      </div>

      {/* 360 Viewer Modal */}
      {showViewer && (
        <PanoramaViewer
          imageUrl=""
          is360={photos[viewerIndex]?.is_360 || false}
          photos={photos}
          onClose={() => setShowViewer(false)}
        />
      )}
    </>
  );
}
