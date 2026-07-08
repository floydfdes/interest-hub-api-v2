import mongoose from "mongoose";

const mockNotificationCreate = jest.fn();
const mockNotificationCountDocuments = jest.fn();
const mockNotificationDeleteMany = jest.fn();
const mockNotificationFindOneAndDelete = jest.fn();
const mockNotificationFindOneAndUpdate = jest.fn();
const mockNotificationUpdateMany = jest.fn();
const mockPopulateTargetUser = jest.fn();
const mockPopulateComment = jest.fn();
const mockPopulatePost = jest.fn(() => ({ populate: mockPopulateComment }));
mockPopulateComment.mockReturnValue({ populate: mockPopulateTargetUser });
const mockPopulateActor = jest.fn(() => ({ populate: mockPopulatePost }));
const mockLimit = jest.fn(() => ({ populate: mockPopulateActor }));
const mockSkip = jest.fn(() => ({ limit: mockLimit }));
const mockSort = jest.fn(() => ({ skip: mockSkip }));
const mockNotificationFind = jest.fn(() => ({ sort: mockSort }));
const mockUserSelect = jest.fn();
const mockUserFindOne = jest.fn(() => ({ select: mockUserSelect }));
const mockUserFindOneAndUpdate = jest.fn(() => ({ select: mockUserSelect }));

jest.mock("../models/Notification", () => ({
  __esModule: true,
  default: {
    create: mockNotificationCreate,
    countDocuments: mockNotificationCountDocuments,
    deleteMany: mockNotificationDeleteMany,
    find: mockNotificationFind,
    findOneAndDelete: mockNotificationFindOneAndDelete,
    findOneAndUpdate: mockNotificationFindOneAndUpdate,
    updateMany: mockNotificationUpdateMany,
  },
}));

jest.mock("../models/User", () => ({
  __esModule: true,
  default: {
    findOne: mockUserFindOne,
    findOneAndUpdate: mockUserFindOneAndUpdate,
  },
}));

import {
  clearAllNotificationsService,
  clearReadNotificationsService,
  createNotification,
  deleteNotificationService,
  getNotificationsService,
  getNotificationPreferencesService,
  getUnreadNotificationCountService,
  markAllNotificationsUnreadService,
  markAllNotificationsReadService,
  markNotificationReadService,
  markNotificationUnreadService,
  updateNotificationPreferencesService,
} from "../services/notificationService";

