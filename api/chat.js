// api/chat.js
// Secure proxy para sa AI chat widget.
// Ang OpenRouter key ay nasa server-side na lang (env var), hindi na makikita ng browser.

module.exports = async (req, res) => {
  // CORS headers - para makatawag ang storefront (ibang domain: github.io)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Missing or invalid messages array' });
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + process.env.OPENROUTER_KEY,
        'HTTP-Referer': 'https://digiteralevi.github.io/digitera-storefront/',
        'X-Title': 'Digitera Levi Shop',
      },
      body: JSON.stringify({
        model: 'openrouter/auto',
        max_tokens: 500,
        messages: messages,
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error('OpenRouter error:', data.error);
      return res.status(500).json({ error: data.error.message || 'AI service error' });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('Error in chat proxy:', error);
    return res.status(500).json({ error: error.message });
  }
};
