# Office Task Register — Deployment Guide (Roman Urdu)

Ye ek proper multi-user web app hai, **MongoDB** database ke sath:
- Har banda apna account bana kar login karta hai (username + password)
- Sab ka task list ek shared jagah save hota hai
- Jo task complete na ho, agle din "carried over" reminder ki tarah upar dikhta hai

Isay live karne ke liye 3 free cheezein chahiye:
1. **MongoDB Atlas** — free database (jahan tasks aur users save honge)
2. **Vercel** — free hosting (jahan ye website chalegi)
3. **GitHub** — free account (code upload karne ke liye, taake Vercel usay chala sake)

Koi bhi paid card ki zaroorat nahi. Neeche steps follow karein.

---

## Step 1 — Database banayen (MongoDB Atlas)

1. https://www.mongodb.com/cloud/atlas/register par jayen aur free account banayen.
2. Sign up ke baad "Deploy a database" mein **M0 (Free)** tier select karein, koi bhi region choose karein (apne office se qareeb), aur "Create" dabayen.
3. Jab "Security Quickstart" screen aaye:
   - Username/password wala method choose karein, ek username aur strong password set karein — safe jagah likh lein.
   - "Where would you like to connect from" mein **0.0.0.0/0 (Allow access from anywhere)** add karein — kyunke Vercel ka server alag IP se connect karega. (Atlas ke "Network Access" section mein ye baad mein bhi add ho sakta hai.)
4. Database ban jane ke baad, "Database" section mein apne cluster ke saamne **Connect** button dabayen → **Drivers** select karein.
5. Wahan se connection string copy karein, ye kuch aisi dikhegi:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
6. `<username>` aur `<password>` ki jagah apna asal username/password likh dein, aur `.net/` ke baad database ka naam add kar dein, jaise:
   ```
   mongodb+srv://myuser:mypassword@cluster0.xxxxx.mongodb.net/office-tasks?retryWrites=true&w=majority
   ```
   Ye poori string safe jagah save kar lein — Vercel mein isay `DATABASE_URL` ke naam se add karna hai.

---

## Step 2 — Code GitHub par upload karein

1. https://github.com par free account banayen (agar pehle se nahi hai).
2. "New repository" par click karke ek naya repository banayen, naam den `office-task-register`, aur "Create repository" dabayen.
3. Is folder (jo aapko diya gaya hai) ka poora content us repository mein upload kar dein. Sabse asaan tareeqa: GitHub ke page par "uploading an existing file" wala link istemal karein aur is poore folder ki files (package.json, server.js, public/index.html, .gitignore, README.md) drag-drop kar dein.

---

## Step 3 — Website host karein (Vercel)

1. https://vercel.com par jayen aur GitHub se sign in karein.
2. **Add New → Project** par click karein aur apni GitHub repository (`office-task-register`) import karein.
3. **Root Directory** ko `office-task-register` set karein, phir **Deploy** dabayen.
4. Vercel project ke **Settings → Environment Variables** mein ye variables add karein:
   - `DATABASE_URL` = `mongodb+srv://zoiichaa1_db_user:<db_password>@cluster0.viocqia.mongodb.net/`
   - `JWT_SECRET` = koi bhi lamba random text (e.g. `office2026-secret-key-xyz`)
   - `ADMIN_USERNAME` = admin ke liye reserved username (e.g. `officeadmin`)
   - `VAPID_PUBLIC_KEY` aur `VAPID_PRIVATE_KEY` = Web Push keys (neeche command se generate karein)
   - `VAPID_SUBJECT` = contact email, e.g. `mailto:admin@example.com`
   `DATABASE_URL` mein `<db_password>` ko apne MongoDB Atlas password se replace karein. Agar password mein special characters hon (`@`, `#`, `%` waghera), unhein URL-encode karein.
5. Ya Vercel CLI se variables set karein:
   ```
   vercel env add DATABASE_URL production
   vercel env add JWT_SECRET production
   vercel env add ADMIN_USERNAME production
   vercel env add VAPID_PUBLIC_KEY production
   vercel env add VAPID_PRIVATE_KEY production
   vercel env add VAPID_SUBJECT production
   vercel --prod
   ```
   Web Push keys banane ke liye project folder mein `npx web-push generate-vapid-keys` chalayein. Public aur private values ko Vercel mein alag environment variables ke taur par add karein. Har user login ke baad **Enable browser notifications** dabaye; iske baad website band ho tab bhi supported browser mention notification dikha sakta hai.
   `ADMIN_USERNAME` wala account primary admin hota hai. Baqi users **Create admin account** se approval request bhej sakte hain; primary admin Admin Panel se Approve ya Reject karega.
6. Deploy ke baad Vercel aapko ek URL dega jaisa:
   ```
   https://office-task-register.vercel.app
   ```
   Yehi link office ke sab logon ko bhej dein — wahi is app ka pata (address) hai.

---

## Step 4 — Office mein use karna

1. Har banda upar wala link browser mein khole.
2. "Create account" tab se apna naam, username aur password set kare (ek dafa).
3. Agli baar se seedha "Log in" se andar aa jayega.
4. Jo bhi task koi bhi add karega, sab ko wahi list dikhegi.
5. Jo task us din complete na ho, agle din automatically "Not done yet — carried over" mein upar reminder ki tarah aa jayega.
6. Task ya admin reply likhte waqt **Mention user** se username insert karein, jaise `@ahmed`. Mentioned user ko app ke andar notification milegi, aur browser notifications enabled hon to website band hone par bhi push notification milegi.

---

## Note (zaroori baatein)

- Free Vercel deployment mein limits aur usage caps ho sakte hain; current limits Vercel dashboard mein check kar lein.
- MongoDB Atlas ka free (M0) tier 512MB storage deta hai — office ke roz-marra tasks ke liye kaafi zyada hai.
- Password hashed (encrypted) form mein save hota hai, plain text mein nahi.
- Agar future mein zyada control chahiye (jaise admin panel, task categories, ya kisi employee ka access hataana), bata dein — is code mein add kiya ja sakta hai.
