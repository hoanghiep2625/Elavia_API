import mongoose from "mongoose";
import ProductVariant from "../models/productVariant.js";
import upload from "../middlewares/multer.js";
import cloudinary from "../config/cloudinary.js";
import { parseFormData } from "../utils/parseFormData.js";
import RecentlyViewed from "../models/recentlyViewed.js";
import ProductVariantSnapshot from "../models/productVariantSnapshot.js";
import Order from "../models/order.js";
import {
  productVariantSchema,
  patchProductVariantSchema,
} from "../schemaValidations/variant.schema.js";
import Product from "../models/product.js";
import Category from "../models/categories.js";
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

// Tạo biến thể sản phẩm
export const createProductVariant = async (req, res) => {
  upload.fields([
    { name: "mainImage", maxCount: 1 },
    { name: "hoverImage", maxCount: 1 },
    { name: "productImages", maxCount: 10 },
  ])(req, res, async (err) => {
    if (err) return res.status(400).json({ message: err.message });

    try {
      let formData = parseFormData(req.body);

      // Parse sizes từ JSON string
      if (typeof formData.sizes === "string") {
        try {
          formData.sizes = JSON.parse(formData.sizes);
        } catch {
          return res.status(400).json({ message: "Sizes không hợp lệ" });
        }
      }

      // Validate
      const result = productVariantSchema.safeParse(formData);
      if (!result.success) {
        const errors = result.error.errors.map((err) => err.message);
        return res.status(400).json({ errors });
      }

      // Upload ảnh
      const mainImage = req.files["mainImage"]
        ? await uploadImageToCloudinary(req.files["mainImage"][0])
        : null;
      const hoverImage = req.files["hoverImage"]
        ? await uploadImageToCloudinary(req.files["hoverImage"][0])
        : null;
      const productImages = req.files["productImages"]
        ? await Promise.all(
            req.files["productImages"].map(uploadImageToCloudinary)
          )
        : [];

      if (!mainImage || !hoverImage) {
        return res.status(400).json({
          message: "Phải cung cấp ảnh chính và ảnh hover",
        });
      }

      // Dữ liệu variant
      const variantData = {
        ...result.data,
        images: {
          main: mainImage,
          hover: hoverImage,
          product: productImages,
        },
      };

      // 1️⃣ Tạo ProductVariant
      const variant = await ProductVariant.create(variantData);

      // 2️⃣ Lấy thông tin sản phẩm gốc
      const product = await Product.findById(variant.productId);

      // 3️⃣ Tạo snapshot version 1
      const { embedding, ...snapshotData } = variant.toObject();
      await ProductVariantSnapshot.create({
        ...snapshotData,
        variantId: variant._id,
        version: 1,
        productName: product ? product.name : "",
        product: product ? product.toObject() : {},
      });

      return res.status(201).json(variant);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });
};

// Lấy danh sách biến thể sản phẩm
export const getProductVariants = async (req, res) => {
  try {
    const {
      _limit = 10,
      _page = 1,
      _sort = "price",
      _order = "asc",
      _productId,
      _priceMin,
      _priceMax,
      _baseColor,
      _baseColors,
      _size,
      _stockMin,
      _stockMax,
      _sku = "",
      _name = "",
      _status,
    } = req.query;

    // Tạo query lọc
    const query = {};

    // Lọc theo productId
    if (_productId && mongoose.Types.ObjectId.isValid(_productId)) {
      query.productId = new mongoose.Types.ObjectId(_productId);
    }

    // Lọc theo price (min/max)
    if (_priceMin || _priceMax) {
      query.price = {};
      if (_priceMin) query.price.$gte = parseFloat(_priceMin);
      if (_priceMax) query.price.$lte = parseFloat(_priceMax);
    }

    // Lọc theo màu sắc
    if (_baseColor) {
      query["color.baseColor"] = _baseColor;
    }
    if (_baseColors) {
      const colorsArr = Array.isArray(_baseColors)
        ? _baseColors
        : _baseColors.split(",");
      query["color.baseColor"] = { $in: colorsArr };
    }

    // Lọc theo size và stock
    if (_size || _stockMin || _stockMax) {
      query.sizes = { $elemMatch: {} };
      if (_size) query.sizes.$elemMatch.size = _size;
      if (_stockMin || _stockMax) {
        query.sizes.$elemMatch.stock = {};
        if (_stockMin) query.sizes.$elemMatch.stock.$gte = parseInt(_stockMin);
        if (_stockMax) query.sizes.$elemMatch.stock.$lte = parseInt(_stockMax);
      }
    }

    // Lọc theo sku
    if (_sku) {
      query.sku = { $regex: _sku, $options: "i" };
    }

    // Lọc theo status
    if (_status !== undefined) {
      if (_status === "true" || _status === true) query.status = true;
      else if (_status === "false" || _status === false) query.status = false;
    }

    // Cấu hình phân trang và sắp xếp
    const options = {
      page: parseInt(_page),
      limit: parseInt(_limit),
      sort: { [_sort]: _order === "desc" ? -1 : 1 },
      populate: {
        path: "productId",
        match: _name ? { name: { $regex: _name, $options: "i" } } : undefined,
      },
    };

    // Lấy dữ liệu phân trang và lọc
    let result = await ProductVariant.paginate(query, options);

    // Nếu tìm kiếm theo _name, loại bỏ các docs không có productId
    if (_name) {
      result.docs = result.docs.filter((doc) => doc.productId);
      result.totalDocs = result.docs.length;
      result.totalPages = Math.ceil(result.totalDocs / options.limit) || 1;
    }

    return res.status(200).json({
      data: result.docs,
      totalPages: result.totalPages,
      currentPage: result.page,
      total: result.totalDocs,
    });
  } catch (error) {
    console.error("Lỗi khi lấy sản phẩm:", error);
    return res.status(500).json({ message: error.message });
  }
};

// Lấy chi tiết biến thể sản phẩm
export const getProductVariantById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid variant ID" });
    }

    const variant = await ProductVariant.findById(req.params.id).populate(
      "productId"
    );
    if (!variant) {
      return res
        .status(404)
        .json({ message: "Biến thể sản phẩm không tồn tại" });
    }
    return res.status(200).json(variant);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// Cập nhật biến thể sản phẩm
