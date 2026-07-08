import Post, { Visibility } from "../models/Post";
import User from "../models/User";
import { uploadImageToCloudinary } from "../utils/uploadImage";
import { paginatedResponse, PaginationParams } from "../utils/pagination";
import { formatPaginatedPostResponse, formatPostResponse } from "../utils/postResponse";
import { sendAccountDeactivatedEmail, sendAccountDeletedEmail } from "./emailService";

const includesUser = (ids: { equals: (id: string) => boolean }[] = [], userId?: string) =>
  Boolean(userId && ids.some((id) => id.equals(userId)));

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const canViewPrivateAccount = (
  user: {
    _id: { toString: () => string };
    isPrivate?: boolean;
    followers: { equals: (id: string) => boolean }[];
  },
  viewerId?: string
) => !user.isPrivate || user._id.toString() === viewerId || includesUser(user.followers, viewerId);

const getVisibleProfilePostVisibilities = (
  user: {
    _id: { toString: () => string };
    followers: { equals: (id: string) => boolean }[];
  },
  viewerId?: string
): Visibility[] => {
  if (user._id.toString() === viewerId) return ["public", "followersOnly", "private"];
  return includesUser(user.followers, viewerId) ? ["public", "followersOnly"] : ["public"];
};

const getMutualFollowersSummary = async (
  targetFollowerIds: { toString: () => string }[],
  targetUserId: { toString: () => string },
  viewerId?: string
) => {
  if (!viewerId || targetUserId.toString() === viewerId) {
    return { mutualFollowers: [], mutualFollowersCount: 0 };
  }

  const viewer = await User.findOne({ _id: viewerId, isDeleted: false }).select("following");
  if (!viewer) return { mutualFollowers: [], mutualFollowersCount: 0 };

  const targetFollowerIdSet = new Set(targetFollowerIds.map((id) => id.toString()));
  const mutualFollowerIds = (viewer.following ?? []).filter((id) =>
    targetFollowerIdSet.has(id.toString())
  );
  if (mutualFollowerIds.length === 0) {
    return { mutualFollowers: [], mutualFollowersCount: 0 };
  }

  const mutualFollowers = await User.find({
    _id: { $in: mutualFollowerIds.slice(0, 2) },
    isDeleted: false,
  }).select("name username profilePic");

  return {
    mutualFollowers,
    mutualFollowersCount: mutualFollowerIds.length,
  };
};

export const getProfileCompletion = (user: {
  name?: string;
  username?: string;
  bio?: string;
  profilePic?: string | null;
  interests?: string[];
}) => {
  const checks = [
    { field: "name", complete: Boolean(user.name?.trim()) },
    { field: "username", complete: Boolean(user.username?.trim()) },
    { field: "bio", complete: Boolean(user.bio?.trim()) },
    { field: "profilePic", complete: Boolean(user.profilePic) },
    { field: "interests", complete: (user.interests ?? []).length > 0 },
  ];
  const completedFields = checks.filter((check) => check.complete).map((check) => check.field);
  const missingFields = checks.filter((check) => !check.complete).map((check) => check.field);

  return {
    percentage: Math.round((completedFields.length / checks.length) * 100),
    completedFields,
    missingFields,
  };
};

