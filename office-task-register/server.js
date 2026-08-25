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
  role: { type: String, enum: ["user", "admin", "logistics"], default: "user" }
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
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: "Task", required: true },
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

function authMiddleware(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: "Not logged in" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
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
    const approvedRequest = user && user.role === "logistics"
      ? await AdminRequest.findOne({ userId: user._id, requestedRole: "logistics", status: "approved" })
      : null;
    if (!user || (user.role !== "admin" && !approvedRequest)) {
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
    res.json(notifications.map(notification => ({ id: notification._id.toString(), message: notification.message, task_id: notification.taskId.toString(), created_at: notification.createdAt, read_at: notification.readAt })));
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

// ---------- Demand routes ----------
const demandWarehouses = ["FC Faizabad WH", "FC I10 WH"];

function demandToJson(demand) {
  const items = Array.isArray(demand.products)
  ? demand.products.map(item => ({ name: item.name, quantity: item.quantity, warehouse: item.warehouse || "", status: item.status || demand.status }))
    : [{ name: demand.products, quantity: demand.quantity || 1, warehouse: "" }];
  return {
    id: demand._id.toString(),
    employee_name: demand.employeeName,
    date: demand.date,
    products: items.map(item => `${item.name} (${item.quantity})`).join(", "),
    quantity: items.reduce((total, item) => total + item.quantity, 0),
    items,
    status: demand.status,
    admin_remarks: demand.adminRemarks,
    submitted_at: demand.submittedAt,
    updated_at: demand.updatedAt
  };
}

app.get("/api/demands", authMiddleware, async (req, res) => {
  try {
    const demands = await Demand.find().sort({ submittedAt: -1 });
    res.json(demands.map(demandToJson));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load demands" });
  }
});

app.get("/api/admin/demands", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const demands = await Demand.find().sort({ submittedAt: -1 });
    res.json(demands.map(demandToJson));
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
    const { date, products } = req.body || {};
    const items = Array.isArray(products) ? products.map(item => ({ name: String(item.name || "").trim().slice(0, 200), quantity: Number(item.quantity), warehouse: String(item.warehouse || "").trim() })) : [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !items.length || items.some(item => !item.name || !Number.isInteger(item.quantity) || item.quantity < 1 || !demandWarehouses.includes(item.warehouse))) {
      return res.status(400).json({ error: "Date, product, quantity, and a valid warehouse are required" });
    }
    const demand = await Demand.create({ employeeId: req.user.id, employeeName: req.user.name, date, products: items });
    res.json(demandToJson(demand));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not add demand" });
  }
});

app.patch("/api/admin/demands/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { date, products, quantity, status, adminRemarks } = req.body || {};
    if (status === "completed") {
      const demand = await Demand.findById(req.params.id);
      if (!demand) return res.status(404).json({ error: "Demand not found" });
      await DemandHistory.create({
        originalDemandId: demand._id,
        employeeId: demand.employeeId,
        employeeName: demand.employeeName,
        date: demand.date,
        products: demand.products,
        quantity: demand.quantity,
        status: "completed",
        adminRemarks: demand.adminRemarks,
        submittedAt: demand.submittedAt,
        completedAt: new Date()
      });
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
      updates.products = products.map(item => ({ name: String(item.name).trim().slice(0, 200), quantity: Number(item.quantity), warehouse: String(item.warehouse).trim() }));
      updates.quantity = null;
    } else if (typeof products === "string" && products.trim() && Number.isInteger(Number(quantity)) && Number(quantity) >= 1) {
      updates.products = [{ name: products.trim().slice(0, 200), quantity: Number(quantity) }];
      updates.quantity = null;
    }
    if (["pending", "approved", "rejected", "completed", "cancelled", "on_the_way"].includes(status)) updates.status = status;
    if (typeof adminRemarks === "string") updates.adminRemarks = adminRemarks.trim().slice(0, 2000);
    if (!Object.keys(updates).length) return res.status(400).json({ error: "A valid demand update is required" });
    const demand = await Demand.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!demand) return res.status(404).json({ error: "Demand not found" });
    res.json(demandToJson(demand));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not update demand" });
  }
});

app.get("/api/logistics/demands", authMiddleware, logisticsMiddleware, async (req, res) => {
  try {
    const demands = await Demand.find().sort({ submittedAt: -1 });
    res.json(demands.map(demandToJson));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load logistics demands" });
  }
});

app.patch("/api/logistics/demands/:id", authMiddleware, logisticsMiddleware, async (req, res) => {
  try {
    const { itemIndexes, status } = req.body || {};
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
    demand.products = demand.products.map((item, index) => uniqueIndexes.includes(index) ? { ...item.toObject?.() || item, status } : item);
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
