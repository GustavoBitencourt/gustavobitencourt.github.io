import React, { useRef, useEffect } from 'react';

const StarryBackground = () => {
  const canvasRef = useRef(null);
  const starsRef = useRef([]);
  const mouseRef = useRef({ x: 0, y: 0 });
  const animationRef = useRef();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const initStars = () => {
      const starCount = isMobile ? 100 : 300;
      starsRef.current = [];

      for (let i = 0; i < starCount; i++) {
        starsRef.current.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          radius: Math.random() * 2 + 1,
          speed: Math.random() * 0.5 + 0.2,
          directionX: Math.random() * 2 - 1,
          directionY: Math.random() * 2 - 1,
        });
      }
    };

    const handleMouseMove = (e) => {
      if (!isMobile) {
        mouseRef.current.x = e.clientX;
        mouseRef.current.y = e.clientY;
      }
    };

    const drawStars = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      starsRef.current.forEach((star) => {
        if (!isMobile) {
          // Movimento natural básico
          star.x += star.directionX * star.speed * 0.2;
          star.y += star.directionY * star.speed * 0.2;
          
          // Influência do mouse
          const dx = mouseRef.current.x - star.x;
          const dy = mouseRef.current.y - star.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          const influenceRadius = 120;
          
          if (distance < influenceRadius) {
            const influence = (influenceRadius - distance) / influenceRadius;
            const mouseInfluence = influence * 0.8;
            
            star.x += (dx / distance) * mouseInfluence;
            star.y += (dy / distance) * mouseInfluence;
          }
        } else {
          star.x += star.directionX * star.speed * 0.2;
          star.y += star.directionY * star.speed * 0.2;
        }
        
        // Wrap around edges
        if (star.x > canvas.width) star.x = 0;
        if (star.x < 0) star.x = canvas.width;
        if (star.y > canvas.height) star.y = 0;
        if (star.y < 0) star.y = canvas.height;
        
        // Draw star
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = "white";
        ctx.fill();
        ctx.closePath();
      });
      
      animationRef.current = requestAnimationFrame(drawStars);
    };

    const handleResize = () => {
      resizeCanvas();
      initStars();
    };

    // Initialize
    resizeCanvas();
    initStars();
    
    // Set initial mouse position
    mouseRef.current.x = canvas.width / 2;
    mouseRef.current.y = canvas.height / 2;

    // Event listeners
    canvas.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('resize', handleResize);

    // Start animation
    drawStars();

    // Cleanup
    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      id="universe"
    />
  );
};

export default StarryBackground;