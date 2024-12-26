require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRECT, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.user = decoded;
    next();
  });
};
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.9fdmi.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    // assignments Collections
    const assignmentCollection = client
      .db("StudyHard_database")
      .collection("assingments");
    const submissionsCollection = client
      .db("StudyHard_database")
      .collection("submissions");

    // auth api
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRECT, {
        expiresIn: "9h",
      });

      res
        .cookie("token", token, {
          httpOnly: true,
          secure: false,
        })
        .send({ success: true });
    });
    app.post("/logout", (req, res) => {
      res
        .clearCookie("token", {
          httpOnly: true,
          secure: false,
        })
        .send({ success: true });
    });

    //   All assignments Api
    app.get("/assignments", async (req, res) => {
      const cursor = assignmentCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });
    // crete assignments
    app.post("/assignments", verifyToken, async (req, res) => {
      const newAssignment = req.body;
      const result = await assignmentCollection.insertOne(newAssignment);
      res.send(result);
    });

    // Assignments Details
    app.get("/assignments/:id", verifyToken, async (req, res) => {
      const id = req.params.id;

      // Validate the ObjectId
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid ID format" });
      }

      try {
        const query = { _id: new ObjectId(id) };
        const result = await assignmentCollection.findOne(query);

        if (!result) {
          return res.status(404).send({ message: "Assignment not found" });
        }

        res.send(result);
      } catch (err) {
        console.error(err);
        res
          .status(500)
          .send({ message: "Server error while fetching assignment" });
      }
    });
    // update
    app.put("/assignments/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const { user } = req;
      const assignment = await assignmentCollection.findOne({
        _id: new ObjectId(id),
      });

      if (assignment.email !== user.email) {
        return res.status(403).send({ message: "Permission denied" });
      }

      const updatedData = req.body;
      const result = await assignmentCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData }
      );

      res.send(result);
    });
    // delet

    // Submissions Details APIS
    app.get("/mysubmission", verifyToken, async (req, res) => {
      const email = req.query.email;
      const query = { examinee: email };
      const result = await submissionsCollection.find(query).toArray();
      for (const submission of result) {
        const query1 = { _id: new ObjectId(submission.submit_id) };
        const result1 = await assignmentCollection.findOne(query1);
        if (result1) {
          submission.title = result1.title;
          submission.marks = result1.marks;
        }
      }
      res.send(result);
    });
    // all submission
    app.get("/submission", verifyToken, async (req, res) => {
      const cursor = submissionsCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // Submission by id
    app.get("/submission/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await submissionsCollection.findOne(query);
      res.send(result);
    });
    // update api
    app.put("/submission/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const { marks, feedback, status } = req.body;
      const filter = { _id: new ObjectId(id) };
      const user = req.user;
      const submission = await submissionsCollection.findOne(filter);

      if (submission.examinee === user.email) {
        return res
          .status(403)
          .send({ message: "You can't mark your own submission." });
      }

      const updatedSubmission = {
        marks,
        feedback,
        status,
      };
      const result = await submissionsCollection.updateOne(filter, {
        $set: updatedSubmission,
      });

      if (result.modifiedCount === 1) {
        res.status(200).send({ message: "Submission updated successfully" });
      } else {
        res.status(400).send({ message: "Failed to update submission" });
      }
    });
    // all pendings
    app.get("/pending-assignments", verifyToken, async (req, res) => {
      const pendingAssignments = await submissionsCollection
        .find({ status: "pending" })
        .toArray();
      for (const submission of pendingAssignments) {
        const query1 = { _id: new ObjectId(submission.submit_id) };
        const result1 = await assignmentCollection.findOne(query1);
        if (result1) {
          submission.title = result1.title;
          submission.marks = result1.marks;
        }
      }
      res.send(pendingAssignments);
    });

    app.post("/submissions", verifyToken, async (req, res) => {
      const submissionData = req.body;
      const result = await submissionsCollection.insertOne(submissionData);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("study hard is started");
});

app.listen(port, () => {
  console.log(`Study hard: ${port}`);
});
