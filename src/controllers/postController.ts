import { Request, Response } from "express";
import {
  advancedSearchPostsService,
  addPostToSavedCollectionService,
  archivePostService,
  bookmarkPostService,
  createSavedCollectionService,
  createDraftPostService,
  createPostService,
  deleteSavedCollectionService,
  deletePostService,
  getBookmarkedPostsService,
  getAllPostsService,
  getArchivedPostsService,
  getFollowingFeedService,
  getHiddenPostsService,
  getDraftPostsService,
  getPostByIdService,
  getPostsUnderReviewService,
  getRecentlyViewedPostsService,
  getRecommendedPostsService,
  getSavedCollectionPostsService,
  getSavedCollectionsService,
  getTrendingPostsService,
  hidePostService,
  likePostService,
  getPostLikesService,
  removeBookmarkService,
  removePostFromSavedCollectionService,
  pinPostService,
  publishDraftPostService,
  searchPostsService,
  TrendingPeriod,
  unlikePostService,
  unhidePostService,
  updateSavedCollectionService,
  updateDraftPostService,
  updatePostService,
  unpinPostService,
} from "../services/postService";

import mongoose from "mongoose";
import { AuthRequest } from "../middleware/authMiddleware";
import { logError } from "../utils/logger";
import { getPagination } from "../utils/pagination";
import { getActivityRequestContext, recordActivity } from "../services/activityService";
import { withModerationNotice } from "../utils/moderationResponse";
import { createNotification } from "../services/notificationService";

const getLimit = (value: unknown, defaultLimit = 20) => {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 50) : defaultLimit;
};

const isClientPostInputError = (message: string) =>
  message === "Image is required" ||
  message === "Image must be a data URI, base64 string, or image URL" ||
  message === "Image upload failed" ||
  message.startsWith("Draft is missing required fields");

export const createPost = async (req: AuthRequest, res: Response) => {
  try {
    const { title, content, image, category, tags, visibility } = req.body;

    if (!req.userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const post = await createPostService({
      title,
      content,
      image,
      category,
      tags,
      visibility,
      author: new mongoose.Types.ObjectId(req.userId),
    });
    await recordActivity({
      actorId: req.userId,
      type: "post_created",
      postId: post._id.toString(),
      ...getActivityRequestContext(req),
    });

    res.status(201).json(withModerationNotice(post));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create post";
    if (isClientPostInputError(message)) {
      res.status(400).json({ message });
      return;
    }
    logError("Failed to create post", error, {
      userId: req.userId,
    });
    res.status(500).json({ message: "Failed to create post" });
  }
};

export const createDraftPost = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const post = await createDraftPostService({
      title: req.body.title,
      content: req.body.content,
      image: req.body.image,
      category: req.body.category,
      tags: req.body.tags,
      visibility: req.body.visibility,
      author: new mongoose.Types.ObjectId(req.userId),
    });

    res.status(201).json(post);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create draft post";
    if (isClientPostInputError(message)) {
      res.status(400).json({ message });
      return;
    }
    logError("Failed to create draft post", error, { userId: req.userId });
    res.status(500).json({ message: "Failed to create draft post" });
  }
};

export const updateDraftPost = async (req: AuthRequest, res: Response) => {
  try {
    const post = await updateDraftPostService(req.params.id, req.userId!, req.body);
    if (!post) {
      res.status(404).json({ message: "Draft not found" });
      return;
    }

    res.status(200).json(post);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update draft post";
    if (isClientPostInputError(message)) {
      res.status(400).json({ message });
      return;
    }
    logError("Failed to update draft post", error, { postId: req.params.id, userId: req.userId });
    res.status(500).json({ message: "Failed to update draft post" });
  }
};

export const getDraftPosts = async (req: AuthRequest, res: Response) => {
  try {
    res.status(200).json(await getDraftPostsService(req.userId!, getPagination(req.query)));
  } catch (error) {
    logError("Failed to fetch draft posts", error, { userId: req.userId });
    res.status(500).json({ message: "Failed to fetch draft posts" });
  }
};

