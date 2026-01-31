// Constantes do jogo
export const GAME_WIDTH = 1200;
export const GAME_HEIGHT = 600;

// Velocidades
export const STORK_SPEED = 5;
export const ENEMY_SPEED = 5;
export const BULLET_SPEED = 8;

// Tamanhos
export const STORK_WIDTH = 80;
export const STORK_HEIGHT = 80;
export const ENEMY_WIDTH = 50;
export const ENEMY_HEIGHT = 50;
export const BULLET_WIDTH = 30;
export const BULLET_HEIGHT = 15;

// Física
export const GRAVITY = 0.5;

// Spawn
export const ENEMY_SPAWN_INTERVAL = 1500; // ms
export const MAX_ENEMIES = 10;

export const WAVES = [
  { level: 1, enemySpeed: 5, spawnInterval: 2000, count: 3 },
  { level: 2, enemySpeed: 10, spawnInterval: 1500, count: 5 },
  { level: 3, enemySpeed: 20, spawnInterval: 1200, count: 8 },
  { level: 4, enemySpeed: 40, spawnInterval: 1000, count: 10 },
  { level: 5, enemySpeed: 80, spawnInterval: 800, count: 15 },
];
