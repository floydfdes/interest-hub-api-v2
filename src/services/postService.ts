import mongoose from "mongoose";
import Comment from "../models/Comment";
import Post, { IPost, Visibility } from "../models/Post";
import User from "../models/User";

import { uploadImageToCloudinary } from "../utils/uploadImage";
import { paginatedResponse, PaginationParams } from "../utils/pagination";
import {
  formatPaginatedPostResponse,
  formatPostListResponse,
  formatPostResponse,
} from "../utils/postResponse";
import { mergeTagsWithContentHashtags } from "../utils/socialText";
import {
  analyzeContentModeration,
  createAutoModerationReport,
  dismissAutoModerationReport,
} from "./contentModerationService";
import { createNotification } from "./notificationService";
import { notifyMentionedUsers } from "./mentionService";
import { sendModerationHiddenEmail } from "./emailService";

type CreatePostData = Pick<IPost, "title" | "content" | "category" | "author"> & {
  image: string;
  tags?: string[];
  visibility?: Visibility;
};

type UpdatePostData = Partial<
  Pick<IPost, "title" | "content" | "category" | "tags" | "visibility">
> & {
  image?: string;
};

type DraftPostData = Partial<
  Pick<IPost, "title" | "content" | "category" | "tags" | "visibility">
> & {
  image?: string;
  author: mongoose.Types.ObjectId;
};

export interface AdvancedPostSearchFilters {
  category?: string;
  title?: string;
  content?: string;
  tags?: string[];
}

export type TrendingPeriod = "day" | "week" | "month" | "all";

type SavedCollection = {
  _id: mongoose.Types.ObjectId;
  name: string;
  posts?: mongoose.Types.ObjectId[];
  createdAt?: Date;
  updatedAt?: Date;
};

const normalizeTags = (tags: string[] = []): string[] =>
  [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 10);

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const publiclyVisible = {
  status: { $ne: "draft" as const },
  isArchived: { $ne: true },
  isModerationHidden: { $ne: true },
};

const getSavedPostIds = async (viewerId?: string) => {
  if (!viewerId) return [];

  const user = await User.findOne({ _id: viewerId, isDeleted: false }).select("savedPosts");
  return user?.savedPosts ?? [];
};

const formatSavedCollection = (collection: SavedCollection) => ({
  _id: collection._id,
  name: collection.name,
  postsCount: collection.posts?.length ?? 0,
  createdAt: collection.createdAt,
  updatedAt: collection.updatedAt,
});

const findSavedCollection = (collections: SavedCollection[] = [], collectionId: string) =>
  collections.find((collection) => collection._id.toString() === collectionId);

const trackRecentlyViewedPost = async (
  userId: string | undefined,
  postId: mongoose.Types.ObjectId,
  shouldTrack: boolean
) => {
  if (!userId || !shouldTrack) return;

  const viewedAt = new Date();
  await User.updateOne(
    { _id: userId, isDeleted: false },
    { $pull: { recentlyViewedPosts: { post: postId } } }
  );
  await User.updateOne(
    { _id: userId, isDeleted: false },
    {
      $push: {
        recentlyViewedPosts: {
          $each: [{ post: postId, viewedAt }],
          $position: 0,
          $slice: 50,
        },
      },
    }
  );
};

export const createPostService = async (postData: CreatePostData) => {
  if (!postData.image) throw new Error("Image is required");

  const moderation = analyzeContentModeration([postData.title, postData.content]);
  const cloudinaryUrl = await uploadImageToCloudinary(postData.image, "post_images");

  const post = await Post.create({
    title: postData.title,
    content: postData.content,
    category: postData.category,
    tags: mergeTagsWithContentHashtags(postData.tags, postData.content),
    visibility: postData.visibility,
    status: "published",
    author: postData.author,
    image: cloudinaryUrl,
    isModerationHidden: moderation.needsReview,
    needsReview: moderation.needsReview,
    moderationReasons: moderation.reasons,
  });

  if (moderation.needsReview) {
    await createAutoModerationReport({
      targetType: "post",
      targetId: post._id as mongoose.Types.ObjectId,
    });
    await createNotification({
      recipientId: post.author as mongoose.Types.ObjectId,
      type: "post_under_review",
      postId: post._id as mongoose.Types.ObjectId,
      message: "Your post is under review and hidden until moderation is complete.",
    });
    await sendModerationHiddenEmail(post.author.toString(), "post");
  } else {
    await notifyMentionedUsers({
      actorId: post.author.toString(),
      text: `${post.title} ${post.content}`,
      postId: post._id as mongoose.Types.ObjectId,
    });
  }

  return formatPostResponse(post, post.author.toString());
};

