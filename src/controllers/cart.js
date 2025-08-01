import Cart from "../models/cart.js";
import ProductVariant from "../models/productVariant.js";
import mongoose from "mongoose";

export const addToCart = async (req, res) => {
  try {
    const { userId, productVariantId, size, quantity } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "UserId không hợp lệ" });
    }

    if (!mongoose.Types.ObjectId.isValid(productVariantId)) {
      return res.status(400).json({ message: "ProductVariantId không hợp lệ" });
    }

    if (quantity < 1) {
      return res.status(400).json({ message: "Số lượng phải lớn hơn 0" });
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const productVariant = await ProductVariant.findById(productVariantId);
    if (!productVariant) {
      return res
        .status(404)
        .json({ message: "Biến thể sản phẩm không tồn tại" });
    }

    const sizeInfo = productVariant.sizes.find((s) => s.size === size);
    if (!sizeInfo) {
      return res.status(400).json({ message: "Kích cỡ không hợp lệ" });
    }

    let cart = await Cart.findOne({ userId: userObjectId });

    if (!cart) {
      // Nếu số lượng thêm vượt quá tồn kho thì từ chối
      if (quantity > sizeInfo.stock) {
        return res
          .status(400)
          .json({ message: `Tồn kho chỉ còn ${sizeInfo.stock}` });
      }
      // Tạo giỏ hàng mới
      cart = new Cart({
        userId: userObjectId,
        items: [{ productVariantId, size, quantity }],
      });
    } else {
      const itemIndex = cart.items.findIndex(
        (item) =>
          item.productVariantId.toString() === productVariantId &&
          item.size === size
      );

      if (itemIndex > -1) {
        const currentQty = cart.items[itemIndex].quantity;
        const newQty = currentQty + quantity;

        if (newQty > sizeInfo.stock) {
          return res.status(400).json({
            message: `Tổng số lượng trong giỏ hàng vượt quá tồn kho ${sizeInfo.stock}`,
          });
        }

        cart.items[itemIndex].quantity = newQty;
      } else {
        if (quantity > sizeInfo.stock) {
          return res
            .status(400)
            .json({ message: `Tồn kho chỉ còn ${sizeInfo.stock}` });
        }
        cart.items.push({ productVariantId, size, quantity });
      }
    }

    await cart.save();
    return res.status(200).json(cart);
  } catch (error) {
    console.error("Lỗi khi thêm vào giỏ hàng:", error);
    return res.status(500).json({ message: "Lỗi server" });
  }
};

export const removeFromCart = async (req, res) => {
  try {
    const { userId, productVariantId, size } = req.body;

    let cart = await Cart.findOne({ userId });

    if (!cart) {
      return res.status(404).json({ message: "Giỏ hàng không tồn tại" });
    }

    cart.items = cart.items.filter(
      (item) =>
        !(
          item.productVariantId.toString() === productVariantId &&
          item.size === size
        )
    );

    await cart.save();
    return res.status(200).json(cart);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

export const updateCartQuantity = async (req, res) => {
  try {
    const { productVariantId, size, quantity } = req.body;
    const userId = req.user.id;

    let cart = await Cart.findOne({ userId });

    if (!cart) {
      return res.status(404).json({ message: "Giỏ hàng không tồn tại" });
    }

    const item = cart.items.find(
      (item) =>
        item.productVariantId.toString() === productVariantId &&
        item.size === size
    );

    if (!item) {
      return res
        .status(404)
        .json({ message: "Sản phẩm không có trong giỏ hàng" });
    }

    item.quantity = quantity; // Cập nhật số lượng

    await cart.save();
    return res.status(200).json(cart);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

export const getCart = async (req, res) => {
  try {
    const userId = req.user.id;

    const cart = await Cart.findOne({ userId }).populate({
      path: "items.productVariantId",
      model: "ProductVariant",
      populate: {
        path: "productId", // Populate Product trong ProductVariant
        model: "Product", // Model của Product
      },
    });

    if (!cart) {
      return res.status(404).json({ message: "Giỏ hàng trống" });
    }

    return res.status(200).json(cart);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

export const clearCart = async (req, res) => {
  try {
    const userId = req.user.id;

    let cart = await Cart.findOne({ userId });

    if (!cart) {
      return res.status(404).json({ message: "Giỏ hàng không tồn tại" });
    }
    cart.items = [];
    await cart.save();
    return res.status(200).json({ message: "Giỏ hàng đã được làm trống" });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};
export const getCartQuantity = async (req, res) => {
  try {
    const userId = req.user.id;

    const cart = await Cart.findOne({ userId });

    if (!cart) {
      return res.json({ totalQuantity: 0 });
    }

    const totalQuantity = cart.items.reduce(
      (sum, item) => sum + item.quantity,
      0
    );

    res.json({ totalQuantity });
  } catch (error) {
    console.error("Lỗi khi lấy số lượng giỏ hàng:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
};
export const updateCart = async (req, res) => {
  try {
    const { productVariantId, size, quantity } = req.body;
    const userId = req.user.id;

    if (!productVariantId || !size || !quantity || quantity < 1) {
      return res.status(400).json({ message: "Dữ liệu đầu vào không hợp lệ" });
    }

    const cart = await Cart.findOne({ userId }).populate(
      "items.productVariantId"
    );
    if (!cart) {
      return res.status(404).json({ message: "Giỏ hàng không tồn tại" });
    }

    const item = cart.items.find(
      (i) =>
        i.productVariantId._id.toString() === productVariantId.toString() &&
        i.size === size
    );

    if (!item) {
      return res
        .status(404)
        .json({ message: "Sản phẩm không có trong giỏ hàng" });
    }

    const productVariant = await ProductVariant.findById(productVariantId);
    if (!productVariant) {
      return res
        .status(404)
        .json({ message: "Biến thể sản phẩm không tồn tại" });
    }

    const sizeInfo = productVariant.sizes.find((s) => s.size === size);
    if (!sizeInfo) {
      return res.status(400).json({ message: "Kích cỡ không hợp lệ" });
    }

    if (quantity > item.quantity) {
      const maxAvailable = sizeInfo.stock;
      const quantityInCart = item.quantity;

      const addedQuantity = quantity - quantityInCart;
      const remainingStock = maxAvailable - quantityInCart;

      if (quantity > maxAvailable) {
        return res.status(400).json({
          message: `Số lượng vượt quá tồn kho. Chỉ còn ${
            remainingStock > 0 ? remainingStock : 0
          } sản phẩm khả dụng.`,
        });
      }
    }

    // ✅ Cập nhật số lượng
    item.quantity = quantity;
    await cart.save();

    const updatedCart = await Cart.findOne({ userId }).populate(
      "items.productVariantId"
    );

    return res.json({ success: true, data: updatedCart });
  } catch (error) {
    console.error("Lỗi khi cập nhật giỏ hàng:", error);
    return res.status(500).json({ message: "Lỗi server" });
  }
};
