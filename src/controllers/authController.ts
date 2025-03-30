import { Request, Response } from "express";
import {
    changePasswordService,
    forgotPasswordService,
    loginUserService,
    refreshAccessTokenService,
    registerUserService,
    resetPasswordService
} from "../services/authService";

import { AuthRequest } from "../middleware/authMiddleware";
import logger from "../utils/logger";

export const registerUser = async (req: Request, res: Response): Promise<void> => {
    const { name, email, password } = req.body;

    try {
        const { token, refreshToken, user } = await registerUserService(name, email, password);

        res
            .cookie("refreshToken", refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "strict",
                maxAge: 30 * 24 * 60 * 60 * 1000,
            })
            .status(201)
            .json({ token, user });
    } catch (err: any) {
        res.status(400).json({ message: err.message });
    }
};

export const loginUser = async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body;

    try {
        const { token, refreshToken, user } = await loginUserService(email, password);

        res
            .cookie("refreshToken", refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "strict",
                maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
            })
            .status(200)
            .json({ token, user });
    } catch (err: any) {
        res.status(401).json({ message: err.message });
    }
};



export const refreshAccessToken = (req: Request, res: Response): void => {
    const token = req.cookies.refreshToken;

    if (!token) {
        res.status(401).json({ message: "Refresh token missing" });
        return;
    }

    try {
        const newAccessToken = refreshAccessTokenService(token);
        res.status(200).json({ token: newAccessToken });
    } catch (err: any) {
        res.status(401).json({ message: err.message });
    }
};


export const logoutUser = (req: AuthRequest, res: Response): void => {
    res.clearCookie("refreshToken", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
    });

    logger.info(`User logged out: ${req.userId} from ${req.ip}`);

    res.status(200).json({ message: "Logged out successfully" });
};


export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
    const { email } = req.body;

    const resetLink = await forgotPasswordService(email);

    if (resetLink) {
        console.log(`[Mock Email] Reset your password: ${resetLink}`);
    }

    res.status(200).json({
        message: "If an account with that email exists, a reset link has been sent.",
    });
};


export const resetPassword = async (req: Request, res: Response): Promise<void> => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        res.status(400).json({ message: "Token and new password are required" });
        return;
    }

    try {
        await resetPasswordService(token, newPassword);
        res.status(200).json({ message: "Password reset successful" });
    } catch (err: any) {
        res.status(400).json({ message: err.message });
    }
};


export const changePassword = async (req: AuthRequest, res: Response): Promise<void> => {
    const { currentPassword, newPassword } = req.body;

    if (!req.userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }

    if (!currentPassword || !newPassword) {
        res.status(400).json({ message: "Both current and new passwords are required" });
        return;
    }

    try {
        await changePasswordService(req.userId, currentPassword, newPassword);
        res.status(200).json({ message: "Password changed successfully" });
    } catch (err: any) {
        res.status(400).json({ message: err.message });
    }
};

