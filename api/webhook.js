const nodemailer = require('nodemailer');
const admin = require('firebase-admin');

// 1. I-initialize ang Firebase na may malakas na pag-ayos ng Private Key format
if (!admin.apps.length) {
  let rawKey = process.env.FIREBASE_PRIVATE_KEY || '';
  
  // Linisin ang mga sobra o maling quotes at pagkakabuo
  rawKey = rawKey.trim();
  if ((rawKey.startsWith('"') && rawKey.endsWith('"')) || (rawKey.startsWith("'") && rawKey.endsWith("'"))) {
    rawKey = rawKey.slice(1, -1);
  }
  
  // Siguraduhing tama ang conversion ng mga bagong linya
  const formattedKey = rawKey.includes('\\n') ? rawKey.replace(/\\n/g, '\n') : rawKey;

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: formattedKey,
    }),
  });
}
const db = admin.firestore();

// 2. I-setup ang Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// 3. Vercel Serverless Function
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const event = req.body;
    const payloadData = event?.data?.attributes;
    
    // Kunin ang email ng customer mula sa PayMongo payload
    const customerEmail = 
      payloadData?.billing?.email || 
      payloadData?.data?.attributes?.billing?.email || 
      payloadData?.attributes?.billing?.email;

    console.log("Customer email detected:", customerEmail);

    if (!customerEmail) {
      return res.status(400).json({ error: 'No recipient email found in payload' });
    }

    // Kunin ang pangalan ng produkto mula sa PayMongo
    const productName = payloadData?.line_items?.[0]?.name || "Free PLR digital products";
    console.log("Product name detected:", productName);

    // Hanapin ang accessLink sa Firebase Firestore gamit ang pangalan ng produkto
    let downloadLink = "https://drive.google.com"; // Fallback link
    try {
      const productsSnapshot = await db.collection('products')
        .where('name', '==', productName)
        .get();

      if (!productsSnapshot.empty) {
        const productData = productsSnapshot.docs[0].data();
        if (productData.accessLink) {
          downloadLink = productData.accessLink;
        }
      }
    } catch (dbError) {
      console.error("Error fetching accessLink from Firebase:", dbError);
    }

    console.log("Download link to send:", downloadLink);

    // 4. Ipadala ang email sa pamamagitan ng Nodemailer kasama ang tamang link
    const mailOptions = {
      from: `"Digitera Levi" <${process.env.EMAIL_USER}>`,
      to: customerEmail,
      subject: `Your Digital Product: ${productName}`,
      html: `
        <h2>Salamat sa iyong pagbili!</h2>
        <p>Matagumpay mong binili ang: <strong>${productName}</strong></p>
        <p>I-click ang link sa ibaba para ma-access ang iyong produkto:</p>
        <a href="${downloadLink}" style="background: #0070f3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">I-download ang Produkto</a>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Nodemailer email sent successfully:', info.response);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error in webhook execution:', error);
    return res.status(500).json({ error: error.message });
  }
};
