import {
  getProvinces,
  getDistricts,
  getWards,
  calculateShippingFee,
} from "../utils/ghn.js";

export const getShippingFee = async (req, res) => {
  try {
    let { cityName, districtName, wardName, insurance_value, total_weight } =
      req.body;

    if (!cityName || !districtName || !wardName) {
      return res.status(400).json({ message: "Thiếu thông tin địa chỉ" });
    }

    // ✅ Chỉ bỏ tiền tố ở cityName
    const normalizedCityName = cityName
      .replace(/^(Tỉnh|Thành phố)\s*/i, "")
      .trim();

    const provinces = await getProvinces();
    const province = provinces.find(
      (p) =>
        p.ProvinceName.replace(/^(Tỉnh|Thành phố)\s*/i, "").trim() ===
        normalizedCityName
    );
    if (!province)
      return res.status(400).json({ message: "Không tìm thấy tỉnh/thành" });

    const districts = await getDistricts(province.ProvinceID);
    const district = districts.find((d) => d.DistrictName === districtName);
    if (!district)
      return res.status(400).json({ message: "Không tìm thấy quận/huyện" });

    const wards = await getWards(district.DistrictID);
    const ward = wards.find((w) => w.WardName === wardName);
    if (!ward)
      return res.status(400).json({ message: "Không tìm thấy phường/xã" });

    const fee = await calculateShippingFee({
      to_district_id: district.DistrictID,
      to_ward_code: ward.WardCode,
      insurance_value,
      weight: total_weight || 500,
    });

    return res.json({ shippingFee: fee });
  } catch (err) {
    console.error("Lỗi tính phí vận chuyển:", err.message);
    res.status(500).json({ message: "Có lỗi xảy ra khi tính phí vận chuyển" });
  }
};

export const getShippingFeeOrder = async (receiver) => {
  let { cityName, districtName, wardName } = receiver;

  if (!cityName || !districtName || !wardName) {
    throw new Error("Thiếu thông tin địa chỉ");
  }
  cityName = cityName.replace(/^(Tỉnh|Thành phố)\s+/i, "").trim();

  const provinces = await getProvinces();
  const province = provinces.find(
    (p) =>
      p.ProvinceName.replace(/^(Tỉnh|Thành phố)\s+/i, "").trim() === cityName
  );

  if (!province) throw new Error("Không tìm thấy tỉnh/thành");

  const districts = await getDistricts(province.ProvinceID);
  const district = districts.find((d) => d.DistrictName === districtName);
  if (!district) throw new Error("Không tìm thấy quận/huyện");

  const wards = await getWards(district.DistrictID);
  const ward = wards.find((w) => w.WardName === wardName);
  if (!ward) throw new Error("Không tìm thấy phường/xã");

  const fee = await calculateShippingFee({
    to_district_id: district.DistrictID,
    to_ward_code: ward.WardCode,
  });

  return fee;
};
