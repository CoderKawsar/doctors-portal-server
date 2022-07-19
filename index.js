const express = require("express");
const cors = require("cors");
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
async function run() {
  try {
    await client.connect();
    const serviceCollection = client.db("doctorsPortal").collection("service");
    const bookingCollection = client.db("doctorsPortal").collection("booking");

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

    app.get("/booking", async (req, res) => {
      const patient = req.query.patient;
      const query = { patient: patient };

      const booking = await bookingCollection.find(query).toArray();

      res.send(booking);
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
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log("app is listening on port ", port);
});
