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
    if (!daily || !daily.time) return { 
      min: null, 
      max: null, 
      precipitation_probability: null,
      sunrise: null,
      sunset: null,
      uv_index: null
    };
    
    const today = new Date().toISOString().split('T')[0];
    const todayIndex = daily.time.findIndex(date => date === today);
    
    if (todayIndex === -1) return { 
      min: null, 
      max: null, 
      precipitation_probability: null,
      sunrise: null,
      sunset: null,
      uv_index: null
    };
    
    return {
      min: daily.temperature_2m_min?.[todayIndex],
      max: daily.temperature_2m_max?.[todayIndex],
      precipitation_probability: daily.precipitation_probability_max?.[todayIndex],
      sunrise: daily.sunrise?.[todayIndex],
      sunset: daily.sunset?.[todayIndex],
      uv_index: daily.uv_index_max?.[todayIndex]
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
      {/* Banner Principal - Layout Horizontal */}
      <div className="weather-banner">
        <div className="banner-left">
          <div className="location-info">
            <h2>📍 {location.name}</h2>
            <p className="current-time">{formatTime(current.time)}</p>
          </div>
          <div className="weather-status">
            <div className="weather-icon">
              {getWeatherIcon(current.weather_code, current.is_day)}
            </div>
            <div className="weather-description">
              {getWeatherDescription(current.weather_code)}
            </div>
          </div>
        </div>
        
        <div className="banner-center">
          <div className="temp-display">
            <div className="main-temp">
              {Math.round(current.temperature_2m)}°C
            </div>
            <div className="temp-minmax">
              <div className="temp-max">🔼 {todayMinMax.max !== null ? `${Math.round(todayMinMax.max)}°` : 'N/A'}</div>
              <div className="temp-min">🔽 {todayMinMax.min !== null ? `${Math.round(todayMinMax.min)}°` : 'N/A'}</div>
            </div>
          </div>
          <div className="feels-like">
            Sensação: {Math.round(current.apparent_temperature)}°C
          </div>
        </div>
        
        <div className="banner-right">
          <div className="quick-stats">
            <div className="stat-item">
              <span className="stat-icon">💧</span>
              <span className="stat-value">{current.relative_humidity_2m}%</span>
              <span className="stat-label">Umidade</span>
            </div>
            <div className="stat-item">
              <span className="stat-icon">🌬️</span>
              <span className="stat-value">{current.wind_speed_10m} km/h</span>
              <span className="stat-label">Vento {getWindDirection(current.wind_direction_10m)}</span>
            </div>
            <div className="stat-item">
              <span className="stat-icon">🌧️</span>
              <span className="stat-value">{todayMinMax.precipitation_probability || 0}%</span>
              <span className="stat-label">% Chuva</span>
            </div>
          </div>
        </div>
      </div>

      

   {/* Detalhes Expandidos */}
      <div className="current-details">
        <div className="detail-item">
          <span className="detail-icon">📊</span>
          <span className="detail-label">Pressão Atmosférica</span>
          <span className="detail-value">
            Nível do mar: {current.pressure_msl} hPa<br />
            Superfície: {current.surface_pressure || 'N/A'} hPa
          </span>
        </div>
        
        <div className="detail-item">
          <span className="detail-icon">☁️</span>
          <span className="detail-label">Cobertura de Nuvens</span>
          <span className="detail-value">
            Total: {current.cloud_cover}%<br />
            Estado: {current.is_day ? '🌞 Dia' : '🌙 Noite'}
          </span>
        </div>

        <div className="detail-item">
          <span className="detail-icon">🌅</span>
          <span className="detail-label">Nascer/Pôr do Sol</span>
          <span className="detail-value">
            {todayMinMax.sunrise ? new Date(todayMinMax.sunrise).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'N/A'} - {todayMinMax.sunset ? new Date(todayMinMax.sunset).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
          </span>
        </div>

        <div className="detail-item">
          <span className="detail-icon">☀️</span>
          <span className="detail-label">Índice UV</span>
          <span className="detail-value">
            Máximo: {todayMinMax.uv_index || 'N/A'}<br />
            Status: {todayMinMax.uv_index > 7 ? '🔴 Alto' : todayMinMax.uv_index > 5 ? '🟡 Moderado' : '🟢 Baixo'}
          </span>
        </div>

        <div className="detail-item">
          <span className="detail-icon">📈</span>
          <span className="detail-label">Temp Próximas 24h</span>
          <span className="detail-value">
            Max: {Math.max(...hourly.temperature_2m.slice(0, 24))}°<br />
            Min: {Math.min(...hourly.temperature_2m.slice(0, 24))}°
          </span>
        </div>

        <div className="detail-item">
          <span className="detail-icon">🌧️</span>
          <span className="detail-label">Probabilidade de Chuva</span>
          <span className="detail-value">
            Chuva: {Math.max(...(hourly.precipitation_probability?.slice(0, 24) || [0]))}%<br />
            Status: {Math.max(...(hourly.precipitation_probability?.slice(0, 24) || [0])) > 70 ? '🔴 Alta' : Math.max(...(hourly.precipitation_probability?.slice(0, 24) || [0])) > 30 ? '🟡 Média' : '🟢 Baixa'}
          </span>
        </div>

        <div className="detail-item">
          <span className="detail-icon">🌬️</span>
          <span className="detail-label">Vento</span>
          <span className="detail-value">
            Velocidade: {current.wind_speed_10m} km/h {getWindDirection(current.wind_direction_10m)}<br />
            Rajadas: {current.wind_gusts_10m || 'N/A'} km/h
          </span>
        </div>

        <div className="detail-item">
          <span className="detail-icon">💧</span>
          <span className="detail-label">Umidade e Precipitação</span>
          <span className="detail-value">{current.relative_humidity_2m}% / {current.precipitation || 0}mm</span>
        </div>
      </div>

      {/* Gráfico de Temperatura Horária - Aparece logo após Min/Max */}
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