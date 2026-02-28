/**
 * Billing Success Page Template
 *
 * Shown after a successful Stripe Checkout. Three states:
 * 1. Key just provisioned → show key with copy button + "save now" warning
 * 2. Key already consumed → tell them it was shown once, link to docs
 * 3. Error → show error message (e.g., webhook hasn't fired yet)
 */

interface SuccessPageProps {
  apiKey?: string
  planName?: string
  monthlyLimit?: number
  alreadyConsumed?: boolean
  error?: string
}

export function successPageHtml(props: SuccessPageProps): string {
  const { apiKey, planName, monthlyLimit, alreadyConsumed, error } = props

  let body: string

  if (error) {
    body = `
      <div class="card error-card">
        <h2>⏳ Almost there...</h2>
        <p>${escapeHtml(error)}</p>
        <button onclick="location.reload()" class="btn">Refresh Page</button>
      </div>
    `
  } else if (apiKey) {
    body = `
      <div class="card success-card">
        <div class="check-icon">✓</div>
        <h2>Welcome to ${escapeHtml(planName ?? 'your plan')}!</h2>
        <p>Your API key has been provisioned. <strong>Save it now — it won't be shown again.</strong></p>

        <div class="key-container">
          <code id="api-key">${escapeHtml(apiKey)}</code>
          <button onclick="copyKey()" class="copy-btn" id="copy-btn" title="Copy to clipboard">📋 Copy</button>
        </div>

        <div class="plan-info">
          <span class="plan-badge">${escapeHtml(planName ?? '')}</span>
          <span class="plan-detail">${(monthlyLimit ?? 0).toLocaleString()} requests/month</span>
        </div>

        <div class="usage-example">
          <h3>Quick Start</h3>
          <pre><code>curl -H "Authorization: Bearer ${escapeHtml(apiKey.slice(0, 20))}..." \\
  https://djd-agent-score.fly.dev/v1/score/full?wallet=0x...</code></pre>
        </div>

        <div class="links">
          <a href="/docs" class="btn">📖 API Docs</a>
          <a href="/v1/data/economy" class="btn btn-secondary">📊 Economy Dashboard</a>
        </div>

        <p class="warning">⚠️ This key is shown <strong>once</strong>. If you lose it, you'll need to cancel and resubscribe.</p>
      </div>
    `
  } else if (alreadyConsumed) {
    body = `
      <div class="card consumed-card">
        <h2>Key Already Retrieved</h2>
        <p>Your <strong>${escapeHtml(planName ?? '')}</strong> API key was shown when you first visited this page.
        For security, it's only displayed once.</p>
        <p>If you lost your key, you can manage your subscription and resubscribe:</p>
        <div class="links">
          <a href="/docs" class="btn">📖 API Docs</a>
        </div>
      </div>
    `
  } else {
    body = `
      <div class="card error-card">
        <h2>Something went wrong</h2>
        <p>We couldn't retrieve your API key. Please contact support.</p>
      </div>
    `
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Subscription Active - DJD Agent Score</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    background: #0d1117;
    color: #c9d1d9;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  .card {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 12px;
    padding: 40px;
    max-width: 600px;
    width: 100%;
    text-align: center;
  }
  .check-icon {
    width: 64px;
    height: 64px;
    line-height: 64px;
    font-size: 32px;
    background: #238636;
    border-radius: 50%;
    margin: 0 auto 20px;
    color: #fff;
  }
  h2 { font-size: 24px; margin-bottom: 12px; color: #f0f6fc; }
  h3 { font-size: 16px; margin-bottom: 8px; color: #8b949e; text-align: left; }
  p { font-size: 15px; line-height: 1.6; margin-bottom: 16px; }
  strong { color: #f0f6fc; }
  .key-container {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 12px 16px;
    margin: 20px 0;
    overflow-x: auto;
  }
  .key-container code {
    flex: 1;
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
    font-size: 13px;
    color: #58a6ff;
    word-break: break-all;
    text-align: left;
  }
  .copy-btn {
    background: #21262d;
    border: 1px solid #30363d;
    color: #c9d1d9;
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    white-space: nowrap;
    transition: background 0.2s;
  }
  .copy-btn:hover { background: #30363d; }
  .copy-btn.copied { background: #238636; border-color: #238636; color: #fff; }
  .plan-info {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin: 16px 0;
  }
  .plan-badge {
    background: #1f6feb;
    color: #fff;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 13px;
    font-weight: 600;
  }
  .plan-detail { font-size: 14px; color: #8b949e; }
  .usage-example {
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 16px;
    margin: 20px 0;
    text-align: left;
  }
  .usage-example pre {
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
    font-size: 12px;
    color: #8b949e;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .links {
    display: flex;
    gap: 12px;
    justify-content: center;
    margin: 24px 0 16px;
    flex-wrap: wrap;
  }
  .btn {
    display: inline-block;
    padding: 10px 20px;
    border-radius: 8px;
    text-decoration: none;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid #30363d;
    background: #21262d;
    color: #c9d1d9;
    transition: background 0.2s;
  }
  .btn:hover { background: #30363d; }
  .warning {
    background: #1c1306;
    border: 1px solid #9e6a03;
    border-radius: 8px;
    padding: 12px;
    font-size: 13px;
    color: #d29922;
    margin-top: 20px;
  }
  .error-card { border-color: #9e6a03; }
  .footer {
    margin-top: 24px;
    font-size: 12px;
    color: #484f58;
  }
</style>
</head>
<body>
  ${body}
  <script>
    function copyKey() {
      const key = document.getElementById('api-key')?.textContent ?? '';
      navigator.clipboard.writeText(key).then(() => {
        const btn = document.getElementById('copy-btn');
        if (btn) {
          btn.textContent = '✓ Copied!';
          btn.classList.add('copied');
          setTimeout(() => { btn.textContent = '📋 Copy'; btn.classList.remove('copied'); }, 2000);
        }
      });
    }
  </script>
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
