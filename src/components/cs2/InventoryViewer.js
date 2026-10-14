import React, { useEffect, useState } from 'react';

const InventoryViewer = ({ customUrl, steamId }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Steam Web API Key
  const STEAM_API_KEY = '56C14614F835D970E35560B61FCEA28D';

  // Função para converter URL customizada para Steam ID usando Steam Web API
  const getSteamId = async (customUrl) => {
    try {
      // Usar ResolveVanityURL da Steam Web API
      const resolveUrl = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${STEAM_API_KEY}&vanityurl=${customUrl}`;
      const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(resolveUrl)}`);
      const data = await response.json();
      
      const apiResult = JSON.parse(data.contents);
      
      if (apiResult.response && apiResult.response.success === 1) {
        return apiResult.response.steamid;
      }
      
      throw new Error("Steam ID não encontrado via API");
    } catch (err) {
      console.error("Erro ao resolver Steam ID via API:", err);
      
      // Fallback: método XML antigo
      try {
        const resolveUrl = `https://steamcommunity.com/id/${customUrl}?xml=1`;
        const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(resolveUrl)}`);
        const data = await response.json();
        
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(data.contents, "text/xml");
        const steamId64Element = xmlDoc.getElementsByTagName("steamID64")[0];
        
        if (steamId64Element) {
          return steamId64Element.textContent;
        }
      } catch (xmlErr) {
        console.error("Fallback XML também falhou:", xmlErr);
      }
      
      // Último fallback: se for um Steam ID numérico
      if (customUrl.match(/^\d{17}$/)) {
        return customUrl;
      }
      
      throw new Error("Não foi possível resolver o Steam ID");
    }
  };

  useEffect(() => {
    const fetchInventory = async () => {
      try {
        setLoading(true);
        setError(null);
        
        let resolvedSteamId;
        
        if (steamId) {
          // Steam ID fornecido diretamente
          resolvedSteamId = steamId;
          console.log("🔍 Usando Steam ID direto:", steamId);
        } else if (customUrl) {
          // Resolver a partir da URL customizada
          console.log("🔍 Buscando inventário para:", customUrl);
          resolvedSteamId = await getSteamId(customUrl);
          console.log("✅ Steam ID encontrado:", resolvedSteamId);
        } else {
          throw new Error("Nem steamId nem customUrl fornecidos");
        }
        
        // Usar Steam Web API com o endpoint exato fornecido
        let inventory;
        try {
          const steamWebApiUrl = `https://api.steampowered.com/IEconItems_730/GetPlayerItems/v1/?key=${STEAM_API_KEY}&steamid=${resolvedSteamId}`;
          console.log("🔑 Tentando Steam Web API:", steamWebApiUrl);
          
          const apiResponse = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(steamWebApiUrl)}`);
          const apiData = await apiResponse.json();
          
          if (apiData.contents) {
            const steamApiResult = JSON.parse(apiData.contents);
            console.log("📊 Steam Web API resultado:", steamApiResult);
            
            if (steamApiResult.result && steamApiResult.result.status === 1) {
              // Converter formato da Steam Web API para o formato padrão
              inventory = {
                success: true,
                assets: steamApiResult.result.items || [],
                descriptions: steamApiResult.result.items || []
              };
              console.log("✅ Steam Web API funcionou!");
            } else {
              throw new Error("Steam Web API não retornou dados válidos");
            }
          } else {
            throw new Error("Steam Web API resposta vazia");
          }
        } catch (apiErr) {
          console.warn("⚠️ Steam Web API falhou, usando fallback:", apiErr.message);
          
          // Fallback: usar método antigo do inventário
          const inventoryUrl = `https://steamcommunity.com/inventory/${resolvedSteamId}/730/2?l=english&count=5000`;
          console.log("📦 Fallback - buscando inventário em:", inventoryUrl);
          
          const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(inventoryUrl)}`);
          const data = await response.json();
          
          if (!data.contents) {
            throw new Error("Resposta vazia da API");
          }
          
          inventory = JSON.parse(data.contents);
          console.log("📊 Dados do inventário (fallback):", inventory);
          
          if (!inventory.success) {
            throw new Error("Inventário privado ou erro na Steam");
          }
        }
        
        // Mapear items - adaptado para ambos os formatos
        let mappedItems = [];
        
        if (inventory.descriptions) {
          // Formato padrão do inventário (steamcommunity.com/inventory)
          const descriptions = {};
          for (const desc of inventory.descriptions || []) {
            descriptions[`${desc.classid}_${desc.instanceid}`] = desc;
          }
          
          mappedItems = (inventory.assets || []).map(asset => {
            const key = `${asset.classid}_${asset.instanceid}`;
            const desc = descriptions[key] || {};
            const icon = desc.icon_url || "";
            
            return {
              id: asset.assetid || asset.id,
              name: desc.market_hash_name || desc.name || "Item desconhecido",
              image: icon ? `https://steamcommunity-a.akamaihd.net/economy/image/${icon}` : null,
              type: desc.type || "Unknown",
              rarity: desc.tags?.find(tag => tag.category === "Rarity")?.localized_tag_name || "Common",
              exterior: desc.tags?.find(tag => tag.category === "Exterior")?.localized_tag_name || "",
            };
          }).filter(item => item.image);
        } else {
          // Formato da Steam Web API (GetPlayerItems)
          mappedItems = (inventory.assets || []).map(item => {
            const icon = item.image_url || item.icon_url || "";
            
            return {
              id: item.id || item.assetid,
              name: item.name || item.market_hash_name || "Item desconhecido",
              image: icon ? (icon.startsWith('http') ? icon : `https://steamcommunity-a.akamaihd.net/economy/image/${icon}`) : null,
              type: item.type || "Unknown",
              rarity: item.rarity || "Common",
              exterior: item.exterior || "",
            };
          }).filter(item => item.image);
        }
        
        console.log("🎒 Items mapeados:", mappedItems.slice(0, 5)); // Log dos primeiros 5 items
        setItems(mappedItems);
        
      } catch (err) {
        console.error("❌ Erro ao buscar inventário:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (customUrl || steamId) {
      fetchInventory();
    }
  }, [customUrl, steamId]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '20px', color: '#fff' }}>
        <div>🔄 Carregando inventário...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '20px', color: '#ff4444' }}>
        <div>❌ Erro: {error}</div>
        <div style={{ fontSize: '0.9rem', marginTop: '10px', color: '#ccc' }}>
          Verifique se o inventário é público
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '20px', color: '#fff' }}>
        <div>📦 Inventário vazio ou não encontrado</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: '20px', color: '#DE7E21' }}>
        ✅ {items.length} items encontrados
      </div>
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', 
        gap: '15px',
        padding: '20px'
      }}>
        {items.slice(0, 20).map(item => (
          <div 
            key={item.id} 
            style={{ 
              textAlign: 'center',
              background: 'rgba(0,0,0,0.3)',
              borderRadius: '10px',
              padding: '10px',
              border: '1px solid rgba(222, 126, 33, 0.3)',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              e.target.style.background = 'rgba(222, 126, 33, 0.1)';
              e.target.style.transform = 'translateY(-3px)';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'rgba(0,0,0,0.3)';
              e.target.style.transform = 'translateY(0)';
            }}
          >
            <img 
              src={item.image} 
              alt={item.name} 
              style={{ 
                width: '80px', 
                height: '80px', 
                objectFit: 'contain',
                marginBottom: '8px'
              }} 
            />
            <div style={{ 
              color: '#fff', 
              fontSize: '0.7rem', 
              lineHeight: '1.2',
              wordBreak: 'break-word'
            }}>
              {item.name}
            </div>
            {item.rarity && (
              <div style={{ 
                fontSize: '0.6rem', 
                color: '#DE7E21',
                marginTop: '5px'
              }}>
                {item.rarity}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default InventoryViewer;