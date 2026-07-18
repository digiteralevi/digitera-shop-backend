import admin from 'firebase-admin';

// --- FIREBASE ADMIN INITIALIZATION (server-side, secure) ---
// Gumagamit ng tatlong hiwalay na env variables (tulad ng naka-set na sa Vercel):
// FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL, FIREBASE_PROJECT_ID
if (!admin.apps.length) {
  try {
    // Ang private key mula sa Firebase JSON ay naglalaman ng literal na "\n" sa loob ng string.
    // Kapag na-paste ito sa Vercel bilang plain text, kailangang i-convert pabalik sa totoong newlines.
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

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  let payload;
  try {
    payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  // Ang totoong webhook event galing kay PayMongo ay may hugis: { data: { type: 'event', attributes: { type: '...', data: {...} } } }
  // Ang request galing sa frontend checkout ay simpleng { items, email, redirect_url }
  const isPaymongoWebhook = payload?.data?.type === 'event' && !!payload?.data?.attributes?.type;

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
              payment_method_types: ['gcash', 'qrph'],
              billing: { email },
              success_url: redirect_url,
              // Isinama natin ito para makuha ulit ni Part B kapag tumawag na si PayMongo
              metadata: {
                customer_email: email,
                purchased_items: JSON.stringify(items.map(i => i.name))
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
  // PART B: WEBHOOK LISTENER (Galing kay PayMongo kapag paid na)
  // ==========================================
  try {
    const attributes = payload.data?.attributes?.data?.attributes || payload.data?.attributes;

    if (!attributes) {
      return res.status(200).json({ status: 'Webhook received but payload structure unknown' });
    }

    let email = attributes.metadata?.customer_email || attributes.billing?.email;
    let name = attributes.billing?.name || "Customer";
    let itemsJson = attributes.metadata?.purchased_items;
    let itemsArray = [];

    if (itemsJson) {
      try {
        itemsArray = JSON.parse(itemsJson);
      } catch (jsonErr) {
        console.error("JSON Parse error:", jsonErr.message);
      }
    }

    let linksHtml = "";

    if (itemsArray.length > 0 && db) {
      for (const itemName of itemsArray) {
        const productsRef = db.collection('products');
        const snapshot = await productsRef.where('name', '==', itemName).get();

        let downloadUrl = null;

        if (!snapshot.empty) {
          snapshot.forEach(doc => {
            const data = doc.data();
            downloadUrl = data.downloadUrl || data.accessLink || data.secureLink || data.link;
          });
        }

        if (downloadUrl) {
          linksHtml += `
            <div style="margin-bottom: 15px; padding: 15px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #f9f9f9;">
              <p style="margin: 0 0 10px 0; font-weight: bold; color: #333;">${itemName}</p>
              <a href="${downloadUrl}" style="display: inline-block; background-color: #6c5ce7; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;" target="_blank">📥 Download Your Asset</a>
            </div>
          `;
        } else {
          linksHtml += `<p style="color: #555;">Thank you for purchasing <strong>${itemName}</strong>! We are finalizing your download link. If it doesn't appear shortly, please contact support.</p>`;
        }
      }
    } else {
      linksHtml = `<p>Thank you for your purchase! Please contact us with your receipt to claim your digital products.</p>`;
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
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
              <h1 style="color: #6c5ce7;">Hello ${name}!</h1>
              <p>Thank you for your purchase from Digitera Shop. Your digital assets are ready for download below:</p>
              <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
              ${linksHtml}
              <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
              <p style="font-size: 12px; color: #777;">If you have any questions or issues with your download, feel free to reply to this email.</p>
            </div>
          `
        })
      });

      return res.status(200).json({ status: 'Email with Firebase links sent successfully!' });
    }

    return res.status(200).json({ status: 'Webhook received but email fallback empty' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
