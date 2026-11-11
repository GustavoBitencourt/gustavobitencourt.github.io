import React, { useEffect, useRef, useState } from 'react';
import { createFootballField } from './engine';
import './FootballField.css';

// Lê ?q=ultra tanto da URL normal quanto da parte depois do # (HashRouter).
function readQuality() {
  const fromSearch = new URLSearchParams(window.location.search).get('q');
  const hash = window.location.hash;
  const i = hash.indexOf('?');
  const fromHash = i >= 0 ? new URLSearchParams(hash.slice(i + 1)).get('q') : null;
  return fromHash || fromSearch || undefined;
}

const FootballField = () => {
  const rootRef = useRef(null);
  const statsRef = useRef(null);
  const toastRef = useRef(null);
  const viewsRef = useRef(null);
  const [webglError, setWebglError] = useState(false);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'footField · Gramado 3D';
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const dispose = createFootballField(
      {
        root: rootRef.current,
        stats: statsRef.current,
        toast: toastRef.current,
        views: viewsRef.current,
        onError: () => setWebglError(true),
      },
      { quality: readQuality() },
    );

    return () => {
      dispose();
      document.title = prevTitle;
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  return (
    <div className="ff-root" ref={rootRef}>
      <header className="ff-brand">
        <h1>footField</h1>
        <p>Gramado profissional · 105 × 68 m</p>
        <p className="ff-stats" ref={statsRef}>preparando o gramado…</p>
      </header>

      <a className="ff-back" href="#/">← Voltar</a>

      <div className="ff-dock">
        <aside className="ff-help">
          <dl>
            <dt>Arrastar</dt><dd>olhar ao redor</dd>
            <dt>W A S D</dt><dd>voar</dd>
            <dt>E / Q</dt><dd>subir / descer</dd>
            <dt>Roda do mouse</dt><dd>zoom até a grama</dd>
            <dt>Shift</dt><dd>mais rápido</dd>
            <dt>F</dt><dd>prender o mouse (Esc solta)</dd>
            <dt>H</dt><dd>esconder a interface</dd>
          </dl>
        </aside>
        <nav className="ff-views" aria-label="Vistas prontas" ref={viewsRef} />
      </div>
      <div className="ff-toast" role="status" ref={toastRef} />

      {webglError && (
        <div className="ff-notice">
          <h2>WebGL 2 indisponível</h2>
          <p>
            Este visualizador precisa de WebGL 2. Atualize o navegador ou ative a aceleração de
            hardware nas configurações.
          </p>
        </div>
      )}
    </div>
  );
};

export default FootballField;
