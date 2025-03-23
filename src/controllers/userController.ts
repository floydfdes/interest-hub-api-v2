import { Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import User from "../models/User";

export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
    if (!req.userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }

    const user = await User.findById(req.userId).select("-password");

    if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
    }

    res.status(200).json({ user });
};
