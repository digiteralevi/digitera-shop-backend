const nodemailer = require('nodemailer');

// 1. I-setup ang Nodemailer transporter gamit ang Gmail credentials mo mula sa Vercel Environment Variables
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// 2. Gamitin ito sa loob ng iyong webhook function kapag magpapadala na ng email:
async function sendProductEmail(customerEmail, productName, downloadLink) {
  try {
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
  } catch (error) {
    console.error('Error sending email via Nodemailer:', error);
  }
}
