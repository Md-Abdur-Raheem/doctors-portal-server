const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const ObjectId = require('mongodb').ObjectId;
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const fileUpload = require('express-fileupload');

const app = express();
const port = process.env.PORT || 5000;



const admin = require("firebase-admin");
const { query } = require('express');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


//middle wear
app.use(cors());
app.use(express.json());
app.use(fileUpload());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.aimii.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });


async function verifyToken(req, res, next) {
    if (req.headers.authorization?.startsWith('Bearer ')) {
        const token = req.headers.authorization.split(' ')[1];
        try{
            const decodedUser = await admin.auth().verifyIdToken(token);
            req.decodedEmail = decodedUser.email;
        }
        catch {
            
        }
    }
    next();
}

async function run() {
    try {
        await client.connect();
        const database = client.db("DoctorsPortal");
        const appointmentsCollection = database.collection("appointments");
        const usersCollection = database.collection("users");
        const doctorsCollection = database.collection("doctors");

        //api to post an appointment
        app.post('/appointments', async (req, res) => {
            const appointment = req.body;
            const result = await appointmentsCollection.insertOne(appointment)
            res.json(result)
        })

        //api to get appointments by email
        app.get('/appointments', async (req, res) => {
            const email = req.query.email;
            const date = new Date (req.query.date).toDateString();
            const query = {email: email, date: date}
            const cursor = appointmentsCollection.find(query);
            const appointments = await cursor.toArray();
            res.json(appointments);
        })

        //api to post users 
        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await usersCollection.insertOne(user);
            res.json(result);
        })

        //api to upsert google login user
        app.put('/users', async(req, res) => {
            const user = req.body;
            const filter = { email: user.email };
            const options = { upsert: true };
            const updateDoc = { $set: user }
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            res.json(result)
        })

        //api to add admin
        app.put('/users/admin', verifyToken, async (req, res) => {
            const email = req.body.email;
            const requester = req.decodedEmail;

            if (requester) {
                const requesterAccount = await usersCollection.findOne({ email: requester });
                if (requesterAccount.role === 'Admin') {
                    const filter = { email: email };
                    const updateDoc = { $set: { role: 'Admin' } };
                    const result = await usersCollection.updateOne(filter, updateDoc);
                    res.json(result);
                }
            }
            else {
                res.status(403).json({message: "You do not have access to make admin"});
            }
        })

        //api to get admin users
        app.get('/users/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const result = await usersCollection.findOne(query);
            let isAdmin = false;
            if (result?.role === 'Admin') {
                isAdmin = true;
            }
            res.json({ isAdmin });
        })


        // api to get appointment by id
        app.get('/appointments/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await appointmentsCollection.findOne(query);
            res.json(result);
        })


        //api to create payment intent
        app.post('/create-payment-intent', async (req, res) => {
            const paymentInfo = req.body;
            const amount = paymentInfo.price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ['card']
            })
            res.json({clientSecret: paymentIntent.client_secret})
        })

        //api to update appointment after payments
        app.put('/appointments/:id', async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const find = { _id: ObjectId(id) };
            const updateDoc = {
                $set: {
                    payment: payment
                }
            };
            const result = await appointmentsCollection.updateOne(find, updateDoc);
            res.json(result);
        })

        //api to add doctors
        app.post('/doctors', async (req, res) => {
            const name = req.body.name;
            const email = req.body.email;
            const pic = req.files.image;
            const pictureData = pic.data;
            const encodedPic = pictureData.toString('base64');
            const imageBuffer = Buffer.from(encodedPic, 'base64');
            const doctor = {
                name, email, image: imageBuffer
            }
            
            const result = await doctorsCollection.insertOne(doctor);
            res.json(result);

        })

        app.get('/doctors', async (req, res) => {
            const cursor = doctorsCollection.find({});
            const doctors = await cursor.toArray();
            res.json(doctors);
        })
    }
    finally {
        //await client.close()
    }
}
run().catch(console.dir);


app.get('/', (req, res) => res.send('Hello world'));
app.listen(port, () => console.log("Running server on port", port))
