export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const payload = req.body;

    // A. CHECKOUT SESSION CREATOR (Galing sa website storefront mo)
    if (payload.items) {
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
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    }

    // B. WEBHOOK LISTENER (Galing kay PayMongo kapag nagbayad na)
    try {
      // Hahanapin natin ang email sa iba't ibang posibleng paglagyan ni PayMongo
      let email = payload.data?.attributes?.data?.attributes?.billing?.email || 
                  payload.data?.attributes?.payload?.data?.attributes?.billing?.email ||
                  payload.data?.attributes?.billing?.email;
                  
      let name = payload.data?.attributes?.data?.attributes?.billing?.name || 
                 payload.data?.attributes?.payload?.data?.attributes?.billing?.name ||
                 payload.data?.attributes?.billing?.name || 
                 "Customer";

      // KUNG NULL: Kukuha tayo sa PayMongo API gamit ang payment ID para masigurado
      if (!email && payload.data?.attributes?.data?.id) {
        const paymentId = payload.data.attributes.data.id;
        const paymongoRes = await fetch(`https://api.paymongo.com/v1/payments/${paymentId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${Buffer.from(process.env.PAYMONGO_SECRET_KEY).toString('base64')}`
          }
        });
        const paymentData = await paymongoRes.json();
        email = paymentData.data?.attributes?.billing?.email;
        name = paymentData.data?.attributes?.billing?.name || "Customer";
      }

      if (email) {
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
            html: `<h1>Hello ${name}!</h1><p>Thank you for your purchase. Your digital assets are ready for download!</p>`
          })
        });
        return res.status(200).json({ status: 'Email sent successfully!' });
      }
      
      return res.status(200).json({ status: 'Webhook received but email fallback empty' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
}
