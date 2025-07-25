import Review from "../models/review.js";
import Order from "../models/order.js";
import upload from "../middlewares/multer.js";
import cloudinary from "../config/cloudinary.js";

// Hàm upload 1 ảnh lên Cloudinary
const uploadImageToCloudinary = async (file) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "products" },
      (error, result) => {
        if (error) reject(error);
        else resolve({ url: result.secure_url, public_id: result.public_id });
      }
    );
    stream.end(file.buffer);
  });
};

// Tạo đánh giá mới có ảnh
export const createReview = (req, res) => {
  upload.array("images", 6)(req, res, async (err) => {
    if (err) return res.status(400).json({ message: err.message });

    try {
      const { orderId, productVariantId, rating, comment } = req.body;

      const hasBought = await Order.exists({
        _id: orderId,
        "user._id": req.user.id,
        "items.productVariantId": productVariantId,
        status: { $regex: /^giao hàng thành công$/i }
      });
      if (!hasBought) {
        return res.status(400).json({ message: "Bạn chỉ có thể đánh giá sản phẩm đã mua." });
      }

      // Upload ảnh nếu có
      const images = req.files && req.files.length > 0
        ? await Promise.all(req.files.map(uploadImageToCloudinary))
        : [];

      // Tạo review
      const review = await Review.create({
        userId: req.user.id,
        orderId,
        productVariantId,
        rating,
        comment,
        images,
      });

      // Cập nhật reviewed = true
      await Order.updateOne(
        { _id: orderId, "items.productVariantId": productVariantId },
        { $set: { "items.$.reviewed": true } }
      );

      return res.status(201).json({ message: "Đánh giá thành công", data: review });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({ message: "Bạn đã đánh giá sản phẩm này trong đơn hàng này." });
      }
      return res.status(500).json({ message: error.message });
    }});
};

// Lấy danh sách đánh giá theo productVariantId
export const getReviewsByProductVariant = async (req, res) => {
  try {
    const { productVariantId } = req.params;
    const reviews = await Review.find({ productVariantId })
      .select("rating comment images createdAt userId orderId productVariantId")
      .populate("userId", "name")
      .populate("orderId", "orderId")
    return res.status(200).json({ data: reviews });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Sửa đánh giá (chỉ cho phép sửa 1 lần)
export const updateReview = (req, res) => {
  upload.array("images", 5)(req, res, async (err) => {
    if (err) return res.status(400).json({ message: err.message });

    try {
      const { id } = req.params;
      const { rating, comment } = req.body;

      let removedImages = req.body.removedImages;
      if (!Array.isArray(removedImages)) {
        removedImages = removedImages ? [removedImages] : [];
      }

      const review = await Review.findById(id);
      if (!review) {
        return res.status(404).json({ message: "Đánh giá không tồn tại." });
      }

      if (review.userId.toString() !== req.user.id.toString()) {
        return res.status(403).json({ message: "Bạn không có quyền sửa đánh giá này." });
      }
      if (review.updatedCount >= 1) {
        return res.status(403).json({ message: "Bạn chỉ được chỉnh sửa đánh giá 1 lần." });
      }
      review.rating = rating ?? review.rating;
      review.comment = comment ?? review.comment;

      // 🧹 XÓA ẢNH ĐƯỢC YÊU CẦU
      if (removedImages.length > 0) {
        await Promise.all(
          removedImages.map(async (public_id) => {
            try {
              await cloudinary.uploader.destroy(public_id);
            } catch (err) {
              console.error("Không thể xóa ảnh:", public_id);
            }
          })
        );
        review.images = review.images.filter((img) => !removedImages.includes(img.public_id));
      }

      // 📤 UPLOAD ẢNH MỚI
      if (req.files && req.files.length > 0) {
        const uploadedImages = await Promise.all(
          req.files.map((file) => {
            return new Promise((resolve, reject) => {
              const stream = cloudinary.uploader.upload_stream(
                { folder: "products" },
                (error, result) => {
                  if (error) reject(error);
                  else resolve({ url: result.secure_url, public_id: result.public_id });
                }
              );
              stream.end(file.buffer);
            });
          })
        );

        review.images.push(...uploadedImages);
      }

      review.updatedCount += 1;
      await review.save();

      return res.status(200).json({ message: "Sửa đánh giá thành công", data: review });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
};





// Xóa đánh giá (chỉ chủ sở hữu mới được xóa)
export const deleteReview = async (req, res) => {
  try {
    const { id } = req.params;

    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({ message: "Đánh giá không tồn tại." });
    }

    // Kiểm tra quyền
    if (review.userId.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: "Bạn không có quyền xóa đánh giá này." });
    }

    // Xóa ảnh trên Cloudinary nếu có
    if (review.images && review.images.length > 0) {
      await Promise.all(
        review.images.map(async (img) => {
          try {
            await cloudinary.uploader.destroy(img.public_id);
          } catch (err) {
            console.error("Không thể xóa ảnh Cloudinary:", img.public_id);
          }
        })
      );
    }

    // Cập nhật lại order items.reviewed = false
    await Order.updateOne(
      {
        _id: review.orderId,
        "items.productVariantId": review.productVariantId,
      },
      {
        $set: {
          "items.$.reviewed": false,
        },
      }
    );

    // Xóa đánh giá
    await review.deleteOne();

    return res.status(200).json({ message: "Xóa đánh giá thành công." });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
export const getReviewsByOrder = async (req, res) => {
  try {
    const { orderId } = req.query;

    if (!orderId) {
      return res.status(400).json({ message: "Thiếu orderId" });
    }

    const reviews = await Review.find({ orderId }).populate("userId", "name");
    return res.status(200).json(reviews);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
