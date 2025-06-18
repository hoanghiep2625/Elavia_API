import { z } from "zod";
import mongoose from "mongoose";
import Product from "../models/product.js";
import ProductVariant from "../models/productVariant.js";

const productSchema = z.object({
  name: z.string().min(2, "Tên sản phẩm cần tối thiểu 2 ký tự"),
  sku: z.string(),
  categoryId: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
    message: "categoryId phải là ObjectId hợp lệ",
  }),
  shortDescription: z.string().optional(),
  description: z.string().optional(),
});

// Tạo sản phẩm mới
export const createProduct = async (req, res) => {
  try {
    const result = productSchema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.errors.map((err) => err.message);
      return res.status(400).json({ errors });
    }

    const product = await Product.create(result.data);
    return res.status(201).json(product);
  } catch (error) {
    return res.status(400).json({
      message: error.message,
    });
  }
};

// Lấy danh sách sản phẩm
export const getProducts = async (req, res) => {
  try {
    const {
      _limit = 10,
      _page = 1,
      _sort = "createdAt",
      _order = "asc",
      categoryId,
      _name,
      _sku,
    } = req.query;

    const options = {
      page: parseInt(_page),
      limit: parseInt(_limit),
      sort: { [_sort]: _order === "desc" ? -1 : 1 },
      populate: "categoryId",
      lean: true
    };

    const query = {};
    if (categoryId) query.categoryId = categoryId;
    if (_name) query.name = { $regex: _name, $options: "i" };
    if (_sku) query.sku = { $regex: _sku, $options: "i" };

    const products = await Product.paginate(query, options);

    // Đếm số lượng biến thể cho mỗi sản phẩm
    const productsWithVariantCount = await Promise.all(
      products.docs.map(async (product) => {
        const variantCount = await ProductVariant.countDocuments({
          productId: product._id
        });
        return {
          ...product,
          variantCount
        };
      })
    );

    return res.status(200).json({
      data: productsWithVariantCount,
      total: products.totalDocs,
      currentPage: products.page,
      totalPages: products.totalPages,
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message,
    });
  }
};

// Lấy chi tiết sản phẩm
export const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate(
      "categoryId"
    );
    if (!product) {
      return res.status(404).json({ message: "Sản phẩm không tồn tại" });
    }
    return res.status(200).json(product);
  } catch (error) {
    return res.status(400).json({
      message: error.message,
    });
  }
};

// Cập nhật sản phẩm
export const updateProduct = async (req, res) => {
  try {
    const result = productSchema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.errors.map((err) => err.message);
      return res.status(400).json({ errors });
    }
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      result.data,
      { new: true }
    );
    if (!product) {
      return res.status(404).json({ message: "Sản phẩm không tồn tại" });
    }
    return res.status(200).json({
      message: "Cập nhật sản phẩm thành công",
      data: product,
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message,
    });
  }
};

// Xóa sản phẩm
export const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Sản phẩm không tồn tại" });
    }
    // Xóa tất cả các biến thể của sản phẩm
    await ProductVariant.deleteMany({ productId: req.params.id });
    return res.status(200).json({
      message: "Xóa sản phẩm thành công",
      data: product,
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message,
    });
  }
};
