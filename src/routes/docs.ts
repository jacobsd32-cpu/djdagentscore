import { Hono } from 'hono'

const docs = new Hono()

docs.get('/', (c) => {
  c.header('Content-Type', 'text/html; charset=utf-8')
  c.header('Cache-Control', 'public, max-age=3600')
  return c.body(SWAGGER_HTML)
})

const SWAGGER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DJD Agent Score — API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    body { margin: 0; background: #1a1a2e; }
    #swagger-ui .topbar { display: none; }
    .swagger-ui .info .title { color: #e94560; }
    .swagger-ui .info .description { color: #c4c4c4; }
    .swagger-ui .scheme-container { background: #16213e; }
    .swagger-ui .opblock-tag { color: #e94560; border-bottom-color: #0f3460; }
    .swagger-ui .opblock .opblock-summary-method { font-weight: bold; }
    .swagger-ui .btn.execute { background-color: #e94560; border-color: #e94560; }
    .swagger-ui .btn.execute:hover { background-color: #c73d54; }
    .swagger-ui select { font-weight: bold; }
    .header-banner {
      background: linear-gradient(135deg, #0f3460, #1a1a2e);
      padding: 2rem;
      text-align: center;
      border-bottom: 2px solid #e94560;
    }
    .header-banner h1 {
      color: #e94560;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 1.8rem;
      margin: 0 0 0.5rem;
    }
    .header-banner p {
      color: #8888aa;
      font-family: system-ui, sans-serif;
      margin: 0;
      font-size: 0.95rem;
    }
    .header-banner .badge {
      display: inline-block;
      background: #e94560;
      color: white;
      padding: 0.2rem 0.6rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: bold;
      margin-left: 0.5rem;
      vertical-align: middle;
    }
  </style>
</head>
<body>
  <div class="header-banner">
    <h1>DJD Agent Score <span class="badge">API</span></h1>
    <p>On-chain reputation scoring for autonomous AI agents &middot; <a href="/pricing" style="color:#818cf8;text-decoration:underline">View pricing &amp; plans</a></p>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
  <script>
    SwaggerUIBundle({
      url: '/openapi.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [
        SwaggerUIBundle.presets.apis,
        SwaggerUIBundle.SwaggerUIStandalonePreset,
      ],
      layout: 'BaseLayout',
      defaultModelsExpandDepth: -1,
      docExpansion: 'list',
      filter: true,
      tryItOutEnabled: true,
    })
  </script>
</body>
</html>`

export default docs
