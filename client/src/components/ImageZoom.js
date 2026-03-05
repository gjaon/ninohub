import React, { useState, useRef } from "react";
import "./ImageZoom.css";

const ImageZoom = ({ src, alt, zoomLevel = 3.5, onImageClick }) => {
  const [isZooming, setIsZooming] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [lensPosition, setLensPosition] = useState({ x: 0, y: 0 });
  const imgRef = useRef(null);
  const containerRef = useRef(null);

  const handleMouseMove = (e) => {
    if (!imgRef.current || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Calculate lens position (centered on cursor)
    const lensSize = 200; // Size of the magnifying lens
    const lensX = x - lensSize / 2;
    const lensY = y - lensSize / 2;

    // Calculate the zoomed image position
    const percentX = (x / rect.width) * 100;
    const percentY = (y / rect.height) * 100;

    setLensPosition({ x: lensX, y: lensY });
    setPosition({ x: percentX, y: percentY });
  };

  const handleMouseEnter = () => {
    setIsZooming(true);
  };

  const handleMouseLeave = () => {
    setIsZooming(false);
  };

  return (
    <div
      className="image-zoom-container"
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onImageClick}
    >
      <img ref={imgRef} src={src} alt={alt} className="zoom-source-image" />

      {isZooming && (
        <div
          className="zoom-lens"
          style={{
            left: `${lensPosition.x}px`,
            top: `${lensPosition.y}px`,
          }}
        >
          <div
            className="zoom-preview"
            style={{
              backgroundImage: `url(${src})`,
              backgroundPosition: `${position.x}% ${position.y}%`,
              backgroundSize: `${zoomLevel * 100}%`,
            }}
          />
        </div>
      )}

      {isZooming && (
        <div className="zoom-result">
          <div
            className="zoom-result-image"
            style={{
              backgroundImage: `url(${src})`,
              backgroundPosition: `${position.x}% ${position.y}%`,
              backgroundSize: `${zoomLevel * 100}%`,
            }}
          />
        </div>
      )}
    </div>
  );
};

export default ImageZoom;
