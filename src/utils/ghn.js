// services/ghnService.js
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const TOKEN = process.env.GHN_TOKEN;
const SHOP_ID = process.env.GHN_SHOP_ID;
const SHOP_DISTRICT_ID = Number(process.env.SHOP_DISTRICT_ID);
const SHOP_WARD_CODE = process.env.SHOP_WARD_CODE;
const defaultShippingConfig = {
  height: 5,
  length: 20,
  width: 15,
  weight: 400,
  insurance_value: 100000,
  service_type_id: 2,
};

const ghnApi = axios.create({
  baseURL: "https://online-gateway.ghn.vn/shiip/public-api",
  headers: {
    Token: TOKEN,
    ShopId: SHOP_ID,
  },
});

export const getProvinces = async () => {
  const res = await ghnApi.get("/master-data/province");
  return res.data.data;
};

export const getDistricts = async (provinceId) => {
  const res = await ghnApi.post("/master-data/district", {
    province_id: provinceId,
  });
  return res.data.data;
};

export const getWards = async (districtId) => {
  const res = await ghnApi.post("/master-data/ward", {
    district_id: districtId,
  });
  return res.data.data;
};

export const calculateShippingFee = async ({
  to_district_id,
  to_ward_code,
  weight,
  insurance_value,
  service_type_id,
  length,
  width,
  height,
}) => {
  const config = {
    ...defaultShippingConfig,
    from_district_id: SHOP_DISTRICT_ID,
    to_district_id,
    to_ward_code,
    weight: weight || defaultShippingConfig.weight,
    insurance_value: insurance_value || defaultShippingConfig.insurance_value,
    service_type_id: service_type_id || defaultShippingConfig.service_type_id,
    length: length || defaultShippingConfig.length,
    width: width || defaultShippingConfig.width,
    height: height || defaultShippingConfig.height,
  };

  const res = await ghnApi.post("/v2/shipping-order/fee", config);
  return res.data.data.total;
};

export const getServiceId = async ({ from_district, to_district }) => {
  try {
    const res = await ghnApi.post("/v2/shipping-order/available-services", {
      shop_id: Number(SHOP_ID),
      from_district,
      to_district,
    });

    const standardService = res.data.data.find((s) => s.service_type_id === 2);
    return standardService?.service_id || null;
  } catch (error) {
    console.error(
      "❌ Lỗi lấy service_id:",
      error.response?.data || error.message
    );
    return null;
  }
};
