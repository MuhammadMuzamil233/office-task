// Office Task Register — backend (MongoDB version)
// Handles: user accounts (register/login), and a shared task list
// visible to everyone, with overdue tasks carried forward as reminders.

require("dotenv").config();

const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const webpush = require("web-push");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const MONGODB_URI = process.env.DATABASE_URL || process.env.MONGODB_URI;
const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || "").toLowerCase().trim();
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

if (!JWT_SECRET || !MONGODB_URI) {
  console.error("Missing JWT_SECRET or DATABASE_URL/MONGODB_URI environment variable.");
  process.exit(1);
}

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// ---------- Database models ----------
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["user", "admin", "logistics"], default: "user" },
  isActive: { type: Boolean, default: true },
  lastActive: { type: Date, default: Date.now }
}, { timestamps: true });

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 500 },
  dateAdded: { type: String, required: true }, // stored as "YYYY-MM-DD" for simple day comparisons
  completed: { type: Boolean, default: false },
  completedAt: { type: Date, default: null },
  addedBy: { type: String, default: null },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  comments: [{
    text: { type: String, required: true, trim: true, maxlength: 1000 },
    addedBy: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

const demandSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  employeeName: { type: String, required: true, trim: true },
  date: { type: String, required: true },
  products: { type: mongoose.Schema.Types.Mixed, required: true },
  quantity: { type: mongoose.Schema.Types.Mixed, default: null },
  isUrgent: { type: Boolean, default: false },
  urgentNotified: { type: Boolean, default: false },
  status: { type: String, enum: ["pending", "approved", "rejected", "completed", "cancelled", "on_the_way"], default: "pending" },
  adminRemarks: { type: String, default: "", trim: true, maxlength: 2000 },
  submittedAt: { type: Date, default: Date.now }
}, { timestamps: true });

const demandHistorySchema = new mongoose.Schema({
  originalDemandId: { type: mongoose.Schema.Types.ObjectId, required: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  employeeName: { type: String, required: true, trim: true },
  date: { type: String, required: true },
  products: { type: mongoose.Schema.Types.Mixed, required: true },
  quantity: { type: mongoose.Schema.Types.Mixed, default: null },
  isUrgent: { type: Boolean, default: false },
  urgentNotified: { type: Boolean, default: false },
  status: { type: String, default: "completed" },
  adminRemarks: { type: String, default: "", trim: true, maxlength: 2000 },
  submittedAt: { type: Date, required: true },
  completedAt: { type: Date, default: Date.now }
}, { timestamps: true });

const adminRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  username: { type: String, required: true },
  name: { type: String, required: true },
  requestedRole: { type: String, enum: ["admin", "logistics"], default: "admin" },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" }
}, { timestamps: true });

const notificationSchema = new mongoose.Schema({
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  actorName: { type: String, required: true },
  message: { type: String, required: true, maxlength: 300 },
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: "Task", default: null },
  readAt: { type: Date, default: null }
}, { timestamps: true });

notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

const pushSubscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  endpoint: { type: String, required: true, unique: true },
  keys: { p256dh: { type: String, required: true }, auth: { type: String, required: true } }
}, { timestamps: true });

const User = mongoose.model("User", userSchema);
const Task = mongoose.model("Task", taskSchema);
const Demand = mongoose.model("Demand", demandSchema);
const DemandHistory = mongoose.model("DemandHistory", demandHistorySchema);
const AdminRequest = mongoose.model("AdminRequest", adminRequestSchema);
const Notification = mongoose.model("Notification", notificationSchema);
const PushSubscription = mongoose.model("PushSubscription", pushSubscriptionSchema);

const inventoryItemSchema = new mongoose.Schema({
  product: { type: String, default: "", trim: true },
  brand: { type: String, default: "", trim: true },
  model: { type: String, default: "", trim: true },
  quantity: { type: Number, default: 0 },
  extra: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

const inventoryConfigSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true }
}, { timestamps: true });

const stockTransactionSchema = new mongoose.Schema({
  type: { type: String, enum: ["in", "out"], required: true },
  date: { type: String, required: true },
  invoiceNo: { type: String, default: "", trim: true },
  sourceDestination: { type: String, default: "", trim: true },
  items: [{
    product: { type: String, default: "" },
    brand: { type: String, default: "" },
    model: { type: String, default: "" },
    quantity: { type: Number, default: 0 },
    unitPrice: { type: Number, default: null },
    remarks: { type: String, default: "" }
  }],
  createdBy: { type: String, default: "" }
}, { timestamps: true });

const InventoryItem = mongoose.model("InventoryItem", inventoryItemSchema);
const InventoryConfig = mongoose.model("InventoryConfig", inventoryConfigSchema);
const StockTransaction = mongoose.model("StockTransaction", stockTransactionSchema);

function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function taskToJson(t) {
  return {
    id: t._id.toString(),
    title: t.title,
    date_added: t.dateAdded,
    completed: t.completed,
    completed_at: t.completedAt,
    updated_at: t.updatedAt,
    added_by: t.addedBy,
    created_at: t.createdAt,
    comments: (t.comments || []).map(comment => ({
      id: comment._id.toString(),
      text: comment.text,
      added_by: comment.addedBy,
      created_at: comment.createdAt
    }))
  };
}

function mentionedUsernames(text) {
  return [...new Set((text.match(/@[a-zA-Z0-9_.-]{1,50}/g) || []).map(value => value.slice(1).toLowerCase()))];
}

