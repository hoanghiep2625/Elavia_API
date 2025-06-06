import { z } from "zod";
import mongoose from "mongoose";
import ProductVariant from "../models/productVariant.js";
import upload from "../middlewares/multer.js";
import cloudinary from "../config/cloudinary.js";
import { parseFormData } from "../utils/parseFormData.js";
import RecentlyViewed from "../models/recentlyViewed.js";

const productVariantSchema = z.object({
  productId: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
    message: "productId phải là ObjectId hợp lệ",
  }),
  sku: z.string(),
  price: z.number().min(0, "Giá phải lớn hơn hoặc bằng 0"),
  color: z.object({
    baseColor: z.string(),
    actualColor: z.string(),
    colorName: z.string(),
  }),
  sizes: z.array(
    z.object({
      size: z.enum(["S", "M", "L", "XL", "XXL"]),
      stock: z.number().min(0),
    })
  ),
});
const patchProductVariantSchema = productVariantSchema.partial();

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
      console.log("Received body:", req.body);
      const formData = parseFormData(req.body);
      console.log("formData:", JSON.stringify(formData, null, 2));

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
export const getProductVariants = async (req, res) => {
  try {
    const {
      _limit = 10,
      _page = 1,
      _sort = "price",
      _order = "asc",
      productId,
      priceMin,
      priceMax,
      baseColor,
      size,
      stockMin,
      stockMax,
    } = req.query;

    // Tạo query lọc
    const query = {};

    // Lọc theo productId nếu có
    if (productId && mongoose.Types.ObjectId.isValid(productId)) {
      query.productId = new mongoose.Types.ObjectId(productId);
    }

    // Lọc theo price (min/max)
    if (priceMin || priceMax) {
      query.price = {};
      if (priceMin) query.price.$gte = parseFloat(priceMin);
      if (priceMax) query.price.$lte = parseFloat(priceMax);
    }

    // Lọc theo màu sắc
    if (baseColor) {
      query["color.baseColor"] = baseColor;
    }

    // Lọc theo size và stock
    if (size || stockMin || stockMax) {
      query.sizes = { $elemMatch: {} };
      if (size) query.sizes.$elemMatch.size = size;
      if (stockMin || stockMax) {
        query.sizes.$elemMatch.stock = {};
        if (stockMin) query.sizes.$elemMatch.stock.$gte = parseInt(stockMin);
        if (stockMax) query.sizes.$elemMatch.stock.$lte = parseInt(stockMax);
      }
    }

    // Cấu hình phân trang và sắp xếp
    const options = {
      page: parseInt(_page),
      limit: parseInt(_limit),
      sort: { [_sort]: _order === "desc" ? -1 : 1 },
      populate: "productId", // Thêm populate nếu cần thiết
    };

    // Lấy dữ liệu phân trang và lọc
    const result = await ProductVariant.paginate(query, options);

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
    // Kiểm tra id có hợp lệ không
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
    return res.status(400).json({
      message: error.message,
    });
  }
};
// Cập nhật biến thể sản phẩm
export const updateProductVariant = async (req, res) => {
  upload.fields([
    { name: "mainImage", maxCount: 1 },
    { name: "hoverImage", maxCount: 1 },
    { name: "productImages", maxCount: 10 },
  ])(req, res, async (err) => {
    if (err) return res.status(400).json({ message: err.message });

    try {
      const formData = parseFormData(req.body);
      const result = patchProductVariantSchema.safeParse(formData);
      if (!result.success) {
        const errors = result.error.errors.map((err) => err.message);
        return res.status(400).json({ errors });
      }

      // Lấy dữ liệu hiện tại của variant trước khi update
      const existingVariant = await ProductVariant.findById(req.params.id);
      if (!existingVariant) {
        return res
          .status(404)
          .json({ message: "Biến thể sản phẩm không tồn tại" });
      }

      const variantData = { ...result.data };

      // Xử lý hình ảnh
      if (req.files) {
        // Xử lý ảnh chính
        if (req.files["mainImage"]) {
          // Nếu có ảnh cũ, xoá ảnh cũ trên Cloudinary
          if (existingVariant.images?.main?.public_id) {
            await cloudinary.uploader.destroy(
              existingVariant.images.main.public_id
            );
          }
          variantData.images = existingVariant.images || {};
          variantData.images.main = await uploadImageToCloudinary(
            req.files["mainImage"][0]
          );
        }
        // Xử lý ảnh hover
        if (req.files["hoverImage"]) {
          if (existingVariant.images?.hover?.public_id) {
            await cloudinary.uploader.destroy(
              existingVariant.images.hover.public_id
            );
          }
          variantData.images = existingVariant.images || {};
          variantData.images.hover = await uploadImageToCloudinary(
            req.files["hoverImage"][0]
          );
        }
        // Xử lý ảnh product (cho mảng nhiều ảnh)
        if (req.files["productImages"]) {
          // Nếu bạn muốn thay thế toàn bộ mảng ảnh product:
          if (
            existingVariant.images?.product &&
            existingVariant.images.product.length
          ) {
            for (const img of existingVariant.images.product) {
              if (img.public_id) {
                await cloudinary.uploader.destroy(img.public_id);
              }
            }
          }
          variantData.images = existingVariant.images || {};
          // Upload tất cả ảnh mới, tạo mảng các đối tượng chứa { url, public_id }
          variantData.images.product = await Promise.all(
            req.files["productImages"].map(uploadImageToCloudinary)
          );
        }
      }

      // Lọc các field cần update (chỉ update field không undefined)
      const updateFields = {};
      for (const key in variantData) {
        if (variantData[key] !== undefined) {
          updateFields[key] = variantData[key];
        }
      }

      // Update variant
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

    // Xoá ảnh trên Cloudinary
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
      return res.status(200).json({ data: [], total: 0, page, limit });
    }

    const total = viewed.products.length;
    const paginatedProducts = viewed.products.slice(skip, skip + limit);

    return res.status(200).json({
      data: paginatedProducts,
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error("Không thể lấy danh sách đã xem:", error);
    return res.sendStatus(500);
  }
};

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
export const getColorsByProductId = async (req, res) => {
  try {
    const { productId } = req.body; // Lấy productId từ body

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