export const getUserById = async (id: string, viewerId?: string) => {
  const user = await User.findOne({ _id: id, isDeleted: false }).select(
    "name username profilePic bio interests followers following followRequests isPrivate savedPosts"
  );
  if (!user) return null;

  const mutualFollowersSummary = await getMutualFollowersSummary(user.followers, user._id, viewerId);
  const isFollowing = includesUser(user.followers, viewerId);
  const hasRequestedFollow = includesUser(user.followRequests, viewerId);
  const isOwner = user._id.toString() === viewerId;
  const baseProfile = {
    _id: user._id,
    name: user.name,
    username: user.username,
    profilePic: user.profilePic || null,
    isPrivate: user.isPrivate,
    isFollowing,
    hasRequestedFollow,
    followersCount: user.followers.length,
    followingCount: user.following.length,
    ...mutualFollowersSummary,
    ...(isOwner && { profileCompletion: getProfileCompletion(user) }),
  };
  if (!canViewPrivateAccount(user, viewerId)) {
    return { ...baseProfile, canViewProfile: false };
  }

  const postVisibility = getVisibleProfilePostVisibilities(user, viewerId);
  const visibleProfilePostFilter = {
    author: user._id,
    status: { $ne: "draft" as const },
    visibility: { $in: postVisibility },
    isArchived: { $ne: true },
    isModerationHidden: { $ne: true },
  };
  const [postsCount, pinnedPost] = await Promise.all([
    Post.countDocuments(visibleProfilePostFilter),
    Post.findOne({ ...visibleProfilePostFilter, isPinned: true })
      .sort({ pinnedAt: -1 })
      .populate("author", "name profilePic"),
  ]);

  return {
    ...baseProfile,
    canViewProfile: true,
    postsCount,
    pinnedPost: pinnedPost
      ? formatPostResponse(pinnedPost, viewerId, viewerId ? user.savedPosts : [])
      : null,
    bio: user.bio,
    interests: user.interests,
  };
};

export const getUserPosts = async (
  userId: string,
  pagination: PaginationParams,
  viewerId?: string
) => {
  const user = await User.findOne({ _id: userId, isDeleted: false }).select(
    "followers isPrivate savedPosts"
  );
  if (!user) return null;
  if (!canViewPrivateAccount(user, viewerId)) return false;

  const visibility = getVisibleProfilePostVisibilities(user, viewerId);
  const filter = {
    author: user._id,
    status: { $ne: "draft" as const },
    visibility: { $in: visibility },
    isArchived: { $ne: true },
    isModerationHidden: { $ne: true },
  };
  const [posts, total] = await Promise.all([
    Post.find(filter)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate("author", "name profilePic"),
    Post.countDocuments(filter),
  ]);

  return formatPaginatedPostResponse(posts, total, pagination, viewerId, user.savedPosts);
};

export const updateUserProfile = async (
  userId: string,
  updates: Partial<{
    name: string;
    username: string;
    bio: string;
    interests: string[];
    profilePic: string;
    isPrivate: boolean;
  }>
) => {
  const user = await User.findOne({ _id: userId, isDeleted: false });
  if (!user) return null;

  const normalizedUsername =
    typeof updates.username === "string" ? updates.username.trim().toLowerCase() : undefined;
  if (normalizedUsername !== undefined) {
    if (!/^[a-z0-9_]{3,30}$/.test(normalizedUsername)) {
      throw new Error("Username can only contain letters, numbers, and underscores");
    }
    const existingUser = await User.findOne({
      username: normalizedUsername,
      _id: { $ne: user._id },
    }).select("_id");
    if (existingUser) throw new Error("Username already in use");
  }

  const allowedUpdates = {
    ...(typeof updates.name === "string" && { name: updates.name }),
    ...(normalizedUsername !== undefined && { username: normalizedUsername }),
    ...(typeof updates.bio === "string" && { bio: updates.bio }),
    ...(Array.isArray(updates.interests) && { interests: updates.interests }),
    ...(typeof updates.isPrivate === "boolean" && { isPrivate: updates.isPrivate }),
  };

  if (updates.profilePic) {
    const cloudinaryUrl = await uploadImageToCloudinary(updates.profilePic, "profile_pictures");
    Object.assign(allowedUpdates, { profilePic: cloudinaryUrl });
  }

  Object.assign(user, allowedUpdates);
  await user.save();

  return getUserById(userId, userId);
};

export const deleteUserAccount = async (userId: string) => {
  const user = await User.findOneAndUpdate(
    { _id: userId, isDeleted: false },
    { isDeleted: true, deletedAt: new Date() },
    { new: true }
  );
  if (user) await sendAccountDeletedEmail(user);
  return user;
};

