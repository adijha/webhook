require('dotenv').config();
const cron = require('node-cron');
const http = require('https');
const express = require('express');
const session = require('express-session');
const shortid = require('shortid');
const validUrl = require('valid-url');
const mongoose = require('mongoose');
const colors = require('colors');
const path = require('path');
const moment = require('moment');
const app = express();
const parseurl = require('parseurl');
const crypto = require('crypto');
const cookie = require('cookie');
const nonce = require('nonce')();
const querystring = require('querystring');
const request = require('request-promise');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const apiKey = process.env.SHOPIFY_API_KEY;
const apiSecret = process.env.SHOPIFY_API_SECRET;
const mongoConnect = require('connect-mongo')(session);
const axios = require('axios');

const Url = require('./models/Url');
require('newrelic');
const forwardingAddress = 'https://sms-update-test.herokuapp.com'; // Replace this with your HTTPS Forwarding address
const connectDB = require('./db/connectMongo');
connectDB();

// get the url pathname

let pathname;

app.use(bodyParser.json());
app.use(
	bodyParser.urlencoded({
		extended : true
	})
);
app.use(
	session({
		secret            : 'mylittleSecrets.',
		resave            : false,
		saveUninitialized : false,
		store             : new mongoConnect({
			mongooseConnection : mongoose.connection
		}),
		cookie            : {
			secure   : true,
			sameSite : 'none'
		}
	})
);

app.set('trust proxy', true);

app.use(function(req, res, next) {
	res.locals.session = req.session;
	next();
});

if (process.env.NODE_ENV === 'development') {
	app.use(morgan('dev'));
}

