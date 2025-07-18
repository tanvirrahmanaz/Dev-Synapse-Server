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
        const searchesCollection = client.db("forumDB").collection("searches");

        // ==============================================================
        // AUTHENTICATION MIDDLEWARES (Defined inside run to access collections)
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

        // --- PUBLIC APIs (for all visitors) ---
        app.get('/posts', async (req, res) => {
            const { tag, page = 1, limit = 6, sortBy } = req.query;
            const query = {};
            if (tag) query.tags = { $regex: new RegExp(tag, 'i') };
            const skip = (parseInt(page) - 1) * parseInt(limit);
            try {
                const totalPosts = await postsCollection.countDocuments(query);
                let posts;
                if (sortBy === 'popularity') {
                    const pipeline = [
                        { $match: query },
                        { $addFields: { voteDifference: { $subtract: [{ $size: { $ifNull: ["$upVotedBy", []] } }, { $size: { $ifNull: ["$downVotedBy", []] } }] } } },
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
            const comments = await commentsCollection.find({ postId: req.params.postId }).sort({ timestamp: -1 }).toArray();
            res.send(comments);
        });

        app.get('/tags', async (req, res) => {
            const result = await tagsCollection.find().toArray();
            res.send(result);
        });

        app.get('/announcements', async (req, res) => {
            const result = await announcementsCollection.find().sort({ timestamp: -1 }).toArray();
            res.send(result);
        });

        // --- AUTHENTICATION & MEMBERSHIP APIs (user must be logged in) ---
        app.post('/users', async (req, res) => {
            const user = req.body;
            const existingUser = await usersCollection.findOne({ email: user.email });
            if (existingUser) return res.send({ message: 'User already exists' });
            const result = await usersCollection.insertOne({ ...user, badge: 'Bronze', role: 'user', lastSeenAnnouncements: new Date() });
            res.send(result);
        });

        app.get('/users/:email', verifyFirebaseToken, async (req, res) => {
            if (req.user.email !== req.params.email) {
                return res.status(403).send({ message: 'Forbidden access' });
            }
            const result = await usersCollection.findOne({ email: req.params.email });
            res.send(result);
        });

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

        app.get('/announcements/new-count', verifyFirebaseToken, async (req, res) => {
            const user = await usersCollection.findOne({ email: req.user.email });
            const lastViewTime = user?.lastSeenAnnouncements || new Date("2000-01-01");
            const newCount = await announcementsCollection.countDocuments({ timestamp: { $gt: new Date(lastViewTime) } });
            res.send({ count: newCount });
        });

        app.post('/users/viewed-announcements', verifyFirebaseToken, async (req, res) => {
            const result = await usersCollection.updateOne({ email: req.user.email }, { $set: { lastSeenAnnouncements: new Date() } });
            res.send(result);
        });
        // Update user's last seen announcement time
        app.post('/users/update-view-time', verifyFirebaseToken, async (req, res) => {
            try {
                const result = await usersCollection.updateOne(
                    { email: req.user.email },
                    { $set: { lastSeenAnnouncements: new Date() } }
                );

                if (result.modifiedCount === 1) {
                    res.send({ success: true, message: 'View time updated successfully' });
                } else {
                    res.status(404).send({ success: false, message: 'User not found' });
                }
            } catch (error) {
                console.error('Error updating view time:', error);
                res.status(500).send({ success: false, message: 'Server error' });
            }
        });

        // --- CONTENT INTERACTION APIs (user must be logged in) ---
        app.post('/posts', verifyFirebaseToken, async (req, res) => {
            const result = await postsCollection.insertOne({ ...req.body, postTime: new Date(), upVotedBy: [], downVotedBy: [], commentsCount: 0 });
            res.send(result);
        });

        app.patch('/posts/vote/:id', verifyFirebaseToken, async (req, res) => {
            const id = req.params.id;
            const { voteType } = req.body;
            const userEmail = req.user.email;
            const post = await postsCollection.findOne({ _id: new ObjectId(id) });
            const currentVoteArray = voteType === 'upVote' ? 'upVotedBy' : 'downVotedBy';
            const oppositeVoteArray = voteType === 'upVote' ? 'downVotedBy' : 'upVotedBy';
            const hasVoted = (post[currentVoteArray] ?? []).includes(userEmail);
            const updateDoc = hasVoted ? { $pull: { [currentVoteArray]: userEmail } } : { $addToSet: { [currentVoteArray]: userEmail }, $pull: { [oppositeVoteArray]: userEmail } };
            const result = await postsCollection.updateOne({ _id: new ObjectId(id) }, updateDoc);
            res.send(result);
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

        // ==============================================================
        // ADMIN-ONLY APIs
        // ==============================================================
        app.get('/users', verifyFirebaseToken, verifyAdmin, async (req, res) => {
    const { search, membership, sortBy } = req.query;
    
    // অ্যাগ্রিগেশন পাইপলাইনের ধাপগুলো তৈরি করা হচ্ছে
    const pipeline = [];

    // ধাপ ১: ম্যাচিং (সার্চ এবং ফিল্টার)
    const matchStage = {};
    if (search) {
        // নাম অথবা ইমেইল উভয় ক্ষেত্রেই সার্চ করা হচ্ছে
        matchStage.$or = [
            { name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } }
        ];
    }
    if (membership && (membership === 'Gold' || membership === 'Bronze')) {
        matchStage.badge = membership;
    }
    // যদি কোনো ম্যাচিং শর্ত থাকে, তাহলেই শুধু $match ধাপটি যোগ করা হবে
    if (Object.keys(matchStage).length > 0) {
        pipeline.push({ $match: matchStage });
    }

    // ধাপ ২: পোস্ট সংখ্যা গণনা করার জন্য $lookup এবং $addFields
    // posts কালেকশনের সাথে users কালেকশনকে join করা হচ্ছে
    pipeline.push({
        $lookup: {
            from: 'posts',
            localField: 'email',
            foreignField: 'authorEmail',
            as: 'userPosts'
        }
    });
    // প্রতিটি ইউজারের জন্য postCount নামে নতুন একটি ফিল্ড যোগ করা হচ্ছে
    pipeline.push({
        $addFields: {
            postCount: { $size: '$userPosts' }
        }
    });

    // ধাপ ৩: সর্টিং
    if (sortBy === 'postCount') {
        pipeline.push({ $sort: { postCount: -1 } });
    } else {
        pipeline.push({ $sort: { name: 1 } }); // ডিফল্টভাবে নাম অনুযায়ী সর্ট
    }
    
    // ধাপ ৪: অপ্রয়োজনীয় 필্ড বাদ দেওয়া
    pipeline.push({
        $project: {
            userPosts: 0 // userPosts অ্যারেটি বড় হতে পারে, তাই এটিকে বাদ দেওয়া হলো
        }
    });

    try {
        const result = await usersCollection.aggregate(pipeline).toArray();
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: "Failed to fetch users", error });
    }
});

        app.patch('/users/role/:id', verifyFirebaseToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const { role } = req.body; // নতুন ভূমিকা ক্লায়েন্ট থেকে আসবে

            // প্রধান অ্যাডমিনকে পরিবর্তন করা যাবে না, এটি একটি নিরাপত্তা ব্যবস্থা
            const userToUpdate = await usersCollection.findOne({ _id: new ObjectId(id) });
            if (userToUpdate.email === 'admin@gmail.com') {
                return res.status(403).send({ message: 'Cannot change the role of the main admin.' });
            }

            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: { role: role } // ডায়নামিকভাবে 'admin' বা 'user' সেট করা হচ্ছে
            };
            const result = await usersCollection.updateOne(filter, updateDoc);
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

        // === নতুন API: ট্যাগ মুছে ফেলার জন্য ===
        app.delete('/tags/:id', verifyFirebaseToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await tagsCollection.deleteOne(query);
            res.send(result);
        });

        // === নতুন API: চার্টের জন্য অ্যানালিটিক্স ডেটা ===
        app.get('/admin-analytics', verifyFirebaseToken, verifyAdmin, async (req, res) => {
            // টপ ট্যাগগুলো পোস্টের সংখ্যা অনুযায়ী গণনা করা
            const topTagsPipeline = [
                { $unwind: '$tags' },
                { $group: { _id: '$tags', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 5 },
                { $project: { name: '$_id', count: 1, _id: 0 } }
            ];
            const topTags = await postsCollection.aggregate(topTagsPipeline).toArray();

            res.send({ topTags });
            // আপনি চাইলে এখানে weeklyData-র জন্যও অ্যাগ্রিগেশন পাইপলাইন যোগ করতে পারেন
        });

        app.post('/announcements', verifyFirebaseToken, verifyAdmin, async (req, res) => {
            const result = await announcementsCollection.insertOne({ ...req.body, timestamp: new Date() });
            res.send(result);
        });

        app.get('/reports', verifyFirebaseToken, verifyAdmin, async (req, res) => {
            const { type } = req.query; // যেমন: 'post' বা 'comment'

            const query = {};
            if (type && (type === 'post' || type === 'comment')) {
                query.type = type;
            }

            try {
                const result = await reportsCollection.find(query).sort({ reportTime: -1 }).toArray();
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Failed to fetch reports" });
            }
        });
        app.post('/reports', verifyFirebaseToken, async (req, res) => {
            const reportData = { ...req.body, reporterEmail: req.user.email, reportTime: new Date() };
            const result = await reportsCollection.insertOne(reportData);
            res.send(result);
        });

        app.delete('/comments/:id', verifyFirebaseToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const comment = await commentsCollection.findOne({ _id: new ObjectId(id) });
            if (comment) await postsCollection.updateOne({ _id: new ObjectId(comment.postId) }, { $inc: { commentsCount: -1 } });
            const result = await commentsCollection.deleteOne({ _id: new ObjectId(id) });
            res.send(result);
        });

        app.delete('/reports/:id', verifyFirebaseToken, verifyAdmin, async (req, res) => {
            const result = await reportsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
            res.send(result);
        });
        // ==============================================================
        // SEARCH LOGGING APIs
        // ==============================================================

        // নতুন সার্চ টার্ম সেভ করার জন্য API
        app.post('/searches', async (req, res) => {
            const searchData = {
                term: req.body.term,
                timestamp: new Date()
            };
            const result = await searchesCollection.insertOne(searchData);
            res.send(result);
        });

        // সাম্প্রতিক জনপ্রিয় সার্চগুলো আনার জন্য API
        app.get('/searches/recent', async (req, res) => {
            try {
                const pipeline = [
                    // শেষ ৭ দিনের সার্চগুলো নেওয়া হচ্ছে (ঐচ্ছিক)
                    // { $match: { timestamp: { $gte: new Date(new Date() - 7 * 24 * 60 * 60 * 1000) } } },

                    // একই সার্চ টার্মগুলোকে গ্রুপ করা হচ্ছে এবং শেষ সার্চের সময়টা রাখা হচ্ছে
                    {
                        $group: {
                            _id: "$term",
                            count: { $sum: 1 },
                            lastSearched: { $max: "$timestamp" }
                        }
                    },
                    // সবচেয়ে বেশি সার্চ করা এবং সাম্প্রতিক সার্চ অনুযায়ী সর্ট করা
                    { $sort: { count: -1, lastSearched: -1 } },
                    // প্রথম ৩টি ফলাফল নেওয়া হচ্ছে
                    { $limit: 3 }
                ];
                const result = await searchesCollection.aggregate(pipeline).toArray();
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Failed to fetch recent searches" });
            }
        });


        // পোস্ট রিপোর্ট করার জন্য নতুন API
        app.post('/reports/post', verifyFirebaseToken, async (req, res) => {
            const reportData = req.body;
            const newReport = {
                type: 'post', // রিপোর্টের ধরন
                targetId: new ObjectId(reportData.postId), // কোন পোস্টটি রিপোর্ট করা হয়েছে
                feedback: reportData.feedback,
                reporterEmail: req.user.email,
                reportTime: new Date()
            };
            const result = await reportsCollection.insertOne(newReport);
            res.send(result);
        });




    } finally {
        // The connection will remain open for a running server
    }
}
run().catch(console.dir);

app.get('/', (req, res) => res.send('Forum server is running!'));
app.listen(port, () => console.log(`Server is running on port: ${port}`));  