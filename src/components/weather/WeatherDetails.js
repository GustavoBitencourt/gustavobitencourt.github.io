import React from 'react';
import './WeatherDetails.css';

const WeatherDetails = ({ data }) => {
  const { current, hourly } = data;

  const getWindDirection = (degrees) => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return directions[Math.round(degrees / 45) % 8];
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTodayData = () => {
    if (!data.daily || !data.daily.time) return null;
    
    const today = new Date().toISOString().split('T')[0];
    const todayIndex = data.daily.time.findIndex(date => date === today);
    
    if (todayIndex === -1) return null;
    
    return {
      sunrise: data.daily.sunrise?.[todayIndex],
      sunset: data.daily.sunset?.[todayIndex],
      uv_index: data.daily.uv_index_max?.[todayIndex],
      daylight_duration: data.daily.daylight_duration?.[todayIndex],
      precipitation_probability: data.daily.precipitation_probability_max?.[todayIndex]
    };
  };

  const todayData = getTodayData();

  return (
    <div className="weather-details">
      <h3>📊 Detalhes Climáticos</h3>
      
      <div className="details-grid">
        <div className="detail-card">
          <div className="detail-title">🌡️ Temperatura</div>
          <div className="detail-content">
            <p>Atual: {Math.round(current.temperature_2m)}°C</p>
            <p>Sensação: {Math.round(current.apparent_temperature)}°C</p>
          </div>
        </div>

        <div className="detail-card">
          <div className="detail-title">💧 Umidade e Precipitação</div>
          <div className="detail-content">
            <p>Umidade: {current.relative_humidity_2m}%</p>
            <p>Chuva: {current.rain || 0}mm</p>
            <p>Neve: {current.snowfall || 0}mm</p>
          </div>
        </div>

        <div className="detail-card">
          <div className="detail-title">🌬️ Vento</div>
          <div className="detail-content">
            <p>Velocidade: {current.wind_speed_10m} km/h</p>
            <p>Direção: {getWindDirection(current.wind_direction_10m)}</p>
            <p>Rajadas: {current.wind_gusts_10m || 'N/A'} km/h</p>
          </div>
        </div>

        <div className="detail-card">
          <div className="detail-title">📊 Pressão Atmosférica</div>
          <div className="detail-content">
            <p>Nível do mar: {current.pressure_msl} hPa</p>
            <p>Superfície: {current.surface_pressure || 'N/A'} hPa</p>
          </div>
        </div>

        <div className="detail-card">
          <div className="detail-title">☁️ Cobertura de Nuvens</div>
          <div className="detail-content">
            <p>Total: {current.cloud_cover}%</p>
            <p>Estado: {current.is_day ? '🌞 Dia' : '🌙 Noite'}</p>
          </div>
        </div>

        <div className="detail-card">
          <div className="detail-title">📈 Próximas 24h</div>
          <div className="detail-content">
            <p>Max: {Math.max(...hourly.temperature_2m.slice(0, 24))}°C</p>
            <p>Min: {Math.min(...hourly.temperature_2m.slice(0, 24))}°C</p>
            <p>Prob. Chuva: {Math.max(...(hourly.precipitation_probability?.slice(0, 24) || [0]))}%</p>
          </div>
        </div>

        {todayData && (
          <>
            <div className="detail-card">
              <div className="detail-title">🌅 Sol</div>
              <div className="detail-content">
                <p>Nascer: {todayData.sunrise ? formatTime(todayData.sunrise) : 'N/A'}</p>
                <p>Pôr: {todayData.sunset ? formatTime(todayData.sunset) : 'N/A'}</p>
                <p>Duração: {todayData.daylight_duration ? `${Math.round(todayData.daylight_duration / 3600)}h` : 'N/A'}</p>
              </div>
            </div>

            <div className="detail-card">
              <div className="detail-title">☀️ Índice UV</div>
              <div className="detail-content">
                <p>Máximo hoje: {todayData.uv_index || 'N/A'}</p>
                <p>Status: {todayData.uv_index > 7 ? '🔴 Alto' : todayData.uv_index > 5 ? '🟡 Moderado' : '🟢 Baixo'}</p>
              </div>
            </div>

            <div className="detail-card">
              <div className="detail-title">🌧️ Probabilidade</div>
              <div className="detail-content">
                <p>Chuva hoje: {todayData.precipitation_probability || 0}%</p>
                <p>Status: {(todayData.precipitation_probability || 0) > 70 ? '🔴 Alta' : (todayData.precipitation_probability || 0) > 30 ? '🟡 Média' : '🟢 Baixa'}</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default WeatherDetails;
