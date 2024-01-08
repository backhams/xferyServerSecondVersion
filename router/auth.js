const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const stripe = require("stripe")(process.env.STRIPE_SERVER_SECRET);

dotenv.config({ path: "./config.env" });
const SECRET_KEY = process.env.SECRET_KEY;

//database connection
require("../db/conn");

const {
  user,
  userPayment,
  orders,
  userFeedback,
  productList
} = require("../model/userSchema");

// User  registration and validation register route
router.post("/register", async (req, res) => {
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(422).json("Please fill all the required fields.");
  }

  try {
    const userExist = await user.findOne({ email: email });

    if (userExist) {
      // User exists, generate JWT token and log in the user
      const token = await jwt.sign({ _id: userExist._id }, SECRET_KEY);
      res.status(201).json(token);
    } else {
      // User does not exist, save the user and generate JWT token
      const newUser = new user({
        name,
        email,
      });

      await newUser.save();
      const token = await jwt.sign({ _id: newUser._id }, SECRET_KEY);
      res.status(201).json(token);
    }
  } catch (err) {
    res.status(500).json("Internal server error, please try again later.");
  }
});

//product list
router.post('/importProduct', async (req, res) => {
  try {
    const  formData = req.body;
    // Extract relevant fields from formData
    const {
      productName,
      pid,
      productImage,
      sellPrice,
      discountPrice,
      categoryName,
      description,
      productKeyEn,
      entryNameEn,
      productImageSet,
      variants
    } = formData;

    // Create a new product document using the Product model
    const newProduct = new productList({
      productName,
      pid,
      productImage,
      sellPrice,
      discountPrice,
      categoryName,
      description,
      productKeyEn,
      entryNameEn,
      productImageSet,
      variants
    });

    // Save the product to the database
    await newProduct.save();

    res.status(201).json('Product imported successfully.');
  } catch (error) {
    console.error(error);
    res.status(500).json('Internal Server Error');
  }
});
//product list
router.get("/productList", async (req, res) => {

  try {
   const product = await productList.find()
   res.status(200).json(product)
  } catch (error) {
    res.status(500).json("Internal Server Error");
  }
});

//product searching
router.get("/querySearch", async (req, res) => {
  const query = await req.query.product;
  const page = req.query.page || 1;

  try {
    const apiUrl =
      "https://developers.cjdropshipping.com/api2.0/v1/product/list";
    const accessToken = process.env.CJ_DROP_ACCESS_TOKEN;
    const pageSize = 50;

    const response = await axios.get(apiUrl, {
      headers: {
        "CJ-Access-Token": accessToken,
      },
      params: {
        productNameEn: query,
        categoryName: query,
        pageNum: page,
        pageSize,
      },
      timeout: 30000, // 30 seconds
    });

    const responseData = response.data;

    // Check if the API response contains a specific error message
    if (responseData.message === "the max offset is 1000") {
      // Handle the specific error message
      res
        .status(400)
        .json(
          "Request could not be processed due to a limit issue. Please try again later."
        );
    } else {
      // Proceed with sending the data if no error message matches
      const data = responseData.data.list;
      res.status(200).json(data);
    }
  } catch (error) {
    if (error.code === "ECONNABORTED") {
      // Handle timeout error
      res
        .status(504)
        .json(
          "Sorry, we are experiencing issues right now. Please try again later."
        );
    } else {
      res.status(500).json("something went wrong. Please try again later.");
    }
  }
});

//product searching
router.get("/productDetails", async (req, res) => {
  const productId = req.query.productId;

  try {
    // Use your Product model to fetch the product by its 'pid' field
    const product = await productList.findOne({ pid: productId });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.status(200).json(product);
  } catch (error) {
    res.status(500).json("Internal Server Error");
  }
});



