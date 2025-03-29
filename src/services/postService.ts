import "../models/Comment";

import Post, { IPost } from "../models/Post";

export const createPostService = async (postData: Partial<IPost>) => {
    return await Post.create(postData);
};

export const getAllPostsService = async () => {
    return await Post.find()
        .populate("author", "name profilePic")
};

export const getPostByIdService = async (id: string) => {
    console.log(id);
    const post = await Post.findById(id)
        .populate("author", "name profilePic")
        .populate({
            path: "comments",
            populate: {
                path: "user",
                select: "name profilePic"
            }
        });

    if (post) {
        post.viewCount += 1;
        await post.save();
    }

    return post;
};

export const updatePostService = async (id: string, userId: string, updates: Partial<IPost>) => {
    const post = await Post.findById(id);
    if (!post) return null;
    if (post.author.toString() !== userId) return false;

    Object.assign(post, updates, { isEdited: true });
    await post.save();
    return post;
};

export const deletePostService = async (id: string, userId: string) => {
    const post = await Post.findById(id);
    if (!post) return null;
    if (post.author.toString() !== userId) return false;

    await post.deleteOne();
    return true;
};
