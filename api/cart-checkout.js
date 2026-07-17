export default async function handler(req, res) {
res.setHeader('Access-Control-Allow-Credentials', true);
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
}

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed. Dapat POST request ang gamitin sa cart." });
  }

  const { items, redirect_url } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0 || !redirect_url) {
    return res.status(400).json({ error: "Kulang ang detalye ng cart o redirect_url!" });
  }

  const lineItems = items.map(item => ({
    amount: Math.round(parseFloat(item.price) * 100), 
    currency: 'PHP',
    name: item.name,
    quantity: item.quantity || 1
  }));

  try {
    const response = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(process.env.PAYMONGO_SECRET_KEY).toString('base64')}`
      },
      body: JSON.stringify({
        data: {
          attributes: {
            send_email_receipt: true,
            show_description: true,
            show_line_items: true,
            line_items: lineItems,
            payment_method_types: ['qrph'], // QR CODE / QR PH LANG MUNA!
            success_url: redirect_url
          }
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.errors });
    }

    return res.status(200).json({ checkout_url: data.data.attributes.checkout_url });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
