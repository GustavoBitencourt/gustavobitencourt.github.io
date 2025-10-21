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