app.use(function(req, res, next) {
	if (!req.session.views) {
		req.session.views = {};
	}
	pathname = parseurl(req).pathname;
	// count the views
	req.session.views[pathname] = (req.session.views[pathname] || 0) + 1;
	next();
});
app.use('/s', require('./routes/index'));
const Store = require('./models/Shop');
//!URL SHORTNER
const shorten = async (params) => {
	console.log(params);
	let { longUrl } = params;
	let { followUp } = params;
	let { id } = params;
	let { price } = params;
	let { phone } = params;
	let { shop } = params;
	let { name } = params;
	let baseUrl = process.env.BASEURL;
	// Check base url
	if (!validUrl.isUri(baseUrl)) {
		return 'Invalid base url';
	}
	// Create url code
	const urlCode = shortid.generate();
	// Check long url /
	if (validUrl.isUri(longUrl)) {
		try {
			let url = await Url.findOne({
				longUrl
			});
			if (url) {
				Url.findOneAndUpdate(
					{
						id : url.id
					},
					{
						$push : {
							followUp : followUp
						}
					},
					{
						new              : true,
						useFindAndModify : false
					},
					(err, result) => {
						if (!err) {
							console.log('result from 96', result);
						} else {
							console.log('error from 98', err);
						}
					}
				);
				let shopDetail = await Store.findOne({
					name : shop
				});
				let senderId = shopDetail.data['sender id'];
				let message = 'letMessage';
				await Store.findOne(
					{
						name   : shop,
						orders : {
							$elemMatch : {
								id : id
							}
						}
					},
					(err, data) => {
						if (err) {
							console.log(err);
						} else {
							data.orders.forEach((e) => {
								if (e.id === id) {
									name = e.name;
									vendor = e.vendor;
								}
							});
						}
					}
				);
				await Store.findOne(
					{
						name            : shop,
						abandanTemplate : {
							$elemMatch : {
								topic : followUp
							}
						}
					},
					(err, data) => {
						if (err) {
							console.log(err);
						} else {
							data.abandanTemplate.forEach((e) => {
								if (e.topic === followUp + '') {
									message = e.template;
									for (let i = 0; i < message.length; i++) {
										message = message.replace('${customer_name}', name);
										message = message.replace('${store_name}', vendor);
										message = message.replace('${abandoned_checkout_url}', url.shortUrl);
										message = message.replace('${amount}', url.price);
									}
									sndSms(phone, message, senderId, shop);
								}
							});
						}
					}
				);
				return url;
			} else {
				console.log('url !found, save new URL');
				const shortUrl = baseUrl + '/' + 's' + '/' + urlCode;
				url = new Url({
					urlCode,
					longUrl,
					shortUrl,
					followUp,
					id,
					shop,
					price
					//   name
				});
				await url.save();
				let shopDetail = await Store.findOne({
					name : shop
				});
				let senderId = shopDetail.data['sender id'];
				let message = 'Message';
				await Store.findOne(
					{
						name   : shop,
						orders : {
							$elemMatch : {
								id : id
							}
						}
					},
					(err, data) => {
						if (err) {
							console.log(err);
						} else {
							data.orders.forEach((e) => {
								if (e.id === id) {
									name = e.name;
									vendor = e.vendor;
								}
							});
						}
					}
				);
				await Store.findOne(
					{
						name            : shop,
						abandanTemplate : {
							$elemMatch : {
								topic : followUp
							}
						}
					},
					(err, data) => {
						if (err) {
							console.log(err);
						} else {
							data.abandanTemplate.forEach(async (e) => {
								if (e.topic === followUp + '') {
									message = e.template;
									for (let i = 0; i < message.length; i++) {
										message = message.replace('${customer_name}', name);
										message = message.replace('${store_name}', vendor);
										message = message.replace('${abandoned_checkout_url}', shortUrl);
										message = message.replace('${amount}', price);
									}
									sndSms(phone, message, senderId, shop);
								}
							});
						}
					}
				);
				return url;
			}
		} catch (err) {
			console.error('err 109 -->', err);
			return 'Server error';
		}
	} else {
		return 'Invalid long url';
	}
};
//install route
app.get('/shopify', (req, res) => {
	req.session.shop = req.query.shop;
	const shop = req.query.shop;
	if (shop) {
		const state = nonce();
		const redirectUri = forwardingAddress + '/shopify/callback';
		const installUrl =
			'https://' +
			shop +
			'/admin/oauth/authorize?client_id=' +
			apiKey +
			'&scope=' +
			[
				'read_products ',
				'read_customers',
				'read_fulfillments',
				'read_checkouts',
				'read_analytics',
				'read_orders ',
				'read_script_tags',
				'write_script_tags'
			] +
			'&state=' +
			state +
			'&redirect_uri=' +
			redirectUri;
		res.cookie(req.session.shop, state, {
			secure   : true,
			sameSite : 'none'
		});
		res.redirect(installUrl);
	} else {
		return res
			.status(400)
			.send('Missing shop parameter. Please add ?shop=your-development-shop.myshopify.com to your request');
	}
});
//callback route
app.get('/shopify/callback', (req, res) => {
	let { shop, hmac, code, state } = req.query;
	const stateCookie = cookie.parse(req.headers.cookie)[`${shop}`];
	if (state !== stateCookie) {
		return res.status(403).send('Request origin cannot be verified');
	}
	if (shop && hmac && code) {
		const map = Object.assign({}, req.query);
		delete map['signature'];
		delete map['hmac'];
		const message = querystring.stringify(map);
		const providedHmac = Buffer.from(hmac, 'utf-8');
		const generatedHash = Buffer.from(
			crypto.createHmac('sha256', apiSecret).update(message).digest('hex'),
			'utf-8'
		);
		let hashEquals = false;
		try {
			hashEquals = crypto.timingSafeEqual(generatedHash, providedHmac);
		} catch (e) {
			hashEquals = false;
		}
		if (!hashEquals) {
			return res.status(400).send('HMAC validation failed');
		}
		const accessTokenRequestUrl = 'https://' + shop + '/admin/oauth/access_token';
		const accessTokenPayload = {
			client_id     : apiKey,
			client_secret : apiSecret,
			code
		};
		request
			.post(accessTokenRequestUrl, {
				json : accessTokenPayload
			})
			.then((accessTokenResponse) => {
				Gtoken = accessTokenResponse.access_token;
				req.session.hmac = hmac;
				req.session.token = accessTokenResponse.access_token;
				res.redirect('/');
			})
			.catch((error) => {
				res.send(error);
			});
	} else {
		res.status(400).send('Required parameters missing');
	}
});
app.post('/api/myaction', function(req, res) {
	if (req.session.shop) {
		let shop = req.session.shop;
		let token = req.session.token;
		let hmac = req.session.hmac;
		console.log('req.body-->320 line details from settings', req.body);
		Store.findOne(
			{
				name : shop
			},
			function(err, data) {
				if (data) {
					console.log('store found in DB');
					// res.sendStatus(200).redirect('back');
					res.sendStatus(200);
					// res.redirect("back");
					Store.findOneAndUpdate(
						{
							name : shop
						},
						{
							$set : {
								data        : req.body,
								uninstalled : false
							}
						},
						{
							new              : true,
							useFindAndModify : false
						},
						(err, data) => {
							if (!err) {
								//   console.log("datacount + 1");
							} else {
								console.log('238 err-->', err);
							}
						}
					);
				} else {
					console.log('store !found in DB');
					const store = new Store({
						name            : shop,
						uninstalled     : false,
						recharge        : 10,
						data            : req.body,
						smsCount        : 10,
						template        : [
							{
								topic    : 'orders/create',
								customer :
									'`Hi%20${name},%20Thanks%20for%20shopping%20with%20us!%20Your%20order%20is%20confirmed.%20Your%20order%20ID:%20${order_id}`',
								admin    : '`Hi%20Admin,%20${name}%20placed%20order`'
							},
							{
								topic    : 'orders/cancelled',
								customer :
									'`Hi%20${name}%20your%20order%20ID:%20${order_id}%20is%20cancelled.%20We%20started%20your%20refund%20process.`',
								admin    : '`Hi%20Admin,%20${name}%20cancelled%20order%20`'
							},
							{
								topic    : 'orders/fulfilled',
								customer :
									'`Hi%20${name}%20your%20order%20ID:%20${order_id}%20is%20fulfilled.%20We%20started%20your%20delivery%20process.`',
								admin    : "`Hi%20Admin,%20${name}'s%20order%20fulfilled`"
							}
						],
						abandanTemplate : [
							{
								topic    : '1',
								template :
									"`Hey%20${customer_name}!%20We%20noticed%20you%20left%20some%20items%20in%20your%20cart.%20Get%20them%20before%20they're%20gone!%20Visit%20this%20link%20to%20complete%20the%20order:%20${abandoned_checkout_url}.%20-${store_name}`",
								time     : '30',
								status   : false
							},
							{
								topic    : '2',
								template :
									"`Hey%20${customer_name}!%20We%20noticed%20you%20left%20some%20items%20in%20your%20cart.%20Get%20them%20before%20they're%20gone!%20Visit%20this%20link%20to%20complete%20the%20order:%20${abandoned_checkout_url}.%20-${store_name}`",
								time     : '60',
								status   : false
							},
							{
								topic    : '3',
								template :
									"`Hey%20${customer_name}!%20We%20noticed%20you%20left%20some%20items%20in%20your%20cart.%20Get%20them%20before%20they're%20gone!%20Visit%20this%20link%20to%20complete%20the%20order:%20${abandoned_checkout_url}.%20-${store_name}`",
								time     : '60',
								status   : false
							},
							{
								topic    : '4',
								template :
									"`Hey%20${customer_name}!%20We%20noticed%20you%20left%20some%20items%20in%20your%20cart.%20Get%20them%20before%20they're%20gone!%20Visit%20this%20link%20to%20complete%20the%20order:%20${abandoned_checkout_url}.%20-${store_name}`",
								time     : '60',
								status   : false
							}
						]
					});
					store.save(function(err, data) {
						if (!err) {
							console.log(`${shop} data store to DB`, data);
						} else {
							console.log(err);
						}
					});
					var topics = [
						'orders/cancelled',
						'orders/fulfilled',
						'orders/create',
						'checkouts/create',
						'checkouts/update',
						'app/uninstalled'
					];
					topics.forEach((topic) => {
						makeWebook(topic, token, hmac, shop);
						console.log({ topic, token, hmac, shop });
					});
					res.sendStatus(200);
					// .redirect(`https://${shop}/admin/apps/sms_update`);
				}
			}
		);
	} else {
		console.log('cant find session key form post /myacion');
	}
});
const makeWebook = (topic, token, hmac, shop) => {
	const webhookUrl = 'https://' + shop + '/admin/api/2019-07/webhooks.json';
	const webhookHeaders = {
		'Content-Type'           : 'application/json',
		'X-Shopify-Access-Token' : token,
		'X-Shopify-Topic'        : topic,
		'X-Shopify-Hmac-Sha256'  : hmac,
		'X-Shopify-Shop-Domain'  : shop,
		'X-Shopify-API-Version'  : '2019-07'
	};
	const webhookPayload = {
		webhook : {
			topic   : topic,
			address : `https://bell.ml/store/${shop}/${topic}`,
			format  : 'json'
		}
	};
	request
		.post(webhookUrl, {
			headers : webhookHeaders,
			json    : webhookPayload
		})
		.then((shopResponse) => {
			console.log('webhook topic :', topic);
		})
		.catch((error) => {
			console.log('309 error-->', error);
		});
};
app.post('/store/:shop/:topic/:subtopic', function(request, response) {
	const shop = request.params.shop;
	let topic = request.params.topic;
	const subtopic = request.params.subtopic;
	topic = topic + '/' + subtopic;
	console.log('topic -->', topic);
	Store.findOne(
		{
			name : shop
		},
		async (err, data) => {
			if (!err) {
				let name;

				let vendor;
				let title;
				let orderId;
				let price;
				let phone;
				let phone1;
				let phone2;

				let message;
				let checkoutName;
				switch (topic) {
					case 'checkouts/update':
						console.log('checkouts/create response');

						if (request.body.shipping_address != undefined) {
							if (request.body.shipping_address.phone != null) {
								Store.findOne(
									{
										name   : shop,
										orders : {
											$elemMatch : {
												id : request.body.id
											}
										}
									},
									(err, data) => {
										if (err) {
											console.log(err);
										} else {
											if (data === null) {
												console.log('save new order');
												console.log(request.body);
												let a = request.body.subtotal_price;
												let b = request.body.total_price;
												let c = request.body.total_line_items_price;
												console.log(a, 'subtotal');
												console.log(b, 'total');
												console.log(c, 'total_line_price');
												if (request.body.customer.first_name) {
													checkoutName = request.body.customer.first_name;
												} else {
													if (request.body.shipping_address.name) {
														checkoutName = request.body.shipping_address.name;
													} else {
														checkoutName = request.body.billing_address.name;
													}
												}
												let obj = {
													id     : request.body.id,
													phone  : request.body.shipping_address.phone.replace(/\s/g, ''),
													name   : checkoutName,
													email  : request.body.email,
													vendor : request.body.line_items[0].vendor,
													price  : request.body.subtotal_price,
													url    : request.body.abandoned_checkout_url
												};
												Store.findOne(
													{
														name : shop
													},
													function(err, data) {
														if (data.abandanTemplate) {
															data.abandanTemplate.forEach((e) => {
																if (e.topic === '1' && e.status === true) {
																	obj.f1 = moment().add(e.time, 'minutes').format();
																} else if (e.topic === '2' && e.status === true) {
																	obj.f2 = moment().add(e.time, 'minutes').format();
																} else if (e.topic === '3' && e.status === true) {
																	obj.f3 = moment().add(e.time, 'minutes').format();
																} else if (e.topic === '4' && e.status === true) {
																	obj.f4 = moment().add(e.time, 'minutes').format();
																}
															});
															Store.findOneAndUpdate(
																{
																	name : shop
																},
																{
																	$addToSet : {
																		orders : obj
																	}
																},
																{
																	new              : true,
																	useFindAndModify : false
																},
																(err, data) => {
																	if (!err) {
																		console.log('data add to DB', topic, data);
																	} else {
																		console.log('556 err', err);
																	}
																}
															);
														} else {
															console.log('There is no abandanTemplate data');
														}
													}
												);
											} else {
												console.log('bypass');
											}
										}
									}
								);
							}
						}
						break;
					case 'orders/create':
						console.log('orders/create response');

						console.log(
							'some if result: ',
							data.data['orders/create customer'],
							data.data['orders/create admin'],
							'data.data starts from here',
							data.data
						);

						name = request.body.shipping_address.first_name;
						email = request.body.email;
						order_status_url = request.body.order_status_url;
						vendor = request.body.line_items[0].vendor;
						title = request.body.line_items[0].title;
						orderId = request.body.name;
						orderId = orderId.slice(1);
						price = request.body.total_price;
						if (request.body.customer.phone) {
							phone = request.body.customer.phone;
						} else if (request.body.billing_address.phone) {
							phone = request.body.billing_address.phone;
						} else {
							phone = request.body.shipping_address.phone;
						}
						try {
							let updated = await Store.updateOne(
								{
									name        : shop,
									'orders.id' : request.body.checkout_id
								},
								{
									$set : {
										'orders.$.purchase' : true
									}
								}
							);
							// if (updated) {
							console.log(updated, 'updated');

							//check if through our abandan message converted these sales

							try {
								let ourConverted = await Store.updateOne(
									{
										name    : shop,
										clicked : {
											$elemMatch : {
												checkoutId : request.body.checkout_id
											}
										}
									},
									{
										$set : {
											'clicked.$.converted' : true
										}
									}
								);

								console.log(ourConverted);
							} catch (error) {
								console.error(error);
							}
							// }
						} catch (error) {
							console.error(error);
							console.log('unable to mark as purchase true');
						}

						if (data.data['orders/create customer'] === true && data.data['orders/create admin'] === true) {
							console.log('both true at orders/create');
							// data.smsCount + 2
							// Store.findOneAndUpdate(
							// 	{
							// 		name: shop
							// 	},
							// 	{
							// 		$set: {
							// 			smsCount: data.smsCount - 1
							// 		}
							// 	},
							// 	{
							// 		new: true,
							// 		useFindAndModify: false
							// 	},
							// 	(err, data) => {
							// 		if (!err) {
							// 			console.log('data remove', topic, data);
							// 		} else {
							// 			console.log('err 620', err);
							// 		}
							// 	}
							// );
						}
						if (data.data['orders/create customer'] === true) {
							console.log('customer true at orders/create');

							message = `Hi%20${name},%20Thanks%20for%20shopping%20with%20us!%20Your%20order%20is%20confirmed,%20and%20will%20be%20shipped%20shortly.%20Your%20order%20ID:%20${orderId}`;
							if (data.template !== undefined) {
								data.template.forEach((element) => {
									if (element.topic === topic) {
										if (element.customer) {
											message = element.customer;
											console.log('messane before replace');
											for (let i = 0; i < message.length; i++) {
												if (message.includes('${name}')) {
													message = message.replace('${name}', name);
												}
												if (message.includes('${order_status_url}')) {
													message = message.replace('${order_status_url}', order_status_url);
												}
												if (message.includes('${vendor}')) {
													message = message.replace('${vendor}', vendor);
												}
												if (message.includes('${price}')) {
													message = message.replace('${price}', price);
												}
												if (message.includes('${order_id}')) {
													message = message.replace('${order_id}', orderId);
												}
												if (message.includes('${title}')) {
													message = message.replace('${title}', title);
												}
											}
										} else {
											console.log('orders/create customer message template not found');
										}
									} else {
										console.log('orders/create customer message template not found');
									}
								});
							}
							//end
							//check for senderId
							let senderID;
							if (data.data['sender id']) {
								senderID = await data.data['sender id'];
							} else {
								senderID = 'shopit';
								console.log("This shop don't have senderId");
							}
							if (phone) {
								sndSms(phone, message, senderID, shop);
							} else {
								console.log("create/order didn't come with phone no");
							}
						}

						if (data.data['orders/create admin'] === true) {
							console.log('admin true at orders/create');

							message = `Customer%20name:%20${name},from%20shop:${shop}%20order%20ID:%20${orderId}`;
							if (data.template !== undefined) {
								data.template.forEach((element) => {
									if (element.topic === topic) {
										if (element.admin) {
											message = element.admin;
											for (let i = 0; i < message.length; i++) {
												if (message.includes('${name}')) {
													message = message.replace('${name}', name);
												}
												if (message.includes('${vendor}')) {
													message = message.replace('${vendor}', vendor);
												}
												if (message.includes('${price}')) {
													message = message.replace('${price}', price);
												}
												if (message.includes('${order_id}')) {
													message = message.replace('${order_id}', orderId);
												}
												if (message.includes('${title}')) {
													message = message.replace('${title}', title);
												}
											}
										} else {
											console.log('orders/create admin message template not found');
										}
									} else {
										console.log('orders/create admin message template not found');
									}
								});
							}
							let admin;
							let senderID;
							try {
								admin = await data.data['admin no'];
								senderID = await data.data['sender id'];
							} catch (error) {
								console.log(error, 'does not have senderid or admin no');
							}
							//end
							if (admin && message && senderID && shop) {
								try {
									sndSms(admin, message, senderID, shop);
								} catch (error) {
									console.error(error);
								}
							} else {
								console.log('missing admin no or message or senderid or shop');
							}
						}
						break;
					case 'orders/fulfilled':
						console.log('orders/fulfilled response');

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
						if (
							data.data['orders/fulfilled customer'] === true &&
							data.data['orders/fulfilled admin'] === true
						) {
							// data.smsCount + 2
							// Store.findOneAndUpdate(
							// 	{
							// 		name: shop
							// 	},
							// 	{
							// 		$set: {
							// 			smsCount: data.smsCount - 1
							// 		}
							// 	},
							// 	{
							// 		new: true,
							// 		useFindAndModify: false
							// 	},
							// 	(err, data) => {
							// 		if (!err) {
							// 			console.log('datacount + 1');
							// 		} else {
							// 			console.log('err', err);
							// 		}
							// 	}
							// );
						}
						if (data.data['orders/fulfilled customer'] === true) {
							message = `Hi%20${name},%20Thanks%20for%20shopping%20with%20us!%20Your%20order%20is%20confirmed,%20and%20fulfillment%20status%20is%20${fulfillment_status}%20updated%20at%20${updated_at}.Your%order%status%20${order_status_url}.%20Your%20order%20ID:%20${orderId}`;
							//end
							if (data.template !== undefined) {
								data.template.forEach((element) => {
									if (element.topic === topic) {
										if (element.customer) {
											message = element.customer;
											for (let i = 0; i < message.length; i++) {
												if (message.includes('${name}')) {
													message = message.replace('${name}', name);
												}
												if (message.includes('${vendor}')) {
													message = message.replace('${vendor}', vendor);
												}
												if (message.includes('${price}')) {
													message = message.replace('${price}', price);
												}
												if (message.includes('${order_id}')) {
													message = message.replace('${order_id}', orderId);
												}
												if (message.includes('${title}')) {
													message = message.replace('${title}', title);
												}
												if (message.includes('${fulfillment_status}')) {
													message = message.replace(
														'${fulfillment_status}',
														fulfillment_status
													);
												}
												if (message.includes('${order_status_url}')) {
													message = message.replace('${order_status_url}', order_status_url);
												}
											}
										} else {
											console.log('orders/fulfille customer message template not found');
										}
									} else {
										console.log('orders/fulfille customer message template not found');
									}
								});
							}
							let senderID = data.data['sender id'];
							if (phone) {
								sndSms(phone, message, senderID, shop);
							} else if (phone1) {
								sndSms(phone, message, senderID, shop);
							} else if (phone2) {
								sndSms(phone, message, senderID, shop);
							}
						}
						if (data.data['orders/fulfilled admin'] === true) {
							let admin = data.data['admin no'];
							adminNumber = admin;
							let senderID = data.data['sender id'];
							message = `Customer%20name:%20${name},from%20shop:${shop}%20order%20ID:%20${orderId},%20Order%20Status%20${fulfillment_status}`;
							if (data.template !== undefined) {
								data.template.forEach((element) => {
									if (element.topic === topic) {
										if (element.admin) {
											message = element.admin;
											for (let i = 0; i < message.length; i++) {
												if (message.includes('${name}')) {
													message = message.replace('${name}', name);
												}
												if (message.includes('${vendor}')) {
													message = message.replace('${vendor}', vendor);
												}
												if (message.includes('${price}')) {
													message = message.replace('${price}', price);
												}
												if (message.includes('${order_id}')) {
													message = message.replace('${order_id}', orderId);
												}
												if (message.includes('${title}')) {
													message = message.replace('${title}', title);
												}
												if (message.includes('${fulfillment_status}')) {
													message = message.replace(
														'${fulfillment_status}',
														fulfillment_status
													);
												}
												if (message.includes('${order_status_url}')) {
													message = message.replace('${order_status_url}', order_status_url);
												}
												if (message.includes('${updated_at}')) {
													message = message.replace('${updated_at}', updated_at);
												}
											}
										} else {
											console.log('orders/fulfillment admin message template not found');
										}
									} else {
										console.log('orders/fulfilled admin message template not found');
									}
								});
							}
							sndSms(admin, message, senderID, shop);
						}
						break;
					case 'orders/cancelled':
						console.log('orders/cancelled response');

						name = request.body.shipping_address.first_name;
						if (name == undefined || name == null) {
							name = request.body.billing_address.first_name;
							name = request.body.customer.first_name;
						}
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
						if (
							data.data['orders/cancelled customer'] === true &&
							data.data['orders/cancelled admin'] === true
						) {
							// Store.findOneAndUpdate(
							// 	{
							// 		name: shop
							// 	},
							// 	{
							// 		$set: {
							// 			smsCount: data.smsCount - 1
							// 		}
							// 	},
							// 	{
							// 		new: true,
							// 		useFindAndModify: false
							// 	},
							// 	(err, data) => {
							// 		if (!err) {
							// 			console.log('datacount + 1');
							// 		} else {
							// 			console.log('err', err);
							// 		}
							// 	}
							// );
						}
						if (data.data['orders/cancelled customer'] === true) {
							message = `Hi%20${name}%20your%20order%20ID:%20${orderId}%20is%20cancelled.%20We%20will%20process%20refund%20soon.`;
							if (data.template !== undefined) {
								data.template.forEach((element) => {
									if (element.topic === topic) {
										if (element.customer) {
											message = element.customer;
											for (let i = 0; i < message.length; i++) {
												if (message.includes('${name}')) {
													message = message.replace('${name}', name);
												}
												if (message.includes('${vendor}')) {
													message = message.replace('${vendor}', vendor);
												}
												if (message.includes('${price}')) {
													message = message.replace('${price}', price);
												}
												if (message.includes('${orderId}')) {
													message = message.replace('${orderId}', orderId);
												}
												if (message.includes('${order_id}')) {
													message = message.replace('${order_id}', orderId);
												}
												if (message.includes('${title}')) {
													message = message.replace('${title}', title);
												}
												if (message.includes('${cancel_reason}')) {
													message = message.replace('${cancel_reason}', cancel_reason);
												}
											}
										} else {
											console.log('orders/cancelled customer message template not found');
										}
									} else {
										console.log('orders/cancelled customer message template not found');
									}
								});
							}
							//end
							let senderID = data.data['sender id'];
							if (phone) {
								sndSms(phone, message, senderID, shop);
							} else if (phone1) {
								sndSms(phone, message, senderID, shop);
							} else if (phone2) {
								sndSms(phone, message, senderID, shop);
							}
						}
						if (data.data['orders/cancelled admin'] === true) {
							let admin = data.data['admin no'];
							adminNumber = admin;
							let senderID = data.data['sender id'];
							message = `Customer%20name:%20${name},cancelled%20order%20beacuse%20${cancel_reason},order%20ID:%20${orderId}`;
							if (data.template !== undefined) {
								data.template.forEach((element) => {
									if (element.topic === topic) {
										if (element.admin) {
											message = element.admin;
											for (let i = 0; i < message.length; i++) {
												if (message.includes('${name}')) {
													message = message.replace('${name}', name);
												}
												if (message.includes('${vendor}')) {
													message = message.replace('${vendor}', vendor);
												}
												if (message.includes('${price}')) {
													message = message.replace('${price}', price);
												}
												if (message.includes('${order_id}')) {
													message = message.replace('${order_id}', orderId);
												}
												if (message.includes('${title}')) {
													message = message.replace('${title}', title);
												}
											}
										} else {
											console.log('orders/cancelled admin message template not found');
										}
									} else {
										console.log('orders/cancelled admin message template not found');
									}
								});
							}
							sndSms(admin, message, senderID, shop);
						}
						break;
					case 'app/uninstalled':
						//! todo
						console.log(`app uninstallation request from ${shop}`);

						try {
							const uninstalle = await Store.findOneAndUpdate(
								{
									name : shop
								},
								{
									$set : {
										uninstalled : true
									}
								},
								{
									new              : true,
									useFindAndModify : false
								}
							);
							console.log('someone uninstalled app', shop);
							console.log(uninstalle);
						} catch (error) {
							console.error(error);
						}

						break;
					default:
						console.log('!possible');
						break;
				}
			} else {
				console.log(err);
			}
		}
	);
	response.sendStatus(200);
});