// order place
router.get("/addressInfo", async (req, res) => {
  const userAddress = await req.query.email;
  //   console.log(userAddress);
  try {
    const foundUser = await user.findOne(
      { email: userAddress },
      " mobile shippingCustomerName shippingCountry shippingCountryCode shippingProvince shippingCity shippingAddress shippingZip houseNumber"
    );

    if (foundUser) {
      const {
        mobile,
        shippingCustomerName,
        shippingCountry,
        shippingCountryCode,
        shippingProvince,
        shippingCity,
        shippingAddress,
        shippingZip,
        houseNumber,
      } = foundUser;

      // Check other fields like address and phone number
      if (
        shippingAddress &&
        mobile &&
        shippingCustomerName &&
        shippingCountry &&
        shippingCountryCode &&
        shippingProvince &&
        shippingCity &&
        shippingAddress &&
        shippingZip &&
        houseNumber
      ) {
        res.status(200).json({ status: "exist" });
        // console.log(shippingProvince);
      } else {
        res.status(400).json({ status: "incomplete_profile" });
      }
    } else {
      res.status(404).json({ status: "not found" });
    }
  } catch (err) {
    res.status(500).json(err);
  }
});

// addressUpdate
router.patch("/addressUpdate", async (req, res) => {
  const {
    email,
    shippingCustomerName,
    mobile,
    shippingCountry,
    shippingCountryCode,
    shippingProvince,
    shippingCity,
    shippingAddress,
    shippingZip,
    houseNumber,
    remark,
  } = req.body;
  // console.log(req.body);
  try {
    if (
      !email ||
      !shippingCustomerName ||
      !mobile ||
      !shippingCountry ||
      !shippingCountryCode ||
      !shippingProvince ||
      !shippingCity ||
      !shippingAddress ||
      !shippingZip ||
      !houseNumber ||
      !remark
    ) {
      return res.status(400).json("Please fill all the required fields.");
    }

    // Find the document with the provided email
    const existingEmail = await user.findOne({ email });

    if (!existingEmail) {
      return res
        .status(404)
        .json("user not found. Please login with email first");
    }

    // Update the fields of the existingAddress document
    existingEmail.shippingCustomerName = shippingCustomerName;
    existingEmail.mobile = mobile;
    existingEmail.shippingCountry = shippingCountry;
    existingEmail.shippingCountryCode = shippingCountryCode;
    existingEmail.shippingProvince = shippingProvince;
    existingEmail.shippingCity = shippingCity;
    existingEmail.shippingAddress = shippingAddress;
    existingEmail.shippingZip = shippingZip;
    existingEmail.houseNumber = houseNumber;
    existingEmail.remark = remark;

    // Save the updated document
    await existingEmail.save();

    res.status(200).json("Address updated successfully.");
  } catch (error) {
    res.status(500).json("An error occurred while updating the address.");
  }
});

// user details
router.get("/user/:id", async (req, res) => {
  const userId = await req.params.id;

  try {
    const foundUser = await user.findById(userId);
    if (foundUser) {
      res.status(200).json(foundUser);
    } else {
      res.status(404).json({ error: "User not found" });
    }
  } catch (error) {
    res.status(500).json("Internal server error");
  }
});