async function notifyMentionedUsers(text, actor, task, messageType) {
  const usernames = mentionedUsernames(text).filter(username => username !== actor.username);
  if (!usernames.length) return;
  const users = await User.find({ username: { $in: usernames } }).select("_id username");
  if (!users.length) return;
  const message = `${actor.name} mentioned you in ${messageType}: ${task.title.slice(0, 120)}`;
  await Notification.insertMany(users.map(user => ({ recipientId: user._id, actorName: actor.name, message, taskId: task._id })));
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;
  const subscriptions = await PushSubscription.find({ userId: { $in: users.map(user => user._id) } });
  await Promise.all(subscriptions.map(async subscription => {
    try {
      await webpush.sendNotification(subscription.toObject(), JSON.stringify({ title: "You were mentioned", body: message, url: `/?task=${task._id}` }));
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) await PushSubscription.deleteOne({ _id: subscription._id });
    }
  }));
}

// ---------- Auth helpers ----------
function signToken(user) {
  return jwt.sign({ id: user._id.toString(), username: user.username, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: "30d" });
}

async function authMiddleware(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: "Not logged in" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    const dbUser = await User.findById(req.user.id).select("role isActive");
    if (!dbUser) return res.status(401).json({ error: "User no longer exists" });
    if (dbUser.isActive === false) {
      return res.status(403).json({ error: "Your account has been deactivated by administrator." });
    }
    req.user.role = dbUser.role;
    User.findByIdAndUpdate(req.user.id, { lastActive: new Date() }).exec().catch(() => {});
    next();
  } catch (e) {
    return res.status(401).json({ error: "Session expired, please log in again" });
  }
}

async function adminMiddleware(req, res, next) {
  try {
    const user = await User.findById(req.user.id).select("role");
    if (!user || user.role !== "admin") {
      return res.status(403).json({ error: "Admin authority required" });
    }
    next();
  } catch (e) {
    res.status(500).json({ error: "Could not verify admin access" });
  }
}

async function logisticsMiddleware(req, res, next) {
  try {
    const user = await User.findById(req.user.id).select("role");
    if (!user || (user.role !== "admin" && user.role !== "logistics")) {
      return res.status(403).json({ error: "Logistics access required" });
    }
    next();
  } catch (e) {
    res.status(500).json({ error: "Could not verify logistics access" });
  }
}

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 30 * 24 * 60 * 60 * 1000
};

let databaseConnection;
function connectDatabase() {
  if (!databaseConnection) {
    databaseConnection = mongoose.connect(MONGODB_URI);
  }
  return databaseConnection;
}

app.use(async (req, res, next) => {
  try {
    await connectDatabase();
    next();
  } catch (e) {
    console.error("Failed to connect to MongoDB:", e);
    res.status(503).json({ error: "Database is unavailable" });
  }
});

// ---------- Auth routes ----------
app.post("/api/register", async (req, res) => {
  try {
    const { username, password, name, requestAdmin, requestLogistics } = req.body;
    if (!username || !password || !name) {
      return res.status(400).json({ error: "Name, username and password are all required" });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: "Password must be at least 4 characters" });
    }
    const cleanUsername = username.toLowerCase().trim();
    const existing = await User.findOne({ username: cleanUsername });
    if (existing) {
      return res.status(409).json({ error: "That username is already taken" });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      username: cleanUsername,
      name: name.trim(),
      passwordHash,
      role: cleanUsername === ADMIN_USERNAME ? "admin" : "user"
    });
    const requestedRole = requestLogistics ? "logistics" : requestAdmin ? "admin" : null;
    if (requestedRole && user.role !== "admin") {
      await AdminRequest.create({ userId: user._id, username: user.username, name: user.name, requestedRole });
    }
    const token = signToken(user);
    res.cookie("token", token, COOKIE_OPTS);
    res.json({ id: user._id.toString(), username: user.username, name: user.name, role: user.role, approvalRequestPending: Boolean(requestedRole && user.role !== "admin"), requestedRole });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not create account, please try again" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }
    const user = await User.findOne({ username: username.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({ error: "Incorrect username or password" });
    }
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: "Incorrect username or password" });
    }
    if (user.isActive === false) {
      return res.status(403).json({ error: "Your account has been deactivated by administrator." });
    }
    if (user.username === ADMIN_USERNAME && user.role !== "admin") {
      user.role = "admin";
      await user.save();
    }
    const token = signToken(user);
    res.cookie("token", token, COOKIE_OPTS);
    res.json({ id: user._id.toString(), username: user.username, name: user.name, role: user.role });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not log in, please try again" });
  }
});

app.post("/api/logout", (req, res) => {
  res.clearCookie("token", COOKIE_OPTS);
  res.json({ ok: true });
});

app.get("/api/me", authMiddleware, (req, res) => {
  res.json({ id: req.user.id, username: req.user.username, name: req.user.name, role: req.user.role || "user" });
});

// Admin can reset any user's password
app.post("/api/admin/reset-password", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { username, newPassword } = req.body;
    if (!username || !newPassword || newPassword.length < 4) {
      return res.status(400).json({ error: "Username and new password (min 4 chars) are required" });
    }
    const user = await User.findOne({ username: username.toLowerCase().trim() });
    if (!user) return res.status(404).json({ error: "User not found" });
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ ok: true, message: `Password reset for ${user.username}` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not reset password" });
  }
});