const sndSms = async (phone, message, senderID, shop) => {
	console.log('sms api hit');
	message = message.replace(/ /g, '%20');
	console.log('type:->> ', typeof phone, phone, 'phone 971 webhook');
	console.log(phone, '<-- phone sndSmS');
	console.log(message, '<-- messge sndSmS');
	console.log(senderID, '<-- senderID sndSmS');
	console.log(shop, '<-- shop sndSmS');
	//to ensure message does not contains backticks
	for (let i = 0; i < message.length; i++) {
		message = message.replace('`', '');
		message = message.replace('$', '');
		// message = message.replace('%', '');
		message = message.replace('@', '');
		message = message.replace('^', '');
		message = message.replace('&', '');
		message = message.replace('*', '');
		message = message.replace('<', '');
		message = message.replace('>', '');
		message = message.replace('#', '');
	}
	// to ensure phone no. is of 10 digits remove first "0" of phone no
	phone = phone.toString();
	if (phone.includes('e') || phone.includes('-')) {
		console.log("phone no. includes '-' or 'e', that's why we can't send message");
	}
	phone = phone.replace(/ /g, '');
	let fn = phone[0];
	console.log(fn), 'fn';
	if (fn === '0' || fn === '1' || fn === '2' || fn === '3' || fn === '4' || fn === '5') {
		phone = phone.replace(fn, '');
	}
	fn = phone[0];
	console.log(fn), 'fn';
	if (fn === '0' || fn === '1' || fn === '2' || fn === '3' || fn === '4' || fn === '5') {
		phone = phone.replace(fn, '');
	}
	fn = phone[0];
	console.log(fn), 'fn';
	if (fn === '0' || fn === '1' || fn === '2' || fn === '3' || fn === '4' || fn === '5') {
		phone = phone.replace(fn, '');
	}
	console.log(typeof phone, phone, 'after removing');
	console.log(phone.length);
	if (phone.length >= 10) {
		phone = parseInt(phone);
		console.log(typeof phone, phone, 'after converting');
	} else {
		console.log(" can't send sms because, phone number is < 10 digits i.e : ", phone);
	}

	Store.findOne(
		{
			name : shop
		},
		async function(err, data) {
			if (!err) {
				console.log('dddsdsd df dkv dv ckd v d');
				let smsapi = process.env.SMS_API;
				let LeftSMS = data.smsCount - data.sms.length;
				if (LeftSMS > 0) {
					//send SMS

					var options = {
						method             : 'GET',
						url                : 'https://global.datagenit.com/API/sms-api.php',
						qs                 : {
							auth     : 'D!~42924V0hc35Jaf',
							senderid : senderID,
							msisdn   : phone,
							message  : message
						},
						headers            : { 'cache-control': 'no-cache' },
						rejectUnauthorized : false
					};
					//  var options = {
					//   method: "GET",
					//   hostname: "api.datagenit.com",
					//   port: null,
					//   path: `https://api.datagenit.com/sms?auth=${smsapi}&msisdn=${phone}&senderid=${senderID}&message=${message}`,
					//   headers: {},
					// };
					try {
						console.log('options', options);

						var req = request(options, function(error, response, body) {
							if (error) throw new Error('sms error send', error);

							console.log(body);
							return body;
						});
						// var req =  request(options, function(res) {
						// 	console.log(res);
						// 	var chunks = [];
						// 	// res.on('data', function(chunk) {
						// 	// 	chunks.push(chunk);
						// 	// });
						// 	// res.on('end', function() {
						// 	// 	var body = Buffer.concat(chunks);
						// 	// 	console.log(body.toString());
						// 	// });
						// });
					} catch (error) {
						console.error("sms couldn't send because of:", error);
					}
					//save sms data to DB
					var obj = {
						description : message.replace(/%20/g, ' ').replace(/%0A/g, ' '),
						term        : phone
					};
					``;
					Store.findOneAndUpdate(
						{
							name : shop
						},
						{
							$push : {
								sms : obj
							}
						},
						{
							new              : true,
							useFindAndModify : false
						},
						(err, data) => {
							if (!err) {
								console.log('data');
							} else {
								console.log('err', err);
							}
						}
					);
					req.end();
				} else if (LeftSMS < 1) {
					console.log('SMS Quota Exhausted');
					// Store.findOneAndUpdate(
					// 	{
					// 		name: shop
					// 	},
					// 	{
					// 		$push: {
					// 			sms: obj
					// 		},
					// 		$set: {
					// 			smsCount: 0
					// 		}
					// 	},
					// 	{
					// 		new: true,
					// 		useFindAndModify: false
					// 	},
					// 	(err, data) => {
					// 		if (!err) {
					// 			console.log('data');
					// 		} else {
					// 			console.log('err', err);
					// 		}
					// 	}
					// );
				} else {
					console.log('admin still not recharge');
				}
			}
		}
	);
};

