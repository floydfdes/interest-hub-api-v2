import { changePassword, forgotPassword, loginUser, logoutUser, refreshAccessToken, registerUser, resetPassword } from "../controllers/authController";
import { loginValidation, registerValidation } from "../middleware/validateAuth";

import express from "express";
import authMiddleware from "../middleware/authMiddleware";
import validate from "../middleware/validate";

const router = express.Router();

router.post("/register", registerValidation, validate, registerUser);
router.post("/login", loginValidation, validate, loginUser);
router.post("/refresh", refreshAccessToken);
router.post("/logout", authMiddleware, logoutUser);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.patch("/change-password", authMiddleware, changePassword);



export default router;
