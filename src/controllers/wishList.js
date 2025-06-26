import WishList from "../models/wishList.js";
import ProductVariant from "../models/productVariant.js";

// Thêm sản phẩm vào danh sách yêu thích
export const addToWishlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const { productVariantId } = req.params; // Lấy productVariantId từ params

    // Kiểm tra sản phẩm có tồn tại không
    const product = await ProductVariant.findById(productVariantId);
    if (!product) {
      return res.status(404).json({ message: "Sản phẩm không tồn tại" });
    }

    // Tìm hoặc tạo wishlist cho người dùng
    let wishlist = await WishList.findOne({ user: userId });
    if (!wishlist) {
      wishlist = await WishList.create({ user: userId, products: [] });
    }

    // Kiểm tra sản phẩm đã có trong wishlist chưa
    if (wishlist.products.includes(productVariantId)) {
      return res
        .status(400)
        .json({ message: "Sản phẩm đã có trong danh sách yêu thích" });
    }

    // Thêm sản phẩm vào wishlist
    wishlist.products.push(productVariantId);
    await wishlist.save();

    return res
      .status(200)
      .json({ message: "Đã thêm sản phẩm vào danh sách yêu thích", wishlist });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Xóa sản phẩm khỏi danh sách yêu thích
export const removeFromWishlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const { productVariantId } = req.params; // Lấy productVariantId từ params

    // Tìm wishlist của người dùng
    const wishlist = await WishList.findOne({ user: userId });
    if (!wishlist) {
      return res
        .status(404)
        .json({ message: "Danh sách yêu thích không tồn tại" });
    }

    // Kiểm tra sản phẩm có trong wishlist không
    if (!wishlist.products.includes(productVariantId)) {
      return res
        .status(400)
        .json({ message: "Sản phẩm không có trong danh sách yêu thích" });
    }

    // Xóa sản phẩm khỏi wishlist
    wishlist.products = wishlist.products.filter(
      (id) => id.toString() !== productVariantId
    );
    await wishlist.save();

    return res
      .status(200)
      .json({ message: "Đã xóa sản phẩm khỏi danh sách yêu thích", wishlist });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getWishlist = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    const wishlist = await WishList.findOne({ user: req.user.id }).populate({
      path: "products",
      model: "ProductVariant",
      populate: {
        path: "productId",
        model: "Product",
      },
    });

    if (!wishlist) {
      return res
        .status(200)
        .json({ data: [], total: 0, currentPage: page, totalPages: 0 });
    }

    const total = wishlist.products.length;
    const totalPages = Math.ceil(total / limit);
    const paginatedProducts = wishlist.products.slice(skip, skip + limit);

    return res.status(200).json({
      data: paginatedProducts,
      total,
      currentPage: page,
      totalPages,
    });
  } catch (error) {
    console.error("Không thể lấy danh sách yêu thích:", error);
    return res.sendStatus(500);
  }
};
