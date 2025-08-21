import Review from "../models/review.js";
import Order from "../models/order.js";
import upload from "../middlewares/multer.js";
import cloudinary from "../config/cloudinary.js";
import jwt from "jsonwebtoken";
import { checkCommentWithGemini } from "../scripts/geminiModeration.js";
import { reviewSuggestionPrompt } from "../scripts/geminiReview.js";
import mongoose from "mongoose";
import axios from "axios";
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
        shippingStatus: { $regex: /^Đã nhận hàng$/i },
      });
      if (!hasBought) {
        return res
          .status(400)
          .json({ message: "Bạn chỉ có thể đánh giá sản phẩm đã mua." });
      }

      // Upload ảnh nếu có
      const images = req.files && req.files.length > 0
        ? await Promise.all(req.files.map(uploadImageToCloudinary))
        : [];
      const status = await checkCommentWithGemini(comment);

      // Tạo review với updateCount = 0
      const review = await Review.create({
        userId: req.user.id,
        orderId,
        productVariantId,
        rating,
        comment,
        images,
        status,
        updatedCount: 0, // Đảm bảo bắt đầu từ 0
      });

      // Cập nhật reviewed = true
      await Order.updateOne(
        { _id: orderId, "items.productVariantId": productVariantId },
        { $set: { "items.$.reviewed": true } }
      );

      return res
        .status(201)
        .json({ message: "Đánh giá thành công", data: review });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({
          message: "Bạn đã đánh giá sản phẩm này trong đơn hàng này.",
        });
      }
      return res.status(500).json({ message: error.message });
    }
  });
};

