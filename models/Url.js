const mongoose = require("mongoose");

const urlSchema = new mongoose.Schema({
  urlCode: String,
  longUrl: String,
  shortUrl: String,
  followUp: Number,
  shop: String,
  id: Number,
  price: Number,
  shop: String
});

module.exports = mongoose.model("Url", urlSchema);
