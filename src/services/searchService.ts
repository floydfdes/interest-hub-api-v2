import Post, { Visibility } from "../models/Post";
import User from "../models/User";
import { formatPostListResponse } from "../utils/postResponse";

const publiclyVisible = {
  visibility: "public" as Visibility,
  status: { $ne: "draft" as const },
  isArchived: { $ne: true },
  isModerationHidden: { $ne: true },
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getSavedPostIds = async (viewerId?: string) => {
  if (!viewerId) return [];

  const user = await User.findOne({ _id: viewerId, isDeleted: false }).select("savedPosts");
  return user?.savedPosts ?? [];
};

type SearchUser = {
  _id: unknown;
  name?: string;
  username?: string;
  profilePic?: string | null;
  bio?: string;
  interests?: string[];
  isPrivate?: boolean;
};

const formatSearchUser = (user: SearchUser) => {
  if (user.isPrivate) {
    return {
      _id: user._id,
      name: user.name,
      username: user.username,
      profilePic: user.profilePic || null,
      isPrivate: true,
    };
  }

  return {
    _id: user._id,
    name: user.name,
    username: user.username,
    profilePic: user.profilePic || null,
    bio: user.bio,
    interests: user.interests,
    isPrivate: false,
  };
};

export const globalSearchService = async (query: string, viewerId?: string, limit = 5) => {
  const trimmedQuery = query.trim();
  const normalizedQuery = trimmedQuery.replace(/^@+/, "");
  const terms = normalizedQuery
    .split(/[\s,]+/)
    .map((term) => term.replace(/^@+/, "").trim())
    .filter(Boolean)
    .slice(0, 5);
  const searchTerms = [...new Set([normalizedQuery, ...terms].filter(Boolean))];
  const regexes = searchTerms.map((term) => new RegExp(escapeRegExp(term), "i"));
  const tagRegex = new RegExp(`^${escapeRegExp(trimmedQuery.toLowerCase())}`, "i");

  const [users, posts, tags, savedPostIds] = await Promise.all([
    User.find({
      isDeleted: false,
      isBlocked: { $ne: true },
      $or: regexes.flatMap((searchRegex) => [
        { name: searchRegex },
        { username: searchRegex },
        { interests: searchRegex, isPrivate: { $ne: true } },
      ]),
    })
      .select("name username profilePic bio interests isPrivate")
      .limit(limit),
    Post.find({
      ...publiclyVisible,
      $or: regexes.flatMap((searchRegex) => [
        { title: searchRegex },
        { content: searchRegex },
        { category: searchRegex },
        { tags: searchRegex },
      ]),
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("author", "name profilePic"),
    Post.aggregate([
      { $match: { ...publiclyVisible, tags: tagRegex } },
      { $unwind: "$tags" },
      { $match: { tags: tagRegex } },
      {
        $group: {
          _id: "$tags",
          postsCount: { $sum: 1 },
          lastUsedAt: { $max: "$createdAt" },
        },
      },
      { $sort: { postsCount: -1, lastUsedAt: -1, _id: 1 } },
      { $limit: limit },
      { $project: { _id: 0, tag: "$_id", postsCount: 1 } },
    ]),
    getSavedPostIds(viewerId),
  ]);

  return {
    query: trimmedQuery,
    users: users.map((user) => formatSearchUser(user.toObject())),
    posts: formatPostListResponse(posts, viewerId, savedPostIds),
    tags,
  };
};