// Lấy danh sách đánh giá theo productVariantId
export const getReviewsByProductVariant = async (req, res) => {
  try {
    const { productVariantId } = req.params;
    const reviews = await Review.find({ productVariantId })
      .select(
        "rating comment images createdAt userId orderId productVariantId reply"
      )
      .populate("userId", "name")
      .populate("orderId", "orderId");
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
        return res
          .status(403)
          .json({ message: "Bạn không có quyền sửa đánh giá này." });
      }

      if (review.updatedCount >= 1) {
        return res
          .status(403)
          .json({ message: "Bạn chỉ được chỉnh sửa đánh giá 1 lần." });
      }

      // So sánh để xác định có cần kiểm duyệt lại không
      const contentChanged =
        comment?.trim() !== review.comment?.trim() || rating !== review.rating;

      review.rating = rating ?? review.rating;
      review.comment = comment ?? review.comment;

      // Nếu có sửa nội dung -> kiểm duyệt lại bằng AI
      if (contentChanged) {
        const newStatus = await checkCommentWithGemini(comment);
        review.status = newStatus;
        review.reply = undefined;
        review.approvedBy = undefined;
        review.approvedAt = undefined;
      }

      // XÓA ẢNH
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
        review.images = review.images.filter(
          (img) => !removedImages.includes(img.public_id)
        );
      }

      // UPLOAD ẢNH MỚI
      if (req.files && req.files.length > 0) {
        const uploadedImages = await Promise.all(
          req.files.map((file) => {
            return new Promise((resolve, reject) => {
              const stream = cloudinary.uploader.upload_stream(
                { folder: "products" },
                (error, result) => {
                  if (error) reject(error);
                  else
                    resolve({
                      url: result.secure_url,
                      public_id: result.public_id,
                    });
                }
              );
              stream.end(file.buffer);
            });
          })
        );

        review.images.push(...uploadedImages);
      }

      // Chỉ tăng updateCount khi có thay đổi thực sự
      const hasChanges = contentChanged || 
                        (req.files && req.files.length > 0) || 
                        (removedImages && removedImages.length > 0);
                        
      if (hasChanges) {
        review.updatedCount += 1;
      }
      
      await review.save();

      return res
        .status(200)
        .json({ message: "Sửa đánh giá thành công", data: review });
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
    // Kiểm tra quyền (chỉ admin mới được xóa)
    if (req.user.role !== "3") {
      return res
        .status(403)
        .json({ message: "Chỉ admin mới có quyền xóa đánh giá." });
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
export const getAllReviews = async (req, res) => {
  try {
    const { productName = "", customerName = "" } = req.query;

    // populate trước
    let query = Review.find()
      .populate({
        path: "productVariantId",
        populate: {
          path: "productId",
          select: "name",
        },
        select: "images productId",
      })
      .populate({
        path: "userId",
        select: "name email",
      });

    // Thực thi query để lấy dữ liệu đã populate
    const reviews = await query;

    // Lọc bằng JS vì không thể filter sâu trong populate với Mongoose trực tiếp
    const filtered = reviews.filter((review) => {
      const productMatch = review.productVariantId?.productId?.name
        ?.toLowerCase()
        .includes(productName.toLowerCase());

      const customerMatch = review.userId?.name
        ?.toLowerCase()
        .includes(customerName.toLowerCase());

      return productMatch && customerMatch;
    });

    return res.status(200).json({ data: filtered });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const replyReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { comment } = req.body;

    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Không có token" });
    }
    const decoded = jwt.verify(token, process.env.SECRET_KEY);
    // 1. Kiểm tra quyền
    if (String(decoded.role) !== "3") {
      return res.status(403).json({ message: "Không có quyền admin" });
    }

    // 2. Validate dữ liệu
    if (!comment?.trim()) {
      return res.status(400).json({ message: "Phản hồi không được để trống" });
    }

    // 3. Tìm review
    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({ message: "Đánh giá không tồn tại" });
    }

    // 4. Thêm hoặc cập nhật phản hồi
    review.reply = {
      comment,
      createdAt: review.reply?.createdAt || new Date(),
      updatedAt: new Date(),
      repliedBy: decoded.id,
    };

    await review.save();

    return res.status(200).json({ message: "Phản hồi thành công", review });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Lỗi server" });
  }
};
export const updateReplyReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { comment } = req.body;

    if (!comment?.trim()) {
      return res.status(400).json({ message: "Phản hồi không được để trống" });
    }

    const review = await Review.findById(reviewId);
    if (!review || !review.reply) {
      return res.status(404).json({ message: "Phản hồi không tồn tại" });
    }

    // Kiểm tra quyền admin tương tự như trước
    // Nếu bạn dùng middleware checkAuthAdmin thì ko cần decode lại token

    review.reply.comment = comment;
    review.reply.updatedAt = new Date();

    await review.save();

    return res
      .status(200)
      .json({ message: "Cập nhật phản hồi thành công", review });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Lỗi server" });
  }
};

export const deleteReplyReview = async (req, res) => {
  try {
    const { reviewId } = req.params;

    const review = await Review.findById(reviewId);
    if (!review || !review.reply) {
      return res.status(404).json({ message: "Phản hồi không tồn tại" });
    }

    review.reply = undefined; // hoặc null

    await review.save();

    return res.status(200).json({ message: "Xóa phản hồi thành công" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Lỗi server" });
  }
};

export const updateReply = async (req, res) => {
  try {
    const { id: reviewId } = req.params;
    const { comment } = req.body;

    if (!comment || comment.trim().length === 0) {
      return res.status(400).json({ message: "Phản hồi không được để trống." });
    }

    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({ message: "Không tìm thấy đánh giá." });
    }

    const now = new Date();

    // Nếu chưa có phản hồi trước đó
    if (!review.reply) {
      review.reply = {
        comment,
        createdAt: now,
        updatedAt: now,
        repliedBy: req.user._id,
      };
    } else {
      // Đã có phản hồi => cập nhật nội dung + ngày sửa
      review.reply.comment = comment;
      review.reply.updatedAt = now;
      review.reply.repliedBy = req.user._id;
    }

    // Không tăng updatedCount khi admin phản hồi
    // review.updatedCount = (review.updatedCount || 0) + 1;

    await review.save();

    return res.status(200).json({
      message: "Cập nhật phản hồi thành công",
      data: review.reply,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Đã xảy ra lỗi phía máy chủ",
      error: error.message,
    });
  }
};


export const deleteReply = async (req, res) => {
  try {
    const reviewId = req.params.id;

    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({ message: "Không tìm thấy đánh giá" });
    }

    if (!review.reply) {
      return res.status(400).json({ message: "Đánh giá này chưa có phản hồi" });
    }
    if (req.user.role !== "3") {
      return res.status(403).json({ message: "Bạn không có quyền xóa phản hồi" });
    }
    review.reply = undefined;

    await review.save();

    return res.status(200).json({ message: "Xóa phản hồi thành công" });
  } catch (error) {
    return res.status(500).json({
      message: "Lỗi máy chủ",
      error: error.message,
    });
  }
};

