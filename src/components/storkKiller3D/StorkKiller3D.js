import React from 'react';
import './StorkKiller3D.css';

// O jogo é mantido no repositório StorkKiller3DStart (Three.js puro) e copiado
// para public/storkKiller3DStart; aqui a rota apenas o exibe em tela cheia.
const GAME_URL = `${process.env.PUBLIC_URL || ''}/storkKiller3DStart/index.html`;

const StorkKiller3D = () => (
  <iframe
    className="stork-killer-3d-frame"
    src={GAME_URL}
    title="StorKiller 3D"
    allow="fullscreen; autoplay; pointer-lock"
    allowFullScreen
  />
);

export default StorkKiller3D;
