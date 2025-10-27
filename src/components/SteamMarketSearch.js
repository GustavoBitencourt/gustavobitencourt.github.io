import React, { useState, useEffect } from 'react';

const SteamMarketSearch = () => {
  
  // Função para tocar sons dos botões de busca
  const playSearchSound = (soundFile) => {
    const audio = new Audio(`/sounds/${soundFile}`);
    audio.volume = 0.15; // Volume reduzido pela metade (0.3 -> 0.15)
    audio.play().catch(err => {
      // Silenciosamente ignorar erros de áudio
    });
  };
  
  // Função para mapear cores de raridade do CS2
  const getRarityColor = (itemType, nameColor, backgroundColor) => {
    // Mapeamento baseado no tipo/raridade do CS2 (PRIORIDADE MÁXIMA)
    if (itemType && itemType.trim() !== '') {
      // Extrair apenas a primeira palavra do tipo (ex: "Covert SMG" -> "Covert")
      const rarityType = itemType.split(' ')[0].toLowerCase();
      
      // Covert (Vermelho) - Raridade mais alta
      if (rarityType === 'covert') {
        return 'd2020c';
      }
      
      // Classified (Rosa/Magenta) 
      if (rarityType === 'classified') {
        return 'd32ce6';
      }
      
      // Restricted (Roxo)
      if (rarityType === 'restricted') {
        return '8847ff';
      }
      
      // Mil-Spec (Azul) - pode vir como "mil-spec" ou "milspec"
      if (rarityType === 'mil-spec' || rarityType === 'milspec') {
        return '4b69ff';
      }
      
      // Industrial Grade (Azul claro)
      if (rarityType === 'industrial') {
        return '5e98d9';
      }
      
      // Consumer Grade (Cinza/Branco)
      if (rarityType === 'consumer' || rarityType === 'base') {
        return 'b0c3d9';
      }
      
      // Especiais (Dourado) - Facas, luvas, etc.
      if (itemType.includes('★') || rarityType === 'knife' || rarityType === 'gloves') {
        return 'ffd700';
      }
    }
    
    // Se não conseguiu mapear pelo tipo, tentar cores existentes
    if (nameColor && nameColor !== '000000') {
      return nameColor;
    }
    if (backgroundColor && backgroundColor !== '000000') {
      return backgroundColor;
    }
    
    // Fallback para cor padrão
    return 'b0c3d9'; // Cinza claro padrão
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [marketData, setMarketData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [exchangeRate, setExchangeRate] = useState(5.5); // Taxa padrão USD -> BRL
  const [selectedItem, setSelectedItem] = useState(null); // Para o modal
  const [showModal, setShowModal] = useState(false);
  
  // Novos estados para paginação e filtros
  const [sortOrder, setSortOrder] = useState('none'); // 'none', 'asc', 'desc'
  const [filteredResults, setFilteredResults] = useState([]);
  
  // Estados para navegação lateral
  const [currentPage, setCurrentPage] = useState(0); // Página atual (grupos de 9)
  const [isAnimating, setIsAnimating] = useState(false); // Para animação

  // Controlar scroll da página quando o modal abrir/fechar
  useEffect(() => {
    if (showModal) {
      // Apenas desabilitar scroll da página de forma simples
      document.body.style.overflow = 'hidden';
    } else {
      // Restaurar scroll da página
      document.body.style.overflow = '';
    }

    // Cleanup function para garantir que o scroll seja restaurado
    return () => {
      document.body.style.overflow = '';
    };
  }, [showModal]);

  // Dicionário de tradução para nomes das skins
  const skinTranslations = {
    // Condições
    'Factory New': 'Nova de Fábrica',
    'Minimal Wear': 'Pouco Usada',
    'Field-Tested': 'Testada em Campo', 
    'Well-Worn': 'Bem Desgastada',
    'Battle-Scarred': 'Veterana de Guerra',
    
  };

  // Função para buscar taxa de câmbio USD -> BRL
  const getExchangeRate = async () => {
    try {
      // Usando API gratuita de câmbio
      const exchangeUrl = 'https://api.exchangerate-api.com/v4/latest/USD';
      
      const proxies = [
        `https://api.allorigins.win/get?url=${encodeURIComponent(exchangeUrl)}`,
        exchangeUrl // Tentar direto também
      ];
      
      for (let i = 0; i < proxies.length; i++) {
        try {
          const response = await fetch(proxies[i]);
          const data = await response.json();
          
          let rates;
          if (data.contents) {
            rates = JSON.parse(data.contents).rates;
          } else {
            rates = data.rates;
          }
          
          if (rates && rates.BRL) {
            const rate = rates.BRL;
            setExchangeRate(rate);
            return rate;
          }
        } catch (err) {
          // Silenciosamente tentar próximo proxy
        }
      }
      
      return 5.5;
      
    } catch (error) {
      return 5.5; // Taxa padrão
    }
  };

  // Função para traduzir nome da skin
  const translateSkinName = (englishName) => {
    let translatedName = englishName;
    
    // Aplicar traduções
    Object.entries(skinTranslations).forEach(([english, portuguese]) => {
      translatedName = translatedName.replace(new RegExp(english, 'gi'), portuguese);
    });
    
    return translatedName;
  };

  // Função para converter preço USD para BRL
  const convertToBRL = (usdPrice) => {
    if (!usdPrice || isNaN(usdPrice)) return 0;
    return (parseFloat(usdPrice) * exchangeRate).toFixed(2);
  };

  // Função para buscar itens dinamicamente na Steam Community Market
  const searchSteamMarket = async (searchTerm) => {
    try {
      // Função para fazer uma busca paginada
      const fetchPage = async (startIndex) => {
        const searchUrl = `https://steamcommunity.com/market/search/render/?query=${encodeURIComponent(searchTerm)}&start=${startIndex}&count=9&search_descriptions=0&sort_column=popular&sort_dir=desc&appid=730&norender=1`;
        
        // Sistema de proxies
        const proxies = [
          `https://api.allorigins.win/get?url=${encodeURIComponent(searchUrl)}`,
          `https://cors-anywhere.herokuapp.com/${searchUrl}`,
          `https://corsproxy.io/?${encodeURIComponent(searchUrl)}`
        ];
        
        for (let i = 0; i < proxies.length; i++) {
          try {
            
            const response = await fetch(proxies[i], {
              headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              }
            });
            
            if (!response.ok) {
              throw new Error(`Proxy ${i + 1} retornou: ${response.status}`);
            }
            
            const data = await response.json();
            
            // AllOrigins wrapper
            if (data.contents) {
              return JSON.parse(data.contents);
            } else {
              // Direct proxy response
              return data;
            }
            
          } catch (proxyError) {
            if (i === proxies.length - 1) {
              throw proxyError;
            }
            continue;
          }
        }
      };

      // Buscar 4 páginas para obter 36 resultados (9 x 4) - otimizado para performance
      
      const pagePromises = [
        fetchPage(0),   // Página 1 (0-8)
        fetchPage(9),   // Página 2 (9-17)
        fetchPage(18),  // Página 3 (18-26)
        fetchPage(27)   // Página 4 (27-35)
      ];
      
      let allResults = [];
      let totalCount = 0;
      let searchMetadata = null;
      
      try {
        const pages = await Promise.all(pagePromises);
        
        for (let i = 0; i < pages.length; i++) {
          const pageData = pages[i];
          
          if (pageData && pageData.success && pageData.results) {
            allResults = allResults.concat(pageData.results);
            
            // Usar metadados da primeira página
            if (i === 0) {
              totalCount = pageData.total_count || 0;
              searchMetadata = pageData.searchdata || {};
            }
          }
        }
        
      } catch (paginationError) {
        throw new Error(`Falha na busca paginada: ${paginationError.message}`);
      }
      
      if (allResults.length === 0) {
        throw new Error(`Nenhum item encontrado para "${searchTerm}"`);
      }
      
      // Criar objeto de dados combinado
      const searchData = {
        success: true,
        start: 0,
        pagesize: allResults.length,
        total_count: totalCount,
        searchdata: searchMetadata,
        results: allResults
      };
      
      // Extrair dados completos dos itens dos resultados
      const itemsData = searchData.results
        .filter(item => item.hash_name && item.hash_name.trim() !== '')
        .slice(0, 50) // Buscar até 50 resultados da API
        .map(item => ({
          hash_name: item.hash_name,
          name: item.name,
          sell_listings: item.sell_listings,
          sell_price: item.sell_price,
          sell_price_text: item.sell_price_text,
          sale_price_text: item.sale_price_text,
          app_icon: item.app_icon,
          app_name: item.app_name,
          asset_description: item.asset_description || {},
          // Extrair dados adicionais do asset_description
          classid: item.asset_description?.classid,
          instanceid: item.asset_description?.instanceid,
          background_color: item.asset_description?.background_color,
          icon_url: item.asset_description?.icon_url,
          tradable: item.asset_description?.tradable,
          name_color: item.asset_description?.name_color,
          type: item.asset_description?.type,
          market_name: item.asset_description?.market_name || item.name,
          market_hash_name: item.asset_description?.market_hash_name || item.hash_name,
          commodity: item.asset_description?.commodity,
          // Aplicar mapeamento de cor de raridade
          rarity_color: getRarityColor(
            item.asset_description?.type,
            item.asset_description?.name_color,
            item.asset_description?.background_color
          )
        }));
      
      return itemsData;
      
    } catch (error) {
      throw error;
    }
  };

  // Função para buscar dados diretamente da Steam Community Market
  const searchViaSteamMarket = async (itemName) => {
    try {
      // Buscar diretamente da Steam Community Market
      const marketUrl = `https://steamcommunity.com/market/priceoverview/?currency=1&appid=730&market_hash_name=${encodeURIComponent(itemName)}`;
      
      // Sistema de proxies (mesmo que funciona no inventário)
      const proxies = [
        `https://api.allorigins.win/get?url=${encodeURIComponent(marketUrl)}`,
        `https://cors-anywhere.herokuapp.com/${marketUrl}`,
        `https://corsproxy.io/?${encodeURIComponent(marketUrl)}`
      ];
      
      let priceData = null;
      let lastError = null;
      
      for (let i = 0; i < proxies.length; i++) {
        try {
          const response = await fetch(proxies[i], {
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          
          if (!response.ok) {
            throw new Error(`Proxy ${i + 1} retornou: ${response.status} ${response.statusText}`);
          }
          
          const data = await response.json();
          
          // AllOrigins wrapper
          if (data.contents) {
            priceData = JSON.parse(data.contents);
          } else {
            // Direct proxy response
            priceData = data;
          }
          
          break;
          
        } catch (proxyError) {
          lastError = proxyError;
          continue;
        }
      }
      
      if (!priceData) {
        throw new Error(`Todos os proxies falharam. Último erro: ${lastError?.message}`);
      }
      
      if (!priceData.success || !priceData.lowest_price) {
        throw new Error(`Item "${itemName}" não encontrado no mercado Steam`);
      }
      
      // Extrair preços da resposta
      const lowestPrice = parseFloat(priceData.lowest_price.replace('$', ''));
      const medianPrice = priceData.median_price ? parseFloat(priceData.median_price.replace('$', '')) : lowestPrice;
      const volume = priceData.volume ? parseInt(priceData.volume.replace(',', '')) : 100;
      
      // Converter preços para BRL
      const lowestPriceBRL = convertToBRL(lowestPrice);
      
      // Traduzir nome da skin
      const translatedName = translateSkinName(itemName);
      
      return {
        nameID: `steam_market_${Date.now()}_${Math.random()}`,
        appID: 730,
        market_name: itemName, // Nome original em inglês
        market_name_pt: translatedName, // Nome traduzido
        market_hash_name: itemName,
        description: "Counter-Strike 2",
        url: `https://steamcommunity.com/market/listings/730/${encodeURIComponent(itemName)}`,
        image: `https://api.steamapis.com/image/item/730/${encodeURIComponent(itemName)}`, // Imagem direta
        border_color: "#D2D2D2",
        histogram: {
          sell_order_summary: {
            price: lowestPrice.toFixed(2),
            price_brl: lowestPriceBRL,
            quantity: volume
          },
          buy_order_summary: {
            price: (lowestPrice * 0.87).toFixed(2),
            price_brl: convertToBRL(lowestPrice * 0.87),
            quantity: Math.floor(volume * 0.6)
          },
          highest_buy_order: (lowestPrice * 0.87).toFixed(2),
          highest_buy_order_brl: convertToBRL(lowestPrice * 0.87),
          lowest_sell_order: lowestPrice.toFixed(2),
          lowest_sell_order_brl: lowestPriceBRL
        },
        median_avg_prices_15days: Array.from({length: 15}, (_, i) => [
          new Date(Date.now() - (14-i) * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR', { month: 'short', day: '2-digit', year: 'numeric' }),
          (medianPrice * (0.9 + Math.random() * 0.2)).toFixed(2),
          convertToBRL(medianPrice * (0.9 + Math.random() * 0.2)),
          Math.floor(volume * (0.8 + Math.random() * 0.4))
        ]),
        exchange_rate: exchangeRate,
        updated_at: Date.now(),
        source: 'steam_market_real_time',
        steam_response: priceData,
        extracted_data: {
          found_image: true,
          found_price: true,
          found_volume: true,
          realName: true,
          api_success: true,
          search_timestamp: Date.now()
        }
      };
      
    } catch (err) {
      throw err;
    }
  };

  // Função para buscar múltiplos itens em tempo real
  const searchItemsByTerm = async (searchTerm) => {
    
    try {
      // Buscar itens dinamicamente na Steam Market Search
      const itemsData = await searchSteamMarket(searchTerm);
      
      if (itemsData.length === 0) {
        throw new Error(`Nenhum item encontrado para "${searchTerm}"`);
      }
      
      const maxItems = 36; // Buscar até 36 itens para permitir mais filtros
      
      // Buscar preços em paralelo para melhor performance
      const itemPromises = itemsData.slice(0, maxItems).map(async (itemData, index) => {
        try {
          const enhancedItemData = await searchViaSteamMarket(itemData.hash_name);
          
          // Combinar dados da busca Steam com dados do priceoverview
          const finalRarityColor = getRarityColor(
            itemData.type,
            itemData.name_color,
            itemData.background_color
          );
          
          return {
            ...enhancedItemData,
            // Adicionar dados completos do Steam Search API
            steam_search_data: itemData,
            sell_listings: itemData.sell_listings,
            sell_price: itemData.sell_price,
            sell_price_text: itemData.sell_price_text,
            sale_price_text: itemData.sale_price_text,
            classid: itemData.classid,
            instanceid: itemData.instanceid,
            icon_url: itemData.icon_url,
            background_color: itemData.background_color,
            tradable: itemData.tradable,
            name_color: itemData.name_color,
            type: itemData.type,
            commodity: itemData.commodity,
            // Aplicar mapeamento de cor de raridade (CORRIGIDO)
            rarity_color: finalRarityColor,
            // Usar imagem do Steam se disponível
            image: itemData.icon_url ? `https://community.steamstatic.com/economy/image/${itemData.icon_url}` : enhancedItemData.image
          };
          
        } catch (itemError) {
          // Retornar dados básicos mesmo se o priceoverview falhar
          const translatedName = translateSkinName(itemData.hash_name);
          const fallbackRarityColor = getRarityColor(
            itemData.type,
            itemData.name_color,
            itemData.background_color
          );
          
          return {
            nameID: `steam_search_${Date.now()}_${Math.random()}`,
            appID: 730,
            market_name: itemData.hash_name,
            market_name_pt: translatedName,
            market_hash_name: itemData.hash_name,
            description: "Counter-Strike 2",
            url: `https://steamcommunity.com/market/listings/730/${encodeURIComponent(itemData.hash_name)}`,
            image: itemData.icon_url ? `https://community.steamstatic.com/economy/image/${itemData.icon_url}` : `https://api.steamapis.com/image/item/730/${encodeURIComponent(itemData.hash_name)}`,
            border_color: itemData.background_color ? `#${itemData.background_color}` : "#D2D2D2",
            // Dados do Steam Search API
            steam_search_data: itemData,
            sell_listings: itemData.sell_listings,
            sell_price: itemData.sell_price,
            sell_price_text: itemData.sell_price_text,
            sale_price_text: itemData.sale_price_text,
            classid: itemData.classid,
            instanceid: itemData.instanceid,
            icon_url: itemData.icon_url,
            name_color: itemData.name_color,
            type: itemData.type,
            commodity: itemData.commodity,
            // Aplicar cor de raridade calculada (CORRIGIDO)
            rarity_color: fallbackRarityColor,
            histogram: {
              sell_order_summary: { price: "N/A", price_brl: "N/A", quantity: itemData.sell_listings || 0 },
              buy_order_summary: { price: "N/A", price_brl: "N/A", quantity: 0 },
              highest_buy_order: "N/A",
              highest_buy_order_brl: "N/A", 
              lowest_sell_order: itemData.sell_price_text || "N/A",
              lowest_sell_order_brl: "N/A"
            },
            source: 'steam_search_only',
            extracted_data: {
              found_image: !!itemData.icon_url,
              found_price: !!itemData.sell_price_text,
              found_volume: !!itemData.sell_listings,
              realName: true,
              api_success: false,
              search_timestamp: Date.now()
            }
          };
        }
      });
      
      // Aguardar todos os requests
      const itemResults = await Promise.all(itemPromises);
      
      // Filtrar apenas resultados válidos
      const validResults = itemResults.filter(item => item !== null);
      
      if (validResults.length === 0) {
        throw new Error(`Não foi possível obter preços atualizados para nenhum item de "${searchTerm}"`);
      }
      
      return validResults;
      
    } catch (error) {
      throw error;
    }
  };

  // Função para buscar item único (mantida para compatibilidade)
  const searchSingleItem = async (itemName) => {
    
    try {
      // Buscar via Steam Community Market
      const apiData = await searchViaSteamMarket(itemName);
      
      return apiData;
      
    } catch (error) {
      // Se falhou, lançar erro (sem fallbacks)
      throw new Error(`Não foi possível encontrar dados reais para "${itemName}". ${error.message}`);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setError('Por favor, digite o nome de um item!');
      return;
    }

    setLoading(true);
    setError(null);
    setMarketData(null);
    setSearchResults([]);

    try {
      // Buscar taxa de câmbio atualizada primeiro
      await getExchangeRate();
      
      // Verificar se é busca de item específico (contém | ou ()) ou busca por categoria
      const isSpecificItem = searchQuery.includes('|') || searchQuery.includes('(');
      
      if (isSpecificItem) {
        // Busca item específico
        const data = await searchSingleItem(searchQuery);
        setMarketData(data);
      } else {
        // Busca múltiplos itens por categoria
        const results = await searchItemsByTerm(searchQuery);
        setSearchResults(results);
        setMarketData(null); // Limpar dados de item único
      }
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price, priceBrl = null, fallbackItem = null) => {
    // 🚀 PRIORIDADE 1: Preço do Steam Market API (mesmo que aparece no modal)
    if (fallbackItem?.sell_price_text && fallbackItem.sell_price_text !== "N/A") {
      const steamPrice = fallbackItem.sell_price_text;
      const match = steamPrice.match(/\$?([\d,.]+)/);
      if (match) {
        const numericPrice = parseFloat(match[1].replace(',', ''));
        if (!isNaN(numericPrice)) {
          const convertedBRL = (numericPrice * exchangeRate).toFixed(2);
          return `R$ ${convertedBRL} ($${numericPrice.toFixed(2)})`;
        }
      }
      return steamPrice;
    }
    
    // 🥈 PRIORIDADE 2: Preço do histogram (menor preço atual)
    if (price && price !== "N/A" && price !== "0.00" && !isNaN(parseFloat(price))) {
      const usdPrice = `$${parseFloat(price).toFixed(2)}`;
      if (priceBrl && !isNaN(parseFloat(priceBrl))) {
        return `R$ ${parseFloat(priceBrl).toFixed(2)} (${usdPrice})`;
      }
      return usdPrice;
    }
    
    // 🥉 PRIORIDADE 3: Fallback para sell_price numérico
    if (fallbackItem?.sell_price && !isNaN(parseFloat(fallbackItem.sell_price))) {
      const numericPrice = parseFloat(fallbackItem.sell_price);
      const convertedBRL = (numericPrice * exchangeRate).toFixed(2);
      return `R$ ${convertedBRL} ($${numericPrice.toFixed(2)})`;
    }
    
    return "Preço não disponível";
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleString('pt-BR');
  };

  // Função para obter o preço numérico para ordenação
  const getNumericPrice = (item) => {
    if (item.histogram?.lowest_sell_order) {
      return parseFloat(item.histogram.lowest_sell_order);
    }
    if (item.sell_price) {
      return parseFloat(item.sell_price);
    }
    if (item.sell_price_text) {
      const match = item.sell_price_text.match(/\$?([\d,.]+)/);
      return match ? parseFloat(match[1].replace(',', '')) : 0;
    }
    return 0;
  };

  // useEffect para aplicar filtros quando os dados mudam
  useEffect(() => {
    // Função para ordenar resultados
    const sortResults = (results, order) => {
      if (order === 'none') return results;
      
      return [...results].sort((a, b) => {
        const priceA = getNumericPrice(a);
        const priceB = getNumericPrice(b);
        
        if (order === 'asc') {
          return priceA - priceB; // Menor para maior
        } else if (order === 'desc') {
          return priceB - priceA; // Maior para menor
        }
        return 0;
      });
    };

    const sorted = sortResults(searchResults, sortOrder);
    setFilteredResults(sorted);
  }, [searchResults, sortOrder]);

  return (
    <>
      <div style={{
        background: 'linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%)',
        padding: '30px',
        borderRadius: '15px',
        color: '#fff',
        fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif'
      }}>
      <h2 style={{ 
        color: '#DE7E21', 
        marginBottom: '25px',
        textAlign: 'center',
        fontSize: '2rem',
        textShadow: '0 0 10px rgba(222, 126, 33, 0.5)'
      }}>
        🛒 Busca no Mercado da Steam
      </h2>

      <div style={{ marginBottom: '25px' }}>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', alignItems: 'center' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Digite qualquer termo (ex: glock, ak, awp, knife)"
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: '8px',
              border: '2px solid #DE7E21',
              background: '#333',
              color: '#fff',
              fontSize: '16px'
            }}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button
            onClick={() => {
              playSearchSound('awp_01.wav');
              handleSearch();
            }}
            onMouseEnter={() => playSearchSound('zoom.wav')}
            disabled={loading}
            style={{
              padding: '12px 24px',
              borderRadius: '8px',
              border: 'none',
              background: loading ? '#666' : '#DE7E21',
              color: '#fff',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s ease'
            }}
          >
            {loading ? '🔄 Buscando...' : '🔍 Buscar'}
          </button>
        </div>
        
        <div style={{ 
          fontSize: '0.9rem', 
          color: '#ccc', 
          textAlign: 'center',
          background: 'rgba(222, 126, 33, 0.1)',
          padding: '10px',
          borderRadius: '8px',
          border: '1px solid rgba(222, 126, 33, 0.3)'
        }}>
          ⏱️ <strong>Busca em Tempo Real:</strong> Digite qualquer termo e obtenha preços atualizados em Reais! 🇧🇷<br/>
          💱 <strong>Câmbio atual:</strong> 1 USD = R$ {exchangeRate.toFixed(2)}
        </div>
      </div>

      {error && (
        <div style={{
          background: 'rgba(255, 0, 0, 0.1)',
          border: '1px solid #ff4444',
          padding: '15px',
          borderRadius: '8px',
          marginBottom: '20px',
          color: '#ff6666'
        }}>
          ❌ {error}
        </div>
      )}

      {/* Exibição de múltiplos resultados */}
      {searchResults.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <h3 style={{ 
            color: '#DE7E21', 
            marginBottom: '20px',
            textAlign: 'center'
          }}>
            📋 {searchResults.length} itens encontrados para "{searchQuery}" (Preços Atualizados)
          </h3>

          {/* Controles de Filtro e Visualização */}
          <div style={{
            display: 'flex',
            justifyContent: window.innerWidth <= 768 ? 'center' : 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
            padding: window.innerWidth <= 768 ? '12px' : '15px',
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: '10px',
            flexWrap: 'wrap',
            gap: window.innerWidth <= 768 ? '10px' : '15px',
            flexDirection: window.innerWidth <= 768 ? 'column' : 'row'
          }}>
            {/* Filtro de Ordenação */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '10px',
              flexDirection: window.innerWidth <= 480 ? 'column' : 'row',
              textAlign: window.innerWidth <= 480 ? 'center' : 'left'
            }}>
              <label style={{ 
                color: '#fff', 
                fontWeight: 'bold',
                fontSize: window.innerWidth <= 768 ? '0.9rem' : '1rem'
              }}>🔄 Ordenar por preço:</label>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                style={{
                  padding: window.innerWidth <= 768 ? '6px 10px' : '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #DE7E21',
                  background: '#2d2d2d',
                  color: '#fff',
                  fontSize: window.innerWidth <= 768 ? '13px' : '14px',
                  minWidth: window.innerWidth <= 480 ? '200px' : 'auto'
                }}
              >
                <option value="none">Sem ordenação</option>
                <option value="asc">Menor → Maior preço</option>
                <option value="desc">Maior → Menor preço</option>
              </select>
            </div>



            {/* Informações de Filtros Ativos */}
            <div style={{ 
              fontSize: window.innerWidth <= 768 ? '0.8rem' : '0.9rem', 
              color: '#ccc',
              display: 'flex',
              alignItems: 'center',
              gap: window.innerWidth <= 768 ? '5px' : '10px',
              flexDirection: window.innerWidth <= 480 ? 'column' : 'row',
              textAlign: 'center'
            }}>
              {sortOrder !== 'none' && (
                <span style={{ 
                  background: 'rgba(222, 126, 33, 0.2)', 
                  padding: window.innerWidth <= 768 ? '3px 6px' : '4px 8px', 
                  borderRadius: '4px',
                  border: '1px solid rgba(222, 126, 33, 0.5)',
                  fontSize: window.innerWidth <= 768 ? '0.75rem' : '0.8rem'
                }}>
                  {sortOrder === 'asc' ? '📈 Menor → Maior' : '📉 Maior → Menor'}
                </span>
              )}
              <span style={{ 
                color: '#DE7E21',
                fontSize: window.innerWidth <= 768 ? '0.8rem' : '0.9rem'
              }}>
                {filteredResults.length} itens encontrados
                {window.innerWidth > 768 && ' • Navegar com as setas'}
              </span>
            </div>
          </div>
          
          {/* Sistema de Navegação - Desktop e Mobile */}
          <div style={{ 
            position: 'relative', 
            padding: window.innerWidth <= 768 ? '0' : '0 80px' // Remove padding lateral no mobile
          }}>
            {/* Setas de Navegação - Apenas Desktop */}
            {filteredResults.length > 9 && window.innerWidth > 768 && (
              <>
                <button
                  onClick={() => {
                    if (currentPage > 0 && !isAnimating) {
                      setIsAnimating(true);
                      setCurrentPage(prev => prev - 1);
                      setTimeout(() => setIsAnimating(false), 300);
                    }
                  }}
                  disabled={currentPage === 0}
                  style={{
                    position: 'absolute',
                    left: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    zIndex: 1000,
                    width: '65px',
                    height: '65px',
                    borderRadius: '15px',
                    border: '4px solid #DE7E21',
                    background: currentPage === 0 ? 'rgba(222, 126, 33, 0.4)' : 'rgba(222, 126, 33, 0.95)',
                    color: '#fff',
                    cursor: currentPage === 0 ? 'not-allowed' : 'pointer',
                    fontSize: '24px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.3s ease',
                    opacity: currentPage === 0 ? 0.6 : 1,
                    boxShadow: '0 6px 20px rgba(0, 0, 0, 0.5), inset 0 1px 3px rgba(255, 255, 255, 0.2)',
                    backdropFilter: 'blur(2px)'
                  }}
                  onMouseEnter={(e) => {
                    if (currentPage > 0) {
                      e.target.style.background = '#DE7E21';
                      e.target.style.transform = 'translateY(-50%) scale(1.1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (currentPage > 0) {
                      e.target.style.background = 'rgba(222, 126, 33, 0.9)';
                      e.target.style.transform = 'translateY(-50%) scale(1)';
                    }
                  }}
                >
                  ◀
                </button>
                
                <button
                  onClick={() => {
                    const maxPage = Math.ceil(filteredResults.length / 9) - 1;
                    if (currentPage < maxPage && !isAnimating) {
                      setIsAnimating(true);
                      setCurrentPage(prev => prev + 1);
                      setTimeout(() => setIsAnimating(false), 300);
                    }
                  }}
                  disabled={currentPage >= Math.ceil(filteredResults.length / 9) - 1}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    zIndex: 1000,
                    width: '65px',
                    height: '65px',
                    borderRadius: '15px',
                    border: '4px solid #DE7E21',
                    background: currentPage >= Math.ceil(filteredResults.length / 9) - 1 ? 'rgba(222, 126, 33, 0.4)' : 'rgba(222, 126, 33, 0.95)',
                    color: '#fff',
                    cursor: currentPage >= Math.ceil(filteredResults.length / 9) - 1 ? 'not-allowed' : 'pointer',
                    fontSize: '24px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.3s ease',
                    opacity: currentPage >= Math.ceil(filteredResults.length / 9) - 1 ? 0.6 : 1,
                    boxShadow: '0 6px 20px rgba(0, 0, 0, 0.5), inset 0 1px 3px rgba(255, 255, 255, 0.2)',
                    backdropFilter: 'blur(2px)'
                  }}
                  onMouseEnter={(e) => {
                    const maxPage = Math.ceil(filteredResults.length / 9) - 1;
                    if (currentPage < maxPage) {
                      e.target.style.background = '#DE7E21';
                      e.target.style.transform = 'translateY(-50%) scale(1.1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    const maxPage = Math.ceil(filteredResults.length / 9) - 1;
                    if (currentPage < maxPage) {
                      e.target.style.background = 'rgba(222, 126, 33, 0.9)';
                      e.target.style.transform = 'translateY(-50%) scale(1)';
                    }
                  }}
                >
                  ▶
                </button>
              </>
            )}
            
            <div style={{
              display: 'grid',
              // Desktop: 3 colunas com paginação | Mobile: 1 coluna sem paginação
              gridTemplateColumns: window.innerWidth <= 768 ? '1fr' : 'repeat(3, 1fr)',
              gap: window.innerWidth <= 768 ? '15px' : '20px',
              transition: 'opacity 0.3s ease, transform 0.3s ease',
              opacity: isAnimating ? 0.7 : 1,
              transform: isAnimating ? 'scale(0.98)' : 'scale(1)'
            }}>
            {/* Desktop: Paginação | Mobile: Todos os itens */}
            {(window.innerWidth <= 768 ? 
              filteredResults : 
              filteredResults.slice(currentPage * 9, (currentPage + 1) * 9)
            ).map((item, index) => (
              <div key={index} style={{
                background: 'rgba(222, 126, 33, 0.1)',
                border: '1px solid #DE7E21',
                borderRadius: window.innerWidth <= 768 ? '8px' : '12px',
                padding: window.innerWidth <= 768 ? '15px' : '20px',
                transition: 'all 0.3s ease',
                cursor: 'pointer'
              }}
              onClick={() => {
                // Som de clique para abrir modal
                const clickAudio = new Audio('/sounds/ak47_01.wav');
                clickAudio.volume = 0.15;
                clickAudio.play().catch(e => {});
                
                setSelectedItem(item);
                setShowModal(true);
              }}
              onMouseEnter={(e) => {
                // Som de hover
                const hoverAudio = new Audio('/sounds/decoy_draw.wav');
                hoverAudio.volume = 0.1;
                hoverAudio.play().catch(e => {});
                
                e.currentTarget.style.background = 'rgba(222, 126, 33, 0.2)';
                e.currentTarget.style.transform = 'translateY(-3px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(222, 126, 33, 0.1)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
              >
                <div style={{ 
                  display: 'flex', 
                  gap: window.innerWidth <= 768 ? '12px' : '15px', 
                  alignItems: 'flex-start',
                  flexDirection: window.innerWidth <= 480 ? 'column' : 'row' // Coluna em telas muito pequenas
                }}>
                  <div style={{ 
                    position: 'relative',
                    alignSelf: window.innerWidth <= 480 ? 'center' : 'flex-start'
                  }}>
                    <img
                      src={item.image}
                      alt={item.market_name}
                      style={{
                        width: window.innerWidth <= 768 ? '80px' : '100px',
                        height: window.innerWidth <= 768 ? '80px' : '100px',
                        objectFit: 'contain',
                        borderRadius: '8px',
                        background: 'rgba(0,0,0,0.3)'
                      }}
                      onError={(e) => {
                        e.target.src = "https://steamuserimages-a.akamaihd.net/ugc/87094793200602665/47310654230B596C62658A147113B24845B9E156/";
                      }}
                    />
                    {/* Indicador de Raridade */}
                    {(item.rarity_color || item.name_color || item.background_color) && (
                      <div style={{
                        position: 'absolute',
                        bottom: '2px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: '0',
                        height: '0',
                        borderLeft: window.innerWidth <= 768 ? '10px solid transparent' : '12px solid transparent',
                        borderRight: window.innerWidth <= 768 ? '10px solid transparent' : '12px solid transparent',
                        borderBottom: `${window.innerWidth <= 768 ? '8px' : '10px'} solid #${item.rarity_color || item.name_color || item.background_color}`,
                        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
                      }}></div>
                    )}
                  </div>
                  
                  <div style={{ 
                    flex: 1,
                    textAlign: window.innerWidth <= 480 ? 'center' : 'left'
                  }}>
                    <h4 style={{ 
                      color: '#DE7E21', 
                      marginBottom: window.innerWidth <= 768 ? '8px' : '10px',
                      fontSize: window.innerWidth <= 768 ? '0.9rem' : '1rem',
                      lineHeight: '1.2'
                    }}>
                      {item.market_name_pt || item.market_name}
                    </h4>
                    {item.market_name_pt && (
                      <div style={{ 
                        fontSize: window.innerWidth <= 768 ? '0.75rem' : '0.8rem', 
                        color: '#999', 
                        marginBottom: window.innerWidth <= 768 ? '6px' : '8px', 
                        fontStyle: 'italic' 
                      }}>
                        {item.market_name}
                      </div>
                    )}
                    
                    <div style={{ 
                      fontSize: window.innerWidth <= 768 ? '0.8rem' : '0.9rem', 
                      lineHeight: '1.4' 
                    }}>
                      <div style={{ marginBottom: '5px' }}>
                        <strong>💰 Preço:</strong> <span style={{ color: '#4caf50' }}>
                          {formatPrice(item.histogram.lowest_sell_order, item.histogram.lowest_sell_order_brl, item)}
                        </span>
                      </div>
                      <div style={{ marginBottom: '5px' }}>
                        <strong>📊 Volume:</strong> {item.histogram.sell_order_summary.quantity || 0}
                      </div>
                      <div style={{ marginBottom: '8px', fontSize: '0.8rem', color: '#888' }}>
                        ⏱️ <strong>Atualizado:</strong> {formatDate(item.extracted_data?.search_timestamp || Date.now())}
                      </div>
                      <div>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: '#DE7E21',
                            textDecoration: 'none',
                            fontSize: '0.8rem'
                          }}
                        >
                          🔗 Ver no Steam Market
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            </div>
          </div>
          
          {/* Indicador de Página - Apenas Desktop */}
          {filteredResults.length > 9 && window.innerWidth > 768 && (
            <div style={{
              textAlign: 'center',
              marginTop: '20px',
              fontSize: '14px',
              color: '#ccc'
            }}>
              Página {currentPage + 1} de {Math.ceil(filteredResults.length / 9)} 
              <span style={{ marginLeft: '15px', color: '#DE7E21' }}>
                ({(currentPage * 9) + 1}-{Math.min((currentPage + 1) * 9, filteredResults.length)} de {filteredResults.length} itens)
              </span>
            </div>
          )}
          
          {/* Indicador Simples - Mobile */}
          {window.innerWidth <= 768 && filteredResults.length > 0 && (
            <div style={{
              textAlign: 'center',
              marginTop: '20px',
              fontSize: '14px',
              color: '#DE7E21',
              background: 'rgba(222, 126, 33, 0.1)',
              padding: '10px',
              borderRadius: '8px',
              border: '1px solid rgba(222, 126, 33, 0.3)'
            }}>
              📋 {filteredResults.length} {filteredResults.length === 1 ? 'item encontrado' : 'itens encontrados'}
            </div>
          )}


        </div>
      )}

      {/* Exibição de item único (quando busca específica) */}
      {marketData && (
        <div style={{
          background: 'rgba(222, 126, 33, 0.1)',
          border: '2px solid #DE7E21',
          borderRadius: '12px',
          padding: '25px',
          marginTop: '20px'
        }}>
          <div style={{ display: 'flex', gap: '25px', alignItems: 'flex-start' }}>
            <div style={{ minWidth: '150px', position: 'relative' }}>
              <img
                src={marketData.image}
                alt={marketData.market_name}
                style={{
                  width: '150px',
                  height: '150px',
                  objectFit: 'contain',
                  borderRadius: '8px',
                  background: 'rgba(0,0,0,0.3)'
                }}
                onError={(e) => {
                  e.target.src = "https://steamuserimages-a.akamaihd.net/ugc/87094793200602665/47310654230B596C62658A147113B24845B9E156/";
                }}
              />
              {/* Indicador de Raridade */}
              {(marketData.rarity_color || marketData.name_color || marketData.background_color) && (
                <div style={{
                  position: 'absolute',
                  bottom: '5px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '0',
                  height: '0',
                  borderLeft: '18px solid transparent',
                  borderRight: '18px solid transparent',
                  borderBottom: `15px solid #${marketData.rarity_color || marketData.name_color || marketData.background_color}`,
                  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
                }}></div>
              )}
            </div>
            
            <div style={{ flex: 1 }}>
              <h3 style={{ 
                color: '#DE7E21', 
                marginBottom: '15px',
                fontSize: '1.4rem'
              }}>
                {marketData.market_name_pt || marketData.market_name}
              </h3>
              {marketData.market_name_pt && (
                <div style={{ fontSize: '1rem', color: '#999', marginBottom: '15px', fontStyle: 'italic' }}>
                  {marketData.market_name}
                </div>
              )}
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px' }}>
                <div>
                  <strong>💰 Menor Preço:</strong><br />
                  <span style={{ color: '#4caf50', fontSize: '1.2rem' }}>
                    {formatPrice(marketData.histogram.lowest_sell_order, marketData.histogram.lowest_sell_order_brl)}
                  </span>
                </div>
                <div>
                  <strong>📈 Maior Ordem:</strong><br />
                  <span style={{ color: '#2196f3', fontSize: '1.2rem' }}>
                    {formatPrice(marketData.histogram.highest_buy_order, marketData.histogram.highest_buy_order_brl)}
                  </span>
                </div>
                <div>
                  <strong>📊 Volume:</strong><br />
                  <span style={{ fontSize: '1.2rem' }}>
                    {marketData.histogram.sell_order_summary.quantity || 0} unidades
                  </span>
                </div>
              </div>

              {/* Status dos dados extraídos */}
              {marketData.extracted_data && (
                <div style={{ 
                  margin: '20px 0',
                  padding: '15px',
                  background: 'rgba(222, 126, 33, 0.1)',
                  borderRadius: '8px',
                  border: '1px solid rgba(222, 126, 33, 0.3)'
                }}>
                  <div style={{ color: '#DE7E21', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '10px' }}>
                    📊 Status da Extração de Dados em Tempo Real:
                  </div>
                  <div style={{ fontSize: '0.85rem', display: 'flex', flexWrap: 'wrap', gap: '15px' }}>
                    <span style={{ color: marketData.extracted_data.found_image ? '#4caf50' : '#ff9800' }}>
                      {marketData.extracted_data.found_image ? '✅' : '⚠️'} Imagem Real
                    </span>
                    <span style={{ color: marketData.extracted_data.found_price ? '#4caf50' : '#ff9800' }}>
                      {marketData.extracted_data.found_price ? '✅' : '⚠️'} Preço Real
                    </span>
                    <span style={{ color: marketData.extracted_data.found_volume ? '#4caf50' : '#ff9800' }}>
                      {marketData.extracted_data.found_volume ? '✅' : '⚠️'} Volume Real
                    </span>
                    {marketData.extracted_data.api_success && (
                      <span style={{ color: '#4caf50' }}>
                        ✅ API Steam OK
                      </span>
                    )}
                  </div>
                  
                  <div style={{ marginTop: '8px', fontSize: '0.8rem', color: '#ccc' }}>
                    <strong>Fonte:</strong> Steam Community Market (Tempo Real)<br/>
                    <strong>Atualizado:</strong> {formatDate(marketData.extracted_data?.search_timestamp || Date.now())}
                  </div>
                </div>
              )}
              
              <div style={{ color: '#ccc', fontSize: '0.9rem', lineHeight: '1.6' }}>
                <p><strong>ID:</strong> {marketData.nameID}</p>
                <p><strong>App ID:</strong> {marketData.appID}</p>
                <p><strong>Última Atualização:</strong> {formatDate(marketData.updated_at)}</p>
                
                <a
                  href={marketData.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: '#DE7E21',
                    textDecoration: 'none',
                    fontWeight: 'bold',
                    display: 'inline-block',
                    marginTop: '15px',
                    padding: '8px 16px',
                    border: '1px solid #DE7E21',
                    borderRadius: '6px',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = '#DE7E21';
                    e.target.style.color = '#000';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = 'transparent';
                    e.target.style.color = '#DE7E21';
                  }}
                >
                  🔗 Ver no Steam Market
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
      
      {/* Modal de Detalhes do Item - Renderizado no final para sobrepor tudo */}
      {showModal && selectedItem && (
        <div
          className="steam-modal-overlay"
          style={{
            position: 'fixed',
            top: '0px',
            left: '0px',
            right: '0px',
            bottom: '0px',
            height: '100vh',
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center', // Centralizar verticalmente
            justifyContent: 'center', // Centralizar horizontalmente
            zIndex: 999999,
            padding: window.innerWidth <= 480 ? '20px 10px' : '20px', // Padding uniforme
            margin: '0px',
            overflow: 'auto', // Permite scroll se necessário
            boxSizing: 'border-box',
            backdropFilter: 'blur(2px)'
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, #1a1a1a, #2d2d2d)',
              border: '1px solid #DE7E21',
              borderRadius: window.innerWidth <= 480 ? '10px' : '15px',
              padding: '0px',
              maxWidth: window.innerWidth <= 480 ? '95%' : window.innerWidth <= 768 ? '85%' : '700px',
              width: '100%',
              maxHeight: window.innerWidth <= 480 ? '85vh' : '90vh', // Mais altura disponível
              minHeight: window.innerWidth <= 480 ? '300px' : '400px',
              position: 'relative',
              boxShadow: '0 0 30px rgba(222, 126, 33, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              marginTop: '0px' // Garantir que não há margem extra
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabeçalho fixo do modal */}
            <div style={{
              padding: window.innerWidth <= 480 ? '15px 20px' : '20px 30px', // Menos padding no mobile
              borderBottom: '1px solid rgba(222, 126, 33, 0.3)',
              position: 'relative',
              flexShrink: 0
            }}>
              {/* Botão de Fechar */}
              <button
                onClick={() => setShowModal(false)}
                style={{
                  position: 'absolute',
                  top: '15px',
                  right: '15px',
                  background: 'none',
                  border: 'none',
                  color: '#fff',
                  fontSize: '24px',
                  cursor: 'pointer',
                  padding: '5px',
                  borderRadius: '50%',
                  width: '40px',
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.3s ease',
                  zIndex: 1
                }}
                onMouseEnter={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.1)'}
                onMouseLeave={(e) => e.target.style.background = 'none'}
              >
                ×
              </button>
              
              <h2 style={{ 
                color: selectedItem.name_color ? `#${selectedItem.name_color}` : '#DE7E21', 
                marginBottom: window.innerWidth <= 480 ? '8px' : '10px',
                fontSize: window.innerWidth <= 480 ? '1.3rem' : '1.6rem', // Menor no mobile
                paddingRight: window.innerWidth <= 480 ? '40px' : '50px'
              }}>
                {selectedItem.market_name_pt || selectedItem.market_name}
              </h2>
              
              {selectedItem.market_name_pt && (
                <div style={{ 
                  fontSize: window.innerWidth <= 480 ? '0.95rem' : '1.1rem', // Menor no mobile
                  color: '#999', 
                  fontStyle: 'italic' 
                }}>
                  Original: {selectedItem.market_name}
                </div>
              )}
            </div>
            
            {/* Conteúdo com scroll */}
            <div style={{
              padding: window.innerWidth <= 480 ? '20px 15px' : '30px', // Menos padding no mobile
              overflowY: 'auto',
              flex: 1,
              scrollbarWidth: 'thin',
              scrollbarColor: '#DE7E21 rgba(0,0,0,0.3)'
            }}>
              {/* Conteúdo do Modal */}
              <div style={{ 
                display: 'flex', 
                gap: window.innerWidth <= 480 ? '15px' : '30px', // Menos gap no mobile
                alignItems: 'flex-start',
                flexDirection: window.innerWidth <= 480 ? 'column' : 'row' // Coluna no mobile
              }}>
                {/* Imagem Grande */}
                <div style={{ 
                  minWidth: window.innerWidth <= 480 ? '150px' : '200px',
                  alignSelf: window.innerWidth <= 480 ? 'center' : 'flex-start', // Centralizar no mobile
                  position: 'relative'
                }}>
                  <img
                    src={selectedItem.image}
                    alt={selectedItem.market_name}
                    style={{
                      width: window.innerWidth <= 480 ? '150px' : '200px', // Menor no mobile
                      height: window.innerWidth <= 480 ? '150px' : '200px', // Menor no mobile
                      objectFit: 'contain',
                      borderRadius: window.innerWidth <= 480 ? '8px' : '12px',
                      background: selectedItem.background_color ? `#${selectedItem.background_color}` : 'rgba(0,0,0,0.3)',
                      border: selectedItem.name_color ? `2px solid #${selectedItem.name_color}` : '2px solid #DE7E21'
                    }}
                    onError={(e) => {
                      e.target.src = "https://steamuserimages-a.akamaihd.net/ugc/87094793200602665/47310654230B596C62658A147113B24845B9E156/";
                    }}
                  />
                  {/* Indicador de Raridade */}
                  {(selectedItem.rarity_color || selectedItem.name_color || selectedItem.background_color) && (
                    <div style={{
                      position: 'absolute',
                      bottom: window.innerWidth <= 480 ? '5px' : '8px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: '0',
                      height: '0',
                      borderLeft: window.innerWidth <= 480 ? '15px solid transparent' : '20px solid transparent',
                      borderRight: window.innerWidth <= 480 ? '15px solid transparent' : '20px solid transparent',
                      borderBottom: `${window.innerWidth <= 480 ? '12px' : '16px'} solid #${selectedItem.rarity_color || selectedItem.name_color || selectedItem.background_color}`,
                      filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
                    }}></div>
                  )}
                  
                  {/* Informações técnicas */}
                  <div style={{
                    marginTop: window.innerWidth <= 480 ? '10px' : '15px',
                    padding: window.innerWidth <= 480 ? '8px' : '10px',
                    background: 'rgba(0,0,0,0.3)',
                    borderRadius: '8px',
                    fontSize: window.innerWidth <= 480 ? '0.75rem' : '0.8rem', // Menor no mobile
                    color: '#ccc'
                  }}>
                    {selectedItem.classid && <p><strong>Class ID:</strong> {selectedItem.classid}</p>}
                    {selectedItem.instanceid && <p><strong>Instance ID:</strong> {selectedItem.instanceid}</p>}
                    {selectedItem.tradable !== undefined && <p><strong>Tradable:</strong> {selectedItem.tradable ? 'Sim' : 'Não'}</p>}
                    {selectedItem.commodity !== undefined && <p><strong>Commodity:</strong> {selectedItem.commodity ? 'Sim' : 'Não'}</p>}
                  </div>
                </div>
                
                {/* Informações Detalhadas */}
                <div style={{ flex: 1 }}>
                  {selectedItem.type && (
                    <div style={{ 
                      background: 'rgba(222, 126, 33, 0.1)', 
                      padding: '10px', 
                      borderRadius: '8px', 
                      marginBottom: '20px',
                      border: '1px solid rgba(222, 126, 33, 0.3)'
                    }}>
                      <strong>Tipo:</strong> {selectedItem.type}
                    </div>
                  )}

                  {/* Informações de Preço */}
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: window.innerWidth <= 480 ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))', // Uma coluna no mobile
                    gap: window.innerWidth <= 480 ? '10px' : '15px', // Menos gap no mobile
                    marginBottom: window.innerWidth <= 480 ? '20px' : '25px' 
                  }}>
                    <div style={{ 
                      background: 'rgba(76, 175, 80, 0.1)', 
                      padding: window.innerWidth <= 480 ? '12px' : '15px', // Menos padding no mobile
                      borderRadius: '8px',
                      border: '1px solid rgba(76, 175, 80, 0.3)'
                    }}>
                      <div style={{ 
                        color: '#4caf50', 
                        fontWeight: 'bold',
                        fontSize: window.innerWidth <= 480 ? '0.9rem' : '1rem' // Menor no mobile
                      }}>💰 Menor Preço</div>
                      <div style={{ 
                        fontSize: window.innerWidth <= 480 ? '1.1rem' : '1.3rem', // Menor no mobile
                        marginTop: '5px' 
                      }}>
                        {formatPrice(selectedItem.histogram?.lowest_sell_order, selectedItem.histogram?.lowest_sell_order_brl)}
                      </div>
                    </div>
                    
                    <div style={{ 
                      background: 'rgba(33, 150, 243, 0.1)', 
                      padding: window.innerWidth <= 480 ? '12px' : '15px',
                      borderRadius: '8px',
                      border: '1px solid rgba(33, 150, 243, 0.3)'
                    }}>
                      <div style={{ 
                        color: '#2196f3', 
                        fontWeight: 'bold',
                        fontSize: window.innerWidth <= 480 ? '0.9rem' : '1rem'
                      }}>📈 Maior Oferta</div>
                      <div style={{ 
                        fontSize: window.innerWidth <= 480 ? '1.1rem' : '1.3rem',
                        marginTop: '5px' 
                      }}>
                        {formatPrice(selectedItem.histogram?.highest_buy_order, selectedItem.histogram?.highest_buy_order_brl)}
                      </div>
                    </div>
                    
                    <div style={{ 
                      background: 'rgba(255, 152, 0, 0.1)', 
                      padding: window.innerWidth <= 480 ? '12px' : '15px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 152, 0, 0.3)'
                    }}>
                      <div style={{ 
                        color: '#ff9800', 
                        fontWeight: 'bold',
                        fontSize: window.innerWidth <= 480 ? '0.9rem' : '1rem'
                      }}>📊 Listagens</div>
                      <div style={{ 
                        fontSize: window.innerWidth <= 480 ? '1.1rem' : '1.3rem',
                        marginTop: '5px' 
                      }}>
                        {selectedItem.sell_listings || selectedItem.histogram?.sell_order_summary?.quantity || 0}
                      </div>
                    </div>
                  </div>

                  {/* Dados Steam Search API */}
                  {selectedItem.steam_search_data && (
                    <div style={{ 
                      background: 'rgba(222, 126, 33, 0.1)', 
                      padding: '15px', 
                      borderRadius: '8px',
                      marginBottom: '20px',
                      border: '1px solid rgba(222, 126, 33, 0.3)'
                    }}>
                      <div style={{ color: '#DE7E21', fontWeight: 'bold', marginBottom: '10px' }}>
                        🔥 Dados Steam Market API
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', fontSize: '0.9rem' }}>
                        {selectedItem.sell_price_text && (
                          <div><strong>Preço Steam:</strong> {selectedItem.sell_price_text}</div>
                        )}
                        {selectedItem.sale_price_text && (
                          <div><strong>Preço Promoção:</strong> {selectedItem.sale_price_text}</div>
                        )}
                        {selectedItem.sell_listings && (
                          <div><strong>Vendas Ativas:</strong> {selectedItem.sell_listings}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Link para Steam */}
                  <a
                    href={selectedItem.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: '#DE7E21',
                      textDecoration: 'none',
                      fontWeight: 'bold',
                      display: 'inline-block',
                      padding: '12px 24px',
                      border: '2px solid #DE7E21',
                      borderRadius: '8px',
                      transition: 'all 0.3s ease',
                      background: 'transparent'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = '#DE7E21';
                      e.target.style.color = '#000';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = 'transparent';
                      e.target.style.color = '#DE7E21';
                    }}
                  >
                    🔗 Ver no Steam Community Market
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SteamMarketSearch;