export const getReviewById = async (req, res) => {
  try {
    const { id } = req.params; // Lấy ID trực tiếp từ req.params

    // Kiểm tra xem ID có tồn tại không
    if (!id) {
      return res.status(400).json({ message: "Thiếu ID đánh giá" });
    }

    // Tìm đánh giá theo ID
    const review = await Review.findById(id).populate("userId", "name");

    if (!review) {
      return res.status(404).json({ message: "Không tìm thấy đánh giá" });
    }

    return res.status(200).json(review); // Trả về đánh giá duy nhất

  } catch (error) {
    // Xử lý lỗi nếu ID không hợp lệ (ví dụ: không phải là một ObjectId hợp lệ)
    if (error.name === 'CastError' && error.kind === 'ObjectId') {
      return res.status(400).json({ message: "ID đánh giá không hợp lệ" });
    }
    return res.status(500).json({ message: error.message });
  }
};
export const updateReviewStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Kiểm tra trạng thái hợp lệ
    const validStatuses = ["approved", "pending", "rejected"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Trạng thái không hợp lệ." });
    }

    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({ message: "Không tìm thấy đánh giá." });
    }

    review.status = status;

    if (status === "approved") {
      review.approvedBy = req.user?.id || null;
      review.approvedAt = new Date();
    } else {
      review.approvedBy = null;
      review.approvedAt = null;
    }

    await review.save();

    return res
      .status(200)
      .json({ message: "Cập nhật trạng thái thành công", data: review });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};


export const getReviewSuggestion = async (req, res) => {
  try {
    const { orderId, itemIndex = 0 } = req.query;

    // 1️⃣ Validate orderId
    if (!orderId) {
      return res.status(400).json({ message: "Thiếu orderId" });
    }
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ message: "orderId không hợp lệ" });
    }

    // 2️⃣ Lấy order + populate variant
    const order = await Order.findById(orderId).populate(
      "items.productVariantId"
    );
    if (!order) {
      return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
    }

    // 3️⃣ Lấy item theo index
    const orderItem = order.items[itemIndex];
    if (!orderItem) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy sản phẩm trong đơn" });
    }

    // 4️⃣ Lấy variant (đã populate)
    const variant = orderItem.productVariantId;
    if (!variant) {
      return res.status(404).json({ message: "Không tìm thấy productVariant" });
    }

    // 5️⃣ Lấy thông tin sản phẩm
    const productName = variant.product?.name || variant.name || "Sản phẩm";
    const color = orderItem.color || variant.color || "";
    const size = orderItem.size || variant.size || "";

    // 6️⃣ Tạo prompt
    const prompt = reviewSuggestionPrompt(productName, color, size);

    // 7️⃣ Gọi Gemini API
    const aiResponse = await axios.post(
      "https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent",
      {
        contents: [{ parts: [{ text: prompt }] }],
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },
      }
    );

    const suggestion =
      aiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    res.json({ suggestion });
  } catch (error) {
    console.error("Gemini AI Error:", error.response?.data || error.message);
    res.status(500).json({ message: "Lỗi server khi tạo gợi ý đánh giá" });
  }
};