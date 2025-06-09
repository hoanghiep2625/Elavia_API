import Cart from "../models/cart.js";
import mongoose from "mongoose";

export const addToCart = async (req, res) => {
  try {
    const { userId, productVariantId, size, quantity } = req.body;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "UserId không hợp lệ" });
    }
    const userObjectId = new mongoose.Types.ObjectId(userId);
    let cart = await Cart.findOne({ userId: userObjectId });

    if (!cart) {
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
        cart.items[itemIndex].quantity += quantity;
      } else {
        cart.items.push({ productVariantId, size, quantity });
      }
    }

    await cart.save();
    return res.status(200).json(cart);
  } catch (error) {
    return res.status(500).json({ message: error.message });
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
