const express = require("express");
const app = express();
const port = 3000;

// Middleware (nếu cần)
app.use(express.json());

// Route cơ bản
app.get("/", (req, res) => {
  res.send("Hello, world!");
});

// Start server
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
