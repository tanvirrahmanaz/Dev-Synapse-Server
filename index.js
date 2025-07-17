const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require("firebase-admin");
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

// ==============================================================
// Firebase Admin SDK Initialization
// ==============================================================
const serviceAccount = require("./serviceAccountKey.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// ==============================================================
// Global Middlewares
// ==============================================================
app.use(cors());
app.use(express.json());

// ==============================================================
// MongoDB Connection
// ==============================================================
const uri = process.env.DATABASE_URL;
const client = new MongoClient(uri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

async function run() {
    try {
        // await client.connect(); // You can enable this in production
        console.log("MongoDB Connected!");
        
        // ==============================================================
        // ALL DATABASE COLLECTIONS
        // ==============================================================
        const usersCollection = client.db("forumDB").collection("users");
        const postsCollection = client.db("forumDB").collection("posts");
        const commentsCollection = client.db("forumDB").collection("comments");
        const announcementsCollection = client.db("forumDB").collection("announcements");
        const reportsCollection = client.db("forumDB").collection("reports");
        const tagsCollection = client.db("forumDB").collection("tags");

        // ==============================================================
        // AUTHENTICATION MIDDLEWARES
        // ==============================================================
        const verifyFirebaseToken = async (req, res, next) => {
            if (!req.headers.authorization?.startsWith('Bearer ')) {
                return res.status(401).send({ message: 'Unauthorized' });
            }
            const idToken = req.headers.authorization.split('Bearer ')[1];
            try {
                req.user = await admin.auth().verifyIdToken(idToken);
                next();
            } catch (error) {
                return res.status(401).send({ message: 'Unauthorized' });
            }
        };

        const verifyAdmin = async (req, res, next) => {
            const email = req.user.email;
            try {
                const user = await usersCollection.findOne({ email: email });
                if (user?.role !== 'admin') {
                    return res.status(403).send({ message: 'Forbidden access' });
                }
                next();
            } catch (error) {
                return res.status(500).send({ message: 'Internal server error' });
            }
        };
        
        // ==============================================================
        // ALL API ENDPOINTS
        // ==============================================================

        // --- PUBLIC APIs (No token required) ---
        app.get('/posts', async (req, res) => {
            const { tag, page = 1, limit = 5, sortBy } = req.query;
            const query = {};
            if (tag) query.tags = { $regex: new RegExp(tag, 'i') };
            const skip = (parseInt(page) - 1) * parseInt(limit);
            try {
                const totalPosts = await postsCollection.countDocuments(query);
                let posts;
                if (sortBy === 'popularity') {
                    const pipeline = [
                        { $match: query },
                        { $addFields: { voteDifference: { $subtract: [{$size: { $ifNull: [ "$upVotedBy", [] ] }}, {$size: { $ifNull: [ "$downVotedBy", [] ] }}] } } },
                        { $sort: { voteDifference: -1 } },
                        { $skip: skip }, { $limit: parseInt(limit) }
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
        
        app.get('/posts/:id', async (req, res) => {
            const result = await postsCollection.findOne({ _id: new ObjectId(req.params.id) });
            res.send(result);
        });
        
        app.get('/comments/:postId', async (req, res) => {
            const comments = await commentsCollection.find({ postId: req.params.postId }).sort({ _id: -1 }).toArray();
            res.send(comments);
        });

        app.get('/tags', async (req, res) => {
            const result = await tagsCollection.find().toArray();
            res.send(result);
        });
        // ১. নতুন অ্যানাউন্সমেন্ট তৈরি করার জন্য (অ্যাডমিন)
// এই API টি সবার জন্য উন্মুক্ত (Public)
app.get('/announcements', async (req, res) => {
    try {
        // নতুন অ্যানাউন্সমেন্ট আগে দেখানোর জন্য timestamp অনুযায়ী সর্ট করা হচ্ছে
        const result = await announcementsCollection.find().sort({ timestamp: -1 }).toArray();
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: 'Failed to fetch announcements' });
    }
});

// এই API টিও সবার জন্য উন্মুক্ত (Public)
app.get('/announcements/count', async(req, res) => {
    try {
        const count = await announcementsCollection.countDocuments();
        res.send({ count });
    } catch (error) {
        res.status(500).send({ message: 'Failed to fetch announcement count' });
    }
});

// এই API টি শুধুমাত্র অ্যাডমিনদের জন্য
app.post('/announcements', verifyFirebaseToken, verifyAdmin, async (req, res) => {
    const announcement = { ...req.body, timestamp: new Date() };
    const result = await announcementsCollection.insertOne(announcement);
    res.send(result);
});


        // --- AUTHENTICATION & USER APIs ---
        app.post('/users', async (req, res) => {
            const user = req.body;
            const existingUser = await usersCollection.findOne({ email: user.email });
            if (existingUser) return res.send({ message: 'User already exists' });
            const result = await usersCollection.insertOne({ ...user, badge: 'Bronze', role: 'user' });
            res.send(result);
        });

        app.get('/users/:email', verifyFirebaseToken, async (req, res) => {
            if (req.user.email !== req.params.email) {
                return res.status(403).send({ message: 'Forbidden access' });
            }
            const result = await usersCollection.findOne({ email: req.params.email });
            res.send(result);
        });

        // --- SECURE USER ACTION APIs ---
        app.post('/posts', verifyFirebaseToken, async (req, res) => {
            const result = await postsCollection.insertOne({ ...req.body, postTime: new Date(), upVotedBy: [], downVotedBy: [], commentsCount: 0 });
            res.send(result);
        });

        app.patch('/posts/vote/:id', verifyFirebaseToken, async (req, res) => {
    const id = req.params.id;
    const { voteType } = req.body;
    const userEmail = req.user.email;

    const filter = { _id: new ObjectId(id) };

    try {
        const post = await postsCollection.findOne(filter);
        if (!post) {
            return res.status(404).send({ message: 'Post not found' });
        }

        const currentVoteArray = voteType === 'upVote' ? 'upVotedBy' : 'downVotedBy';
        const oppositeVoteArray = voteType === 'upVote' ? 'downVotedBy' : 'upVotedBy';

        // এখানে ?? [] ব্যবহার করে নিশ্চিত করা হচ্ছে যে, যদি অ্যারেটি না থাকে,
        // তাহলে একটি খালি অ্যারে ব্যবহার করা হবে। এতে আর ক্র্যাশ করবে না।
        const hasVoted = (post[currentVoteArray] ?? []).includes(userEmail);
        
        let updateDoc = {};

        if (hasVoted) {
            // কেস ১: ব্যবহারকারী একই বাটনে আবার ক্লিক করেছে (ভোট বাতিল)
            updateDoc = { $pull: { [currentVoteArray]: userEmail } };
        } else {
            // কেস ২: ব্যবহারকারী নতুন ভোট দিয়েছে
            updateDoc = {
                $addToSet: { [currentVoteArray]: userEmail },
                $pull: { [oppositeVoteArray]: userEmail }
            };
        }

        const result = await postsCollection.updateOne(filter, updateDoc);
        res.send(result);

    } catch (error) {
        res.status(500).send({ message: 'Failed to process vote', error });
    }
});
        
        app.post('/comments', verifyFirebaseToken, async (req, res) => {
            const comment = { ...req.body, timestamp: new Date() };
            const commentResult = await commentsCollection.insertOne(comment);
            await postsCollection.updateOne({ _id: new ObjectId(comment.postId) }, { $inc: { commentsCount: 1 } });
            res.send(commentResult);
        });

        app.get('/posts/by-email/:email', verifyFirebaseToken, async (req, res) => {
            if (req.user.email !== req.params.email) return res.status(403).send({ message: 'Forbidden' });
            const limit = parseInt(req.query.limit) || 0;
            const result = await postsCollection.find({ authorEmail: req.params.email }).sort({ postTime: -1 }).limit(limit).toArray();
            res.send(result);
        });

        app.get('/posts/count/:email', verifyFirebaseToken, async (req, res) => {
            if (req.user.email !== req.params.email) return res.status(403).send({ message: 'Forbidden' });
            const count = await postsCollection.countDocuments({ authorEmail: req.params.email });
            res.send({ count });
        });

        app.delete('/posts/:id', verifyFirebaseToken, async (req, res) => {
            const result = await postsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
            res.send(result);
        });

        // --- PAYMENT & MEMBERSHIP API ---
        app.post('/create-payment-intent', verifyFirebaseToken, async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            if (!amount || amount < 1) return res.status(400).send({ message: 'Invalid price' });
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount, currency: 'usd', payment_method_types: ['card']
            });
            res.send({ clientSecret: paymentIntent.client_secret });
        });

        app.patch('/users/make-member', verifyFirebaseToken, async (req, res) => {
            const email = req.user.email;
            const filter = { email: email };
            const updateDoc = { $set: { badge: 'Gold' } };
            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);
        });

        // ==============================================================
        // ADMIN-ONLY APIs
        // ==============================================================
        app.get('/users', verifyFirebaseToken, verifyAdmin, async (req, res) => {
            const { search } = req.query;
            const query = {};
            if (search) query.name = { $regex: search, $options: 'i' };
            const result = await usersCollection.find(query).toArray();
            res.send(result);
        });
        
        app.patch('/users/admin/:id', verifyFirebaseToken, verifyAdmin, async (req, res) => {
            const result = await usersCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { role: 'admin' } });
            res.send(result);
        });

        app.get('/admin-stats', verifyFirebaseToken, verifyAdmin, async (req, res) => {
            const usersCount = await usersCollection.countDocuments();
            const postsCount = await postsCollection.countDocuments();
            const commentsCount = await commentsCollection.countDocuments();
            res.send({ usersCount, postsCount, commentsCount });
        });

        app.post('/tags', verifyFirebaseToken, verifyAdmin, async (req, res) => {
            const newTag = { name: req.body.name.toLowerCase() };
            const existingTag = await tagsCollection.findOne(newTag);
            if (existingTag) return res.status(400).send({ message: 'Tag already exists.' });
            const result = await tagsCollection.insertOne(newTag);
            res.send(result);
        });

        app.post('/announcements', verifyFirebaseToken, verifyAdmin, async (req, res) => {
            const result = await announcementsCollection.insertOne({ ...req.body, timestamp: new Date() });
            res.send(result);
        });

        app.get('/reports', verifyFirebaseToken, verifyAdmin, async (req, res) => {
            const result = await reportsCollection.find().sort({ reportTime: -1 }).toArray();
            res.send(result);
        });

        app.delete('/comments/:id', verifyFirebaseToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const comment = await commentsCollection.findOne({_id: new ObjectId(id)});
            if (comment) await postsCollection.updateOne({ _id: new ObjectId(comment.postId) }, { $inc: { commentsCount: -1 } });
            const result = await commentsCollection.deleteOne({ _id: new ObjectId(id) });
            res.send(result);
        });

        app.delete('/reports/:id', verifyFirebaseToken, verifyAdmin, async (req, res) => {
            const result = await reportsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
            res.send(result);
        });


        // ==============================================================
