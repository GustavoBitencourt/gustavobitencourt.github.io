import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import LocationSearch from './LocationSearch';
import WeatherBackground from './WeatherBackground';
import { getSkyScene, SCENE_TYPES } from './weatherUtils';
import CurrentWeather from './CurrentWeather';
import WeatherForecast from './WeatherForecast';
import WeatherMap from './WeatherMap';
import './Weather.css';

const Weather = () => {
  const [weatherData, setWeatherData] = useState(null);
  const [forecastData, setForecastData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Buscar dados climáticos da API Open-Meteo
  const fetchWeatherData = useCallback(async (latitude, longitude, locationName = '') => {
    setLoading(true);
    setError(null);
    
    try {
      const baseUrl = 'https://api.open-meteo.com/v1/forecast';
      const params = new URLSearchParams({
        latitude: latitude,
        longitude: longitude,
        current: [
          'temperature_2m', 'relative_humidity_2m', 'apparent_temperature',
          'is_day', 'precipitation', 'rain', 'snowfall', 'weather_code',
          'cloud_cover', 'pressure_msl', 'surface_pressure', 'wind_speed_10m', 
          'wind_direction_10m', 'wind_gusts_10m'
        ].join(','),
        hourly: [
          'temperature_2m', 'relative_humidity_2m', 'precipitation_probability',
          'precipitation', 'weather_code', 'wind_speed_10m', 'wind_direction_10m',
          'visibility', 'uv_index', 'is_day'
        ].join(','),
        daily: [
          'weather_code', 'temperature_2m_max', 'temperature_2m_min',
          'apparent_temperature_max', 'apparent_temperature_min',
          'precipitation_sum', 'rain_sum', 'snowfall_sum', 
          'precipitation_hours', 'precipitation_probability_max',
          'wind_speed_10m_max', 'wind_gusts_10m_max', 'wind_direction_10m_dominant',
          'sunrise', 'sunset', 'daylight_duration', 'sunshine_duration',
          'uv_index_max'
        ].join(','),
        timezone: 'auto',
        forecast_days: 16,
        past_days: 1
      });

      const response = await fetch(`${baseUrl}?${params}`);
      
      if (!response.ok) {
        throw new Error(`Erro na API: ${response.status}`);
      }
      
      const data = await response.json();
      
      setWeatherData({
        ...data,
        location: { name: locationName, latitude, longitude }
      });
      
      setForecastData(data.daily);
      
    } catch (err) {
      setError(err.message);
      console.error('Erro ao buscar dados climáticos:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Obter localização atual do usuário
  const getCurrentLocation = useCallback(() => {
    if (navigator.geolocation) {
      setLoading(true);
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          
          // Buscar nome da cidade usando reverse geocoding
          try {
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=pt-BR`
            );
            const data = await response.json();
            
            // Extrair nome da cidade
            const cityName = data.address?.city || 
                           data.address?.town || 
                           data.address?.village || 
                           data.address?.municipality || 
                           data.address?.state || 
                           'Localização Atual';
            
            fetchWeatherData(latitude, longitude, cityName);
          } catch (error) {
            console.error('Erro ao buscar nome da cidade:', error);
            fetchWeatherData(latitude, longitude, 'Localização Atual');
          }
        },
        (error) => {
          console.error('Erro ao obter localização:', error);
          setError('Não foi possível obter sua localização');
          setLoading(false);
        }
      );
    } else {
      setError('Geolocalização não é suportada neste navegador');
    }
  }, [fetchWeatherData]);

  // Carregar localização atual ao montar componente
  useEffect(() => {
    getCurrentLocation();
  }, [getCurrentLocation]);

  const handleLocationSelect = (location) => {
    fetchWeatherData(location.latitude, location.longitude, location.name);
  };

  // Cena do fundo animado. Permite forçar via URL para testes: #/weather?sky=storm&night=1
  const [searchParams] = useSearchParams();
  const skyOverride = searchParams.get('sky');
  const nightOverride = searchParams.get('night');
  const current = weatherData?.current;

  const skyScene = useMemo(() => {
    const base = current
      ? getSkyScene(current.weather_code, current.is_day === 1)
      : { type: 'partly', isDay: true, intensity: 0.3 };
    const type = SCENE_TYPES.includes(skyOverride) ? skyOverride : base.type;
    const isDay = nightOverride !== null ? nightOverride !== '1' : base.isDay;
    const intensity = type === base.type ? base.intensity : 1;
    return { type, isDay, intensity };
  }, [current, skyOverride, nightOverride]);

  return (
    <div className={`weather-container sky-${skyScene.type} ${skyScene.isDay ? 'is-day' : 'is-night'}`}>
      <WeatherBackground
        scene={skyScene}
        wind={current?.wind_speed_10m ?? 0}
        windDirection={current?.wind_direction_10m ?? 0}
        temperature={current?.temperature_2m ?? null}
      />

      <div className="weather-inner">
        <div className="weather-header">
          <h1>🌤️ Previsão do Tempo</h1>
          <p>Dados climáticos em tempo real e previsão estendida</p>
        </div>

        <LocationSearch
          onLocationSelect={handleLocationSelect}
          onUseCurrentLocation={getCurrentLocation}
        />

        {loading && (
          <div className="weather-loading">
            <div className="loading-spinner"></div>
            <p>Carregando dados climáticos...</p>
          </div>
        )}

        {error && (
          <div className="weather-error">
            <p>❌ {error}</p>
            <button onClick={getCurrentLocation} className="retry-button">
              Tentar Novamente
            </button>
          </div>
        )}

        {weatherData && !loading && (
          <div className="weather-content">
            <div className="weather-left">
              <CurrentWeather data={weatherData} />
            </div>
            <div className="weather-right">
              <WeatherMap
                latitude={weatherData.location.latitude}
                longitude={weatherData.location.longitude}
                locationName={weatherData.location.name}
              />
              <WeatherForecast data={forecastData} today={weatherData.current.time.slice(0, 10)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Weather;