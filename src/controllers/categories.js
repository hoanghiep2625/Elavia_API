import Category from "../models/categories.js";
import { z } from "zod";
import mongoose from "mongoose";

const categorySchema = z.object({
  name: z.string().min(2, "Tên danh mục cần tối thiểu 2 ký tự"),
  parentId: z
    .string()
    .refine((val) => val === null || mongoose.Types.ObjectId.isValid(val), {
      message: "parentId phải là ObjectId hợp lệ hoặc null",
    })
    .nullable()
    .optional(),
  level: z
    .number()
    .int()
    .min(1, "Cấp độ phải là số nguyên lớn hơn hoặc bằng 1")
    .max(3, "Cấp độ tối đa là 3"),
});
export const createCategory = async (req, res) => {
  try {
    const result = categorySchema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.errors.map((err) => err.message);
      return res.status(400).json({ errors });
    }

    const { parentId, level } = result.data;
    if (parentId) {
      const parent = await Category.findById(parentId);
      if (!parent)
        return res.status(400).json({ message: "Danh mục cha không tồn tại" });
      if (parent.level >= 3)
        return res
          .status(400)
          .json({ message: "Không thể tạo danh mục con cho cấp 3" });
      if (level !== parent.level + 1)
        return res
          .status(400)
          .json({ message: "Level phải lớn hơn level của parentId 1 đơn vị" });
    } else if (level !== 1) {
      return res
        .status(400)
        .json({ message: "Danh mục không có parentId phải có level là 1" });
    }

    const category = await Category.create(result.data);
    return res.status(201).json(category);
  } catch (error) {
    return res.status(400).json({
      message: error.message,
    });
  }
};
export const getCategories = async (req, res) => {
  try {
    const { _sort = "level", _order = "asc", level, parentId } = req.query;

    const sortOptions = { [_sort]: _order === "desc" ? -1 : 1 };

    const query = {};
    if (level) query.level = parseInt(level);
    if (parentId) query.parentId = parentId;

    const categories = await Category.find(query).sort(sortOptions);

    return res.status(200).json({
      data: categories,
      total: categories.length, // Tổng số danh mục
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message,
    });
  }
};

export const getCategoryById = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: "Danh mục không tồn tại" });
    }
    return res.status(200).json(category);
  } catch (error) {
    return res.status(400).json({
      message: error.message,
    });
  }
};

export const deleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: "Danh mục không tồn tại" });
    }

    const hasChildren = await Category.exists({ parentId: req.params.id });
    if (hasChildren) {
      return res
        .status(400)
        .json({ message: "Không thể xóa danh mục có danh mục con" });
    }

    await Category.findByIdAndDelete(req.params.id);
    return res.status(200).json({
      message: "Xóa danh mục thành công",
      data: category,
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message,
    });
  }
};
export const updateCategory = async (req, res) => {
  try {
    const result = categorySchema.partial().safeParse(req.body);
    if (!result.success) {
      const errors = result.error.errors.map((err) => err.message);
      return res.status(400).json({ errors });
    }

    const { parentId, level } = result.data;

    if (parentId !== undefined || level !== undefined) {
      if (parentId) {
        const parent = await Category.findById(parentId);
        if (!parent) {
          return res
            .status(400)
            .json({ message: "Danh mục cha không tồn tại" });
        }
        if (parent.level >= 3) {
          return res
            .status(400)
            .json({ message: "Không thể tạo danh mục con cho cấp 3" });
        }
        if (level !== undefined && level !== parent.level + 1) {
          return res.status(400).json({
            message: "Level phải lớn hơn level của parentId 1 đơn vị",
          });
        }
      } else if (level !== undefined && level !== 1) {
        return res
          .status(400)
          .json({ message: "Danh mục không có parentId phải có level là 1" });
      }
    }

    const category = await Category.findByIdAndUpdate(
      req.params.id,
      result.data,
      { new: true }
    );
    if (!category) {
      return res.status(404).json({ message: "Danh mục không tồn tại" });
    }

    return res.status(200).json({
      message: "Cập nhật danh mục thành công",
      data: category,
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message,
    });
  }
};
