require("dotenv").config();
const http = require("https");
const express = require("express");
const session = require("express-session");
const mongoose = require("mongoose");
const path = require("path");
const app = express();
const parseurl = require("parseurl");
const crypto = require("crypto");
const cookie = require("cookie");
const nonce = require("nonce")();
const querystring = require("querystring");
const request = require("request-promise");
const bodyParser = require("body-parser");
const apiKey = process.env.SHOPIFY_API_KEY;
const apiSecret = process.env.SHOPIFY_API_SECRET;
const mongoConnect = require("connect-mongo")(session);
const forwardingAddress = "https://immense-bastion-25565.herokuapp.com"; // Replace this with your HTTPS Forwarding address
// get the url pathname
let pathname;
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useCreateIndex: true
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(
  session({
    secret: "mylittleSecrets.",
    resave: false,
    saveUninitialized: false,
    store: new mongoConnect({ mongooseConnection: mongoose.connection })
  })
);

app.use(function(req, res, next) {
  res.locals.session = req.session;
  next();
});

app.use(function(req, res, next) {
  if (!req.session.views) {
    req.session.views = {};
  }
  pathname = parseurl(req).pathname;
  // count the views
  req.session.views[pathname] = (req.session.views[pathname] || 0) + 1;

  next();
});

const shopSchema = new mongoose.Schema({
  name: String,
  data: JSON,
  sms: Array,
  smsCount: Number,
  template: Array
});

const Store = new mongoose.model("Store", shopSchema);

// install route ==>"/shopify/shop=?shopname.shopify.com
app.get("/shopify", (req, res) => {
  req.session.shop = req.query.shop;
  const shop = req.query.shop;

  console.log("install route call-->", shop);
  if (shop) {
    const state = nonce();
    const redirectUri = forwardingAddress + "/shopify/callback";
    const installUrl =
      "https://" +
      shop +
      "/admin/oauth/authorize?client_id=" +
      apiKey +
      "&scope=" +
      [
        "read_products ",
        "read_customers",
        "read_fulfillments",
        "read_checkouts",
        "read_analytics",
        "read_orders ",
        "read_script_tags",
        "write_script_tags"
      ] +
      "&state=" +
      state +
      "&redirect_uri=" +
      redirectUri;

    res.cookie(req.session.shop, state);

    res.redirect(installUrl);
  } else {
    return res
      .status(400)
      .send(
        "Missing shop parameter. Please add ?shop=your-development-shop.myshopify.com to your request"
      );
  }
});

//callback route -->
app.get("/shopify/callback", (req, res) => {
  let { shop, hmac, code, state } = req.query;
  console.log("callback route call -->", shop);
  const stateCookie = cookie.parse(req.headers.cookie)[`${shop}`];

  console.log("Statecookies", stateCookie);

  if (state !== stateCookie) {
    return res.status(403).send("Request origin cannot be verified");
  }

  if (shop && hmac && code) {
    // DONE: Validate request is from Shopify
    const map = Object.assign({}, req.query);
    delete map["signature"];
    delete map["hmac"];
    const message = querystring.stringify(map);
    const providedHmac = Buffer.from(hmac, "utf-8");
    const generatedHash = Buffer.from(
      crypto
        .createHmac("sha256", apiSecret)
        .update(message)
        .digest("hex"),
      "utf-8"
    );
    let hashEquals = false;

    try {
      hashEquals = crypto.timingSafeEqual(generatedHash, providedHmac);
    } catch (e) {
      hashEquals = false;
    }

    if (!hashEquals) {
      return res.status(400).send("HMAC validation failed");
    }

    // DONE: Exchange temporary code for a permanent access token

    const accessTokenRequestUrl =
      "https://" + shop + "/admin/oauth/access_token";
    const accessTokenPayload = {
      client_id: apiKey,
      client_secret: apiSecret,
      code
    };
    request
      .post(accessTokenRequestUrl, { json: accessTokenPayload })
      .then(accessTokenResponse => {
        Gtoken = accessTokenResponse.access_token;

        req.session.hmac = hmac;
        req.session.token = accessTokenResponse.access_token;

        console.log("top shop", req.session.shop);
        res.redirect("/");
      })
      .catch(error => {
        res.send(error);
        console.log("144-->", error);
      });
  } else {
    res.status(400).send("Required parameters missing");
  }
});