// Emergency: Reset admin password using master key (no login needed)
// POST /api/master-reset  { masterKey: ADMIN_USERNAME, newPassword: "..." }
app.post("/api/master-reset", async (req, res) => {
  try {
    const { masterKey, newPassword } = req.body;
    if (!masterKey || !newPassword || newPassword.length < 4) {
      return res.status(400).json({ error: "Master key and new password (min 4 chars) are required" });
    }
    if (masterKey.toLowerCase().trim() !== ADMIN_USERNAME) {
      return res.status(403).json({ error: "Invalid master key" });
    }
    const admin = await User.findOne({ username: ADMIN_USERNAME });
    if (!admin) return res.status(404).json({ error: "Admin account not found" });
    admin.passwordHash = await bcrypt.hash(newPassword, 10);
    await admin.save();
    res.json({ ok: true, message: "Admin password has been reset. You can now log in." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not reset password" });
  }
});

app.get("/api/users", authMiddleware, async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user.id } }).select("username name").sort({ name: 1 });
    res.json(users.map(user => ({ username: user.username, name: user.name })));
  } catch (e) {
    res.status(500).json({ error: "Could not load users" });
  }
});

app.get("/api/notifications", authMiddleware, async (req, res) => {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await Notification.deleteMany({ createdAt: { $lt: cutoff } });
    const notifications = await Notification.find({ recipientId: req.user.id, createdAt: { $gte: cutoff } }).sort({ createdAt: -1 }).limit(30);
    res.json(notifications.map(notification => ({ id: notification._id.toString(), message: notification.message, task_id: notification.taskId ? notification.taskId.toString() : null, created_at: notification.createdAt, read_at: notification.readAt })));
  } catch (e) {
    res.status(500).json({ error: "Could not load notifications" });
  }
});

app.patch("/api/notifications/:id/read", authMiddleware, async (req, res) => {
  await Notification.findOneAndUpdate({ _id: req.params.id, recipientId: req.user.id }, { readAt: new Date() });
  res.json({ ok: true });
});

app.get("/api/push-config", authMiddleware, (req, res) => {
  res.json({ enabled: Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY), publicKey: VAPID_PUBLIC_KEY });
});

app.post("/api/push-subscriptions", authMiddleware, async (req, res) => {
  try {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) return res.status(400).json({ error: "Invalid push subscription" });
    await PushSubscription.findOneAndUpdate({ endpoint }, { userId: req.user.id, endpoint, keys }, { upsert: true, new: true, setDefaultsOnInsert: true });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Could not save notification subscription" });
  }
});

app.get("/api/admin-requests", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const requests = await AdminRequest.find({ status: "pending" }).sort({ createdAt: 1 });
    res.json(requests.map(request => ({
      id: request._id.toString(),
      username: request.username,
      name: request.name,
      requested_role: request.requestedRole,
      created_at: request.createdAt
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load admin requests" });
  }
});

app.patch("/api/admin-requests/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Request status must be approved or rejected" });
    }
    const request = await AdminRequest.findOneAndUpdate(
      { _id: req.params.id, status: "pending" },
      { status },
      { new: true }
    );
    if (!request) return res.status(404).json({ error: "Admin request not found" });
    if (status === "approved") {
      await User.findByIdAndUpdate(request.userId, { role: request.requestedRole || "admin" });
    }
    res.json({ ok: true, status: request.status });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not process admin request" });
  }
});

// ---------- Admin User Management routes ----------
app.get("/api/admin/users", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users.map(u => ({
      id: u._id.toString(),
      username: u.username,
      name: u.name,
      role: u.role || "user",
      isActive: u.isActive !== false,
      lastActive: u.lastActive || u.updatedAt || u.createdAt,
      createdAt: u.createdAt,
      isPrimaryAdmin: u.username.toLowerCase() === ADMIN_USERNAME
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load users" });
  }
});

app.patch("/api/admin/users/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { role, isActive } = req.body;
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) return res.status(404).json({ error: "User not found" });

    const isPrimaryAdmin = targetUser.username.toLowerCase() === ADMIN_USERNAME;

    if (isPrimaryAdmin) {
      if (role && role !== "admin") {
        return res.status(400).json({ error: "Cannot change role of primary admin" });
      }
      if (isActive === false) {
        return res.status(400).json({ error: "Cannot deactivate primary admin" });
      }
    }

    if (targetUser._id.toString() === req.user.id && isActive === false) {
      return res.status(400).json({ error: "You cannot deactivate your own account" });
    }

    if (role && ["user", "logistics", "admin"].includes(role)) {
      targetUser.role = role;
      if (role === "logistics") {
        await AdminRequest.updateMany(
          { userId: targetUser._id, requestedRole: "logistics" },
          { status: "approved" }
        );
      }
    }
    if (typeof isActive === "boolean") {
      targetUser.isActive = isActive;
    }

    await targetUser.save();
    res.json({
      id: targetUser._id.toString(),
      username: targetUser.username,
      name: targetUser.name,
      role: targetUser.role,
      isActive: targetUser.isActive !== false,
      lastActive: targetUser.lastActive || targetUser.updatedAt || targetUser.createdAt,
      createdAt: targetUser.createdAt,
      isPrimaryAdmin
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not update user access" });
  }
});

// ---------- Demand routes ----------
const demandWarehouses = ["FC Faizabad WH", "FC I10 WH"];