export const publishDraftPost = async (req: AuthRequest, res: Response) => {
  try {
    const post = await publishDraftPostService(req.params.id, req.userId!);
    if (!post) {
      res.status(404).json({ message: "Draft not found" });
      return;
    }

    await recordActivity({
      actorId: req.userId!,
      type: "post_created",
      postId: post._id.toString(),
      ...getActivityRequestContext(req),
    });

    res.status(200).json(withModerationNotice(post));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to publish draft";
    if (isClientPostInputError(message)) {
      res.status(400).json({ message });
      return;
    }

    logError("Failed to publish draft post", error, { postId: req.params.id, userId: req.userId });
    res.status(500).json({ message: "Failed to publish draft post" });
  }
};

export const getAllPosts = async (req: AuthRequest, res: Response) => {
  try {
    const posts = await getAllPostsService(getPagination(req.query), req.userId);

    res.json(posts);
  } catch (error) {
    logError("Failed to fetch posts", error);
    res.status(500).json({ message: "Failed to fetch posts" });
  }
};

export const searchPosts = async (req: AuthRequest, res: Response) => {
  const query = typeof req.query.query === "string" ? req.query.query.trim() : "";

  if (!query) {
    res.status(400).json({ message: "Provide query to search posts" });
    return;
  }

  try {
    const posts = await searchPostsService(query, req.userId);

    res.json(posts);
  } catch (error) {
    logError("Failed to search posts", error);
    res.status(500).json({ message: "Failed to search posts" });
  }
};

export const advancedSearchPosts = async (req: AuthRequest, res: Response) => {
  const category = typeof req.query.category === "string" ? req.query.category.trim() : undefined;
  const title = typeof req.query.title === "string" ? req.query.title.trim() : undefined;
  const content = typeof req.query.content === "string" ? req.query.content.trim() : undefined;
  const rawTags = typeof req.query.tags === "string" ? req.query.tags.split(",") : [];
  const tags = rawTags.map((tag) => tag.trim()).filter(Boolean);

  try {
    const posts = await advancedSearchPostsService(
      {
        category,
        title,
        content,
        tags,
      },
      req.userId
    );

    res.json(posts);
  } catch (error) {
    logError("Failed to run advanced post search", error);
    res.status(500).json({ message: "Failed to search posts" });
  }
};

export const getFollowingFeed = async (req: AuthRequest, res: Response) => {
  try {
    const posts = await getFollowingFeedService(req.userId!, getPagination(req.query));
    if (!posts) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.json(posts);
  } catch (error) {
    logError("Failed to fetch following feed", error, { userId: req.userId });
    res.status(500).json({ message: "Failed to fetch following feed" });
  }
};

export const getTrendingPosts = async (req: AuthRequest, res: Response) => {
  const rawPeriod = typeof req.query.period === "string" ? req.query.period : "week";
  const validPeriods: TrendingPeriod[] = ["day", "week", "month", "all"];

  if (!validPeriods.includes(rawPeriod as TrendingPeriod)) {
    res.status(400).json({ message: "Period must be day, week, month, or all" });
    return;
  }

  try {
    const posts = await getTrendingPostsService(
      rawPeriod as TrendingPeriod,
      getLimit(req.query.limit),
      req.userId
    );
    res.json(posts);
  } catch (error) {
    logError("Failed to fetch trending posts", error, { period: rawPeriod });
    res.status(500).json({ message: "Failed to fetch trending posts" });
  }
};

export const getRecommendedPosts = async (req: AuthRequest, res: Response) => {
  try {
    const posts = await getRecommendedPostsService(req.userId!, getLimit(req.query.limit));
    if (!posts) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.json(posts);
  } catch (error) {
    logError("Failed to fetch recommended posts", error, { userId: req.userId });
    res.status(500).json({ message: "Failed to fetch recommended posts" });
  }
};

export const bookmarkPost = async (req: AuthRequest, res: Response) => {
  try {
    const user = await bookmarkPostService(req.params.id, req.userId!);
    if (!user) {
      res.status(404).json({ message: "Post or user not found" });
      return;
    }

    res.status(200).json({ message: "Post bookmarked" });
  } catch (error) {
    logError("Failed to bookmark post", error, { postId: req.params.id, userId: req.userId });
    res.status(500).json({ message: "Failed to bookmark post" });
  }
};

