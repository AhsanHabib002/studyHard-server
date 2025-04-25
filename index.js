require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://studyhard-fda66.web.app",
      "https://studyhard-fda66.firebaseapp.com",
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// JWT Token Verification Middleware
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ message: "Unauthorized access" });

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRECT, (err, decoded) => {
    if (err) return res.status(401).json({ message: "Unauthorized access" });
    req.user = decoded;
    next();
  });
};

// MongoDB Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.9fdmi.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const db = client.db("StudyHard_database");
    const assignmentCollection = db.collection("assignments");
    const submissionsCollection = db.collection("submissions");

    // Auth APIs
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRECT, {
        expiresIn: "9h",
      });

      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
      }).send({ success: true });
    });

    app.post("/logout", (req, res) => {
      res.clearCookie("token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
      }).send({ success: true });
    });

    // Assignments APIs
    app.get("/assignments", async (req, res) => {
      const { difficulty } = req.query;
      const query = difficulty ? { difficulty } : {};
      const result = await assignmentCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/assignments", verifyToken, async (req, res) => {
      const newAssignment = req.body;
      const result = await assignmentCollection.insertOne(newAssignment);
      res.send(result);
    });

    app.get("/assignments/:id", verifyToken, async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid ID format" });

      const result = await assignmentCollection.findOne({ _id: new ObjectId(id) });
      if (!result) return res.status(404).json({ message: "Assignment not found" });

      res.send(result);
    });

    app.put("/assignments/:id", verifyToken, async (req, res) => {
      const { id } = req.params;
      const assignment = await assignmentCollection.findOne({ _id: new ObjectId(id) });

      if (assignment.email !== req.user.email) {
        return res.status(403).json({ message: "Permission denied" });
      }

      const result = await assignmentCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: req.body }
      );
      res.send(result);
    });

    app.delete("/assignments/:id", verifyToken, async (req, res) => {
      const { id } = req.params;
      const result = await assignmentCollection.deleteOne({ _id: new ObjectId(id), email: req.user.email });
      res.json({
        success: result.deletedCount === 1,
        message: result.deletedCount === 1 ? "Assignment deleted successfully." : "Assignment not found or you don't have permission."
      });
    });

    // Submissions APIs
    app.get("/mysubmission", verifyToken, async (req, res) => {
      const email = req.query.email;
      if (req.user.email !== email) return res.status(403).json({ message: "Forbidden access" });

      const result = await submissionsCollection.find({ examinee: email }).toArray();
      for (let submission of result) {
        const assignment = await assignmentCollection.findOne({ _id: new ObjectId(submission.submit_id) });
        if (assignment) {
          submission.title = assignment.title;
          submission.marks = assignment.marks;
        }
      }
      res.send(result);
    });

    app.get("/submission", verifyToken, async (req, res) => {
      const result = await submissionsCollection.find().toArray();
      res.send(result);
    });

    app.get("/submission/:id", verifyToken, async (req, res) => {
      const { id } = req.params;
      const result = await submissionsCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.put("/submission/:id", verifyToken, async (req, res) => {
      const { id } = req.params;
      const { obtainmarks, feedback, status } = req.body;
      const submission = await submissionsCollection.findOne({ _id: new ObjectId(id) });

      if (submission.examinee === req.user.email) {
        return res.status(403).json({ success: false, message: "You can't mark your own submission." });
      }

      const result = await submissionsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { obtainmarks, feedback, status } }
      );

      if (result.modifiedCount === 1) {
        res.status(200).json({ success: true, message: "Submission updated successfully" });
      } else {
        res.status(400).json({ success: false, message: "Failed to update submission" });
      }
    });

    app.get("/pending-assignments", verifyToken, async (req, res) => {
      const result = await submissionsCollection.find({ status: "pending" }).toArray();
      for (let submission of result) {
        const assignment = await assignmentCollection.findOne({ _id: new ObjectId(submission.submit_id) });
        if (assignment) {
          submission.title = assignment.title;
          submission.marks = assignment.marks;
        }
      }
      res.send(result);
    });

    app.post("/submissions", verifyToken, async (req, res) => {
      const result = await submissionsCollection.insertOne(req.body);
      res.send(result);
    });

  } catch (err) {
    console.error(err);
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Study Hard API is running.");
});

app.listen(port, () => {
  console.log(`Study Hard server is listening on port ${port}`);
});