describe("notificationService", () => {
  const recipientId = new mongoose.Types.ObjectId("507f1f77bcf86cd799439011");
  const actorId = new mongoose.Types.ObjectId("507f1f77bcf86cd799439012");
  const postId = new mongoose.Types.ObjectId("507f1f77bcf86cd799439013");

  beforeEach(() => {
    jest.clearAllMocks();
    mockPopulateTargetUser.mockResolvedValue([]);
    mockNotificationCountDocuments.mockResolvedValue(2);
    mockUserSelect.mockResolvedValue({
      notificationPreferences: {
        likes: true,
        comments: true,
        replies: true,
        follows: true,
        followRequests: true,
        mentions: true,
        shares: true,
        moderation: true,
      },
    });
  });

  it("creates a notification for another user", async () => {
    const notification = { _id: new mongoose.Types.ObjectId() };
    mockNotificationCreate.mockResolvedValueOnce(notification);
    mockUserSelect
      .mockResolvedValueOnce({
        notificationPreferences: {
          likes: true,
        },
      })
      .mockResolvedValueOnce({ name: "John Doe", username: "john" });

    await expect(
      createNotification({
        recipientId,
        actorId,
        postId,
        type: "post_liked",
        message: "Someone liked your post.",
      })
    ).resolves.toBe(notification);

    expect(mockNotificationCreate).toHaveBeenCalledWith({
      recipient: recipientId,
      actor: actorId,
      type: "post_liked",
      post: postId,
      message: "John Doe liked your post.",
    });
  });

  it("does not create self notifications", async () => {
    await expect(
      createNotification({
        recipientId,
        actorId: recipientId,
        type: "post_liked",
        message: "Someone liked your post.",
      })
    ).resolves.toBeNull();

    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });

  it("does not create notifications disabled by user preferences", async () => {
    mockUserSelect.mockResolvedValueOnce({
      notificationPreferences: {
        likes: false,
      },
    });

    await expect(
      createNotification({
        recipientId,
        actorId,
        type: "post_liked",
        message: "Someone liked your post.",
      })
    ).resolves.toBeNull();

    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });

  it("gets and updates notification preferences", async () => {
    const preferences = {
      likes: true,
      comments: false,
      replies: true,
      follows: true,
      followRequests: true,
      mentions: true,
      shares: false,
      moderation: true,
    };
    mockUserSelect.mockResolvedValueOnce({ notificationPreferences: preferences });
    await expect(getNotificationPreferencesService(recipientId.toString())).resolves.toEqual(
      preferences
    );

    mockUserSelect.mockResolvedValueOnce({ notificationPreferences: preferences });
    await expect(
      updateNotificationPreferencesService(recipientId.toString(), {
        comments: false,
        shares: false,
        unknown: false,
      })
    ).resolves.toEqual(preferences);

    expect(mockUserFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: recipientId.toString(), isDeleted: false },
      {
        $set: {
          "notificationPreferences.comments": false,
          "notificationPreferences.shares": false,
        },
      },
      { new: true }
    );
  });

  it("returns paginated notifications for a user", async () => {
    const result = await getNotificationsService(recipientId.toString(), {
      page: 1,
      limit: 20,
      skip: 0,
    });

    expect(mockNotificationFind).toHaveBeenCalledWith({ recipient: recipientId.toString() });
    expect(mockSort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(mockPopulateActor).toHaveBeenCalledWith("actor", "name username profilePic");
    expect(mockPopulatePost).toHaveBeenCalledWith("post", "title image");
    expect(mockPopulateComment).toHaveBeenCalledWith("comment", "content");
    expect(mockPopulateTargetUser).toHaveBeenCalledWith(
      "targetUser",
      "name username profilePic isPrivate"
    );
    expect(result.pagination.total).toBe(2);
  });

  it("returns unread notification count", async () => {
    await expect(getUnreadNotificationCountService(recipientId.toString())).resolves.toEqual({
      unreadCount: 2,
    });
    expect(mockNotificationCountDocuments).toHaveBeenCalledWith({
      recipient: recipientId.toString(),
      isRead: false,
    });
  });

  it("marks one notification read for the owner", async () => {
    await markNotificationReadService(recipientId.toString(), "notification-id");

    expect(mockNotificationFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: "notification-id", recipient: recipientId.toString() },
      { $set: { isRead: true, readAt: expect.any(Date) } },
      { new: true }
    );
  });

  it("marks one notification unread for the owner", async () => {
    await markNotificationUnreadService(recipientId.toString(), "notification-id");

    expect(mockNotificationFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: "notification-id", recipient: recipientId.toString() },
      { $set: { isRead: false }, $unset: { readAt: "" } },
      { new: true }
    );
  });

  it("marks all unread notifications read", async () => {
    mockNotificationUpdateMany.mockResolvedValueOnce({ modifiedCount: 3 });

    await expect(markAllNotificationsReadService(recipientId.toString())).resolves.toEqual({
      updated: 3,
    });
    expect(mockNotificationUpdateMany).toHaveBeenCalledWith(
      { recipient: recipientId.toString(), isRead: false },
      { $set: { isRead: true, readAt: expect.any(Date) } }
    );
  });

  it("marks all read notifications unread", async () => {
    mockNotificationUpdateMany.mockResolvedValueOnce({ modifiedCount: 4 });

    await expect(markAllNotificationsUnreadService(recipientId.toString())).resolves.toEqual({
      updated: 4,
    });
    expect(mockNotificationUpdateMany).toHaveBeenCalledWith(
      { recipient: recipientId.toString(), isRead: true },
      { $set: { isRead: false }, $unset: { readAt: "" } }
    );
  });

  it("deletes one notification for the owner", async () => {
    await deleteNotificationService(recipientId.toString(), "notification-id");

    expect(mockNotificationFindOneAndDelete).toHaveBeenCalledWith({
      _id: "notification-id",
      recipient: recipientId.toString(),
    });
  });

  it("clears read notifications for the owner", async () => {
    mockNotificationDeleteMany.mockResolvedValueOnce({ deletedCount: 5 });

    await expect(clearReadNotificationsService(recipientId.toString())).resolves.toEqual({
      deleted: 5,
    });
    expect(mockNotificationDeleteMany).toHaveBeenCalledWith({
      recipient: recipientId.toString(),
      isRead: true,
    });
  });

  it("clears all notifications for the owner", async () => {
    mockNotificationDeleteMany.mockResolvedValueOnce({ deletedCount: 7 });

    await expect(clearAllNotificationsService(recipientId.toString())).resolves.toEqual({
      deleted: 7,
    });
    expect(mockNotificationDeleteMany).toHaveBeenCalledWith({
      recipient: recipientId.toString(),
    });
  });
});
