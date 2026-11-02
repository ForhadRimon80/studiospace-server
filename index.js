import express from "express";
import { MongoClient } from "mongodb";
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

connectToMongoDB();

//* Define Home route */
app.get("/", (req, res) => {
  res.send("Hello, World!");
});

 //* Start the server */
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
