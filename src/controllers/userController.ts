import {
    blockUser,
    deleteUserAccount,
    followUser,
    getFollowers,
    getFollowing,
    getUserById,
    searchUsers,
    unblockUser,
    unfollowUser,
    updateUserProfile,
} from "../services/userService";

import { Request, Response, } from "express";
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



export const getProfile = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const profile = await getUserById(id);
        res.status(200).json(profile);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch user profile" });
    }
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
    try {
        const updated = await updateUserProfile(req.userId!, req.body);
        res.status(200).json(updated);
    } catch (error) {
        res.status(500).json({ message: "Failed to update profile" });
    }
};

export const deleteAccount = async (req: AuthRequest, res: Response) => {
    try {
        await deleteUserAccount(req.userId!);
        res.status(200).json({ message: "Account deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: "Failed to delete account" });
    }
};

export const follow = async (req: AuthRequest, res: Response) => {
    try {
        const { targetUserId } = req.params;
        await followUser(req.userId!, targetUserId);
        res.status(200).json({ message: "Followed successfully" });
    } catch (error) {
        res.status(500).json({ message: "Failed to follow user" });
    }
};

export const unfollow = async (req: AuthRequest, res: Response) => {
    try {
        const { targetUserId } = req.params;
        await unfollowUser(req.userId!, targetUserId);
        res.status(200).json({ message: "Unfollowed successfully" });
    } catch (error) {
        res.status(500).json({ message: "Failed to unfollow user" });
    }
};

export const followers = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const list = await getFollowers(id);
        res.status(200).json(list);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch followers" });
    }
};

export const following = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const list = await getFollowing(id);
        res.status(200).json(list);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch following" });
    }
};

export const block = async (req: AuthRequest, res: Response) => {
    try {
        const { targetUserId } = req.params;
        await blockUser(req.userId!, targetUserId);
        res.status(200).json({ message: "User blocked" });
    } catch (error) {
        res.status(500).json({ message: "Failed to block user" });
    }
};

export const unblock = async (req: AuthRequest, res: Response) => {
    try {
        const { targetUserId } = req.params;
        await unblockUser(req.userId!, targetUserId);
        res.status(200).json({ message: "User unblocked" });
    } catch (error) {
        res.status(500).json({ message: "Failed to unblock user" });
    }
};

export const search = async (req: Request, res: Response) => {
    try {
        const { query } = req.query;
        const users = await searchUsers(query as string);
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: "Search failed" });
    }
};
