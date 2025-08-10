import nodemailer from "nodemailer";

export async function sendOrderEmail({ to, order, trackingUrl }) {
  const transporter = nodemailer.createTransport({
    service: "gmail", // hoặc SMTP riêng
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const html = `
<div style="font-family: Arial, sans-serif; background-color: #f4f6f8; padding: 40px;">
  <div style="max-width: 640px; margin: auto; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.05); overflow: hidden;">
    
    <!-- Header -->
    <div style="background: linear-gradient(90deg, #1976d2, #42a5f5); padding: 20px; text-align: center; color: white;">
      <h1 style="margin: 0; font-size: 24px;">Cảm ơn bạn đã đặt hàng tại <b>Elavia</b>!</h1>
      <p style="margin: 4px 0 0; font-size: 14px; opacity: 0.9;">Đơn hàng của bạn đã được xác nhận</p>
    </div>

    <!-- Body -->
    <div style="padding: 24px;">
      <p style="font-size: 16px; color: #333;">Xin chào <b>${to}</b>,</p>
      <p style="font-size: 15px; color: #555; line-height: 1.6;">
        Cảm ơn bạn đã tin tưởng và lựa chọn <b>Elavia</b>. Dưới đây là thông tin chi tiết đơn hàng của bạn:
      </p>

      <!-- Order ID -->
      <div style="background: #f1f8ff; padding: 12px 16px; border-left: 4px solid #1976d2; margin: 20px 0; font-size: 15px;">
        <b>Mã đơn hàng:</b> <span style="color: #1976d2;">${
          order.orderId
        }</span>
      </div>

      <!-- Order table -->
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <thead>
          <tr style="background-color: #e3f2fd; text-align: left;">
            <th style="padding: 10px; border: 1px solid #ddd;">Sản phẩm</th>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">Size</th>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">SL</th>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: right;">Giá</th>
          </tr>
        </thead>
        <tbody>
          ${order.items
            .map(
              (item) => `
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd;">${
                item.productName
              }</td>
              <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${
                item.size
              }</td>
              <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${
                item.quantity
              }</td>
              <td style="padding: 10px; border: 1px solid #ddd; text-align: right; color: #d32f2f;">${item.price.toLocaleString()}đ</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>

      <!-- Total -->
      <p style="font-size: 17px; margin-top: 20px; text-align: right;">
        <b>Tổng cộng:</b> <span style="color: #d32f2f;">${order.finalAmount.toLocaleString()}đ</span>
      </p>

      <!-- Button -->
      <div style="text-align: center; margin: 30px 0;">
        <a href="${trackingUrl}" style="
          display: inline-block;
          background: #1976d2;
          color: white;
          padding: 14px 28px;
          border-radius: 6px;
          text-decoration: none;
          font-size: 15px;
          font-weight: bold;
          transition: background 0.3s ease;
        " onmouseover="this.style.background='#125aa0'" onmouseout="this.style.background='#1976d2'">
          Theo dõi đơn hàng
        </a>
      </div>

      <p style="font-size: 13px; color: #777; text-align: center; line-height: 1.5;">
        Xin cảm ơn bạn đã mua sắm tại Elavia.<br>Chúc bạn một ngày tốt lành! 🌸
      </p>
    </div>
  </div>
</div>
`;

  await transporter.sendMail({
    from: '"Elavia Shop" <no-reply@elavia.com>',
    to,
    subject: "Xác nhận đơn hàng Elavia",
    html,
  });
}
