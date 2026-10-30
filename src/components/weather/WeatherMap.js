import React, { useEffect, useRef } from 'react';
import './WeatherMap.css';

// Carrega o Leaflet uma única vez (evita scripts duplicados no StrictMode / remontagens)
let leafletPromise = null;
const loadLeaflet = () => {
  if (window.L) return Promise.resolve(window.L);
  if (!leafletPromise) {
    leafletPromise = new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);

      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      // Com CORS, erros do Leaflet mostram a mensagem real em vez de "Script error."
      script.crossOrigin = 'anonymous';
      script.onload = () => resolve(window.L);
      script.onerror = () => {
        leafletPromise = null;
        reject(new Error('Falha ao carregar o Leaflet'));
      };
      document.body.appendChild(script);
    });
  }
  return leafletPromise;
};

const WeatherMap = ({ latitude, longitude, locationName }) => {
  const mapRef = useRef(null);

  useEffect(() => {
    let map = null;
    let resizeTimer = null;
    let cancelled = false;

    loadLeaflet()
      .then((L) => {
        if (cancelled || !mapRef.current) return;

        map = L.map(mapRef.current).setView([latitude, longitude], 8);

        // Adicionar camada de tiles do OpenStreetMap
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19
        }).addTo(map);

        // Adicionar marcador personalizado
        const customIcon = L.divIcon({
          className: 'custom-marker',
          html: '<div class="marker-pin">📍</div>',
          iconSize: [40, 40],
          iconAnchor: [20, 40],
          popupAnchor: [0, -40]
        });

        L.marker([latitude, longitude], { icon: customIcon })
          .addTo(map)
          .bindPopup(`<b>${locationName}</b><br>Lat: ${latitude.toFixed(2)}, Lon: ${longitude.toFixed(2)}`, { autoPan: false })
          .openPopup();

        // Ajustar tamanho do mapa depois da animação de entrada do card
        resizeTimer = setTimeout(() => {
          if (map) map.invalidateSize();
        }, 800);
      })
      .catch((err) => console.error(err));

    return () => {
      cancelled = true;
      clearTimeout(resizeTimer);
      if (map) {
        map.stop();
        map.remove();
        map = null;
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
