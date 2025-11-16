import React, { useRef, useEffect } from 'react';
import './HourlyChart.css';

const HourlyChart = ({ data }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data.length) return;

    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    
    // Limpar canvas
    ctx.clearRect(0, 0, width, height);
    
    // Configurações do gráfico
    const padding = 40;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    
    // Encontrar valores min/max para escala
    const temperatures = data.map(d => d.temperature);
    const minTemp = Math.min(...temperatures) - 2;
    const maxTemp = Math.max(...temperatures) + 2;
    const tempRange = maxTemp - minTemp;
    
    // Função para converter temperatura em coordenada Y
    const getY = (temp) => {
      return height - padding - ((temp - minTemp) / tempRange) * chartHeight;
    };
    
    // Função para converter índice em coordenada X
    const getX = (index) => {
      return padding + (index / (data.length - 1)) * chartWidth;
    };
    
    // Desenhar grid horizontal (linhas de temperatura)
    ctx.strokeStyle = 'rgba(116, 185, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.font = '10px Arial';
    ctx.fillStyle = '#636e72';
    
    for (let i = 0; i <= 4; i++) {
      const temp = minTemp + (tempRange / 4) * i;
      const y = getY(temp);
      
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
      
      ctx.fillText(`${Math.round(temp)}°`, 5, y + 3);
    }
    
    // Desenhar linha principal
    ctx.strokeStyle = '#0984e3';
    ctx.lineWidth = 3;
    ctx.beginPath();
    
    data.forEach((point, index) => {
      const x = getX(index);
      const y = getY(point.temperature);
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
    
    // Desenhar pontos e valores
    ctx.fillStyle = '#0984e3';
    data.forEach((point, index) => {
      const x = getX(index);
      const y = getY(point.temperature);
      
      // Ponto
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 2 * Math.PI);
      ctx.fill();
      
      // Temperatura no ponto (apenas alguns pontos para não poluir)
      if (index % 3 === 0 || index === data.length - 1) {
        ctx.fillStyle = '#2d3436';
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(point.temperature)}°`, x, y - 8);
        ctx.fillStyle = '#0984e3';
      }
    });
    
    // Desenhar horários no eixo X
    ctx.fillStyle = '#636e72';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    
    data.forEach((point, index) => {
      if (index % 2 === 0) { // Mostrar apenas horários pares
        const x = getX(index);
        const hour = point.hour;
        ctx.fillText(`${hour.toString().padStart(2, '0')}h`, x, height - 5);
      }
    });
    
    // Destacar hora atual
    const currentHour = new Date().getHours();
    const currentIndex = data.findIndex(d => d.hour === currentHour);
    
    if (currentIndex !== -1) {
      const x = getX(currentIndex);
      const y = getY(data[currentIndex].temperature);
      
      // Círculo destacado para hora atual
      ctx.strokeStyle = '#e74c3c';
      ctx.fillStyle = '#e74c3c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.fill();
      
      // Linha vertical para marcar hora atual
      ctx.strokeStyle = 'rgba(231, 76, 60, 0.3)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, height - padding);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    
  }, [data]);

  if (!data.length) return null;

  return (
    <div className="hourly-chart">
      <canvas 
        ref={canvasRef} 
        width={800} 
        height={200}
        className="chart-canvas"
      />
      <div className="chart-legend">
        <span className="legend-item">
          <span className="legend-color current"></span>
          Hora Atual
        </span>
        <span className="legend-item">
          <span className="legend-color line"></span>
          Temperatura
        </span>
      </div>
    </div>
  );
};

export default HourlyChart;
