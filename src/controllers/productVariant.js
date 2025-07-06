import mongoose from "mongoose";
import ProductVariant from "../models/productVariant.js";
import upload from "../middlewares/multer.js";
import cloudinary from "../config/cloudinary.js";
import { parseFormData } from "../utils/parseFormData.js";
import RecentlyViewed from "../models/recentlyViewed.js";
import {
  productVariantSchema,
  patchProductVariantSchema,
} from "../schemaValidations/variant.schema.js";
import Product from "../models/product.js";
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
      const formData = parseFormData(req.body);

      const result = productVariantSchema.safeParse(formData);
      if (!result.success) {
        const errors = result.error.errors.map((err) => err.message);
        return res.status(400).json({ errors });
      }

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

      const variantData = {
        ...result.data,
        images: {
          main: mainImage,
          hover: hoverImage,
          product: productImages,
        },
      };

      const variant = await ProductVariant.create(variantData);
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
      const formData = parseFormData(req.body);
      formData.deletedImages = req.body["deletedImages[]"]
        ? Array.isArray(req.body["deletedImages[]"])
          ? req.body["deletedImages[]"]
          : [req.body["deletedImages[]"]]
        : [];

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

      const updateFields = {};
      for (const key in variantData) {
        if (variantData[key] !== undefined) {
          updateFields[key] = variantData[key];
        }
      }

      const updatedVariant = await ProductVariant.findByIdAndUpdate(
        req.params.id,
        updateFields,
        { new: true }
      );

      if (!updatedVariant) {
        return res
          .status(404)
          .json({ message: "Biến thể sản phẩm không tồn tại" });
      }

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
    const variant = await ProductVariant.findByIdAndDelete(req.params.id);
    if (!variant) {
      return res
        .status(404)
        .json({ message: "Biến thể sản phẩm không tồn tại" });
    }

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
