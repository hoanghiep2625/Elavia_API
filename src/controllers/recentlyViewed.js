import mongoose from "mongoose";
import RecentlyViewed from "../models/recentlyViewed.js";
import ProductVariant from "../models/productVariant.js";

export const addRecentlyViewedProduct = async (req, res) => {
  try {
    const userId = req.user.id;
    const productVariantId = req.params.productVariantId;
    const productObjectId = new mongoose.Types.ObjectId(productVariantId);
    const product = await ProductVariant.findById(productVariantId);
    if (!product) {
      return res.status(404).json({ message: "Sản phẩm không tồn tại" });
    }
    // Tìm bản ghi
    let recentlyViewed = await RecentlyViewed.findOne({ user: userId });

    if (!recentlyViewed) {
      // Nếu chưa có thì tạo mới
      recentlyViewed = new RecentlyViewed({
        user: userId,
        products: [productObjectId],
      });
    } else {
      // Nếu đã có thì cập nhật: xóa trùng và thêm mới lên đầu
      recentlyViewed.products = recentlyViewed.products.filter(
        (id) => !id.equals(productObjectId)
      );
      recentlyViewed.products.unshift(productObjectId);
    }

    await recentlyViewed.save();

    return res.sendStatus(204);
  } catch (error) {
    console.error("Không thể cập nhật danh sách đã xem:", error);
    return res.sendStatus(500);
  }
};
