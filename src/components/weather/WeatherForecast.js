import React from 'react';
import { getWeatherIcon, getWeatherDescription, tempColor } from './weatherUtils';
import './WeatherForecast.css';

const DAYS = 14;

// "2026-10-30" -> Date local (evita o deslocamento de fuso do parse UTC)
const parseDay = (day) => new Date(`${day}T12:00:00`);

const WeatherForecast = ({ data, today }) => {
  if (!data) return null;

  const todayKey = today || data.time.find((d) => parseDay(d) >= new Date(new Date().toDateString())) || data.time[0];
  const start = Math.max(0, data.time.indexOf(todayKey));
  const indexes = data.time.slice(start, start + DAYS).map((_, i) => start + i);

  const mins = indexes.map((i) => data.temperature_2m_min[i]);
  const maxs = indexes.map((i) => data.temperature_2m_max[i]);
  const rangeMin = Math.min(...mins);
  const rangeMax = Math.max(...maxs);
  const span = Math.max(1, rangeMax - rangeMin);

  const dayLabel = (day, offset) => {
    if (offset === 0) return 'Hoje';
    if (offset === 1) return 'Amanhã';
    const label = parseDay(day).toLocaleDateString('pt-BR', { weekday: 'long' }).split('-')[0];
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  const shortDate = (day) => parseDay(day).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

  return (
    <div className="weather-forecast">
      <div className="wf-header">
        <h3>Próximos {indexes.length} dias</h3>
        <span className="wf-range">
          Variação: {Math.round(rangeMin)}° a {Math.round(rangeMax)}°
        </span>
      </div>

      <div className="wf-columns" aria-hidden="true">
        <span>Dia</span>
        <span>Condição</span>
        <span className="wf-col-rain">Chuva</span>
        <span className="wf-col-temp">Mín · Máx</span>
        <span className="wf-col-wind">Vento</span>
      </div>

      <ul className="wf-list">
        {indexes.map((i, offset) => {
          const day = data.time[i];
          const min = data.temperature_2m_min[i];
          const max = data.temperature_2m_max[i];
          const code = data.weather_code[i];
          const chance = data.precipitation_probability_max?.[i];
          const rainMm = data.precipitation_sum?.[i] ?? 0;
          const snowMm = data.snowfall_sum?.[i] ?? 0;
          const left = ((min - rangeMin) / span) * 100;
          const width = Math.max(4, ((max - min) / span) * 100);

          return (
            <li key={day} className={`wf-row ${offset === 0 ? 'today' : ''}`} style={{ animationDelay: `${offset * 35}ms` }}>
              <div className="wf-day">
                <strong>{dayLabel(day, offset)}</strong>
                <span>{shortDate(day)}</span>
              </div>

              <div className="wf-cond" title={getWeatherDescription(code)}>
                <span className="wf-icon">{getWeatherIcon(code)}</span>
                <span className="wf-desc">{getWeatherDescription(code)}</span>
              </div>

              <div className={`wf-rain ${chance >= 50 ? 'high' : ''}`}>
                <span className="wf-rain-chance">💧 {chance ?? 0}%</span>
                <span className="wf-rain-mm">
                  {snowMm > 0 ? `❄️ ${snowMm.toFixed(1)} cm` : `${rainMm.toFixed(1)} mm`}
                </span>
              </div>

              <div className="wf-temps">
                <span className="wf-min">{Math.round(min)}°</span>
                <div className="wf-bar">
                  <div
                    className="wf-bar-fill"
                    style={{
                      left: `${Math.min(left, 100 - width)}%`,
                      width: `${width}%`,
                      background: `linear-gradient(90deg, ${tempColor(min)}, ${tempColor(max)})`
                    }}
                  />
                </div>
                <span className="wf-max">{Math.round(max)}°</span>
              </div>

              <div className="wf-wind">
                <strong>{Math.round(data.wind_speed_10m_max[i])}</strong> km/h
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default WeatherForecast;
