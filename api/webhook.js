const nodemailer = require('nodemailer');
const admin = require('firebase-admin');

// 1. Firebase Initialization (gamit na env vars, walang hardcoded key)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}
const db = admin.firestore();

// 2. Nodemailer Setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// 3. Main Webhook Handler
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const event = req.body;
    const payloadData = event?.data?.attributes;
    
    const customerEmail = 
      payloadData?.billing?.email || 
      payloadData?.data?.attributes?.billing?.email || 
      payloadData?.attributes?.billing?.email;

    const customerName = 
      payloadData?.billing?.name || 
      payloadData?.data?.attributes?.billing?.name || 
      "Customer";

    console.log("Customer email detected:", customerEmail);

    if (!customerEmail) {
      return res.status(400).json({ error: 'No recipient email found in payload' });
    }

    const productName = payloadData?.line_items?.[0]?.name || "Free PLR digital products";
    
    // Inayos na pagkuha ng amount
    const rawAmount = 
      payloadData?.amount || 
      payloadData?.payments?.[0]?.attributes?.amount || 
      event?.data?.attributes?.data?.attributes?.amount || 
      100; // default fallback (100 centavos = ₱1.00)

    const amountPaid = rawAmount / 100;

    let downloadLink = "https://drive.google.com/file/d/18KFu3WFWm56W-MdL9Wld8Z9jXWcfedL2/view?usp=drive_link";
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

    // Save order to Firestore
    try {
      await db.collection('orders').add({
        customer: customerName,
        email: customerEmail,
        items: productName,
        total: amountPaid,
        payment: "PayMongo",
        status: "Paid",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log("Order successfully saved to Firestore with amount:", amountPaid);
    } catch (saveError) {
      console.error("Error saving order to Firestore:", saveError);
    }

    // Send email
    const mailOptions = {
      from: `"Digitera Levi" <${process.env.EMAIL_USER}>`,
      to: customerEmail,
      subject: `Your Digital Product: ${productName}`,
      html: `
        <h2>Thank you for your purchase!</h2>
        <p>You have successfully purchased: <strong>${productName}</strong></p>
        <p>Click the button below to access and download your product:</p>
        <a href="${downloadLink}" style="background: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Download Product</a>
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
