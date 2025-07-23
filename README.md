# 🧠 Dev-Synapse: Forum Application Server (Backend)

This is the **backend server** for **Dev-Synapse**, a full-featured modern forum for developers built using the **MERN stack**. It is built with **Node.js**, **Express.js**, and **MongoDB**, and serves a RESTful API to support all client-side functionality including user authentication, role-based authorization, content moderation, and membership payments.

🌐 **Live API Base URL**: https://your-server-url.vercel.app  
🖥️ **Frontend Code**: [Client Repository](#)

---

## 🚀 Features

### 🔐 Authentication
- Secured with **Firebase Admin SDK** to validate ID tokens from the client.

### 🛡 Role-Based Authorization
- Middleware distinguishes between **regular users** and **admins** to control access to protected resources.

### 📄 RESTful API
- Full CRUD operations for **Posts**, **Comments**, **Announcements**, and **Tags**.

### 📊 Aggregation & Analytics
- Uses **MongoDB Aggregation Pipelines** to generate statistics and enable popularity-based sorting.

### 💳 Stripe Payments
- Secure Stripe integration for handling **membership upgrades**.

### 🚨 Content Moderation
- Endpoints for reporting content and admin moderation actions.

### 🔍 Search & Pagination
- Efficient server-side filtering, searching, and pagination for posts and user management.

### 🔔 Personalized Notifications
- Tracks unseen announcements per user and provides personalized notification counts.

---

## 🧰 Technologies Used

| Category      | Technology              |
|---------------|--------------------------|
| Runtime        | Node.js                 |
| Framework      | Express.js              |
| Database       | MongoDB (native driver) |
| Authentication | Firebase Admin SDK      |
| Payments       | Stripe                  |
| Config         | dotenv                  |
| Middleware     | cors                    |

---

## 📑 API Endpoints Overview

### 🔓 Public Routes

| Method | Route                 | Description                                      |
|--------|-----------------------|--------------------------------------------------|
| GET    | `/posts`              | Get all posts (search, sort, pagination)         |
| GET    | `/posts/:id`          | Get a single post                                |
| GET    | `/comments/:postId`   | Get all comments for a specific post             |
| GET    | `/announcements`      | Get all announcements                            |
| GET    | `/tags/popular`       | Get top 5 popular tags                           |
| GET    | `/community-stats`    | Get site-wide statistics                         |

### 👤 User Routes

| Method | Route                        | Description                                  |
|--------|------------------------------|----------------------------------------------|
| POST   | `/users`                     | Register user in DB                          |
| POST   | `/posts`                     | Create a new post                            |
| PATCH  | `/posts/vote/:id`            | Upvote or downvote a post                    |
| POST   | `/comments`                  | Add a comment                                |
| POST   | `/reports`                   | Report a post or comment                     |
| POST   | `/create-payment-intent`     | Create Stripe payment intent                 |
| PATCH  | `/users/make-member`         | Upgrade user badge after successful payment  |

### 🛠 Admin Routes (Protected)

| Method | Route                        | Description                                  |
|--------|------------------------------|----------------------------------------------|
| GET    | `/users`                     | Get all users with search/filter             |
| PATCH  | `/users/role/:id`            | Promote or demote admin role                 |
| GET    | `/admin-stats`               | Get admin dashboard statistics               |
| POST   | `/announcements`             | Create new announcement                      |
| GET    | `/reports`                   | View all reported content                    |
| DELETE | `/comments/:id`              | Delete a reported comment                    |

---

## ⚙️ Setup & Installation

```bash
# 1. Clone the repository
git clone https://github.com/your-username/your-server-repo.git

# 2. Navigate into the project folder
cd your-server-repo

# 3. Install dependencies
npm install

# 4. Run development server
npm run dev
```
## 🔐 Environment Variables

Create a `.env` file in the root directory with the following contents:

```env
# Server Port
PORT=5000

# MongoDB Connection URI
DATABASE_URL=mongodb+srv://your_user:your_password@your_cluster.mongodb.net/forumDB?retryWrites=true&w=majority

# Stripe Secret Key
STRIPE_SECRET_KEY=sk_test_...your_stripe_secret_key...
```
## 🔑 Firebase Admin SDK Setup

To securely verify Firebase users from the frontend:

### ✅ Steps to Create `serviceAccountKey.json`

1. Go to your **Firebase Console**
2. Navigate to **Project Settings > Service Accounts**
3. Click **"Generate New Private Key"**
4. A `.json` file will be downloaded
5. Rename it to: `serviceAccountKey.json`
6. Place it in the **root directory** of your server project

---

### ⚠️ Security Note

Make sure to add this file to `.gitignore` to prevent it from being exposed publicly:

```bash
# .gitignore
serviceAccountKey.json
```
## 📄 License

This project is licensed under the **MIT License**.  
You are free to **use**, **modify**, and **distribute** this software.

---

## 🤝 Contribution Guidelines

Contributions are welcome and appreciated!

### To Contribute:

1. **Fork** this repository
2. Create a new branch:

    ```bash
    git checkout -b feature-name
    ```

3. Make your changes and commit:

    ```bash
    git commit -m "Add feature"
    ```

4. Push to your branch:

    ```bash
    git push origin feature-name
    ```

5. Open a **Pull Request**

Let’s build better software together! 🚀
