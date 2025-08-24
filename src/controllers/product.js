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

    const productsPaginated = await Product.paginate(query, options);

    const productsWithDetails = await Promise.all(
      productsPaginated.docs.map(async (product) => {
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

        // Lấy danh sách màu (mỗi màu tương ứng một variant)
        const variants = await ProductVariant.find({
          productId: product._id,
        })
          .select("color._id color.actualColor")
          .lean();

        const colorMap = new Map();
        for (const variant of variants) {
          const colorId = variant._id;
          const actualColor = variant.color?.actualColor;
          if (actualColor && !colorMap.has(actualColor)) {
            colorMap.set(actualColor, { _id: colorId, actualColor });
          }
        }

        return {
          ...product,
          representativeVariantId: representativeVariant,
          variantCount,
          availableColors: Array.from(colorMap.values()), // [{ _id, actualColor }]
        };
      })
    );

    return res.status(200).json({
      data: productsWithDetails,
      total: productsPaginated.totalDocs,
      currentPage: productsPaginated.page,
      totalPages: productsPaginated.totalPages,
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
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }

    // Kiểm tra xem có variant nào liên quan không
    const variantCount = await ProductVariant.countDocuments({ productId: id });
    
    if (variantCount > 0) {
      const errorResponse = {
        message: `Không thể xóa sản phẩm này vì vẫn còn ${variantCount} biến thể liên quan. Vui lòng xóa tất cả biến thể trước khi xóa sản phẩm.`,
        details: {
          variantCount: variantCount,
          suggestion: "Hãy vào quản lý biến thể để xóa các biến thể trước"
        }
      };
      
      return res.status(400).json(errorResponse);
    }

    const product = await Product.findByIdAndDelete(id);
    
    if (!product) {
      return res.status(404).json({ message: "Sản phẩm không tồn tại" });
    }

    return res.status(200).json({
      message: "Xóa sản phẩm thành công",
      data: product,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Lỗi server khi xóa sản phẩm",
      error: error.message,
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

    // Kiểm tra từng sản phẩm có variant hay không
    const productChecks = await Promise.all(
      ids.map(async (id) => {
        if (!mongoose.Types.ObjectId.isValid(id)) {
          return { id, hasVariants: false, error: "ID không hợp lệ" };
        }
        
        const variantCount = await ProductVariant.countDocuments({ productId: id });
        const product = await Product.findById(id).select('name');
        
        return { 
          id, 
          hasVariants: variantCount > 0, 
          variantCount,
          productName: product?.name || "Không xác định"
        };
      })
    );

    // Tìm những sản phẩm có variant
    const productsWithVariants = productChecks.filter(p => p.hasVariants);
    
    if (productsWithVariants.length > 0) {
      const errorDetails = productsWithVariants.map(p => 
        `• ${p.productName} (${p.variantCount} biến thể)`
      ).join('\n');
      
      return res.status(400).json({
        message: `Không thể xóa ${productsWithVariants.length} sản phẩm vì vẫn còn biến thể liên quan:`,
        details: errorDetails,
        suggestion: "Vui lòng xóa tất cả biến thể trước khi xóa sản phẩm"
      });
    }

    // Chỉ xóa những sản phẩm không có variant
    const validIds = productChecks
      .filter(p => !p.hasVariants && !p.error)
      .map(p => p.id);

    if (validIds.length === 0) {
      return res.status(400).json({
        message: "Không có sản phẩm nào có thể xóa"
      });
    }

    const result = await Product.deleteMany({ _id: { $in: validIds } });

    return res.status(200).json({
      message: `Xóa thành công ${result.deletedCount} sản phẩm`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Lỗi server khi xóa sản phẩm hàng loạt",
      error: error.message,
    });
  }
};