function demandToJson(demand) {
  const items = Array.isArray(demand.products)
    ? demand.products.map(item => ({
        name: item.name,
        quantity: item.quantity,
        pickedQuantity: Number.isInteger(item.pickedQuantity) ? item.pickedQuantity : null,
        warehouse: item.warehouse || "",
        invoiceNumber: item.invoiceNumber || "",
        status: item.status || demand.status,
        fromInventory: Boolean(item.fromInventory),
        inventoryItemId: item.inventoryItemId ? String(item.inventoryItemId) : "",
        inventoryModel: item.inventoryModel ? String(item.inventoryModel) : ""
      }))
    : [{ name: demand.products, quantity: demand.quantity || 1, pickedQuantity: null, warehouse: "", invoiceNumber: "", status: demand.status, fromInventory: false, inventoryItemId: "", inventoryModel: "" }];
  return {
    id: demand._id.toString(),
    employee_name: demand.employeeName,
    date: demand.date,
    products: items.map(item => `${item.name} (${item.quantity})`).join(", "),
    quantity: items.reduce((total, item) => total + item.quantity, 0),
    items,
    is_urgent: Boolean(demand.isUrgent),
    status: demand.status,
    admin_remarks: demand.adminRemarks,
    submitted_at: demand.submittedAt,
    updated_at: demand.updatedAt
  };
}

async function sortDemandsWithPriority(demands) {
  const adminUser = await User.findOne({ username: ADMIN_USERNAME });
  const adminId = adminUser ? adminUser._id.toString() : null;
  const urgentDemands = [];
  const nonAdmin = [];
  const adminDemands = [];
  for (const d of demands) {
    if (d.isUrgent) {
      urgentDemands.push(d);
    } else if (adminId && d.employeeId && d.employeeId.toString() === adminId) {
      adminDemands.push(d);
    } else {
      nonAdmin.push(d);
    }
  }
  return [...urgentDemands, ...nonAdmin, ...adminDemands];
}

app.get("/api/demands", authMiddleware, async (req, res) => {
  try {
    const demands = await Demand.find().sort({ submittedAt: 1 });
    const sorted = await sortDemandsWithPriority(demands);
    res.json(sorted.map(demandToJson));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load demands" });
  }
});

app.get("/api/admin/demands", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const demands = await Demand.find().sort({ submittedAt: 1 });
    const sorted = await sortDemandsWithPriority(demands);
    res.json(sorted.map(demandToJson));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load demands" });
  }
});

app.get("/api/admin/demands/history", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const demands = await DemandHistory.find().sort({ completedAt: -1 });
    res.json(demands.map(demandToJson));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load demand history" });
  }
});

app.post("/api/demands", authMiddleware, async (req, res) => {
  try {
    const { date, products, isUrgent } = req.body || {};
    const items = Array.isArray(products) ? products.map(item => ({
      name: String(item.name || "").trim().slice(0, 200),
      quantity: Number(item.quantity),
      warehouse: String(item.warehouse || "").trim(),
      invoiceNumber: String(item.invoiceNumber || "").trim().slice(0, 100),
      fromInventory: Boolean(item.fromInventory),
      inventoryItemId: item.inventoryItemId ? String(item.inventoryItemId).trim() : "",
      inventoryModel: item.inventoryModel ? String(item.inventoryModel).trim() : ""
    })) : [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !items.length || items.some(item => !item.name || !Number.isInteger(item.quantity) || item.quantity < 1 || !demandWarehouses.includes(item.warehouse))) {
      return res.status(400).json({ error: "Date, product, quantity, and a valid warehouse are required" });
    }
    const demand = await Demand.create({
      employeeId: req.user.id,
      employeeName: req.user.name,
      date,
      products: items,
      isUrgent: Boolean(isUrgent),
      urgentNotified: false
    });
    res.json(demandToJson(demand));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not add demand" });
  }
});

async function notifyLogisticsUrgentDemand(demand, actorName) {
  try {
    const logisticsUsers = await User.find({ role: "logistics", isActive: { $ne: false } }).select("_id");
    if (!logisticsUsers.length) return;
    const itemsSummary = Array.isArray(demand.products)
      ? demand.products.map(p => `${p.name} (${p.quantity})`).join(", ")
      : (demand.products || "Items");
    const msg = `🚨 URGENT DEMAND: ${demand.employeeName} - ${String(itemsSummary).slice(0, 100)}`;
    await Notification.insertMany(
      logisticsUsers.map(u => ({
        recipientId: u._id,
        actorName: actorName || "Admin",
        message: msg,
        taskId: null
      }))
    );
    if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
      const subscriptions = await PushSubscription.find({ userId: { $in: logisticsUsers.map(u => u._id) } });
      await Promise.all(subscriptions.map(async sub => {
        try {
          await webpush.sendNotification(sub.toObject(), JSON.stringify({
            title: "🚨 URGENT DEMAND",
            body: msg,
            url: "/logistics.html"
          }));
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) {
            await PushSubscription.deleteOne({ _id: sub._id });
          }
        }
      }));
    }
  } catch (notifyErr) {
    console.error("Logistics notification error:", notifyErr);
  }
}


