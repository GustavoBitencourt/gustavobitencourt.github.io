// Código para criar as estrelas
const canvas = document.getElementById("universe");
const ctx = canvas.getContext("2d");
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

resizeCanvas();
window.addEventListener("resize", resizeCanvas);

const stars = [];
const starCount = isMobile ? 100 : 300;

for (let i = 0; i < starCount; i++) {
  stars.push({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    radius: Math.random() * 2 + 1,
    speed: Math.random() * 0.5 + 0.2,
    directionX: Math.random() * 2 - 1,
    directionY: Math.random() * 2 - 1,
  });
}

let mouse = { x: canvas.width / 2, y: canvas.height / 2 };

if (!isMobile) {
  canvas.addEventListener("mousemove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
}

function drawStars() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  stars.forEach((star) => {
    if (!isMobile) {
      // Movimento natural básico (sempre acontece)
      star.x += star.directionX * star.speed * 0.2;
      star.y += star.directionY * star.speed * 0.2;
      
      // Influência adicional do mouse
      const dx = mouse.x - star.x;
      const dy = mouse.y - star.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Definir o raio de influência do mouse (120 pixels)
      const influenceRadius = 120;
      
      if (distance < influenceRadius) {
        // Calcular a força baseada na distância (mais próximo = mais forte)
        const influence = (influenceRadius - distance) / influenceRadius;
        const mouseInfluence = influence * 0.8; // Fator de influência do mouse
        
        // Aplicar influência do mouse de forma sutil
        star.x += (dx / distance) * mouseInfluence;
        star.y += (dy / distance) * mouseInfluence;
      }
    } else {
      star.x += star.directionX * star.speed * 0.2;
      star.y += star.directionY * star.speed * 0.2;
    }
    
    if (star.x > canvas.width) star.x = 0;
    if (star.x < 0) star.x = canvas.width;
    if (star.y > canvas.height) star.y = 0;
    if (star.y < 0) star.y = canvas.height;
    
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
    ctx.fillStyle = "white";
    ctx.fill();
    ctx.closePath();
  });
  
  requestAnimationFrame(drawStars);
}

drawStars();

// Código para palavras na seção "Skills and Tools"
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

const container = document.getElementById("words-container");

function generateWords() {
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
        // Tamanhos um pouco maiores para mobile - ainda mais legível
        const mobileFontSizes = [0.62, 0.58, 0.65, 0.56, 0.61, 0.57, 0.64, 0.59, 0.56, 0.62, 
                                0.57, 0.63, 0.58, 0.55, 0.61, 0.57, 0.63, 0.59, 0.61, 0.56];
        fontSize = mobileFontSizes[index] || 0.58;
      } else {
        // Tamanhos mais variados para melhor adequação circular no desktop
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
      // Algoritmo com posições fixas para mobile - distribuição orgânica mas consistente
      const availableWidth = containerRect.width - 30; // Margem menor para deixar mais próximas
      const availableHeight = containerRect.height - 30;
      
      // Posições pré-definidas em padrão orgânico mas fixo - ainda mais concentradas
      const predefinedPositions = [
        { x: 0.12, y: 0.08 }, { x: 0.58, y: 0.04 }, { x: 0.32, y: 0.15 }, { x: 0.78, y: 0.12 },
        { x: 0.08, y: 0.22 }, { x: 0.48, y: 0.26 }, { x: 0.72, y: 0.24 }, { x: 0.28, y: 0.32 },
        { x: 0.85, y: 0.30 }, { x: 0.18, y: 0.38 }, { x: 0.52, y: 0.36 }, { x: 0.35, y: 0.44 },
        { x: 0.68, y: 0.42 }, { x: 0.12, y: 0.50 }, { x: 0.82, y: 0.48 }, { x: 0.42, y: 0.54 },
        { x: 0.62, y: 0.56 }, { x: 0.25, y: 0.60 }, { x: 0.75, y: 0.62 }, { x: 0.48, y: 0.66 }
      ];
      
      wordElements.forEach((wordObj, index) => {
        const position = predefinedPositions[index] || predefinedPositions[index % predefinedPositions.length];
        
        // Calcular posição baseada nas porcentagens pré-definidas
        let x = 15 + (position.x * availableWidth);
        let y = 15 + (position.y * availableHeight);
        
        // Garantir que a palavra não saia dos limites
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
          // Calcular posição em espiral
          const spiralTurns = attempts / 20;
          const angle = spiralTurns * 2 * Math.PI;
          const radius = Math.min(30 + (attempts * 4), maxRadius);
          
          const x = centerX + radius * Math.cos(angle) - wordObj.width / 2;
          const y = centerY + radius * Math.sin(angle) - wordObj.height / 2;
          
          // Verificar se está dentro dos limites
          if (x >= 15 && y >= 15 && 
              x + wordObj.width <= containerRect.width - 15 && 
              y + wordObj.height <= containerRect.height - 15) {
            
            const newPosition = {
              x: x,
              y: y,
              width: wordObj.width,
              height: wordObj.height
            };
            
            // Verificar colisão com elementos já colocados
            let hasCollision = false;
            for (let placedPos of placedElements) {
              if (isColliding(newPosition, placedPos)) {
                hasCollision = true;
                break;
              }
            }
            
            if (!hasCollision) {
              // Posição válida encontrada
              placedElements.push(newPosition);
              wordObj.element.style.left = `${x}px`;
              wordObj.element.style.top = `${y}px`;
              wordObj.element.style.visibility = "visible";
              placed = true;
            }
          }
          
          attempts++;
        }
        
        // Se não conseguiu colocar, força uma posição
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
  }, 50);
}

