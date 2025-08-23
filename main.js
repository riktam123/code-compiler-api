const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
require("dotenv").config();
const app = express();
app.use(cors());
app.use(bodyParser.json());

app.get("/", (req, res) => {
	res.status(200).send({ message: "Running..." });
});

app.use("/run", require("./src/routes/codeRunner"));

app.listen(5100, () => console.log("Server running on port 5100"));
