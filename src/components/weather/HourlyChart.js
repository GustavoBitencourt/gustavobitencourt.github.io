import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { getWeatherIcon, tempColor } from './weatherUtils';
import './HourlyChart.css';

const HEIGHT = 270;
const MARGIN = { top: 36, right: 18, bottom: 78, left: 42 };

// Curva cúbica monotônica (sem "overshoot" entre pontos)
const monotonePath = (pts) => {
  const n = pts.length;
  if (n < 2) return '';
  const dx = [];
  const m = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1][0] - pts[i][0];
    m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i];
  }
  const t = new Array(n);
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) {
    t[i] = m[i - 1] * m[i] <= 0
      ? 0
      : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
  }
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${pts[i][0] + h},${pts[i][1] + t[i] * h} ${pts[i + 1][0] - h},${pts[i + 1][1] - t[i + 1] * h} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
};

const niceStep = (range) => {
  if (range <= 6) return 1;
  if (range <= 12) return 2;
  if (range <= 30) return 5;
  return 10;
};

const formatHour = (hour) => `${String(hour).padStart(2, '0')}h`;

const HourlyChart = ({ data, nowIndex = 0 }) => {
  const wrapperRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState(null);
  const uid = useId().replace(/:/g, '');

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const chart = useMemo(() => {
    if (!width || data.length < 2) return null;
    const temps = data.map((d) => d.temperature);
    const minT = Math.min(...temps);
    const maxT = Math.max(...temps);
    const step = niceStep(maxT - minT);
    const yMin = Math.floor((minT - 2) / step) * step;
    const yMax = Math.ceil((maxT + 1) / step) * step;

    const innerW = width - MARGIN.left - MARGIN.right;
    const plotBottom = HEIGHT - MARGIN.bottom;
    const innerH = plotBottom - MARGIN.top;
    const stepX = innerW / (data.length - 1);
    const x = (i) => MARGIN.left + i * stepX;
    const y = (t) => plotBottom - ((t - yMin) / (yMax - yMin)) * innerH;

    const pts = data.map((d, i) => [x(i), y(d.temperature)]);
    const line = monotonePath(pts);
    const area = `${line} L${x(data.length - 1)},${plotBottom} L${x(0)},${plotBottom} Z`;

    const ticks = [];
    for (let v = yMin; v <= yMax + 1e-9; v += step) ticks.push(v);

    const labelEvery = [1, 2, 3, 4, 6].find((s) => s * stepX >= 34) || 6;

    // Faixas noturnas
    const nightBands = [];
    let start = null;
    data.forEach((d, i) => {
      if (!d.isDay && start === null) start = i;
      if ((d.isDay || i === data.length - 1) && start !== null) {
        const end = d.isDay ? i - 1 : i;
        nightBands.push([Math.max(MARGIN.left, x(start) - stepX / 2), Math.min(width - MARGIN.right, x(end) + stepX / 2)]);
        start = null;
      }
    });

    const maxIndex = temps.indexOf(maxT);
    const minIndex = temps.indexOf(minT);

    return { x, y, line, area, ticks, labelEvery, nightBands, plotBottom, stepX, yMin, yMax, maxIndex, minIndex, minT, maxT };
  }, [data, width]);

  const handlePointer = (e) => {
    if (!chart) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = Math.round((px - MARGIN.left) / chart.stepX);
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  };

  if (!data.length) return null;

  const hovered = hover !== null && chart ? data[hover] : null;
  const barsTop = chart ? chart.plotBottom + 8 : 0;
  const barsH = 22;

  return (
    <div className="hourly-chart" ref={wrapperRef}>
      {chart && (
        <svg
          className="chart-svg"
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          onPointerMove={handlePointer}
          onPointerDown={handlePointer}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={`Temperatura nas próximas horas: mínima ${Math.round(chart.minT)}°, máxima ${Math.round(chart.maxT)}°`}
        >
          <defs>
            <linearGradient id={`line-${uid}`} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={chart.y(chart.yMax)} y2={chart.y(chart.yMin)}>
              {[0, 0.25, 0.5, 0.75, 1].map((o) => (
                <stop key={o} offset={o} stopColor={tempColor(chart.yMax - o * (chart.yMax - chart.yMin))} />
              ))}
            </linearGradient>
            <linearGradient id={`area-${uid}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={tempColor(chart.maxT)} stopOpacity="0.38" />
              <stop offset="1" stopColor={tempColor(chart.minT)} stopOpacity="0" />
            </linearGradient>
          </defs>

          {chart.nightBands.map(([x0, x1]) => (
            <rect key={x0} className="chart-night" x={x0} y={MARGIN.top - 10} width={x1 - x0} height={chart.plotBottom - MARGIN.top + 10} rx="6" />
          ))}

          {chart.ticks.map((v) => (
            <g key={v}>
              <line className="chart-grid" x1={MARGIN.left} x2={width - MARGIN.right} y1={chart.y(v)} y2={chart.y(v)} />
              <text className="chart-axis" x={MARGIN.left - 10} y={chart.y(v)} textAnchor="end" dominantBaseline="middle">
                {v}°
              </text>
            </g>
          ))}

          <path className="chart-area" d={chart.area} fill={`url(#area-${uid})`} />
          <path className="chart-line" d={chart.line} stroke={`url(#line-${uid})`} pathLength="1" />

          {/* Marcador "Agora" */}
          {nowIndex >= 0 && nowIndex < data.length && (
            <g className="chart-now">
              <line x1={chart.x(nowIndex)} x2={chart.x(nowIndex)} y1={MARGIN.top - 14} y2={chart.plotBottom} />
              <text x={chart.x(nowIndex)} y={MARGIN.top - 20} textAnchor="middle">Agora</text>
              <circle className="chart-now-pulse" cx={chart.x(nowIndex)} cy={chart.y(data[nowIndex].temperature)} r="6" />
              <circle cx={chart.x(nowIndex)} cy={chart.y(data[nowIndex].temperature)} r="5" />
            </g>
          )}

          {/* Máxima e mínima */}
          {[
            { i: chart.maxIndex, label: 'máx', dy: -14 },
            { i: chart.minIndex, label: 'mín', dy: 22 }
          ].map(({ i, label, dy }) => (
            <g key={label} className="chart-extreme">
              <circle cx={chart.x(i)} cy={chart.y(data[i].temperature)} r="3.5" fill={tempColor(data[i].temperature)} />
              <text x={chart.x(i)} y={chart.y(data[i].temperature) + dy} textAnchor="middle">
                {Math.round(data[i].temperature)}° <tspan className="chart-extreme-label">{label}</tspan>
              </text>
            </g>
          ))}

          {/* Probabilidade de chuva */}
          {data.map((d, i) => {
            const p = d.precipitation ?? 0;
            const h = Math.max(1.5, (p / 100) * barsH);
            const bw = Math.max(3, Math.min(12, chart.stepX * 0.55));
            return (
              <rect
                key={d.time}
                className={`chart-rain-bar ${hover === i ? 'active' : ''}`}
                x={chart.x(i) - bw / 2}
                y={barsTop + barsH - h}
                width={bw}
                height={h}
                rx={Math.min(3, bw / 2)}
                style={{ opacity: 0.25 + (p / 100) * 0.75 }}
              />
            );
          })}

          {/* Ícones e horários */}
          {data.map((d, i) =>
            i % chart.labelEvery === 0 ? (
              <g key={`lbl-${d.time}`}>
                <text className="chart-icon" x={chart.x(i)} y={barsTop + barsH + 18} textAnchor="middle">
                  {getWeatherIcon(d.weatherCode, d.isDay)}
                </text>
                <text className={`chart-hour ${i === nowIndex ? 'now' : ''}`} x={chart.x(i)} y={barsTop + barsH + 40} textAnchor="middle">
                  {formatHour(d.hour)}
                </text>
              </g>
            ) : null
          )}

          {/* Interação */}
          {hovered && (
            <g className="chart-hover">
              <line x1={chart.x(hover)} x2={chart.x(hover)} y1={MARGIN.top - 10} y2={barsTop + barsH} />
              <circle cx={chart.x(hover)} cy={chart.y(hovered.temperature)} r="6" fill={tempColor(hovered.temperature)} />
            </g>
          )}
        </svg>
      )}

      {hovered && chart && (
        <div
          className="chart-tooltip"
          style={{
            left: Math.max(70, Math.min(width - 70, chart.x(hover))),
            top: chart.y(hovered.temperature)
          }}
        >
          <div className="tooltip-hour">
            {hover === nowIndex ? 'Agora' : formatHour(hovered.hour)} · {getWeatherIcon(hovered.weatherCode, hovered.isDay)}
          </div>
          <div className="tooltip-temp" style={{ color: tempColor(hovered.temperature) }}>
            {hovered.temperature.toFixed(1)}°C
          </div>
          <div className="tooltip-rain">💧 {hovered.precipitation ?? 0}% de chuva</div>
        </div>
      )}

      <div className="chart-legend">
        <span className="legend-item">
          <span className="legend-swatch line" />
          Temperatura
        </span>
        <span className="legend-item">
          <span className="legend-swatch rain" />
          Probabilidade de chuva
        </span>
        <span className="legend-item">
          <span className="legend-swatch night" />
          Noite
        </span>
      </div>
    </div>
  );
};

export default HourlyChart;
