export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // 1. WEBHOOK LISTENER (DITO NAGDEDELIVER ANG PAYMONGO)
  if (req.method === 'POST' && req.body.data?.attributes?.type === 'payment.paid') {
    try {
      const email = req.body.data.attributes.payload.data.attributes.billing.email;
      const name = req.body.data.attributes.payload.data.attributes.billing.name;
      
      // I-trigger ang Resend Email
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
        },
        body: JSON.stringify({
          from: 'Digitera Shop <onboarding@resend.dev>',
          to: email,
          subject: 'Your Digital Asset Delivery',
          html: `<h1>Hello ${name}!</h1><p>Thank you for your purchase. Your files are ready!</p>`
        })
      });
      return res.status(200).json({ status: 'Email sent' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // 2. CHECKOUT SESSION CREATOR (DITO NAGREREQUEST NG PAYMENT ANG SHOP)
  if (req.method === 'POST') {
    const { items, email, redirect_url } = req.body;
    
    const response = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(process.env.PAYMONGO_SECRET_KEY).toString('base64')}`
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
    return res.status(200).json({ checkout_url: data.data.attributes.checkout_url });
  }
}
