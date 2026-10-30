import React from 'react';
import HourlyChart from './HourlyChart';
import { getWeatherIcon, getWeatherDescription, getWindDirection, getUvLevel } from './weatherUtils';
import './CurrentWeather.css';

const round = (v, digits = 0) => (v === null || v === undefined ? null : Number(v.toFixed(digits)));
// Horários da API já vêm no fuso do local pesquisado ("2026-10-30T05:34")
const clock = (iso) => (iso ? iso.slice(11, 16) : '--:--');

const formatDuration = (seconds) => {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h${String(m).padStart(2, '0')}`;
};

const Meter = ({ value, max = 100, color, gradient }) => (
  <div className="cw-meter">
    <div
      className="cw-meter-fill"
      style={{
        width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`,
        background: gradient || color
      }}
    />
  </div>
);

const Tile = ({ icon, label, value, unit, sub, children }) => (
  <div className="cw-tile">
    <div className="cw-tile-label">
      <span className="cw-tile-icon">{icon}</span>
      {label}
    </div>
    <div className="cw-tile-value">
      {value}
      {unit && <span className="cw-tile-unit">{unit}</span>}
    </div>
    {children}
    {sub && <div className="cw-tile-sub">{sub}</div>}
  </div>
);

const CurrentWeather = ({ data }) => {
  const { current, location, hourly, daily } = data;

  const today = current.time.slice(0, 10);
  const dayIndex = daily?.time ? daily.time.indexOf(today) : -1;
  const dayValue = (key) => (dayIndex >= 0 ? daily[key]?.[dayIndex] ?? null : null);

  const todayInfo = {
    min: dayValue('temperature_2m_min'),
    max: dayValue('temperature_2m_max'),
    rainChance: dayValue('precipitation_probability_max'),
    sunrise: dayValue('sunrise'),
    sunset: dayValue('sunset'),
    daylight: dayValue('daylight_duration'),
    uv: dayValue('uv_index_max')
  };

  // Próximas 24h a partir da hora atual do local pesquisado (com 2h de contexto antes)
  const getHourlyWindow = () => {
    if (!hourly || !hourly.time) return { points: [], nowIndex: 0 };

    const currentHour = `${current.time.slice(0, 13)}:00`;
    const idx = Math.max(0, hourly.time.indexOf(currentHour));
    const start = Math.max(0, idx - 2);
    const points = [];

    for (let i = start; i < Math.min(hourly.time.length, idx + 25); i++) {
      points.push({
        time: hourly.time[i],
        temperature: hourly.temperature_2m[i],
        precipitation: hourly.precipitation_probability?.[i],
        weatherCode: hourly.weather_code?.[i],
        isDay: hourly.is_day ? hourly.is_day[i] === 1 : true,
        hour: Number(hourly.time[i].slice(11, 13))
      });
    }

    return { points, nowIndex: idx - start };
  };

  const hourlyWindow = getHourlyWindow();
  const next24 = hourlyWindow.points.slice(hourlyWindow.nowIndex);
  const next24Temps = next24.map((p) => p.temperature);
  const next24Rain = Math.max(0, ...next24.map((p) => p.precipitation ?? 0));
  const rainLevel = next24Rain > 70 ? 'Alta' : next24Rain > 30 ? 'Média' : 'Baixa';

  const uv = getUvLevel(todayInfo.uv);
  const isDay = current.is_day === 1;
  const description = getWeatherDescription(current.weather_code);

  const rawDate = new Date(current.time).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
  const dateLabel = rawDate.charAt(0).toUpperCase() + rawDate.slice(1);

  return (
    <div className="current-weather">
      {/* Destaque principal */}
      <section className="cw-hero">
        <div className="cw-hero-head">
          <div>
            <h2 className="cw-location">{location.name}</h2>
            <p className="cw-date">
              {dateLabel} · {clock(current.time)} <span className="cw-local">horário local</span>
            </p>
          </div>
          <span className={`cw-daypill ${isDay ? 'day' : 'night'}`}>{isDay ? '☀️ Dia' : '🌙 Noite'}</span>
        </div>

        <div className="cw-hero-main">
          <span className="cw-hero-icon">{getWeatherIcon(current.weather_code, isDay)}</span>
          <div className="cw-temp">
            {Math.round(current.temperature_2m)}
            <span className="cw-temp-unit">°C</span>
          </div>
          <div className="cw-hero-meta">
            <div className="cw-condition">{description}</div>
            <div className="cw-feels">Sensação de {Math.round(current.apparent_temperature)}°</div>
            <div className="cw-hilo">
              <span className="cw-hi">↑ {todayInfo.max !== null ? `${Math.round(todayInfo.max)}°` : '--'}</span>
              <span className="cw-lo">↓ {todayInfo.min !== null ? `${Math.round(todayInfo.min)}°` : '--'}</span>
            </div>
          </div>
        </div>

        <div className="cw-quick">
          <div className="cw-quick-item">
            <span className="cw-quick-icon">💧</span>
            <div>
              <div className="cw-quick-value">{current.relative_humidity_2m}%</div>
              <div className="cw-quick-label">Umidade</div>
            </div>
          </div>
          <div className="cw-quick-item">
            <span className="cw-quick-icon">🌬️</span>
            <div>
              <div className="cw-quick-value">
                {round(current.wind_speed_10m)} km/h {getWindDirection(current.wind_direction_10m)}
              </div>
              <div className="cw-quick-label">Vento</div>
            </div>
          </div>
          <div className="cw-quick-item">
            <span className="cw-quick-icon">🌧️</span>
            <div>
              <div className="cw-quick-value">{todayInfo.rainChance ?? 0}%</div>
              <div className="cw-quick-label">Chance de chuva hoje</div>
            </div>
          </div>
        </div>
      </section>

      {/* Detalhes */}
      <section className="cw-tiles">
        <Tile
          icon="🌬️"
          label="Vento"
          value={round(current.wind_speed_10m)}
          unit="km/h"
          sub={`Rajadas de ${round(current.wind_gusts_10m) ?? '--'} km/h`}
        >
          <div className="cw-compass">
            <span
              className="cw-compass-arrow"
              style={{ transform: `rotate(${(current.wind_direction_10m || 0) + 180}deg)` }}
            >
              ↑
            </span>
            Vindo de {getWindDirection(current.wind_direction_10m)} ({Math.round(current.wind_direction_10m || 0)}°)
          </div>
        </Tile>

        <Tile icon="☀️" label="Índice UV" value={todayInfo.uv !== null ? round(todayInfo.uv, 1) : '--'} sub={`Máximo de hoje · ${uv.label}`}>
          <Meter
            value={todayInfo.uv ?? 0}
            max={11}
            gradient="linear-gradient(90deg, #16a34a, #ca8a04, #ea580c, #dc2626, #7c3aed)"
          />
        </Tile>

        <Tile icon="💧" label="Umidade" value={current.relative_humidity_2m} unit="%" sub={`Precipitação agora: ${current.precipitation || 0} mm`}>
          <Meter value={current.relative_humidity_2m} color="#3b82f6" />
        </Tile>

        <Tile icon="☁️" label="Nuvens" value={current.cloud_cover} unit="%" sub={current.cloud_cover > 70 ? 'Céu encoberto' : current.cloud_cover > 30 ? 'Parcialmente coberto' : 'Céu aberto'}>
          <Meter value={current.cloud_cover} color="#94a3b8" />
        </Tile>

        <Tile icon="🌅" label="Sol" value={clock(todayInfo.sunrise)} sub={`Pôr do sol às ${clock(todayInfo.sunset)}`}>
          {formatDuration(todayInfo.daylight) && (
            <div className="cw-tile-note">{formatDuration(todayInfo.daylight)} de luz do dia</div>
          )}
        </Tile>

        <Tile icon="📊" label="Pressão" value={Math.round(current.pressure_msl)} unit="hPa" sub={`Superfície: ${current.surface_pressure ? Math.round(current.surface_pressure) : '--'} hPa`} />

        <Tile
          icon="🌡️"
          label="Próximas 24h"
          value={next24Temps.length ? `${Math.round(Math.min(...next24Temps))}° / ${Math.round(Math.max(...next24Temps))}°` : '--'}
          sub="Mínima / máxima"
        />

        <Tile icon="🌧️" label="Chuva em 24h" value={next24Rain} unit="%" sub={`Probabilidade ${rainLevel.toLowerCase()}`}>
          <Meter value={next24Rain} color="#2563eb" />
        </Tile>
      </section>

      {hourlyWindow.points.length > 1 && (
        <div className="hourly-chart-container">
          <div className="hourly-chart-header">
            <h4>Temperatura nas próximas 24 horas</h4>
            <span className="hourly-chart-hint">Passe o mouse ou toque no gráfico</span>
          </div>
          <HourlyChart data={hourlyWindow.points} nowIndex={hourlyWindow.nowIndex} />
        </div>
      )}
    </div>
  );
};

export default CurrentWeather;
