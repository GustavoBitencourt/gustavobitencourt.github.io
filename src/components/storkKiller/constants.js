// Constantes do jogo
export const GAME_WIDTH = 1200;
export const GAME_HEIGHT = 600;

// Velocidades
export const STORK_SPEED = 5;
export const ENEMY_SPEED = 5;
export const BULLET_SPEED = 16;

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
  { level: 6, enemySpeed: 160, spawnInterval: 700, count: 18 },
  { level: 7, enemySpeed: 320, spawnInterval: 600, count: 20 },
  { level: 8, enemySpeed: 640, spawnInterval: 550, count: 22 },
  { level: 9, enemySpeed: 1280, spawnInterval: 500, count: 25 },
  { level: 10, enemySpeed: 2560, spawnInterval: 450, count: 28 },
  { level: 11, enemySpeed: 5120, spawnInterval: 400, count: 30 },
  { level: 12, enemySpeed: 10240, spawnInterval: 350, count: 32 },
  { level: 13, enemySpeed: 20480, spawnInterval: 300, count: 35 },
  { level: 14, enemySpeed: 40960, spawnInterval: 250, count: 38 },
  { level: 15, enemySpeed: 81920, spawnInterval: 200, count: 40 },
  { level: 16, enemySpeed: 163840, spawnInterval: 150, count: 42 },
  { level: 17, enemySpeed: 327680, spawnInterval: 100, count: 45 },
  { level: 18, enemySpeed: 655360, spawnInterval: 80, count: 48 },
  { level: 19, enemySpeed: 1310720, spawnInterval: 60, count: 50 },
  { level: 20, enemySpeed: 2621440, spawnInterval: 50, count: 55 },
];