export const createDraftPostService = async (draftData: DraftPostData) => {
  const image = draftData.image
    ? await uploadImageToCloudinary(draftData.image, "post_images")
    : "";

  const post = await Post.create({
    title: draftData.title ?? "",
    content: draftData.content ?? "",
    category: draftData.category ?? "",
    tags: mergeTagsWithContentHashtags(draftData.tags, draftData.content),
    visibility: draftData.visibility ?? "public",
    author: draftData.author,
    image,
    status: "draft",
    isModerationHidden: false,
    needsReview: false,
    moderationReasons: [],
  });

  return formatPostResponse(post, draftData.author.toString());
};

export const updateDraftPostService = async (
  id: string,
  userId: string,
  updates: Omit<DraftPostData, "author">
) => {
  const post = await Post.findOne({ _id: id, author: userId, status: "draft" as const });
  if (!post) return null;

  if (updates.image) {
    updates.image = await uploadImageToCloudinary(updates.image, "post_images");
  }

  Object.assign(post, {
    ...(typeof updates.title === "string" && { title: updates.title }),
    ...(typeof updates.content === "string" && { content: updates.content }),
    ...(typeof updates.category === "string" && { category: updates.category }),
    ...((Array.isArray(updates.tags) || typeof updates.content === "string") && {
      tags: mergeTagsWithContentHashtags(
        Array.isArray(updates.tags) ? updates.tags : post.tags,
        typeof updates.content === "string" ? updates.content : post.content
      ),
    }),
    ...(updates.visibility && { visibility: updates.visibility }),
    ...(updates.image && { image: updates.image }),
    isEdited: true,
  });
  await post.save();

  return formatPostResponse(post, userId);
};

