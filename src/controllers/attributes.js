import Attribute from "../models/attributes.js";

export const getAllAttributes = async (req, res) => {
  try {
    const attributes = await Attribute.find();
    res.json(attributes);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getAttribute = async (req, res) => {
  try {
    const attribute = await Attribute.findById(req.params.id);
    if (!attribute)
      return res.status(404).json({ message: "Không tìm thấy biến thể" });
    res.json(attribute);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const createAttribute = async (req, res) => {
  try {
    const { name, slug, values } = req.body;
    const exists = await Attribute.findOne({ slug });
    if (exists) return res.status(400).json({ message: "Slug đã tồn tại" });

    const attribute = new Attribute({ name, slug, values });
    await attribute.save();
    res.status(201).json(attribute);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const updateAttribute = async (req, res) => {
  try {
    const { name, values } = req.body;
    const attribute = await Attribute.findById(req.params.id);
    if (!attribute)
      return res.status(404).json({ message: "Không tìm thấy biến thể" });

    attribute.name = name ?? attribute.name;
    attribute.values = values ?? attribute.values;
    await attribute.save();

    res.json(attribute);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const deleteAttribute = async (req, res) => {
  try {
    const attribute = await Attribute.findByIdAndDelete(req.params.id);
    if (!attribute)
      return res.status(404).json({ message: "Không tìm thấy biến thể" });
    res.json({ message: "Xoá biến thể thành công" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
