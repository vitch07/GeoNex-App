import { useEffect, useRef, useState } from 'react';

interface PanoramaViewerProps {
  imageUrl: string;
  is360: boolean;
  photos?: Array<{
    id: string;
    file_path: string;
    is_360: boolean;
    metadata: any;
    captured_at: string;
  }>;
  onClose: () => void;
}

export default function PanoramaViewer({ imageUrl, is360, photos = [], onClose }: PanoramaViewerProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [viewerInstance, setViewerInstance] = useState<any>(null);

  const currentImage = photos.length > 0
    ? `/uploads/${photos[selectedIndex].file_path.replace(/\\/g, '/').split('/').pop()}`
    : imageUrl;

  const currentIs360 = photos.length > 0 ? photos[selectedIndex].is_360 : is360;

  useEffect(() => {
    if (!viewerRef.current || !currentIs360) return;

    // Dynamically load Pannellum CSS and JS
    const loadPannellum = async () => {
      // Add CSS if not already loaded
      if (!document.getElementById('pannellum-css')) {
        const link = document.createElement('link');
        link.id = 'pannellum-css';
        link.rel = 'stylesheet';
        link.href = 'https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css';
        document.head.appendChild(link);
      }

      // Add JS if not already loaded
      if (!(window as any).pannellum) {
        await new Promise<void>((resolve) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js';
          script.onload = () => resolve();
          document.head.appendChild(script);
        });
      }

      // Destroy previous instance
      if (viewerInstance) {
        try { viewerInstance.destroy(); } catch { /* ignore */ }
      }

      // Create viewer
      const viewer = (window as any).pannellum.viewer(viewerRef.current, {
        type: 'equirectangular',
        panorama: currentImage,
        autoLoad: true,
        showControls: true,
        showFullscreenCtrl: true,
        showZoomCtrl: true,
        compass: true,
        hfov: 100,
        pitch: 0,
        yaw: 0,
        mouseZoom: true,
        hotSpotDebug: false,
      });

      setViewerInstance(viewer);
    };

    loadPannellum();

    return () => {
      if (viewerInstance) {
        try { viewerInstance.destroy(); } catch { /* ignore */ }
      }
    };
  }, [currentImage, currentIs360]);

  const getBearingLabel = (metadata: any): string => {
    const bearing = metadata?.bearing;
    if (bearing === undefined) return '';
    const labels: Record<number, string> = {
      0: 'North', 45: 'NE', 90: 'East', 135: 'SE',
      180: 'South', 225: 'SW', 270: 'West', 315: 'NW',
    };
    return labels[bearing] || `${bearing}°`;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '90vw', maxWidth: 1000, height: '80vh', padding: 0, display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div style={{
          padding: '12px 20px',
          borderBottom: '1px solid var(--gray-200)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h3 style={{ margin: 0 }}>
            {currentIs360 ? '360° Photo Viewer' : 'Photo Viewer'}
            {photos.length > 1 && ` (${selectedIndex + 1}/${photos.length})`}
          </h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {photos[selectedIndex]?.metadata?.bearing !== undefined && (
              <span className="badge badge-in_progress">
                {getBearingLabel(photos[selectedIndex].metadata)}
              </span>
            )}
            <button className="btn-secondary" onClick={onClose} style={{ padding: '6px 12px' }}>
              Close
            </button>
          </div>
        </div>

        {/* Viewer area */}
        <div style={{ flex: 1, position: 'relative', background: '#111' }}>
          {currentIs360 ? (
            <div ref={viewerRef} style={{ width: '100%', height: '100%' }} />
          ) : (
            <div style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}>
              <img
                src={currentImage}
                alt="Photo"
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                }}
              />
            </div>
          )}

          {/* Nav arrows for multiple photos */}
          {photos.length > 1 && (
            <>
              <button
                onClick={() => setSelectedIndex(Math.max(0, selectedIndex - 1))}
                disabled={selectedIndex === 0}
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'rgba(0,0,0,0.6)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '50%',
                  width: 40,
                  height: 40,
                  fontSize: 20,
                  cursor: 'pointer',
                  opacity: selectedIndex === 0 ? 0.3 : 1,
                }}
              >
                {'<'}
              </button>
              <button
                onClick={() => setSelectedIndex(Math.min(photos.length - 1, selectedIndex + 1))}
                disabled={selectedIndex === photos.length - 1}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'rgba(0,0,0,0.6)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '50%',
                  width: 40,
                  height: 40,
                  fontSize: 20,
                  cursor: 'pointer',
                  opacity: selectedIndex === photos.length - 1 ? 0.3 : 1,
                }}
              >
                {'>'}
              </button>
            </>
          )}
        </div>

        {/* Thumbnail strip */}
        {photos.length > 1 && (
          <div style={{
            padding: '8px 12px',
            borderTop: '1px solid var(--gray-200)',
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            background: '#f9fafb',
          }}>
            {photos.map((photo, index) => (
              <div
                key={photo.id}
                onClick={() => setSelectedIndex(index)}
                style={{
                  flexShrink: 0,
                  width: 64,
                  height: 64,
                  borderRadius: 6,
                  overflow: 'hidden',
                  border: selectedIndex === index ? '2px solid var(--primary)' : '2px solid transparent',
                  cursor: 'pointer',
                  position: 'relative',
                }}
              >
                <img
                  src={`/uploads/${photo.file_path.replace(/\\/g, '/').split('/').pop()}`}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                {photo.is_360 && (
                  <span style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: 'rgba(0,0,0,0.7)',
                    color: '#fff',
                    fontSize: 9,
                    textAlign: 'center',
                    padding: '1px 0',
                    fontWeight: 700,
                  }}>
                    360°
                  </span>
                )}
                {photo.metadata?.bearing !== undefined && (
                  <span style={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    background: 'rgba(37,99,235,0.8)',
                    color: '#fff',
                    fontSize: 8,
                    padding: '1px 4px',
                    borderRadius: 3,
                    fontWeight: 700,
                  }}>
                    {getBearingLabel(photo.metadata).substring(0, 2)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Metadata bar */}
        <div style={{
          padding: '8px 20px',
          borderTop: '1px solid var(--gray-200)',
          fontSize: 12,
          color: 'var(--gray-500)',
          display: 'flex',
          gap: 16,
          background: '#fff',
          borderRadius: '0 0 12px 12px',
        }}>
          {photos[selectedIndex]?.captured_at && (
            <span>Captured: {new Date(photos[selectedIndex].captured_at).toLocaleString()}</span>
          )}
          {photos[selectedIndex]?.metadata?.latitude && (
            <span>
              Location: {photos[selectedIndex].metadata.latitude.toFixed(5)}, {photos[selectedIndex].metadata.longitude?.toFixed(5)}
            </span>
          )}
          <span>{currentIs360 ? '360° Equirectangular' : 'Standard Photo'}</span>
        </div>
      </div>
    </div>
  );
}
