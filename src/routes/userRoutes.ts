import {
    block,
    deleteAccount,
    follow,
    followers,
    following,
    getMe,
    getProfile,
    search,
    unblock,
    unfollow,
    updateProfile,
} from "../controllers/userController";

import express from "express";
import authMiddleware from "../middleware/authMiddleware";

const router = express.Router();

router.get("/me", authMiddleware, getMe);
router.get("/profile/:id", getProfile);
router.patch("/update", authMiddleware, updateProfile);
router.delete("/delete", authMiddleware, deleteAccount);

router.post("/follow/:targetUserId", authMiddleware, follow);
router.post("/unfollow/:targetUserId", authMiddleware, unfollow);

router.get("/:id/followers", followers);
router.get("/:id/following", following);

router.post("/block/:targetUserId", authMiddleware, block);
router.post("/unblock/:targetUserId", authMiddleware, unblock);

router.get("/search", search);

export default router;