// variant price
router.get("/variantPrice", async (req, res) => {
  try {
    const variantId = req.query.variantId;
    const productId = req.query.productId;
    console.log(variantId)
    console.log(productId)

    // Use your Product model to fetch the product by its 'pid' field
    const product = await productList.findOne({ pid: productId });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Find the variant based on 'variantId' within the 'variants' array
    const variant = product.variants.find((v) => v.vid === variantId);

    if (!variant) {
      return res.status(404).json({ error: 'Variant not found' });
    }

    // Extract the variant price from the found variant
    const variantPrice = variant.variantSellPrice;
    console.log(variantPrice)

    res.status(200).json(variantPrice);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// variantIdPaid
router.get("/variantIdPaid", async (req, res) => {
  const variantId = await req.query.variantId;

  try {
    const apiUrl = `https://developers.cjdropshipping.com/api2.0/v1/product/variant/queryByVid?vid=${variantId}`;
    const accessToken = process.env.CJ_DROP_ACCESS_TOKEN;

    const response = await axios.get(apiUrl, {
      headers: {
        "CJ-Access-Token": accessToken,
      },
      params: {
        variantId: variantId,
      },
    });

    const data = response.data.data;
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json("Internal Server Error");
  }
});

//paid product list
router.get("/paidProductList", async (req, res) => {
  try {
    const email = await req.query.email;

    // Use Mongoose to find documents with the matching email
    const documents = await userPayment.find({ userEmail: email });

    // Check if any documents were found
    if (documents.length === 0) {
      return res.status(404).json("No matching documents found.");
    }

    // Send the documents as a JSON response
    res.status(200).json(documents);
  } catch (error) {
    res.status(500).json("Internal server error try again .");
  }
});


// Create order checker
router.post("/checkOrderCreate", async (req, res) => {
  const {
    variantId,
    userShipmentData,
    quantity
  } = req.body; 

  if (!variantId || !userShipmentData || !quantity) { // Corrected the variable name to 'quantity'
    return res.status(400).json("Waiting... Please try again.");
  }

  const {
    houseNumber,
    mobile,
    remark,
    shippingAddress,
    shippingCity,
    shippingCountry,
    shippingCountryCode,
    shippingCustomerName,
    shippingProvince,
    shippingZip,
    email,
  } = userShipmentData;

  try {
    // Generate a unique order number using UUID v4
    const uniqueOrderNumber = uuidv4()
      .replace(/-/g, "")
      .substring(0, 17)
      .toLocaleUpperCase();

    // Prepare data for the freight calculator API
    const freightData = {
      startCountryCode: "CN",
      endCountryCode: shippingCountryCode,
      products: [
        {
          quantity: quantity,
          vid: variantId,
        },
      ],
    };

    const freightApiUrl =
      "https://developers.cjdropshipping.com/api2.0/v1/logistic/freightCalculate";
    const accessToken = process.env.CJ_DROP_ACCESS_TOKEN; // Your CJ Dropshipping access token

    // Call the freight calculator API to calculate shipping cost and get logisticName
    const freightResponse = await axios.post(freightApiUrl, freightData, {
      headers: {
        "CJ-Access-Token": accessToken,
      },
    });

    const freightResponseData = freightResponse.data;
    console.log(freightResponseData)

    // Check if the freight calculation was successful
    if (
      freightResponseData.data.length > 0
    ) {
      // Get the logisticName from the freight calculator API response
      const logisticName = freightResponseData.data[0].logisticName;

      // Create the order data object
      const orderData = {
        orderNumber: uniqueOrderNumber,
        shippingZip: shippingZip,
        shippingCountryCode: shippingCountryCode,
        shippingCountry: shippingCountry,
        shippingProvince: shippingProvince,
        shippingCity: shippingCity,
        shippingAddress: shippingAddress,
        shippingCustomerName: shippingCustomerName,
        shippingPhone: mobile,
        remark: remark,
        fromCountryCode: "CN",
        logisticName: logisticName,
        houseNumber: houseNumber,
        email: email,
        products: [
          {
            vid: variantId,
            quantity: quantity,
            shippingName: shippingCustomerName,
          },
        ],
      };

      // Call the CJ API to create the order
      const orderApiUrl =
        "https://developers.cjdropshipping.com/api2.0/v1/shopping/order/createOrder";

      const orderResponse = await axios.post(orderApiUrl, orderData, {
        headers: {
          "CJ-Access-Token": accessToken,
        },
      });

      const orderResponseData = orderResponse.data;
      res.status(200).json(orderResponseData);
  
    } else if (freightResponseData.data.length === 0){
      res.status(404).json("shipping not found")
    } else {
      res.status(400).json("Freight calculation failed.");
    }
  } catch (error) {
    console.log(error)
    res.status(500).json("Internal server error.");
  }
});
// order create
router.post("/createOrder", async (req, res) => {
  const deletePayment = process.env.ORDERPAYMENTDELETE;
  const {
    variantId,
    userShipmentData,
    quantityNum,
    variantImage,
    productName,
  } = req.body;
  const email = userShipmentData.email

  if (!variantId || !userShipmentData || !quantityNum) {
    return res.status(400).json("waiting... press again");
  }

  try {   
    const payment = await userPayment.findOne({ userEmail:email, variantId: variantId})
        // Retrieve the list of orders
        const orderIdUrl =
          "https://developers.cjdropshipping.com/api2.0/v1/shopping/order/list?pageNum=1&pageSize=50";
          const accessToken = process.env.CJ_DROP_ACCESS_TOKEN;
        const orderListResponse = await axios.get(orderIdUrl, {
          headers: {
            "CJ-Access-Token": accessToken,
          },
        });
        // Check if retrieving the order list was successful
        if (orderListResponse.status === 200) {
          const filteredOrders = orderListResponse.data.data.list.filter(
            (orderList) => orderList.orderStatus === "CREATED" || orderList.orderStatus === "UNPAID"
          ); // Extract the list of orders
          
          let orderId = null;
          let orderStatus = null;

          // Find the order with the matching order number
          for (const order of filteredOrders) {
            if (order.orderNum === payment.orderNum) {
              orderId = order.orderId; // Use 'orderId' to confirm the order
              orderStatus = order.orderStatus
              break;
            }
          }

          if (orderId && orderStatus==="CREATED") {
            // Prepare the data for confirming the order with the orderId
            const confirmOrderData = {
              orderId: orderId,
            };
            // Now, confirm the order using the retrieved orderId
            const confirmOrderApiUrl =
              "https://developers.cjdropshipping.com/api2.0/v1/shopping/order/confirmOrder";

            const confirmOrderResponse = await axios.patch(
              confirmOrderApiUrl,
              confirmOrderData,
              {
                headers: {
                  "CJ-Access-Token": accessToken,
                  "Content-Type": "application/json", // Set the content type to JSON
                },
              }
            );
            // Check if the confirm order API call was successful
            if (confirmOrderResponse.status === 200) {
              try {
                const paymentUpdateUrl =
                  await `${deletePayment}/updatePayment?email=${email}&variantId=${variantId}`;
                const paymentUpdateResponse = await axios.delete(
                  paymentUpdateUrl
                );

                if (paymentUpdateResponse.status === 200) {
                  const newOrder = await new orders({
                    email,
                    orderId,
                    variantImage,
                    productName,
                  });
                  await newOrder.save();
                  res.status(200).json("order has been successfully placed.");
                } else {
                  res.status(400).json("Failed to update payment information");
                }
              } catch (error) {
                res.status(500).json(error.message);
              }
            } else {
              res.status(400).json("Failed to confirm the order try again");
            }
          } else if (orderId && orderStatus==="UNPAID") {
            try {
              const paymentUpdateUrl =
                await `${deletePayment}/updatePayment?email=${email}&variantId=${variantId}`;
              const paymentUpdateResponse = await axios.delete(
                paymentUpdateUrl
              );

              if (paymentUpdateResponse.status === 200) {
                const newOrder = await new orders({
                  email,
                  orderId,
                  variantImage,
                  productName,
                });
                await newOrder.save();
                res.status(200).json("order has been successfully placed.");
              } else {
                res.status(400).json("Failed to update payment information");
              }
            } catch (error) {
              res.status(500).json(error.message);
            }
          }
        } else {
          res.status(400).json("Failed to retrieve the order list try again");
        }
  } catch (error) {
    res.status(500).json("Internal server error try again.");
  }
});

//paymentValidation checking paid or not
router.get("/paymentValidation", async (req, res) => {
  const { email, variantId, quantity } = req.query;

  try {
    // Get fisrt user shippong country from database using email
    const userEmail = await user.findOne({ email });

    if (!userEmail) {
      return res.status(404).json("User not found for the given email");
    }

    // Now you can access the user's shipping country code from the user document
    const shippingCountryCode = await userEmail.shippingCountryCode;

    //Check the shipping method avaible or not before proceed further
    const freightData = {
      startCountryCode: "CN",
      endCountryCode: shippingCountryCode,
      products: [
        {
          quantity: quantity,
          vid: variantId,
        },
      ],
    };
    const checkerUrl =
      "https://developers.cjdropshipping.com/api2.0/v1/logistic/freightCalculate";
    const accessToken = process.env.CJ_DROP_ACCESS_TOKEN;
    const shippingMethodChecker = await axios.post(checkerUrl, freightData, {
      headers: {
        "CJ-Access-Token": accessToken,
      },
    });
    if (shippingMethodChecker.data.data.length === 0) {
      res
        .status(400)
        .json(
          "Sorry, this variant has no shipping method available for your country. Please try a different variant or quantity "
        );
    } else {
      // Find a document with the given email and variantId in the userPayment collection
      const paid = await userPayment.findOne({ userEmail: email, variantId });

      if (paid) {
        // Payment record found for the user with matching variantId
        res.status(200).json(paid);
      } else {
        res
          .status(404)
          .json("Payment record not found for the given email and variantId");
      }
    }
  } catch (error) {
    res.status(500).json("Internal server error");
  }
});

//paymentValidation checking paid or not for create order
router.get("/paymentValidationCreateOrder", async (req, res) => {
  const { email, variantId } = req.query;

  try {
    // Find a document with the given email and variantId in the userPayment collection
    const paid = await userPayment.findOne({ userEmail: email, variantId });

    if (paid) {
      // Payment record found for the user with matching variantId
      res.status(200).json(paid);
    } else {
      res
        .status(404)
        .json("Payment record not found for the given email and variantId");
    }
  } catch (error) {
    res.status(500).json("Internal server error");
  }
});

//payment checqueout
router.post("/checkoutPayment", async (req, res) => {
  const { variantId, quantity, finalPrice, productNameEn, userEmail,orderNum } =
    req.body;
  const unitAmountInCents = Math.round(finalPrice * 100);

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      customer_email: userEmail, // Add the customer's email here
      line_items: [
        {
          price_data: {
            currency: "USD",
            unit_amount: unitAmountInCents,
            product_data: {
              name: productNameEn,
              description: `Order Number: ${orderNum}`,
            },
          },
          quantity: quantity,
        },
      ],
      mode: "payment",
      success_url: "https://xfery.com/createOrder/paid",
      cancel_url: "https://xfery.com/cancel",
      metadata: {
        userEmail: userEmail,
        variantId: variantId,
        quantity: quantity,
        productName: productNameEn,
        price: finalPrice,
        orderNum: orderNum
      },
    });

    res.status(200).json({ id: session.id });
  } catch (error) {
    console.log(error)
    res.status(500).json("An error occurred while processing your request.");
  }
});