app.post("/myaction", function(req, res) {
  if (req.session.shop) {
    let shop = req.session.shop;
    let token = req.session.token;
    let hmac = req.session.hmac;
    Store.findOne({ name: shop }, function(err, data) {
      if (!err) {
        console.log("store found in DB");
        res.status(200).redirect("back");
        Store.findOneAndUpdate(
          { name: shop },
          { data: req.body },
          {
            new: true
          }
        );
      } else {
        console.log("store !found in DB");
        res.redirect(`https://${shop}/admin/apps/sms_update`);
        const store = new Store({
          name: shop,
          data: req.body,
          smsCount: 100
        });

        store.save(function(err) {
          if (!err) {
            console.log(`${shop} data store to DB`);
          }
        });

        var topics = ["orders/cancelled", "orders/fulfilled", "orders/create"];

        topics.forEach(topic => {
          makeWebook(topic, token, hmac, shop);
        });
      }
    });
  } else {
    console.log("cant find session key form post /myacion");
  }
});

const makeWebook = (topic, token, hmac, shop) => {
  const webhookUrl = "https://" + shop + "/admin/api/2019-07/webhooks.json";
  const webhookHeaders = {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": token,
    "X-Shopify-Topic": topic,
    "X-Shopify-Hmac-Sha256": hmac,
    "X-Shopify-Shop-Domain": shop,
    "X-Shopify-API-Version": "2019-07"
  };

  const webhookPayload = {
    webhook: {
      topic: topic,
      address: `https://immense-bastion-25565.herokuapp.com/store/${shop}/${topic}`,
      format: "json"
    }
  };
  request
    .post(webhookUrl, {
      headers: webhookHeaders,
      json: webhookPayload
    })
    .then(shopResponse => {
      console.log("showResponse-->", shopResponse);
    })
    .catch(error => {
      console.log("error-->", error);
    });
};

app.get("/api/option", function(req, res) {
  if (req.session.shop) {
    Store.findOne({ name: req.session.shop }, function(err, data) {
      if (data) {
        res.send(data);
      } else {
        res.send("");
      }
    });
  } else {
    console.log(
      "cant find session key form get /api/smsCount || your session timeout"
    );
  }
});
app.get("/api/smsCount", function(req, res) {
  if (req.session.shop) {
    Store.findOne({ name: req.session.shop }, function(err, data) {
      if (data) {
        var sms = data.smsCount + "";
        console.log("sms", sms);
        res.send(sms);
      } else {
        res.send("0");
      }
      // console.log("278", req.session.shop);
    });
  } else {
    console.log(
      "cant find session key form get /api/smsCount || your session timeout"
    );
  }
});

app.get("/api/history", function(req, res) {
  if (req.session.views[pathname]) {
    Store.findOne({ name: req.session.shop }, function(err, data) {
      if (data) {
        var history = data.sms;
        res.send(history);
      }
    });
  } else {
    console.log(
      "cant find session key form get /api/history || your session timeout"
    );
  }
});