export const removeBookmark = async (req: AuthRequest, res: Response) => {
  try {
    const user = await removeBookmarkService(req.params.id, req.userId!);
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.status(200).json({ message: "Bookmark removed" });
  } catch (error) {
    logError("Failed to remove bookmark", error, { postId: req.params.id, userId: req.userId });
    res.status(500).json({ message: "Failed to remove bookmark" });
  }
};

export const getBookmarkedPosts = async (req: AuthRequest, res: Response) => {
  try {
    const posts = await getBookmarkedPostsService(req.userId!);
    if (!posts) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.json(posts);
  } catch (error) {
    logError("Failed to fetch bookmarks", error, { userId: req.userId });
    res.status(500).json({ message: "Failed to fetch bookmarks" });
  }
};

const handleSavedCollectionError = (res: Response, error: unknown) => {
  const message = error instanceof Error ? error.message : "Failed to update saved collection";
  if (
    message === "Collection name is required" ||
    message === "Collection already exists" ||
    message === "Post not found"
  ) {
    res.status(400).json({ message });
    return true;
  }
  if (message === "Saved collection not found") {
    res.status(404).json({ message });
    return true;
  }

  return false;
};

export const createSavedCollection = async (req: AuthRequest, res: Response) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name : "";
    const collection = await createSavedCollectionService(req.userId!, name);
    if (!collection) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.status(201).json(collection);
  } catch (error) {
    if (handleSavedCollectionError(res, error)) return;
    logError("Failed to create saved collection", error, { userId: req.userId });
    res.status(500).json({ message: "Failed to create saved collection" });
  }
};

export const getSavedCollections = async (req: AuthRequest, res: Response) => {
  try {
    const collections = await getSavedCollectionsService(req.userId!, getPagination(req.query));
    if (!collections) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.status(200).json(collections);
  } catch (error) {
    logError("Failed to fetch saved collections", error, { userId: req.userId });
    res.status(500).json({ message: "Failed to fetch saved collections" });
  }
};

export const updateSavedCollection = async (req: AuthRequest, res: Response) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name : "";
    const collection = await updateSavedCollectionService(
      req.userId!,
      req.params.collectionId,
      name
    );
    if (!collection) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.status(200).json(collection);
  } catch (error) {
    if (handleSavedCollectionError(res, error)) return;
    logError("Failed to update saved collection", error, {
      userId: req.userId,
      collectionId: req.params.collectionId,
    });
    res.status(500).json({ message: "Failed to update saved collection" });
  }
};

export const deleteSavedCollection = async (req: AuthRequest, res: Response) => {
  try {
    const result = await deleteSavedCollectionService(req.userId!, req.params.collectionId);
    if (!result) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.status(200).json({ message: "Saved collection deleted" });
  } catch (error) {
    if (handleSavedCollectionError(res, error)) return;
    logError("Failed to delete saved collection", error, {
      userId: req.userId,
      collectionId: req.params.collectionId,
    });
    res.status(500).json({ message: "Failed to delete saved collection" });
  }
};

export const addPostToSavedCollection = async (req: AuthRequest, res: Response) => {
  try {
    const collection = await addPostToSavedCollectionService(
      req.userId!,
      req.params.collectionId,
      req.params.postId
    );
    if (!collection) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.status(200).json(collection);
  } catch (error) {
    if (handleSavedCollectionError(res, error)) return;
    logError("Failed to add post to saved collection", error, {
      userId: req.userId,
      collectionId: req.params.collectionId,
      postId: req.params.postId,
    });
    res.status(500).json({ message: "Failed to add post to saved collection" });
  }
};

export const removePostFromSavedCollection = async (req: AuthRequest, res: Response) => {
  try {
    const collection = await removePostFromSavedCollectionService(
      req.userId!,
      req.params.collectionId,
      req.params.postId
    );
    if (!collection) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.status(200).json(collection);
  } catch (error) {
    if (handleSavedCollectionError(res, error)) return;
    logError("Failed to remove post from saved collection", error, {
      userId: req.userId,
      collectionId: req.params.collectionId,
      postId: req.params.postId,
    });
    res.status(500).json({ message: "Failed to remove post from saved collection" });
  }
};

