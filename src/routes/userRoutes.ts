import express from "express";
import { getMe } from "../controllers/userController";
import authMiddleware from "../middleware/authMiddleware";

const router = express.Router();

router.get("/me", authMiddleware, getMe);

export default router;