function isColliding(rect1, rect2) {
  const margin = 25; // Margem generosa para evitar sobreposição
  
  return !(rect1.x > rect2.x + rect2.width + margin ||
          rect1.x + rect1.width + margin < rect2.x ||
          rect1.y > rect2.y + rect2.height + margin ||
          rect1.y + rect1.height + margin < rect2.y);
}

// Gerar palavras quando a seção ficar visível
setTimeout(generateWords, 100);

// Regenerar em redimensionamento
window.addEventListener('resize', () => {
  setTimeout(generateWords, 100);
});

// Sistema de tradução de idiomas
const translations = {
  pt: {
    'hello': 'Olá,',
    'i-am': 'Eu sou',
    'role': 'Desenvolvedor Back-End',
    'skills-title': 'Habilidades e Ferramentas',
    'skills-description': 'Principais ferramentas e tecnologias utilizadas até o momento no desenvolvimento de projetos e soluções.',
    'contact-title': 'Entre em Contato',
    'contact-description': 'Vamos conversar sobre seu próximo projeto!',
    'contact-us': 'Contate-me'
  },
  en: {
    'hello': 'Hello,',
    'i-am': 'I am',
    'role': 'Back-End Developer',
    'skills-title': 'Skills and Tools',
    'skills-description': 'Main tools and technologies used to date in the development of projects and solutions.',
    'contact-title': 'Get in Touch',
    'contact-description': "Let's talk about your next project!",
    'contact-us': 'Contact me'
  },
  es: {
    'hello': 'Hola,',
    'i-am': 'Soy',
    'role': 'Desarrollador Back-End',
    'skills-title': 'Habilidades y Herramientas',
    'skills-description': 'Principales herramientas y tecnologías utilizadas hasta el momento en el desarrollo de proyectos y soluciones.',
    'contact-title': 'Ponte en Contacto',
    'contact-description': '¡Hablemos sobre tu próximo proyecto!',
    'contact-us': 'Contáctame'
  }
};

// Configurações de idioma
const languageConfig = {
  pt: { flag: '🇧🇷', text: 'PT' },
  en: { flag: '🇺🇸', text: 'EN' },
  es: { flag: '🇪🇸', text: 'ES' }
};

let currentLanguage = 'pt'; // Idioma padrão português

// Elementos do DOM
const languageBtn = document.getElementById('language-btn');
const languageDropdown = document.getElementById('language-dropdown');
const languageSwitcher = document.querySelector('.language-switcher');

// Função para traduzir a página
function translatePage(language) {
  const elements = document.querySelectorAll('[data-translate]');
  
  elements.forEach(element => {
    const key = element.getAttribute('data-translate');
    if (translations[language] && translations[language][key]) {
      element.textContent = translations[language][key];
    }
  });
  
  // Atualizar o botão principal
  const flagSpan = languageBtn.querySelector('.flag');
  const textSpan = languageBtn.querySelector('.lang-text');
  
  flagSpan.textContent = languageConfig[language].flag;
  textSpan.textContent = languageConfig[language].text;
  
  // Atualizar opções ativas
  document.querySelectorAll('.language-option').forEach(option => {
    option.classList.remove('active');
    if (option.getAttribute('data-lang') === language) {
      option.classList.add('active');
    }
  });
  
  currentLanguage = language;
  
  // Salvar preferência no localStorage
  localStorage.setItem('preferred-language', language);
}

// Toggle do dropdown
languageBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  languageSwitcher.classList.toggle('active');
});

// Fechar dropdown ao clicar fora
document.addEventListener('click', (e) => {
  if (!languageSwitcher.contains(e.target)) {
    languageSwitcher.classList.remove('active');
  }
});

// Seleção de idioma
document.querySelectorAll('.language-option').forEach(option => {
  option.addEventListener('click', (e) => {
    e.stopPropagation();
    const selectedLanguage = option.getAttribute('data-lang');
    translatePage(selectedLanguage);
    languageSwitcher.classList.remove('active');
  });
});

// Inicializar idioma
function initializeLanguage() {
  // Verificar se há idioma salvo no localStorage
  const savedLanguage = localStorage.getItem('preferred-language');
  
  if (savedLanguage && translations[savedLanguage]) {
    translatePage(savedLanguage);
  } else {
    // Idioma padrão português
    translatePage('pt');
  }
}

// Inicializar quando a página carregar
document.addEventListener('DOMContentLoaded', initializeLanguage);