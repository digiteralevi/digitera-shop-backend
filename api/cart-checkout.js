import firebase from 'firebase-admin';

// Pag-initialize sa Firebase Admin SDK para sa Backend (Kung hindi pa na-initialize)
if (!firebase.apps.length) {
  firebase.initializeApp({
    credential: firebase.credential.cert({
      projectId: "digitera-levi-shop",
      // Tiyaking naka-set up ang iyong FIREBASE_PRIVATE_KEY at FIREBASE_CLIENT_EMAIL sa Vercel Environment Variables kung gagamitin ito
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined
    })
  });
}
const db = firebase.firestore();

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
    return res.status(405).json({ error: "Method not allowed." });
  }

  // =========================================================================
  // DETEKTOR KUNG ANG REQUEST AY GALING SA PAYMONGO WEBHOOK (EMAIL DELIVERY SYSTEM)
  // =========================================================================
  if (req.body && req.body.data && req.body.data.attributes && req.body.data.attributes.type === 'payment.paid') {
    try {
      const paymentAttributes = req.body.data.attributes.payload.data.attributes;
      const customerEmail = paymentAttributes.billing.email;
      const customerName = paymentAttributes.billing.name || "Valued Customer";
      
      // Pagkuha sa listahan ng mga biniling produkto mula sa external reference o description ng transaction
      const descriptionText = paymentAttributes.description || "";
      
      // Magpadala ng email gamit ang Resend API sa buyer
      // Para masiguradong dynamic, kukunin natin ang access links mula sa Firebase products collection
      const productsSnapshot = await db.collection("products").get();
      let emailLinksHtml = "";

      productsSnapshot.forEach((doc) => {
        const product = doc.data();
        // Kung ang pangalan ng produkto sa Firebase ay kasama sa description ng resibo, ibigay ang link
        if (descriptionText.toLowerCase().includes(product.name.toLowerCase())) {
          emailLinksHtml += `
            <div style="background:#F7F3EB; border:1px solid #D6C7E8; padding:15px; border-radius:8px; margin-bottom:15px;">
              <h3 style="color:#4A2E80; margin:0 0 10px 0;">${product.name}</h3>
              <p style="margin:0 0 10px 0; font-size:14px; color:#555;">Click the secure link below to download or access your digital asset template:</p>
              <a href="${product.accessLink}" style="background:#BF953F; color:white; padding:10px 20px; text-decoration:none; border-radius:5px; font-weight:bold; display:inline-block;" target="_blank">🚀 ACCESS YOUR FILE HERE</a>
            </div>
          `;
        }
      });

      // Kung walang natagpuang tugmang produkto, magbigay ng default notice (fallback)
      if (!emailLinksHtml) {
        emailLinksHtml = `<p style="color:#666;">Thank you for your purchase! Our team is processing your download secure links. Please contact digiteralevi@gmail.com if you don't receive it shortly.</p>`;
      }

      // I-trigger ang Resend Email API
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
        },
        body: JSON.stringify({
          from: 'Digitera Levi <onboarding@resend.dev>', // Pwede mong palitan ng custom domain mo kapag na-verify mo na sa Resend
          to: customerEmail,
          subject: '✨ Your Digital Products Delivery - Digitera Levi',
          html: `
            <div style="font-family:sans-serif; max-width:600px; margin:0 auto; padding:20px; color:#4A2E80;">
              <h2>Hello, ${customerName}!</h2>
              <p>Thank you so much for purchasing from <strong>Digitera Levi Shop</strong>! Your transaction was fully validated and successful.</p>
              <p>Here are your secure digital asset deployment links:</p>
              <main>${emailLinksHtml}</main>
              <hr style="border:0; border-top:1px solid #eee; margin:20px 0;">
              <p style="font-size:12px; color:#888;">If you have any questions or deployment issues, please reply directly to this email or contact us via our official support channels.</p>
            </div>
          `
        })
      });

      return res.status(200).json({ success: true, message: "Webhook processed and delivery email deployed successfully!" });
    } catch (webhookError) {
      console.error("Webhook processing failure:", webhookError);
      return res.status(500).json({ error: webhookError.message });
    }
  }

  // =========================================================================
  // STANDARD CHECKOUT SESSION CREATION SYSTEM (GALING SA STOREFRONT CART CODES)
  // =========================================================================
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

  // Pagsamahin ang mga pangalan ng produkto sa isang string para sa Webhook Tracker
  const cartDescription = items.map(item => item.name).join(', ');

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
            description: cartDescription, // Importante ito para malaman ng Webhook kung anong item ang babasahin sa Firebase!
            line_items: lineItems,
            payment_method_types: ['qrph'], // PINWERSA NATIN NA QR PH / QR CODE LANG MUNA ANG LALABAS!
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
