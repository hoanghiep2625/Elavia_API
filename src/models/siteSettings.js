import mongoose from "mongoose";

const imageSchema = new mongoose.Schema(
  {
    url: String,
    public_id: String,
  },
  { _id: false }
);

const siteSettingsSchema = new mongoose.Schema(
  {
    logo: imageSchema,
    favicon: imageSchema,
    status: {
      type: String,
      enum: ["active", "maintenance"],
      default: "active",
    },
    language: {
      type: String,
      enum: ["vi", "en"],
      default: "vi",
    },
    seo: {
      title: String,
      description: String,
      keywords: [String],
    },
    banners: {
      banner01: [imageSchema],
      banner02: imageSchema,
      banner03: [imageSchema],
    },
    footer: {
      socialLinks: {
        facebook: String,
        instagram: String,
        youtube: String,
        google: String,
        pinterest: String,
        messenger: String,
      },
      phone: String,
      address: String,
      appLinks: {
        android: String,
        ios: String,
      },
      termsLink: String,
      policyLink: String,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export const SiteSettings =
  mongoose.models.SiteSettings ||
  mongoose.model("SiteSettings", siteSettingsSchema);
