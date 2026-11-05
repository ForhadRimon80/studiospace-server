import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import cors from "cors";
import { createRemoteJWKSet, jwtVerify } from "jose";

const app = express();
const PORT = process.env.PORT;

const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const jwks = createRemoteJWKSet(new URL(`${BETTER_AUTH_URL}/api/auth/jwks`));

app.use(cors());
app.use(express.json());

// Verify the Better Auth JWT and expose the caller's identity on req.user.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing or invalid Authorization header." });
  }

  try {
    const { payload } = await jwtVerify(header.slice("Bearer ".length), jwks);
    req.user = {
      id: payload.sub,
      email: typeof payload.email === "string" ? payload.email.toLowerCase() : undefined,
      name: typeof payload.name === "string" ? payload.name : undefined,
    };
    return next(); 
  } catch (error) {
    console.error("JWT verification failed:", error.message);
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

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
  app.post("/add-new-studio", requireAuth, async (req, res) => {
    try {
      // Never trust identity fields sent by the client.
      const studioData = {
        ...req.body,
        hostId: req.user.id,
        hostEmail: req.user.email,
        hostName: req.user.name,
      };
      const result = await studioCollection.insertOne(studioData);

      // console.log(result);
      res.status(200).json(result);
    } catch (error) {
      console.error("Error adding studio:", error);
      res.status(500).send("Internal Server Error");
    }
  });

  //* Define Get My Studios Listings route api url: http://localhost:5000/my-studio-listings/:userId */
  app.get("/my-studio-listings/:userId", requireAuth, async (req, res) => {
    try {
      const { userId } = req.params;

      if (userId !== req.user.id) {
        return res.status(403).json({ message: "You can only view your own studio listings." });
      }

      const query = { hostId: req.user.id };
      const studios = await studioCollection.find(query).toArray();
      res.status(200).json(studios);
    } catch (error) {
      console.error("Error fetching studios:", error);
      res.status(500).send("Internal Server Error");
    }
  });

  //* Define Update Studio route api url: http://localhost:5000/my-studio-listings/:id */
  app.patch("/my-studio-listings/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid studio ID." });
      }

      const query = { _id: new ObjectId(id) };
      const studio = await studioCollection.findOne(query);

      if (!studio) {
        return res.status(404).json({ message: "Studio not found." });
      }

      if (studio.hostId !== req.user.id) {
        return res.status(403).json({ message: "You can only edit your own studio listings." });
      }

      // Host identity is immutable.
      const { hostId, hostEmail, hostName, _id, ...updateData } = req.body;
      const update = { $set: updateData };

      const result = await studioCollection.updateOne(query, update);

      res.status(200).json(result);
    } catch (error) {
      console.error("Error updating studio:", error);
      res.status(500).send("Internal Server Error");
    }
  });

  //* Define Delete Studio route api url: http://localhost:5000/my-studio-listings/:id */
  app.delete("/my-studio-listings/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid studio ID." });
      }

      const query = { _id: new ObjectId(id) };
      const studio = await studioCollection.findOne(query);

      if (!studio) {
        return res.status(404).json({ message: "Studio not found." });
      }

      if (studio.hostId !== req.user.id) {
        return res.status(403).json({ message: "You can only delete your own studio listings." });
      }

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
  app.post("/booking", requireAuth, async (req, res) => {
    try {
      const studioId = req.body._id;

      if (!ObjectId.isValid(studioId)) {
        return res.status(400).json({ message: "Invalid studio ID." });
      }

      const studio = await studioCollection.findOne({ _id: new ObjectId(studioId) });

      if (!studio) {
        return res.status(404).json({ message: "Studio not found." });
      }

      // Never trust identity fields sent by the client.
      const bookingData = {
        ...req.body,
        hostId: studio.hostId,
        hostEmail: studio.hostEmail,
        hostName: studio.hostName,
        bookingUserId: req.user.id,
        bookingUserEmail: req.user.email,
        bookingUserName: req.user.name,
      };
      const result = await bookingsCollection.insertOne(bookingData);
      console.log(result);
      res.status(200).json(result);
    } catch (error) {
      console.error("Error creating booking:", error);
      res.status(500).send("Internal Server Error");
    }
  });

  //* Define Get Bookings by User Email route api url: http://localhost:5000/bookings/:email */
  app.get("/bookings/:email", requireAuth, async (req, res) => {
    try {
      const { email } = req.params;

      if (email.toLowerCase() !== req.user.email) {
        return res.status(403).json({ message: "You can only view your own bookings." });
      }

      const query = { bookingUserEmail: req.user.email };
      const bookings = await bookingsCollection.find(query).toArray();

      res.status(200).json(bookings);
    } catch (error) {
      console.error("Error fetching bookings:", error);
      res.status(500).send("Internal Server Error");
    }
  });


  //* Define Update Booking Status route api url: http://localhost:5000/dashboard/:id */
  app.patch("/dashboard/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const requesterEmail = req.user.email;

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

      const currentStatus = booking.status?.toLowerCase();
      const isHost = booking.hostEmail?.toLowerCase() === requesterEmail;
      const isCustomer = booking.bookingUserEmail?.toLowerCase() === requesterEmail;
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
  app.delete("/my-bookings/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      const query = ObjectId.isValid(id)
        ? { $or: [{ _id: id }, { _id: new ObjectId(id) }] }
        : { _id: id };

      const booking = await bookingsCollection.findOne(query);

      if (!booking) {
        return res.status(404).json({ message: "Booking not found." });
      }

      if (booking.bookingUserEmail?.toLowerCase() !== req.user.email) {
        return res.status(403).json({ message: "You can only delete your own bookings." });
      }

      const result = await bookingsCollection.deleteOne(query);
      res.status(200).json(result);
    } catch (error) {
      console.error("Error deleting booking:", error);
      res.status(500).send("Internal Server Error");
    }
  });

  //* Define Dashboard route api url: http://localhost:5000/dashboard/:email */
  app.get("/dashboard/:email", requireAuth, async (req, res) => {
    try {
      const { email } = req.params;

      if (email.toLowerCase() !== req.user.email) {
        return res.status(403).json({ message: "You can only view your own dashboard." });
      }

      const query = { hostEmail: req.user.email };
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
