import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// I-initialize ang Firebase Admin subalit iiwasan ang paulit-ulit na pag-initialize
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Pinapalitan ang mga escaped newlines para mabasa nang maayos ng Firebase
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
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
                metadata: { 
                  customer_email: email,
                  // Dito natin ise-save ang mga biniling produkto para mabasa ng webhook mamaya
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

    // B. WEBHOOK LISTENER (Galing kay PayMongo kapag paid na)
    try {
      let email = payload.data?.attributes?.metadata?.customer_email ||
                  payload.data?.attributes?.data?.attributes?.metadata?.customer_email;
                  
      if (!email) {
        email = payload.data?.attributes?.data?.attributes?.billing?.email || 
                payload.data?.attributes?.billing?.email;
      }
                  
      let name = payload.data?.attributes?.data?.attributes?.billing?.name || 
                 payload.data?.attributes?.billing?.name || 
                 "Customer";

      // Kunin natin ang listahan ng mga biniling items mula sa metadata
      let itemsJson = payload.data?.attributes?.metadata?.purchased_items ||
                      payload.data?.attributes?.data?.attributes?.metadata?.purchased_items;
      
      let itemsArray = [];
      if (itemsJson) {
        itemsArray = JSON.parse(itemsJson);
      }

      // HAHANAPIN NA NATIN ANG TOTOONG LINK MULA SA FIREBASE
      let linksHtml = "";
      
      if (itemsArray.length > 0) {
        for (const itemName of itemsArray) {
          // I-query ang Firebase collection na 'products' kung saan tugma ang pangalan
          const productsRef = db.collection('products');
          const snapshot = await productsRef.where('name', '==', itemName).get();
          
          let downloadUrl = null;
          
          if (!snapshot.empty) {
            snapshot.forEach(doc => {
              const data = doc.data();
              // Hahanapin kung saang field nakatago ang link (mga posibleng pangalan ng field)
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
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
}
