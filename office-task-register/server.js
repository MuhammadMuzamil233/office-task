// Office Task Register — backend (MongoDB version)
// Handles: user accounts (register/login), and a shared task list
// visible to everyone, with overdue tasks carried forward as reminders.

const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const MONGODB_URI = process.env.DATABASE_URL || process.env.MONGODB_URI;

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
  passwordHash: { type: String, required: true }
}, { timestamps: true });

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 500 },
  dateAdded: { type: String, required: true }, // stored as "YYYY-MM-DD" for simple day comparisons
  completed: { type: Boolean, default: false },
  addedBy: { type: String, default: null },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
}, { timestamps: true });

const User = mongoose.model("User", userSchema);
const Task = mongoose.model("Task", taskSchema);

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
    added_by: t.addedBy
  };
}

// ---------- Auth helpers ----------
function signToken(user) {
  return jwt.sign({ id: user._id.toString(), username: user.username, name: user.name }, JWT_SECRET, { expiresIn: "30d" });
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
    const { username, password, name } = req.body;
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
    const user = await User.create({ username: cleanUsername, name: name.trim(), passwordHash });
    const token = signToken(user);
    res.cookie("token", token, COOKIE_OPTS);
    res.json({ id: user._id.toString(), username: user.username, name: user.name });
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
    const token = signToken(user);
    res.cookie("token", token, COOKIE_OPTS);
    res.json({ id: user._id.toString(), username: user.username, name: user.name });
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
  res.json({ id: req.user.id, username: req.user.username, name: req.user.name });
});

// ---------- Task routes ----------
// Returns all incomplete tasks from before today (overdue reminders)
// plus every task added today, for the whole office.
app.get("/api/tasks", authMiddleware, async (req, res) => {
  try {
    const today = todayStr();
    const tasks = await Task.find({
      $or: [
        { dateAdded: today },
        { completed: false, dateAdded: { $lt: today } }
      ]
    }).sort({ dateAdded: 1, createdAt: 1 });
    res.json(tasks.map(taskToJson));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load tasks" });
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
    res.json(taskToJson(task));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not add task" });
  }
});

app.patch("/api/tasks/:id", authMiddleware, async (req, res) => {
  try {
    const { completed } = req.body;
    const task = await Task.findByIdAndUpdate(
      req.params.id,
      { completed: !!completed },
      { new: true }
    );
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.json(taskToJson(task));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not update task" });
  }
});

app.delete("/api/tasks/:id", authMiddleware, async (req, res) => {
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
