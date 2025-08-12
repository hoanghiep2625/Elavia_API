# � Quy trình Hoàn tiền (Refund Flow) - Cập nhật v2.0

## 📋 Tổng quan

Hệ thống hoàn tiền được thiết kế để xử lý tự động và thủ công, đảm bảo bảo mật và hiệu quả cao nhất.

## 🔑 Bảo mật

### API Security

- **MoMo & ZaloPay**: Sử dụng chữ ký HMAC-SHA256 với secret key
- **Environment Variables**: Tất cả thông tin nhạy cảm được lưu trong .env
- **Request Validation**: Kiểm tra chặt chẽ tất cả request parameters
- **Timeout**: Giới hạn thời gian response 30 giây

### Endpoints

```
POST /api/admin/refunds/:orderId (action: auto_refund) - Hoàn tiền tự động
GET /api/admin/refunds/:orderId/status - Kiểm tra trạng thái
PATCH /api/admin/refunds/:orderId - Xử lý thủ công
GET /api/admin/refunds - Danh sách yêu cầu hoàn tiền
```

## 🤖 Hoàn tiền Tự động

### MoMo API

- **Endpoint**: `/v2/gateway/api/refund`
- **Signature**: `accessKey + amount + description + orderId + partnerCode + requestId + transId`
- **Response**: `resultCode = 0` thành công

### ZaloPay API

- **Endpoint**: `/v2/refund`
- **Signature**: `app_id + zp_trans_id + amount + description + timestamp`
- **Response**: `return_code = 1` thành công

### **2. COD (Đã thanh toán)**

```
Hủy đơn COD đã giao thành công
    ↓
Đánh dấu cần hoàn tiền thủ công
    ↓
Admin liên hệ khách hàng để thỏa thuận
    ↓
Hoàn tiền qua chuyển khoản ngân hàng
```

### **3. Đơn Chưa Thanh Toán**

```
Hủy đơn chưa thanh toán
    ↓
Chỉ cộng lại stock
    ↓
Không cần hoàn tiền
```

## 🛠️ API Endpoints

### **User APIs (đã có)**

- `POST /orders/cancel` - User hủy đơn hàng
- `POST /orders/:orderId/confirm-received` - User xác nhận nhận hàng

### **Admin APIs (mới)**

- `PATCH /admin/orders/:id` - Admin hủy đơn hàng (có xử lý hoàn tiền)
- `GET /admin/refunds` - Lấy danh sách yêu cầu hoàn tiền
- `PATCH /admin/refunds/:orderId` - Xử lý hoàn tiền

## 📋 Cấu Trúc Dữ Liệu Hoàn Tiền

```javascript
// Trong Order.paymentDetails
{
  refundRequested: true,
  refundRequestedAt: "2025-08-12T07:50:00.000Z",
  refundRequestedBy: "admin", // "buyer" | "admin" | "seller"
  refundStatus: "Chờ xử lý", // "Chờ xử lý" | "Đã duyệt" | "Bị từ chối" | "Đã hoàn thành"
  refundAmount: 450000,
  refundProcessedAt: "2025-08-12T08:30:00.000Z",
  refundProcessedBy: "admin_user_id",
  adminNote: "Hoàn tiền do lỗi giao hàng",
  refundMethod: "Chuyển khoản", // Chỉ có khi hoàn thành
  refundTransactionId: "REF123456789" // Chỉ có khi hoàn thành
}
```

## 🎛️ Các Trạng Thái Hoàn Tiền

| Trạng thái        | Mô tả                     | Hành động tiếp theo |
| ----------------- | ------------------------- | ------------------- |
| **Chờ xử lý**     | Yêu cầu hoàn tiền mới tạo | Admin cần duyệt     |
| **Đã duyệt**      | Admin đã duyệt yêu cầu    | Thực hiện hoàn tiền |
| **Đã hoàn thành** | Đã hoàn tiền thành công   | Kết thúc            |
| **Bị từ chối**    | Admin từ chối hoàn tiền   | Kết thúc            |

## 🚀 Tính Năng Đã Implement

### **Backend**

✅ Tự động detect đơn hàng bị hủy và cần hoàn tiền  
✅ Xử lý hoàn tiền cho MoMo, ZaloPay, COD  
✅ Gửi thông báo Telegram cho admin  
✅ API quản lý hoàn tiền cho admin  
✅ Cộng lại stock khi hủy đơn  
✅ Ghi lại lịch sử thay đổi đầy đủ

### **Frontend Admin**

✅ Hiển thị modal thông tin hoàn tiền khi hủy đơn  
✅ Hiển thị trạng thái hoàn tiền trong trang chi tiết  
✅ Logic hủy đơn hàng được cải thiện

## 📱 User Experience

### **Khi User Hủy Đơn**

1. **Chưa thanh toán**: Hủy ngay, không hoàn tiền
2. **Đã thanh toán**: Tạo yêu cầu hoàn tiền, thông báo admin

### **Khi Admin Hủy Đơn**

1. Hiển thị modal với thông tin hoàn tiền chi tiết
2. Tự động gửi thông báo Telegram
3. Cộng lại stock cho sản phẩm

### **Theo Dõi Hoàn Tiền**

- Admin có thể xem danh sách yêu cầu hoàn tiền
- Trạng thái hoàn tiền hiển thị rõ ràng trong đơn hàng
- Lịch sử thay đổi được ghi đầy đủ

## 🔧 Cấu Hình Môi Trường

Đảm bảo các biến môi trường sau được cấu hình:

```
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

## 📞 Hỗ Trợ & Troubleshooting

- **Lỗi hoàn tiền**: Kiểm tra logs và thông báo Telegram
- **Stock không được cộng**: Kiểm tra transaction và database
- **UI không hiển thị**: Refresh trang và kiểm tra API response

---

**Phiên bản**: 2.0  
**Cập nhật**: 12/08/2025  
**Tác giả**: GitHub Copilot
