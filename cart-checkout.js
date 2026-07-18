export default async function handler(req, res) {
  // Pilitin ang lahat ng valid CORS flags sa response stream
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  // Agarang sagutin ang HTTP preflight bago mag-crash sa function body
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    const payload = req.body;

    if (payload && payload.items) {
      const { items, email, redirect_url } = payload;
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
                line_items: items.map(i => ({ 
                  name: i.name, 
                  amount: Math.round(i.price * 100), 
                  quantity: i.quantity, 
                  currency: 'PHP' 
                })),
                payment_method_types: ['gcash', 'qrph'],
                billing: { email: email },
                metadata: { 
                  customer_email: email,
                  purchased_items: JSON.stringify(items.map(i => i.name))
                },
                success_url: redirect_url
              }
            }
          })
        });
        
        const data = await response.json();
        
        if (data.errors) {
          return res.status(400).json({ error: data.errors[0].detail });
        }
        
        return res.status(200).json({ checkout_url: data.data.attributes.checkout_url });
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    }
    return res.status(400).json({ error: "Missing items payload" });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
