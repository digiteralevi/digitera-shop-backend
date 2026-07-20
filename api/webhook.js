import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey
      })
    });
  } catch (err) {
    console.error('Firebase admin init failed:', err.message);
  }
}

const db = admin.apps.length ? admin.firestore() : null;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  let payload;
  try {
    payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  console.log('PAYLOAD TYPE:', payload?.data?.attributes?.type);
  console.log('PAYLOAD PREVIEW:', JSON.stringify(payload).substring(0, 500));

  const isPaymongoWebhook = !!(payload?.data?.attributes?.type);

  // ==========================================
  // PART A: FRONTEND CHECKOUT SESSION CREATION
  // ==========================================
  if (!isPaymongoWebhook) {
    try {
      const { items, email, redirect_url } = payload;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'No items provided' });
      }

      const response = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${Buffer.from(process.env.PAYMONGO_SECRET_KEY || '').toString('base64')}`
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
              payment_method_types: ['gcash', 'qrph', 'card', 'paymaya'],
              billing: { email },
              success_url: redirect_url,
              cancel_url: redirect_url,
              metadata: {
                customer_email: email,
                purchased_items: JSON.stringify(items.map(i => i.name)),
                purchased_items_data: JSON.stringify(items.map(i => ({
                  name: i.name,
                  price: i.price,
                  quantity: i.quantity
                })))
              }
            }
          }
        })
      });

      const data = await response.json();

      if (data.errors) {
        return res.status(400).json({ error: data.errors[0].detail });
      }

      return res.status(200).json({ checkout_url: data.data.attributes.checkout_url });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ==========================================
  // PART B: WEBHOOK LISTENER
  // ==========================================
  try {
    const eventType = payload?.data?.attributes?.type;
    console.log('EVENT TYPE:', eventType);

    const attributes = payload?.data?.attributes?.data?.attributes;
    console.log('ATTRIBUTES PREVIEW:', JSON.stringify(attributes).substring(0, 300));

    if (!attributes) {
      return res.status(200).json({ status: 'Webhook received but attributes empty' });
    }

    let email = attributes?.billing?.email || attributes?.metadata?.customer_email;
    let name = attributes?.billing?.name || "Customer";
    let itemsJson = attributes?.metadata?.purchased_items;
    let itemsDataJson = attributes?.metadata?.purchased_items_data;
    let itemsArray = [];
    let itemsDataArray = [];

    console.log('EMAIL:', email);
    console.log('ITEMS JSON:', itemsJson);

    if (itemsJson) {
      try { itemsArray = JSON.parse(itemsJson); }
      catch (e) { console.error("JSON parse error:", e.message); }
    }

    if (itemsDataJson) {
      try { itemsDataArray = JSON.parse(itemsDataJson); }
      catch (e) { console.error("Items data parse error:", e.message); }
    }

    if (itemsArray.length === 0 && attributes?.line_items) {
      itemsArray = attributes.line_items.map(i => i.name);
    }

    if (itemsDataArray.length === 0 && attributes?.line_items) {
      itemsDataArray = attributes.line_items.map(i => ({
        name: i.name,
        price: i.amount / 100,
        quantity: i.quantity
      }));
    }

    console.log('ITEMS ARRAY:', JSON.stringify(itemsArray));

    // ✅ CALCULATE TOTAL AMOUNT
    const totalAmount = itemsDataArray.length > 0
      ? itemsDataArray.reduce((sum, item) => sum + (item.price * item.quantity), 0)
      : (attributes?.amount ? attributes.amount / 100 : 0);

    // ✅ GET PAYMENT METHOD
    const paymentMethod = attributes?.payments?.[0]?.data?.attributes?.source?.type
      || attributes?.payment_method_used
      || 'unknown';

    // ✅ GET PAYMENT ID
    const paymentId = payload?.data?.attributes?.data?.id || 'unknown';

    let linksHtml = "";

    if (itemsArray.length > 0 && db) {
      for (const itemName of itemsArray) {
        const snapshot = await db.collection('products')
          .where('name', '==', itemName)
          .get();

        let downloadUrl = null;

        if (!snapshot.empty) {
          snapshot.forEach(doc => {
            const data = doc.data();
            downloadUrl = data.accessLink || data.downloadUrl || data.file_secure_url;
          });
        }

        console.log('PRODUCT:', itemName, '| URL:', downloadUrl);

        if (downloadUrl) {
          linksHtml += `
            <div style="margin-bottom:15px; padding:15px; border:1px solid #e0e0e0; border-radius:8px; background:#f9f9f9;">
              <p style="margin:0 0 10px 0; font-weight:bold; color:#333;">${itemName}</p>
              <a href="${downloadUrl}" style="display:inline-block; background:#6c5ce7; color:white; padding:10px 20px; text-decoration:none; border-radius:5px; font-weight:bold;" target="_blank">📥 Download Your Asset</a>
            </div>
          `;
        } else {
          linksHtml += `<p>Thank you for purchasing <strong>${itemName}</strong>! Please contact support.</p>`;
        }
      }
    }

    // ✅ SAVE ORDER TO FIREBASE
    if (db && email) {
      try {
        await db.collection('orders').add({
          customerEmail: email,
          customerName: name,
          items: itemsDataArray.length > 0 ? itemsDataArray : itemsArray.map(name => ({ name, price: 0, quantity: 1 })),
          totalAmount: totalAmount,
          paymentMethod: paymentMethod,
          paymentId: paymentId,
          status: 'completed',
          paidAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log('ORDER SAVED TO FIREBASE');
      } catch (orderErr) {
        console.error('Error saving order:', orderErr.message);
      }
    }

    // ✅ SEND EMAIL
    if (email) {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
        },
        body: JSON.stringify({
          from: 'Digitera Shop <onboarding@resend.dev>',
          to: email,
          subject: 'Your Digital Asset Delivery',
          html: `
            <div style="font-family:Arial,sans-serif; max-width:600px; margin:0 auto; color:#333;">
              <h1 style="color:#6c5ce7;">Hello ${name}!</h1>
              <p>Thank you for your purchase! Your digital assets are ready below:</p>
              <hr style="border:0; border-top:1px solid #eee; margin:20px 0;">
              ${linksHtml}
              <hr style="border:0; border-top:1px solid #eee; margin:20px 0;">
              <p style="font-size:12px; color:#777;">Questions? Reply to this email.</p>
            </div>
          `
        })
      });

      const emailData = await emailRes.json();
      console.log('RESEND RESPONSE:', JSON.stringify(emailData));

      return res.status(200).json({ status: 'Email sent and order saved!' });
    }

    return res.status(200).json({ status: 'Webhook received but no email found' });

  } catch (err) {
    console.error('WEBHOOK ERROR:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
