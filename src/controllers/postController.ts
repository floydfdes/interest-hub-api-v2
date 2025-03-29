import { Request, Response } from "express";
import {
    createPostService,
    deletePostService,
    getAllPostsService,
    getPostByIdService,
    updatePostService
} from "../services/postService";

import mongoose from "mongoose";
import { AuthRequest } from "../middleware/authMiddleware";

export const createPost = async (req: AuthRequest, res: Response) => {
    try {
        const { title, content, images, category, tags, visibility } = req.body;

        if (!req.userId) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }

        const post = await createPostService({
            title,
            content,
            images,
            category,
            tags,
            visibility,
            author: new mongoose.Types.ObjectId(req.userId)
        });

        res.status(201).json(post);
    } catch (error) {
        res.status(500).json({ message: "Failed to create post" });
    }
};

export const getAllPosts = async (_req: Request, res: Response) => {

    try {
        const posts = await getAllPostsService();
        res.json(posts);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch posts" });
    }
};

export const getPostById = async (req: Request, res: Response) => {
    try {

        const post = await getPostByIdService(req.params.id);

        if (!post) {
            res.status(404).json({ message: "Post not found" });
            return;
        }

        res.json(post);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch post" });
    }
};

export const updatePost = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.userId) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }

        const post = await updatePostService(req.params.id, req.userId, req.body);

        if (post === null) {
            res.status(404).json({ message: "Post not found" });
            return;
        }

        if (post === false) {
            res.status(403).json({ message: "Unauthorized" });
            return;
        }

        res.json(post);
    } catch (error) {
        res.status(500).json({ message: "Failed to update post" });
    }
};

export const deletePost = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.userId) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }

        const result = await deletePostService(req.params.id, req.userId);

        if (result === null) {
            res.status(404).json({ message: "Post not found" });
            return;
        }

        if (result === false) {
            res.status(403).json({ message: "Unauthorized" });
            return;
        }

        res.json({ message: "Post deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: "Failed to delete post" });
    }
};
