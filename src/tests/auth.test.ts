import request from "supertest";
import app from "../index";
import User from "../models/User";

const API = "/api/auth";

const testUser = {
    name: "Test User",
    email: "testuser@interesthub.io",
    password: "securePass123"
};

let accessToken = "";
let refreshToken = "";
let resetToken = "";

beforeAll(async () => {
    await User.deleteOne({ email: testUser.email });
});

describe("Auth API", () => {
    it("should register a new user", async () => {
        const res = await request(app).post(`${API}/register`).send(testUser);

        expect(res.statusCode).toBe(201);
        expect(res.body.user.email).toBe(testUser.email);
        expect(res.body.token).toBeDefined();
    });

    it("should log in the user", async () => {
        const res = await request(app)
            .post(`${API}/login`)
            .send({ email: testUser.email, password: testUser.password });

        expect(res.statusCode).toBe(200);
        expect(res.body.user.email).toBe(testUser.email);
        expect(res.body.token).toBeDefined();

        accessToken = res.body.token;
        refreshToken = res.headers["set-cookie"]?.[0]?.split(";")[0]?.split("=")[1];
        expect(refreshToken).toBeDefined();
    });

    it("should fail login with wrong password", async () => {
        const res = await request(app)
            .post(`${API}/login`)
            .send({ email: testUser.email, password: "wrongpass" });

        expect(res.statusCode).toBe(401);
    });

    it("should refresh access token using refresh token", async () => {
        const res = await request(app)
            .post(`${API}/refresh-token`)
            .set("Cookie", [`refreshToken=${refreshToken}`]);

        expect(res.statusCode).toBe(200);
        expect(res.body.token).toBeDefined();
    });

    it("should logout user and clear refresh token", async () => {
        const res = await request(app).post(`${API}/logout`)
            .set("Cookie", [`refreshToken=${refreshToken}`]);;
        expect(res.statusCode).toBe(200);
        expect(res.body.message).toMatch(/success/i);
    });

    it("should change password with valid token", async () => {
        const res = await request(app)
            .patch(`${API}/change-password`)
            .set("Authorization", `Bearer ${accessToken}`)
            .send({
                currentPassword: testUser.password,
                newPassword: "newPass123"
            });

        expect(res.statusCode).toBe(200);
        expect(res.body.message).toMatch(/success/i);

        // Update test user password for further testing
        testUser.password = "newPass123";
    });

    it("should send reset password link (mocked)", async () => {
        const res = await request(app)
            .post(`${API}/forgot-password`)
            .send({ email: testUser.email });

        expect(res.statusCode).toBe(200);
        expect(res.body.message).toMatch(/sent/i);

        const user = await User.findOne({ email: testUser.email });
        expect(user?.resetToken).toBeDefined();

        resetToken = user!.resetToken!;
    });

    it("should reset password with valid reset token", async () => {
        const res = await request(app)
            .post(`${API}/reset-password`)
            .send({ token: resetToken, newPassword: "finalPass123" });

        expect(res.statusCode).toBe(200);
        expect(res.body.message).toMatch(/reset/i);

        // Update for possible later logins
        testUser.password = "finalPass123";
    });
});