app.get('/api/option', async (req, res) => {
	// req.session.shop = 'demo-mojito.myshopify.com';
	if (req.session.shop) {
		try {
			const result = await Store.findOne({
				name : req.session.shop
			});
			console.log('data found');

			if (result) {
				res.send(result.data);
			}
		} catch (error) {
			res.send('');
			console.error(error);
		}
	} else {
		console.log('cant find session key form get /api/smsCount || your session timeout');
	}
});
//abandan template
app.get('/api/abandanTemplate', async (req, res) => {
	// req.session.shop = 'demo-mojito.myshopify.com';
	if (req.session.shop) {
		try {
			const data = await Store.findOne({
				name : req.session.shop
			});

			res.send(data.abandanTemplate);
		} catch (error) {
			console.error(error);
			res.send('!found');
		}
	} else {
		console.log('cant find session key form get /api/abandanTemplate || your session timeout');
	}
});
//template
app.get('/api/template', async (req, res) => {
	// req.session.shop = 'demo-mojito.myshopify.com'; //delete this localTesting
	console.log('API called');
	if (req.session.shop) {
		try {
			const data = await Store.findOne({
				name : req.session.shop
			});

			res.send(data.template);
		} catch (error) {
			console.error(error);
			res.send('!found');
		}
	} else {
		console.log('cant find session key form get /api/abandanTemplate || your session timeout');
	}
});
app.get('/api/smsCount', async (req, res) => {
	// req.session.shop = 'demo-mojito.myshopify.com'; //delete this localTesting
	if (req.session.shop) {
		try {
			let our = await Store.findOne({ name: req.session.shop });
			let leftSMS = our.smsCount - our.sms.length;
			leftSMS = leftSMS + '';
			res.send(leftSMS).status(200);
		} catch (error) {
			res.send('0');
			console.error(error);
		}
	} else {
		console.log('cant find session key form get /api/smsCount || your session timeout');
	}
});
///////////////////
// app.post('/rechargeSMS', async (req, res) => {
// 	try {
// 		let our = await Store.findOne({ name: req.body.shop });
// 		let rechargeCount = our.recharge;
// 		rechargeCount = rechargeCount + req.body.recharge;
// 		let ourRecharged = await Store.updateOne(
// 			{
// 				name: req.body.shop
// 			},
// 			{
// 				$set: {
// 					recharge: rechargeCount
// 				}
// 			}
// 		);
// 		console.log(ourRecharged);
// 		res.send(ourRecharged);
// 	} catch (error) {
// 		console.error(error);
// 	}
// });
//////////////////
app.get('/api/history', async (req, res) => {
	// req.session.shop = 'demo-mojito.myshopify.com';
	// if (req.session.views[pathname]) {
	try {
		let data = await Store.findOne({ name: req.session.shop });
		if (data) {
			var history = data.sms;
			history = history.reverse();
			history.length = 50;
			res.send(history);
		}
	} catch (error) {
		console.error(error);
	}
	// } else {
	// 	console.log('cant find session key form get /api/history || your session timeout');
	// }
});
// dashboard
app.get('/api/dashboard', async (req, res) => {
	// req.session.shop = 'demo-mojito.myshopify.com';

	if (req.session.shop) {
		let convertedFolowUpCount = [ 0, 0, 0, 0 ];
		let convertedFolowUpPrice = [ 0, 0, 0, 0 ];
		let clickThroughCount = [ 0, 0, 0, 0 ];
		try {
			const currentStore = await Store.findOne({
				name : req.session.shop
			});

			currentStore.clicked.forEach(async (element) => {
				//converted followUp count and price
				if (element.converted === true) {
					let last = element.followUp[element.followUp.length - 1];
					if (last === 1) {
						convertedFolowUpCount[0]++;
						console.log(element.price, 1);
						convertedFolowUpPrice[0] = convertedFolowUpPrice[0] + element.price;
					}
					if (last === 2) {
						console.log(element.price, 2);
						convertedFolowUpCount[1]++;
						convertedFolowUpPrice[1] = convertedFolowUpPrice[1] + element.price;
					}
					if (last === 3) {
						console.log(element.price, 3);
						convertedFolowUpCount[2]++;
						convertedFolowUpPrice[2] = convertedFolowUpPrice[2] + element.price;
					}
					if (last === 4) {
						console.log(element.price, 4);
						convertedFolowUpCount[3]++;
						convertedFolowUpPrice[3] = convertedFolowUpPrice[3] + element.price;
					}
				} else {
					if (element.followUp.includes(1)) {
						clickThroughCount[0]++;
					}
					if (element.followUp.includes(2)) {
						clickThroughCount[1]++;
					}
					if (element.followUp.includes(3)) {
						clickThroughCount[2]++;
					}
					if (element.followUp.includes(4)) {
						clickThroughCount[3]++;
					}
				}
			});
			console.log(convertedFolowUpCount, 'count');
			console.log(convertedFolowUpPrice, 'price');
			console.log(clickThroughCount, 'click');
			res.send({ convertedFolowUpPrice, convertedFolowUpCount, clickThroughCount });
		} catch (error) {
			console.error(error);

			res.send({
				convertedFolowUpCount : [ 9, 9, 9, 9 ],
				clickThroughCount     : [ 99, 99, 99, 99 ],
				convertedFolowUpPrice : [ 999, 999, 999, 9 ]
			});
			console.log('cant find session key form get /api/dashboard || your session timeout');
		}
	}
});

