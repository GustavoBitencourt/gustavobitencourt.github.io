import React, { useState } from 'react';
import SteamInventoryViewer from './SteamInventoryViewer';
import './CS2.css';

const SimpleInventoryTest = () => {
  const [testMode, setTestMode] = useState('mock');
  
  // Dados mockados para teste
  const mockInventory = [
    {
      id: "1",
      name: "AK-47 | Redline (Field-Tested)",
      image: "https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpot7HxfDhjxszJemkV09-5lpKKqPrxN7LEmyUG6pMj0r-UpIrz3gDnrRY6MmzyI4CcJlRoMFnVqAfvkrnr18K1ot2XnjR0x9uV",
      rarity: "Classified",
      rarityColor: "#d32ce6",
      type: "Rifle",
      exterior: "Field-Tested",
      tradeable: true,
      marketable: true
    },
    {
      id: "2", 
      name: "M4A4 | Howl (Minimal Wear)",
      image: "https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpou-6kejhz2v_Nfz5H_uO1gb-Gw_alDL_UkmkF6sB0teTE8J7yjRrnpBo9Zj2hJoXEdwY5NFnWq1_rl7vpgJ7qu5jNn3Ri7yQnsWGdwUJpgm4KMw",
      rarity: "Contraband",
      rarityColor: "#e4ae39", 
      type: "Rifle",
      exterior: "Minimal Wear",
      tradeable: true,
      marketable: true
    },
    {
      id: "3",
      name: "AWP | Dragon Lore (Battle-Scarred)",
      image: "https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpot621FAR17P7NdTRH-t26q4SClPv9NLPF2G8FscMk2b6To4n2jgC3-kNvMWHyctKdIwBvZVGF_lnqw7i9gJfvot2XnhpfhwOf",
      rarity: "Covert",
      rarityColor: "#eb4b4b",
      type: "Sniper Rifle", 
      exterior: "Battle-Scarred",
      tradeable: true,
      marketable: true
    },
    {
      id: "4",
      name: "Karambit | Fade (Factory New)",
      image: "https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpovbSsLQJf3qr3czxb49KzgL-DkvbiKvXSmm5u5Mx2gv2P9ufzjgLs-hY5ZGmiJ9DEdg9oNQ3Z8ljrxuy8h5O0ot2XnppMWu4O",
      rarity: "Covert",
      rarityColor: "#eb4b4b",
      type: "★ Knife",
      exterior: "Factory New", 
      tradeable: true,
      marketable: true
    }
  ];

  const MockInventoryDisplay = ({ items }) => (
    <div style={{ 
      display: 'grid', 
      gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', 
      gap: '20px',
      padding: '20px'
    }}>
      {items.map(item => (
        <div 
          key={item.id} 
          style={{ 
            textAlign: 'center',
            background: 'rgba(0,0,0,0.4)',
            borderRadius: '12px',
            padding: '15px',
            border: `2px solid ${item.rarityColor}`,
            transition: 'all 0.3s ease',
            cursor: 'pointer'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-5px) scale(1.02)';
            e.currentTarget.style.boxShadow = `0 10px 25px ${item.rarityColor}40`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0) scale(1)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{ marginBottom: '12px' }}>
            <img 
              src={item.image} 
              alt={item.name} 
              style={{ 
                width: '120px', 
                height: '90px', 
                objectFit: 'contain',
                filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))'
              }} 
            />
          </div>
          <div style={{ 
            color: '#fff', 
            fontSize: '0.85rem', 
            lineHeight: '1.3',
            fontWeight: 'bold',
            marginBottom: '8px',
            minHeight: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {item.name}
          </div>
          <div style={{ fontSize: '0.75rem' }}>
            <div style={{ 
              color: item.rarityColor,
              fontWeight: 'bold',
              marginBottom: '4px',
              textTransform: 'uppercase'
            }}>
              {item.rarity}
            </div>
            <div style={{ color: '#ccc', marginBottom: '4px' }}>
              {item.exterior}
            </div>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              gap: '8px',
              marginTop: '8px'
            }}>
              {item.tradeable && (
                <span style={{ 
                  background: '#4caf50', 
                  color: '#fff',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '0.7rem'
                }}>
                  📈 Trade
                </span>
              )}
              {item.marketable && (
                <span style={{ 
                  background: '#2196f3', 
                  color: '#fff',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '0.7rem'
                }}>
                  💰 Market
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="cs2-container">
      <div className="cs2-background">
        <div className="cs2-content">
          <div className="cs2-header">
            <h1 className="cs2-title">Steam Inventory Debug</h1>
            <div className="cs2-subtitle">Testando diferentes abordagens</div>
          </div>
          
          <div className="cs2-main-content">
            <div className="inventory-section">
              {/* Seletor de modo */}
              <div style={{ 
                textAlign: 'center', 
                marginBottom: '40px',
                background: 'rgba(222, 126, 33, 0.1)',
                padding: '20px',
                borderRadius: '10px',
                border: '1px solid rgba(222, 126, 33, 0.3)'
              }}>
                <h3 style={{ color: '#DE7E21', marginBottom: '15px' }}>Selecione o Modo de Teste</h3>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', flexWrap: 'wrap' }}>
                  <button 
                    onClick={() => setTestMode('mock')}
                    style={{
                      background: testMode === 'mock' ? '#DE7E21' : 'rgba(222, 126, 33, 0.2)',
                      color: '#fff',
                      border: '1px solid #DE7E21',
                      padding: '10px 20px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '0.9rem'
                    }}
                  >
                    🎮 Mock Data (Sempre Funciona)
                  </button>
                  <button 
                    onClick={() => setTestMode('real')}
                    style={{
                      background: testMode === 'real' ? '#DE7E21' : 'rgba(222, 126, 33, 0.2)',
                      color: '#fff',
                      border: '1px solid #DE7E21',
                      padding: '10px 20px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '0.9rem'
                    }}
                  >
                    🌐 Steam API Real (Debug)
                  </button>
                </div>
              </div>

              {testMode === 'mock' ? (
                <>
                  <h2>Inventário Mock - Funcionamento Visual</h2>
                  <p className="inventory-description">
                    Demonstrando como ficaria com dados reais da Steam
                  </p>
                  <div className="real-inventory-container">
                    <div style={{ 
                      textAlign: 'center', 
                      marginBottom: '25px', 
                      color: '#DE7E21',
                      fontSize: '1.1rem',
                      fontWeight: 'bold'
                    }}>
                      ✅ {mockInventory.length} armas encontradas (dados fictícios)
                    </div>
                    <MockInventoryDisplay items={mockInventory} />
                  </div>
                </>
              ) : (
                <>
                  <h2>Teste Steam API Real</h2>
                  <p className="inventory-description">
                    Debugando conexão com Steam via proxy
                  </p>
                  <div className="real-inventory-container">
                    <SteamInventoryViewer steamId="76561198114488647" />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SimpleInventoryTest;