function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function escapeRegex(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function findMatchingInventoryItem(item) {
  if (!item) return null;
  let invItem = null;
  if (item.inventoryItemId && mongoose.Types.ObjectId.isValid(item.inventoryItemId)) {
    invItem = await InventoryItem.findById(item.inventoryItemId);
  }
  const cleanModel = String(item.inventoryModel || "").trim();
  const cleanName = String(item.name || "").trim();

  if (!invItem && cleanModel) {
    invItem = await InventoryItem.findOne({
      model: { $regex: new RegExp("^" + escapeRegex(cleanModel) + "$", "i") }
    });
  }
  if (!invItem && cleanName) {
    // 1. Exact model match
    invItem = await InventoryItem.findOne({
      model: { $regex: new RegExp("^" + escapeRegex(cleanName) + "$", "i") }
    });
    // 2. Substring model or product match
    if (!invItem) {
      invItem = await InventoryItem.findOne({
        $or: [
          { model: { $regex: new RegExp(escapeRegex(cleanName), "i") } },
          { product: { $regex: new RegExp(escapeRegex(cleanName), "i") } }
        ]
      });
    }
    // 3. Search by individual words
    if (!invItem) {
      const words = cleanName.split(/\s+/).filter(w => w.length >= 3);
      for (const w of words) {
        invItem = await InventoryItem.findOne({
          model: { $regex: new RegExp("^" + escapeRegex(w) + "$", "i") }
        });
        if (invItem) break;
      }
    }
    // 4. Check if any existing inventory model is contained inside cleanName
    if (!invItem) {
      const allItems = await InventoryItem.find({ model: { $ne: "" } });
      for (const it of allItems) {
        const m = String(it.model || "").trim().toLowerCase();
        if (m && m.length >= 3 && cleanName.toLowerCase().includes(m)) {
          invItem = it;
          break;
        }
      }
    }
  }
  return invItem;
}

async function autoStockInInventoryItem(item, actorName) {
  if (!item) return;
  const addQty = Number.isInteger(item.pickedQuantity) && item.pickedQuantity > 0 ? item.pickedQuantity : Number(item.quantity) || 0;
  if (addQty <= 0) return;

  const invItem = await findMatchingInventoryItem(item);
  if (!invItem) {
    const modelName = item.inventoryModel || item.name || "Item";
    throw new Error("Model '" + modelName + "' inventory mein mojood nahi hai! Pehle inventory mein model add karein.");
  }

  invItem.quantity = (Number(invItem.quantity) || 0) + addQty;
  if (item.warehouse) {
    if (!invItem.extra) invItem.extra = {};
    invItem.extra.warehouseName = item.warehouse;
  }
  if (invItem.extra && invItem.extra.qty !== undefined) {
    delete invItem.extra.qty;
  }
  invItem.markModified("extra");
  await invItem.save();
  console.log("Auto stock-in updated qty for", invItem.model, "new qty:", invItem.quantity);

  // Create StockTransaction
  await StockTransaction.create({
    type: "in",
    date: todayStr(),
    invoiceNo: item.invoiceNumber || "",
    sourceDestination: item.warehouse || "Completed Demand Auto-Stock",
    items: [{
      product: invItem.product || item.name || "",
      brand: invItem.brand || "",
      model: invItem.model || item.inventoryModel || item.name || "",
      quantity: addQty,
      remarks: "Auto stock-in from completed demand (" + (actorName || "Admin") + ")"
    }],
    createdBy: actorName || "Admin"
  });
  console.log("Auto stock-in transaction created with warehouse:", item.warehouse || "Completed Demand Auto-Stock", "qty:", addQty);
}

app.patch("/api/admin/demands/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { date, products, quantity, status, adminRemarks, completeItemIndex, isUrgent } = req.body || {};
    if (Number.isInteger(completeItemIndex)) {
      const demand = await Demand.findById(req.params.id);
      if (!demand || !Array.isArray(demand.products)) return res.status(404).json({ error: "Demand item not found" });
      if (completeItemIndex < 0 || completeItemIndex >= demand.products.length) return res.status(400).json({ error: "Invalid demand item" });
      const completedItem = demand.products[completeItemIndex];

      // Check if model exists in inventory BEFORE completing
      const match = await findMatchingInventoryItem(completedItem);
      if (!match) {
        return res.status(400).json({
          error: "Model '" + (completedItem.inventoryModel || completedItem.name) + "' inventory mein mojood nahi hai! Pehle inventory mein model add karein."
        });
      }

      await DemandHistory.create({
        originalDemandId: demand._id,
        employeeId: demand.employeeId,
        employeeName: demand.employeeName,
        date: demand.date,
        products: [{ ...completedItem.toObject?.() || completedItem, status: "completed" }],
        quantity: completedItem.quantity,
        isUrgent: Boolean(demand.isUrgent),
        urgentNotified: Boolean(demand.urgentNotified),
        status: "completed",
        adminRemarks: demand.adminRemarks,
        submittedAt: demand.submittedAt,
        completedAt: new Date()
      });
      await autoStockInInventoryItem(completedItem, req.user.name);
      demand.products.splice(completeItemIndex, 1);
      if (!demand.products.length) {
        await Demand.deleteOne({ _id: demand._id });
        return res.json({ ok: true, archived: true, demandDeleted: true });
      }
      demand.markModified("products");
      await demand.save();
      return res.json(demandToJson(demand));
    }
    if (status === "completed") {
      const demand = await Demand.findById(req.params.id);
      if (!demand) return res.status(404).json({ error: "Demand not found" });

      const prods = Array.isArray(demand.products) && demand.products.length
        ? demand.products
        : [{ name: demand.products, quantity: demand.quantity, warehouse: "FC Faizabad WH" }];

      // Validate ALL models exist in inventory BEFORE completing
      const missing = [];
      for (const p of prods) {
        if (p) {
          const m = await findMatchingInventoryItem(p);
          if (!m) missing.push(p.inventoryModel || p.name || "Item");
        }
      }
      if (missing.length > 0) {
        return res.status(400).json({
          error: "Yeh model(s) inventory mein mojood nahi hain: " + missing.join(", ") + "! Pehle inventory mein model add karein."
        });
      }

      await DemandHistory.create({
        originalDemandId: demand._id,
        employeeId: demand.employeeId,
        employeeName: demand.employeeName,
        date: demand.date,
        products: demand.products,
        quantity: demand.quantity,
        isUrgent: Boolean(demand.isUrgent),
        urgentNotified: Boolean(demand.urgentNotified),
        status: "completed",
        adminRemarks: demand.adminRemarks,
        submittedAt: demand.submittedAt,
        completedAt: new Date()
      });
      for (const p of prods) {
        if (p) {
          await autoStockInInventoryItem(p, req.user.name);
        }
      }
      await Demand.deleteOne({ _id: demand._id });
      return res.json({ ok: true, archived: true });
    }
    if (status === "cancelled") {
      const deletedDemand = await Demand.findByIdAndDelete(req.params.id);
      if (!deletedDemand) return res.status(404).json({ error: "Demand not found" });
      return res.json({ ok: true, deleted: true });
    }
    const updates = {};
    if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) updates.date = date;
    if (Array.isArray(products) && products.length && products.every(item => item && String(item.name || "").trim() && Number.isInteger(Number(item.quantity)) && Number(item.quantity) >= 1 && demandWarehouses.includes(String(item.warehouse || "")))) {
      updates.products = products.map(item => ({
        name: String(item.name).trim().slice(0, 200),
        quantity: Number(item.quantity),
        pickedQuantity: Number.isInteger(Number(item.pickedQuantity)) ? Number(item.pickedQuantity) : null,
        warehouse: String(item.warehouse).trim(),
        invoiceNumber: String(item.invoiceNumber || "").trim().slice(0, 100),
        fromInventory: Boolean(item.fromInventory),
        inventoryItemId: item.inventoryItemId ? String(item.inventoryItemId).trim() : "",
        inventoryModel: item.inventoryModel ? String(item.inventoryModel).trim() : ""
      }));
      updates.quantity = null;
    } else if (typeof products === "string" && products.trim() && Number.isInteger(Number(quantity)) && Number(quantity) >= 1) {
      updates.products = [{ name: products.trim().slice(0, 200), quantity: Number(quantity) }];
      updates.quantity = null;
    }
    if (["pending", "approved", "rejected", "completed", "cancelled", "on_the_way"].includes(status)) updates.status = status;
    if (typeof adminRemarks === "string") updates.adminRemarks = adminRemarks.trim().slice(0, 2000);
    if (typeof isUrgent === "boolean") {
      updates.isUrgent = isUrgent;
      if (!isUrgent) updates.urgentNotified = false;
    }
    if (!Object.keys(updates).length) return res.status(400).json({ error: "A valid demand update is required" });
    const demand = await Demand.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!demand) return res.status(404).json({ error: "Demand not found" });

    // Logistics notification only after admin approval OR admin manually marking urgent
    const shouldNotify = (
      (isUrgent === true) ||
      (status === "approved" && demand.isUrgent)
    ) && !demand.urgentNotified;

    if (shouldNotify) {
      await notifyLogisticsUrgentDemand(demand, req.user.name);
      demand.urgentNotified = true;
      await demand.save();
    }

    res.json(demandToJson(demand));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not update demand" });
  }
});

