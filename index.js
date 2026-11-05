import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import cors from "cors";

const app = express();
const PORT = process.env.PORT;

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

try {
  const mongoClient = await connectToMongoDB();

  const db = mongoClient.db("studiospace");
  const studioCollection = db.collection("studios");
  const bookingsCollection = db.collection("bookings");

  //* Define Add New Studio route api url: http://localhost:5000/add-new-studio */
  app.post("/add-new-studio", async (req, res) => {
    try {
      const studioData = req.body;
      const result = await studioCollection.insertOne(studioData);

      // console.log(result);
      res.status(200).json(result);
    } catch (error) {
      console.error("Error adding studio:", error);
      res.status(500).send("Internal Server Error");
    }
  });

  //* Define Get My Studios Listings route api url: http://localhost:5000/my-studio-listings/:userId */
  app.get("/my-studio-listings/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const query = { hostId: userId };
      const studios = await studioCollection.find(query).toArray();
      res.status(200).json(studios);
    } catch (error) {
      console.error("Error fetching studios:", error);
      res.status(500).send("Internal Server Error");
    }
  });

  //* Define Update Studio route api url: http://localhost:5000/my-studio-listings/:id */
  app.patch("/my-studio-listings/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };

      const updateData = req.body;
      const update = { $set: updateData };

      const result = await studioCollection.updateOne(query, update);

      res.status(200).json(result);
    } catch (error) {
      console.error("Error updating studio:", error);
      res.status(500).send("Internal Server Error");
    }
  });

  //* Define Delete Studio route api url: http://localhost:5000/my-studio-listings/:id */
  app.delete("/my-studio-listings/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };

      const result = await studioCollection.deleteOne(query);

      res.status(200).json(result);
    } catch (error) {
      console.error("Error deleting studio:", error);
      res.status(500).send("Internal Server Error");
    }
  });

  //* Define Get All Studios route api url: http://localhost:5000/studios */
  app.get("/studios", async (req, res) => {
    try {
      const studios = await studioCollection.find().sort({ CreatedAt: -1 }).toArray();
      res.status(200).json(studios);
    } catch (error) {
      console.error("Error fetching studios:", error);
      res.status(500).send("Internal Server Error");
    }
  });

  //* Define Get Studio by ID route api url: http://localhost:5000/studios/:id */
  app.get("/studios/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const studio = await studioCollection.findOne(query);
      if (!studio) {
        return res.status(404).send("Studio not found");
      }
      res.status(200).json(studio);
    } catch (error) {
      console.error("Error fetching studio:", error);
      res.status(500).send("Internal Server Error");
    }
  });

  //* Define Increment Studio Views route api url: http://localhost:5000/studios/:id/views */
  app.patch("/studios/:id/views", async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          message: "Invalid studio ID.",
        });
      }

      const result = await studioCollection.updateOne(
        { _id: new ObjectId(id) },
        [
          {
            $set: {
              views: {
                $add: [
                  {
                    $convert: {
                      input: "$views",
                      to: "int",
                      onError: 0,
                      onNull: 0,
                    },
                  },
                  1,
                ],
              },
            },
          },
        ],
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({
          message: "Studio not found.",
        });
      }

      const updatedStudio = await studioCollection.findOne(
        { _id: new ObjectId(id) },
        { projection: { views: 1 } },
      );

      return res.status(200).json({
        message: "Studio view counted.",
        views: updatedStudio?.views ?? 0,
      });
    } catch (error) {
      console.error("Error incrementing studio views:", error);
      return res.status(500).json({
        message: "Internal Server Error",
      });
    }
  });

  //* Define Create Booking route api url: http://localhost:5000/booking */
  app.post("/booking", async (req, res) => {
    try {
      const bookingData = req.body;
      const result = await bookingsCollection.insertOne(bookingData);
      console.log(result);
      res.status(200).json(result);
    } catch (error) {
      console.error("Error creating booking:", error);
      res.status(500).send("Internal Server Error");
    }
  });

  //* Define Get Bookings by User Email route api url: http://localhost:5000/bookings/:email */
  app.get("/bookings/:email", async (req, res) => {
    try {
      const { email } = req.params;
      const query = { bookingUserEmail: email };
      const bookings = await bookingsCollection.find(query).toArray();

      res.status(200).json(bookings);
    } catch (error) {
      console.error("Error fetching bookings:", error);
      res.status(500).send("Internal Server Error");
    }
  });


  //* Define Update Booking Status route api url: http://localhost:5000/dashboard/:id */
  app.patch("/dashboard/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { status, requesterEmail } = req.body;

      if (!["Pending", "Confirmed", "Completed", "Cancelled"].includes(status)) {
        return res.status(400).json({ message: "Status must be Pending, Confirmed, Completed, or Cancelled." });
      }

      const bookingQuery = ObjectId.isValid(id)
        ? { $or: [{ _id: id }, { _id: new ObjectId(id) }] }
        : { _id: id };

      const booking = await bookingsCollection.findOne(bookingQuery);

      if (!booking) {
        return res.status(404).json({ message: "Booking not found." });
      }

      if (!requesterEmail) {
        return res.status(401).json({ message: "Requester email is required." });
      }

      const currentStatus = booking.status?.toLowerCase();
      const isHost = booking.hostEmail === requesterEmail;
      const isCustomer = booking.bookingUserEmail === requesterEmail;
      const isPending = currentStatus?.includes("pending");
      const canHostUpdate = isHost && (
        (isPending && ["Confirmed", "Cancelled"].includes(status)) ||
        (currentStatus === "confirmed" && status === "Completed")
      );
      const canCustomerCancel = isCustomer && isPending && status === "Cancelled";

      if (!canHostUpdate && !canCustomerCancel) {
        return res.status(403).json({
          message: "You are not allowed to make this booking status change.",
        });
      }

      const result = await bookingsCollection.updateOne(bookingQuery, { $set: { status } });

      if (result.matchedCount === 0) {
        return res.status(404).json({ message: "Booking not found." });
      }

      res.status(200).json(result);
      
    } catch (error) {
      console.error("Error updating booking status:", error);
      res.status(500).send("Internal Server Error");
    }
  });

  //* Define Delete Booking route api url: http://localhost:5000/my-bookings/:id */
  app.delete("/my-bookings/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const query = { _id: id };
      const result = await bookingsCollection.deleteOne(query);
      res.status(200).json(result);
    } catch (error) {
      console.error("Error deleting booking:", error);
      res.status(500).send("Internal Server Error");
    }
  });

  //* Define Dashboard route api url: http://localhost:5000/dashboard/:email */
  app.get("/dashboard/:email", async (req, res) => {
    try {
      const { email } = req.params;
      const query = { hostEmail: email };
      const userBookings = await bookingsCollection.find(query).toArray();
      const totalStudios = await studioCollection.countDocuments(query);

      res.status(200).json({ totalStudios, userBookings });
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      res.status(500).send("Internal Server Error");
    }
  });

  //* Define Home route */
  app.get("/", (req, res) => {
    res.send("Hello, World!");
  });

  //* Start the server */
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
} catch (err) {
  console.error("Server startup failed:", err);
  process.exit(1);
}