// add to card
router.patch("/addToCard", async (req, res) => {
  try {
    const { productId, userEmail , productImage , productPrice,productName} = req.body;
    console.log(req.body)

    // Find the user document by email
    const addToUserCard = await user.findOne({ email: userEmail });
    // console.log(addToUserCard)

    if (!addToUserCard) {
      return res.status(404).json({ message: "User not found" });
    }

     // Check if the productId is already in the addToCard array
     if (addToUserCard.addToCard.some((item) => item.productId === productId)) {
      return res.status(400).json("Product is already in Cart");
    }
    // Create a cart object to store in the addToCard array
    const cart = {
      productId,
      productImage,
      productPrice,
      productName
    };
    // Add the productId to the addToCard array
    addToUserCard.addToCard.push(cart);

    // Save the updated user document
    await addToUserCard.save();

    return res.status(200).json("Product added to Cart successfully");
  } catch (error) {
    console.log(error)
    return res.status(500).json("Internal server error");
  }
});

// Get cart product
router.get("/getCartProduct", async (req, res) => {
  const email = req.query.email;

  try {
    // Find the user document by email and only select the 'addToCard' field
    const userCart = await user.findOne({ email }).select("addToCard");

    if (!userCart) {
      // Handle the case where the user with the given email is not found
      return res.status(404).json({ message: "User not found" });
    }

    // Extract the products from the user's cart
    const cartProducts = userCart.addToCard;

    if (!cartProducts || cartProducts.length === 0) {
      // Handle the case where the user's cart is empty
      return res.status(400).json({ message: "User's cart is empty" });
    }

    // Send the cartProducts as the response
    return res.status(200).json(cartProducts);
  } catch (error) {
    res.status(500).json({ message: "Internal server error, please try again." });
  }
});