app.post("/store/:shop/:topic/:subtopic", function(request, response) {
  const shop = request.params.shop;
  let topic = request.params.topic;
  const subtopic = request.params.subtopic;
  topic = topic + "/" + subtopic;
  Store.findOne({ name: shop }, function(err, data) {
    if (!err) {
      switch (topic) {
        case "orders/create":
          if (
            data.data["orders/create customer"] != undefined &&
            data.data["orders/create admin"] != undefined
          ) {
            // data.smsCount + 2
            Store.findOneAndUpdate(
              { name: shop },
              {
                $set: {
                  smsCount: data.smsCount - 1
                }
              },
              { new: true, useFindAndModify: false },
              (err, data) => {
                if (!err) {
                  console.log("datacount + 1");
                } else {
                  console.log("err", err);
                }
              }
            );
          }
          if (data.data["orders/create customer"] != undefined) {
            name = request.body.shipping_address.first_name;
            email = request.body.email;
            vendor = request.body.line_items[0].vendor;
            title = request.body.line_items[0].title;
            orderId = request.body.name;
            orderId = orderId.slice(1);
            price = request.body.total_price;
            phone = request.body.shipping_address.phone;
            phone1 = request.body.billing_address.phone;
            phone2 = request.body.customer.phone;
            address1 = request.body.shipping_address.address1;
            address2 = request.body.shipping_address.address2;
            city = request.body.shipping_address.city;
            country = request.body.shipping_address.country;
            //check in data base if there is exist any template for  orders/create
            message = `Hi%20${name},%20Thanks%20for%20shopping%20with%20us!%20Your%20order%20is%20confirmed,%20and%20will%20be%20shipped%20shortly.%20Your%20order%20ID:%20${orderId}`;

            if (data.template !== undefined) {
              data.template.forEach(element => {
                if (element.topic === topic) {
                  if (element.customer) {
                    message = element.customer;
                    for (let i = 0; i < message.length; i++) {
                      message = message.replace("${name}", name);
                      message = message.replace("${vendor}", vendor);
                      message = message.replace("${price}", price);
                      message = message.replace("${order_id}", orderId);
                      message = message.replace("${title}", title);
                    }
                  } else {
                    message = `Hi%20${name},%20Thanks%20for%20shopping%20with%20us!%20Your%20order%20is%20confirmed,%20and%20will%20be%20shipped%20shortly.%20Your%20order%20ID:%20${orderId}`;
                  }
                } else {
                  message = `Hi%20${name},%20Thanks%20for%20shopping%20with%20us!%20Your%20order%20is%20confirmed,%20and%20will%20be%20shipped%20shortly.%20Your%20order%20ID:%20${orderId}`;
                }
              });
            }
            //end
            let senderID = data.data["sender id"];
            if (phone) {
              sndSms(phone, vendor, message, senderID, shop);
            } else if (phone1) {
              sndSms(phone, vendor, message, senderID, shop);
            } else if (phone2) {
              sndSms(phone, vendor, message, senderID, shop);
            }
          }
          if (data.data["orders/create admin"] != undefined) {
            let admin = data.data["admin no"];
            adminNumber = admin;
            let senderID = data.data["sender id"];
            //check in data base if there is exist any template for  orders/create for admin
            message = `Customer%20name:%20${name},from%20shop:${shop}%20order%20ID:%20${orderId}`;

            if (data.template !== undefined) {
              data.template.forEach(element => {
                if (element.topic === topic) {
                  if (element.admin) {
                    message = element.admin;
                    for (let i = 0; i < message.length; i++) {
                      message = message.replace("${name}", name);
                      message = message.replace("${vendor}", vendor);
                      message = message.replace("${price}", price);
                      message = message.replace("${order_id}", orderId);
                      message = message.replace("${title}", title);
                    }
                  } else {
                    message = `Customer%20name:%20${name},from%20shop:${shop}%20order%20ID:%20${orderId}`;
                  }
                } else {
                  message = `Customer%20name:%20${name},from%20shop:${shop}%20order%20ID:%20${orderId}`;
                }
              });
            }
            //end
            sndSms(admin, vendor, message, senderID, shop);
          }

          break;
        case "orders/cancelled":
          if (
            data.data["orders/cancelled customer"] != undefined &&
            data.data["orders/cancelled admin"] != undefined
          ) {
            Store.findOneAndUpdate(
              { name: shop },
              {
                $set: {
                  smsCount: data.smsCount - 1
                }
              },
              { new: true, useFindAndModify: false },
              (err, data) => {
                if (!err) {
                  console.log("datacount + 1");
                } else {
                  console.log("err", err);
                }
              }
            );
          }
          if (data.data["orders/cancelled customer"] != undefined) {
            name = request.body.shipping_address.first_name;
            email = request.body.email;
            vendor = request.body.line_items[0].vendor;
            title = request.body.line_items[0].title;
            orderId = request.body.name;
            orderId = orderId.slice(1);
            price = request.body.total_price;
            phone = request.body.shipping_address.phone;
            phone1 = request.body.billing_address.phone;
            phone2 = request.body.customer.phone;
            address1 = request.body.shipping_address.address1;
            address2 = request.body.shipping_address.address2;
            city = request.body.shipping_address.city;
            country = request.body.shipping_address.country;
            cancelled_at = request.body.cancelled_at;
            cancel_reason = request.body.cancel_reason;
            message = `Hi%20${name},%20Thanks%20for%20trying%20us!%20Your%20order%20is%20cancelled,%20because%20${cancel_reason}%20at%20${cancelled_at}.%20Your%20order%20ID:%20${orderId}`;

            if (data.template !== undefined) {
              data.template.forEach(element => {
                if (element.topic === topic) {
                  if (element.customer) {
                    message = element.customer;
                    for (let i = 0; i < message.length; i++) {
                      message = message.replace("${name}", name);
                      message = message.replace("${vendor}", vendor);
                      message = message.replace("${price}", price);
                      message = message.replace("${order_id}", orderId);
                      message = message.replace("${title}", title);
                      message = message.replace(
                        "${cancel_reason}",
                        cancel_reason
                      );
                    }
                  } else {
                    message = `Hi%20${name},%20Thanks%20for%20trying%20us!%20Your%20order%20is%20cancelled,%20because%20${cancel_reason}%20at%20${cancelled_at}.%20Your%20order%20ID:%20${orderId}`;
                  }
                } else {
                  message = `Hi%20${name},%20Thanks%20for%20trying%20us!%20Your%20order%20is%20cancelled,%20because%20${cancel_reason}%20at%20${cancelled_at}.%20Your%20order%20ID:%20${orderId}`;
                }
              });
            }

            //end
            let senderID = data.data["sender id"];
            if (phone) {
              sndSms(phone, vendor, message, senderID, shop);
            } else if (phone1) {
              sndSms(phone, vendor, message, senderID, shop);
            } else if (phone2) {
              sndSms(phone, vendor, message, senderID, shop);
            }
          }
          if (data.data["orders/cancelled admin"] != undefined) {
            let admin = data.data["admin no"];
            adminNumber = admin;
            let senderID = data.data["sender id"];
            message = `Customer%20name:%20${name},cancel%20order%20beacuse%20${cancel_reason},order%20ID:%20${orderId}`;

            if (data.template !== undefined) {
              data.template.forEach(element => {
                if (element.topic === topic) {
                  if (element.admin) {
                    message = element.admin;
                    for (let i = 0; i < message.length; i++) {
                      message = message.replace("${name}", name);
                      message = message.replace("${vendor}", vendor);
                      message = message.replace("${price}", price);
                      message = message.replace("${order_id}", orderId);
                      message = message.replace("${title}", title);
                    }
                  } else {
                    message = `Customer%20name:%20${name},from%20shop:${shop}%20order%20ID:%20${orderId}`;
                  }
                } else {
                  message = `Customer%20name:%20${name},from%20shop:${shop}%20order%20ID:%20${orderId}`;
                }
              });
            }

            sndSms(admin, vendor, message, senderID, shop);
          }
          break;
        case "orders/fulfilled":
          if (
            data.data["orders/fulfilled customer"] != undefined &&
            data.data["orders/fulfilled admin"] != undefined
          ) {
            // data.smsCount + 2
            Store.findOneAndUpdate(
              { name: shop },
              {
                $set: {
                  smsCount: data.smsCount - 1
                }
              },
              { new: true, useFindAndModify: false },
              (err, data) => {
                if (!err) {
                  console.log("datacount + 1");
                } else {
                  console.log("err", err);
                }
              }
            );
          }
          if (data.data["orders/fulfilled customer"] != undefined) {
            name = request.body.shipping_address.first_name;
            email = request.body.email;
            vendor = request.body.line_items[0].vendor;
            title = request.body.line_items[0].title;
            orderId = request.body.name;
            orderId = orderId.slice(1);
            price = request.body.total_price;
            phone = request.body.shipping_address.phone;
            phone1 = request.body.billing_address.phone;
            phone2 = request.body.customer.phone;
            address1 = request.body.shipping_address.address1;
            address2 = request.body.shipping_address.address2;
            city = request.body.shipping_address.city;
            country = request.body.shipping_address.country;
            fulfillment_status = request.body.fulfillment_status;
            updated_at = request.body.updated_at;
            order_status_url = request.body.order_status_url;
            message = `Hi%20${name},%20Thanks%20for%20shopping%20with%20us!%20Your%20order%20is%20confirmed,%20and%20fulfillment%20status%20is%20${fulfillment_status}%20updated%20at%20${updated_at}.Your%order%status%20${order_status_url}.%20Your%20order%20ID:%20${orderId}`;
            //end

            if (data.template !== undefined) {
              data.template.forEach(element => {
                if (element.topic === topic) {
                  if (element.customer) {
                    message = element.customer;
                    for (let i = 0; i < message.length; i++) {
                      message = message.replace("${name}", name);
                      message = message.replace("${vendor}", vendor);
                      message = message.replace("${price}", price);
                      message = message.replace("${order_id}", orderId);
                      message = message.replace("${title}", title);
                      message = message.replace(
                        "${fulfillment_status}",
                        fulfillment_status
                      );
                      message = message.replace(
                        "${order_status_url}",
                        order_status_url
                      );
                    }
                  } else {
                    message = `Hi%20${name},%20Thanks%20for%20shopping%20with%20us!%20Your%20order%20is%20confirmed,%20and%20fulfillment%20status%20is%20${fulfillment_status}%20updated%20at%20${updated_at}.Your%order%status%20${order_status_url}.%20Your%20order%20ID:%20${orderId}`;
                  }
                } else {
                  message = `Hi%20${name},%20Thanks%20for%20shopping%20with%20us!%20Your%20order%20is%20confirmed,%20and%20fulfillment%20status%20is%20${fulfillment_status}%20updated%20at%20${updated_at}.Your%order%status%20${order_status_url}.%20Your%20order%20ID:%20${orderId}`;
                }
              });
            }

            let senderID = data.data["sender id"];
            if (phone) {
              sndSms(phone, vendor, message, senderID, shop);
            } else if (phone1) {
              sndSms(phone, vendor, message, senderID, shop);
            } else if (phone2) {
              sndSms(phone, vendor, message, senderID, shop);
            }
          }
          if (data.data["orders/fulfilled admin"] != undefined) {
            let admin = data.data["admin no"];
            adminNumber = admin;
            let senderID = data.data["sender id"];
            message = `Customer%20name:%20${name},from%20shop:${shop}%20order%20ID:%20${orderId},%20Order%20Status%20${fulfillment_status}`;

            if (data.template !== undefined) {
              data.template.forEach(element => {
                if (element.topic === topic) {
                  if (element.admin) {
                    message = element.admin;
                    for (let i = 0; i < message.length; i++) {
                      message = message.replace("${name}", name);
                      message = message.replace("${vendor}", vendor);
                      message = message.replace("${price}", price);
                      message = message.replace("${order_id}", orderId);
                      message = message.replace("${title}", title);
                      message = message.replace(
                        "${fulfillment_status}",
                        fulfillment_status
                      );
                      message = message.replace(
                        "${order_status_url}",
                        order_status_url
                      );
                    }
                  } else {
                    message = `Customer%20name:%20${name},from%20shop:${shop}%20order%20ID:%20${orderId},%20Order%20Status%20${fulfillment_status}`;
                  }
                } else {
                  message = `Customer%20name:%20${name},from%20shop:${shop}%20order%20ID:%20${orderId},%20Order%20Status%20${fulfillment_status}`;
                }
              });
            }

            sndSms(admin, vendor, message, senderID, shop);
          }
          break;
        case "orders/partially_fulfilled":
          if (
            data.data["orders/partially customer"] != undefined &&
            data.data["orders/partially admin"] != undefined
          ) {
            // data.smsCount + 2
            Store.findOneAndUpdate(
              { name: shop },
              {
                $set: {
                  smsCount: data.smsCount - 1
                }
              },
              { new: true, useFindAndModify: false },
              (err, data) => {
                if (!err) {
                  console.log("datacount + 1");
                } else {
                  console.log("err", err);
                }
              }
            );
          }
          if (data.data["orders/partially_fulfilled customer"] != undefined) {
            name = request.body.shipping_address.first_name;
            email = request.body.email;
            vendor = request.body.line_items[0].vendor;
            title = request.body.line_items[0].title;
            orderId = request.body.name;
            orderId = orderId.slice(1);

            price = request.body.total_price;

            phone = request.body.shipping_address.phone;
            phone1 = request.body.billing_address.phone;
            phone2 = request.body.customer.phone;

            address1 = request.body.shipping_address.address1;
            address2 = request.body.shipping_address.address2;
            city = request.body.shipping_address.city;
            country = request.body.shipping_address.country;

            fulfillment_status = request.body.fulfillment_status;
            updated_at = request.body.updated_at;
            order_status_url = request.body.order_status_url;

            message = `Hi%20${name},%20Thanks%20for%20shopping%20with%20us!%20Your%20order%20is%20confirmed,%20and%20fulfillment%20status%20is%20${fulfillment_status}%20updated%20at%20${updated_at}.Your%order%status%20${order_status_url}.%20Your%20order%20ID:%20${orderId}`;
            //end

            if (data.template !== undefined) {
              data.template.forEach(element => {
                if (element.topic === topic) {
                  if (element.customer) {
                    message = element.customer;
                    for (let i = 0; i < message.length; i++) {
                      message = message.replace("${name}", name);
                      message = message.replace("${vendor}", vendor);
                      message = message.replace("${price}", price);
                      message = message.replace("${order_id}", orderId);
                      message = message.replace("${title}", title);
                      message = message.replace(
                        "${fulfillment_status}",
                        fulfillment_status
                      );
                      message = message.replace(
                        "${order_status_url}",
                        order_status_url
                      );
                    }
                  } else {
                    message = `Hi%20${name},%20Thanks%20for%20shopping%20with%20us!%20Your%20order%20is%20confirmed,%20and%20fulfillment%20status%20is%20${fulfillment_status}%20updated%20at%20${updated_at}.Your%order%status%20${order_status_url}.%20Your%20order%20ID:%20${orderId}`;
                  }
                } else {
                  message = `Hi%20${name},%20Thanks%20for%20shopping%20with%20us!%20Your%20order%20is%20confirmed,%20and%20fulfillment%20status%20is%20${fulfillment_status}%20updated%20at%20${updated_at}.Your%order%status%20${order_status_url}.%20Your%20order%20ID:%20${orderId}`;
                }
              });
            }

            let senderID = data.data["sender id"];

            if (phone) {
              sndSms(phone, vendor, message, senderID, shop);
            } else if (phone1) {
              sndSms(phone, vendor, message, senderID, shop);
            } else if (phone2) {
              sndSms(phone, vendor, message, senderID, shop);
            }
          }
          if (data.data["orders/partially_fulfilled admin"] != undefined) {
            let admin = data.data["admin no"];
            adminNumber = admin;
            let senderID = data.data["sender id"];
            message = `Customer%20name:%20${name},from%20shop:${shop}%20order%20ID:%20${orderId},%20Order%20Status%20${fulfillment_status}`;

            if (data.template !== undefined) {
              data.template.forEach(element => {
                if (element.topic === topic) {
                  if (element.admin) {
                    message = element.admin;
                    for (let i = 0; i < message.length; i++) {
                      message = message.replace("${name}", name);
                      message = message.replace("${vendor}", vendor);
                      message = message.replace("${price}", price);
                      message = message.replace("${order_id}", orderId);
                      message = message.replace("${title}", title);
                      message = message.replace(
                        "${fulfillment_status}",
                        fulfillment_status
                      );
                      message = message.replace(
                        "${order_status_url}",
                        order_status_url
                      );
                    }
                  } else {
                    message = `Customer%20name:%20${name},from%20shop:${shop}%20order%20ID:%20${orderId},%20Order%20Status%20${fulfillment_status}`;
                  }
                } else {
                  message = `Customer%20name:%20${name},from%20shop:${shop}%20order%20ID:%20${orderId},%20Order%20Status%20${fulfillment_status}`;
                }
              });
            }

            sndSms(admin, vendor, message, senderID, shop);
          }
          break;
        case "customers/create":
          if (
            data.data["customers/create customer"] != undefined &&
            data.data["customers/create admin"] != undefined
          ) {
            // data.smsCount + 2
            Store.findOneAndUpdate(
              { name: shop },
              {
                $set: {
                  smsCount: data.smsCount - 1
                }
              },
              { new: true, useFindAndModify: false },
              (err, data) => {
                if (!err) {
                  console.log("datacount + 1");
                } else {
                  console.log("err", err);
                }
              }
            );
          }
          if (data.data["customers/create customer"] != undefined) {
            name = request.body.first_name;
            email = request.body.email;

            phone = request.body.phone;

            message = `Hi%20${name},%20Thanks%20for%20showing%20interest%20on%20us!%20Your%20account%20is%20created,%20Happy%20Shopping.`;

            if (data.template !== undefined) {
              data.template.forEach(element => {
                if (element.topic === topic) {
                  if (element.customer) {
                    message = element.customer;
                    for (let i = 0; i < message.length; i++) {
                      message = message.replace("${email}", email);
                      message = message.replace("${phone}", phone);
                      message = message.replace("${name}", name);
                    }
                  } else {
                    message = `Hi%20${name},%20Thanks%20for%20showing%20interest%20on%20us!%20Your%20account%20is%20created,%20Happy%20Shopping.`;
                  }
                } else {
                  message = `Hi%20${name},%20Thanks%20for%20showing%20interest%20on%20us!%20Your%20account%20is%20created,%20Happy%20Shopping.`;
                }
              });
            }

            //end

            let senderID = data.data["sender id"];

            if (phone) {
              sndSms(phone, vendor, message, senderID, shop);
            }
          }
          if (data.data["customers/create admin"] != undefined) {
            let admin = data.data["admin no"];
            adminNumber = admin;
            let senderID = data.data["sender id"];
            message = `New%20Customer%20${name},%20arrived.`;

            if (data.template !== undefined) {
              data.template.forEach(element => {
                if (element.topic === topic) {
                  if (element.admin) {
                    message = element.admin;
                    for (let i = 0; i < message.length; i++) {
                      message = message.replace("${email}", email);
                      message = message.replace("${phone}", phone);
                      message = message.replace("${name}", name);
                    }
                  } else {
                    message = `New%20Customer%20${name},%20arrived.`;
                  }
                } else {
                  message = `New%20Customer%20${name},%20arrived.`;
                }
              });
            }

            sndSms(admin, vendor, message, senderID, shop);
          }
          break;
        case "refunds/create":
          if (
            data.data["refunds/create customer"] != undefined &&
            data.data["refunds/create admin"] != undefined
          ) {
            // data.smsCount + 2
            Store.findOneAndUpdate(
              { name: shop },
              {
                $set: {
                  smsCount: data.smsCount - 1
                }
              },
              { new: true, useFindAndModify: false },
              (err, data) => {
                if (!err) {
                  console.log("datacount + 1");
                } else {
                  console.log("err", err);
                }
              }
            );
          }
          if (data.data["refunds/create customer"] != undefined) {
            title = request.body.refund_line_items[0].line_item.title;
            orderId = request.body.order_id;
            price = request.body.refund_line_items[0].subtotal;

            message = `Hi%20customer,%20Thanks%20for%20shopping%20with%20us!%20Your%20refund%20is%20started,price%20money%20is%20${price}.Your%20order%20ID:%20${orderId}`;
            //end

            if (data.template !== undefined) {
              data.template.forEach(element => {
                if (element.topic === topic) {
                  if (element.customer) {
                    message = element.customer;
                    for (let i = 0; i < message.length; i++) {
                      message = message.replace("${price}", price);
                      message = message.replace("${order_id}", orderId);
                      message = message.replace("${title}", title);
                    }
                  } else {
                    message = `Hi%20customer,%20Thanks%20for%20shopping%20with%20us!%20Your%20refund%20is%20started,price%20money%20is%20${price}.Your%20order%20ID:%20${orderId}`;
                  }
                } else {
                  message = `Hi%20customer,%20Thanks%20for%20shopping%20with%20us!%20Your%20refund%20is%20started,price%20money%20is%20${price}.Your%20order%20ID:%20${orderId}`;
                }
              });
            }

            let senderID = data.data["sender id"];

            if (phone) {
              sndSms(phone, vendor, message, senderID, shop);
            } else if (phone1) {
              sndSms(phone, vendor, message, senderID, shop);
            } else if (phone2) {
              sndSms(phone, vendor, message, senderID, shop);
            }
          }
          if (data.data["refunds/create admin"] != undefined) {
            let admin = data.data["admin no"];
            adminNumber = admin;
            let senderID = data.data["sender id"];
            message = `Hi%20Customer%20from%20shop:${shop}%20order%20ID:%20${orderId},we%20start%20your%20refund%20process`;

            if (data.template !== undefined) {
              data.template.forEach(element => {
                if (element.topic === topic) {
                  if (element.admin) {
                    message = element.admin;
                    for (let i = 0; i < message.length; i++) {
                      message = message.replace(
                        "${processed_at}",
                        processed_at
                      );
                      message = message.replace("${vendor}", vendor);
                      message = message.replace("${price}", price);
                      message = message.replace("${order_id}", orderId);
                      message = message.replace("${title}", title);
                    }
                  } else {
                    message = `Hi%20Customer%20from%20shop:${shop}%20order%20ID:%20${orderId},we%20start%20your%20refund%20process`;
                  }
                } else {
                  message = `Hi%20Customer%20from%20shop:${shop}%20order%20ID:%20${orderId},we%20start%20your%20refund%20process`;
                }
              });
            }

            sndSms(admin, vendor, message, senderID, shop);
          }
          break;
        /////////////////////////////////////////////
        default:
          console.log("!possible");
          break;
      }
    } else {
      console.log(err);
    }
  });
  response.sendStatus(200);
});

