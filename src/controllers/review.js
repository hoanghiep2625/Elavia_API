// controllers/review.js
import Review from "../models/review.js";
import Order from "../models/order.js";

// Tạo đánh giá mới
export const createReview = async (req, res) => {
  try {
    const { orderId, productVariantId, rating, comment, images } = req.body;

    // Kiểm tra user đã mua và đã giao hàng thành công chưa (không phân biệt hoa thường)
    const hasBought = await Order.exists({
      _id: orderId,
      "user._id": req.user.id,
      "items.productVariantId": productVariantId,
      status: { $regex: /^giao hàng thành công$/i }
    });
    if (!hasBought) {
      return res.status(400).json({ message: "Bạn chỉ có thể đánh giá sản phẩm đã mua." });
    }

    // Tạo review
    const review = await Review.create({
      userId: req.user.id,
      orderId,
      productVariantId,
      rating,
      comment,
      images
    });

    return res.status(201).json({ message: "Đánh giá thành công", data: review });
  } catch (error) {
    // Xử lý lỗi unique index (mỗi người chỉ được đánh giá 1 lần 1 sản phẩm trong 1 đơn)
    if (error.code === 11000) {
      return res.status(400).json({ message: "Bạn đã đánh giá sản phẩm này trong đơn hàng này." });
    }
    return res.status(500).json({ message: error.message });
  }
};

// Lấy danh sách đánh giá theo productVariantId
export const getReviewsByProductVariant = async (req, res) => {
  try {
    const { productVariantId } = req.params;
    const reviews = await Review.find({ productVariantId })
      .select("rating comment images createdAt userId orderId productVariantId")
      .populate("userId", "name")
      .populate("orderId", "orderId");
    return res.status(200).json({ data: reviews });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};