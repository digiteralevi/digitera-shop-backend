const nodemailer = require('nodemailer');

// 1. I-setup ang Nodemailer transporter gamit ang Gmail credentials mo
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// 2. Vercel Serverless Function
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

    const productName = payloadData?.line_items?.[0]?.name || "Free PLR digital products";
    
    // Direktang gamitin ang iyong Google Drive link para sa produkto
    const downloadLink = "https://drive.google.com/file/d/18KFu3WFWm56W-MdL9Wld8Z9jXWcfedL2/view?usp=drive_link";

    console.log("Download link to send:", downloadLink);

    // 3. Ipadala ang email sa pamamagitan ng Nodemailer kasama ang tamang link at button
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
