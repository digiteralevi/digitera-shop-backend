import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY 
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
    : undefined;

  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    }),
  });
}

const db = getFirestore();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const payload = req.body;

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
        return res.status(200).json({ checkout_url: data.data.attributes.checkout_url });
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    }
    return res.status(400).json({ error: "Missing items payload" });
  }
}