export const updateProductVariant = async (req, res) => {
  upload.fields([
    { name: "images[main]", maxCount: 1 },
    { name: "images[hover]", maxCount: 1 },
    { name: "images[product]", maxCount: 10 },
  ])(req, res, async (err) => {
    if (err) return res.status(400).json({ message: err.message });

    try {
      let formData = parseFormData(req.body);

      // Parse deletedImages
      formData.deletedImages = req.body["deletedImages[]"]
        ? Array.isArray(req.body["deletedImages[]"])
          ? req.body["deletedImages[]"]
          : [req.body["deletedImages[]"]]
        : [];

      // Parse sizes nếu frontend gửi dạng JSON string
      if (typeof formData.sizes === "string") {
        try {
          formData.sizes = JSON.parse(formData.sizes);
        } catch {
          return res.status(400).json({ message: "Sizes không hợp lệ" });
        }
      }

      const result = patchProductVariantSchema.safeParse(formData);
      if (!result.success) {
        const errors = result.error.errors.map((err) => ({
          path: err.path.join("."),
          message: err.message,
        }));
        return res.status(400).json({ errors });
      }

      const { deletedImages, ...variantData } = result.data;

      const existingVariant = await ProductVariant.findById(req.params.id);
      if (!existingVariant) {
        return res
          .status(404)
          .json({ message: "Biến thể sản phẩm không tồn tại" });
      }

      // Xóa ảnh trên Cloudinary
      if (Array.isArray(deletedImages) && deletedImages.length > 0) {
        await Promise.all(
          deletedImages.map(async (publicId) => {
            try {
              await cloudinary.uploader.destroy(publicId);
            } catch (error) {
              console.error(`Failed to delete image ${publicId}:`, error);
            }
          })
        );

        if (existingVariant.images) {
          if (
            existingVariant.images.main?.public_id &&
            deletedImages.includes(existingVariant.images.main.public_id)
          ) {
            existingVariant.images.main = null;
          }
          if (
            existingVariant.images.hover?.public_id &&
            deletedImages.includes(existingVariant.images.hover.public_id)
          ) {
            existingVariant.images.hover = null;
          }
          if (existingVariant.images.product) {
            existingVariant.images.product =
              existingVariant.images.product.filter(
                (img) => !deletedImages.includes(img.public_id)
              );
          }
        }
        variantData.images = existingVariant.images;
      }

      // Upload ảnh mới
      variantData.images = existingVariant.images || {};
      if (req.files) {
        if (req.files["images[main]"]) {
          if (
            existingVariant.images?.main?.public_id &&
            !deletedImages.includes(existingVariant.images.main.public_id)
          ) {
            await cloudinary.uploader.destroy(
              existingVariant.images.main.public_id
            );
          }
          variantData.images.main = await uploadImageToCloudinary(
            req.files["images[main]"][0]
          );
        }

        if (req.files["images[hover]"]) {
          if (
            existingVariant.images?.hover?.public_id &&
            !deletedImages.includes(existingVariant.images.hover.public_id)
          ) {
            await cloudinary.uploader.destroy(
              existingVariant.images.hover.public_id
            );
          }
          variantData.images.hover = await uploadImageToCloudinary(
            req.files["images[hover]"][0]
          );
        }

        if (req.files["images[product]"]) {
          variantData.images.product = existingVariant.images.product
            ? existingVariant.images.product.filter(
                (img) => !deletedImages.includes(img.public_id)
              )
            : [];
          const newImages = await Promise.all(
            req.files["images[product]"].map(uploadImageToCloudinary)
          );
          variantData.images.product = [
            ...variantData.images.product,
            ...newImages,
          ];
        }
      }

      // Chỉ update field nào có giá trị
      const updateFields = {};
      for (const key in variantData) {
        if (variantData[key] !== undefined) {
          updateFields[key] = variantData[key];
        }
      }

      const updatedVariant = await ProductVariant.findByIdAndUpdate(
        req.params.id,
        {
          $set: updateFields,
          $inc: { version: 1 },
        },
        { new: true }
      );

      if (!updatedVariant) {
        return res
          .status(404)
          .json({ message: "Biến thể sản phẩm không tồn tại" });
      }

      // 1️⃣ Lấy version mới nhất của snapshot cũ
      const lastSnapshot = await ProductVariantSnapshot.findOne({
        variantId: updatedVariant._id,
      }).sort({ version: -1 });

      const nextVersion = lastSnapshot ? lastSnapshot.version + 1 : 1;

      // 2️⃣ Lấy thông tin sản phẩm gốc
      const product = await Product.findById(updatedVariant.productId);

      // 3️⃣ Tạo snapshot mới
      const { embedding, _id, ...snapshotData } = updatedVariant.toObject();
      await ProductVariantSnapshot.create({
        ...snapshotData,
        variantId: updatedVariant._id,
        version: nextVersion,
        productName: product ? product.name : "",
        product: product ? product.toObject() : {},
      });

      return res.status(200).json({
        message: "Cập nhật biến thể sản phẩm thành công",
        data: updatedVariant,
      });
    } catch (error) {
      console.error("Error updating variant:", error);
      return res.status(400).json({ message: error.message });
    }
  });
};

