//! adityajha126@gmail.com credentials

// const accountSid = 'ACdd4222ddf69ed4bd5984920f296dd7eb';
// const authToken = '52aad3900ce0cf31da9cd6f0868a1da2';
// const client = require('twilio')(accountSid, authToken);

// const MessagingResponse = require('twilio').twiml.MessagingResponse;

// const response = new MessagingResponse();
// response.message('This is message 1 of 2.');
// response.message('This is message 2 of 2.');

// console.log(response.toString());

// client.messages
//       .create({
//          body: 'Your Yummy Cupcakes Company order of 1 dozen frosted cupcakes has shipped and should be delivered on July 10, 2019. Details: http://www.yummycupcakes.com/',
//          from: 'whatsapp:+14155238886',
//          to: 'whatsapp:+919711463419'
//        })
//       .then(message => console.log(message.sid))
//   .done();

//! adityajha526@gmail.com credentials

// const accountSid = 'AC704e6ad13244ed977f7bed9f8b063b0f';
// const authToken = '7aaca9144490a290604db687eb451b7e';
// const client = require('twilio')(accountSid, authToken);

// client.messages
// 	.create({
// 		body:
// 			'Your Yummy Cupcakes Company order of 1 dozen frosted cupcakes has shipped and should be delivered on July 10, 2019. Details: http://www.yummycupcakes.com/',
// 		from: 'whatsapp:+14155238886',
// 		to: 'whatsapp:+917821915962'
// 	})
// 	.then((message) => console.log(message.sid))
// 	.done();

let hola =
	'Hey (customer_name)! We noticed you left some items in your cart. Get them before   they’re gone! Visit this link to complete the order:(abandoned_checkout_url). – (store_name)';
let encodedHola ="hola"
let hardEncodedHola =
	'Hey%20(customer_name)!%20We%20noticed%20you%20left%20some%20items%20in%20your%20cart.%20Get%20them%20before%20they%E2%80%99re%20gone!%20Visit%20this%20link%20to%20complete%20the%20order:(abandoned_checkout_url).%20%E2%80%93%20(store_name)';
console.log(hola);
console.log(encodeURIComponent(hola));
console.log(decodeURIComponent(hola));
console.log(encodedHola);
// console.log('hard encode', encodeURI(hola));

// let inputData = hola;
// inputData = inputData.replace(/(^\s*)|(\s*$)/gi, '');
// inputData = inputData.replace(/[ ]{2,}/gi, ' ');
// inputData = inputData.replace(/\n /, '\n');

// console.log('inputdata::::::::::::::', inputData);
// if (inputData == hola) {
// 	console.log('boom');
// }