export const getSavedCollectionPosts = async (req: AuthRequest, res: Response) => {
  try {
    const posts = await getSavedCollectionPostsService(
      req.userId!,
      req.params.collectionId,
      getPagination(req.query)
    );
    if (!posts) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.status(200).json(posts);
  } catch (error) {
    if (handleSavedCollectionError(res, error)) return;
    logError("Failed to fetch saved collection posts", error, {
      userId: req.userId,
      collectionId: req.params.collectionId,
    });
    res.status(500).json({ message: "Failed to fetch saved collection posts" });
  }
};

export const getRecentlyViewedPosts = async (req: AuthRequest, res: Response) => {
  try {
    const posts = await getRecentlyViewedPostsService(req.userId!, getPagination(req.query));
    if (!posts) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.status(200).json(posts);
  } catch (error) {
    logError("Failed to fetch recently viewed posts", error, { userId: req.userId });
    res.status(500).json({ message: "Failed to fetch recently viewed posts" });
  }
};

export const getHiddenPosts = async (req: AuthRequest, res: Response) => {
  try {
    const posts = await getHiddenPostsService(req.userId!, getPagination(req.query));
    if (!posts) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.status(200).json(posts);
  } catch (error) {
    logError("Failed to fetch hidden posts", error, { userId: req.userId });
    res.status(500).json({ message: "Failed to fetch hidden posts" });
  }
};

export const getArchivedPosts = async (req: AuthRequest, res: Response) => {
  try {
    res.status(200).json(await getArchivedPostsService(req.userId!, getPagination(req.query)));
  } catch (error) {
    logError("Failed to fetch archived posts", error, { userId: req.userId });
    res.status(500).json({ message: "Failed to fetch archived posts" });
  }
};

export const getPostsUnderReview = async (req: AuthRequest, res: Response) => {
  try {
    const posts = await getPostsUnderReviewService(req.userId!, getPagination(req.query));
    res.status(200).json({
      ...posts,
      items: posts.items.map((post) => withModerationNotice(post)),
    });
  } catch (error) {
    logError("Failed to fetch posts under review", error, { userId: req.userId });
    res.status(500).json({ message: "Failed to fetch posts under review" });
  }
};

export const hidePost = async (req: AuthRequest, res: Response) => {
  try {
    const result = await hidePostService(req.params.id, req.userId!);
    if (!result) {
      res.status(404).json({ message: "Post or user not found" });
      return;
    }
    if (result.didHide) {
      await recordActivity({
        actorId: req.userId!,
        type: "post_hidden",
        postId: req.params.id,
        ...getActivityRequestContext(req),
      });
    }

    res.status(200).json({ message: "Post hidden" });
  } catch (error) {
    logError("Failed to hide post", error, { postId: req.params.id, userId: req.userId });
    res.status(500).json({ message: "Failed to hide post" });
  }
};

export const unhidePost = async (req: AuthRequest, res: Response) => {
  try {
    const result = await unhidePostService(req.params.id, req.userId!);
    if (!result) {
      res.status(404).json({ message: "User not found" });
      return;
    }
    if (result.didUnhide) {
      await recordActivity({
        actorId: req.userId!,
        type: "post_unhidden",
        postId: req.params.id,
        ...getActivityRequestContext(req),
      });
    }

    res.status(200).json({ message: "Post unhidden" });
  } catch (error) {
    logError("Failed to unhide post", error, { postId: req.params.id, userId: req.userId });
    res.status(500).json({ message: "Failed to unhide post" });
  }
};

export const archivePost = async (req: AuthRequest, res: Response) => {
  try {
    const post = await archivePostService(req.params.id, req.userId!, true);
    if (post === null) {
      res.status(404).json({ message: "Post not found" });
      return;
    }
    if (post === false) {
      res.status(403).json({ message: "Unauthorized" });
      return;
    }
    res.status(200).json({ message: "Post archived", post });
  } catch (error) {
    logError("Failed to archive post", error, { postId: req.params.id, userId: req.userId });
    res.status(500).json({ message: "Failed to archive post" });
  }
};

