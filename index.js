const express = require("express");
const cors = require("cors");
var jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion } = require("mongodb");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.otylb.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "UnAuthorized Access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden Access" });
    }
    req.decoded = decoded;
    next();
  });
};

async function run() {
  try {
    await client.connect();
    const serviceCollection = client.db("doctorsPortal").collection("service");
    const bookingCollection = client.db("doctorsPortal").collection("booking");
    const userCollection = client.db("doctorsPortal").collection("user");

    app.get("/", (req, res) => {
      res.send("Server is running");
    });

    app.get("/service", async (req, res) => {
      const query = {};
      const cursor = serviceCollection.find(query);
      const services = await cursor.toArray();

      res.send(services);
    });

    // Warning:
    // This is not the proper way
    // After learning more about mongodb, use aggregate lookup, pipeline, match, group
    app.get("/available", async (req, res) => {
      const date = req.query.date || "Jul 11, 2022";

      // step 1: get services
      const services = await serviceCollection.find().toArray();

      // step 2: get bookings of that day
      const query = { date: date };
      const bookings = await bookingCollection.find(query).toArray();

      // step 3: for each service, find booking of that service
      services.forEach((service) => {
        const serviceBookings = bookings.filter(
          (booking) => booking.treatment === service.name
        );
        const booked = serviceBookings.map(
          (serviceBooking) => serviceBooking.slot
        );
        // service.booked = booked;

        const available = service.slots.filter((el) => !booked.includes(el));
        service.slots = available;
      });

      res.send(services);
    });

    app.get("/booking", verifyJWT, async (req, res) => {
      const patient = req.query.patient;
      const decodedEmail = req.decoded.email;

      if (decodedEmail === patient) {
        const query = { patient: patient };
        const booking = await bookingCollection.find(query).toArray();
        return res.send(booking);
      } else {
        return res.status(403).send({ message: "Forbidden Access" });
      }
    });

    app.post("/booking", async (req, res) => {
      const booking = req.body;

      const query = {
        patient: booking.patient,
        treatment: booking.treatment,
        date: booking.date,
      };
      const exists = await bookingCollection.findOne(query);

      if (exists) {
        return res.send({ success: false, booking: exists });
      }
      const result = await bookingCollection.insertOne(booking);
      res.send({ success: true, result });
    });

    app.get("/user", verifyJWT, async (req, res) => {
      const query = {};
      const users = await userCollection.find(query).toArray();
      res.send(users);
    });

    // insert a user to the db
    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;

      const filter = { email: email };
      const options = { upsert: true };

      const newUser = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, newUser, options);
      const token = jwt.sign(
        { email: email },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "1h" }
      );
      res.send({ result, accessToken: token });
    });

    // is a user admin
    app.get("/user/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });

      const isAdmin = user.role === "admin";
      res.send({ admin: isAdmin });
    });

    // make a user admin
    app.put("/user/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      const requesterEmail = req.decoded.email;
      const query = { email: requesterEmail };
      const requesterAccount = await userCollection.findOne(query);

      if (requesterAccount.role === "admin") {
        const filter = { email: email };
        const newUser = {
          $set: {
            role: "admin",
          },
        };
        const result = await userCollection.updateOne(filter, newUser);
        res.send(result);
      } else {
        res.status(403).send({ message: "Forbidden" });
      }
    });
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log("app is listening on port ", port);
});