export const deactivateUserAccount = async (userId: string) => {
  const user = await User.findOneAndUpdate(
    { _id: userId, isDeleted: false },
    { $set: { isDeactivated: true, deactivatedAt: new Date() } },
    { new: true }
  );
  if (user) await sendAccountDeactivatedEmail(user);
  return user;
};

export const followUser = async (userId: string, targetUserId: string) => {
  if (userId === targetUserId) throw new Error("Cannot follow yourself");

  const user = await User.findOne({ _id: userId, isDeleted: false });
  const target = await User.findOne({ _id: targetUserId, isDeleted: false });

  if (!user || !target) throw new Error("User not found");
  if (user._id.equals(target._id)) throw new Error("Cannot follow yourself");
  if (
    (user.blockedUsers ?? []).some((id) => id.equals(target._id)) ||
    (target.blockedUsers ?? []).some((id) => id.equals(user._id))
  ) {
    throw new Error("You cannot follow this user");
  }

  const isAlreadyFollowing = target.followers.some((id) => id.equals(user._id));
  if (isAlreadyFollowing) return "existing";

  if (target.isPrivate) {
    target.followRequests ??= [];
    const isAlreadyRequested = target.followRequests.some((id) => id.equals(user._id));
    if (!isAlreadyRequested) {
      target.followRequests.push(user._id);
      await target.save();
    }
    return "requested";
  }

  target.followers.push(user._id);
  await target.save();

  const isAlreadyInFollowing = user.following.some((id) => id.equals(target._id));

  if (!isAlreadyInFollowing) {
    user.following.push(target._id);
    await user.save();
  }

  return "followed";
};

export const unfollowUser = async (userId: string, targetUserId: string) => {
  const user = await User.findOne({ _id: userId, isDeleted: false });
  const target = await User.findOne({ _id: targetUserId, isDeleted: false });

  if (!user || !target) throw new Error("User not found");

  user.following = user.following.filter((id) => !id.equals(target._id));

  target.followers = target.followers.filter((id) => !id.equals(user._id));
  target.followRequests = (target.followRequests ?? []).filter((id) => !id.equals(user._id));

  await user.save();
  await target.save();

  return true;
};

export const getFollowers = async (
  userId: string,
  pagination: PaginationParams,
  viewerId?: string
) => {
  const user = await User.findOne({ _id: userId, isDeleted: false }).select("followers isPrivate");
  if (!user) return null;
  if (!canViewPrivateAccount(user, viewerId)) return false;

  const total = (user.followers ?? []).length;
  await user.populate({
    path: "followers",
    select: "name username profilePic",
    options: { skip: pagination.skip, limit: pagination.limit },
  });

  return paginatedResponse(user.followers, total, pagination);
};

export const getFollowing = async (
  userId: string,
  pagination: PaginationParams,
  viewerId?: string
) => {
  const user = await User.findOne({ _id: userId, isDeleted: false }).select(
    "following followers isPrivate"
  );
  if (!user) return null;
  if (!canViewPrivateAccount(user, viewerId)) return false;

  const total = (user.following ?? []).length;
  await user.populate({
    path: "following",
    select: "name username profilePic",
    options: { skip: pagination.skip, limit: pagination.limit },
  });

  return paginatedResponse(user.following, total, pagination);
};

export const getBlockedUsers = async (userId: string, pagination: PaginationParams) => {
  const user = await User.findOne({ _id: userId, isDeleted: false }).select("blockedUsers");
  if (!user) return null;

  const total = user.blockedUsers.length;
  await user.populate({
    path: "blockedUsers",
    select: "name username profilePic",
    options: { skip: pagination.skip, limit: pagination.limit },
  });

  return paginatedResponse(user.blockedUsers, total, pagination);
};

export const getMutedUsers = async (userId: string, pagination: PaginationParams) => {
  const user = await User.findOne({ _id: userId, isDeleted: false }).select("mutedUsers");
  if (!user) return null;

  const total = (user.mutedUsers ?? []).length;
  await user.populate({
    path: "mutedUsers",
    select: "name username profilePic",
    options: { skip: pagination.skip, limit: pagination.limit },
  });

  return paginatedResponse(user.mutedUsers, total, pagination);
};

