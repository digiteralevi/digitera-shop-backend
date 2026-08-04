const nodemailer = require('nodemailer');
const admin = require('firebase-admin');

// 1. Firebase Initialization
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: "digitera-levi-shop",
      clientEmail: "firebase-adminsdk-fbsvc@digitera-levi-shop.iam.gserviceaccount.com",
      privateKey: `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDPSqUaisLVtYVx
/c6QTPACoT0r2FGupUmqIcJPuzD7IqvuOoTFLP5ifA2q+zUUs8GK+cV7ffw4Upum
xTlw46xggjnHXEb3z0TJ16+03JKlP3oWAhAVsaXkd6joCrjrnlvmuzhfA6yeGDYz
jRemBImTvA1PKccejqbvqcgKwjkvC+vDPhZQPkYPeI/lNiD1OY/hVOSe+9nz6oCi
yxOxPh64PG0ccvgsbOQdgAF95vYYK2t5i0QqbxfAyhrnrm3uEBYu4AUU/1kZOOx8
mpZBEbvoaVmnB3gjhmW2zlcuUKlCgbrix+0JoQIh2j2qcfYbErPujnJ0uMPpgRa0
6cKn/fIvAgMBAAECggEAEbBce3HY43S8gPg4Hs858feBaVLp0X3wVdDQrI4cRWn1
gvxCZTMMOCo+3lbWdkBKpUngJMQg+EtwVeBhoPUEui2SsaT5t17cD19U8pmZ9/j9
OZCOf9NrhR4C714u3ohibkOOsWj2W31Ubry9BmE/vjgfaKB3ie+BZlU2KVjemVmD
Noj1LJwUw/huHr4+YvucuoA1Rc84Pra09Y5mi0UK2WjMPkpVOpM6yVMvimOS6dsT
yTL+b3pHYjFVi4T7r7a6OdOM/7vc5Dttu3Uzh0oK1QobSOExdzOubPtbRbhkuk5J
b5qDLSkweCY52oVMw4N+M2OQcNwcNLpLv5+OdKkWgQKBgQDxZOtO78hrsoQdlzim
tovvvcbimNEnuwSMwPUmZ75sPVkgijdGn0qhXcslUb7APlvolgTq/vOL14iekNXE
G2t9/wHwskulALjmn9hBPRfSrcbjBref+L8G7ndBIgYKIZ6xLBk141z16Z0I0a4R
hQh2gq4qxnvyQXHGIFBkXxmFgQKBgQDb1X4G9L0bwE1FF+O+5dnKEGxlZu/NqvNJ
0FU5Z3R6CnqsCD055erg7IWmD/Q9wBXLEHDT32TNatYnaMoBeVyRwMfFo3U2zbYE
T6is7ZDZuvJH+0TdhxQbcHAo1dtSFDqv6CsTLGIMNEVDRxPN2Br2Ci3JLukRy6Z3
hCyxhIkvrwKBgDIKq8U3bCL3ZPAFc1cMLMJMYziCWYmU+YJ8VdXaV910ck+Ol5rq
VrxRB1X7NkIAK2lyAB7/L1nkGoxUlhwLWyNJhAtzyr6wAaS9qkUL9y5TnBFgSRy+
oks7kDlOZlYfVhiAfdFwCstn3IgBf8Zd/70hph1z/Cnia0WZWVEVbeMBAoGABbPQ
BRYsIaAnYPdxrO4BbEBoz2iQJ+GbVfrVexu35cKH1BaSoAHayeLYxKn9R+zHo/DV
PGm7D6kJzRPmyYsAX7eEdxf6XmWPpyT51yKCc2NqDXvzGVv7pYqRHj4N5l8n9pAr
LeAk2vQwJ8KcPOayLFevQFy7Jv8FXmxLTH+Hn3kCgYAJbbpy1g4toPbidpBSk0bP
nvQhM19rhIxLLmaPqZyKbcWl+r6L4fHnXa7ScJkIuh2tAeOyYuWaOhGzYRGSUwuM
/jf4GlZO7+PToE8wz75++zYImMWEWA4HqaDFlgQ2acjqQ68pRY3qGY3b33lMOO3D
Du5K3MPqj7Shu+N6XXq40Q==
-----END PRIVATE KEY-----`
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
