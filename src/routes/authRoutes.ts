import { loginUser, registerUser } from "../controllers/authController";
import { loginValidation, registerValidation } from "../middleware/validateAuth";

import express from "express";
import validate from "../middleware/validate";

const router = express.Router();

router.post("/register", registerValidation, validate, registerUser);
router.post("/login", loginValidation, validate, loginUser);

export default router;
