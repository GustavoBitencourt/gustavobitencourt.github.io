import React, { useEffect, useRef } from 'react';

const SkillsSection = ({ t }) => {
  const containerRef = useRef(null);
  const isGenerating = useRef(false);

  const words = [
    "Commerce Cloud",
    "Salesforce",
    "JavaScript",
    "NodeJs",
    "Postman",
    "Express",
    "React",
    "API",
    "Visual Studio",
    "Content Assets",
    "Page Designer",
    "Einstein",
    "Insomnia",
    "Jira",
    "Trello",
    "Git",
    "Bitbucket",
    "Docker",
    "Prisma",
    "TypeScript"
  ];

  const isColliding = (rect1, rect2) => {
    const margin = 25;
    
    return !(rect1.x > rect2.x + rect2.width + margin ||
            rect1.x + rect1.width + margin < rect2.x ||
            rect1.y > rect2.y + rect2.height + margin ||
            rect1.y + rect1.height + margin < rect2.y);
  };

  const generateWords = () => {
    const container = containerRef.current;
    if (!container || isGenerating.current) return;

    isGenerating.current = true;

    // Limpar container primeiro
    container.innerHTML = '';
    
    // Aguardar um momento para container ter dimensões corretas
    setTimeout(() => {
      const containerRect = container.getBoundingClientRect();
      if (containerRect.width === 0 || containerRect.height === 0) return;
      
      const centerX = containerRect.width / 2;
      const centerY = containerRect.height / 2;
      const maxRadius = Math.min(centerX, centerY) * 0.75;
      
      // Detectar se é mobile para ajustar algoritmo
      const isMobileDevice = window.innerWidth <= 768;
      
      // Criar elementos com tamanhos variados para melhor distribuição circular
      const wordElements = words.map((word, index) => {
        const span = document.createElement("span");
        span.className = "word";
        span.textContent = word;
        
        // Tamanhos diferentes para desktop e mobile
        let fontSize;
        if (isMobileDevice) {
          const mobileFontSizes = [0.62, 0.58, 0.65, 0.56, 0.61, 0.57, 0.64, 0.59, 0.56, 0.62, 
                                  0.57, 0.63, 0.58, 0.55, 0.61, 0.57, 0.63, 0.59, 0.61, 0.56];
          fontSize = mobileFontSizes[index] || 0.58;
        } else {
          const desktopFontSizes = [1.4, 1.2, 1.1, 1.0, 0.9, 0.8, 1.3, 1.1, 0.95, 1.05, 
                                   0.85, 1.15, 0.9, 0.8, 1.0, 0.85, 1.1, 0.9, 1.0, 0.95];
          fontSize = desktopFontSizes[index] || 0.9;
        }
        
        span.style.fontSize = `${fontSize}rem`;
        span.style.position = "absolute";
        span.style.visibility = "hidden";
        
        container.appendChild(span);
        
        return {
          element: span,
          word: word,
          width: span.offsetWidth,
          height: span.offsetHeight,
          fontSize: fontSize
        };
      });
      
      const placedElements = [];
      
      // Algoritmo de colocação diferente para mobile e desktop
      if (isMobileDevice) {
        // Algoritmo com posições fixas para mobile
        const availableWidth = containerRect.width - 30;
        const availableHeight = containerRect.height - 30;
        
        const predefinedPositions = [
          { x: 0.12, y: 0.08 }, { x: 0.58, y: 0.04 }, { x: 0.32, y: 0.15 }, { x: 0.78, y: 0.12 },
          { x: 0.08, y: 0.22 }, { x: 0.48, y: 0.26 }, { x: 0.72, y: 0.24 }, { x: 0.28, y: 0.32 },
          { x: 0.85, y: 0.30 }, { x: 0.18, y: 0.38 }, { x: 0.52, y: 0.36 }, { x: 0.35, y: 0.44 },
          { x: 0.68, y: 0.42 }, { x: 0.12, y: 0.50 }, { x: 0.82, y: 0.48 }, { x: 0.42, y: 0.54 },
          { x: 0.62, y: 0.56 }, { x: 0.25, y: 0.60 }, { x: 0.75, y: 0.62 }, { x: 0.48, y: 0.66 }
        ];
        
        wordElements.forEach((wordObj, index) => {
          const position = predefinedPositions[index] || predefinedPositions[index % predefinedPositions.length];
          
          let x = 15 + (position.x * availableWidth);
          let y = 15 + (position.y * availableHeight);
          
          x = Math.max(15, Math.min(x, containerRect.width - wordObj.width - 15));
          y = Math.max(15, Math.min(y, containerRect.height - wordObj.height - 15));
          
          wordObj.element.style.left = `${x}px`;
          wordObj.element.style.top = `${y}px`;
          wordObj.element.style.visibility = "visible";
        });
      } else {
        // Algoritmo em espiral para desktop
        wordElements.forEach((wordObj, index) => {
          let placed = false;
          let attempts = 0;
          const maxAttempts = 200;
          
          while (!placed && attempts < maxAttempts) {
            const spiralTurns = attempts / 20;
            const angle = spiralTurns * 2 * Math.PI;
            const radius = Math.min(30 + (attempts * 4), maxRadius);
            
            const x = centerX + radius * Math.cos(angle) - wordObj.width / 2;
            const y = centerY + radius * Math.sin(angle) - wordObj.height / 2;
            
            if (x >= 15 && y >= 15 && 
                x + wordObj.width <= containerRect.width - 15 && 
                y + wordObj.height <= containerRect.height - 15) {
              
              const newPosition = {
                x: x,
                y: y,
                width: wordObj.width,
                height: wordObj.height
              };
              
              let hasCollision = false;
              for (let placedPos of placedElements) {
                if (isColliding(newPosition, placedPos)) {
                  hasCollision = true;
                  break;
                }
              }
              
              if (!hasCollision) {
                placedElements.push(newPosition);
                wordObj.element.style.left = `${x}px`;
                wordObj.element.style.top = `${y}px`;
                wordObj.element.style.visibility = "visible";
                placed = true;
              }
            }
            
            attempts++;
          }
          
          if (!placed) {
            const fallbackAngle = (index * 2 * Math.PI) / words.length;
            const fallbackRadius = maxRadius * 0.6;
            const fallbackX = centerX + fallbackRadius * Math.cos(fallbackAngle) - wordObj.width / 2;
            const fallbackY = centerY + fallbackRadius * Math.sin(fallbackAngle) - wordObj.height / 2;
            
            wordObj.element.style.left = `${Math.max(10, Math.min(fallbackX, containerRect.width - wordObj.width - 10))}px`;
            wordObj.element.style.top = `${Math.max(10, Math.min(fallbackY, containerRect.height - wordObj.height - 10))}px`;
            wordObj.element.style.visibility = "visible";
          }
        });
      }
      
      isGenerating.current = false;
    }, 50);
  };

  useEffect(() => {
    const handleResize = () => {
      setTimeout(generateWords, 100);
    };

    // Gerar palavras quando componente montar
    setTimeout(generateWords, 100);

    // Regenerar em redimensionamento
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <section id="skills-tools">
      <div className="left">
        <h1>{t('skills-title')}</h1>
        <p>{t('skills-description')}</p>
      </div>
      <div className="right" ref={containerRef}></div>
    </section>
  );
};

export default SkillsSection;