// Xóa biến thể sản phẩm
export const deleteProductVariant = async (req, res) => {
  try {
    const variant = req.params.id;
    if (!variant) {
      return res
        .status(404)
        .json({ message: "Biến thể sản phẩm không tồn tại" });
    }
    await ProductVariant.findByIdAndDelete(req.params.id);

    return res.status(200).json({
      message: "Xóa biến thể sản phẩm thành công",
      data: variant,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// Lấy danh sách sản phẩm đã xem gần đây
export const getRecentlyViewedProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    const viewed = await RecentlyViewed.findOne({ user: req.user.id }).populate(
      {
        path: "products",
        model: "ProductVariant",
        populate: {
          path: "productId",
          model: "Product",
        },
      }
    );

    if (!viewed) {
      return res
        .status(200)
        .json({ data: [], total: 0, currentPage: page, totalPages: 0 });
    }

    const total = viewed.products.length;
    const totalPages = Math.ceil(total / limit);
    const paginatedProducts = viewed.products.slice(skip, skip + limit);

    return res.status(200).json({
      data: paginatedProducts,
      total,
      currentPage: page,
      totalPages,
    });
  } catch (error) {
    console.error("Không thể lấy danh sách đã xem:", error);
    return res.sendStatus(500);
  }
};

// Lấy danh sách màu sắc theo variant ID
export const getColorsByProductVariantId = async (req, res) => {
  try {
    const variant = await ProductVariant.findById(req.params.id)
      .select("productId")
      .lean();

    if (!variant) {
      return res.status(404).json({ message: "ProductVariant not found" });
    }

    const variants = await ProductVariant.find({ productId: variant.productId })
      .select("color.actualColor")
      .lean();

    const colors = variants.map((v) => ({
      _id: v._id,
      actualColor: v.color.actualColor,
    }));

    return res.status(200).json(colors);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Lấy danh sách màu sắc theo productId
export const getColorsByProductId = async (req, res) => {
  try {
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ message: "productId is required" });
    }

    const variants = await ProductVariant.find({ productId })
      .select("color.actualColor")
      .lean();

    const colors = variants.map((v) => ({
      _id: v._id,
      actualColor: v.color.actualColor,
    }));

    return res.status(200).json(colors);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Lấy danh sách biến thể theo productId
export const getProductVariantsByProductId = async (req, res) => {
  try {
    const { productId } = req.params;

    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ message: "productId không hợp lệ" });
    }

    const variants = await ProductVariant.find({ productId }).populate(
      "productId"
    );

    return res.status(200).json({
      data: variants,
      total: variants.length,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Xóa nhiều biến thể sản phẩm
export const deleteProductVariantBulkDelete = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res
        .status(400)
        .json({ message: "Danh sách id cần xóa không hợp lệ" });
    }

    const variants = await ProductVariant.find({ _id: { $in: ids } });

    for (const variant of variants) {
      const images = variant.images;
      if (images?.main?.public_id)
        await cloudinary.uploader.destroy(images.main.public_id);
      if (images?.hover?.public_id)
        await cloudinary.uploader.destroy(images.hover.public_id);
      if (images?.product?.length) {
        for (const img of images.product) {
          if (img.public_id) await cloudinary.uploader.destroy(img.public_id);
        }
      }
    }

    const result = await ProductVariant.deleteMany({ _id: { $in: ids } });

    return res.status(200).json({
      message: "Xóa các biến thể sản phẩm thành công",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

export const getRelatedVariantsByVariant = async (req, res) => {
  try {
    const { variantId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const variant = await ProductVariant.findById(variantId);
    if (!variant) {
      return res.status(404).json({ message: "Không tìm thấy variant" });
    }

    const product = await Product.findById(variant.productId);
    if (!product) {
      return res.status(404).json({ message: "Không tìm thấy sản phẩm" });
    }

    // Tìm các sản phẩm cùng category nhưng khác sản phẩm hiện tại
    const relatedProducts = await Product.find({
      categoryId: product.categoryId,
      _id: { $ne: product._id },
    });

    const relatedProductIds = relatedProducts.map((p) => p._id);

    // Đếm tổng số variants
    const total = await ProductVariant.countDocuments({
      productId: { $in: relatedProductIds },
      "color.baseColor": variant.color?.baseColor,
    });

    // Lấy các variants liên quan
    const relatedVariants = await ProductVariant.find({
      productId: { $in: relatedProductIds },
      "color.baseColor": variant.color?.baseColor,
    })
      .skip(skip)
      .limit(limit)
      .populate("productId");

    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({
      data: relatedVariants,
      total,
      currentPage: page,
      totalPages,
    });
  } catch (error) {
    console.error("Lỗi khi lấy variant liên quan:", error);
    res.status(500).json({ message: "Lỗi server", error });
  }
};
export const getAllUniqueProductsFromVariants = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    // Lấy danh sách các productId không trùng lặp từ ProductVariant
    const uniqueProductVariants = await ProductVariant.aggregate([
      {
        $group: {
          _id: "$productId", // nhóm theo productId
          variantId: { $first: "$_id" }, // lấy id bất kỳ đại diện cho variant đó
        },
      },
      {
        $skip: skip,
      },
      {
        $limit: limit,
      },
    ]);

    // Lấy danh sách variantId đại diện
    const variantIds = uniqueProductVariants.map((item) => item.variantId);

    // Tìm các variant đại diện và populate productId
    const variants = await ProductVariant.find({
      _id: { $in: variantIds },
    }).populate("productId");

    // Đếm tổng sản phẩm duy nhất
    const totalUniqueProducts = await ProductVariant.distinct("productId");

    const total = totalUniqueProducts.length;
    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({
      data: variants,
      total,
      currentPage: page,
      totalPages,
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách sản phẩm không trùng:", error);
    return res.status(500).json({ message: error.message });
  }
};
export const getAllRepresentativeVariants = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    // Lấy tất cả sản phẩm (có thể thêm filter nếu cần)
    const products = await Product.find()
      .select("_id representativeVariantId")
      .skip(skip)
      .limit(limit)
      .lean();

    // Lấy variant đại diện cho từng sản phẩm
    const variants = await Promise.all(
      products.map(async (product) => {
        let variant;
        if (product.representativeVariantId) {
          variant = await ProductVariant.findById(
            product.representativeVariantId
          )
            .populate("productId")
            .lean();
        } else {
          variant = await ProductVariant.findOne({ productId: product._id })
            .sort({ createdAt: 1 })
            .populate("productId")
            .lean();
        }
        return variant;
      })
    );

    // Loại bỏ sản phẩm không có variant nào
    const filteredVariants = variants.filter(Boolean);

    // Đếm tổng số sản phẩm (cho phân trang)
    const total = await Product.countDocuments();
    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({
      data: filteredVariants,
      totalPages,
      currentPage: page,
      total,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
export const getVariantByColor = async (req, res) => {
  const { productId, actualColor } = req.body;
  if (!productId || !actualColor) {
    return res.status(400).json({ message: "Thiếu thông tin" });
  }

  const variant = await ProductVariant.findOne({
    productId,
    "color.actualColor": actualColor,
  }).populate("productId");

  if (!variant) {
    return res.status(404).json({ message: "Không tìm thấy biến thể" });
  }

  return res.status(200).json({
    ...variant.toObject(),
    productName: variant.productId?.name || "",
  });
};
export const searchProducts = async (req, res) => {
  try {
    const {
      sizes = [],
      color,
      priceRange,
      attributes = {},
      keyword = "",
      page = 1,
      limit = 12,
    } = req.body;

    const query = {
      status: true,
    };

    // Màu sắc
    if (color && typeof color === "string" && color.trim() !== "") {
      query["color.baseColor"] = color;
    }

    // Keyword: tìm theo tên sản phẩm
    if (keyword.trim()) {
      const matchedProducts = await Product.find({
        name: { $regex: keyword.trim(), $options: "i" },
      }).select("_id");
      const productIds = matchedProducts.map((p) => p._id);
      query.productId = { $in: productIds };
    }

    // Lọc theo thuộc tính (attributes)
    if (
      typeof attributes === "object" &&
      Object.keys(attributes).some(
        (k) => Array.isArray(attributes[k]) && attributes[k].length > 0
      )
    ) {
      const attrFilters = Object.entries(attributes)
        .filter(([_, values]) => Array.isArray(values) && values.length > 0)
        .map(([attribute, values]) => ({
          attributes: { $elemMatch: { attribute, value: { $in: values } } },
        }));

      if (attrFilters.length > 0) {
        query.$and = [...(query.$and || []), ...attrFilters];
      }
    }

    // Xử lý Size + Price Range + Stock cùng lúc trong sizes array
    const sizesConditions = [];

    // Điều kiện base: còn hàng
    const baseCondition = { stock: { $gt: 0 } };

    // Nếu có filter theo size cụ thể
    if (Array.isArray(sizes) && sizes.length > 0) {
      baseCondition.size = { $in: sizes };
    }

    // Nếu có filter theo price range
    if (
      Array.isArray(priceRange) &&
      priceRange.length === 2 &&
      typeof priceRange[0] === "number" &&
      typeof priceRange[1] === "number"
    ) {
      baseCondition.price = { $gte: priceRange[0], $lte: priceRange[1] };
    }

    // Áp dụng điều kiện cho sizes array
    query.sizes = { $elemMatch: baseCondition };

    // Query sản phẩm variant
    const variants = await ProductVariant.paginate(query, {
      page,
      limit,
      populate: "productId",
      sort: { createdAt: -1 },
    });

    return res.status(200).json({
      success: true,
      data: variants.docs,
      totalPages: variants.totalPages,
      currentPage: variants.page,
      total: variants.totalDocs,
    });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ success: false, message: "Lỗi tìm kiếm sản phẩm" });
  }
};
export const getProductVariantsByCategory = async (req, res) => {
  try {
    const {
      categoryId,
      sizes = [],
      color,
      priceRange,
      attributes = {},
      page = 1,
      limit = 12,
      sortBy,
    } = req.body;

    if (!categoryId) {
      return res.status(400).json({ message: "categoryId is required" });
    }

    // Lấy thông tin danh mục
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    let categoryIds = [categoryId];
    if (category.level === 2) {
      const subCategories = await Category.find({ parentId: categoryId });
      if (subCategories.length > 0) {
        categoryIds = categoryIds.concat(subCategories.map((c) => c._id));
      }
    }

    // Lấy tất cả product thuộc các category này
    const products = await Product.find({
      categoryId: { $in: categoryIds },
      status: true,
    }).select("_id");
    const productIds = products.map((p) => p._id);

    // Query lọc
    const query = { productId: { $in: productIds }, status: true };

    // Xử lý Size + Price Range + Stock cùng lúc trong sizes array
    const baseCondition = { stock: { $gt: 0 } };

    // Nếu có filter theo size cụ thể
    if (Array.isArray(sizes) && sizes.length > 0) {
      baseCondition.size = { $in: sizes };
    }

    // Nếu có filter theo price range
    if (
      Array.isArray(priceRange) &&
      priceRange.length === 2 &&
      typeof priceRange[0] === "number" &&
      typeof priceRange[1] === "number"
    ) {
      baseCondition.price = { $gte: priceRange[0], $lte: priceRange[1] };
    }

    // Áp dụng điều kiện cho sizes array
    query.sizes = { $elemMatch: baseCondition };

    // Lọc theo màu
    if (color && typeof color === "string" && color.trim() !== "") {
      query["color.baseColor"] = color;
    }

    // Lọc theo thuộc tính (attributes)
    if (
      typeof attributes === "object" &&
      Object.keys(attributes).some(
        (k) => Array.isArray(attributes[k]) && attributes[k].length > 0
      )
    ) {
      const attrFilters = Object.entries(attributes)
        .filter(([_, values]) => Array.isArray(values) && values.length > 0)
        .map(([attribute, values]) => ({
          attributes: { $elemMatch: { attribute, value: { $in: values } } },
        }));

      if (attrFilters.length > 0) {
        query.$and = [...(query.$and || []), ...attrFilters];
      }
    }

    // Xử lý sort động
    let sort = { createdAt: -1 }; // mặc định mới nhất
    // Lưu ý: không thể sort theo price trực tiếp vì price nằm trong sizes array
    // Cần sử dụng aggregation pipeline hoặc sort sau khi query
    if (sortBy === "price-asc") sort = { createdAt: -1 }; // fallback to createdAt
    if (sortBy === "price-desc") sort = { createdAt: -1 }; // fallback to createdAt
    if (sortBy === "newest") sort = { createdAt: -1 };
    if (sortBy === "popular") sort = { createdAt: -1 }; // nếu có field sold trong future
    // Query sản phẩm variant
    const variants = await ProductVariant.paginate(query, {
      page,
      limit,
      populate: "productId",
      sort,
    });

    return res.status(200).json({
      success: true,
      data: variants.docs,
      totalPages: variants.totalPages,
      currentPage: variants.page,
      total: variants.totalDocs,
    });
  } catch (error) {
    console.error("Lỗi khi lấy sản phẩm theo danh mục:", error);
    res
      .status(500)
      .json({ success: false, message: "Lỗi lấy sản phẩm theo danh mục" });
  }
};
const getAllChildCategoryIds = (allCategories, rootId) => {
  const result = [rootId];
  const stack = [rootId];
  while (stack.length) {
    const current = stack.pop();
    const children = allCategories.filter(
      (c) => String(c.parentId) === String(current)
    );
    for (const child of children) {
      result.push(child._id);
      stack.push(child._id);
    }
  }
  return result;
};

// Helper function để tạo query filter cho model ProductVariant mới
const buildProductVariantQuery = (options = {}) => {
  const {
    productIds = [],
    sizes = [],
    color = "",
    priceRange = [],
    attributes = {},
    status = true,
  } = options;

  const query = { status };

  // Lọc theo productIds nếu có
  if (Array.isArray(productIds) && productIds.length > 0) {
    query.productId = { $in: productIds };
  }

  // Xử lý Size + Price Range + Stock cùng lúc trong sizes array
  const baseCondition = { stock: { $gt: 0 } };

  // Nếu có filter theo size cụ thể
  if (Array.isArray(sizes) && sizes.length > 0) {
    baseCondition.size = { $in: sizes };
  }

  // Nếu có filter theo price range
  if (
    Array.isArray(priceRange) &&
    priceRange.length === 2 &&
    typeof priceRange[0] === "number" &&
    typeof priceRange[1] === "number"
  ) {
    baseCondition.price = { $gte: priceRange[0], $lte: priceRange[1] };
  }

  // Áp dụng điều kiện cho sizes array
  query.sizes = { $elemMatch: baseCondition };

  // Lọc theo màu
  if (color && typeof color === "string" && color.trim() !== "") {
    query["color.baseColor"] = color;
  }

  // Lọc theo thuộc tính (attributes)
  if (
    typeof attributes === "object" &&
    Object.keys(attributes).some(
      (k) => Array.isArray(attributes[k]) && attributes[k].length > 0
    )
  ) {
    const attrFilters = Object.entries(attributes)
      .filter(([_, values]) => Array.isArray(values) && values.length > 0)
      .map(([attribute, values]) => ({
        attributes: { $elemMatch: { attribute, value: { $in: values } } },
      }));

    if (attrFilters.length > 0) {
      query.$and = [...(query.$and || []), ...attrFilters];
    }
  }

  return query;
};

// HÀM NÂNG CAO CHO NEW ARRIVAL WOMEN
export const getNewArrivalWomen = async (req, res) => {
  // Hàm lấy mỗi productId 1 variant đại diện (ưu tiên mới nhất)
  const getRepresentativeVariants = (variants) => {
    const seen = new Set();
    const representatives = [];
    for (const variant of variants) {
      const pid = String(variant.productId._id || variant.productId);
      if (!seen.has(pid)) {
        representatives.push(variant);
        seen.add(pid);
      }
    }
    return representatives;
  };

  try {
    const {
      page = 1,
      limit = 12,
      color,
      sizes = [],
      priceRange,
      attributes = {},
      sortBy,
    } = req.query;

    // 1. Lấy danh mục "nữ"
    const womenRoot = await Category.findOne({ name: /nữ/i });
    if (!womenRoot) return res.status(200).json({ data: [] });

    // 2. Lấy tất cả category con của "nữ"
    const allCategories = await Category.find();
    const getAllChildCategoryIds = (allCategories, rootId) => {
      const result = [rootId];
      const stack = [rootId];
      while (stack.length) {
        const current = stack.pop();
        const children = allCategories.filter(
          (c) => String(c.parentId) === String(current)
        );
        for (const child of children) {
          result.push(child._id);
          stack.push(child._id);
        }
      }
      return result;
    };
    const womenCategoryIds = getAllChildCategoryIds(
      allCategories,
      womenRoot._id
    );

    // 3. Lấy productIds thuộc các category này
    const products = await Product.find({
      categoryId: { $in: womenCategoryIds },
      status: true,
    }).select("_id");
    const productIds = products.map((p) => p._id);

    // 4. Parse parameters
    let priceArr = [];
    if (priceRange) {
      if (Array.isArray(priceRange)) {
        priceArr = priceRange.map(Number);
      } else if (typeof priceRange === "string") {
        if (priceRange.includes(",")) {
          priceArr = priceRange.split(",").map(Number);
        } else {
          try {
            priceArr = JSON.parse(priceRange);
          } catch {
            priceArr = [];
          }
        }
      }
    }
    if (
      !(
        Array.isArray(priceArr) &&
        priceArr.length === 2 &&
        typeof priceArr[0] === "number" &&
        typeof priceArr[1] === "number"
      )
    ) {
      priceArr = [0, 10000000];
    }

    let sizesArr = [];
    if (sizes) {
      sizesArr = typeof sizes === "string" ? JSON.parse(sizes) : sizes;
    }

    let attrObj = {};
    if (attributes) {
      try {
        attrObj =
          typeof attributes === "string" ? JSON.parse(attributes) : attributes;
      } catch {
        attrObj = {};
      }
    }

    // 5. Tạo query cho ProductVariant
    const query = buildProductVariantQuery({
      productIds,
      sizes: sizesArr,
      color,
      priceRange: priceArr,
      attributes: attrObj,
    });

    // 9. Xử lý sort
    let sort = { createdAt: -1 };
    if (sortBy && req.query.order) {
      sort = { [sortBy]: req.query.order === "desc" ? -1 : 1 };
    }

    // 10. Lấy variants theo filter
    const allVariants = await ProductVariant.find(query)
      .populate("productId")
      .sort(sort);

    // 11. Mỗi productId 1 variant đại diện
    const representatives = getRepresentativeVariants(allVariants);

    // 12. Phân trang
    const total = representatives.length;
    const totalPages = Math.ceil(total / limit);
    const docs = representatives.slice((page - 1) * limit, page * limit);

    return res.status(200).json({
      data: docs,
      totalPages,
      currentPage: parseInt(page),
      total,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getNewArrivalMen = async (req, res) => {
  // Hàm lấy mỗi productId 1 variant đại diện (ưu tiên mới nhất)
  const getRepresentativeVariants = (variants) => {
    const seen = new Set();
    const representatives = [];
    for (const variant of variants) {
      const pid = String(variant.productId._id || variant.productId);
      if (!seen.has(pid)) {
        representatives.push(variant);
        seen.add(pid);
      }
    }
    return representatives;
  };

  try {
    const {
      page = 1,
      limit = 12,
      color,
      sizes = [],
      priceRange,
      attributes = {},
      sortBy,
    } = req.query;

    const menRoot = await Category.findOne({ name: /nam/i });
    if (!menRoot) return res.status(200).json({ data: [] });

    const allCategories = await Category.find();
    const getAllChildCategoryIds = (allCategories, rootId) => {
      const result = [rootId];
      const stack = [rootId];
      while (stack.length) {
        const current = stack.pop();
        const children = allCategories.filter(
          (c) => String(c.parentId) === String(current)
        );
        for (const child of children) {
          result.push(child._id);
          stack.push(child._id);
        }
      }
      return result;
    };
    const menCategoryIds = getAllChildCategoryIds(allCategories, menRoot._id);

    const products = await Product.find({
      categoryId: { $in: menCategoryIds },
      status: true,
    }).select("_id");
    const productIds = products.map((p) => p._id);

    // Parse parameters
    let priceArr = [];
    if (priceRange) {
      if (Array.isArray(priceRange)) {
        priceArr = priceRange.map(Number);
      } else if (typeof priceRange === "string") {
        // Nếu là chuỗi dạng "0,10000000"
        if (priceRange.includes(",")) {
          priceArr = priceRange.split(",").map(Number);
        } else {
          // Nếu là chuỗi JSON
          try {
            priceArr = JSON.parse(priceRange);
          } catch {
            priceArr = [];
          }
        }
      }
    }
    if (
      !(
        Array.isArray(priceArr) &&
        priceArr.length === 2 &&
        typeof priceArr[0] === "number" &&
        typeof priceArr[1] === "number"
      )
    ) {
      priceArr = [0, 10000000];
    }

    let sizesArr = [];
    if (sizes) {
      sizesArr = typeof sizes === "string" ? JSON.parse(sizes) : sizes;
    }

    let attrObj = {};
    if (attributes) {
      try {
        attrObj =
          typeof attributes === "string" ? JSON.parse(attributes) : attributes;
      } catch {
        attrObj = {};
      }
    }

    // Tạo query với helper function
    const query = buildProductVariantQuery({
      productIds,
      sizes: sizesArr,
      color,
      priceRange: priceArr,
      attributes: attrObj,
    });

    // Xử lý sort động
    let sort = { createdAt: -1 };
    if (req.query.sortBy && req.query.order) {
      sort = { [req.query.sortBy]: req.query.order === "desc" ? -1 : 1 };
    }

    // Lấy tất cả variant thỏa mãn filter, sort
    const allVariants = await ProductVariant.find(query)
      .populate("productId")
      .sort(sort);

    // Lấy mỗi productId 1 variant đại diện
    const representatives = getRepresentativeVariants(allVariants);

    // Phân trang thủ công
    const total = representatives.length;
    const totalPages = Math.ceil(total / limit);
    const docs = representatives.slice((page - 1) * limit, page * limit);

    return res.status(200).json({
      data: docs,
      totalPages,
      currentPage: parseInt(page),
      total,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getbestsellingProductsWomen = async (req, res) => {
  const getRepresentativeVariants = (variants) => {
    const seen = new Set();
    const representatives = [];
    for (const variant of variants) {
      const pid = String(variant.productId._id || variant.productId);
      if (!seen.has(pid)) {
        representatives.push(variant);
        seen.add(pid);
      }
    }
    return representatives;
  };

  const getAllChildCategoryIds = (allCategories, rootId) => {
    const result = [rootId];
    const stack = [rootId];
    while (stack.length) {
      const current = stack.pop();
      const children = allCategories.filter(
        (c) => String(c.parentId) === String(current)
      );
      for (const child of children) {
        result.push(child._id);
        stack.push(child._id);
      }
    }
    return result;
  };

  try {
    const {
      page = 1,
      limit = 12,
      color,
      sizes = [],
      priceRange,
      attributes = {},
      sortBy,
    } = req.query;
    console.log("Query Params:", {
      page,
      limit,
      color,
      sizes,
      priceRange,
      attributes,
    });

    // 1. Tìm category cha "Nữ"
    const womenRoot = await Category.findOne({ name: /nữ/i });
    console.log("Women Root Category:", womenRoot);
    if (!womenRoot) return res.status(200).json({ data: [] });

    // 2. Lấy tất cả category con
    const allCategories = await Category.find();
    const womenCategoryIds = getAllChildCategoryIds(
      allCategories,
      womenRoot._id
    );
    console.log("Women Category IDs:", womenCategoryIds);

    // 3. Kiểm tra sản phẩm trong danh mục "Nữ"
    const products = await Product.find({
      categoryId: { $in: womenCategoryIds },
      status: true,
      // collection: "fall-winter-2024",   dùng nếu cần lọc theo collection trongdb
    }).select("_id");
    console.log("Products in Women Category:", products.length);

    // 4. Lấy danh sách productId từ Order (chỉ lấy đơn hàng thành công)
    const orders = await Order.find({
      $or: [
        { paymentStatus: "Đã thanh toán" },
        { shippingStatus: "Đã nhận hàng" },
      ],
    }).select("items.productVariantId");
    console.log("Orders count:", orders.length);
    const productVariantIds = new Set();
    orders.forEach((order) => {
      order.items.forEach((item) => {
        if (item.productVariantId) {
          productVariantIds.add(String(item.productVariantId));
        }
      });
    });
    console.log("Product Variant IDs:", Array.from(productVariantIds));

    // 5. Lấy variant từ productVariantIds và thuộc category "Nữ"
    const variantsFromOrders = await ProductVariant.find({
      _id: { $in: Array.from(productVariantIds) },
    })
      .populate({
        path: "productId",
        match: { categoryId: { $in: womenCategoryIds } },
      })
      .lean();
    const validVariants = variantsFromOrders.filter(
      (variant) => variant.productId !== null
    );
    console.log("Valid Variants:", validVariants.length);
    console.log("Valid Variants Details:", validVariants);

    if (!validVariants.length) {
      return res.status(200).json({
        data: [],
        totalPages: 0,
        currentPage: parseInt(page),
        total: 0,
      });
    }

    // 6. Parse parameters and create query
    let priceArr = priceRange
      ? Array.isArray(priceRange)
        ? priceRange.map(Number)
        : priceRange.includes(",")
        ? priceRange.split(",").map(Number)
        : JSON.parse(priceRange)
      : [0, 10000000];
    if (
      !(
        Array.isArray(priceArr) &&
        priceArr.length === 2 &&
        typeof priceArr[0] === "number" &&
        typeof priceArr[1] === "number"
      )
    ) {
      priceArr = [0, 10000000];
    }

    let sizesArr = sizes
      ? typeof sizes === "string"
        ? JSON.parse(sizes)
        : sizes
      : [];
    let attrObj = attributes
      ? typeof attributes === "string"
        ? JSON.parse(attributes)
        : attributes
      : {};

    const query = buildProductVariantQuery({
      productIds: validVariants.map((v) => v.productId._id),
      sizes: sizesArr,
      color,
      priceRange: priceArr,
      attributes: attrObj,
    });
    console.log("Query:", query);

    let sort = { createdAt: -1 };
    if (sortBy && req.query.order) {
      sort = { [sortBy]: req.query.order === "desc" ? -1 : 1 };
    }

    const allVariants = await ProductVariant.find(query)
      .populate("productId")
      .sort(sort);
    console.log("All Variants:", allVariants.length);

    // Lấy mỗi productId 1 variant đại diện
    const representatives = getRepresentativeVariants(allVariants);
    console.log("Representatives:", representatives.length);

    // Phân trang
    const total = representatives.length;
    const totalPages = Math.ceil(total / limit);
    const docs = representatives.slice((page - 1) * limit, page * limit);

    return res.status(200).json({
      data: docs,
      totalPages,
      currentPage: parseInt(page),
      total,
    });
  } catch (error) {
    console.error("Error:", error.message);
    return res.status(500).json({ message: error.message });
  }
};
export const getbestsellingProductsMen = async (req, res) => {
  const getRepresentativeVariants = (variants) => {
    const seen = new Set();
    const representatives = [];
    for (const variant of variants) {
      const pid = String(variant.productId._id || variant.productId);
      if (!seen.has(pid)) {
        representatives.push(variant);
        seen.add(pid);
      }
    }
    return representatives;
  };

  const getAllChildCategoryIds = (allCategories, rootId) => {
    const result = [rootId];
    const stack = [rootId];
    while (stack.length) {
      const current = stack.pop();
      const children = allCategories.filter(
        (c) => String(c.parentId) === String(current)
      );
      for (const child of children) {
        result.push(child._id);
        stack.push(child._id);
      }
    }
    return result;
  };

  try {
    const {
      page = 1,
      limit = 12,
      color,
      sizes = [],
      priceRange,
      attributes = {},
      sortBy,
    } = req.query;
    console.log("Query Params:", {
      page,
      limit,
      color,
      sizes,
      priceRange,
      attributes,
    });

    const menRoot = await Category.findOne({ name: /nam/i });
    console.log("Men Root Category:", menRoot);
    if (!menRoot) return res.status(200).json({ data: [] });

    const allCategories = await Category.find();
    const menCategoryIds = getAllChildCategoryIds(allCategories, menRoot._id);
    console.log("Men Category IDs:", menCategoryIds);

    // 3. Kiểm tra sản phẩm trong danh mục "Nam"
    const products = await Product.find({
      categoryId: { $in: menCategoryIds },
    }).select("_id");
    console.log("Products in Men Category:", products.length);

    // 4. Lấy danh sách productId từ Order (chỉ lấy đơn hàng thành công)
    const orders = await Order.find({
      $or: [
        { paymentStatus: "Đã thanh toán" },
        { shippingStatus: "Đã nhận hàng" },
      ],
    }).select("items.productVariantId");
    console.log("Orders count:", orders.length);
    const productVariantIds = new Set();
    orders.forEach((order) => {
      order.items.forEach((item) => {
        if (item.productVariantId) {
          productVariantIds.add(String(item.productVariantId));
        }
      });
    });
    console.log("Product Variant IDs:", Array.from(productVariantIds));

    // 5. Lấy variant từ productVariantIds và thuộc category "Nam"
    const variantsFromOrders = await ProductVariant.find({
      _id: { $in: Array.from(productVariantIds) },
    })
      .populate({
        path: "productId",
        match: { categoryId: { $in: menCategoryIds } },
      })
      .lean();
    const validVariants = variantsFromOrders.filter(
      (variant) => variant.productId !== null
    );
    console.log("Valid Variants:", validVariants.length);
    console.log("Valid Variants Details:", validVariants);

    if (!validVariants.length) {
      return res.status(200).json({
        data: [],
        totalPages: 0,
        currentPage: parseInt(page),
        total: 0,
      });
    }

    // 6. Parse parameters and create query
    let priceArr = priceRange
      ? Array.isArray(priceRange)
        ? priceRange.map(Number)
        : priceRange.includes(",")
        ? priceRange.split(",").map(Number)
        : JSON.parse(priceRange)
      : [0, 10000000];
    if (
      !(
        Array.isArray(priceArr) &&
        priceArr.length === 2 &&
        typeof priceArr[0] === "number" &&
        typeof priceArr[1] === "number"
      )
    ) {
      priceArr = [0, 10000000];
    }

    let sizesArr = sizes
      ? typeof sizes === "string"
        ? JSON.parse(sizes)
        : sizes
      : [];
    let attrObj = attributes
      ? typeof attributes === "string"
        ? JSON.parse(attributes)
        : attributes
      : {};

    const query = buildProductVariantQuery({
      productIds: validVariants.map((v) => v.productId._id),
      sizes: sizesArr,
      color,
      priceRange: priceArr,
      attributes: attrObj,
    });
    console.log("Query:", query);

    // Xử lý sort động
    let sort = { createdAt: -1 };
    if (sortBy && req.query.order) {
      sort = { [sortBy]: req.query.order === "desc" ? -1 : 1 };
    }

    // Lấy tất cả variant thỏa mãn filter, sort
    const allVariants = await ProductVariant.find(query)
      .populate("productId")
      .sort(sort);
    console.log("All Variants:", allVariants.length);

    // Lấy mỗi productId 1 variant đại diện
    const representatives = getRepresentativeVariants(allVariants);
    console.log("Representatives:", representatives.length);

    // Phân trang
    const total = representatives.length;
    const totalPages = Math.ceil(total / limit);
    const docs = representatives.slice((page - 1) * limit, page * limit);

    return res.status(200).json({
      data: docs,
      totalPages,
      currentPage: parseInt(page),
      total,
    });
  } catch (error) {
    console.error("Error:", error.message);
    return res.status(500).json({ message: error.message });
  }
};