// PERSONALIZED ANNOUNCEMENT APIs
// ==============================================================

// ১. একজন নির্দিষ্ট ব্যবহারকারীর জন্য নতুন অ্যানাউন্সমেন্টের সংখ্যা আনার API
app.get('/announcements/new-count', verifyFirebaseToken, async (req, res) => {
    try {
        const userEmail = req.user.email;
        const user = await usersCollection.findOne({ email: userEmail });

        // যদি ব্যবহারকারীর শেষ ভিজিটের সময় না থাকে, তাহলে সব অ্যানাউন্সমেন্টকেই নতুন ধরা হবে
        const lastViewTime = user?.lastSeenAnnouncements || new Date("2000-01-01T00:00:00Z");

        // শেষ ভিজিটের পর কতগুলো নতুন অ্যানাউন্সমেন্ট এসেছে তা গণনা করা
        const newAnnouncementsCount = await announcementsCollection.countDocuments({
            timestamp: { $gt: new Date(lastViewTime) }
        });
        
        res.send({ count: newAnnouncementsCount });
    } catch (error) {
        res.status(500).send({ message: 'Failed to fetch new announcement count' });
    }
});

// ২. ব্যবহারকারীর অ্যানাউন্সমেন্ট দেখার সময় আপডেট করার API
app.post('/users/viewed-announcements', verifyFirebaseToken, async (req, res) => {
    const userEmail = req.user.email;
    const filter = { email: userEmail };
    const updateDoc = {
        $set: { lastSeenAnnouncements: new Date() }
    };
    const result = await usersCollection.updateOne(filter, updateDoc);
    res.send(result);
});

    } finally {
        // The connection will remain open for the running server
    }
}
run().catch(console.dir);

app.get('/', (req, res) => res.send('Forum server is running!'));
app.listen(port, () => console.log(`Server is running on port: ${port}`));