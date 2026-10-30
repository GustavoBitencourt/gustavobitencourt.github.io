import React, { useEffect, useState, useCallback } from 'react';
import { fetchSteam } from './steamProxy';

const SteamInventoryViewer = ({ steamId, vanityUrl }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [playerInfo, setPlayerInfo] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [displayedItems, setDisplayedItems] = useState(24); // Controla quantos itens mostrar
  
  // Estados para preços dos itens
  const [itemPrices, setItemPrices] = useState({}); // {itemName: {usd, brl, original}}
  const [exchangeRate, setExchangeRate] = useState(5.5);
  const [fetchingItems, setFetchingItems] = useState(new Set());
  const [attemptedItems, setAttemptedItems] = useState(new Set()); // Itens já tentados
  const [loadingAllPrices, setLoadingAllPrices] = useState(false); // Loading para busca de todos os preços
  const [inventoryTotalValue, setInventoryTotalValue] = useState(0); // Valor total do inventário

  // Estado para controle de debounce do som de hover
  const [lastHoverTime, setLastHoverTime] = useState(0);

  // Funções de áudio para interações
  const playHoverSound = () => {
    const now = Date.now();
    // Debounce de 200ms para evitar spam de sons
    if (now - lastHoverTime < 200) return;
    
    setLastHoverTime(now);
    try {
      const audio = new Audio('/sounds/glock_sliderelease.wav');
      audio.volume = 0.128; // Volume reduzido pela metade (0.255 -> 0.128)
      audio.play().catch(e => {});
    } catch (error) {
      // Silenciosamente ignorar erros de áudio
    }
  };

  const playClickSound = () => {
    try {
      const audio = new Audio('/sounds/m4a1_silencer_01.wav');
      audio.volume = 0.128; // Volume reduzido pela metade (0.255 -> 0.128)
      audio.play().catch(e => {});
    } catch (error) {
      // Silenciosamente ignorar erros de áudio
    }
  };

  // Função para encontrar float real da API
  const getFloatFromAssetProperties = (assetId, assetProperties) => {
    if (!assetProperties || !Array.isArray(assetProperties)) return null;
    
    const assetData = assetProperties.find(asset => asset.assetid === assetId);
    if (!assetData || !assetData.asset_properties) return null;
    
    const wearRating = assetData.asset_properties.find(prop => prop.name === 'Wear Rating');
    return wearRating ? parseFloat(wearRating.float_value).toFixed(4) : null;
  };

  // Função para buscar todos os preços do inventário
  const fetchAllPrices = async () => {
    if (loadingAllPrices) return; // Evitar múltiplas execuções
    
    setLoadingAllPrices(true);
    
    // Filtrar itens marketáveis que ainda não têm preço
    const marketableItems = items.filter(item => 
      item.marketable && 
      item.name && 
      !item.name.toLowerCase().includes('sticker') && 
      !item.name.toLowerCase().includes('case') &&
      !itemPrices[item.name] // Não buscar se já tem preço
    );
    
    // Se não há itens para buscar, calcular total com os preços existentes e sair
    if (marketableItems.length === 0) {
      calculateTotalValue();
      setLoadingAllPrices(false);
      return;
    }
    
    // Criar array de promises para aguardar todas as buscas
    const pricePromises = marketableItems.map((item, index) => {
      return new Promise((resolve) => {
        setTimeout(async () => {
          try {
            await fetchItemPrice(item.name);
            resolve();
          } catch (error) {
            resolve();
          }
        }, index * 50); // O ritmo real é controlado pela fila em steamProxy.js
      });
    });
    
    // Aguardar todas as buscas terminarem
    await Promise.all(pricePromises);
    
    // Calcular valor total após todas as buscas
    setTimeout(() => {
      calculateTotalValue();
      setLoadingAllPrices(false);
    }, 1000); // Pequeno delay para garantir que todos os estados foram atualizados
  };

  // Função para calcular valor total do inventário
  const calculateTotalValue = useCallback(() => {
    let total = 0;
    
    items.forEach(item => {
      if (item.marketable && itemPrices[item.name]) {
        const price = parseFloat(itemPrices[item.name].brl);
        if (!isNaN(price)) {
          total += price;
        }
      }
    });
    
    setInventoryTotalValue(total);
  }, [items, itemPrices]);

  // Função para abrir modal
  const openModal = (item) => {
    // Tocar som de clique
    playClickSound();
    
    setSelectedItem(item);
    setShowModal(true);
    
    // Buscar preço se item é marketável e ainda não foi tentado
    if (item.marketable && item.name && !itemPrices[item.name] && !attemptedItems.has(item.name)) {
      fetchItemPrice(item.name);
    }
    
    // Impedir scroll do body quando modal está aberto
    document.body.style.overflow = 'hidden';
  };

  // Função para fechar modal
  const closeModal = () => {
    setShowModal(false);
    setSelectedItem(null);
    
    // Restaurar scroll do body quando modal fecha
    document.body.style.overflow = 'unset';
  };

  // Função para carregar mais itens
  const loadMoreItems = () => {
    setDisplayedItems(prev => Math.min(prev + 24, items.length));
  };

  // Função para buscar preço individual no Steam Market
  const fetchItemPrice = useCallback(async (itemName) => {
    if (!itemName || itemPrices[itemName] || attemptedItems.has(itemName)) return; // Não buscar se já tem ou já tentou
    
    if (fetchingItems.has(itemName)) {
      return null;
    }
    
    // Marcar como sendo buscado
    setFetchingItems(prev => new Set(prev).add(itemName));
    let rateLimited = false;

    try {
      
      const marketUrl = `https://steamcommunity.com/market/priceoverview/?currency=1&appid=730&market_hash_name=${encodeURIComponent(itemName)}`;
      
      const priceData = await fetchSteam(marketUrl);
      
      if (priceData && priceData.success) {
        // Usar lowest_price como prioridade
        const steamPrice = priceData.lowest_price || priceData.median_price || "N/A";
        
        if (steamPrice && steamPrice !== "N/A") {
          const match = steamPrice.match(/\$?([\d,.]+)/);
          if (match) {
            const numericPrice = parseFloat(match[1].replace(',', ''));
            if (!isNaN(numericPrice)) {
              const convertedBRL = (numericPrice * exchangeRate).toFixed(2);
              
              // Atualizar estado com o preço encontrado
              setItemPrices(prev => ({
                ...prev,
                [itemName]: {
                  usd: numericPrice.toFixed(2),
                  brl: convertedBRL,
                  original: steamPrice
                }
              }));
              
              return;
            }
          }
        }
      }
      
    } catch (error) {
      // Limite da Steam (429): não marcar como tentado, para poder buscar de novo depois
      rateLimited = error.status === 429;
    } finally {
      // Marcar como tentado e remover do conjunto de busca
      if (!rateLimited) setAttemptedItems(prev => new Set(prev).add(itemName));
      setFetchingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(itemName);
        return newSet;
      });
    }
  }, [itemPrices, exchangeRate, fetchingItems, attemptedItems]);

  // Adicionar estilos de animação do modal
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes modalFadeIn {
        from {
          opacity: 0;
          transform: scale(0.8) translateY(-20px);
        }
        to {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }
      
      @keyframes spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    };
  }, []);

  // Buscar taxa de câmbio USD -> BRL
  useEffect(() => {
    const fetchExchangeRate = async () => {
      try {
        const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
        const data = await response.json();
        if (data.rates && data.rates.BRL) {
          setExchangeRate(data.rates.BRL);
        }
      } catch (error) {
        setExchangeRate(5.5);
      }
    };
    
    fetchExchangeRate();
  }, []);

  useEffect(() => {
    const fetchInventory = async () => {
      try {
        setLoading(true);
        setError(null);
        
        let resolvedSteamId = steamId;
        
        // Se não temos Steam ID, resolver a partir da vanity URL usando método XML
        if (!steamId && vanityUrl) {

          
          try {
            // Método direto via XML (mais confiável)
            const profileXmlUrl = `https://steamcommunity.com/id/${vanityUrl}?xml=1`;
            const profileXml = await fetchSteam(profileXmlUrl, { as: 'text' });
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(profileXml, "text/xml");
            
            const steamId64Element = xmlDoc.getElementsByTagName("steamID64")[0];
            const personaNameElement = xmlDoc.getElementsByTagName("steamID")[0];
            const avatarElement = xmlDoc.getElementsByTagName("avatarMedium")[0];
            
            if (steamId64Element) {
              resolvedSteamId = steamId64Element.textContent;
              
              // Criar info do player a partir do XML
              setPlayerInfo({
                steamid: resolvedSteamId,
                personaname: personaNameElement ? personaNameElement.textContent : vanityUrl,
                avatar: avatarElement ? avatarElement.textContent : null
              });
              

            } else {
              throw new Error("Steam ID não encontrado no XML");
            }
          } catch (xmlError) {

            throw new Error(`Não foi possível resolver Steam ID para '${vanityUrl}'`);
          }
        }
        
        // Buscar inventário CS2 usando múltiplos métodos

        const inventoryUrl = `https://steamcommunity.com/inventory/${resolvedSteamId}/730/2?l=english&count=100`;

        
        const inventoryData = await fetchSteam(inventoryUrl);

        if (!inventoryData) {
          throw new Error('Inventário privado ou indisponível');
        }
        

        
        if (!inventoryData.success) {
          if (inventoryData.Error) {
            throw new Error(`Steam: ${inventoryData.Error}`);
          } else {
            throw new Error("Inventário privado ou erro na Steam - verifique se o perfil e inventário são públicos");
          }
        }
        
        // Mapear descrições (formato Steam padrão)
        const descriptions = {};
        for (const desc of inventoryData.descriptions || []) {
          descriptions[`${desc.classid}_${desc.instanceid}`] = desc;
        }
        
        // Processar assets e filtrar apenas armas/skins
        const allItems = (inventoryData.assets || []).map(asset => {
          const key = `${asset.classid}_${asset.instanceid}`;
          const desc = descriptions[key] || {};
          const icon = desc.icon_url || "";
          
          const itemName = desc.market_hash_name || desc.name || "Item desconhecido";
          const rarity = desc.tags?.find(tag => tag.category === "Rarity")?.localized_tag_name || "Consumer Grade";
          
          // Buscar float real da API se disponível
          const realFloat = getFloatFromAssetProperties(asset.assetid, inventoryData.asset_properties);
          
          return {
            id: asset.assetid,
            name: itemName,
            image: icon ? `https://steamcommunity-a.akamaihd.net/economy/image/${icon}` : null,
            type: desc.type || "Unknown",
            rarity: rarity,
            rarityColor: desc.tags?.find(tag => tag.category === "Rarity")?.color || "#b0c3d9",
            exterior: desc.tags?.find(tag => tag.category === "Exterior")?.localized_tag_name || "",
            tradeable: desc.tradable || false,
            marketable: desc.marketable || false,
            weaponType: desc.tags?.find(tag => tag.category === "Type")?.localized_tag_name || "",
            float: realFloat, // Usar apenas float real da API
            description: desc
          };
        });
        
        // Filtrar apenas skins/weapons (remover cases, stickers, etc.)
        const weapons = allItems.filter(item => 
          item.image && (
            item.weaponType?.includes('Rifle') || 
            item.weaponType?.includes('Pistol') || 
            item.weaponType?.includes('SMG') || 
            item.weaponType?.includes('Shotgun') || 
            item.weaponType?.includes('Sniper') || 
            item.weaponType?.includes('Knife') || 
            item.weaponType?.includes('Machinegun') ||
            item.type?.includes('★') || // Items especiais (facas, etc.)
            (item.marketable && item.type && !item.type.toLowerCase().includes('sticker') && !item.type.toLowerCase().includes('case'))
          )
        );
        

        
        const mappedItems = weapons;
        

        setItems(mappedItems);
        
        // Iniciar busca de preços em background para itens marketáveis

        
      } catch (err) {

        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (steamId || vanityUrl) {
      fetchInventory();
    }
  }, [steamId, vanityUrl, fetchItemPrice]);

  // useEffect para recalcular valor total sempre que itemPrices mudar
  useEffect(() => {
    if (Object.keys(itemPrices).length > 0) {
      calculateTotalValue();
    }
  }, [itemPrices, calculateTotalValue]);

  if (loading) {
    return (
      <div style={{ 
        textAlign: 'center', 
        padding: '40px', 
        color: '#fff',
        background: 'rgba(0,0,0,0.3)',
        borderRadius: '10px',
        border: '1px solid rgba(222, 126, 33, 0.3)'
      }}>
        <div style={{ fontSize: '1.2rem', marginBottom: '10px' }}>
          🔄 Carregando inventário da Steam...
        </div>
        <div style={{ fontSize: '0.9rem', color: '#DE7E21' }}>
          Conectando com api.steamapis.com
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        textAlign: 'center', 
        padding: '40px', 
        color: '#ff4444',
        background: 'rgba(255, 68, 68, 0.1)',
        borderRadius: '10px',
        border: '1px solid rgba(255, 68, 68, 0.3)'
      }}>
        <div style={{ fontSize: '1.2rem', marginBottom: '15px' }}>
          ❌ Erro ao carregar inventário
        </div>
        <div style={{ fontSize: '1rem', marginBottom: '10px' }}>
          {error}
        </div>
        <div style={{ fontSize: '0.8rem', color: '#ccc' }}>
          💡 Dicas: Verifique se o perfil e inventário são públicos
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div style={{ 
        textAlign: 'center', 
        padding: '40px', 
        color: '#fff',
        background: 'rgba(0,0,0,0.3)',
        borderRadius: '10px',
        border: '1px solid rgba(222, 126, 33, 0.3)'
      }}>
        <div style={{ fontSize: '1.2rem', marginBottom: '10px' }}>
          📦 Nenhuma arma encontrada
        </div>
        <div style={{ fontSize: '0.9rem', color: '#ccc' }}>
          O inventário pode estar vazio ou contém apenas outros tipos de items
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Overlay de loading para busca de preços */}
      {loadingAllPrices && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingTop: '150px',
          zIndex: 9999,
          backdropFilter: 'blur(5px)'
        }}>
          <div style={{
            width: '60px',
            height: '60px',
            border: '4px solid rgba(76, 175, 80, 0.3)',
            borderTop: '4px solid #4caf50',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            marginBottom: '20px'
          }}></div>
          <div style={{
            color: '#4caf50',
            fontSize: '1.2rem',
            fontWeight: 'bold',
            marginBottom: '10px'
          }}>
            Buscando preços de todos os itens...
          </div>
          <div style={{
            color: '#aaa',
            fontSize: '0.9rem',
            textAlign: 'center',
            maxWidth: '400px'
          }}>
            Aguarde enquanto buscamos os preços atualizados do Mercado da Steam.
            Este processo pode levar alguns minutos.
          </div>
        </div>
      )}

      {/* Player Info */}
      {playerInfo && (
        <div style={{ 
          textAlign: 'center', 
          marginBottom: '30px',
          padding: '20px',
          background: 'rgba(222, 126, 33, 0.1)',
          borderRadius: '10px',
          border: '1px solid rgba(222, 126, 33, 0.3)'
        }}>
          {playerInfo.avatar && (
            <img 
              src={playerInfo.avatar} 
              alt={playerInfo.personaname}
              style={{ 
                width: '64px', 
                height: '64px', 
                borderRadius: '50%',
                marginBottom: '10px'
              }}
            />
          )}
          <div style={{ color: '#DE7E21', fontSize: '1.3rem', fontWeight: 'bold' }}>
            {playerInfo.personaname}
          </div>
          <div style={{ color: '#ccc', fontSize: '0.9rem' }}>
            Steam ID: {playerInfo.steamid}
          </div>
        </div>
      )}

      {/* Controles de preços no topo */}
      {items.length > 0 && (
        <div style={{ 
          textAlign: 'center',
          marginBottom: '30px',
          padding: '20px',
          background: 'rgba(76, 175, 80, 0.05)',
          borderRadius: '15px',
          border: '1px solid rgba(76, 175, 80, 0.2)'
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            gap: '20px',
            flexWrap: 'wrap'
          }}>
            {/* Botão para buscar todos os preços */}
            <button
              onClick={fetchAllPrices}
              disabled={loadingAllPrices}
              style={{
                background: loadingAllPrices 
                  ? 'linear-gradient(135deg, #666 0%, #888 100%)' 
                  : 'linear-gradient(135deg, #4caf50 0%, #66bb6a 100%)',
                border: 'none',
                color: '#fff',
                padding: '12px 25px',
                borderRadius: '25px',
                fontSize: '0.95rem',
                fontWeight: 'bold',
                cursor: loadingAllPrices ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                transition: 'all 0.3s ease',
                opacity: loadingAllPrices ? 0.7 : 1,
                minWidth: '200px'
              }}
            >
              {loadingAllPrices ? (
                <>
                  <div style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid #fff',
                    borderTop: '2px solid transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }}></div>
                  Buscando preços...
                </>
              ) : (
                <>💰 Buscar Todos os Preços</>
              )}
            </button>

            {/* Valor total do inventário ao lado */}
            {(inventoryTotalValue > 0 || Object.keys(itemPrices).length > 0) && (
              <div style={{
                background: 'rgba(76, 175, 80, 0.1)',
                border: '2px solid rgba(76, 175, 80, 0.3)',
                borderRadius: '15px',
                padding: '12px 20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                minWidth: '200px'
              }}>
                <div style={{
                  color: '#4caf50',
                  fontSize: '0.85rem',
                  fontWeight: 'bold',
                  marginBottom: '5px'
                }}>
                  💎 Valor Total
                </div>
                <div style={{
                  color: '#4caf50',
                  fontSize: '1.4rem',
                  fontWeight: 'bold'
                }}>
                  R$ {inventoryTotalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Items Count */}
      <div style={{ 
        textAlign: 'center', 
        marginBottom: '25px', 
        color: '#DE7E21',
        fontSize: '1.1rem',
        fontWeight: 'bold'
      }}>
        ✅ {items.length} armas encontradas
      </div>

      {/* Items Grid */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', 
        gap: '20px',
        padding: '20px'
      }}>
        {items.slice(0, displayedItems).map(item => (
          <div 
            key={item.id} 
            style={{ 
              textAlign: 'center',
              background: 'rgba(0,0,0,0.4)',
              borderRadius: '12px',
              padding: '15px',
              border: `2px solid ${item.rarityColor || 'rgba(222, 126, 33, 0.3)'}`,
              transition: 'all 0.3s ease',
              cursor: 'pointer'
            }}
            onClick={() => openModal(item)}
            onMouseEnter={(e) => {
              // Tocar som de hover
              playHoverSound();
              
              e.currentTarget.style.transform = 'translateY(-5px) scale(1.02)';
              e.currentTarget.style.boxShadow = `0 10px 25px ${item.rarityColor}40`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0) scale(1)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            {/* Item Image */}
            <div style={{ marginBottom: '12px', position: 'relative' }}>
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
              {/* Indicador de Raridade */}
              <div style={{
                position: 'absolute',
                bottom: '-2px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '0',
                height: '0',
                borderLeft: '15px solid transparent',
                borderRight: '15px solid transparent',
                borderBottom: `12px solid #${item.rarityColor}`,
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
              }}></div>
            </div>

            {/* Item Name */}
            <div style={{ 
              color: '#fff', 
              fontSize: '0.85rem', 
              lineHeight: '1.3',
              fontWeight: 'bold',
              marginBottom: '8px',
              wordBreak: 'break-word',
              minHeight: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {item.name}
            </div>

            {/* Item Details */}
            <div style={{ fontSize: '0.75rem' }}>
              {item.rarity && (
                <div style={{ 
                  color: item.rarityColor,
                  fontWeight: 'bold',
                  marginBottom: '4px',
                  textTransform: 'uppercase'
                }}>
                  {item.rarity}
                </div>
              )}
              
              {item.exterior && (
                <div style={{ color: '#ccc', marginBottom: '4px' }}>
                  {item.exterior}
                </div>
              )}

              {/* Float real da API (apenas se existir) */}
              {item.float && (
                <div style={{ 
                  color: '#ff9800',
                  fontSize: '0.7rem',
                  marginBottom: '8px'
                }}>
                  Float: {item.float}
                </div>
              )}

              {/* Preço do Steam Market */}
              {item.marketable && (
                <div style={{ 
                  background: itemPrices[item.name] ? 'rgba(76, 175, 80, 0.1)' : 'rgba(136, 136, 136, 0.1)',
                  border: `1px solid ${itemPrices[item.name] ? 'rgba(76, 175, 80, 0.3)' : 'rgba(136, 136, 136, 0.2)'}`,
                  borderRadius: '6px',
                  padding: '6px 8px',
                  marginBottom: '8px',
                  minHeight: '16px',
                  fontSize: '0.72rem',
                  fontWeight: 'bold'
                }}>
                  {itemPrices[item.name] ? (
                    <span style={{ color: '#4caf50' }}>💰 R$ {itemPrices[item.name].brl}</span>
                  ) : fetchingItems.has(item.name) ? (
                    <span style={{ color: '#ff9800' }}>⏳ Buscando...</span>
                  ) : attemptedItems.has(item.name) ? (
                    <span style={{ color: '#666' }}>💰 Sem preço</span>
                  ) : (
                    <span style={{ color: '#2196f3' }}>💰 Clique para preço</span>
                  )}
                </div>
              )}

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

      {/* Load More Section */}
      {items.length > displayedItems && (
        <div style={{ textAlign: 'center', marginTop: '30px' }}>
          <div style={{ 
            color: '#DE7E21',
            fontSize: '0.9rem',
            padding: '15px',
            background: 'rgba(222, 126, 33, 0.1)',
            borderRadius: '8px',
            border: '1px solid rgba(222, 126, 33, 0.3)',
            marginBottom: '20px'
          }}>
            📦 Mostrando {displayedItems} de {items.length} items
          </div>
          
          <button
            onClick={loadMoreItems}
            style={{
              background: 'linear-gradient(135deg, #DE7E21 0%, #ff9800 100%)',
              border: 'none',
              color: '#fff',
              padding: '15px 30px',
              borderRadius: '10px',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: '0 4px 15px rgba(222, 126, 33, 0.3)'
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = 'translateY(-2px)';
              e.target.style.boxShadow = '0 6px 20px rgba(222, 126, 33, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = '0 4px 15px rgba(222, 126, 33, 0.3)';
            }}
          >
            📥 Carregar Mais Itens ({Math.min(24, items.length - displayedItems)} restantes)
          </button>
        </div>
      )}

      {/* All items loaded message */}
      {items.length > 24 && displayedItems >= items.length && (
        <div style={{ textAlign: 'center', marginTop: '30px' }}>
          <div style={{ 
            color: '#4caf50',
            fontSize: '0.9rem',
            padding: '15px',
            background: 'rgba(76, 175, 80, 0.1)',
            borderRadius: '8px',
            border: '1px solid rgba(76, 175, 80, 0.3)'
          }}>
            ✅ Todos os {items.length} itens carregados!
          </div>
        </div>
      )}

      {/* Modal para expandir item */}
      {showModal && selectedItem && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            // height: '100%',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            paddingTop: '5%',
            paddingLeft: '20px',
            paddingRight: '20px',
            paddingBottom: '20px',
            zIndex: 1000,
            backdropFilter: 'blur(5px)',
            boxSizing: 'border-box',
            overflowY: 'auto'
          }}
          onClick={closeModal}
        >
          <div 
            style={{
              background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
              borderRadius: '20px',
              padding: '25px',
              maxWidth: '600px',
              width: '95%',
              maxHeight: '90vh',
              overflow: 'auto',
              border: `3px solid ${selectedItem.rarityColor}`,
              boxShadow: `0 20px 60px ${selectedItem.rarityColor}30`,
              position: 'relative',
              margin: 'auto',
              transform: 'translateY(0)',
              animation: 'modalFadeIn 0.3s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Botão de fechar */}
            <button
              onClick={closeModal}
              style={{
                position: 'absolute',
                top: '15px',
                right: '15px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                color: '#fff',
                fontSize: '1.5rem',
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
            >
              ×
            </button>

            {/* Conteúdo do modal */}
            <div style={{ textAlign: 'center' }}>
              {/* Imagem grande */}
              <div style={{ marginBottom: '20px' }}>
                <img 
                  src={selectedItem.image} 
                  alt={selectedItem.name}
                  style={{
                    maxWidth: '300px',
                    maxHeight: '225px',
                    objectFit: 'contain',
                    filter: 'drop-shadow(0 5px 15px rgba(0,0,0,0.5))'
                  }}
                />
              </div>

              {/* Nome */}
              <h2 style={{
                color: '#fff',
                fontSize: '1.4rem',
                fontWeight: 'bold',
                marginBottom: '15px',
                lineHeight: '1.3'
              }}>
                {selectedItem.name}
              </h2>

              {/* Informações principais */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: selectedItem.float ? '1fr 1fr 1fr' : '1fr 1fr',
                gap: '15px',
                marginBottom: '20px'
              }}>
                <div style={{
                  background: 'rgba(0,0,0,0.3)',
                  padding: '15px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.1)'
                }}>
                  <div style={{ color: '#DE7E21', fontSize: '0.8rem', marginBottom: '5px' }}>
                    RARIDADE
                  </div>
                  <div style={{
                    color: selectedItem.rarityColor,
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    textTransform: 'uppercase'
                  }}>
                    {selectedItem.rarity}
                  </div>
                </div>



                <div style={{
                  background: 'rgba(0,0,0,0.3)',
                  padding: '15px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.1)'
                }}>
                  <div style={{ color: '#DE7E21', fontSize: '0.8rem', marginBottom: '5px' }}>
                    EXTERIOR
                  </div>
                  <div style={{
                    color: '#ccc',
                    fontSize: '1rem'
                  }}>
                    {selectedItem.exterior || 'N/A'}
                  </div>
                </div>

                {selectedItem.float && (
                  <div style={{
                    background: 'rgba(0,0,0,0.3)',
                    padding: '15px',
                    borderRadius: '10px',
                    border: '1px solid rgba(255,255,255,0.1)'
                  }}>
                    <div style={{ color: '#DE7E21', fontSize: '0.8rem', marginBottom: '5px' }}>
                      FLOAT VALUE
                    </div>
                    <div style={{
                      color: '#ff9800',
                      fontSize: '1rem',
                      fontWeight: 'bold'
                    }}>
                      {selectedItem.float}
                    </div>
                  </div>
                )}
              </div>

              {/* Badges */}
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '10px',
                flexWrap: 'wrap'
              }}>
                {selectedItem.tradeable && (
                  <span style={{
                    background: '#4caf50',
                    color: '#fff',
                    padding: '8px 15px',
                    borderRadius: '20px',
                    fontSize: '0.8rem',
                    fontWeight: 'bold'
                  }}>
                    📈 Tradeable
                  </span>
                )}
                {selectedItem.marketable && (
                  <span style={{
                    background: '#2196f3',
                    color: '#fff',
                    padding: '8px 15px',
                    borderRadius: '20px',
                    fontSize: '0.8rem',
                    fontWeight: 'bold'
                  }}>
                    💰 Marketable
                  </span>
                )}
                <span style={{
                  background: selectedItem.rarityColor,
                  color: '#fff',
                  padding: '8px 15px',
                  borderRadius: '20px',
                  fontSize: '0.8rem',
                  fontWeight: 'bold'
                }}>
                  {selectedItem.weaponType || selectedItem.type}
                </span>
              </div>

              {/* Preço Steam Market */}
              {selectedItem.marketable && (
                <div style={{
                  background: 'rgba(76, 175, 80, 0.1)',
                  border: '1px solid rgba(76, 175, 80, 0.3)',
                  borderRadius: '10px',
                  padding: '15px',
                  marginTop: '20px',
                  textAlign: 'center'
                }}>
                  <div style={{
                    color: '#4caf50',
                    fontSize: '0.9rem',
                    marginBottom: '5px',
                    fontWeight: 'bold'
                  }}>
                    💰 Preço Mercado da Steam
                  </div>
                  <div style={{
                    color: '#4caf50',
                    fontSize: '1.2rem',
                    fontWeight: 'bold'
                  }}>
                    {itemPrices[selectedItem.name] ? (
                      `R$ ${itemPrices[selectedItem.name].brl}`
                    ) : fetchingItems.has(selectedItem.name) ? (
                      <span style={{ color: '#ff9800', fontSize: '0.9rem' }}>⏳ Buscando preço...</span>
                    ) : attemptedItems.has(selectedItem.name) ? (
                      <span style={{ color: '#888', fontSize: '0.9rem' }}>Preço não encontrado</span>
                    ) : (
                      <span style={{ color: '#2196f3', fontSize: '0.9rem' }}>Preço será buscado automaticamente</span>
                    )}
                  </div>
                </div>
              )}

              {/* Debug Info Compacta - só exibe se há dados extras */}
              {selectedItem.description && (
                selectedItem.description.tags?.length > 0 || 
                selectedItem.description.actions?.length > 0
              ) && (
                <div style={{
                  fontSize: '10px', 
                  color: '#666', 
                  marginTop: '15px',
                  marginBottom: '5px', 
                  padding: '3px 8px', 
                  background: 'rgba(0,0,0,0.2)', 
                  borderRadius: '3px', 
                  opacity: 0.7,
                  textAlign: 'center'
                }}>
                  🔍 Dados: {selectedItem.description.tags?.length || 0} tags, {selectedItem.description.actions?.length || 0} ações
                </div>
              )}

              {/* Informações Detalhadas - só exibem quando disponíveis */}
              {selectedItem.description && (
                <div style={{ marginTop: '20px', textAlign: 'left' }}>
                  
                  {/* Stickers - só se existirem */}
                  {selectedItem.description.descriptions && 
                   selectedItem.description.descriptions.some(desc => desc.name === 'sticker_info') && (
                    <div style={{ 
                      background: 'rgba(233, 30, 99, 0.1)', 
                      padding: '15px', 
                      borderRadius: '8px',
                      marginBottom: '15px',
                      border: '1px solid rgba(233, 30, 99, 0.3)'
                    }}>
                      <div style={{ color: '#E91E63', fontWeight: 'bold', marginBottom: '10px', fontSize: '0.9rem' }}>
                        🎨 Stickers Aplicados
                      </div>
                      {selectedItem.description.descriptions
                        .filter(desc => desc.name === 'sticker_info')
                        .map((stickerDesc, index) => (
                          <div 
                            key={index}
                            dangerouslySetInnerHTML={{ __html: stickerDesc.value }}
                            style={{
                              fontSize: '0.75rem',
                              color: '#e0e0e0',
                              lineHeight: '1.3',
                              padding: '8px',
                              background: 'rgba(255, 255, 255, 0.05)',
                              borderRadius: '4px',
                              border: '1px solid rgba(233, 30, 99, 0.2)'
                            }}
                          />
                        ))}
                    </div>
                  )}

                  {/* Tags e Categorias - só se existirem */}
                  {selectedItem.description.tags && selectedItem.description.tags.length > 0 && (
                    <div style={{ 
                      background: 'rgba(255, 193, 7, 0.1)', 
                      padding: '15px', 
                      borderRadius: '8px',
                      marginBottom: '15px',
                      border: '1px solid rgba(255, 193, 7, 0.3)'
                    }}>
                      <div style={{ color: '#FFC107', fontWeight: 'bold', marginBottom: '10px', fontSize: '0.9rem' }}>
                        🏷️ Tags e Categorias
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px' }}>
                        {selectedItem.description.tags.map((tag, index) => (
                          <div key={index} style={{ 
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '6px 10px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            border: '1px solid rgba(255, 193, 7, 0.2)'
                          }}>
                            <span style={{ color: '#FFC107', fontWeight: 'bold' }}>
                              {tag.localized_category_name}:
                            </span>
                            <span style={{ 
                              color: tag.color ? `#${tag.color}` : '#e0e0e0',
                              fontWeight: tag.color ? 'bold' : 'normal'
                            }}>
                              {tag.localized_tag_name}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Ações do Item - só se existirem */}
                  {selectedItem.description.actions && selectedItem.description.actions.length > 0 && (
                    <div style={{ 
                      background: 'rgba(255, 152, 0, 0.1)', 
                      padding: '15px', 
                      borderRadius: '8px',
                      marginBottom: '15px',
                      border: '1px solid rgba(255, 152, 0, 0.3)'
                    }}>
                      <div style={{ color: '#FF9800', fontWeight: 'bold', marginBottom: '10px', fontSize: '0.9rem' }}>
                        ⚡ Ações do Item
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {selectedItem.description.actions.map((action, index) => (
                          <a
                            key={index}
                            href={action.link}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '8px',
                              background: 'rgba(255, 255, 255, 0.05)',
                              borderRadius: '4px',
                              border: '1px solid rgba(255, 152, 0, 0.3)',
                              textDecoration: 'none',
                              color: '#FF9800',
                              fontSize: '0.75rem',
                              fontWeight: 'bold',
                              transition: 'all 0.2s ease',
                              cursor: 'pointer'
                            }}
                            onMouseEnter={(e) => {
                              e.target.style.background = 'rgba(255, 152, 0, 0.2)';
                            }}
                            onMouseLeave={(e) => {
                              e.target.style.background = 'rgba(255, 255, 255, 0.05)';
                            }}
                          >
                            <span style={{ fontSize: '1em' }}>🎮</span>
                            {action.name}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Informações Técnicas - sempre exibe se há description */}
                  <div style={{ 
                    background: 'rgba(76, 175, 80, 0.1)', 
                    padding: '15px', 
                    borderRadius: '8px',
                    border: '1px solid rgba(76, 175, 80, 0.3)'
                  }}>
                    <div style={{ color: '#4CAF50', fontWeight: 'bold', marginBottom: '10px', fontSize: '0.9rem' }}>
                      🔧 Informações Técnicas
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: window.innerWidth <= 480 ? '1fr' : '1fr 1fr', gap: '6px', fontSize: '0.7rem' }}>
                      {selectedItem.description.classid && (
                        <div style={{ padding: '6px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '3px' }}>
                          <strong>Class ID:</strong> {selectedItem.description.classid}
                        </div>
                      )}
                      {selectedItem.description.instanceid && (
                        <div style={{ padding: '6px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '3px' }}>
                          <strong>Instance ID:</strong> {selectedItem.description.instanceid}
                        </div>
                      )}
                      {selectedItem.id && (
                        <div style={{ padding: '6px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '3px' }}>
                          <strong>Asset ID:</strong> {selectedItem.id}
                        </div>
                      )}
                      {selectedItem.description.commodity !== undefined && (
                        <div style={{ padding: '6px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '3px' }}>
                          <strong>Commodity:</strong> {selectedItem.description.commodity ? 'Sim' : 'Não'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SteamInventoryViewer;