export const unarchivePost = async (req: AuthRequest, res: Response) => {
  try {
    const post = await archivePostService(req.params.id, req.userId!, false);
    if (post === null) {
      res.status(404).json({ message: "Post not found" });
      return;
    }
    if (post === false) {
      res.status(403).json({ message: "Unauthorized" });
      return;
    }
    res.status(200).json({ message: "Post unarchived", post });
  } catch (error) {
    logError("Failed to unarchive post", error, { postId: req.params.id, userId: req.userId });
    res.status(500).json({ message: "Failed to unarchive post" });
  }
};

export const pinPost = async (req: AuthRequest, res: Response) => {
  try {
    const post = await pinPostService(req.params.id, req.userId!);
    if (!post) {
      res.status(404).json({ message: "Post not found" });
      return;
    }

    res.status(200).json({ message: "Post pinned", post });
  } catch (error) {
    logError("Failed to pin post", error, { postId: req.params.id, userId: req.userId });
    res.status(500).json({ message: "Failed to pin post" });
  }
};

export const unpinPost = async (req: AuthRequest, res: Response) => {
  try {
    const post = await unpinPostService(req.params.id, req.userId!);
    if (!post) {
      res.status(404).json({ message: "Post not found" });
      return;
    }

    res.status(200).json({ message: "Post unpinned", post });
  } catch (error) {
    logError("Failed to unpin post", error, { postId: req.params.id, userId: req.userId });
    res.status(500).json({ message: "Failed to unpin post" });
  }
};

export const getPostById = async (req: AuthRequest, res: Response) => {
  try {
    const post = await getPostByIdService(req.params.id, req.userId);

    if (!post) {
      res.status(404).json({ message: "Post not found" });
      return;
    }

    res.json(withModerationNotice(post));
  } catch (error) {
    logError("Failed to fetch post", error, { postId: req.params.id });
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

    res.json(withModerationNotice(post));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update post";
    if (isClientPostInputError(message)) {
      res.status(400).json({ message });
      return;
    }
    logError("Failed to update post", error, { postId: req.params.id, userId: req.userId });
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
    logError("Failed to delete post", error, { postId: req.params.id, userId: req.userId });
    res.status(500).json({ message: "Failed to delete post" });
  }
};

export const likePost = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const result = await likePostService(id, userId!);
    if (!result) {
      res.status(404).json({ message: "Post not found" });
      return;
    }

    if (result.didLike) {
      await recordActivity({
        actorId: userId!,
        type: "post_liked",
        postId: id,
        ...getActivityRequestContext(req),
      });
      await createNotification({
        recipientId: result.post.author as mongoose.Types.ObjectId,
        actorId: userId!,
        type: "post_liked",
        postId: result.post._id as mongoose.Types.ObjectId,
        message: "Someone liked your post.",
      });
    }

    res.status(200).json(result.post);
  } catch (error) {
    logError("Failed to like post", error, { postId: req.params.id, userId: req.userId });
    res.status(500).json({ message: "Failed to like post" });
  }
};

export const getPostLikes = async (req: Request, res: Response) => {
  try {
    const likes = await getPostLikesService(req.params.id, getPagination(req.query));
    if (!likes) {
      res.status(404).json({ message: "Post not found" });
      return;
    }

    res.status(200).json(likes);
  } catch (error) {
    logError("Failed to fetch post likes", error, { postId: req.params.id });
    res.status(500).json({ message: "Failed to fetch post likes" });
  }
};

export const unlikePost = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const post = await unlikePostService(id, userId!);
    if (!post) {
      res.status(404).json({ message: "Post not found" });
      return;
    }

    res.status(200).json(post);
  } catch (error) {
    logError("Failed to unlike post", error, { postId: req.params.id, userId: req.userId });
    res.status(500).json({ message: "Failed to unlike post" });
  }
};
