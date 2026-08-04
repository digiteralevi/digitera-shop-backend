const nodemailer = require('nodemailer');
const admin = require('firebase-admin');

// 1. Direktang i-initialize ang Firebase gamit ang eksaktong mga detalye mo
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: "digitera-levi-shop",
      clientEmail: "firebase-adminsdk-fbsvc@digitera-levi-shop.iam.gserviceaccount.com",
      privateKey: `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC1keby+eX2vtmi
8nWdLcppXcquUZuxMkaniYdzQ12Hrs/Hpg7cnDNKaVEzcXjIGvA5rhv7TU0xVygM
nyi4VzUVvsrw8MWNGuiMn1P1ZnV9Br3qPtijQDbQqnbo1ZvKfWH7poR5yXM0ctnyc
Aaz+rxY8o6OvbjhsZiu1fh93C3P4ISCKNvWvcpw8eHf+xaJuy/5RUbWPJ/y9crk0
2x0/cax9FJmafanDChuw4yzcGvxMpsU43QGSuXtWn+shoiQyfvLdaXEZyRZLusvy
x2/KrBiacmCfW6E66R3SBJknABIDrLk2wzzlqMgV2ZIHIdm5v/5xw53pLxLalqYt
4u1/KSnnAgMBAAECggEABquC7+cVNxDAvvcoMet2NZOv9+JglUxTAyGOu8G8RFk8
IcnsXtdQHQosZPbkqHkw3PWT6pHm5Yqdmoas1bkyNU28E3v++SCqXPK6kdmxn6Ca
IIBhFG+EcFJV/lM3U3o1Q1DbZPkawdTEVBjNqZd1+ilKwI2MfhLsxSCKeF2P14wU
HUPOwL4EM/pnu3CEPSXl/9NanRRrnTLnjKfv5wGfvkw+lvNrtyTPl9unS2ACEEM0
OBBjuY/uR9Q/qY7k34xSKsLDPKXk67GSphPBqW1pcoXSbWYd0hPxZa2aongQ3bsQ
IuPyvMCYKjL/h4WlINDhwm7uFGMP0slh1NOAea49UQKBgQDmiLyqv19bIpwmxai1
eZ7Qi9Qzs1m9dqurlTT+rS2vjVhZgeFWKoU7nxFyqV3wm/73dPLghBYUYPr1CShe
ojgWhGNH7dxT3jUXkjgS6W6p+Hob0Vura1eN2leZfSSBnZnbenMmwESauXiaz1O0
M37gMttzTkcac7RsqDlbbBasdwKBgQDJoIJRr0n4GmF6jO5ipwGQ54hpuk6E3BGs
nbXXj/LQXUNHmwSZHGDlMrBWNbaswIkxpTdGWnW3F8RGizZw7Ooz3IqQ6JDOfwOOd
Vv//qICztC1w9o/OqLqA9iJAkqfL97TGPZtAVuhprKTV/IFbcKrcEn39fFHo/+CC
w6xNoQF6EQKBgHH9CHTRHYA9k8JkF7Bry4hIq4tI0kWpaOb1ZvfKf31/QUE4xEfL
nzIcXdxQgBLAVIjQPYox7I0O+VDhW59wrD9qqaUDGrxvVEqFuDkXjoHFwyEf68/3F
nMwqOwhM5YElgU8Rs+BkT0fGD4lUnInMsJ6A5xuTh/rfXUYgxAOdZXSvAoGBAL0q
wqXm/2sdSgOhItxOJmpeIEt0XNbnC+zXqELRRD+ncIsK7rpz/JitAPIxPO1BSrZwS
rbQAidAvh5tWCuEq4ryvHKOL+X9Fqoeg61fCkNWJEyUrvupmNWzvAF3S+mkMQufH
PxSTNUSH/LLjT74pq7QECX68l+DhyJMG4G6Iw2jxAoGBAJmJD2ptqSMX9SrfM4uG
hUnLLRLr4p8uN/mI7iHDFyHxN/JhVb4ZHMPxVYLHkLjAiiio9dIDjVE2PTMgIbvc
nbkPrr/ZSowEA5HcpjRSJthzzV1FJx5egCiSa1AX45jIe89SrWxi8pBhrG7XzzCXJ
3+IX+Tc99VWRg8KxJCAqM02z
-----END PRIVATE KEY-----`
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
