import mongoose, { Schema } from "mongoose";

const cartItemSchema = new Schema({
    productVariantId: {
        type: Schema.Types.ObjectId,
        ref: "ProductVariant",
        required: true,
    },
    size: {
        type: String,
        required: true
    },
    quantity: {
        type: Number,
        default: 1
    }
});

const cartSchema = new Schema(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true
        },
        items: [cartItemSchema]
    },
    {
        timestamps: true,
        versionKey: false
    }
);

export default mongoose.model("Cart", cartSchema);
