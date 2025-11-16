import React from 'react';
import './WeatherForecast.css';

const WeatherForecast = ({ data }) => {
  if (!data) return null;

  const getWeatherIcon = (code) => {
    const weatherIcons = {
      0: '☀️',
      1: '🌤️',
      2: '⛅',
      3: '☁️',
      45: '🌫️',
      48: '🌫️',
      51: '🌦️',
      53: '🌦️',
      55: '🌧️',
      61: '🌧️',
      63: '🌧️',
      65: '⛈️',
      71: '🌨️',
      73: '🌨️',
      75: '❄️',
      95: '⛈️',
      96: '⛈️',
      99: '⛈️'
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

  const isToday = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    });
  };

  return (
    <div className="weather-forecast">
      <h3>📅 Previsão para 16 dias</h3>
      <div className="forecast-grid">
        {data.time.slice(0, 16).map((date, index) => (
          <div key={date} className={`forecast-item ${isToday(date) ? 'today' : ''}`}>
            <div className="forecast-date">
              {isToday(date) ? 'Hoje' : formatDate(date)}
            </div>
            <div className="forecast-icon">
              {getWeatherIcon(data.weather_code[index])}
            </div>
            <div className="forecast-description">
              {getWeatherDescription(data.weather_code[index])}
            </div>
            <div className="forecast-temps">
              <span className="temp-max">{Math.round(data.temperature_2m_max[index])}°</span>
              <span className="temp-min">{Math.round(data.temperature_2m_min[index])}°</span>
            </div>
            <div className="forecast-details">
              <div className="forecast-rain">
                💧 {Math.round(data.precipitation_sum[index])}mm
              </div>
              <div className="forecast-wind">
                🌬️ {Math.round(data.wind_speed_10m_max[index])}km/h
              </div>
              {data.rain_sum && (
                <div className="forecast-rain-detail">
                  🌧️ {Math.round(data.rain_sum[index])}mm
                </div>
              )}
              {data.snowfall_sum && data.snowfall_sum[index] > 0 && (
                <div className="forecast-snow">
                  ❄️ {Math.round(data.snowfall_sum[index])}mm
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default WeatherForecast;
