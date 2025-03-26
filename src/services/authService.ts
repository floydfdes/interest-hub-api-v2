import { generateRefreshToken, generateToken } from "../utils/token";

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User";
import { generateResetToken } from "../utils/token";

const JWT_SECRET = process.env.JWT_SECRET || "secret";


export const registerUserService = async (name: string, email: string, password: string) => {
    const existingUser = await User.findOne({ email });
    if (existingUser) throw new Error("Email already in use");

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
        name,
        email,
        password: hashedPassword,
    });

    await user.save();

    const token = generateToken(user._id.toString());
    const refreshToken = generateRefreshToken(user._id.toString());

    return {
        token,
        refreshToken,
        user: {
            id: user._id,
            name: user.name,
            email: user.email,
        },
    };
};

export const loginUserService = async (email: string, password: string) => {
    const user = await User.findOne({ email });
    if (!user) throw new Error("Invalid credentials");

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) throw new Error("Invalid credentials");

    const token = generateToken(user._id.toString());
    const refreshToken = generateRefreshToken(user._id.toString());

    return {
        token,
        refreshToken,
        user: {
            id: user._id,
            name: user.name,
            email: user.email,
        },
    };
};


export const refreshAccessTokenService = (refreshToken: string) => {
    try {
        const decoded = jwt.verify(refreshToken, JWT_SECRET) as { userId: string };

        const newAccessToken = jwt.sign({ userId: decoded.userId }, JWT_SECRET, {
            expiresIn: "1h",
        });

        return newAccessToken;
    } catch {
        throw new Error("Invalid or expired refresh token");
    }
};


export const forgotPasswordService = async (email: string): Promise<string | null> => {
    const user = await User.findOne({ email });
    if (!user) return null;

    const token = generateResetToken();
    const expiry = new Date(Date.now() + 1000 * 60 * 60); // 1 hour from now

    user.resetToken = token;
    user.resetTokenExpiry = expiry;
    await user.save();

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    return resetLink;
};

export const resetPasswordService = async (
    token: string,
    newPassword: string
): Promise<void> => {
    const user = await User.findOne({
        resetToken: token,
        resetTokenExpiry: { $gt: new Date() },
    });

    if (!user) throw new Error("Invalid or expired token");

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.resetToken = null;
    user.resetTokenExpiry = null;

    await user.save();
};


export const changePasswordService = async (
    userId: string,
    currentPassword: string,
    newPassword: string
): Promise<void> => {
    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) throw new Error("Current password is incorrect");

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedNewPassword;

    await user.save();
};