export const getFollowRequests = async (userId: string, pagination: PaginationParams) => {
  const user = await User.findOne({ _id: userId, isDeleted: false }).select("followRequests");
  if (!user) return null;

  const total = (user.followRequests ?? []).length;
  await user.populate({
    path: "followRequests",
    select: "name username profilePic bio",
    options: { skip: pagination.skip, limit: pagination.limit },
  });
  return paginatedResponse(user.followRequests, total, pagination);
};

export const acceptFollowRequest = async (userId: string, requesterId: string) => {
  const user = await User.findOne({ _id: userId, isDeleted: false });
  const requester = await User.findOne({ _id: requesterId, isDeleted: false });
  if (!user || !requester) throw new Error("User not found");
  const hasRequest = (user.followRequests ?? []).some((id) => id.equals(requester._id));
  if (!hasRequest) throw new Error("Follow request not found");

  user.followRequests = user.followRequests.filter((id) => !id.equals(requester._id));
  if (!user.followers.some((id) => id.equals(requester._id))) user.followers.push(requester._id);
  if (!requester.following.some((id) => id.equals(user._id))) requester.following.push(user._id);
  await user.save();
  await requester.save();
  return true;
};

export const rejectFollowRequest = async (userId: string, requesterId: string) => {
  const user = await User.findOne({ _id: userId, isDeleted: false });
  if (!user) throw new Error("User not found");
  const hadRequest = (user.followRequests ?? []).some((id) => id.equals(requesterId));
  if (!hadRequest) throw new Error("Follow request not found");
  user.followRequests = user.followRequests.filter((id) => !id.equals(requesterId));
  await user.save();
  return true;
};

export const blockUser = async (userId: string, targetUserId: string) => {
  if (userId === targetUserId) throw new Error("Cannot block yourself");

  const user = await User.findOne({ _id: userId, isDeleted: false });
  const target = await User.findOne({ _id: targetUserId, isDeleted: false });
  if (!user || !target) throw new Error("User not found");
  if (user._id.equals(target._id)) throw new Error("Cannot block yourself");

  const isAlreadyBlocked = (user.blockedUsers ?? []).some((id) => id.equals(target._id));
  if (!isAlreadyBlocked) {
    user.blockedUsers ??= [];
    user.blockedUsers.push(target._id);
  }

  user.following = user.following.filter((id) => !id.equals(target._id));
  user.followers = user.followers.filter((id) => !id.equals(target._id));
  user.followRequests = (user.followRequests ?? []).filter((id) => !id.equals(target._id));
  target.following = target.following.filter((id) => !id.equals(user._id));
  target.followers = target.followers.filter((id) => !id.equals(user._id));
  target.followRequests = (target.followRequests ?? []).filter((id) => !id.equals(user._id));

  await user.save();
  await target.save();

  return !isAlreadyBlocked;
};

export const unblockUser = async (userId: string, targetUserId: string) => {
  if (userId === targetUserId) throw new Error("Cannot unblock yourself");

  const user = await User.findOne({ _id: userId, isDeleted: false });
  const target = await User.findOne({ _id: targetUserId, isDeleted: false });
  if (!user || !target) throw new Error("User not found");
  if (user._id.equals(target._id)) throw new Error("Cannot unblock yourself");

  const wasBlocked = (user.blockedUsers ?? []).some((id) => id.equals(target._id));
  user.blockedUsers = (user.blockedUsers ?? []).filter((id) => !id.equals(target._id));
  await user.save();

  return wasBlocked;
};