// save template to db
app.post('/api/template', function(req, res) {
	// req.session.shop = 'uadaan.myshopify.com'; //delete this localTesting
	console.log('template change request-->', req.body);
	console.log('template change request shop-->', req.session.shop);
	res.sendStatus(200);
	let topic = req.body.topic.trim();
	let customer = '';
	let admin = '';
	//check in db if there is any template is present then switch it to value
	if (req.body['customerTemplate'] != null) {
		console.log('customer value 1 ');
		customer = req.body['customerTemplate'];
		console.log(topic);
		console.log(customer);
		if (req.session.shop) {
			Store.findOneAndUpdate(
				{
					name             : req.session.shop,
					'template.topic' : topic
				},
				{
					$set : {
						'template.$.topic'    : topic,
						'template.$.customer' : customer
					}
				},
				{
					new              : true,
					useFindAndModify : false
				},
				(err, result) => {
					if (err) {
						console.log(err);
					} else {
						let obj = {
							topic    : topic,
							customer : customer,
							admin    : admin
						};
						if (result === null) {
							console.log('result === null');
							Store.findOneAndUpdate(
								{
									name : req.session.shop
								},
								{
									// $addToSet: { template: req.body }
									$addToSet : {
										template : obj
									}
								},
								{
									new              : true,
									useFindAndModify : false
								},
								(err, data) => {
									console.log('delte form db');
									if (!err) {
										console.log('data-template->', data);
									} else {
										console.log('err');
									}
								}
							);
						}
					}
				}
			);
		} else {
			console.log('session timeout');
		}
	} else {
		admin = req.body['adminTemplate'];
		if (req.session.shop) {
			Store.findOneAndUpdate(
				{
					name             : req.session.shop,
					'template.topic' : topic
				},
				{
					$set : {
						'template.$.topic' : topic,
						// "template.$.customer": customer,
						'template.$.admin' : admin
					}
				},
				{
					new              : true,
					useFindAndModify : false
				},
				(err, result) => {
					if (err) {
						console.log(err);
					} else {
						let obj = {
							topic    : topic,
							customer : customer,
							admin    : admin
						};
						if (result === null) {
							Store.findOneAndUpdate(
								{
									name : req.session.shop
								},
								{
									// $addToSet: { template: req.body }
									$addToSet : {
										template : obj
									}
								},
								{
									new              : true,
									useFindAndModify : false
								},
								(err, data) => {
									console.log('delte form db');
									if (!err) {
										console.log('data');
									} else {
										console.log('err');
									}
								}
							);
						}
					}
				}
			);
		} else {
			console.log('session timeout');
		}
	}
});
// save abandan template to db
app.post('/api/abandanTemplate', function(req, res) {
	console.log(req.body, 'AT body');
	// req.session.shop = 'uadaan.myshopify.com'; //delete this localTesting
	if (req.session.shop) {
		Store.findOneAndUpdate(
			{
				name                    : req.session.shop,
				'abandanTemplate.topic' : req.body.topic
			},
			{
				$set : {
					'abandanTemplate.$.topic'    : req.body.topic,
					'abandanTemplate.$.template' : req.body.template,
					'abandanTemplate.$.time'     : req.body.time,
					'abandanTemplate.$.status'   : req.body.status
				}
			},
			{
				new              : true,
				useFindAndModify : false
			},
			(err, result) => {
				console.log(result, 'result');
				if (err) {
					console.log(err);
				} else {
					if (result === null) {
						console.log('result ==null');
						Store.findOneAndUpdate(
							{
								name : req.session.shop
							},
							{
								$addToSet : {
									abandanTemplate : req.body
								}
							},
							{
								new              : true,
								useFindAndModify : false
							},
							(err, data) => {
								if (!err) {
									console.log('data', data);
								} else {
									console.log('err');
								}
							}
						);
					}
				}
			}
		);
	} else {
		console.log('session timeout');
	}

	res.sendStatus(200);
});
// send rechage smscount to db
// app.post('/api/recharge', async (req, res) => {
// 	let sms = req.body;
// 	if (req.session.shop) {
// 		try {
// 			const result = await Store.findOne({
// 				name: req.session.shop
// 			});

