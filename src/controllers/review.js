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

// Sửa đánh giá (chỉ cho phép sửa 1 lần)
export const updateReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment, images } = req.body;

    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({ message: "Đánh giá không tồn tại." });
    }
    if (review.userId.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: "Bạn không có quyền sửa đánh giá này." });
}
    if (review.updatedCount >= 1) {
      return res.status(400).json({ message: "Bạn chỉ được sửa đánh giá 1 lần." });
    }

    review.rating = rating ?? review.rating;
    review.comment = comment ?? review.comment;
    review.images = images ?? review.images;
    review.updatedCount += 1;
    await review.save();

    return res.status(200).json({ message: "Sửa đánh giá thành công", data: review });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Xóa đánh giá (chỉ chủ sở hữu mới được xóa)
export const deleteReview = async (req, res) => {
  try {
    const { id } = req.params;

    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({ message: "Đánh giá không tồn tại." });
    }
    if (review.userId.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: "Bạn không có quyền xóa đánh giá này." });
    }

    await review.deleteOne();

    return res.status(200).json({ message: "Xóa đánh giá thành công." });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};