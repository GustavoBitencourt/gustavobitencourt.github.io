import React, { useState } from 'react';
import SteamInventoryViewer from './SteamInventoryViewer';

const CustomSteamInput = ({ onBack }) => {
  const [inputValue, setInputValue] = useState('');
  const [searchData, setSearchData] = useState(null);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = () => {
    if (!inputValue.trim()) {
      alert('Por favor, insira um Steam ID ou nome de usuário válido!');
      return;
    }

    setIsSearching(true);
    
    // Detectar automaticamente se é Steam ID (números) ou vanity URL (texto)
    const isNumeric = /^\d+$/.test(inputValue.trim());
    
    if (isNumeric) {
      // É um Steam ID numérico
      setSearchData({
        steamId: inputValue.trim(),
        vanityUrl: null
      });
    } else {
      // É um vanity URL (nome de usuário)
      setSearchData({
        steamId: null,
        vanityUrl: inputValue.trim()
      });
    }
    
    setIsSearching(false);
  };

  const handleReset = () => {
    setSearchData(null);
    setInputValue('');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  if (searchData) {
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
            onClick={handleReset}
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
              Inventário CS2 - {searchData.vanityUrl || searchData.steamId}
            </h2>
            <p style={{ color: '#ccc', margin: 0, fontSize: '0.9rem' }}>
              Buscando inventário personalizado...
            </p>
          </div>
        </div>

        {/* Componente de inventário */}
        <SteamInventoryViewer 
          steamId={searchData.steamId}
          vanityUrl={searchData.vanityUrl}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
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
          onClick={onBack}
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
            Buscar Inventário Personalizado
          </h2>
          <p style={{ color: '#ccc', margin: 0, fontSize: '0.9rem' }}>
            Digite seu Steam ID ou nome de usuário
          </p>
        </div>
      </div>

      {/* Seção de busca */}
      <div style={{
        maxWidth: '600px',
        margin: '0 auto',
        background: 'rgba(0,0,0,0.4)',
        borderRadius: '15px',
        padding: '30px',
        border: '2px solid rgba(222, 126, 33, 0.3)'
      }}>
        {/* Input */}
        <div style={{ marginBottom: '25px' }}>
          <label style={{
            display: 'block',
            color: '#DE7E21',
            fontSize: '1rem',
            fontWeight: 'bold',
            marginBottom: '10px'
          }}>
            Steam ID ou Nome de Usuário:
          </label>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ex: 76561198114488647 ou gustavoabu"
            style={{
              width: '100%',
              padding: '15px',
              fontSize: '1rem',
              border: '2px solid rgba(222, 126, 33, 0.3)',
              borderRadius: '10px',
              background: 'rgba(0,0,0,0.3)',
              color: '#fff',
              outline: 'none',
              transition: 'all 0.3s ease',
              boxSizing: 'border-box'
            }}
            onFocus={(e) => {
              e.target.style.borderColor = '#DE7E21';
              e.target.style.boxShadow = '0 0 10px rgba(222, 126, 33, 0.3)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'rgba(222, 126, 33, 0.3)';
              e.target.style.boxShadow = 'none';
            }}
          />
        </div>

        {/* Botão de busca */}
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={handleSearch}
            disabled={isSearching}
            style={{
              background: 'linear-gradient(135deg, #DE7E21 0%, #ff9800 100%)',
              border: 'none',
              color: '#fff',
              padding: '15px 40px',
              borderRadius: '10px',
              fontSize: '1.1rem',
              fontWeight: 'bold',
              cursor: isSearching ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: '0 4px 15px rgba(222, 126, 33, 0.3)',
              opacity: isSearching ? 0.7 : 1
            }}
            onMouseEnter={(e) => {
              if (!isSearching) {
                e.target.style.transform = 'translateY(-2px)';
                e.target.style.boxShadow = '0 6px 20px rgba(222, 126, 33, 0.4)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isSearching) {
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = '0 4px 15px rgba(222, 126, 33, 0.3)';
              }
            }}
          >
            {isSearching ? '🔄 Buscando...' : '🎯 Buscar Inventário'}
          </button>
        </div>

        {/* Informações de ajuda */}
        <div style={{
          marginTop: '30px',
          padding: '20px',
          background: 'rgba(222, 126, 33, 0.1)',
          borderRadius: '10px',
          border: '1px solid rgba(222, 126, 33, 0.3)'
        }}>
          <h4 style={{ color: '#DE7E21', margin: '0 0 15px 0' }}>
            💡 Opções de Busca Steam API:
          </h4>
          <div style={{ color: '#ccc', fontSize: '0.9rem', lineHeight: '1.6' }}>
            <p><strong>Steam ID (Numérico):</strong> Ex: 76561198114488647</p>
            <p><strong>Vanity URL:</strong> Ex: gustavoabu</p>
            <p><strong>⚠️ Importante:</strong> Seu perfil Steam e inventário devem estar públicos!</p>
            <p><strong>🔗 URL do Perfil:</strong> steamcommunity.com/profiles/[STEAM_ID]</p>
            <p><strong>🔗 URL Customizada:</strong> steamcommunity.com/id/[VANITY_URL]</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomSteamInput;