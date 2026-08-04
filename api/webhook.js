const nodemailer = require('nodemailer');

// 1. I-setup ang Nodemailer transporter gamit ang Gmail credentials mo
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// 2. Dito nagsisimula ang Vercel Serverless Function export
module.exports = async (req, res) => {
  // Siguraduhing POST request ang tinatanggap mula sa PayMongo webhook
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const event = req.body;

    // Halimbawa: Kunin ang detalye mula sa PayMongo event payload
    // (Palitan depende sa kung paano mo kinukuha ang data sa dating code mo)
    const data = event.data?.attributes?.data;
    const checkoutSession = event.data?.attributes;
    
    // Halimbawang pagkuha ng email at produkto mula sa PayMongo payload
    const customerEmail = checkoutSession?.billing?.email || checkoutSession?.line_items?.[0]?.name; // I-adjust ayon sa lumang code mo
    const productName = "Digital Product"; 
    const downloadLink = "https://your-download-link.com";

    // Tawagin ang function para magpadala ng email
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
