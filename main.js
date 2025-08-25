const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const helmet = require("helmet");
const { errorHandler } = require("./src/middleware/errorHandler");
require("dotenv").config();
const app = express();
app.use(cors());
app.use(helmet());
app.use(bodyParser.json());
app.set("x-powered-by", false);

app.use(errorHandler);

app.get("/", (req, res) => {
	res.status(200).send({ message: "Running..." });
});
app.use("/run", require("./src/routes/codeRunner"));

app.use((req, res, next) => {
	res.status(404).send("Sorry can't find that!");
});

app.listen(5100, () => {
	console.log("Server running on port 5100");
});
