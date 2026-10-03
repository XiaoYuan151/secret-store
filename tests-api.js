const checks = {
  GitHub: { url: 'https://api.github.com/user', headers: key => ({ Authorization: `Bearer ${key}`, 'User-Agent': 'Secret-Store' }) },
  GitLab: { url: 'https://gitlab.com/api/v4/user', headers: key => ({ 'PRIVATE-TOKEN': key }) },
  'Hugging Face': { url: 'https://huggingface.co/api/whoami-v2', headers: key => ({ Authorization: `Bearer ${key}` }) },
  OpenAI: { url: 'https://api.openai.com/v1/models', headers: key => ({ Authorization: `Bearer ${key}` }) },
  OpenRouter: { url: 'https://openrouter.ai/api/v1/key', headers: key => ({ Authorization: `Bearer ${key}` }) },
  DeepSeek: { url: 'https://api.deepseek.com/models', headers: key => ({ Authorization: `Bearer ${key}` }) },
  Cloudflare: { url: 'https://api.cloudflare.com/client/v4/user/tokens/verify', headers: key => ({ Authorization: `Bearer ${key}` }) }
};
async function testKey(entry) {
  if (!entry || typeof entry.platform !== 'string' || typeof entry.secret !== 'string') throw new Error('Invalid key');
  const check = checks[entry.platform];
  if (!check) return { ok: false, message: 'No safe built-in test is available for this platform.' };
  try {
    const response = await fetch(check.url, { headers: check.headers(entry.secret), signal: AbortSignal.timeout(8000), redirect: 'error' });
    if (response.ok && entry.platform === 'Cloudflare') {
      const result = await response.json();
      const ok = result.success === true && result.result?.status === 'active';
      return { ok, message: ok ? 'Key accepted by the platform.' : 'Cloudflare reports that this token is inactive or invalid.' };
    }
    return { ok: response.ok, message: response.ok ? 'Key accepted by the platform.' : `Platform returned HTTP ${response.status}.` };
  } catch { return { ok: false, message: 'Could not reach the platform. Check your connection and try again.' }; }
}
module.exports = { testKey };
