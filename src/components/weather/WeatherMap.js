import React, { useEffect, useRef } from 'react';
import './WeatherMap.css';

const WeatherMap = ({ latitude, longitude, locationName }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    // Carregar Leaflet dinamicamente
    if (!window.L) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);

      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => initMap();
      document.body.appendChild(script);
    } else {
      initMap();
    }

    function initMap() {
      if (!mapRef.current || !window.L) return;

      // Remover mapa existente se houver
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
      }

      // Criar novo mapa
      const map = window.L.map(mapRef.current).setView([latitude, longitude], 8);

      // Adicionar camada de tiles do OpenStreetMap
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(map);



      // Adicionar marcador personalizado
      const customIcon = window.L.divIcon({
        className: 'custom-marker',
        html: '<div class="marker-pin">📍</div>',
        iconSize: [40, 40],
        iconAnchor: [20, 40],
        popupAnchor: [0, -40]
      });

      const marker = window.L.marker([latitude, longitude], { icon: customIcon })
        .addTo(map)
        .bindPopup(`<b>${locationName}</b><br>Lat: ${latitude.toFixed(2)}, Lon: ${longitude.toFixed(2)}`)
        .openPopup();

      mapInstanceRef.current = map;
      markerRef.current = marker;

      // Ajustar tamanho do mapa após renderização
      setTimeout(() => {
        map.invalidateSize();
      }, 100);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [latitude, longitude, locationName]);

  return (
    <div className="weather-map">
      <h3>🗺️ Localização no Mapa</h3>
      <div ref={mapRef} className="map-container"></div>
      <div className="map-info">
        <p>📍 {locationName}</p>
        <p className="coordinates">
          {latitude.toFixed(4)}°, {longitude.toFixed(4)}°
        </p>
      </div>
    </div>
  );
};

export default WeatherMap;
