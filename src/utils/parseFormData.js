export const parseFormData = (body) => {
  const {
    productId,
    sku,
    price,
    "color.baseColor": baseColor,
    "color.actualColor": actualColor,
    "color.colorName": colorName,
    status,
    attributes = [],
    sizes = [],
    ...rest
  } = body;

  console.log("Rest:", rest); // Debug

  // Parse sizes
  const parsedSizes = sizes.map((sizeObj) => ({
    size: sizeObj.size,
    stock: Number(sizeObj.stock),
  }));
  const parsedAttributes = attributes.map((attributeObj) => ({
    attribute: attributeObj.attribute,
    value: attributeObj.value,
  }));

  return {
    productId,
    sku,
    price: Number(price),
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
