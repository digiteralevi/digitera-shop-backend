export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    try {
      const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { items, email, redirect_url } = payload;

      const response = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${Buffer.from(process.env.PAYMONGO_SECRET_KEY || '').toString('base64')}`
        },
        body: JSON.stringify({
          data: {
            attributes: {
              line_items: items.map(i => ({ name: i.name, amount: Math.round(i.price * 100), quantity: i.quantity, currency: 'PHP' })),
              payment_method_types: ['gcash', 'qrph'],
              billing: { email: email },
              success_url: redirect_url
            }
          }
        })
      });

      const data = await response.json();
      if (data.errors) return res.status(400).json({ error: data.errors[0].detail });
      return res.status(200).json({ checkout_url: data.data.attributes.checkout_url });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  return res.status(405).end();
}
