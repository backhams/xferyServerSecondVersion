const express = require("express");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 5000;
const axios = require("axios")
const dotenv = require("dotenv");
const NodeCache = require('node-cache');
dotenv.config({ path: "./config.env" });
const {
  orders
} = require("./model/userSchema");

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
const stripe = require("stripe")(process.env.STRIPE_SERVER_SECRET);
const {userPayment} = require("./model/userSchema");

//database connection
require("./db/conn");
// Enable CORS middleware with the specified options
app.use(cors());


// Define the external API endpoint you want to call
const externalApiUrl = 'https://developers.cjdropshipping.com/api2.0/v1/shopping/order/list?pageNum=1&pageSize=100'; // Replace with your API URL

// Initialize the cache
const cache = new NodeCache();

// Function to make the API call, filter orders, and update the cache with new data
const callAndCacheApi = async () => {
  try {
    const accessToken = process.env.CJ_DROP_ACCESS_TOKEN;
    const response = await axios.get(externalApiUrl, {
      headers: {
        "CJ-Access-Token": accessToken,
      },
    });

    // Filter orders based on orderstatus
    const filteredOrders = response.data.data.list.filter(order => {
      return order.orderStatus !== 'TRASH' && order.orderStatus !== 'CREATED';
    });

    // Update the cache with the filtered data
    cache.set('orderlist', filteredOrders);

    // Handle the response from the external API here
    // console.log('API Response:', filteredOrders);
  } catch (error) {
    console.error('Error calling external API:', error);
  }
};

// Call the API and update the cache with filtered data when the server starts
callAndCacheApi();

// Set up a recurring timer to call the external API and update the cache with filtered data every 5 minutes (300,000 milliseconds)
const intervalInMilliseconds = 300000;
setInterval(callAndCacheApi, intervalInMilliseconds);

// Route to get the cached "orderlist"
app.get('/getOrders', async (req, res) => {
  try {
    const email = req.query.email;

    // Find all documents in the UserOrders collection with the specified email
    const userOrders = await orders.find({ email: email });

    if (!userOrders || userOrders.length === 0) {
      // Handle the case where the user with the given email has no orders
      return res.status(404).json({ message: "User has no orders" });
    }

    // Extract the order IDs from the user's orders
    const orderIds = userOrders.map((order) => order.orderId);
    console.log(orderIds)

    if (!orderIds || orderIds.length === 0) {
      // Handle the case where there are no order IDs
      return res.status(400).json("You have no orders yet");
    }

    // Fetch the order list from the cache
    const cachedOrderList = cache.get('orderlist');

    if (!cachedOrderList || cachedOrderList.length === 0) {
      // Handle the case where the order list is not in the cache
      return res.status(500).json("Order list not found in cache.");
    }

    // Filter the cached order list based on user order IDs
    const userOrdersFromCache = cachedOrderList.filter((order) => orderIds.includes(order.orderId));

    // Merge user-specific data from the database into the cached order list
    const mergedOrders = userOrdersFromCache.map((cachedOrder) => {
      const userOrder = userOrders.find((order) => order.orderId === cachedOrder.orderId);
      if (userOrder) {
        // Merge user-specific data
        return {
          ...cachedOrder,
          variantImage: userOrder.variantImage,
          productName: userOrder.productName,
        };
      }
      return cachedOrder;
    });

    res.status(200).json(mergedOrders);
  } catch (error) {
    console.error(error);
    res.status(500).json("An error occurred while fetching orders.");
  }
});

app.post("/webhook", express.raw({ type: "application/json" }),async (request, response) => {
  const sig = request.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(request.body, sig, endpointSecret);
  } catch (err) {
    response.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  // Handle the event
  if (event.type === "checkout.session.completed") {
    const session = event.data.object.metadata;
    const newUserPayment = new userPayment({
      userEmail: session.userEmail,
      variantId: session.variantId,
      orderNum: session.orderNum,
      quantity: session.quantity,
      productName: session.productName,
      price: session.price,
    });
    // Save the userPayment document to the collection
    try {
      await newUserPayment.save();
    } catch (error) {
      
    }
  }

  // Return a 200 response to acknowledge receipt of the event
  response.send();
});

//This is to pars json file into javascript object to understand by machine
app.use(express.json());


//Connection of router file
app.use(require("./router/auth"));

app.listen(PORT, () => {
  console.log(`server is running at port no ${PORT}`);
});
