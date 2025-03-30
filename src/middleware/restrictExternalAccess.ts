// middleware/restrictExternalAccess.ts
import { NextFunction, Request, Response } from "express";

import jwt from "jsonwebtoken";
import User from "../models/User";

const JWT_SECRET = process.env.JWT_SECRET || "secret";
export const restrictExternalAccess = async (req: Request, res: Response, next: NextFunction) => {

    const originHeader = req.headers["x-requested-with"];

    // If the request is from frontend, allow
    if (originHeader === "InterestHubFrontend") return next();

    // Otherwise, check for admin user
    const authHeader = req.headers.authorization;

    const token = authHeader?.split(" ")[1];


    if (!token) return res.status(403).json({ message: "Forbidden: No token" });

    try {

        const decoded: any = jwt.verify(token, JWT_SECRET!);
        const user = await User.findById(decoded.userId);

        if (!user || user.role !== "admin") {
            return res.status(403).json({ message: "Forbidden: Admin access only" });
        }

        next();
    } catch (error) {
        return res.status(403).json({ message: "Forbidden" });
    }
};
