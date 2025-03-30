import mongoose, { Schema, Types } from "mongoose";

import User from "../models/User";
import bcrypt from "bcryptjs";

export const getUserById = async (id: string) => {
    const user = await User.findById(id).select("name profilePic bio interests followers following");
    if (!user) return null;

    return {
        _id: user._id,
        name: user.name,
        profilePic: user.profilePic,
        bio: user.bio,
        interests: user.interests,
        followersCount: user.followers.length,
        followingCount: user.following.length,
    };
};

export const updateUserProfile = async (
    userId: string,
    updates: Partial<{
        name: string;
        bio: string;
        interests: string[];
        profilePic: string;
    }>
) => {
    const user = await User.findByIdAndUpdate(
        userId,
        { $set: updates },
        { new: true, runValidators: true }
    ).select("-password");

    return user;
};

export const deleteUserAccount = async (userId: string) => {
    return await User.findByIdAndDelete(userId);
};

export const changeUserPassword = async (
    userId: string,
    currentPassword: string,
    newPassword: string
) => {
    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) throw new Error("Current password is incorrect");

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    return true;
};

export const followUser = async (userId: string, targetUserId: string) => {
    if (userId === targetUserId) throw new Error("Cannot follow yourself");

    const user = await User.findById(userId);
    const target = await User.findById(targetUserId);

    if (!user || !target) throw new Error("User not found");

    const isAlreadyFollowing = target.followers.some(
        (id) => (id as unknown as Types.ObjectId).equals(user._id)
    );

    if (!isAlreadyFollowing) {
        target.followers.push(user._id as unknown as Schema.Types.ObjectId);
        await target.save();
    }

    const isAlreadyInFollowing = user.following.some(
        (id) => (id as unknown as Types.ObjectId).equals(target._id)
    );

    if (!isAlreadyInFollowing) {
        user.following.push(target._id as unknown as Schema.Types.ObjectId);
        await user.save();
    }

    return true;
};


export const unfollowUser = async (userId: string, targetUserId: string) => {
    const user = await User.findById(userId);
    const target = await User.findById(targetUserId);

    if (!user || !target) throw new Error("User not found");

    user.following = user.following.filter(
        (id) => !(id as unknown as Types.ObjectId).equals(target._id)
    );

    target.followers = target.followers.filter(
        (id) => !(id as unknown as Types.ObjectId).equals(user._id)
    );

    await user.save();
    await target.save();

    return true;
};

export const getFollowers = async (userId: string) => {
    const user = await User.findById(userId).populate("followers", "name profilePic");
    return user?.followers || [];
};

export const getFollowing = async (userId: string) => {
    const user = await User.findById(userId).populate("following", "name profilePic");
    return user?.following || [];
};

export const blockUser = async (adminId: string, targetUserId: string) => {
    const admin = await User.findById(adminId);
    if (admin?.role !== "admin") throw new Error("Unauthorized");

    const user = await User.findById(targetUserId);
    if (!user) throw new Error("User not found");

    user.isBlocked = true;
    await user.save();

    return true;
};

export const unblockUser = async (adminId: string, targetUserId: string) => {
    const admin = await User.findById(adminId);
    if (admin?.role !== "admin") throw new Error("Unauthorized");

    const user = await User.findById(targetUserId);
    if (!user) throw new Error("User not found");

    user.isBlocked = false;
    await user.save();

    return true;
};

export const searchUsers = async (query: string) => {
    const regex = new RegExp(query, "i");
    const users = await User.find({
        $or: [{ name: regex }, { interests: regex }],
    }).select("name profilePic bio interests");

    return users;
};
