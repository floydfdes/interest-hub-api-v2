import {
    createPost,
    deletePost,
    getAllPosts,
    getPostById,
    updatePost
} from "../controllers/postController";
import { createPostValidation, updatePostValidation } from "../middleware/validatePost";

import express from "express";
import authMiddleware from "../middleware/authMiddleware";
import validate from "../middleware/validate";

const router = express.Router();

router.post("/", authMiddleware, createPostValidation, validate, createPost);
router.get("/", getAllPosts);
router.get("/:id", getPostById);
router.put("/:id", authMiddleware, updatePostValidation, validate, updatePost);
router.delete("/:id", authMiddleware, deletePost);

export default router;
