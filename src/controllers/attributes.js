import mongoose from "mongoose";
import Attribute from "../models/attributes.js";
import {
  attributeSchema,
  patchAttributeSchema,
} from "../schemaValidations/attribute.schema.js";

export const getAllAttributes = async (req, res) => {
  try {
    const {
      _page = 1,
      _limit = 10,
      _sort = "createdAt",
      _order = "asc",
      _name = "",
      _slug = "",
      _values = "",
    } = req.query;

    const query = {};
    if (_name) {
      query.name = { $regex: _name, $options: "i" };
    }
    if (_slug) {
      query.slug = { $regex: _slug, $options: "i" };
    }
    if (_values) {
      const valuesArr = Array.isArray(_values) ? _values : _values.split(",");
      query.values = {
        $elemMatch: { $regex: valuesArr.join("|"), $options: "i" },
      };
    }

    const options = {
      page: parseInt(_page),
      limit: parseInt(_limit),
      sort: { [_sort]: _order === "desc" ? -1 : 1 },
    };

    const attributes = await Attribute.paginate(query, options);

    return res.status(200).json({
      data: attributes.docs,
      totalPages: attributes.totalPages,
      currentPage: attributes.page,
      total: attributes.totalDocs,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// Lấy chi tiết thuộc tính
export const getAttribute = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "ID thuộc tính không hợp lệ" });
    }

    const attribute = await Attribute.findById(req.params.id);
    if (!attribute) {
      return res.status(404).json({ message: "Thuộc tính không tồn tại" });
    }
    return res.status(200).json(attribute);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// Tạo thuộc tính mới
export const createAttribute = async (req, res) => {
  try {
    const result = attributeSchema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.errors.map((err) => err.message);
      return res.status(400).json({ errors });
    }

    const { name, slug, values } = result.data;
    const exists = await Attribute.findOne({ slug });
    if (exists) {
      return res.status(400).json({ message: `Slug "${slug}" đã tồn tại` });
    }

    const attribute = await Attribute.create({ name, slug, values });
    return res.status(201).json(attribute);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const updateAttribute = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "ID thuộc tính không hợp lệ" });
    }

    const result = patchAttributeSchema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.errors.map((err) => err.message);
      return res.status(400).json({ errors });
    }
    console.log("Parsed data:", result.data);

    const { name, values } = result.data;
    const updateFields = {};

    // Prepare update fields
    if (name !== undefined) updateFields.name = name;
    if (values !== undefined) updateFields.values = values;

    const currentAttr = await Attribute.findById(req.params.id);
    if (!currentAttr) {
      return res.status(404).json({ message: "Thuộc tính không tồn tại" });
    }

    const tempAttribute = new Attribute({
      ...currentAttr.toObject(), // chuyển document thành plain object
      ...updateFields,
    });

    const validationError = tempAttribute.validateSync();
    if (validationError) {
      const errors = Object.values(validationError.errors).map(
        (err) => err.message
      );
      return res.status(400).json({ message: "Dữ liệu không hợp lệ", errors });
    }

    // Perform update
    const updatedAttribute = await Attribute.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    if (!updatedAttribute) {
      return res.status(404).json({ message: "Thuộc tính không tồn tại" });
    }

    console.log("Saved attribute:", updatedAttribute);

    return res.status(200).json({
      message: "Cập nhật thuộc tính thành công",
      data: updatedAttribute,
    });
  } catch (err) {
    console.error("Error updating attribute:", err);
    return res.status(500).json({
      message: "Lỗi server khi cập nhật thuộc tính",
      error: err.message,
    });
  }
};

// Xóa thuộc tính
export const deleteAttribute = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "ID thuộc tính không hợp lệ" });
    }

    const attribute = await Attribute.findByIdAndDelete(req.params.id);
    if (!attribute) {
      return res.status(404).json({ message: "Thuộc tính không tồn tại" });
    }
    return res.status(200).json({ message: "Xóa thuộc tính thành công" });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
