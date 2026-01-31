import {
  checkCollision,
  getRandomEnemyPosition,
  normalizeVector,
} from './collision';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  STORK_SPEED,
  ENEMY_SPEED,
  BULLET_SPEED,
  STORK_WIDTH,
  STORK_HEIGHT,
  ENEMY_WIDTH,
  ENEMY_HEIGHT,
  BULLET_WIDTH,
  BULLET_HEIGHT,
  WAVES,
} from './constants';

export class GameEngine {
  constructor(canvas, images) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.images = images;
    
    // Inicializar áudios
    const basePath = process.env.PUBLIC_URL || '';
    this.sounds = {
      welcome: new Audio(`${basePath}/sounds/welcome.wav`),
      shoot: new Audio(`${basePath}/sounds/tiro.mp3`),
      hit: new Audio(`${basePath}/sounds/acert.mp3`),
    };
    
    // Configurar volume e preload
    this.sounds.welcome.volume = 0.3;
    this.sounds.shoot.volume = 0.3;
    this.sounds.hit.volume = 0.3;
    this.sounds.welcome.preload = 'auto';
    this.sounds.shoot.preload = 'auto';
    this.sounds.hit.preload = 'auto';
    
    this.reset();
  }

  reset() {
    // Player (Cegonha)
    this.player = {
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT - 100,
      width: STORK_WIDTH,
      height: STORK_HEIGHT,
      vx: 0,
      vy: 0,
    };

    // Arrays
    this.enemies = [];
    this.bullets = [];
    this.particles = [];

    // State
    this.score = 0;
    this.health = 3;
    this.wave = 1;
    this.gameRunning = true;
    this.gameOver = false;

    // Timing
    this.lastEnemySpawn = 0;
    this.enemySpawnInterval = 1500;
    this.kills = 0;
    this.lastWave = 1;
    this.waveChangeTime = 0; // Para efeito visual
    this.enemiesCreatedInWave = 0; // Contador de inimigos criados após mudança de wave

    // Input
    this.keys = {};
    this.mouseX = GAME_WIDTH / 2;
    this.mouseY = GAME_HEIGHT / 2;
    this.mousePressed = false;
  }

  handleKeyDown(key) {
    this.keys[key] = true;
  }

  handleKeyUp(key) {
    this.keys[key] = false;
  }

  handleMouseMove(x, y) {
    this.mouseX = x;
    this.mouseY = y;
  }

  handleMouseDown() {
    this.mousePressed = true;
  }

  handleMouseUp() {
    this.mousePressed = false;
  }

  startGame() {
    // Tocar som de boas-vindas
    this.playSound('welcome');
  }

  shoot() {
    // Calcular direção do mouse
    const dx = this.mouseX - (this.player.x + this.player.width / 2);
    const dy = this.mouseY - (this.player.y + this.player.height / 2);
    const { x: dirX, y: dirY } = normalizeVector(dx, dy);

    const bullet = {
      x: this.player.x + this.player.width / 2,
      y: this.player.y + this.player.height / 2,
      width: BULLET_WIDTH,
      height: BULLET_HEIGHT,
      vx: dirX * BULLET_SPEED,
      vy: dirY * BULLET_SPEED,
    };

    this.bullets.push(bullet);
    
    // Tocar som de tiro
    this.playSound('shoot');
  }

  playSound(soundName) {
    try {
      if (this.sounds && this.sounds[soundName]) {
        // Resetar o áudio para permitir toques rápidos
        this.sounds[soundName].currentTime = 0;
        const playPromise = this.sounds[soundName].play();
        
        // Lidar com possível erro de autoplay
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            console.log('Autoplay prevented:', error);
          });
        }
      }
    } catch (e) {
      console.error('Error playing sound:', e);
    }
  }

  spawnEnemy() {
    const pos = getRandomEnemyPosition(GAME_WIDTH, GAME_HEIGHT);
    const targetX = this.player.x + this.player.width / 2;
    const targetY = this.player.y + this.player.height / 2;

    const dx = targetX - pos.x;
    const dy = targetY - pos.y;
    const { x: dirX, y: dirY } = normalizeVector(dx, dy);

    // Usar velocidade baseada na wave atual
    const waveIndex = Math.min(this.wave - 1, WAVES.length - 1);
    const currentWave = WAVES[waveIndex];
    const enemySpeed = currentWave ? currentWave.enemySpeed : ENEMY_SPEED * Math.pow(2, this.wave - 1);

    const enemy = {
      x: pos.x,
      y: pos.y,
      width: ENEMY_WIDTH,
      height: ENEMY_HEIGHT,
      vx: dirX * enemySpeed,
      vy: dirY * enemySpeed,
      health: 1,
      isFlashing: this.enemiesCreatedInWave < 5, // Apenas os primeiros 5 inimigos piscam
      createdAtWaveChange: this.waveChangeTime,
    };

    this.enemiesCreatedInWave += 1;
    this.enemies.push(enemy);
  }

  update(deltaTime) {
    if (this.gameOver) return;

    // Movimento do player com teclado - Horizontal
    this.player.vx = 0;
    if (this.keys['ArrowLeft'] || this.keys['a']) this.player.vx = -STORK_SPEED;
    if (this.keys['ArrowRight'] || this.keys['d']) this.player.vx = STORK_SPEED;

    this.player.x += this.player.vx;

    // Movimento do player com teclado - Vertical
    this.player.vy = 0;
    if (this.keys['ArrowUp'] || this.keys['w']) this.player.vy = -STORK_SPEED;
    if (this.keys['ArrowDown'] || this.keys['s']) this.player.vy = STORK_SPEED;

    this.player.y += this.player.vy;

    // Limites da tela - Horizontal
    if (this.player.x < 0) this.player.x = 0;
    if (this.player.x + this.player.width > GAME_WIDTH) {
      this.player.x = GAME_WIDTH - this.player.width;
    }

    // Limites da tela - Vertical
    if (this.player.y < 0) this.player.y = 0;
    if (this.player.y + this.player.height > GAME_HEIGHT) {
      this.player.y = GAME_HEIGHT - this.player.height;
    }

    // Atirar
    if (this.mousePressed) {
      this.shoot();
      this.mousePressed = false; // Disparar uma vez por clique
    }
    if (this.keys[' ']) {
      this.shoot();
      this.keys[' '] = false;
    }

    // Atualizar bullets
    this.bullets = this.bullets.filter(bullet => {
      bullet.x += bullet.vx;
      bullet.y += bullet.vy;
      return (
        bullet.x > 0 &&
        bullet.x < GAME_WIDTH &&
        bullet.y > 0 &&
        bullet.y < GAME_HEIGHT
      );
    });

    // Atualizar inimigos
    this.enemies.forEach(enemy => {
      enemy.x += enemy.vx;
      enemy.y += enemy.vy;
    });

    // Spawn de inimigos
    if (this.gameRunning && Date.now() - this.lastEnemySpawn > this.enemySpawnInterval) {
      if (this.enemies.length < 15) {
        this.spawnEnemy();
        this.lastEnemySpawn = Date.now();
      }
    }

    // Colisões: bullet vs enemy
    this.bullets = this.bullets.filter(bullet => {
      let hit = false;
      this.enemies = this.enemies.filter(enemy => {
        if (checkCollision(bullet, enemy)) {
          hit = true;
          enemy.health -= 1;
          this.createParticles(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2);
          this.score += 10;
          this.kills += 1;
          
          // Tocar som de acerto
          this.playSound('hit');
          
          return false; // Remove enemy
        }
        return true;
      });
      return !hit; // Remove bullet se acertou
    });

    // Colisões: inimigo vs player
    this.enemies = this.enemies.filter(enemy => {
      if (checkCollision(this.player, enemy)) {
        this.health -= 1;
        this.createParticles(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2);
        if (this.health <= 0) {
          this.gameOver = true;
          this.gameRunning = false;
        }
        return false; // Remove enemy
      }
      return true;
    });

    // Remove inimigos que saem da tela
    this.enemies = this.enemies.filter(enemy => {
      return enemy.x > -ENEMY_WIDTH && enemy.x < GAME_WIDTH + ENEMY_WIDTH;
    });

    // Update waves - a cada 10 kills
    const newWave = Math.floor(this.kills / 10) + 1; // Sem limite, até 20 ou mais
    if (newWave !== this.wave) {
      this.wave = newWave;
      this.waveChangeTime = Date.now(); // Marcar tempo da mudança de wave
      this.enemiesCreatedInWave = 0; // Resetar contador de inimigos
      
      // Atualizar spawn interval baseado na wave
      const waveIndex = Math.min(this.wave - 1, WAVES.length - 1);
      const currentWave = WAVES[waveIndex];
      this.enemySpawnInterval = currentWave ? currentWave.spawnInterval : Math.max(50, 1500 - (this.wave - 1) * 200);
    }

    // Atualizar partículas
    this.particles = this.particles.filter(p => p.life > 0);
    this.particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 1;
    });
  }

  createParticles(x, y) {
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * 3,
        vy: Math.sin(angle) * 3,
        life: 30,
        color: `hsl(${Math.random() * 60 + 10}, 100%, 50%)`,
      });
    }
  }

  draw() {
    // Limpar canvas
    this.ctx.fillStyle = '#1a1a2e';
    this.ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Desenhar grid (opcional)
    this.ctx.strokeStyle = '#0f3460';
    this.ctx.lineWidth = 1;
    for (let i = 0; i < GAME_WIDTH; i += 100) {
      this.ctx.beginPath();
      this.ctx.moveTo(i, 0);
      this.ctx.lineTo(i, GAME_HEIGHT);
      this.ctx.stroke();
    }
    for (let i = 0; i < GAME_HEIGHT; i += 100) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, i);
      this.ctx.lineTo(GAME_WIDTH, i);
      this.ctx.stroke();
    }

    // Desenhar player (cegonha)
    if (this.images && this.images.stork && this.images.stork.complete && this.images.stork.naturalHeight > 0) {
      this.ctx.save();
      this.ctx.translate(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2);

      // Rotacionar para apontar para o mouse
      const dx = this.mouseX - (this.player.x + this.player.width / 2);
      const dy = this.mouseY - (this.player.y + this.player.height / 2);
      const angle = Math.atan2(dy, dx);
      this.ctx.rotate(angle);

      this.ctx.drawImage(
        this.images.stork,
        -this.player.width / 2,
        -this.player.height / 2,
        this.player.width,
        this.player.height
      );
      this.ctx.restore();
    } else {
      // Fallback: desenhar retângulo verde
      this.ctx.fillStyle = '#00ff00';
      this.ctx.save();
      this.ctx.translate(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2);
      
      const dx = this.mouseX - (this.player.x + this.player.width / 2);
      const dy = this.mouseY - (this.player.y + this.player.height / 2);
      const angle = Math.atan2(dy, dx);
      this.ctx.rotate(angle);

      this.ctx.fillRect(-this.player.width / 2, -this.player.height / 2, this.player.width, this.player.height);
      this.ctx.strokeStyle = '#00ff00';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(-this.player.width / 2, -this.player.height / 2, this.player.width, this.player.height);
      this.ctx.restore();
    }

    // Desenhar inimigos
    this.enemies.forEach(enemy => {
      // Efeito de piscar apenas para os primeiros 5 inimigos após mudança de wave
      const timeSinceWaveChange = Date.now() - enemy.createdAtWaveChange;
      const showFlashEffect = enemy.isFlashing && timeSinceWaveChange < 2000; // 2 segundos de efeito
      
      if (this.images && this.images.enemy && this.images.enemy.complete && this.images.enemy.naturalHeight > 0) {
        // Se está no efeito de mudança de wave, piscar cores
        if (showFlashEffect) {
          const colors = ['#ff0000', '#ff6600', '#ffff00', '#00ff00', '#0088ff', '#ff00ff'];
          const colorIndex = Math.floor((timeSinceWaveChange / 50) % colors.length);
          
          this.ctx.globalAlpha = 0.5 + (Math.sin(timeSinceWaveChange / 100) * 0.5);
          this.ctx.drawImage(
            this.images.enemy,
            enemy.x,
            enemy.y,
            enemy.width,
            enemy.height
          );
          this.ctx.globalAlpha = 1.0;
          
          // Desenhar borda colorida
          this.ctx.strokeStyle = colors[colorIndex];
          this.ctx.lineWidth = 3;
          this.ctx.strokeRect(enemy.x, enemy.y, enemy.width, enemy.height);
        } else {
          this.ctx.drawImage(
            this.images.enemy,
            enemy.x,
            enemy.y,
            enemy.width,
            enemy.height
          );
        }
      } else {
        // Fallback: desenhar retângulo
        if (showFlashEffect) {
          const colors = ['#ff0000', '#ff6600', '#ffff00', '#00ff00', '#0088ff', '#ff00ff'];
          const colorIndex = Math.floor((timeSinceWaveChange / 50) % colors.length);
          this.ctx.fillStyle = colors[colorIndex];
        } else {
          this.ctx.fillStyle = '#ff0000';
        }
        this.ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
        this.ctx.strokeStyle = this.ctx.fillStyle;
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(enemy.x, enemy.y, enemy.width, enemy.height);
      }
    });

    // Desenhar bullets
    this.bullets.forEach(bullet => {
      if (this.images && this.images.bullet && this.images.bullet.complete && this.images.bullet.naturalHeight > 0) {
        this.ctx.save();
        this.ctx.translate(bullet.x + bullet.width / 2, bullet.y + bullet.height / 2);
        
        // Rotacionar na direção do movimento
        const angle = Math.atan2(bullet.vy, bullet.vx);
        this.ctx.rotate(angle);
        
        this.ctx.drawImage(
          this.images.bullet,
          -bullet.width / 2,
          -bullet.height / 2,
          bullet.width,
          bullet.height
        );
        this.ctx.restore();
      } else {
        // Fallback: desenhar bolinha amarela
        this.ctx.fillStyle = '#ffff00';
        this.ctx.beginPath();
        this.ctx.arc(bullet.x + bullet.width / 2, bullet.y + bullet.height / 2, 5, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.strokeStyle = '#ffff00';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
      }
    });

    // Desenhar partículas
    this.particles.forEach(p => {
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = p.life / 30;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.globalAlpha = 1;
    });

    // HUD (Score, Health, Wave)
    this.drawHUD();
  }

  drawHUD() {
    const hudY = 30;
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = 'bold 20px Arial';
    this.ctx.fillText(`Score: ${this.score}`, 20, hudY);
    this.ctx.fillText(`Wave: ${this.wave}`, 20, hudY + 40);
    this.ctx.fillText(`Health: ${this.health}`, GAME_WIDTH - 200, hudY);
    this.ctx.fillText(`Kills: ${this.kills}`, GAME_WIDTH - 200, hudY + 40);

    if (this.gameOver) {
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      this.ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

      this.ctx.fillStyle = '#ff0000';
      this.ctx.font = 'bold 60px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('GAME OVER', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60);

      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = 'bold 30px Arial';
      this.ctx.fillText(`Final Score: ${this.score}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20);
      this.ctx.fillText(`Wave: ${this.wave}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60);

      this.ctx.textAlign = 'left';
    }
  }
}
