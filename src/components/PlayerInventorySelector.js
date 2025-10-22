import React, { useState } from 'react';
import SteamInventoryViewer from './SteamInventoryViewer';

const PlayerInventorySelector = () => {
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  const players = [
    {
      id: 'gustavoabu',
      name: 'GustavoAbu',
      steamId: '76561198114488647',
      vanityUrl: null,
      avatar: '/images/GustavoAbu.jpeg',
      description: 'Support Player'
    },
    {
      id: 'romanelex',
      name: 'Romanelex',
      steamId: '76561198213870999',
      vanityUrl: null,
      avatar: '/images/Romanelex.jpeg',
      description: 'AWPer Principal'
    },
    {
      id: 'laura',
      name: 'laurachaquesz',
      steamId: '76561198281497115',
      vanityUrl: null,
      avatar: '/images/laura.jpeg',
      description: 'In-Game Leader'
    },
    {
      id: 'nando',
      name: 'nando',
      steamId: '76561198016716564',
      vanityUrl: null,
      avatar: '/images/Nando.jpeg',
      description: 'Entry Fragger'
    }
  ];

  if (selectedPlayer) {
    return (
      <div>
        {/* Header com botão de voltar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: '30px',
          padding: '20px',
          background: 'rgba(0,0,0,0.3)',
          borderRadius: '12px',
          border: '1px solid rgba(222, 126, 33, 0.3)'
        }}>
          <button
            onClick={() => setSelectedPlayer(null)}
            style={{
              background: 'rgba(222, 126, 33, 0.2)',
              border: '2px solid #DE7E21',
              color: '#DE7E21',
              padding: '10px 20px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 'bold',
              marginRight: '20px',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              e.target.style.background = '#DE7E21';
              e.target.style.color = '#000';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'rgba(222, 126, 33, 0.2)';
              e.target.style.color = '#DE7E21';
            }}
          >
            ← Voltar
          </button>
          <div>
            <h2 style={{ color: '#DE7E21', margin: '0 0 5px 0' }}>
              Inventário CS2 - {selectedPlayer.name}
            </h2>
            <p style={{ color: '#ccc', margin: 0, fontSize: '0.9rem' }}>
              {selectedPlayer.description}
            </p>
          </div>
        </div>

        {/* Componente de inventário */}
        <SteamInventoryViewer 
          steamId={selectedPlayer.steamId}
          vanityUrl={selectedPlayer.vanityUrl}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      {/* Título */}
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <h2 style={{ 
          color: '#DE7E21', 
          fontSize: '2rem', 
          fontWeight: 'bold',
          marginBottom: '10px' 
        }}>
          🎮 Inventários da Equipe
        </h2>
        <p style={{ color: '#ccc', fontSize: '1.1rem' }}>
          Selecione um jogador para visualizar seu inventário Steam CS2
        </p>
      </div>

      {/* Grid de Players */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '25px',
        maxWidth: '1200px',
        margin: '0 auto'
      }}>
        {players.map(player => (
          <div
            key={player.id}
            onClick={() => setSelectedPlayer(player)}
            style={{
              background: 'linear-gradient(135deg, rgba(0,0,0,0.4) 0%, rgba(222, 126, 33, 0.1) 100%)',
              border: '2px solid rgba(222, 126, 33, 0.3)',
              borderRadius: '15px',
              padding: '25px',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              position: 'relative',
              overflow: 'hidden'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)';
              e.currentTarget.style.boxShadow = '0 15px 40px rgba(222, 126, 33, 0.3)';
              e.currentTarget.style.borderColor = '#DE7E21';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0) scale(1)';
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.borderColor = 'rgba(222, 126, 33, 0.3)';
            }}
          >
            {/* Avatar */}
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: `url(${player.avatar}) center/cover`,
              margin: '0 auto 20px auto',
              border: '3px solid #DE7E21',
              boxShadow: '0 4px 15px rgba(222, 126, 33, 0.3)'
            }} />

            {/* Nome do Player */}
            <h3 style={{
              color: '#fff',
              fontSize: '1.4rem',
              fontWeight: 'bold',
              margin: '0 0 10px 0'
            }}>
              {player.name}
            </h3>

            {/* Descrição */}
            <p style={{
              color: '#DE7E21',
              fontSize: '1rem',
              fontWeight: 'bold',
              margin: '0 0 15px 0'
            }}>
              {player.description}
            </p>

            {/* Steam ID */}
            <div style={{
              background: 'rgba(0,0,0,0.3)',
              padding: '8px 12px',
              borderRadius: '20px',
              fontSize: '0.8rem',
              color: '#ccc',
              margin: '15px 0'
            }}>
              Steam: {player.steamId || player.vanityUrl}
            </div>

            {/* Call to Action */}
            <div style={{
              background: 'rgba(222, 126, 33, 0.2)',
              color: '#DE7E21',
              padding: '10px 20px',
              borderRadius: '8px',
              fontSize: '0.9rem',
              fontWeight: 'bold',
              border: '1px solid rgba(222, 126, 33, 0.5)',
              marginTop: '10px'
            }}>
              🎒 Ver Inventário
            </div>

            {/* Efeito de brilho */}
            <div style={{
              position: 'absolute',
              top: '-50%',
              left: '-50%',
              width: '200%',
              height: '200%',
              background: 'linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.1) 50%, transparent 70%)',
              transform: 'rotate(45deg)',
              transition: 'all 0.6s ease',
              opacity: 0,
              pointerEvents: 'none'
            }} />
          </div>
        ))}
      </div>

      {/* Nota */}
      <div style={{
        textAlign: 'center',
        marginTop: '40px',
        padding: '20px',
        background: 'rgba(222, 126, 33, 0.1)',
        borderRadius: '10px',
        border: '1px solid rgba(222, 126, 33, 0.3)'
      }}>
        <p style={{ color: '#DE7E21', fontSize: '0.9rem', margin: 0 }}>
          💡 <strong>Nota:</strong> Os inventários são obtidos diretamente da Steam API. 
          Certifique-se de que os perfis e inventários sejam públicos.
        </p>
      </div>
    </div>
  );
};

export default PlayerInventorySelector;