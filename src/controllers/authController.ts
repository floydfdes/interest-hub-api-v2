import { Request, Response } from "express";
import { loginUserService, registerUserService } from "../services/authService";

import { AuthRequest } from "../middleware/authMiddleware";
import User from "../models/User";

export const registerUser = async (req: Request, res: Response) => {
    const { name, email, password } = req.body;

    try {
        const data = await registerUserService(name, email, password);
        res.status(201).json(data);
    } catch (err: any) {
        res.status(400).json({ message: err.message });
    }
};

export const loginUser = async (req: Request, res: Response) => {
    const { email, password } = req.body;

    try {
        const data = await loginUserService(email, password);
        res.status(200).json(data);
    } catch (err: any) {
        res.status(401).json({ message: err.message });
    }
};



export const getMe = async (req: AuthRequest, res: Response) => {
    if (!req.userId) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findById(req.userId).select("-password");
    if (!user) {
        return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ user });
};