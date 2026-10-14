import React from 'react';
import SteamInventoryViewer from './SteamInventoryViewer';
import './CS2.css';

const TestInventory = () => {
  return (
    <div className="cs2-container">
      <div className="cs2-background">
        <div className="cs2-content">
          <div className="cs2-header">
            <h1 className="cs2-title">Steam Inventory Test</h1>
            <div className="cs2-subtitle">Usando api.steamapis.com</div>
          </div>
          
          <div className="cs2-main-content">
            <div className="inventory-section">
              <h2>Inventário Real - GustavoAbu</h2>
              <p className="inventory-description">
                Conectando com api.steamapis.com para buscar inventário real
              </p>
              
              <div className="real-inventory-container">
                <h3 style={{ color: '#DE7E21', textAlign: 'center', marginBottom: '20px' }}>
                  Teste 1: Steam ID Direto (GustavoAbu)
                </h3>
                {/* Testando com Steam ID direto do GustavoAbu */}
                <SteamInventoryViewer steamId="76561198114488647" />
              </div>

              <div style={{ marginTop: '40px' }}>
                <h3 style={{ color: '#DE7E21', textAlign: 'center', marginBottom: '20px' }}>
                  Teste 2: Vanity URL (GustavoAbu)
                </h3>
                <div className="real-inventory-container">
                  {/* Testando com vanity URL */}
                  <SteamInventoryViewer vanityUrl="gustavoabu" />
                </div>
              </div>

              <div style={{ marginTop: '40px' }}>
                <h3 style={{ color: '#DE7E21', textAlign: 'center', marginBottom: '20px' }}>
                  Teste 3: Steam ID Público Conhecido (Exemplo)
                </h3>
                <div className="real-inventory-container">
                  {/* Teste com um Steam ID que sabemos que tem inventário público */}
                  <SteamInventoryViewer steamId="76561197960434622" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TestInventory;