app.get("/api/logistics/demands", authMiddleware, logisticsMiddleware, async (req, res) => {
  try {
    const demands = await Demand.find().sort({ submittedAt: 1 });
    const sorted = await sortDemandsWithPriority(demands);
    res.json(sorted.map(demandToJson));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load logistics demands" });
  }
});

app.patch("/api/logistics/demands/:id", authMiddleware, logisticsMiddleware, async (req, res) => {
  try {
    const { itemIndexes, status, pickedQuantity } = req.body || {};
    if (!Array.isArray(itemIndexes) || !itemIndexes.length || status !== "on_the_way" || itemIndexes.some(index => !Number.isInteger(index) || index < 0)) {
      return res.status(400).json({ error: "Select at least one item" });
    }
    const demand = await Demand.findById(req.params.id);
    if (!demand) return res.status(404).json({ error: "Demand not found" });
    if (!Array.isArray(demand.products)) return res.status(400).json({ error: "This demand has no selectable items" });
    const uniqueIndexes = [...new Set(itemIndexes)];
    if (uniqueIndexes.some(index => index >= demand.products.length)) {
      return res.status(400).json({ error: "Invalid demand item" });
    }
    const selectedItems = uniqueIndexes.map(index => demand.products[index]);
    const hasPickedQuantity = pickedQuantity !== undefined && pickedQuantity !== null && pickedQuantity !== "";
    const normalizedPickedQuantity = hasPickedQuantity ? Number(pickedQuantity) : null;
    if (hasPickedQuantity && (!Number.isInteger(normalizedPickedQuantity) || normalizedPickedQuantity < 0 || selectedItems.some(item => normalizedPickedQuantity > Number(item.quantity)))) {
      return res.status(400).json({ error: "Pickup quantity must be a whole number between 0 and the demanded quantity" });
    }
    demand.products = demand.products.map((item, index) => uniqueIndexes.includes(index) ? { ...item.toObject?.() || item, pickedQuantity: hasPickedQuantity ? normalizedPickedQuantity : Number(item.quantity), status } : item);
    demand.markModified("products");
    await demand.save();
    res.json(demandToJson(demand));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not update logistics status" });
  }
});

