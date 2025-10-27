import React, { useEffect, useRef, useCallback } from 'react';

const SkillsSection = ({ t }) => {
  const containerRef = useRef(null);
  const isGenerating = useRef(false);

  const isColliding = (rect1, rect2) => {
    const margin = 25;
    
    return !(rect1.x > rect2.x + rect2.width + margin ||
            rect1.x + rect1.width + margin < rect2.x ||
            rect1.y > rect2.y + rect2.height + margin ||
            rect1.y + rect1.height + margin < rect2.y);
  };

  const generateWords = useCallback(() => {

    const words = [
      "Commerce Cloud",    // índice 0
      "Salesforce",        // índice 1
      "JavaScript",        // índice 2
      "NodeJs",           // índice 3
      "Postman",          // índice 4
      "Express",          // índice 5
      "React",            // índice 6
      "API",              // índice 7
      "Visual Studio",    // índice 8
      "Content Assets",   // índice 9
      "Page Designer",    // índice 10
      "Einstein",         // índice 11
      "Insomnia",         // índice 12 - SOBREPOSIÇÃO COM MYSQL
      "Jira",             // índice 13
      "Trello",           // índice 14
      "Git",              // índice 15
      "Bitbucket",        // índice 16
      "Docker",           // índice 17
      "Prisma",           // índice 18
      "TypeScript",       // índice 19
      "HTML5",            // índice 20
      "CSS3",             // índice 21
      "Bootstrap",        // índice 22 - SOBREPOSIÇÃO COM EINSTEIN
      "Flexbox",          // índice 23 - SOBREPOSIÇÃO COM CONTENT ASSETS
      "Grid Layout",      // índice 24 - SOBREPOSIÇÃO (Grid e Layout)
      "Responsive",       // índice 25
      "Sass",             // índice 26
      "jQuery",           // índice 27
      "Vue.js",           // índice 28
      "Next.js",          // índice 29
      "PostgreSQL",       // índice 30
      "MySQL"             // índice 31 - SOBREPOSIÇÃO COM INSOMNIA
    ];
    
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
                                  0.57, 0.63, 0.58, 0.55, 0.61, 0.57, 0.63, 0.59, 0.61, 0.56,
                                  0.60, 0.58, 0.62, 0.57, 0.59, 0.61, 0.56, 0.63, 0.58, 0.60,
                                  0.59, 0.57];
          fontSize = mobileFontSizes[index] || 0.58;
        } else {
          const desktopFontSizes = [1.4, 1.2, 1.1, 1.0, 0.9, 0.8, 1.3, 1.1, 0.95, 1.05, 
                                   0.85, 1.15, 0.9, 0.8, 1.0, 0.85, 1.1, 0.9, 1.0, 0.95,
                                   1.05, 0.88, 1.12, 0.92, 0.98, 1.08, 0.83, 1.18, 0.94, 1.02,
                                   0.96, 0.91];
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

      
      // FORÇA USAR POSIÇÕES FIXAS TANTO NO MOBILE QUANTO NO DESKTOP
      if (true) { // Mudança temporária: sempre usar posições fixas
        // Algoritmo com posições fixas
        const availableWidth = containerRect.width - 30;
        const availableHeight = containerRect.height - 30;
        
        const predefinedPositions = [
          { x: 0.45, y: 0.50 }, // 0 - Commerce Cloud (mais central)
          { x: 0.55, y: 0.12 }, // 1 - Salesforce (aproximado)
          { x: 0.42, y: 0.22 }, // 2 - JavaScript (mais central)
          { x: 0.65, y: 0.18 }, // 3 - NodeJs (aproximado)
          { x: 0.28, y: 0.25 }, // 4 - Postman (aproximado)
          { x: 0.48, y: 0.30 }, // 5 - Express (central)
          { x: 0.62, y: 0.28 }, // 6 - React (aproximado)
          { x: 0.38, y: 0.35 }, // 7 - API (aproximado)
          { x: 0.72, y: 0.35 }, // 8 - Visual Studio (aproximado)
          { x: 0.31, y: 0.43 }, // 9 - Content Assets (aproximado)
          { x: 0.52, y: 0.40 }, // 10 - Page Designer (central)
          { x: 0.32, y: 0.55 }, // 11 - Einstein (aproximado)
          { x: 0.65, y: 0.45 }, // 12 - Insomnia (separado do MySQL)
          { x: 0.22, y: 0.55 }, // 13 - Jira (aproximado)
          { x: 0.72, y: 0.52 }, // 14 - Trello (aproximado)
          { x: 0.48, y: 0.60 }, // 15 - Git (central)
          { x: 0.58, y: 0.60 }, // 16 - Bitbucket (aproximado)
          { x: 0.32, y: 0.65 }, // 17 - Docker (aproximado)
          { x: 0.70, y: 0.68 }, // 18 - Prisma (aproximado)
          { x: 0.48, y: 0.68 }, // 19 - TypeScript (central)
          { x: 0.25, y: 0.72 }, // 20 - HTML5 (aproximado)
          { x: 0.62, y: 0.72 }, // 21 - CSS3 (aproximado)
          { x: 0.43, y: 0.75 }, // 22 - Bootstrap (central baixo)
          { x: 0.22, y: 0.38 }, // 23 - Flexbox (lado esquerdo, aproximado)
          { x: 0.35, y: 0.82 }, // 24 - Grid Layout (aproximado)
          { x: 0.58, y: 0.82 }, // 25 - Responsive (aproximado)
          { x: 0.80, y: 0.50 }, // 26 - Sass (esquerda, aproximado)
          { x: 0.78, y: 0.58 }, // 27 - jQuery (direita, aproximado)
          { x: 0.45, y: 0.08 }, // 28 - Vue.js (topo central)
          { x: 0.68, y: 0.08 }, // 29 - Next.js (topo direita, aproximado)
          { x: 0.78, y: 0.78 }, // 30 - PostgreSQL (baixo esquerda)
          { x: 0.75, y: 0.25 }  // 31 - MySQL (direita, separado do Insomnia)
        ];
        
        wordElements.forEach((wordObj, index) => {
          let position = predefinedPositions[index] || predefinedPositions[index % predefinedPositions.length];
          
          // Ajuste específico para mobile: desloca para esquerda para melhor centralização
          if (isMobileDevice) {
            position = {
              x: Math.max(0.05, position.x - 0.08), // Desloca 8% para esquerda, mínimo 5%
              y: position.y
            };
          }
          
          let x = 15 + (position.x * availableWidth);
          let y = 15 + (position.y * availableHeight);
          
          x = Math.max(15, Math.min(x, containerRect.width - wordObj.width - 15));
          y = Math.max(15, Math.min(y, containerRect.height - wordObj.height - 15));
          
          // Log para debug - posições aplicadas

          
          wordObj.element.style.left = `${x}px`;
          wordObj.element.style.top = `${y}px`;
          wordObj.element.style.visibility = "visible";
        });
      } else {
        // Algoritmo híbrido para desktop: espiral + círculos concêntricos
        wordElements.forEach((wordObj, index) => {
          let placed = false;
          let attempts = 0;
          const maxAttempts = 150;
          
          // Primeiro tentar colocar em espiral
          while (!placed && attempts < maxAttempts) {
            const spiralTurns = attempts / 15;
            const angle = spiralTurns * 2 * Math.PI;
            const radius = Math.min(20 + (attempts * 3), maxRadius);
            
            const x = centerX + radius * Math.cos(angle) - wordObj.width / 2;
            const y = centerY + radius * Math.sin(angle) - wordObj.height / 2;
            
            if (x >= 10 && y >= 10 && 
                x + wordObj.width <= containerRect.width - 10 && 
                y + wordObj.height <= containerRect.height - 10) {
              
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
          
          // Se não conseguiu na espiral, usar círculos concêntricos
          if (!placed) {
            const circleIndex = Math.floor(index / 12);
            const positionInCircle = index % 12;
            const angle = (positionInCircle * 2 * Math.PI) / 12;
            const radius = Math.min(60 + (circleIndex * 80), maxRadius * 0.9);
            
            const fallbackX = centerX + radius * Math.cos(angle) - wordObj.width / 2;
            const fallbackY = centerY + radius * Math.sin(angle) - wordObj.height / 2;
            
            const finalX = Math.max(10, Math.min(fallbackX, containerRect.width - wordObj.width - 10));
            const finalY = Math.max(10, Math.min(fallbackY, containerRect.height - wordObj.height - 10));
            
            wordObj.element.style.left = `${finalX}px`;
            wordObj.element.style.top = `${finalY}px`;
            wordObj.element.style.visibility = "visible";
            
            placedElements.push({
              x: finalX,
              y: finalY,
              width: wordObj.width,
              height: wordObj.height
            });
          }
        });
      }
      
      isGenerating.current = false;
    }, 50);
  }, []); // useCallback sem dependências pois tudo está interno

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
  }, [generateWords]); // Incluir generateWords nas dependências

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