// 			var smsLeft = result.smsCount;
// 			console.log('smsLeft', smsLeft);

// 			try {
// 				const data = await Store.findOneAndUpdate(
// 					{
// 						name: req.session.shop
// 					},
// 					{
// 						$set: {
// 							smsCount: smsLeft + parseInt(sms.smsCount)
// 						}
// 					},
// 					{
// 						new: true,
// 						useFindAndModify: false
// 					}
// 				);
// 				console.log(data, 'data');
// 			} catch (error) {
// 				console.error(error);
// 			}
// 		} catch (error) {
// 			console.error(error);
// 		}
// 	} else {
// 		console.log('sesssion timeout');
// 	}
// });

cron.schedule('*/2 * * * * ', async () => {
	//getting list of all store name
	console.log('!production cron started');
	var storeName = [];
	try {
		const stores = await Store.find({
			uninstalled : false

			// smsCount: {
			// 	$gt: 0
			// }
		});

		stores.forEach(async (smsLeftStore) => {
			if (smsLeftStore.smsCount - smsLeftStore.sms.length > 0) {
				await storeName.push(smsLeftStore.name);
			}
		});

		// stores.forEach(async (store) => {
		// });

		let interval = moment().subtract(2, 'minutes').format();
		let current = moment().format();

		storeName.forEach(async (store) => {
			console.log('Performing on store-->', store);

			try {
				const data = await Store.findOne({ name: store });

				data.orders.forEach(async (order) => {
					if (order.f1 && order.purchase === false) {
						if (moment(order.f1).isBetween(interval, current)) {
							console.log('call shortner function for', order.f1);
							let obj = {
								longUrl  : order.url,
								phone    : order.phone,
								followUp : 1,
								id       : order.id,
								price    : order.price,
								vendor   : order.vendor,
								name     : order.name,
								shop     : store
							};
							const short = async () => {
								let res = '';
								res = await shorten(obj);
								console.log('for followUP 1', res);
							};
							short();
						}
					}
					if (order.f2 && order.purchase === false) {
						if (moment(order.f2).isBetween(interval, current)) {
							console.log('call shortner function for', order.f2);
							let obj = {
								longUrl  : order.url,
								followUp : 2,
								id       : order.id,
								price    : order.price,
								phone    : order.phone,
								vendor   : order.vendor,
								name     : order.name,
								shop     : store
							};
							const short = async () => {
								let res = '';
								res = await shorten(obj);
								console.log('for followUP 2', res);
							};
							short();
						}
					}
					if (order.f3 && order.purchase === false) {
						if (moment(order.f3).isBetween(interval, current)) {
							console.log('call shortner function for', order.f3);
							let obj = {
								longUrl  : order.url,
								followUp : 3,
								id       : order.id,
								price    : order.price,
								phone    : order.phone,
								vendor   : order.vendor,
								name     : order.name,
								shop     : store
							};
							const short = async () => {
								let res = '';
								res = await shorten(obj);
								console.log('for followUP 3', res);
							};
							short();
						}
					}
					if (order.f4 && order.purchase === false) {
						if (moment(order.f4).isBetween(interval, current)) {
							console.log('call shortner function for', order.f4);
							let obj = {
								longUrl  : order.url,
								followUp : 4,
								phone    : order.phone,
								id       : order.id,
								price    : order.price,
								vendor   : order.vendor,
								name     : order.name,
								shop     : store
							};
							const short = async () => {
								let res = '';
								res = await shorten(obj);
								console.log('for followUP 4', res);
							};
							short();
						}
					}
				});
			} catch (error) {
				console.error(error);
			}
		});
	} catch (error) {
		console.error(error);
	}
});

// if (process.env.NODE_ENV === 'production') {
app.use(express.static('client/build'));
app.get('*', (req, res) => {
	res.sendFile(path.resolve(__dirname, 'client', 'build', 'index.html'));
});
// }

app.post('/whatsapp', function(req, res) {
	res.sendStatus(200);
	console.log(req.body, 'whatsapp response');
});
app.post('/whatsapp/reply', function(req, res) {
	res.sendStatus(200);
	console.log(req.body, 'whatsapp reply response');
});
const port = process.env.PORT || 4000;
app.listen(port, () => {
	console.log(`app listening on port ${port}!`);
});
/////////////////////////////////////////////////