const sndSms = (phone, store, message, senderID, shop) => {
  message = message.replace(/ /g, "%20");
  Store.findOne({ name: shop }, function(err, data) {
    if (!err) {
      if (data.smsCount > 0) {
        //send SMS
        var options = {
          method: "GET",
          hostname: "api.msg91.com",
          port: null,
          path: `/api/sendhttp.php?mobiles=${phone}&authkey=300328AHqrb8dPQZ35daf0fb0&route=4&sender=${senderID}&message=${message}&country=91`,
          headers: {}
        };
        var req = http.request(options, function(res) {
          var chunks = [];

          res.on("data", function(chunk) {
            chunks.push(chunk);
          });

          res.on("end", function() {
            var body = Buffer.concat(chunks);
            console.log(body.toString());
          });
        });
        //save sms data to DB

        var obj = {
          description: message.replace(/%20/g, " ").replace(/%0A/g, " "),
          term: phone
          // number: shop
        };

        Store.findOneAndUpdate(
          { name: shop },
          {
            $push: { sms: obj },
            $set: {
              smsCount: data.smsCount - 1
            }
          },
          { new: true, useFindAndModify: false },
          (err, data) => {
            if (!err) {
              console.log("data");
            } else {
              console.log("err", err);
            }
          }
        );
        req.end();
      } else if (data.smsCount == 0 || data.smsCount == -1) {
        // notify admin to recharge
        //send SMS mgs91ed
        phone = adminNumber;
        message = `Your%20SMS_UPDATE%20pack%20is%20exausted,from%20shop:${shop}plesase%20recharge`;
        var options = {
          method: "GET",
          hostname: "api.msg91.com",
          port: null,
          path: `/api/sendhttp.php?mobiles=${phone}&authkey=${SMS_API}&route=4&sender=MOJITO&message=${message}&country=91`,
          headers: {}
        };
        var req = http.request(options, function(res) {
          var chunks = [];

          res.on("data", function(chunk) {
            chunks.push(chunk);
          });

          res.on("end", function() {
            var body = Buffer.concat(chunks);
            console.log(body.toString());
          });
        });
        //save sms data to DB
        var obj = {
          message: message,
          store: store,
          number: phone
        };
        Store.findOneAndUpdate(
          { name: shop },
          {
            $push: { sms: obj },
            $set: {
              smsCount: data.smsCount - 1
            }
          },
          { new: true, useFindAndModify: false },
          (err, data) => {
            if (!err) {
              console.log("data");
            } else {
              console.log("err", err);
            }
          }
        );
        req.end();
      } else {
        console.log("admin still not recharge");
      }
    }
  });
};