app.delete("/api/admin/demands/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const demand = await Demand.findByIdAndUpdate(req.params.id, { status: "cancelled" }, { new: true });
    if (!demand) return res.status(404).json({ error: "Demand not found" });
    res.json(demandToJson(demand));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not cancel demand" });
  }
});

// ---------- Task routes ----------
// Returns all incomplete tasks from before today (overdue reminders)
// plus incomplete tasks added today, for the whole office.
app.get("/api/tasks", authMiddleware, async (req, res) => {
  try {
    const today = todayStr();
    const tasks = await Task.find({
      $or: [
        { dateAdded: today, completed: false },
        { completed: false, dateAdded: { $lt: today } }
      ]
    }).sort({ dateAdded: 1, createdAt: 1 });
    res.json(tasks.map(taskToJson));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load tasks" });
  }
});

app.get("/api/tasks/history", authMiddleware, async (req, res) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
    const filter = { completed: true };
    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const searchPattern = new RegExp(escapedSearch, "i");
      filter.$or = [{ title: searchPattern }, { addedBy: searchPattern }];
    }
    const tasks = await Task.find(filter).sort({ updatedAt: -1, createdAt: -1 });
    res.json(tasks.map(taskToJson));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load task history" });
  }
});

app.post("/api/tasks", authMiddleware, async (req, res) => {
  try {
    const { title } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Task text is required" });
    }
    const task = await Task.create({
      title: title.trim().slice(0, 500),
      dateAdded: todayStr(),
      addedBy: req.user.name,
      userId: req.user.id
    });
    await notifyMentionedUsers(task.title, req.user, task, "a task");
    res.json(taskToJson(task));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not add task" });
  }
});

app.patch("/api/tasks/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { completed, title } = req.body;
    const updates = {};
    if (typeof completed === "boolean") {
      updates.completed = completed;
      updates.completedAt = completed ? new Date() : null;
    }
    if (typeof title === "string" && title.trim()) updates.title = title.trim().slice(0, 500);
    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: "A valid task update is required" });
    }
    const task = await Task.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true }
    );
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.json(taskToJson(task));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not update task" });
  }
});

app.post("/api/tasks/:id/comments", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Comment text is required" });
    }
    const task = await Task.findByIdAndUpdate(
      req.params.id,
      { $push: { comments: { text: text.trim().slice(0, 1000), addedBy: req.user.name, userId: req.user.id } } },
      { new: true }
    );
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.json(taskToJson(task));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not add comment" });
  }
});

app.delete("/api/tasks/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await Task.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not delete task" });
  }
});

// ---------- Inventory routes ----------
function inventoryItemToJson(item) {
  const extra = { ...(item.extra || {}) };
  delete extra.qty;
  delete extra.quantity;
  delete extra.product;
  delete extra.brand;
  delete extra.model;
  delete extra._id;
  delete extra.id;
  const q = Number(item.quantity !== undefined && item.quantity !== null ? item.quantity : (item.extra && item.extra.qty)) || 0;
  return {
    id: item._id.toString(),
    product: item.product || "",
    brand: item.brand || "",
    model: item.model || "",
    quantity: q,
    qty: q,
    ...extra
  };
}

// GET /api/inventory - Get all inventory rows & extra fields
app.get("/api/inventory", authMiddleware, async (req, res) => {
  try {
    const items = await InventoryItem.find().sort({ createdAt: -1 });
    const config = await InventoryConfig.findOne({ key: "extra_fields" });
    const extraFields = config && Array.isArray(config.value) ? config.value : [
      { key: "warehouseName", label: "Warehouse Name" },
      { key: "invoiceNumber", label: "Invoice Number" },
      { key: "entryTime", label: "Entry Time" }
    ];

    // Find active demands with items on the way from inventory
    const activeDemands = await Demand.find({
      $or: [
        { status: "on_the_way" },
        { "products.status": "on_the_way" }
      ]
    });

    const onTheWayMapById = {};
    const onTheWayMapByModel = {};

    activeDemands.forEach(d => {
      if (Array.isArray(d.products)) {
        d.products.forEach(p => {
          const itemStatus = p.status || d.status;
          if (p.fromInventory && itemStatus === "on_the_way") {
            const qty = Number.isInteger(p.pickedQuantity) && p.pickedQuantity > 0 ? p.pickedQuantity : (Number(p.quantity) || 0);
            if (p.inventoryItemId) {
              onTheWayMapById[p.inventoryItemId] = (onTheWayMapById[p.inventoryItemId] || 0) + qty;
            }
            const modelKey = String(p.inventoryModel || p.name || "").trim().toLowerCase();
            if (modelKey) {
              onTheWayMapByModel[modelKey] = (onTheWayMapByModel[modelKey] || 0) + qty;
            }
          }
        });
      }
    });

    const rows = items.map(it => {
      if ((!it.quantity || it.quantity === 0) && it.extra && Number(it.extra.qty) > 0) {
        it.quantity = Number(it.extra.qty);
      }
      const json = inventoryItemToJson(it);
      const mKey = String(json.model || "").trim().toLowerCase();
      json.onTheWayQty = onTheWayMapById[json.id] || onTheWayMapByModel[mKey] || 0;
      return json;
    });

    res.json({
      rows,
      extraFields
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load inventory" });
  }
});

// POST /api/inventory/save-all - Bulk replace/sync rows
app.post("/api/inventory/save-all", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows)) {
      return res.status(400).json({ error: "rows array is required" });
    }
    await InventoryItem.deleteMany({});
    const docs = rows.map(r => {
      const { id, _id, product, brand, model, quantity, qty, ...extra } = r;
      return {
        product: String(product || "").trim(),
        brand: String(brand || "").trim(),
        model: String(model || "").trim(),
        quantity: Number(quantity !== undefined ? quantity : (qty !== undefined ? qty : 0)) || 0,
        extra
      };
    });
    const created = docs.length ? await InventoryItem.insertMany(docs) : [];
    res.json({ ok: true, count: created.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not save inventory" });
  }
});

