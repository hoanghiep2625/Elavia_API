// services/ghnService.js
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const TOKEN = process.env.GHN_TOKEN;
const SHOP_ID = process.env.GHN_SHOP_ID;

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
}) => {
  const res = await ghnApi.post("/v2/shipping-order/fee", {
    service_type_id: 2, // giao hàng tiêu chuẩn
    insurance_value: 100000,
    from_district_id: 1450, // Ví dụ: Quận Thanh Xuân (shop address)
    to_district_id,
    to_ward_code,
    height: 15,
    length: 15,
    weight: 500,
    width: 15,
  });
  return res.data.data.total;
};
