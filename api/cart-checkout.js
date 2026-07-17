export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const payload = req.body;

    // A. CHECKOUT SESSION CREATOR (Galing sa website mo)
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
                // DITO NATIN TINATAGO ANG EMAIL PARA HINDI MAWALA KAHIT ANONG PAYMENT METHOD
                metadata: { customer_email: email },
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

    // B. WEBHOOK LISTENER (Galing kay PayMongo kapag paid na)
    try {
      // 1. Hahanapin ang email sa metadata (Pinakasiguradong paraan natin ngayon)
      let email = payload.data?.attributes?.metadata?.customer_email ||
                  payload.data?.attributes?.data?.attributes?.metadata?.customer_email;
                  
      // 2. Fallback sa mga standard billing structures kung sakali
      if (!email) {
        email = payload.data?.attributes?.data?.attributes?.billing?.email || 
                payload.data?.attributes?.billing?.email;
      }
                  
      let name = payload.data?.attributes?.data?.attributes?.billing?.name || 
                 payload.data?.attributes?.billing?.name || 
                 "Customer";

      // 3. Last resort fallback gamit ang Payment Intent
      if (!email && payload.data?.attributes?.payment_intent_id) {
        const intentId = payload.data.attributes.payment_intent_id;
        const intentRes = await fetch(`https://api.paymongo.com/v1/payment_intents/${intentId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${Buffer.from(process.env.PAYMONGO_SECRET_KEY).toString('base64')}`
          }
        });
        const intentData = await intentRes.json();
        email = intentData.data?.attributes?.metadata?.customer_email || 
                intentData.data?.attributes?.billing?.email;
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
            html: `<h1>Hello!</h1><p>Thank you for your purchase. Your digital assets are ready for download!</p>`
          })
        });
        return res.status(200).json({ status: 'Email sent successfully!', sentTo: email });
      }
      
      return res.status(200).json({ status: 'Webhook received but no email found anywhere' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
}
