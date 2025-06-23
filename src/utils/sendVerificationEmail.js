import nodemailer from "nodemailer";

const sendVerificationEmail = async (toEmail, code) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER, // ví dụ: shopelavia@gmail.com
      pass: process.env.EMAIL_PASS, // dùng "mật khẩu ứng dụng" từ Gmail
      
    },
  });
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: toEmail,
    subject: "Xác thực tài khoản Elavia",
    html: `<p>Mã xác thực của bạn là: <b>${code}</b></p>`,
  };
  await transporter.sendMail(mailOptions);
};

export default sendVerificationEmail;