export const muteUser = async (userId: string, targetUserId: string) => {
  if (userId === targetUserId) throw new Error("Cannot mute yourself");

  const user = await User.findOne({ _id: userId, isDeleted: false });
  const target = await User.findOne({ _id: targetUserId, isDeleted: false });
  if (!user || !target) throw new Error("User not found");
  if (user._id.equals(target._id)) throw new Error("Cannot mute yourself");

  const isAlreadyMuted = (user.mutedUsers ?? []).some((id) => id.equals(target._id));
  if (!isAlreadyMuted) {
    user.mutedUsers ??= [];
    user.mutedUsers.push(target._id);
    await user.save();
  }

  return !isAlreadyMuted;
};

export const unmuteUser = async (userId: string, targetUserId: string) => {
  if (userId === targetUserId) throw new Error("Cannot unmute yourself");

  const user = await User.findOne({ _id: userId, isDeleted: false });
  const target = await User.findOne({ _id: targetUserId, isDeleted: false });
  if (!user || !target) throw new Error("User not found");
  if (user._id.equals(target._id)) throw new Error("Cannot unmute yourself");

  const wasMuted = (user.mutedUsers ?? []).some((id) => id.equals(target._id));
  if (wasMuted) {
    user.mutedUsers = user.mutedUsers.filter((id) => !id.equals(target._id));
    await user.save();
  }

  return wasMuted;
};

export const searchUsers = async (query: string) => {
  const normalizedQuery = query.trim().replace(/^@+/, "");
  const terms = query
    .trim()
    .replace(/^@+/, "")
    .split(/[\s,]+/)
    .map((term) => term.replace(/^@+/, "").trim())
    .filter(Boolean)
    .slice(0, 5);

  const searchTerms = [...new Set(terms.length > 1 ? terms : [normalizedQuery, ...terms].filter(Boolean))];
  const termFilters = searchTerms.map((term) => {
    const regex = new RegExp(escapeRegExp(term), "i");
    return {
      $or: [{ name: regex }, { username: regex }, { interests: regex }],
    };
  });

  const users = await User.find({
    isDeleted: false,
    ...(termFilters.length > 0 && { $and: termFilters }),
  })
    .select("name username profilePic bio interests following followers isPrivate createdAt")
    .limit(20);

  return users.map((user) =>
    user.isPrivate
      ? {
          _id: user._id,
          name: user.name,
          username: user.username,
          profilePic: user.profilePic || null,
          isPrivate: true,
        }
      : user
  );
};

export const getSuggestedUsers = async (userId: string, limit: number) => {
  const currentUser = await User.findOne({ _id: userId, isDeleted: false }).select(
    "following blockedUsers interests"
  );
  if (!currentUser) return null;

  const interests = currentUser.interests
    .map((interest) => interest.trim().toLowerCase())
    .filter(Boolean);

  return User.aggregate([
    {
      $match: {
        _id: {
          $nin: [currentUser._id, ...currentUser.following, ...(currentUser.blockedUsers ?? [])],
        },
        isDeleted: false,
        isBlocked: false,
        blockedUsers: { $nin: [currentUser._id] },
      },
    },
    {
      $addFields: {
        matchingInterests: {
          $size: {
            $setIntersection: [
              {
                $map: {
                  input: { $ifNull: ["$interests", []] },
                  as: "interest",
                  in: { $toLower: "$$interest" },
                },
              },
              interests,
            ],
          },
        },
        followersCount: { $size: { $ifNull: ["$followers", []] } },
        profilePic: { $cond: [{ $eq: ["$profilePic", ""] }, null, "$profilePic"] },
      },
    },
    { $group: { _id: "$_id", candidate: { $first: "$$ROOT" } } },
    { $replaceRoot: { newRoot: "$candidate" } },
    { $sort: { matchingInterests: -1, followersCount: -1, createdAt: -1, _id: -1 } },
    { $limit: limit },
    {
      $project: {
        name: 1,
        profilePic: 1,
        bio: { $cond: ["$isPrivate", "$$REMOVE", "$bio"] },
        interests: { $cond: ["$isPrivate", "$$REMOVE", "$interests"] },
        isPrivate: 1,
        followersCount: 1,
        matchingInterests: 1,
      },
    },
  ]);
};
