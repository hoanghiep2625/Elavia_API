import mongoose from "mongoose";
import Product from "../models/product.js";
import ProductVariant from "../models/productVariant.js";
import {
  productSchema,
  patchProductSchema,
} from "../schemaValidations/product.schema.js";

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
      _name = "",
      _sku = "",
      _status,
    } = req.query;

    const options = {
      page: parseInt(_page),
      limit: parseInt(_limit),
      sort: { [_sort]: _order === "desc" ? -1 : 1 },
      populate: [{ path: "categoryId" }, { path: "representativeVariantId" }],
      lean: true,
    };

    const query = {};
    if (categoryId) query.categoryId = categoryId;
    if (_name) query.name = { $regex: _name, $options: "i" };
    if (_sku) query.sku = { $regex: _sku, $options: "i" };
    if (_status !== undefined) {
      if (_status === "true" || _status === true) query.status = true;
      else if (_status === "false" || _status === false) query.status = false;
    }

    const products = await Product.paginate(query, options);

    // Đếm số lượng biến thể cho mỗi sản phẩm
    const productsWithVariantCount = await Promise.all(
      products.docs.map(async (product) => {
        let representativeVariant = product.representativeVariantId;

        if (!representativeVariant) {
          representativeVariant = await ProductVariant.findOne({
            productId: product._id,
          })
            .sort({ createdAt: 1 })
            .lean();
        }

        const variantCount = await ProductVariant.countDocuments({
          productId: product._id,
        });

        return {
          ...product,
          representativeVariantId: representativeVariant,
          variantCount,
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
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }

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
    const result = patchProductSchema.safeParse(req.body);
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
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }

    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Sản phẩm không tồn tại" });
    }
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

// Xóa nhiều sản phẩm
export const deleteProductBulkDelete = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res
        .status(400)
        .json({ message: "Vui lòng cung cấp mảng ids sản phẩm cần xóa" });
    }

    const result = await Product.deleteMany({ _id: { $in: ids } });
    await ProductVariant.deleteMany({ productId: { $in: ids } });

    return res.status(200).json({
      message: "Xóa sản phẩm hàng loạt thành công",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message,
    });
  }
};
