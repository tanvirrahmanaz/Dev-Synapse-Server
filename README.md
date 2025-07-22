Dev-Synapse: Forum Application Server
This is the backend server for the Dev-Synapse project, a modern forum application built with the MERN stack. This server is built with Node.js and Express.js, and it provides a comprehensive RESTful API to power the React frontend. It handles all business logic, database interactions, user authentication, and role-based authorization.

Live API Base URL: https://your-server-url.vercel.app

Frontend Code

Features
Secure Authentication: Verifies user identity using Firebase Admin SDK for robust and secure authentication.

Role-Based Authorization: Implements distinct roles (user and admin) with specific permissions using custom middleware.

Full CRUD Operations: Provides complete API endpoints for managing Posts, Comments, Tags, and Announcements.

Advanced Database Queries: Uses MongoDB Aggregation Pipelines for complex features like popularity sorting, analytics, and fetching popular tags.

Payment Integration: Securely creates payment intents for user memberships using the Stripe API.

Content Moderation: Endpoints for users to report content and for admins to review and take action on those reports.

Search and Pagination: Efficient server-side search, filtering, and pagination for posts and user management.

Personalized Notifications: Tracks user activity to provide personalized notification counts for new announcements.

Technologies Used
Runtime: Node.js

Framework: Express.js

Database: MongoDB (with the native mongodb driver)

Authentication: Firebase Admin SDK

Payments: Stripe

Environment Variables: dotenv

Middleware: cors

API Endpoints
Here is a summary of the main API routes available.

Method	Endpoint	Protection	Description
Public Routes			
GET	/posts	Public	Get all posts with search, sort, and pagination.
GET	/posts/:id	Public	Get details of a single post.
GET	/comments/:postId	Public	Get all comments for a specific post.
GET	/announcements	Public	Get all announcements.
GET	/tags/popular	Public	Get the top 5 most popular tags.
GET	/community-stats	Public	Get site-wide statistics (total posts, users, etc.)
User Routes			
POST	/users	Public	Create a new user in the database on registration.
POST	/posts	User	Create a new post.
PATCH	/posts/vote/:id	User	Upvote or downvote a post.
POST	/comments	User	Add a new comment.
POST	/reports	User	Report a comment.
POST	/create-payment-intent	User	Create a Stripe payment intent for membership.
PATCH	/users/make-member	User	Upgrade the user's badge to Gold after payment.
Admin Routes			
GET	/users	Admin	Get all users with search and filtering.
PATCH	/users/role/:id	Admin	Change a user's role (make/remove admin).
GET	/admin-stats	Admin	Get detailed site statistics for the admin dashboard.
POST	/announcements	Admin	Create a new site-wide announcement.
GET	/reports	Admin	Get all user-submitted reports.
DELETE	/comments/:id	Admin	Delete a reported comment.

Export to Sheets
Setup and Installation
To run this server locally, follow these steps:

Clone the repository:

Bash

git clone https://github.com/your-username/your-server-repo.git
Navigate to the project directory:

Bash

cd your-server-repo
Install dependencies:

Bash

npm install
Create .env and serviceAccountKey.json files: See the section below for details on setting up these required files.

Start the development server:

Bash

npm run dev
The server should now be running on http://localhost:5000.

Environment Variables & Required Files
You must create two files in the root of the server project:

.env File:
Create a file named .env and add the following variables with your own credentials.

Code snippet

# The port for the server to run on
PORT=5000

# Your full MongoDB connection string from Atlas
DATABASE_URL="mongodb+srv://your_user:your_password@your_cluster.mongodb.net/forumDB?retryWrites=true&w=majority"

# Your Stripe Secret Key (found in your Stripe dashboard)
STRIPE_SECRET_KEY=sk_test_...your_stripe_secret_key...
serviceAccountKey.json File:

Go to your Firebase Project Settings.

Navigate to the Service accounts tab.

Click "Generate new private key".

A JSON file will be downloaded. Rename it to serviceAccountKey.json and place it in the root of your server project.

IMPORTANT: Add serviceAccountKey.json to your .gitignore file to keep your private key secure.