// Remove cart
router.delete("/removeCart", async (req, res) => {
  const { pid, email } = req.query;
  console.log(req.query)

  try {
    // Find the user by email
    const foundUser = await user.findOne({ email });

    if (!foundUser) {
      return res.status(404).json("User not found");
    }

    // Remove the product with the matching productId from the addToCard array
    const updatedAddToCard = foundUser.addToCard.filter(
      (product) => product.productId !== pid
    );

    if (updatedAddToCard.length === foundUser.addToCard.length) {
      // The product with the specified productId was not found in the addToCard array
      return res.status(404).json("Item already remove");
    }

    // Update the user's addToCard array
    foundUser.addToCard = updatedAddToCard;

    // Save the updated user
    await foundUser.save();

    return res.status(200).json("Product removed from cart");
  } catch (error) {
    return res.status(500).json("Internal server error");
  }
});


// Get orders
router.get("/getOrdefrs", async (req, res) => {
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

// Feedback
router.post("/feedback", async (req, res) => {
  const { selectedEmojiDescription, selectedBoxes, textareaText, email } =
    req.body;

  // Check if at least one of the fields is provided
  if (!selectedEmojiDescription && !selectedBoxes && !textareaText) {
    return res.status(400).json("At least one message is required");
  }

  // Check if email is provided
  if (!email) {
    return res.status(400).json("Email is required");
  }

  try {
    const feedback = new userFeedback({
      email: email,
      emoji: selectedEmojiDescription,
      textBox: selectedBoxes,
      message: textareaText,
    });

    await feedback.save();

    res.status(201).json("Thanks");
  } catch (error) {
    res.status(500).json("Internal server error");
  }
});

// Getting saved address
router.get("/saveAddress", async (req, res) => {
  const email = req.query.email;
  try {
    const foundUser = await user.findOne({ email: email });

    if (foundUser) {
      const { houseNumber, mobile, shippingAddress,shippingCountry,shippingProvince,shippingZip,shippingCity,shippingCustomerName } = foundUser;

      // You can send the user data in an array as a response
      const userData = {
        houseNumber: houseNumber,
        mobile: mobile,
        city: shippingCity,
        address:shippingAddress,
        country:shippingCountry,
        state:shippingProvince,
        zipCode:shippingZip,
        name:shippingCustomerName

      };

      res.status(200).json(userData);
    } else {
      res.status(404).json("User not found");
    }
  } catch (error) {
    res.status(500).json("Internal server error");
  }
});

// Order tracking 
router.get("/orderTracking", async (req, res) => {
  const email = req.query.email;
  const trackingId = req.query.trackingId;
  try {
    const accessToken = process.env.CJ_DROP_ACCESS_TOKEN;
    const response = await axios.get(`https://developers.cjdropshipping.com/api2.0/v1/logistic/getTrackInfo?trackNumber=${trackingId}`, {
      headers: {
        "CJ-Access-Token": accessToken,
      },
    });
    
    const trackInfo = response.data;

    // Search for the user in your database using the provided email
    const userAddress = await user.findOne({ email });

    if (userAddress) {
      // If the user is found, you can access their additional information
      const { shippingCountry, shippingProvince, shippingCustomerName ,mobile,shippingAddress,shippingCity,shippingZip
      } = userAddress;

      // Combine the trackInfo and user information as needed
      const combinedData = {
        ...trackInfo,
        shippingCountry,
        shippingProvince,
        shippingCustomerName,
        shippingCity,
        shippingAddress,
        mobile,
        shippingZip
      };

      // Send the combined data as a JSON response to the user
      res.status(200).json(combinedData);
    } else {
      // Handle the case where the user is not found in your database
      res.status(404).json("User not found in the database.");
    }
  } catch (error) {
    res.status(500).json("An error occurred while processing the request.");
  }
});

module.exports = router;
