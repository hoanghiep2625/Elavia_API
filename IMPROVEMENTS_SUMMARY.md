# Cải tiến Hệ thống Quản lý Đơn hàng

## Tổng quan các cải tiến

### 1. Xác nhận thanh toán COD sau giao hàng thành công

✅ **Đã triển khai**: Tự động cập nhật `paymentStatus = "Đã thanh toán"` khi:

- Đơn hàng COD chuyển sang trạng thái "Giao hàng thành công"
- Khách hàng xác nhận "Đã nhận hàng"
- Hệ thống tự động xác nhận sau 48h

**Lợi ích**: Đảm bảo dữ liệu chính xác cho báo cáo doanh thu.

### 2. Lưu lịch sử trạng thái đơn hàng

✅ **Đã triển khai**: Thêm field `statusHistory` vào Order model với thông tin:

- `type`: Loại trạng thái (payment/shipping)
- `from`: Trạng thái cũ
- `to`: Trạng thái mới
- `updatedBy`: Người thực hiện thay đổi
- `updatedAt`: Thời gian thay đổi
- `note`: Ghi chú
- `reason`: Lý do thay đổi
- `isAutomatic`: Thay đổi tự động hay thủ công

**Lợi ích**: Dễ truy vết và giải quyết tranh chấp.

## Chi tiết các thay đổi

### Model Order (order.js)

- ➕ Thêm `statusHistory` array
- ➕ Thêm trạng thái "Giao dịch bị từ chối do nhà phát hành"

### Controller Order (order.js)

- ➕ Helper function `addStatusHistory()`
- 🔄 Cập nhật `createOrder()`: Lưu lịch sử tạo đơn
- 🔄 Cập nhật `updateOrderStatus()`:
  - Lưu lịch sử mỗi lần thay đổi
  - Tự động cập nhật paymentStatus cho COD khi giao hàng thành công
- 🔄 Cập nhật `autoConfirmDeliveredOrders()`: Lưu lịch sử tự động
- 🔄 Cập nhật `confirmReceivedOrder()`: Lưu lịch sử và xử lý COD
- 🔄 Cập nhật `cancelOrder()`: Lưu lịch sử hủy đơn
- ➕ Thêm `getOrderStatusHistory()`: API lấy lịch sử trạng thái

### Cron Job (cron-job-checkpayment.js)

- 🔄 Cập nhật `processMoMoOrder()`: Lưu lịch sử thanh toán
- 🔄 Cập nhật `processZaloPayOrder()`: Lưu lịch sử thanh toán

## API mới

### GET `/api/orders/{orderId}/status-history`

Lấy lịch sử trạng thái của đơn hàng.

**Response:**

```json
{
  "success": true,
  "data": {
    "orderId": "ORDER_ID",
    "currentPaymentStatus": "Đã thanh toán",
    "currentShippingStatus": "Đã nhận hàng",
    "statusHistory": [
      {
        "type": "payment",
        "from": "Khởi tạo",
        "to": "Thanh toán khi nhận hàng",
        "updatedBy": "USER_ID",
        "updatedAt": "2025-01-08T10:00:00Z",
        "note": "Tạo đơn hàng mới",
        "reason": "Khách hàng đặt hàng",
        "isAutomatic": false
      }
    ]
  }
}
```

## Quy trình mới cho COD

1. **Tạo đơn**: `paymentStatus = "Thanh toán khi nhận hàng"`
2. **Giao hàng thành công**: `paymentStatus = "Đã thanh toán"` (tự động)
3. **Xác nhận nhận hàng**: `paymentStatus = "Đã thanh toán"` (nếu chưa cập nhật)
4. **Auto-confirm sau 48h**: `paymentStatus = "Đã thanh toán"` (tự động)

## Trạng thái được thêm mới

### Payment Status

- ➕ "Giao dịch bị từ chối do nhà phát hành"

### Allowed Transitions

- 🔄 Cập nhật ma trận chuyển đổi trạng thái hợp lệ

## Lợi ích của các cải tiến

1. **Báo cáo chính xác**: COD được đánh dấu "Đã thanh toán" đúng thời điểm
2. **Truy vết đầy đủ**: Mọi thay đổi trạng thái đều được ghi lại
3. **Giải quyết tranh chấp**: Lịch sử chi tiết giúp xử lý khiếu nại
4. **Kiểm toán**: Theo dõi ai thay đổi gì và khi nào
5. **Tự động hóa**: Giảm thiểu can thiệp thủ công

## Sử dụng

### Cập nhật trạng thái với lịch sử

```javascript
// API call với note và reason
PUT /api/orders/{id}/status
{
  "shippingStatus": "Giao hàng thành công",
  "note": "Giao hàng thành công tại địa chỉ",
  "reason": "Shipper xác nhận giao thành công"
}
```

### Lấy lịch sử trạng thái

```javascript
GET / api / orders / { orderId } / status - history;
```

## Migration

Đối với các đơn hàng cũ không có `statusHistory`, hệ thống sẽ tự động tạo mảng rỗng và bắt đầu ghi lại từ lần cập nhật tiếp theo.
