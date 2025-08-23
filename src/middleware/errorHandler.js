
const errorHandler = (err, req, res, next) => {
    console.log("incoming errors", err.message)
    console.log("status code is", res.statusCode)
    const statusCode = (res.statusCode && res.statusCode !== 200) ? res.statusCode : 400;
    let message = err.message;
    if (err?.name == "CastError" && err?.kind == "ObjectId") {
        message = "No resource found with the given Id"
    }

    res.status(statusCode).json({
        message,
        errorStack: process.env.NODE_ENV == "development" ? err.stack : null
    })
}

module.exports = { errorHandler }