// save template to db
app.post("/api/template", function(req, res) {
  let data = req.body;

  if (req.session.shop) {
    Store.findOneAndUpdate(
      { name: req.session.shop },
      {
        $push: { template: data }
      },
      { new: true, useFindAndModify: false },
      (err, data) => {
        if (!err) {
          console.log("data");
        } else {
          console.log("err", err);
        }
      }
    );
  } else {
    console.log("session timeout");
  }
});

// send rechage smscount to db
app.post("/api/recharge", function(req, res) {
  let sms = req.body;

  if (req.session.shop) {
    Store.findOne({ name: req.session.shop }, function(err, data) {
      if (data) {
        var smsLeft = data.smsCount;
        console.log("smsLeft", smsLeft);
        Store.findOneAndUpdate(
          { name: req.session.shop },
          {
            $set: {
              smsCount: smsLeft + parseInt(sms.smsCount)
            }
          },
          { new: true, useFindAndModify: false },
          (err, data) => {
            if (!err) {
              console.log("data");
            } else {
              console.log("err", err);
            }
          }
        );
      } else {
        res.send("100");
      }
    });
  } else {
    console.log("sesssion timeout");
  }
});
//////////////
if (process.env.NODE_ENV === "production") {
  app.use(express.static("client/build"));
  app.get("*", (req, res) => {
    res.sendFile(path.resolve(__dirname, "client", "build", "index.html"));
  });
}

const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`app listening on port ${port}!`);
});
