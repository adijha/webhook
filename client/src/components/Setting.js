import React, { Fragment, useEffect, useCallback, useState } from 'react';
import { Card, Layout, Heading, Button, Checkbox, Form, TextField } from '@shopify/polaris';
import axios from 'axios';

function myFunction() {
	var x = document.getElementById('snackbar');
	x.className = 'show';
	setTimeout(function() {
		x.className = x.className.replace('show', '');
	}, 2000);
}

export default function Settings() {
	const [ adminPhone, setAdminPhone ] = useState('');
	const handleChangePhone = useCallback((newNumber) => setAdminPhone(newNumber), []);

	const [ senderID, setSenderID ] = useState('');
	const handleChangeSenderID = useCallback((newValue) => setSenderID(newValue), []);

	const [ orderCreateCustomer, setOrderCreateCustomer ] = useState(false);
	const handleOrderCreateCustomer = useCallback((value) => setOrderCreateCustomer(value), []);

	const [ orderCreateAdmin, setOrderCreateAdmin ] = useState(false);
	const handleOrderCreateAdmin = useCallback((value) => setOrderCreateAdmin(value), []);

	const [ orderCancelledCustomer, setOrderCancelledCustomer ] = useState(false);
	const handleOrderCancelledCustomer = useCallback((value) => setOrderCancelledCustomer(value), []);

	const [ orderCancelledAdmin, setOrderCancelledAdmin ] = useState(false);
	const handleOrderCancelledAdmin = useCallback((value) => setOrderCancelledAdmin(value), []);

	const [ orderFulfilledCustomer, setOrderFulfilledCustomer ] = useState(false);
	const handleOrderFulfilledCustomer = useCallback((value) => setOrderFulfilledCustomer(value), []);

	const [ orderFulfilledAdmin, setOrderFulfilledAdmin ] = useState(false);
	const handleOrderFulfilledAdmin = useCallback((value) => setOrderFulfilledAdmin(value), []);

	const getOption = () => {
		axios.get('/api/option/').then((res) => {
			// console.log('optn', res);
			setAdminPhone(res.data['admin no']);
			setSenderID(res.data['sender id']);
			setOrderCreateCustomer(res.data['orders/create customer']);
			setOrderCreateAdmin(res.data['orders/create admin']);
			setOrderCancelledCustomer(res.data['orders/cancelled customer']);
			setOrderCancelledAdmin(res.data['orders/cancelled admin']);
			setOrderFulfilledAdmin(res.data['orders/fulfilled admin']);
			setOrderFulfilledCustomer(res.data['orders/fulfilled customer']);
		});
	};

	let preference = {
		'admin no': adminPhone,
		'sender id': senderID,
		'orders/create customer': orderCreateCustomer,
		'orders/create admin': orderCreateAdmin,
		'orders/cancelled customer': orderCancelledAdmin,
		'orders/cancelled admin': orderCancelledCustomer,
		'orders/fulfilled customer': orderFulfilledCustomer,
		'orders/fulfilled admin': orderFulfilledAdmin
	};

	const handleSubmit = useCallback(
		(_event) => {
			axios.post('/api/template/', preference).then((res) => console.log(res)).catch((err) => console.error(err));

			console.log(preference);
		},
		[
			orderCreateCustomer,
			orderCreateAdmin,
			orderCancelledAdmin,
			orderCancelledCustomer,
			orderFulfilledAdmin,
			orderFulfilledCustomer
		]
	);

	useEffect(() => {
		getOption();
	}, []);
	return (
		<Fragment>
			<Form onSubmit={handleSubmit}>
				<Layout>
					<Layout.AnnotatedSection
						title="Admin Phone No."
						description="Admin will be notify on this no. by selecting Notify Admin."
					>
						<Card sectioned>
							<div style={{ padding: '3rem' }}>
								<TextField
									label="Admin Phone No."
									type="text"
									maxLength="10"
									onChange={handleChangePhone}
									value={adminPhone}
									showCharacterCount
								/>
							</div>
						</Card>
					</Layout.AnnotatedSection>
					<Layout.AnnotatedSection
						title="Sender ID"
						description="Sender ID is the name or number which appears on the mobile phone as the sender of a SMS. Sender ID will be maximum of 6 Characters."
					>
						<Card sectioned>
							<div style={{ padding: '3rem' }}>
								<TextField
									label="Sender ID"
									type="text"
									onChange={handleChangeSenderID}
									maxLength="6"
									value={senderID}
									showCharacterCount
								/>
							</div>
						</Card>
					</Layout.AnnotatedSection>
					<Layout.AnnotatedSection
						title="Notification Prefrence"
						description="Admin and Customer will be notified according to by selecting Notify Admin."
					>
						<Card sectioned>
							<div style={{ padding: '2rem' }}>
								<p style={{ fontSize: '17px' }}>Orders</p>
								<hr />

								<div style={{ display: 'flex', justifyContent: 'space-between' }}>
									<div style={{ width: '10rem' }}>
										<Heading>Create </Heading>
									</div>
									<Checkbox
										label="Notify Customer"
										checked={orderCreateCustomer}
										onChange={handleOrderCreateCustomer}
									/>

									<Checkbox label="Notify Admin" checked={orderCreateAdmin} onChange={handleOrderCreateAdmin} />
								</div>
								<div style={{ display: 'flex', justifyContent: 'space-between' }}>
									<div style={{ width: '10rem' }}>
										<Heading>Cancelled </Heading>
									</div>

									<Checkbox
										label="Notify Customer"
										checked={orderCancelledCustomer}
										onChange={handleOrderCancelledCustomer}
									/>

									<Checkbox label="Notify Admin" checked={orderCancelledAdmin} onChange={handleOrderCancelledAdmin} />
								</div>

								<div style={{ display: 'flex', justifyContent: 'space-between' }}>
									<div style={{ width: '10rem' }}>
										<Heading>Fullfilled </Heading>
									</div>

									<Checkbox
										label="Notify Customer"
										checked={orderFulfilledCustomer}
										onChange={handleOrderFulfilledCustomer}
									/>

									<Checkbox label="Notify Admin" checked={orderFulfilledAdmin} onChange={handleOrderFulfilledAdmin} />
								</div>
							</div>
						</Card>
					</Layout.AnnotatedSection>
				</Layout>

				<br />
				<div style={{ textAlign: 'right' }}>
					<Button onClick={myFunction} submit primary>
						Save
					</Button>
				</div>
				<div id="snackbar">Settings Updated </div>
			</Form>
		</Fragment>
	);
}
