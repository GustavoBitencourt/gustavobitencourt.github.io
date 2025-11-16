import React from 'react';
import HourlyChart from './HourlyChart';
import './CurrentWeather.css';

const CurrentWeather = ({ data }) => {
  const { current, location, hourly, daily } = data;

  const getWeatherIcon = (code, isDay) => {
    const weatherIcons = {
      0: isDay ? '☀️' : '🌙', // Clear sky
      1: isDay ? '🌤️' : '🌙', // Mainly clear
      2: '⛅', // Partly cloudy
      3: '☁️', // Overcast
      45: '🌫️', // Fog
      48: '🌫️', // Depositing rime fog
      51: '🌦️', // Light drizzle
      53: '🌦️', // Moderate drizzle
      55: '🌧️', // Dense drizzle
      61: '🌧️', // Slight rain
      63: '🌧️', // Moderate rain
      65: '⛈️', // Heavy rain
      71: '🌨️', // Slight snow
      73: '🌨️', // Moderate snow
      75: '❄️', // Heavy snow
      95: '⛈️', // Thunderstorm
      96: '⛈️', // Thunderstorm with slight hail
      99: '⛈️'  // Thunderstorm with heavy hail
    };
    return weatherIcons[code] || '🌤️';
  };

  const getWeatherDescription = (code) => {
    const descriptions = {
      0: 'Céu limpo',
      1: 'Principalmente limpo',
      2: 'Parcialmente nublado',
      3: 'Nublado',
      45: 'Neblina',
      48: 'Neblina com geada',
      51: 'Garoa leve',
      53: 'Garoa moderada',
      55: 'Garoa intensa',
      61: 'Chuva leve',
      63: 'Chuva moderada',
      65: 'Chuva intensa',
      71: 'Neve leve',
      73: 'Neve moderada',
      75: 'Neve intensa',
      95: 'Tempestade',
      96: 'Tempestade com granizo leve',
      99: 'Tempestade com granizo intenso'
    };
    return descriptions[code] || 'Condição desconhecida';
  };

  const getWindDirection = (degrees) => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return directions[Math.round(degrees / 45) % 8];
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleString('pt-BR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTodayMinMax = () => {
    if (!daily || !daily.time) return { min: null, max: null };
    
    const today = new Date().toISOString().split('T')[0];
    const todayIndex = daily.time.findIndex(date => date === today);
    
    if (todayIndex === -1) return { min: null, max: null };
    
    return {
      min: daily.temperature_2m_min?.[todayIndex],
      max: daily.temperature_2m_max?.[todayIndex]
    };
  };

  const getTodayHourlyData = () => {
    if (!hourly || !hourly.time) return [];
    
    const today = new Date().toISOString().split('T')[0];
    const todayData = [];
    
    for (let i = 0; i < hourly.time.length; i++) {
      if (hourly.time[i].startsWith(today)) {
        todayData.push({
          time: hourly.time[i],
          temperature: hourly.temperature_2m[i],
          hour: new Date(hourly.time[i]).getHours()
        });
      }
    }
    
    return todayData;
  };

  const todayMinMax = getTodayMinMax();
  const hourlyData = getTodayHourlyData();

  return (
    <div className="current-weather">
      <div className="current-header">
        <h2>📍 {location.name}</h2>
        <p className="current-time">{formatTime(current.time)}</p>
        <p className="weather-description">{getWeatherDescription(current.weather_code)}</p>
      </div>

      <div className="current-main">
        <div className="weather-icon">
          {getWeatherIcon(current.weather_code, current.is_day)}
        </div>
        
        <div className="temperature-info">
          <div className="main-temp">
            {Math.round(current.temperature_2m)}°C
          </div>
          <div className="feels-like">
            Sensação: {Math.round(current.apparent_temperature)}°C
          </div>
        </div>
      </div>

      <div className="current-details">
        <div className="detail-item">
          <span className="detail-icon">💧</span>
          <span className="detail-label">Umidade</span>
          <span className="detail-value">{current.relative_humidity_2m}%</span>
        </div>
        
        <div className="detail-item">
          <span className="detail-icon">🌬️</span>
          <span className="detail-label">Vento</span>
          <span className="detail-value">{current.wind_speed_10m} km/h {getWindDirection(current.wind_direction_10m)}</span>
        </div>
        
        <div className="detail-item">
          <span className="detail-icon">📊</span>
          <span className="detail-label">Pressão</span>
          <span className="detail-value">{current.pressure_msl} hPa</span>
        </div>
        
        <div className="detail-item">
          <span className="detail-icon">☁️</span>
          <span className="detail-label">Nuvens</span>
          <span className="detail-value">{current.cloud_cover}%</span>
        </div>
      </div>

      {/* Temperaturas Min/Max do Dia */}
      <div className="today-minmax">
        <div className="minmax-item">
          <span className="minmax-icon">🔽</span>
          <span className="minmax-label">Mín. hoje</span>
          <span className="minmax-value">
            {todayMinMax.min !== null ? `${Math.round(todayMinMax.min)}°C` : 'N/A'}
          </span>
        </div>
        <div className="minmax-item">
          <span className="minmax-icon">🔼</span>
          <span className="minmax-label">Máx. hoje</span>
          <span className="minmax-value">
            {todayMinMax.max !== null ? `${Math.round(todayMinMax.max)}°C` : 'N/A'}
          </span>
        </div>
      </div>

      {/* Gráfico de Temperatura Horária */}
      {hourlyData.length > 0 && (
        <div className="hourly-chart-container">
          <h4>📈 Temperatura de Hoje por Hora</h4>
          <HourlyChart data={hourlyData} />
        </div>
      )}
    </div>
  );
};

export default CurrentWeather;