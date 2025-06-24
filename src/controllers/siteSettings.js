import { SiteSettings } from "../models/siteSettings.js";
import cloudinary from "../config/cloudinary.js";
import streamifier from "streamifier";

export const uploadImage = async (file) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: "site-settings" },
      (error, result) => {
        if (error) return reject(error);
        resolve({ url: result.secure_url, public_id: result.public_id });
      }
    );
    // file.buffer từ memoryStorage
    streamifier.createReadStream(file.buffer).pipe(uploadStream);
  });
};

/** Xóa 1 ảnh trên Cloudinary */
export const deleteImage = async (publicId) => {
  if (publicId) {
    await cloudinary.uploader.destroy(publicId);
  }
};

/** Cập nhật cài đặt website */
export const updateSiteSettings = async (req, res) => {
  try {
    const files = req.files;
    const data = req.body;
    const existing = await SiteSettings.findOne();

    // Khởi tạo object rỗng nếu chưa có
    data.banners ??= {};
    data.footer ??= existing?.footer || {};
    data.seo ??= existing?.seo || {};
    data.status ??= existing?.status || "active";
    data.language ??= existing?.language || "vi";

    // --- Logo ---
    if (files?.logo?.[0]) {
      if (existing?.logo?.public_id) await deleteImage(existing.logo.public_id);
      data.logo = await uploadImage(files.logo[0]);
    } else {
      data.logo = existing?.logo || null;
    }

    // --- Favicon ---
    if (files?.favicon?.[0]) {
      if (existing?.favicon?.public_id)
        await deleteImage(existing.favicon.public_id);
      data.favicon = await uploadImage(files.favicon[0]);
    } else {
      data.favicon = existing?.favicon || null;
    }

    // --- Banner 02 ---
    if (files?.banner02?.[0]) {
      if (existing?.banners?.banner02?.public_id)
        await deleteImage(existing.banners.banner02.public_id);
      data.banners.banner02 = await uploadImage(files.banner02[0]);
    } else {
      data.banners.banner02 = existing?.banners?.banner02 || null;
    }

    // --- Banner 01 & Banner 03 ---
    for (const key of ["banner01", "banner03"]) {
      const fileArray = files?.[key];
      if (Array.isArray(fileArray) && fileArray.length > 0) {
        // Xoá ảnh cũ
        if (Array.isArray(existing?.banners?.[key])) {
          for (const img of existing.banners[key]) {
            await deleteImage(img.public_id);
          }
        }

        const uploaded = [];
        for (const file of fileArray) {
          const img = await uploadImage(file);
          uploaded.push(img);
        }
        data.banners[key] = uploaded;
      } else {
        data.banners[key] = existing?.banners?.[key] || [];
      }
    }

    // --- Cập nhật hoặc tạo ---
    const updated = existing
      ? await SiteSettings.findByIdAndUpdate(existing._id, data, { new: true })
      : await SiteSettings.create(data);

    res.json(updated);
  } catch (err) {
    console.error("❌ Error updateSiteSettings:", err);
    res.status(500).json({
      message: "Lỗi cập nhật cài đặt",
      error: err.message,
    });
  }
};

/** Lấy cài đặt hiện tại */
export const getSiteSettings = async (req, res) => {
  try {
    const settings = await SiteSettings.findOne();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: "Lỗi lấy cài đặt", error: err.message });
  }
};
