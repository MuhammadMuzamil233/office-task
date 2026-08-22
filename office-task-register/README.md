# Office Task Register — Deployment Guide (Roman Urdu)

Ye ek proper multi-user web app hai, **MongoDB** database ke sath:
- Har banda apna account bana kar login karta hai (username + password)
- Sab ka task list ek shared jagah save hota hai
- Jo task complete na ho, agle din "carried over" reminder ki tarah upar dikhta hai

Isay live karne ke liye 2 free cheezein chahiye:
1. **MongoDB Atlas** — free database (jahan tasks aur users save honge)
2. **Render** — free hosting (jahan ye website chalegi)
3. **GitHub** — free account (code upload karne ke liye, taake Render usay chala sake)

Koi bhi paid card ki zaroorat nahi. Neeche steps follow karein.

---

## Step 1 — Database banayen (MongoDB Atlas)

1. https://www.mongodb.com/cloud/atlas/register par jayen aur free account banayen.
2. Sign up ke baad "Deploy a database" mein **M0 (Free)** tier select karein, koi bhi region choose karein (apne office se qareeb), aur "Create" dabayen.
3. Jab "Security Quickstart" screen aaye:
   - Username/password wala method choose karein, ek username aur strong password set karein — safe jagah likh lein.
   - "Where would you like to connect from" mein **0.0.0.0/0 (Allow access from anywhere)** add karein — kyunke Render ka server alag IP se connect karega. (Atlas ke "Network Access" section mein ye baad mein bhi add ho sakta hai.)
4. Database ban jane ke baad, "Database" section mein apne cluster ke saamne **Connect** button dabayen → **Drivers** select karein.
5. Wahan se connection string copy karein, ye kuch aisi dikhegi:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
6. `<username>` aur `<password>` ki jagah apna asal username/password likh dein, aur `.net/` ke baad database ka naam add kar dein, jaise:
   ```
   mongodb+srv://myuser:mypassword@cluster0.xxxxx.mongodb.net/office-tasks?retryWrites=true&w=majority
   ```
   Ye poori string safe jagah save kar lein — isay `MONGODB_URI` kehte hain, agle step mein iski zaroorat paray gi.

---

## Step 2 — Code GitHub par upload karein

1. https://github.com par free account banayen (agar pehle se nahi hai).
2. "New repository" par click karke ek naya repository banayen, naam den `office-task-register`, aur "Create repository" dabayen.
3. Is folder (jo aapko diya gaya hai) ka poora content us repository mein upload kar dein. Sabse asaan tareeqa: GitHub ke page par "uploading an existing file" wala link istemal karein aur is poore folder ki files (package.json, server.js, public/index.html, .gitignore, README.md) drag-drop kar dein.

---

## Step 3 — Website host karein (Render)

1. https://render.com par jayen aur free account banayen — GitHub account se sign in karna sab se aasan hai.
2. Dashboard mein **New → Web Service** par click karein.
3. Apni GitHub repository (`office-task-register`) select karein aur connect kar dein.
4. Settings kuch is tarah rakhein:
   - **Name:** office-task-register (ya kuch bhi)
   - **Region:** apne office se qareeb tareen
   - **Branch:** main
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
5. Neeche **Environment Variables** section mein ye do variables add karein:
   - `MONGODB_URI` = Step 1 mein banai hui poori connection string
   - `JWT_SECRET` = koi bhi lamba random text (e.g. `office2026-secret-key-xyz`)
6. **Create Web Service** par click karein. 2-3 minute mein deploy ho jayega.
7. Jab status "Live" ho jaye, Render aapko ek URL dega jaisa:
   ```
   https://office-task-register.onrender.com
   ```
   Yehi link office ke sab logon ko bhej dein — wahi is app ka pata (address) hai.

---

## Step 4 — Office mein use karna

1. Har banda upar wala link browser mein khole.
2. "Create account" tab se apna naam, username aur password set kare (ek dafa).
3. Agli baar se seedha "Log in" se andar aa jayega.
4. Jo bhi task koi bhi add karega, sab ko wahi list dikhegi.
5. Jo task us din complete na ho, agle din automatically "Not done yet — carried over" mein upar reminder ki tarah aa jayega.

---

## Note (zaroori baatein)

- Free Render service kaafi der (~15 minute) tak use na ho to "so" ja sakti hai, aur agli visit par khulne mein 20-30 second lag sakte hain — ye free tier ki normal baat hai. Agar hamesha turant khulni ho, Render ka paid plan ($7/month se) lagta hai.
- MongoDB Atlas ka free (M0) tier 512MB storage deta hai — office ke roz-marra tasks ke liye kaafi zyada hai.
- Password hashed (encrypted) form mein save hota hai, plain text mein nahi.
- Agar future mein zyada control chahiye (jaise admin panel, task categories, ya kisi employee ka access hataana), bata dein — is code mein add kiya ja sakta hai.
