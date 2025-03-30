import { Document, Schema, model } from "mongoose";

export interface IUser extends Document {
    _id: string;
    name: string;
    email: string;
    password: string;
    role: "user" | "admin";
    profilePic: string;
    bio: string;
    interests: string[];
    followers: Schema.Types.ObjectId[];
    following: Schema.Types.ObjectId[];
    otp: string | null;
    otpExpires: Date | null;
    is2FAEnabled: boolean;
    twoFASecret: string;
    resetToken: string | null;
    resetTokenExpiry: Date | null;
    isBlocked: boolean;
    warnings: {
        reason: string;
        date: Date;
    }[];
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
}

const UserSchema = new Schema<IUser>(
    {
        name: { type: String, required: true, trim: true },
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        password: { type: String, required: true, minlength: 6 },
        role: { type: String, enum: ["user", "admin"], default: "user" },
        profilePic: { type: String, default: "" },
        bio: { type: String, maxlength: 160, default: "" },
        interests: { type: [String], default: [] },
        followers: [{ type: Schema.Types.ObjectId, ref: "User" }],
        following: [{ type: Schema.Types.ObjectId, ref: "User" }],
        otp: { type: String, default: null },
        otpExpires: { type: Date, default: null },
        is2FAEnabled: { type: Boolean, default: false },
        twoFASecret: { type: String, default: "" },
        resetToken: { type: String, default: null },
        resetTokenExpiry: { type: Date, default: null },
        isBlocked: { type: Boolean, default: false },
        warnings: [
            {
                reason: String,
                date: { type: Date, default: Date.now },
            },
        ],
    },
    { timestamps: true }
);

const User = model<IUser>("User", UserSchema);
export default User;