export const getDraftPostsService = async (userId: string, pagination: PaginationParams) => {
  const filter = { author: userId, status: "draft" as const, isArchived: { $ne: true } };
  const [posts, total] = await Promise.all([
    Post.find(filter)
      .sort({ updatedAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate("author", "name profilePic"),
    Post.countDocuments(filter),
  ]);

  return formatPaginatedPostResponse(posts, total, pagination, userId);
};

export const publishDraftPostService = async (id: string, userId: string) => {
  const post = await Post.findOne({ _id: id, author: userId, status: "draft" as const });
  if (!post) return null;

  const missingFields = [
    !post.title?.trim() && "title",
    !post.content?.trim() && "content",
    !post.category?.trim() && "category",
    !post.image?.trim() && "image",
  ].filter(Boolean);
  if (missingFields.length > 0) {
    throw new Error(`Draft is missing required fields: ${missingFields.join(", ")}`);
  }

  const moderation = analyzeContentModeration([post.title, post.content]);
  post.tags = mergeTagsWithContentHashtags(post.tags, post.content);
  post.status = "published";
  post.isModerationHidden = moderation.needsReview;
  post.needsReview = moderation.needsReview;
  post.moderationReasons = moderation.reasons;
  await post.save();

  if (moderation.needsReview) {
    await createAutoModerationReport({
      targetType: "post",
      targetId: post._id as mongoose.Types.ObjectId,
    });
    await createNotification({
      recipientId: post.author as mongoose.Types.ObjectId,
      type: "post_under_review",
      postId: post._id as mongoose.Types.ObjectId,
      message: "Your post is under review and hidden until moderation is complete.",
    });
    await sendModerationHiddenEmail(post.author.toString(), "post");
  } else {
    await notifyMentionedUsers({
      actorId: post.author.toString(),
      text: `${post.title} ${post.content}`,
      postId: post._id as mongoose.Types.ObjectId,
    });
  }

  return formatPostResponse(post, userId);
};

export const getAllPostsService = async (pagination: PaginationParams, viewerId?: string) => {
  const filter = { visibility: "public" as Visibility, ...publiclyVisible };
  const [posts, total, savedPostIds] = await Promise.all([
    Post.find(filter)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate("author", "name profilePic"),
    Post.countDocuments(filter),
    getSavedPostIds(viewerId),
  ]);

  return formatPaginatedPostResponse(posts, total, pagination, viewerId, savedPostIds);
};

export const searchPostsService = async (query: string, viewerId?: string) => {
  const filters: Record<string, unknown> = { visibility: "public", ...publiclyVisible };
  const trimmedQuery = query.trim();

  if (trimmedQuery) {
    const searchTerm = new RegExp(escapeRegExp(trimmedQuery), "i");
    filters.$or = [
      { title: searchTerm },
      { content: searchTerm },
      { category: searchTerm },
      { tags: searchTerm },
    ];
  }

  const [posts, savedPostIds] = await Promise.all([
    Post.find(filters).populate("author", "name profilePic"),
    getSavedPostIds(viewerId),
  ]);

  return formatPostListResponse(posts, viewerId, savedPostIds);
};

export const advancedSearchPostsService = async (
  { category, title, content, tags }: AdvancedPostSearchFilters,
  viewerId?: string
) => {
  const filters: Record<string, unknown> = { visibility: "public", ...publiclyVisible };
  const trimmedCategory = category?.trim();
  const trimmedTitle = title?.trim();
  const trimmedContent = content?.trim();

  if (trimmedCategory) {
    filters.category = new RegExp(escapeRegExp(trimmedCategory), "i");
  }

  if (trimmedTitle) {
    filters.title = new RegExp(escapeRegExp(trimmedTitle), "i");
  }

  if (trimmedContent) {
    filters.content = new RegExp(escapeRegExp(trimmedContent), "i");
  }

  const normalizedTags = normalizeTags(tags);
  if (normalizedTags.length > 0) {
    filters.tags = {
      $all: normalizedTags.map((tag) => new RegExp(escapeRegExp(tag), "i")),
    };
  }

  const [posts, savedPostIds] = await Promise.all([
    Post.find(filters).populate("author", "name profilePic"),
    getSavedPostIds(viewerId),
  ]);

  return formatPostListResponse(posts, viewerId, savedPostIds);
};

export const getFollowingFeedService = async (userId: string, pagination: PaginationParams) => {
  const user = await User.findOne({ _id: userId, isDeleted: false }).select(
    "following blockedUsers mutedUsers hiddenPosts savedPosts"
  );
  if (!user) return null;

  const filter = {
    _id: { $nin: user.hiddenPosts ?? [] },
    author: {
      $in: user.following,
      $nin: [...(user.blockedUsers ?? []), ...(user.mutedUsers ?? [])],
    },
    visibility: { $in: ["public", "followersOnly"] as Visibility[] },
    ...publiclyVisible,
  };
  const [posts, total] = await Promise.all([
    Post.find(filter)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate("author", "name profilePic"),
    Post.countDocuments(filter),
  ]);

  return formatPaginatedPostResponse(posts, total, pagination, userId, user.savedPosts);
};

const periodInMilliseconds: Record<Exclude<TrendingPeriod, "all">, number> = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

const authorLookupStages: mongoose.PipelineStage[] = [
  {
    $lookup: {
      from: "users",
      localField: "author",
      foreignField: "_id",
      as: "author",
    },
  },
  { $unwind: "$author" },
  {
    $set: {
      author: {
        _id: "$author._id",
        name: "$author.name",
        profilePic: {
          $cond: [{ $eq: ["$author.profilePic", ""] }, null, "$author.profilePic"],
        },
      },
    },
  },
];

export const getTrendingPostsService = async (
  period: TrendingPeriod,
  limit: number,
  viewerId?: string
) => {
  const match: Record<string, unknown> = { visibility: "public", ...publiclyVisible };

  if (period !== "all") {
    match.createdAt = { $gte: new Date(Date.now() - periodInMilliseconds[period]) };
  }

  const [posts, savedPostIds] = await Promise.all([
    Post.aggregate([
      { $match: match },
      {
        $addFields: {
          trendingScore: {
            $add: [
              { $multiply: [{ $size: { $ifNull: ["$likes", []] } }, 3] },
              { $multiply: [{ $size: { $ifNull: ["$comments", []] } }, 4] },
              { $multiply: [{ $ifNull: ["$viewCount", 0] }, 0.2] },
            ],
          },
        },
      },
      { $sort: { trendingScore: -1, createdAt: -1 } },
      { $limit: limit },
      ...authorLookupStages,
    ]),
    getSavedPostIds(viewerId),
  ]);

  return formatPostListResponse(posts, viewerId, savedPostIds);
};

export const getRecommendedPostsService = async (userId: string, limit: number) => {
  const user = await User.findOne({ _id: userId, isDeleted: false }).select(
    "following blockedUsers mutedUsers hiddenPosts interests savedPosts"
  );
  if (!user) return null;

  const interests = user.interests.map((interest) => interest.trim().toLowerCase()).filter(Boolean);
  const usersWhoBlockedViewer = await User.find({
    blockedUsers: user._id,
    isDeleted: false,
  }).select("_id");
  const excludedAuthors = [
    ...(user.blockedUsers ?? []),
    ...(user.mutedUsers ?? []),
    ...usersWhoBlockedViewer.map((blockedBy) => blockedBy._id),
  ];

  const posts = await Post.aggregate([
    {
      $match: {
        _id: { $nin: user.hiddenPosts ?? [] },
        visibility: "public",
        ...publiclyVisible,
        author: { $ne: user._id, $nin: excludedAuthors },
      },
    },
    {
      $addFields: {
        isFollowedAuthor: { $cond: [{ $in: ["$author", user.following] }, 1, 0] },
        matchesCategory: {
          $cond: [{ $in: [{ $toLower: "$category" }, interests] }, 1, 0],
        },
        matchingTags: {
          $size: {
            $setIntersection: [
              {
                $map: {
                  input: { $ifNull: ["$tags", []] },
                  as: "tag",
                  in: { $toLower: "$$tag" },
                },
              },
              interests,
            ],
          },
        },
        isRecent: {
          $cond: [{ $gte: ["$createdAt", new Date(Date.now() - periodInMilliseconds.week)] }, 1, 0],
        },
      },
    },
    {
      $addFields: {
        recommendationScore: {
          $add: [
            { $multiply: ["$isFollowedAuthor", 50] },
            { $multiply: ["$matchesCategory", 20] },
            { $multiply: ["$matchingTags", 12] },
            { $multiply: [{ $size: { $ifNull: ["$likes", []] } }, 2] },
            { $multiply: [{ $size: { $ifNull: ["$comments", []] } }, 3] },
            { $multiply: ["$isRecent", 10] },
          ],
        },
      },
    },
    { $sort: { recommendationScore: -1, createdAt: -1 } },
    { $limit: limit },
    ...authorLookupStages,
  ]);

  return formatPostListResponse(posts, userId, user.savedPosts);
};

export const bookmarkPostService = async (postId: string, userId: string) => {
  const post = await Post.findOne({
    _id: postId,
    visibility: "public",
    ...publiclyVisible,
  }).select("_id");
  if (!post) return null;

  return User.findOneAndUpdate(
    { _id: userId, isDeleted: false },
    { $addToSet: { savedPosts: post._id } },
    { new: true }
  );
};

export const removeBookmarkService = async (postId: string, userId: string) => {
  return User.findOneAndUpdate(
    { _id: userId, isDeleted: false },
    { $pull: { savedPosts: postId, "savedCollections.$[].posts": postId } },
    { new: true }
  );
};

export const getBookmarkedPostsService = async (userId: string) => {
  const user = await User.findOne({ _id: userId, isDeleted: false }).populate({
    path: "savedPosts",
    match: { visibility: "public", ...publiclyVisible },
    options: { sort: { createdAt: -1 } },
    populate: { path: "author", select: "name profilePic" },
  });

  if (!user) return null;

  return formatPostListResponse(user.savedPosts ?? [], userId, user.savedPosts ?? []);
};

export const createSavedCollectionService = async (userId: string, name: string) => {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Collection name is required");

  const user = await User.findOne({ _id: userId, isDeleted: false }).select("savedCollections");
  if (!user) return null;

  user.savedCollections ??= [];
  const collectionExists = user.savedCollections.some(
    (collection) => collection.name.toLowerCase() === trimmedName.toLowerCase()
  );
  if (collectionExists) throw new Error("Collection already exists");

  const now = new Date();
  const collection = {
    _id: new mongoose.Types.ObjectId(),
    name: trimmedName,
    posts: [],
    createdAt: now,
    updatedAt: now,
  };
  user.savedCollections.push(collection);
  await user.save();

  return formatSavedCollection(collection);
};

export const getSavedCollectionsService = async (userId: string, pagination: PaginationParams) => {
  const user = await User.findOne({ _id: userId, isDeleted: false }).select("savedCollections");
  if (!user) return null;

  const collections = (user.savedCollections ?? []).map(formatSavedCollection);
  return paginatedResponse(
    collections.slice(pagination.skip, pagination.skip + pagination.limit),
    collections.length,
    pagination
  );
};

export const updateSavedCollectionService = async (
  userId: string,
  collectionId: string,
  name: string
) => {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Collection name is required");

  const user = await User.findOne({ _id: userId, isDeleted: false }).select("savedCollections");
  if (!user) return null;

  const collection = findSavedCollection(user.savedCollections, collectionId);
  if (!collection) throw new Error("Saved collection not found");

  const duplicate = user.savedCollections.some(
    (existingCollection) =>
      existingCollection._id.toString() !== collectionId &&
      existingCollection.name.toLowerCase() === trimmedName.toLowerCase()
  );
  if (duplicate) throw new Error("Collection already exists");

  collection.name = trimmedName;
  collection.updatedAt = new Date();
  await user.save();

  return formatSavedCollection(collection);
};

export const deleteSavedCollectionService = async (userId: string, collectionId: string) => {
  const user = await User.findOne({ _id: userId, isDeleted: false }).select("savedCollections");
  if (!user) return null;

  const initialCount = user.savedCollections?.length ?? 0;
  user.savedCollections = (user.savedCollections ?? []).filter(
    (collection) => collection._id.toString() !== collectionId
  );
  if (user.savedCollections.length === initialCount) throw new Error("Saved collection not found");

  await user.save();
  return true;
};

export const addPostToSavedCollectionService = async (
  userId: string,
  collectionId: string,
  postId: string
) => {
  const [post, user] = await Promise.all([
    Post.findOne({ _id: postId, visibility: "public", ...publiclyVisible }).select("_id"),
    User.findOne({ _id: userId, isDeleted: false }).select("savedPosts savedCollections"),
  ]);
  if (!post) throw new Error("Post not found");
  if (!user) return null;

  const collection = findSavedCollection(user.savedCollections, collectionId);
  if (!collection) throw new Error("Saved collection not found");

  user.savedPosts ??= [];
  user.savedCollections ??= [];
  if (!user.savedPosts.some((savedPostId) => savedPostId.equals(post._id))) {
    user.savedPosts.push(post._id);
  }
  collection.posts ??= [];
  if (!collection.posts.some((savedPostId) => savedPostId.equals(post._id))) {
    collection.posts.push(post._id);
  }
  collection.updatedAt = new Date();
  await user.save();

  return formatSavedCollection(collection);
};

export const removePostFromSavedCollectionService = async (
  userId: string,
  collectionId: string,
  postId: string
) => {
  const user = await User.findOne({ _id: userId, isDeleted: false }).select("savedCollections");
  if (!user) return null;

  const collection = findSavedCollection(user.savedCollections, collectionId);
  if (!collection) throw new Error("Saved collection not found");

  collection.posts = (collection.posts ?? []).filter((savedPostId) => !savedPostId.equals(postId));
  collection.updatedAt = new Date();
  await user.save();

  return formatSavedCollection(collection);
};

export const getSavedCollectionPostsService = async (
  userId: string,
  collectionId: string,
  pagination: PaginationParams
) => {
  const user = await User.findOne({ _id: userId, isDeleted: false }).select(
    "savedPosts savedCollections"
  );
  if (!user) return null;

  const collection = findSavedCollection(user.savedCollections, collectionId);
  if (!collection) throw new Error("Saved collection not found");

  const postIds = collection.posts ?? [];
  const filter = { _id: { $in: postIds }, visibility: "public" as Visibility, ...publiclyVisible };
  const [posts, total] = await Promise.all([
    Post.find(filter)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate("author", "name profilePic"),
    Post.countDocuments(filter),
  ]);

  return formatPaginatedPostResponse(posts, total, pagination, userId, user.savedPosts);
};

export const hidePostService = async (postId: string, userId: string) => {
  const post = await Post.findOne({
    _id: postId,
    visibility: "public",
    ...publiclyVisible,
  }).select("_id");
  if (!post) return null;

  const user = await User.findOne({ _id: userId, isDeleted: false }).select(
    "hiddenPosts savedPosts"
  );
  if (!user) return null;

  const didHide = !(user.hiddenPosts ?? []).some((id) => id.equals(post._id));
  if (didHide) {
    user.hiddenPosts ??= [];
    user.hiddenPosts.push(post._id);
    await user.save();
  }

  return { didHide };
};

export const unhidePostService = async (postId: string, userId: string) => {
  const user = await User.findOne({ _id: userId, isDeleted: false }).select("hiddenPosts");
  if (!user) return null;

  const didUnhide = (user.hiddenPosts ?? []).some((id) => id.equals(postId));
  if (didUnhide) {
    user.hiddenPosts = user.hiddenPosts.filter((id) => !id.equals(postId));
    await user.save();
  }

  return { didUnhide };
};

export const getHiddenPostsService = async (userId: string, pagination: PaginationParams) => {
  const user = await User.findOne({ _id: userId, isDeleted: false }).select(
    "hiddenPosts savedPosts"
  );
  if (!user) return null;

  const filter = {
    _id: { $in: user.hiddenPosts ?? [] },
    visibility: "public" as Visibility,
    ...publiclyVisible,
  };
  const [posts, total] = await Promise.all([
    Post.find(filter)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate("author", "name profilePic"),
    Post.countDocuments(filter),
  ]);

  return formatPaginatedPostResponse(posts, total, pagination, userId, user.savedPosts);
};

export const getPostByIdService = async (id: string, viewerId?: string) => {
  const post = await Post.findOne({
    _id: id,
    isArchived: { $ne: true },
  }).populate("author", "name profilePic");

  if (!post) return null;

  const populatedAuthor = post.author as unknown as { _id?: mongoose.Types.ObjectId };
  const authorId = (populatedAuthor._id ?? post.author).toString();
  const isOwner = authorId === viewerId;
  if (post.status === "draft" && !isOwner) return null;
  if (post.isModerationHidden && !isOwner) return null;
  if (post.visibility === "private" && !isOwner) return null;
  if (post.visibility === "followersOnly" && !isOwner) {
    if (!viewerId) return null;
    const followsAuthor = await User.findOne({
      _id: authorId,
      followers: viewerId,
      isDeleted: false,
    }).select("_id");
    if (!followsAuthor) return null;
  }

  post.viewCount += 1;
  await post.save();
  await trackRecentlyViewedPost(
    viewerId,
    post._id as mongoose.Types.ObjectId,
    post.status !== "draft"
  );

  return formatPostResponse(post, viewerId, await getSavedPostIds(viewerId));
};

export const getRecentlyViewedPostsService = async (
  userId: string,
  pagination: PaginationParams
) => {
  const user = await User.findOne({ _id: userId, isDeleted: false }).select(
    "recentlyViewedPosts savedPosts following blockedUsers mutedUsers hiddenPosts"
  );
  if (!user) return null;

  const viewedPostIds = (user.recentlyViewedPosts ?? []).map((item) => item.post).filter(Boolean);
  if (viewedPostIds.length === 0) {
    return paginatedResponse([], 0, pagination);
  }

  const filter = {
    _id: { $in: viewedPostIds, $nin: user.hiddenPosts ?? [] },
    author: { $nin: [...(user.blockedUsers ?? []), ...(user.mutedUsers ?? [])] },
    ...publiclyVisible,
    $or: [
      { visibility: "public" as Visibility },
      { author: user._id },
      { visibility: "followersOnly" as Visibility, author: { $in: user.following ?? [] } },
    ],
  };
  const posts = await Post.find(filter).populate("author", "name profilePic");
  const postById = new Map(posts.map((post) => [(post._id as mongoose.Types.ObjectId).toString(), post]));
  const orderedPosts = viewedPostIds
    .map((postId) => postById.get(postId.toString()))
    .filter(Boolean);
  const paginatedPosts = orderedPosts.slice(pagination.skip, pagination.skip + pagination.limit);

  return formatPaginatedPostResponse(
    paginatedPosts,
    orderedPosts.length,
    pagination,
    userId,
    user.savedPosts
  );
};

export const getArchivedPostsService = async (userId: string, pagination: PaginationParams) => {
  const filter = {
    author: userId,
    isArchived: true,
    isModerationHidden: { $ne: true },
  };
  const [posts, total] = await Promise.all([
    Post.find(filter)
      .sort({ archivedAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate("author", "name profilePic"),
    Post.countDocuments(filter),
  ]);
  return formatPaginatedPostResponse(posts, total, pagination, userId);
};

export const getPostsUnderReviewService = async (userId: string, pagination: PaginationParams) => {
  const filter = {
    author: userId,
    needsReview: true,
    isModerationHidden: true,
  };
  const [posts, total] = await Promise.all([
    Post.find(filter)
      .sort({ updatedAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate("author", "name profilePic"),
    Post.countDocuments(filter),
  ]);

  return formatPaginatedPostResponse(posts, total, pagination, userId);
};

export const archivePostService = async (id: string, userId: string, archive: boolean) => {
  const post = await Post.findById(id);
  if (!post) return null;
  if (post.author.toString() !== userId) return false;

  post.isArchived = archive;
  post.archivedAt = archive ? new Date() : null;
  if (archive) {
    post.isPinned = false;
    post.pinnedAt = null;
  }
  await post.save();
  return formatPostResponse(post, userId);
};

export const pinPostService = async (id: string, userId: string) => {
  const post = await Post.findOne({
    _id: id,
    author: userId,
    status: { $ne: "draft" as const },
    isArchived: { $ne: true },
    isModerationHidden: { $ne: true },
  });
  if (!post) return null;

  await Post.updateMany(
    { author: userId, isPinned: true, _id: { $ne: post._id } },
    { $set: { isPinned: false, pinnedAt: null } }
  );

  post.isPinned = true;
  post.pinnedAt = new Date();
  await post.save();

  return formatPostResponse(post, userId, await getSavedPostIds(userId));
};

export const unpinPostService = async (id: string, userId: string) => {
  const post = await Post.findOne({
    _id: id,
    author: userId,
  });
  if (!post) return null;

  post.isPinned = false;
  post.pinnedAt = null;
  await post.save();

  return formatPostResponse(post, userId, await getSavedPostIds(userId));
};

export const updatePostService = async (id: string, userId: string, updates: UpdatePostData) => {
  const post = await Post.findById(id);
  if (!post) return null;
  if (post.author.toString() !== userId) return false;
  const previousText = `${post.title} ${post.content}`;

  if (updates.image) {
    const cloudinaryUrl = await uploadImageToCloudinary(updates.image, "post_images");
    updates.image = cloudinaryUrl;
  }

  const allowedUpdates: UpdatePostData = {
    ...(typeof updates.title === "string" && { title: updates.title }),
    ...(typeof updates.content === "string" && { content: updates.content }),
    ...(typeof updates.category === "string" && { category: updates.category }),
    ...((Array.isArray(updates.tags) || typeof updates.content === "string") && {
      tags: mergeTagsWithContentHashtags(
        Array.isArray(updates.tags) ? updates.tags : post.tags,
        typeof updates.content === "string" ? updates.content : post.content
      ),
    }),
    ...(updates.visibility && { visibility: updates.visibility }),
    ...(updates.image && { image: updates.image }),
  };

  const moderation = analyzeContentModeration([
    typeof updates.title === "string" ? updates.title : post.title,
    typeof updates.content === "string" ? updates.content : post.content,
  ]);

  Object.assign(post, allowedUpdates, { isEdited: true });
  if (moderation.needsReview) {
    post.isModerationHidden = true;
    post.needsReview = true;
    post.moderationReasons = [
      ...new Set([...(post.moderationReasons ?? []), ...moderation.reasons]),
    ];
  } else {
    post.moderationReasons = (post.moderationReasons ?? []).filter(
      (reason) => reason !== "bad_language"
    );
    post.needsReview = post.moderationReasons.length > 0;
    if (!post.needsReview) {
      post.isModerationHidden = false;
    }
  }
  await post.save();
  if (moderation.needsReview) {
    await createAutoModerationReport({
      targetType: "post",
      targetId: post._id as mongoose.Types.ObjectId,
    });
    await createNotification({
      recipientId: post.author as mongoose.Types.ObjectId,
      type: "post_under_review",
      postId: post._id as mongoose.Types.ObjectId,
      message: "Your post edit is under review and hidden until moderation is complete.",
    });
    await sendModerationHiddenEmail(post.author.toString(), "post");
  } else {
    await dismissAutoModerationReport({
      targetType: "post",
      targetId: post._id as mongoose.Types.ObjectId,
    });
    await notifyMentionedUsers({
      actorId: userId,
      text: `${post.title} ${post.content}`,
      previousText,
      postId: post._id as mongoose.Types.ObjectId,
    });
  }

  return formatPostResponse(post, userId);
};

export const deletePostService = async (id: string, userId: string) => {
  const post = await Post.findById(id);
  if (!post) return null;
  if (post.author.toString() !== userId) return false;

  await post.deleteOne();
  await Comment.deleteMany({ post: id });
  await User.updateMany(
    {},
    {
      $pull: {
        hiddenPosts: post._id,
        savedPosts: post._id,
        "savedCollections.$[].posts": post._id,
        recentlyViewedPosts: { post: post._id },
      },
    }
  );
  return true;
};

export const likePostService = async (postId: string, userId: string) => {
  const savedPostIds = await getSavedPostIds(userId);
  const post = await Post.findOneAndUpdate(
    { _id: postId, likes: { $ne: userId }, ...publiclyVisible },
    { $addToSet: { likes: userId } },
    { new: true }
  );
  if (post) return { post: formatPostResponse(post, userId, savedPostIds), didLike: true };

  const existingPost = await Post.findById(postId);
  return existingPost
    ? { post: formatPostResponse(existingPost, userId, savedPostIds), didLike: false }
    : null;
};

export const getPostLikesService = async (postId: string, pagination: PaginationParams) => {
  const post = await Post.findOne({
    _id: postId,
    visibility: "public",
    ...publiclyVisible,
  }).select("likes");
  if (!post) return null;

  const total = post.likes.length;
  await post.populate({
    path: "likes",
    select: "name profilePic",
    options: { skip: pagination.skip, limit: pagination.limit },
  });

  return paginatedResponse(post.likes, total, pagination);
};

export const unlikePostService = async (postId: string, userId: string) => {
  const post = await Post.findByIdAndUpdate(postId, { $pull: { likes: userId } }, { new: true });
  return post ? formatPostResponse(post, userId, await getSavedPostIds(userId)) : null;
};
