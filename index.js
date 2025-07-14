const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require("firebase-admin"); // Firebase Admin SDK ইম্পোর্ট

const app = express();
const port = process.env.PORT || 5000;

// Firebase Admin SDK ইনিশিয়ালাইজেশন
const serviceAccount = require("./serviceAccountKey.json"); // আপনার সার্ভিস কী ফাইলের পাথ
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const uri = process.env.DATABASE_URL;
const client = new MongoClient(uri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

// Middleware to verify Firebase ID Token (নতুন এবং সঠিক মিডলওয়্যার)
const verifyFirebaseToken = async (req, res, next) => {
    if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
        return res.status(401).send({ message: 'Unauthorized access' });
    }
    const idToken = req.headers.authorization.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        req.user = decodedToken; // ডিকোড করা ইউজার তথ্য রিকোয়েস্টে যোগ করা হচ্ছে
        next();
    } catch (error) {
        return res.status(401).send({ message: 'Unauthorized: Invalid token' });
    }
};

async function run() {
    try {
        // কালেকশনগুলো
        const usersCollection = client.db("forumDB").collection("users");
        const postsCollection = client.db("forumDB").collection("posts");
        const commentsCollection = client.db("forumDB").collection("comments");

        // User APIs
        app.post('/users', async (req, res) => {
            const user = req.body;
            const existingUser = await usersCollection.findOne({ email: user.email });
            if (existingUser) return res.send({ message: 'User already exists', insertedId: null });
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        // Member API - সুরক্ষিত রুট
        app.patch('/users/make-member', verifyFirebaseToken, async (req, res) => {
            const emailFromToken = req.user.email;
            const filter = { email: emailFromToken };
            const updateDoc = { $set: { badge: 'Gold' } };
            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);
        });

        // Post APIs
        // Public route to get posts with pagination, search, and sort
        app.get('/posts', async (req, res) => {
            const { tag, page = 1, limit = 5, sortBy } = req.query;
            // ... (আপনার আগের সঠিক /posts কোডটি এখানে থাকবে)
             const query = {};
            if (tag) {
                query.tags = { $regex: new RegExp(tag, 'i') };
            }

            const skip = (parseInt(page) - 1) * parseInt(limit);

            try {
                const totalPosts = await postsCollection.countDocuments(query);
                let posts;

                if (sortBy === 'popularity') {
                    const pipeline = [
                        { $match: query },
                        { $addFields: { voteDifference: { $subtract: ["$upVote", "$downVote"] } } },
                        { $sort: { voteDifference: -1 } },
                        { $skip: skip },
                        { $limit: parseInt(limit) }
                    ];
                    posts = await postsCollection.aggregate(pipeline).toArray();
                } else {
                    posts = await postsCollection.find(query).sort({ postTime: -1 }).skip(skip).limit(parseInt(limit)).toArray();
                }

                res.send({ posts, totalPosts });
            } catch (error) {
                res.status(500).send({ message: "Failed to fetch posts", error });
            }
        });

        // Public route to get a single post
        app.get('/posts/:id', async (req, res) => {
            const result = await postsCollection.findOne({ _id: new ObjectId(req.params.id) });
            res.send(result);
        });

        // Secure route to create a new post
        app.post('/posts', verifyFirebaseToken, async (req, res) => {
            const result = await postsCollection.insertOne(req.body);
            res.send(result);
        });

        // Secure route to vote on a post
        app.patch('/posts/vote/:id', verifyFirebaseToken, async (req, res) => {
            const { voteType } = req.body;
            const filter = { _id: new ObjectId(req.params.id) };
            const updateDoc = { $inc: { [voteType]: 1 } };
            const result = await postsCollection.updateOne(filter, updateDoc);
            res.send(result);
        });
        
        // Public route to get comments
        app.get('/comments/:postId', async (req, res) => {
            const comments = await commentsCollection.find({ postId: req.params.postId }).toArray();
            res.send(comments);
        });
        
        // Secure route to add a comment
        app.post('/comments', verifyFirebaseToken, async (req, res) => {
            const comment = req.body;
            const commentResult = await commentsCollection.insertOne(comment);
            const filter = { _id: new ObjectId(comment.postId) };
            const updateDoc = { $inc: { commentsCount: 1 } };
            await postsCollection.updateOne(filter, updateDoc);
            res.send(commentResult);
        });

    } finally {
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => res.send('Forum server is running!'));
app.listen(port, () => console.log(`Server is running on port: ${port}`));