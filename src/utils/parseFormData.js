export const parseFormData = (body) => {
  const {
    productId,
    sku,
    "color.baseColor": baseColor,
    "color.actualColor": actualColor,
    "color.colorName": colorName,
    status,
    attributes = [],
    sizes = [],
    ...rest
  } = body;

  // Parse sizes (có thêm price)
  const parsedSizes = sizes.map((sizeObj) => ({
    size: sizeObj.size,
    stock: Number(sizeObj.stock),
    price: Number(sizeObj.price), // thêm giá vào từng size
  }));

  const parsedAttributes = attributes.map((attributeObj) => ({
    attribute: attributeObj.attribute,
    value: attributeObj.value,
  }));

  return {
    productId,
    sku,
    color: {
      baseColor,
      actualColor,
      colorName,
    },
    sizes: parsedSizes,
    attributes: parsedAttributes,
    status: status === "true" || status === true,
  };
};