// POST /api/inventory/item - Add single row
app.post("/api/inventory/item", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { product, brand, model, quantity, ...extra } = req.body || {};
    const item = await InventoryItem.create({
      product: String(product || "").trim(),
      brand: String(brand || "").trim(),
      model: String(model || "").trim(),
      quantity: Number(quantity) || 0,
      extra
    });
    res.json(inventoryItemToJson(item));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not add inventory item" });
  }
});

// PATCH /api/inventory/item/:id - Update single item
app.patch("/api/inventory/item/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { product, brand, model, quantity, ...extra } = req.body || {};
    const item = await InventoryItem.findById(req.params.id);
    if (!item) return res.status(404).json({ error: "Item not found" });

    if (product !== undefined) item.product = String(product).trim();
    if (brand !== undefined) item.brand = String(brand).trim();
    if (model !== undefined) item.model = String(model).trim();
    if (quantity !== undefined) item.quantity = Number(quantity) || 0;
    if (Object.keys(extra).length) {
      item.extra = { ...(item.extra || {}), ...extra };
      item.markModified("extra");
    }
    await item.save();
    res.json(inventoryItemToJson(item));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not update inventory item" });
  }
});

// DELETE /api/inventory/item/:id - Delete single item
app.delete("/api/inventory/item/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await InventoryItem.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not delete inventory item" });
  }
});

// DELETE /api/inventory/clear-all - Clear inventory
app.delete("/api/inventory/clear-all", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await InventoryItem.deleteMany({});
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not clear inventory" });
  }
});

// GET /api/inventory/config/:key - Get config
app.get("/api/inventory/config/:key", authMiddleware, async (req, res) => {
  try {
    const config = await InventoryConfig.findOne({ key: req.params.key });
    res.json({ key: req.params.key, value: config ? config.value : null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load inventory config" });
  }
});

// POST /api/inventory/config/:key - Save config
app.post("/api/inventory/config/:key", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { value } = req.body;
    const config = await InventoryConfig.findOneAndUpdate(
      { key: req.params.key },
      { key: req.params.key, value },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ ok: true, key: config.key, value: config.value });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not save inventory config" });
  }
});

// GET /api/inventory/transactions - Stock In/Out transactions
app.get("/api/inventory/transactions", authMiddleware, async (req, res) => {
  try {
    const { type } = req.query;
    const filter = type ? { type } : {};
    const txs = await StockTransaction.find(filter).sort({ createdAt: -1 });
    res.json(txs.map(t => ({
      id: t._id.toString(),
      type: t.type,
      date: t.date,
      invoiceNo: t.invoiceNo,
      sourceDestination: t.sourceDestination,
      items: t.items,
      createdBy: t.createdBy,
      createdAt: t.createdAt
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load stock transactions" });
  }
});

// POST /api/inventory/transactions - Create transaction
app.post("/api/inventory/transactions", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { type, date, invoiceNo, sourceDestination, items } = req.body || {};
    if (!["in", "out"].includes(type) || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: "Valid type (in/out) and items are required" });
    }
    const tx = await StockTransaction.create({
      type,
      date: date || todayStr(),
      invoiceNo: String(invoiceNo || "").trim(),
      sourceDestination: String(sourceDestination || "").trim(),
      items: items.map(it => ({
        product: String(it.product || "").trim(),
        brand: String(it.brand || "").trim(),
        model: String(it.model || "").trim(),
        quantity: Number(it.quantity) || 0,
        unitPrice: it.unitPrice != null ? Number(it.unitPrice) : null,
        remarks: String(it.remarks || "").trim()
      })),
      createdBy: req.user.name
    });
    res.json({ ok: true, id: tx._id.toString() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not create transaction" });
  }
});

// DELETE /api/inventory/transactions/:id
app.delete("/api/inventory/transactions/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await StockTransaction.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not delete transaction" });
  }
});

// Fallback to the frontend for any other route
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

if (require.main === module) {
  connectDatabase()
    .then(() => {
      console.log("Connected to MongoDB.");
      app.listen(PORT, () => console.log(`Office Task Register running on port ${PORT}`));
    })
    .catch((e) => {
      console.error("Failed to connect to MongoDB:", e);
      process.exit(1);
    });
}

module.exports = app;
