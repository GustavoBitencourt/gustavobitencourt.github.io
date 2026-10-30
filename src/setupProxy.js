// Proxy usado apenas pelo servidor de desenvolvimento (npm start).
// Encaminha /steam-api/* para steamcommunity.com, contornando o CORS da Steam.
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function setupProxy(app) {
  app.use(
    '/steam-api',
    createProxyMiddleware({
      target: 'https://steamcommunity.com',
      changeOrigin: true,
      pathRewrite: { '^/steam-api': '' },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
        Accept: 'application/json, text/xml, */*'
      },
      onProxyReq: (proxyReq) => {
        // Não repassar cookies/origem do localhost para a Steam
        proxyReq.removeHeader('cookie');
        proxyReq.removeHeader('origin');
        proxyReq.removeHeader('referer');
      }
    })
  );
};
