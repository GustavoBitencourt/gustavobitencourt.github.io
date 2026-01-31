// Funções de colisão
export const checkCollision = (rect1, rect2) => {
  return (
    rect1.x < rect2.x + rect2.width &&
    rect1.x + rect1.width > rect2.x &&
    rect1.y < rect2.y + rect2.height &&
    rect1.y + rect1.height > rect2.y
  );
};

// Calcular distância entre dois pontos
export const getDistance = (x1, y1, x2, y2) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
};

// Gerar posição aleatória para inimigo
export const getRandomEnemyPosition = (gameWidth, gameHeight) => {
  const y = Math.random() * (gameHeight - 100) + 50;
  const fromLeft = Math.random() > 0.5;
  const x = fromLeft ? -50 : gameWidth;
  
  return { x, y };
};

// Normalizar vetor (para direção)
export const normalizeVector = (x, y) => {
  const length = Math.sqrt(x * x + y * y);
  if (length === 0) return { x: 0, y: 0 };
  return { x: x / length, y: y / length };
};
