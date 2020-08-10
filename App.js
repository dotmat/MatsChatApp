'use strict';

const express = require('express');
const basicAuth = require('express-basic-auth')
const path = require('path');
const bodyParser = require('body-parser');
const requestIp = require('request-ip');
const geoip = require('geoip-lite');
const twilio = require('twilio');
const ClientCapability = require('twilio').jwt.ClientCapability;
const Nexmo = require('nexmo');
const jwt = require('jsonwebtoken');
const mariadb = require('mariadb');
const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');
const Cryptr = require('cryptr');
const cryptr = new Cryptr('MatsChatApp'); // For some reason the encrpytion string has to be entered here. I've not been able to use an external reference...?
const bcrypt = require('bcrypt');
const saltRounds = 10;
const PubNub = require('pubnub');
const mustacheExpress = require('mustache-express');
const get = require('simple-get');
const Mixpanel = require('mixpanel');
const {RtcTokenBuilder, RtmTokenBuilder, RtcRole, RtmRole} = require('agora-access-token')

// Config File for the App
const config = require('./Config');
//const commands = require('./Commands');
var authy = require('authy')(config.authy);

const mariaDBConnectionPool = mariadb.createPool({host: config.mariaDBHost, user:config.mariaDBUser, password: config.mariaDBPassword,database: config.mariaDBDatabase});
var mariaDBConnection = null;

var mailgunClient = require('mailgun-js')({apiKey: config.mailGunAPIKey, domain: config.mailGunDomain});
const nexmoClient = new Nexmo({apiKey: config.nexmoAPIKey,apiSecret: config.nexmoAuthToken,});
const mixpanel = Mixpanel.init(config.mixpanelID, {
    protocol: 'https'
});

const app = express();
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json())
app.use(requestIp.mw())
app.engine('html', mustacheExpress());
app.set('view engine', 'html');
app.set('views', __dirname + '/views');

// Handle Events from PubNub
app.post('/pubnub/presence/:eventType', (request, response) => {
    const eventType = request.params.eventType;
    console.log('New PubNub Event, here are the details;', eventType);
    console.log(request.body);
    const presenceObject = request.body;
    var updateSQL = null;
    // Join Event
    if(eventType == 'channel-join'){
        // If the UUID and the channel are the same, it means that this is a timestamp for a specific user
        if(presenceObject.uuid == presenceObject.channel){
            updateSQL = "UPDATE `users` SET `lastSeenTimestamp` = 'online' WHERE `users`.`username` = '"+presenceObject.uuid+"';";
        };
    };
    // Leave Event
    if(eventType == 'channel-leave' || eventType == 'channel-timeout'){
        if(presenceObject.uuid == presenceObject.channel){
            var timestamp = Math.round((new Date()).getTime() / 1000);
            updateSQL = "UPDATE `users` SET `lastSeenTimestamp` = '"+timestamp+"' WHERE `users`.`username` = '"+presenceObject.uuid+"';";
        };
    };

    // Always 200 PubNub, its really not their issue if something fails here.
    if(updateSQL == null){
        var responseJSON = {};
        responseJSON.status = 200;
        responseJSON.success = true;
        responseJSON.message = "Got it!";
        response.status(responseJSON.status).json(responseJSON);
    } else {
        asyncQueryLookup(updateSQL).then(addMessageQueryResponse => {
            var responseJSON = {};
            responseJSON.status = 200;
            responseJSON.success = true;
            responseJSON.message = "Got it!";
            response.status(responseJSON.status).json(responseJSON);
        });
    }
});

// Handle Inbound Hooks from Telephonics providers, these include Twilio, Vonage, Bandwidth, Sinch - basically anyone who sends SMS Messages or PSTN Voice calls.

app.post('/inbound/message/:vendor', (request, response) => {
    var responseJSON = {};
    console.log('Got a new message from a 3rd party vendor, here are the details');
    console.log(request.body);
    var vendor = request.params.vendor;
    var senderID = null;
    var toID = null;
    var messageBody = null;
    var messageString = null;
    var mediaURL = null;
    var pubnubClientConfig = null;
    var messageMetaData= {};
    var outgoingPubNubPayload = null;
    var messageSID = null;
    var messageType = null;
    var messageObject = null;
    var forwardOnMessage = true;
    var toIDMetadata = null;

    // If the vendor is Nexmo insert the message into the appropriate channel
    if(vendor == 'nexmo'){
        senderID = request.body.msisdn;
        toID = request.body.to;
        toIDMetadata = toID;
        messageBody = request.body.text;
        //messageString = 'SMS From: '+senderID+' Body: '+messageBody;
        messageObject = {
            body: messageBody
        };
        messageSID = 'Nexmo'+request.body.messageId;
        messageType = 'text';
    };

    // If the vendor is Chat Layer insert the message into the appropriate channel
    if(vendor == 'chatlayer'){
        // An example Chat layer payload is
        // {
        //     "senderId": "Mathew.Jenkinson",
        //     "verifyToken": "abc123",
        //     "message": {
        //         "text": "Why did the robot go back to school?\n...\nBecause his skills were a little rusty!"
        //     },
        //     "messageCounter": 1,
        //     "nlp": {
        //         "intent": {
        //             "name": "chitchat.tell_a_joke",
        //             "score": 1
        //         }
        //     },
        //     "dialogstate": {
        //         "id": "0cd4e690-41bc-4fb7-860c-4589472c571f",
        //         "name": "Jokes",
        //         "label": null
        //     }
        // }

        // Additionally Chat Layer also sends a payload to confirm that its API recieved the message that our server sent, those payloads look like this: 
        // {
        //     "message": {
        //         "type": "event",
        //         "setTyping": true,
        //         "timestamp": "2020-07-30T15:17:03.508Z"
        //     },
        //     "senderId": "Mathew.Jenkinson",
        //     "timestamp": "2020-07-30T15:17:03.508Z",
        //     "verifyToken": "abc123"
        // }

        // We want to ignore these event based messages as they serve no purpose. 
        if(request.body.message.setTyping == true){
            console.log('Recieved a Typing indicator event from ChatLayer');
            forwardOnMessage = false;
            // Return the success object
            responseJSON.status = 200;
            responseJSON.success = true;
            responseJSON.message = "Message Successful";
            response.status(responseJSON.status).json(responseJSON);
        } else {
            console.log('Recieved a message event from ChatLayer');
            messageSID = 'ChatLayer-'+request.body.dialogstate.id;
            messageType = 'text';
            vendor = request.body.senderId;

            senderID = 'PennelopePubBot';
            toID = request.body.senderId;
            toIDMetadata = 'private-'+toID+'-'+senderID;
            messageBody = request.body.message.text;
            messageObject = {
                body: messageBody
            };
        };
    };
    if(vendor == 'bandwidth'){
        // An example BW payload for an SMS message is: 
        // [
        //     {
        //         "time": "2020-06-16T12:52:17.821Z",
        //         "type": "message-received",
        //         "to": "+16282661469",
        //         "description": "Incoming message received",
        //         "message": {
        //             "id": "96f1d01f-892e-4384-920a-f3cac02d35f9",
        //             "owner": "+16282661469",
        //             "applicationId": "c90ae37e-1b07-4eb9-99f3-8a6577ce1470",
        //             "time": "2020-06-16T12:52:17.682Z",
        //             "segmentCount": 1,
        //             "direction": "in",
        //             "to": [
        //                 "+16282661469"
        //             ],
        //             "from": "+16785997538",
        //             "text": "Mat Test"
        //         }
        //     }
        // ]

        const incomingMessagePayload = request.body[0]
        // Nexmo Messages also give you info on when a message has been recieved by its destination.
        // At this time these can be excluded from the UI so just drop those ones.
        if(incomingMessagePayload.type == "message-delivered"){
            forwardOnMessage = false;
        } else {
            //console.log(incomingMessagePayload)
            senderID = incomingMessagePayload.message.from;
            toID = incomingMessagePayload.message.to[0];
            toIDMetadata = toID;
            messageBody = incomingMessagePayload.message.text;
            //messageString = 'SMS From: '+senderID+' Body: '+messageBody;
            messageObject = {
                body: messageBody
            };
            messageType = 'text';
            if(incomingMessagePayload.message.media){
                mediaURL = incomingMessagePayload.message.media[1];
                mediaURL = mediaURL.replace("https://", "https://6484e83c9a3a5bb8ddca69fdad629a7b0a8592405640fc17:1449fa905ad4b576ba8ba8cdc0cc79d487bc05625530f40c@");
                //messageString = 'MMS From: '+senderID+' Media URL: '+mediaURL;
                messageType = 'image';
                messageObject = {
                    full: mediaURL,
                    thumbnail: mediaURL,
                };
            };
            messageSID = 'Bandwidth'+incomingMessagePayload.message.id;
        }
    };

    // If using PubNub to distribute the messages push the message into the appropriate PubNub Channel. 
    if(config.usePubNub == true && forwardOnMessage == true){

        // Generate the Meta Data for this message, including messageSID, fromID, fromIP, timestamp, toID, messageObject, messageType, messageActiveState, parentThreadID
        messageMetaData.messageSID = messageSID;
        messageMetaData.fromID = senderID;
        messageMetaData.fromIP = request.clientIp;

        // Epoch Time Stamp
        const now = new Date();
        messageMetaData.timestamp = Math.round(now.getTime() / 1000);
        messageMetaData.toID = toIDMetadata;
        messageMetaData.type = messageType;
        messageMetaData.active = true;
        messageMetaData.viaAPI= true;

        pubnubClientConfig = {
            publishKey : config.pubnubPublishKey,
            subscribeKey : config.pubnubSubscribeKey,
            ssl: true,
            uuid: senderID,
            origin: config.pubnubDomain+".pubnub.com"
        };
        if(config.useMessageEncryption == true){
            pubnubClientConfig.cipherKey = config.cipherKey || config.AppName;
        }

        var assembledMessagePayload = assembleMessageObject(messageType, messageObject);
        console.log(assembledMessagePayload);
        outgoingPubNubPayload = {
            channel : vendor,
            message : {content: assembledMessagePayload, sender: senderID}, 
            sendByPost: true, 
            meta: messageMetaData,
            viaAPI: true
        };
        asyncSendToPubNub(pubnubClientConfig, outgoingPubNubPayload).then(publishEvent => {
            //console.log(publishEvent);
            // Return the success object
            responseJSON.status = 200;
            responseJSON.success = true;
            responseJSON.message = "Message Successful";
            response.status(responseJSON.status).json(responseJSON);
        });
    } else {
        // Send back a 200 because the 3rd party vendor doesnt care what happens next
        responseJSON.status = 200;
        responseJSON.success = true;
        responseJSON.message = "Message Successful";
        response.status(responseJSON.status).json(responseJSON);
    };
});

// Handle NLP Actions differently to an inbound message
app.post('/inbound/nlp/:vendor', (request, response) => {
    console.log('Got a request to handle an NLP action, here are the details:');
    console.log(request.body);

    const vendor = request.params.vendor;
    responseJSON.status = 200;
    responseJSON.success = true;
    responseJSON.message = "Message Successful";
    response.status(responseJSON.status).json(responseJSON);
});

app.get('/support', (request, response) => {
    var htmlConfigObject = {"favIconURL": config.favIconURL, "appName": config.AppName, "appLogoURL":config.AppLogoURL, "appThumbnailURL":config.appThumbnailURL};
    if(config.googleUrchinID != null){
        htmlConfigObject.googleAnalytics = config.googleUrchinID;
    }
    response.render('support', htmlConfigObject);
});


app.use(function (request, response, next) {
    var responseJSON = {};
    const username = request.body.username || undefined;
    response.removeHeader("X-Powered-By");
    response.setHeader("X-"+config.AppName, "MbMLabs");
    var geo = geoip.lookup(request.clientIp) || undefined;
    try {
        geo = geo["country"];
    }
    catch (error){
        geo = 'us';
    }
    //console.log('geo', geo["country"]);
    request.ISOCountryCode = geo;

    // If we are scanning every request for banned credentials. 
    if(config.scanAllRequestsForBannedIPorUsername == true){
        // Check to see if the username or IP Address are banned.
        if(config.useSQLStorage == true){
            response.setHeader("X-PreAuthCheck", "Active");
            console.log('PreAuth Check Active');
            const bannedObjectSQL = "SELECT `object`, `objectType`, `currentlyBanned` FROM `bannedItems` WHERE (`object` LIKE '%"+username+"%' OR `object` LIKE '"+request.clientIp+"') AND `currentlyBanned` = 1";
            //console.log(bannedObjectSQL);
            asyncQueryLookup(bannedObjectSQL)
            .then(queryResponse => {
                //console.log('Query Response: ');
                //console.log(queryResponse);
                // If any row exists, this means the username or IP address have been banned.
                if (queryResponse === undefined) {
                    console.log('Banned Lookup Query Returned Undefined (This is good, it means '+username+' is not banned)');
                    next();
                } else if(queryResponse.length == 0){
                    console.log('Banned Lookup Query Returned 0 Rows');
                    next();
                } else {
                    console.log('Banned Lookup Query Returned a banned user or IP Address');
                    responseJSON.status = 401;
                    responseJSON.success = false;
                    responseJSON.message = "Request denied. Bad Credentials.";
                    // Return the Response Object
                    response.status(responseJSON.status).json(responseJSON);
                }
            })
            .catch(err => {
                console.log('Async Catch stepped in, here is the error');
                console.log(err);
                next();
            });
        } else if(config.useMongoDB == true){
            response.setHeader("X-PreAuthCheck", "Active");

            MongoClient.connect(config.mongoDBConnectionString, function(err, client) {
                assert.equal(null, err);
                console.log("Successfully connected to MongoDB");
                
                const db = client.db(config.mongoDBName);

                // Lookup in MongoDB

                // Close the MongoDB Connection
                client.close();
            });
            next();
        } else {
            next();
        }
    } else {
        next();
    }
});

// Async DB Lookup Function
async function asyncQueryLookup(sqlQuery) {
    console.log('Making a Root MariaDB Request');
    console.log(sqlQuery);
    try {
        mariaDBConnection = await mariaDBConnectionPool.getConnection();
        const rows = await mariaDBConnection.query(sqlQuery);
        //console.log(rows);
        return rows;   
    } catch (err) {
        throw err;
    } finally {
        mariaDBConnection.release();
        //if (mariaDBConnection) mariaDBConnection.release(); //release to pool
    };
};

// Function to store Messages that are sent out
async function storeMessage(messagePayload){
    console.log('Going to store a copy of message payload:');
    console.log(messagePayload);
    var sanitizedPayload = messagePayload.message;
    // Message Payload stores a copy of what was actually sent out.
    // This function is called AFTER the messge has fired out to the distribution service such as PubNub.
    if(config.useSQLStorage == true){
        const addMessageSQL = "INSERT INTO `messages` (`dbid`, `messageID`, `fromUser`, `fromIP`, `dateCreated`, `toID`, `messageObject`, `messageType`, `messageActive`, `threadOfMessage`) VALUES (NULL, '"+messagePayload.meta.messageSID+"', '"+messagePayload.meta.fromID+"', '"+messagePayload.meta.fromIP+"', '"+messagePayload.meta.timestamp+"', '"+messagePayload.channel+"', "+mariaDBConnection.escape(sanitizedPayload)+", '"+messagePayload.meta.type+"', '1', '');";
        console.log(addMessageSQL);
        asyncQueryLookup(addMessageSQL).then(addMessageQueryResponse => {
            mariaDBConnection.release();
            return true;
        });
    }
};

// Generate UUID
function generateUUID(){
    return 'xxxxxxxxxxxx6xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

// Generate Message String
function assembleMessageObject(messageType, messageObject){
    var assembledMessageObject = {};
    if(messageType == 'text'){
        if(config.translateMessages == true){
            
        } else {
            assembledMessageObject.type = 'text';
            assembledMessageObject.message = messageObject.body;
        }
    }
    if(messageType == 'reaction'){

    }
    if(messageType == 'pollAnswer'){

    }
    if(messageType == 'image'){
        assembledMessageObject.type = 'image';
        assembledMessageObject.full = messageObject.full;
        assembledMessageObject.thumbnail = messageObject.thumbnail;
    }
    if(messageType == 'video'){

    }
    if(messageType == 'raw'){

    }
    return assembledMessageObject;
}

// Async PubNub Push Function
async function asyncSendToPubNub(pubnubClientConfig, outgoingPubNubPayload){
    if(config.storeMessages == true){
        storeMessage(outgoingPubNubPayload);
    };
    const pubnubClient = new PubNub(pubnubClientConfig);
    console.log('Making request to Publish Message to PubNub network');
    pubnubClient.publish(outgoingPubNubPayload, function(status, response) {
        console.log('PubNub Response:');
        console.log(status, response);
    });
    return true;
};

// Load the static pages


// Load the login HTML
app.get('/login', (request, response) => {
    var htmlConfigObject = {"favIconURL": config.favIconURL, "appName": config.AppName, "appLogoURL":config.AppLogoURL, "appThumbnailURL":config.appThumbnailURL};
    if(config.googleUrchinID != null){
        htmlConfigObject.googleAnalytics = config.googleUrchinID;
    };
    // If using Mixpanel add the Mixpanel token here
    if(config.mixpanelID!=""){
        htmlConfigObject.mixpanelToken = config.mixpanelID;
    };

    // If using Google Analytics add the token here
    if(config.googleUrchinID!==""){
        htmlConfigObject.googleAnalytics = config.googleUrchinID;
    };
    response.render('login', htmlConfigObject);
});

// Handle a POST request to login a user
app.post('/login', (request, response) => {
    console.log('Got a request to handle a Login via POST');
    var loginActions = {};
    var responseJSON = {};
    responseJSON.status = 500;
    responseJSON.success = false;
    // responseJSON.message = "Something went wrong. We don't know what and are investigating.";
    //console.log(request);
    const username = request.body.username; // A username can be either an actual username or an email address
    const password = request.body.password;
    const ipAddress = request.clientIp;
    const isoCountryCode = request.ISOCountryCode;
    const rememberMeCheckBox = request.body.rememberMeCheckbox;

    // Check for the presence of both a username and a password
    if(username == null || password == null){
        responseJSON.status = 401;
        responseJSON.success = false;
        responseJSON.message = "Missing Credentials.";
        // Return the Response Object
        response.status(responseJSON.status).json(responseJSON);
    } else {
        // If using a MariaDB or MySQL DB to store user details
        if(config.useSQLStorage == true){
            const findUserSQL = "SELECT DISTINCT `username`, `password`, `emailAddress`, `emailAddressVerified`, `userType`, `mfaID`, `mfaRequired`, `knownIPAddresses`, `lastSeenIP`, `supportVoiceConnectivity` FROM `users` WHERE (`username` LIKE '"+username+"' OR `emailAddress` LIKE '"+username+"') AND `activeUser` = 1";
            //console.log(findUserSQL);
            asyncQueryLookup(findUserSQL, [username]).then(loginQueryResponse => {
                //console.log(loginQueryResponse);
                if(loginQueryResponse.length == 0){
                    //console.log('No username exists here..');
                    responseJSON.status = 401;
                    responseJSON.success = false;
                    responseJSON.message = "Missing Correct User Credentials.";
                    // Return the Response Object
                    response.status(responseJSON.status).json(responseJSON);
                } else {
                    const userLoginObject = loginQueryResponse[0];
                    // There is a lot to unpack in a login response object, we need to know if the password hash matches, does the user has an unverified account, do they require MFA authentication, are they logging in from an unknown source.
                    
                    // Check the user is not trying to login as a bot.. that would be super naughty. 
                    if(userLoginObject.userType =='Bot'){
                        responseJSON.status = 401;
                        responseJSON.success = false;
                        responseJSON.message = "Request denied. Bad Credentials.";
                        // Return the Response Object
                        response.status(responseJSON.status).json(responseJSON);
                    } else 
                    {
                        // Check the password Hash
                        bcrypt.compare(password, userLoginObject.password, function(err, passwordHashResponse) {
                            if(passwordHashResponse == false){
                                console.log('Bad credentials from user: '+username);
                                responseJSON.status = 401;
                                responseJSON.success = false;
                                responseJSON.message = "Request denied. Bad Credentials.";
                                // Return the Response Object
                                response.status(responseJSON.status).json(responseJSON);
                            } else {
                                // If the username and password are correct, this means we can log the user in. 
                                // But we now need to check if the user requires further auth such as MFA/Authy or if their IP login location is different to past login locations.

                                // If the login IP Address is different to ones in the database and the user has MFA enabled, then issue an MFA check.
                                // If no MFA is enabled, add the IP Address to known login addresses.
                                // Check to see if the IP has been used before or not.
                                const knownIPAddressesArray = userLoginObject.knownIPAddresses.replace('"', "");
                                if(knownIPAddressesArray.includes(ipAddress)){
                                    console.log('This user has come from this IP Address before.');
                                } else {
                                    console.log('This user has never come from this IP address before.');
                                    // If the IP Address is unknown and the user has MFA enabled for 'sometimes' or 'always' then for an MFA step.
                                    if(userLoginObject.mfaRequired == 'sometimes'){
                                        loginActions.mfaRequired = true;
                                    }
                                }

                                // Check to see if the user requires MFA 
                                if(userLoginObject.mfaRequired == 'always'){
                                    loginActions.mfaRequired = true;
                                }

                                // Generate the login JWT
                                var loginJWTObject = {};
                                var loginObject = {};
                                loginJWTObject.user = userLoginObject.username;
                                userLoginObject.type = userLoginObject.userType;
                                const loginJWTString = jwt.sign({data: loginJWTObject}, config.AppName, { expiresIn: '12h' }); // Tokens expire after 12 hours.
                                const refreshJWTString = jwt.sign({data: loginJWTObject}, config.AppName, { expiresIn: '7d' }); // Tokens expire after 7 hours.
                                loginObject.accessToken = loginJWTString;
                                loginObject.refreshToken = refreshJWTString;

                                const now = new Date();
                                var tokenExpiryTimeSeconds = Math.round(now.getTime() / 1000);
                                tokenExpiryTimeSeconds = tokenExpiryTimeSeconds + (60*60*12); // Tokens expire after 12 hours
                                loginObject.expires = tokenExpiryTimeSeconds;

                                if(config.usePubNub == true){
                                    loginObject.PubNubSubKey = config.pubnubSubscribeKey;
                                    loginObject.methodology = config.methodology;

                                    // Check the chat methodology for how to send messages
                                    if(config.methodology == 'distributed'){
                                        loginObject.PubNubPubKey = config.pubnubPublishKey;
                                    };
                                    // Check to see if PN signals are going to be used
                                    if(config.usePubNubSignals == true){
                                        loginObject.PubNubPubKey = config.pubnubPublishKey;
                                        loginObject.useSignals = true;
                                    };

                                    // Check to see if Messages need to be encrypted
                                    if(config.useMessageEncryption == true){
                                        loginObject.cipherKey = config.cipherKey;
                                    }
                                };
                                
                                // If using Twilio Client for voice and video connectivity then generate the approprate tokens
                                if(config.useTwilioClient == true){
                                    const capability = new ClientCapability({
                                        accountSid: config.twilioAccountSID,
                                        authToken: config.twilioAuthToken,
                                        ttl: 43200 // Tokens Expire after 12 hours
                                    });
                                    capability.addScope(
                                        new ClientCapability.OutgoingClientScope({ applicationSid: config.twilioVoiceAppSID })
                                    );
                                    capability.addScope(new ClientCapability.IncomingClientScope(userLoginObject.username));
                                    loginObject.voiceToken = capability.toJwt();
                                }

                                // Tell MixPanel about the login event
                                mixpanel.track('Login', {distinct_id: userLoginObject.username,ip: ipAddress});
                                
                                responseJSON.status = 200;
                                responseJSON.success = true;
                                responseJSON.username = userLoginObject.username;
                                responseJSON.login = loginObject;

                                // Check to see if loginObject has anything we need to do. 
                                // If MFA is required then the JWT is encrypted to prevent use until MFA has been successfully completed.
                                if(loginActions.mfaRequired == true){
                                    // Encrypt the contents of the login object
                                    const encryptedLoginObject = cryptr.encrypt(JSON.stringify(responseJSON.login));
                                    responseJSON.mfaRequired = true;
                                    responseJSON.login = encryptedLoginObject;
                                }
                                // Return the Response Object
                                response.status(responseJSON.status).json(responseJSON);
                            }
                        });
                    };
                }
            });
        }
    }
    // Example Login JWT
    // {
    //     "success": true,
    //     "mfaRequired": false,
    //     "username": "JohnSmith",
    //     "login": {
    //       "accessToken": "abc123",
    //       "PubNubSubKey": "aabbcc",
    //       "PubNubPubKey": "qqwwee",
    //       "cipherKey": "llamas"
    //     }
    // }
});

// Refresh the accessToken using the issued refreshToken
// The refreshToken only works if the requestIP matches any of the known IP's. Otherwise reject the request and force a relogin event.
app.put('/login', (request, response) => {
    var responseJSON = {};
    responseJSON.status = 500;
    responseJSON.success = false;

    const refreshToken = request.header('x-api-key');
    console.log('Refresh Token', refreshToken);
    var requestIP = request.clientIp;
    console.log('Requester IP', requestIP);

    jwt.verify(refreshToken, config.AppName, function(err, decodedToken) {
        if(err){
            console.log('JWT Decoded Error');
            //console.log(err);
            responseJSON.status = 401;
            responseJSON.success = false;
            responseJSON.message = "Bad Credentials";
            // Return the Response Object
            response.status(responseJSON.status).json(responseJSON);
        } else {
            console.log(decodedToken)
            const decodedUsername = decodedToken.data.user

            // Lookup the user in SQL Table
            const findUserSQL = "SELECT DISTINCT `username`, `userType`, `knownIPAddresses` FROM `users` WHERE (`username` LIKE '"+decodedUsername+"') AND `activeUser` = 1";
            asyncQueryLookup(findUserSQL).then(queryResponse => {
                //console.log(queryResponse);
                var knownIPAddressesArray = queryResponse[0].knownIPAddresses;
                knownIPAddressesArray = knownIPAddressesArray.replace("'", "");
                console.log(knownIPAddressesArray);

                // Generate a new JWT that lasts for 12 hours
                var loginJWTObject = {};
                loginJWTObject.user = queryResponse[0].username;
                loginJWTObject.type = queryResponse[0].userType;
                const loginJWTString = jwt.sign({data: loginJWTObject}, config.AppName, { expiresIn: '12h' }); // Tokens expire after 12 hours.
                console.log(loginJWTString);

                // Return the new token to the user
                responseJSON.status = 200;
                responseJSON.success = true;
                responseJSON.username = queryResponse[0].username;
                responseJSON.token = loginJWTString;
                // Return the Response Object
                response.status(responseJSON.status).json(responseJSON);
            });
        }
    });
});

// Handle a GET request to verify a user account, this is usually from an email verify service.
app.get('/verify', (request, response) => {
    const verifyToken = request.query.verifyToken;
    // The verification token is a hash of the users email address and time stamp of when it was encoded.
    // To verify an account the token must be less than 7 days old.
    var decodedTokenString = cryptr.decrypt(verifyToken);
    // If the timestamp is older then 7 days then reject the token, issue a new one and send via email.
    var decodedTokenArray = decodedTokenString.split(":");

    const now = new Date();
    const timeNow = Math.round(now.getTime() / 1000);
    const timeSevenDaysAgo = timeNow - 604800;

    // If the timestamp from 7 days ago is greater than the decodedToken timestamp then the decoded token is invalid. 
    if(timeSevenDaysAgo >= decodedTokenArray[1]){
        console.log('Token is not valid');
        const htmlConfigObject = {"appName": config.AppName, "favIconURL": config.favIconURL, "errorMessage": "Failed to verify."};
        response.render('confirmVerification', htmlConfigObject);
    } else {
        console.log('Token is valid');
        // Update the DB to refect the verified status of the email address. 
        if(config.useSQLStorage == true){
            const updateVerifyStatusSQL = "UPDATE `users` SET `emailAddressVerified` = '1' WHERE `users`.`username` = '"+decodedTokenArray[0]+"';";
            asyncQueryLookup(updateVerifyStatusSQL)
            .then(queryResponse => {
                //console.log('Query Response: ', queryResponse);

                // Tell MixPanel about the verify event
                mixpanel.track('Verifification', {distinct_id: decodedTokenArray[0],ip: request.clientIp});

                // Because this is a GET request the user will be returned a HTML page confirming successfull verification.
                const htmlConfigObject = {"appName": config.AppName, "favIconURL": config.favIconURL, "verifySuccessMessage": "Thanks for verifying!"};
                response.render('confirmVerification', htmlConfigObject);
            })
            .catch(err => {
                console.log('Async Catch stepped in, here is the error');
                console.log(err);
                const htmlConfigObject = {"appName": config.AppName, "favIconURL": config.favIconURL, "errorMessage": "Failed to verify."};
                response.render('confirmVerification', htmlConfigObject);
            });
        }
    };
});

// Handle a POST request to verify a user from a MFA request.
app.post('/verify', (request, response) => {
    var responseJSON = {};
    responseJSON.status = 500;
    responseJSON.success = false;
    console.log('Got a request to verify the login authenticity of a user.');
    // A verify request is passed the username, the (encrypted) login object and the MFA token.
    const username = request.body.username;
    const encryptedLoginObject = request.body.loginObject;
    const mfaToken = request.body.mfaToken;

    console.log('Going to Verify '+username+' using '+mfaToken+' Decypting Token '+encryptedLoginObject);

    if(username == null || encryptedLoginObject == null || mfaToken == null){
        responseJSON.status = 401;
        responseJSON.success = false;
        responseJSON.message = "Missing Credentials.";
        // Return the Response Object
        response.status(responseJSON.status).json(responseJSON);
    }

    // If using a MariaDB or MySQL DB to store user details
    if(config.useSQLStorage == true){
        //const mariaDBConnectionPool = mariadb.createPool({host: config.mariaDBHost, user:config.mariaDBUser, password: config.mariaDBPassword,database: config.mariaDBDatabase,connectionLimit: 10});
        const findUserSQL = "SELECT DISTINCT `username`, `mfaID`, `mfaRequired` FROM `users` WHERE `username` LIKE '"+username+"' AND `activeUser` = 1";
        asyncQueryLookup(findUserSQL).then(findUserQueryResponse => {
            //console.log(findUserQueryResponse);
            if(findUserQueryResponse.length == 0){
                //console.log('No username exists here..');
                responseJSON.status = 401;
                responseJSON.success = false;
                responseJSON.message = "Missing Correct User Credentials.";
                // Return the Response Object
                response.status(responseJSON.status).json(responseJSON);
            } else {
                const userMFAObject = findUserQueryResponse[0];
                // Make a Request to Authy to Verify a user
                const authyURL = 'https://api.authy.com/protected/json/verify/'+mfaToken+'/'+userMFAObject.mfaID;


                console.log('Making Request to Authy');
                const authyRequestOptions = {
                    method: 'GET',
                    url: authyURL,
                    json: true,
                    headers: {
                        'user-agent': "MatChatMe",
                        'X-Authy-API-Key': config.authyAPIKey,
                        'X-With-Love-From': 'MatJ'
                      }
                }
                get.concat(authyRequestOptions, function (err, res, data) {
                    if (err) throw err
                    //console.log(err);
                    //console.log(data) // `data` is an object
                    //console.log(data.error_code);
                    console.log('Authy Response: '+data.success)
                    // If data.success is true, then the token is valid.
                    if(data.success == 'true'){
                        // If Authy Verify the user then decode their login token and return it back to them.
                        //console.log('Success');
                        //console.log(encryptedLoginObject);

                        var decryptedLoginObject = "Invalid Token Option";
                        try {       
                            decryptedLoginObject = cryptr.decrypt(encryptedLoginObject); 
                            //console.log(decryptedLoginObject);
                            decryptedLoginObject = JSON.parse(decryptedLoginObject);
                        } catch (err) {
                            //console.log(err);
                            //throw err;
                        }
                        //console.log(decryptedLoginObject);
                        // Assemble the login payload
                        var loginObject = {};
                        responseJSON.status = 200;
                        responseJSON.success = true;
                        responseJSON.login = decryptedLoginObject;
                        responseJSON.username = username;
                        response.status(responseJSON.status).json(responseJSON);
                    } else {
                        // Anything other than a success means the request or a connection failed.
                        // If a user makes a bad request too many times then Authy will suspend that account and tell you via error code: 60019
                        // If thats the case, the user needs to contact (your) helpdesk to get that account manually unsuspended.
                        console.log('Failed');
                        if(data.error_code == 60019){
                            console.log('User Suspended');
                            responseJSON.status = 401;
                            responseJSON.success = false;
                            responseJSON.message = "Your MFA account has been suspended. Please contact support to get this suspension removed.";
                            // Return the Response Object
                            response.status(responseJSON.status).json(responseJSON);
                        } else {
                            responseJSON.status = 401;
                            responseJSON.success = false;
                            responseJSON.message = "Request for access has been denied.";
                            // Return the Response Object
                            response.status(responseJSON.status).json(responseJSON);
                        }
                    }
                })
            };
        });
    };
});

// Reset a users password
app.post('/password/reset', (request, response) => {
    console.log('Got a request to reset a users password.');
    const usernameOrEmail = request.body.username; // In this instance, username is interchangeable with email address.
    var responseJSON = {};
    responseJSON.status = 500;
    responseJSON.success = false;

    // For some reason it wouldnt just take one set of quotes :/
    if(usernameOrEmail == null || '' || ""){
        responseJSON.status = 401;
        responseJSON.success = false;
        responseJSON.message = "Missing Credentials.";
        // Return the Response Object
        response.status(responseJSON.status).json(responseJSON);
    } else {
        if(config.useSQLStorage == true){
            // Lookup the user in SQL Table
            const findUserSQL = "SELECT DISTINCT `username`, `userType`, `emailAddress`, `emailAddressVerified`, `activeUser`, `signupCountry`, `mfaID`, `mfaRequired`, `knownIPAddresses` FROM `users` WHERE (`username` LIKE '"+usernameOrEmail+"' OR `emailAddress` LIKE '"+usernameOrEmail+"') AND `activeUser` = 1";
            asyncQueryLookup(bannedObjectSQL).then(queryResponse => {mariaDBConnection.release();});
        }
    }
});

// Change a users password using a provided token
app.post('/password/change', (request, response) => {

});


// Handle the signup HTML
app.get('/signup', (request, response) => {

    const htmlConfigObject = {"favIconURL": config.favIconURL, "appName": config.AppName, "appLogoURL":config.AppLogoURL, "appThumbnailURL":config.appThumbnailURL};
    if(config.requiredAge != null){
        console.log('This service requires an age verification.');
        htmlConfigObject["requiredAge"] = requiredAge;
    }
    // If using Mixpanel add the Mixpanel token here
    if(config.mixpanelID!=""){
        htmlConfigObject.mixpanelToken = config.mixpanelID;
    };

    // If using Google Analytics add the token here
    if(config.googleUrchinID!==""){
        htmlConfigObject.googleAnalytics = config.googleUrchinID;
    };

    response.render('register', htmlConfigObject);
});

app.post('/signup', (request, response) => {
    console.log('Got a request to handle a signup via POST');
    var signupActions = {};
    var addUserObject = {};
    var responseJSON = {};
    responseJSON.status = 500;
    responseJSON.success = false;

    addUserObject.signupUsername = request.body.username;
    console.log('Attempted username: '+addUserObject.signupUsername);
    addUserObject.signupEmail = request.body.emailAddress;
    addUserObject.signupPassword = request.body.password;
    addUserObject.signupTOSAgreed = request.body.tosAgreed;
    addUserObject.signupIPAddress = request.clientIp;
    addUserObject.requestLanguage = request.headers["accept-language"];

    addUserObject.signupTime = Math.floor(new Date() / 1000);

    if(config.requiredAge != null){
        addUserObject.signupRegisteredAge = request.body.registeredAge;
        addUserObject.recordedDOB = request.body.dob || null;
    }
    addUserObject.recordedGender = request.body.gender || null;
    
    addUserObject.mfaRequired = request.body.mfaRequired || 0;

    // Check to see if the required fields are valid
    if(addUserObject.signupUsername == null || addUserObject.signupEmail == null || addUserObject.signupPassword == null || addUserObject.signupTOSAgreed == null){
        console.log('Request was Missing Credentials.');
        responseJSON.status = 401;
        responseJSON.success = false;
        responseJSON.message = "Missing Credentials.";
        // Return the Response Object
        response.status(responseJSON.status).json(responseJSON);
    } else {
        // Hash the signup password so its being stored securely. 
        bcrypt.hash(addUserObject.signupPassword, saltRounds, function(err, hash) {
            addUserObject.hashedPassword = hash;

            // Add the user to the users DB

            // If using a MariaDB or MySQL DB to store user details
            if(config.useSQLStorage == true){
                console.log('Making request to MariaDB to check for an existing user.');
                //const mariaDBConnectionPool = mariadb.createPool({host: config.mariaDBHost, user:config.mariaDBUser, password: config.mariaDBPassword,database: config.mariaDBDatabase,connectionLimit: 100});
                const findUserSQL = "SELECT DISTINCT `username` FROM `users` WHERE `username` LIKE '"+addUserObject.signupUsername+"' AND `activeUser` = 1";
                //console.log(findUserSQL);
                asyncQueryLookup(findUserSQL).then(findUserQueryResponse => {
                    //console.log(findUserQueryResponse);
                    if(findUserQueryResponse.length == 0){
                        console.log('No username exists here..');
                        //console.log(findUserQueryResponse);
                        console.log('Making request to MariaDB to add a new user.');
                        const addUserSQL = "INSERT INTO `users` (`dbid`, `username`, `password`, `requirePasswordChange`, `userType`, `emailAddress`, `emailAddressVerified`, `activeUser`, `dateCreated`, `dateFirstLogin`, `dateClosed`, `signupIP`, `signupUserAgent`, `signupCountry`, `locale`, `recordedGender`, `recordedDOB`, `userIcon`, `mfaID`, `mfaRequired`, `knownIPAddresses`, `adminNotes`, `lastSeenIP`, `lastSeenTimestamp`, `authorisedChannels`) VALUES (NULL, '"+addUserObject.signupUsername+"', '"+addUserObject.hashedPassword+"', '0', 'user', '"+addUserObject.signupEmail+"', '0', '1', '"+addUserObject.signupTime+"', NULL, NULL, '"+addUserObject.signupIPAddress+"', '"+request.headers['user-agent']+"', '"+request.ISOCountryCode+"', '"+addUserObject.requestLanguage+"', '"+addUserObject.recordedGender+"', '"+addUserObject.recordedDOB+"', NULL, NULL, '"+addUserObject.mfaRequired+"', '[\""+addUserObject.signupIPAddress+"\"]', NULL, '"+addUserObject.signupIPAddress+"', NULL, '"+config.defaultChannel+"');";
                        //console.log(addUserSQL);
                        asyncQueryLookup(addUserSQL).then(addUserQueryResponse => {
                            console.log(addUserQueryResponse);
                            // On success feedback the username and sucess response
                            // The user should now be able to login using the usual route.
                            console.log('New User '+addUserObject.signupUsername+' has been created.');

                            // Fire off an email welcoming the user to the Chat app and asking them to validate their email address.
                            if(config.requireEmailValidation == true){
                                // If using MailGun to send off the validation code.
                                const now = new Date();
                                const timeStamp = Math.round(now.getTime() / 1000);
                                var userToken =  addUserObject.signupUsername+":"+timeStamp;

                                const encryptedString = cryptr.encrypt(userToken);
                                if(config.useMailGunEmail == true){
                                    const mailgunSendWelcomeMailObject = {
                                        from: config.mailGunSenderString,
                                        to: addUserObject.signupEmail,
                                        subject: 'Hello! Verification Required.',
                                        text: "Hello and welcome to "+config.AppName+"!\r\n\r\nThis email address needs to be verfied before it can be used.\r\nPlease click on the link to verify:\r\nhttps://"+config.AppURL+"/verify?verifyToken="+encryptedString+"\r\n\r\nThe link is valid for the next 7 days.\r\n\r\nThanks!\r\n"+config.AppName+" Team \r\n\r\nThis email was directly sent to you as a result of a action taken on our website, it is not to be considered spam.\r\nIf this email is unwanted please notify us immediately by replying back."
                                    };
                                    mailgunClient.messages().send(mailgunSendWelcomeMailObject, (error, body) => {
                                        console.log(body);

                                        // Tell MixPanel about the login event
                                        mixpanel.track('Signup', {distinct_id: addUserObject.signupUsername,ip: request.clientIp});

                                        // Return the success object
                                        responseJSON.status = 200;
                                        responseJSON.success = true;
                                        responseJSON.message = "Signup Successful";
                                        response.status(responseJSON.status).json(responseJSON);
                                    });
                                }
                            }

                            // Return the success object
                            // responseJSON.status = 200;
                            // responseJSON.success = true;
                            // responseJSON.message = "Signup Successful";
                            // response.status(responseJSON.status).json(responseJSON);
                        });
                    } else {
                        // User already exists
                        console.log('User '+addUserObject.signupUsername+'already exists.');
                        responseJSON.status = 401;
                        responseJSON.success = false;
                        responseJSON.message = "Bad Credentials";
                        // Return the Response Object
                        response.status(responseJSON.status).json(responseJSON);
                    };
                });
            }
            if(config.useMongoDB == true){

            }
        });
    };
});

// Get a users profile
app.get('/profile', (request, response) => {
    console.log('Got a request to get a users profile');
    var responseJSON = {};
    responseJSON.status = 500;
    responseJSON.success = false;

    const accessToken = request.header('x-api-key');

    // Validate the Access Token
    jwt.verify(accessToken, config.AppName, function(err, decodedToken) {
        if(err){
            console.log('JWT Decoded Error');
            //console.log(err);
            responseJSON.status = 401;
            responseJSON.success = false;
            responseJSON.message = "Bad Credentials";
            // Return the Response Object
            response.status(responseJSON.status).json(responseJSON);
        } else {
            console.log('Valid Token');
            console.log(decodedToken)
            const decodedUsername = decodedToken.data.user

            const getUserProfileSQL = "SELECT DISTINCT `username`, `requirePasswordChange`, `userType`, `emailAddress`, `emailAddressVerified`, `dateCreated`, `locale`, `authorisedChannels`, `recordedGender`, `recordedDOB`, `userIcon` FROM `users` WHERE `username` LIKE '"+decodedUsername+"' AND `activeUser` = 1";
            asyncQueryLookup(getUserProfileSQL).then(getUserProfileQueryResponse => {
                //console.log(getUserProfileQueryResponse);
                // Assemble the User Object to send back to the user
                const userObject = getUserProfileQueryResponse[0];

                // Return the user profile back
                responseJSON.status = 200;
                responseJSON.success = true;
                responseJSON.profile = userObject;
                response.status(responseJSON.status).json(responseJSON);
            });
        }
    });
});

// Get a list of available channels our user can connect to.
app.get('/channels', (request, response) => {
    console.log('Got a request to get a list of channels open to a user.');
    var responseJSON = {};
    responseJSON.status = 500;
    responseJSON.success = false;

    const accessToken = request.header('x-api-key');

    // Validate the Access Token
    jwt.verify(accessToken, config.AppName, function(err, decodedToken) {
        if(err){
            console.log('JWT Decoded Error');
            //console.log(err);
            responseJSON.status = 401;
            responseJSON.success = false;
            responseJSON.message = "Bad Credentials";
            // Return the Response Object
            response.status(responseJSON.status).json(responseJSON);
        } else {
            console.log('Valid Token');
            console.log(decodedToken)
            const decodedUsername = decodedToken.data.user

            const getAvailableChannelsForUserSQL = "SELECT DISTINCT `channelID`, `channelName`, `channelType`, `channelActive`, `channelLanguages` FROM `channels` WHERE `channelType` LIKE 'public' AND `channelActive` = 1";
            asyncQueryLookup(getAvailableChannelsForUserSQL).then(getAvailableChannelsForUserResponse => {
                //console.log(getUserProfileQueryResponse);
                // Assemble the User Object to send back to the user
                const userObject = getAvailableChannelsForUserResponse;

                // Return the user profile back
                responseJSON.status = 200;
                responseJSON.success = true;
                responseJSON.channels = userObject;
                response.status(responseJSON.status).json(responseJSON);
            });
        }
    });
});

// Gets a list of current Video Vendors to be used in this service.
app.get('/video/vendors', (request, response) => {
    console.log('Got a request to get the current list of video vendors.');

    var responseJSON = {};
    responseJSON.status = 500;
    responseJSON.success = false;

    // Decode the JWT
    const accessToken = request.header('x-api-key');
    // Validate the Access Token
    jwt.verify(accessToken, config.AppName, function(err, decodedToken) {
        if(err){
            console.log('JWT Decoded Error');
            //console.log(err);
            responseJSON.status = 401;
            responseJSON.success = false;
            responseJSON.message = "Bad Credentials";
            // Return the Response Object
            response.status(responseJSON.status).json(responseJSON);
        } else {
            console.log('Valid Token');
            console.log(decodedToken)
            const decodedUsername = decodedToken.data.user

            // Assemble the response object
            responseJSON.vendors = config.videoVendorArray;
            responseJSON.status = 200;
            responseJSON.success = true;
            response.status(responseJSON.status).json(responseJSON);
        }
    });
});

// Initiate a Video Session to either a group or P2P Video chat
app.post('/video/create/session/:vendor', (request, response) => {
    console.log('Got a Request to initiate a video session, here are the details:');
    console.log(request.body);

    var responseJSON = {};
    responseJSON.status = 500;
    responseJSON.success = false;

    // Decode the JWT
    const accessToken = request.header('x-api-key');

    // Validate the Access Token
    jwt.verify(accessToken, config.AppName, function(err, decodedToken) {
        if(err){
            console.log('JWT Decoded Error');
            //console.log(err);
            responseJSON.status = 401;
            responseJSON.success = false;
            responseJSON.message = "Bad Credentials";
            // Return the Response Object
            response.status(responseJSON.status).json(responseJSON);
        } else {
            console.log('Valid Token');
            console.log(decodedToken)
            const decodedUsername = decodedToken.data.user

            // Check to see if video is supported
            if(config.supportVideo == true){
                console.log('Video is supported');
                // Check to see which vendor to use
                var videoVendor = request.params.vendor || config.defaultVideoVendor;
                if(videoVendor == "Vonage"){
                    console.log('Using Vonage to generate the video session');
                    var OpenTok = require('opentok'),
                    opentok = new OpenTok(config.VonageVideoAPIKey, config.VonageVideoSecret);
                    var sessionId;
                    var token;
                    opentok.createSession({mediaMode:"routed"}, function(error, session) {
                        if (error) {
                            console.log("Error creating session:", error)
                            responseJSON.status = 404;
                            responseJSON.success = false;
                            responseJSON.message = "Video Not Supported";
                            // Return the Response Object
                            response.status(responseJSON.status).json(responseJSON);
                        } else {
                            sessionId = session.sessionId;
                            console.log("Session ID: " + sessionId);
                            // Generate a Token from the session object
                            //token = sessionId.generateToken();
                            token = opentok.generateToken(sessionId);
                            console.log("Token", token);

                            var videoSessionDetails = {
                                session: sessionId,
                                token: token,
                                channel: request.body.channel,
                                vendor: "Vonage"
                            }

                            // Return the video session details back to the user
                            responseJSON.status = 200;
                            responseJSON.success = true;
                            responseJSON.video = videoSessionDetails;
                            response.status(responseJSON.status).json(responseJSON);
                        }
                    });
                };
                if(videoVendor == "Sinch"){
                    // Sinch doesnt generate a video session ID, so we have to make one that represents the video session.
                    var sessionID = 'VD'+generateUUID();
                    const expirationTimeInSeconds = 3600
                    const currentTimestamp = Math.floor(Date.now() / 1000)
                    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds

                    var tokenID = {username: decodedUsername, expires: privilegeExpiredTs}

                    var videoSessionDetails = {
                        session: sessionID,
                        token: tokenID,
                        channel: request.body.channel,
                        vendor: "Sinch"
                    };

                    responseJSON.status = 200;
                    responseJSON.success = true;
                    responseJSON.video = videoSessionDetails;
                    response.status(responseJSON.status).json(responseJSON);

                }
                if(videoVendor == "Dolby"){
                    // Dolby currently just returns the key and secret used, there is an OAuth2 mechanism but its not worth the hassle
                    var videoSessionDetails = {
                        consumerKey: config.DolbyAPIKey,
                        consumerSecret: config.DolbyAPISecret,
                        channel: request.body.channel,
                        vendor: "Dolby"
                    }

                    responseJSON.status = 200;
                    responseJSON.success = true;
                    responseJSON.video = videoSessionDetails;
                    response.status(responseJSON.status).json(responseJSON);
                }
                if(videoVendor == "Agora"){
                    // Agora doesnt generate a video session ID, so we have to make one to represent the video session.
                    var sessionID = 'VD'+generateUUID();
                    var tokenID = null;
                    const role = RtcRole.PUBLISHER;

                    const expirationTimeInSeconds = 3600
                    const currentTimestamp = Math.floor(Date.now() / 1000)
                    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds

                    tokenID = RtcTokenBuilder.buildTokenWithUid(config.AgoraIOAPIKey, config.AgoraIOSecret, sessionID, decodedUsername, role, privilegeExpiredTs);
                    console.log("Agora Token " + tokenID);

                    var videoSessionDetails = {
                        session: sessionID,
                        token: tokenID,
                        channel: request.body.channel,
                        vendor: "Agora"
                    };
                    responseJSON.status = 200;
                    responseJSON.success = true;
                    responseJSON.video = videoSessionDetails;
                    response.status(responseJSON.status).json(responseJSON);
                }
                if(videoVendor == "SignalWire"){

                }
                // else {
                //     responseJSON.status = 404;
                //     responseJSON.success = false;
                //     responseJSON.message = "Video Not Supported";
                //     // Return the Response Object
                //     response.status(responseJSON.status).json(responseJSON);
                // }
            } else {
                responseJSON.status = 404;
                responseJSON.success = false;
                responseJSON.message = "Video Not Supported";
                // Return the Response Object
                response.status(responseJSON.status).json(responseJSON);
            };
        };
    });
});

// Generate a token to join a video session
app.post('/video/join/session/:vendor', (request, response) => {
    console.log('Got a request to generate a token for an existing session, here are the details: ');
    console.log(request.body);

    var responseJSON = {};
    responseJSON.status = 500;
    responseJSON.success = false;

    // Decode the JWT
    const accessToken = request.header('x-api-key');

    // Validate the Access Token
    jwt.verify(accessToken, config.AppName, function(err, decodedToken) {
        if(err){
            console.log('JWT Decoded Error');
            //console.log(err);
            responseJSON.status = 401;
            responseJSON.success = false;
            responseJSON.message = "Bad Credentials";
            // Return the Response Object
            response.status(responseJSON.status).json(responseJSON);
        } else {
            console.log('Valid Token');
            console.log(decodedToken)
            const decodedUsername = decodedToken.data.user

            // Check to see if Video is supported on this app
            if(config.supportVideo == true){
                var videoVendor = request.params.vendor || config.defaultVideoVendor;
                // Vonage
                if(videoVendor == "Vonage"){
                    var OpenTok = require('opentok'),
                    opentok = new OpenTok(config.TokBoxAPIKey, config.TokBoxSecret);
                    var sessionId = request.body.session;
                    var token = opentok.generateToken(sessionId);

                    var videoSessionDetails = {
                        session: sessionId,
                        token: token
                    };

                    // Return the video session details back to the user
                    responseJSON.status = 200;
                    responseJSON.success = true;
                    responseJSON.video = videoSessionDetails;
                    response.status(responseJSON.status).json(responseJSON);
                };
                // Agora
                if(videoVendor == "Agora"){
                    // Generate the Agora Token for this user
                    var tokenID = null;
                    const role = RtcRole.PUBLISHER;


                    const expirationTimeInSeconds = 3600
                    const currentTimestamp = Math.floor(Date.now() / 1000)
                    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds

                    tokenID = RtcTokenBuilder.buildTokenWithUid(config.AgoraIOAPIKey, config.AgoraIOSecret, request.body.session, decodedUsername, role, privilegeExpiredTs);
                    console.log("Agora Token " + tokenID);

                    var videoSessionDetails = {
                        session: request.body.session,
                        token: tokenID,
                        channel: request.body.channel,
                        vendor: "Agora"
                    };
                    responseJSON.status = 200;
                    responseJSON.success = true;
                    responseJSON.video = videoSessionDetails;
                    response.status(responseJSON.status).json(responseJSON);
                }
                // Sinch
                if(videoVendor == "Sinch"){
                    var tokenID = null;
                    tokenID = 'TK'+generateUUID();
                    var videoSessionDetails = {
                        session: request.body.session,
                        token: tokenID,
                        channel: request.body.channel,
                        vendor: "Sinch"
                    };
                    responseJSON.status = 200;
                    responseJSON.success = true;
                    responseJSON.video = videoSessionDetails;
                    response.status(responseJSON.status).json(responseJSON);
                }
            } else {
                responseJSON.status = 404;
                responseJSON.success = false;
                responseJSON.message = "Video Not Supported";
                // Return the Response Object
                response.status(responseJSON.status).json(responseJSON);
            }
        }
    });
});

// Loads a new Video window using the session and video token
app.get('/video/:sessionID/:vendor', (request, response) => {
    console.log('Serving a Video Page');
    const htmlConfigObject = {
        "appName": config.AppName,
        "appLogoURL": config.AppLogoURL,
        "favIconURL": config.favIconURL,
        "sessionID": request.params.sessionID,    
    };
    // If using Mixpanel add the Mixpanel token here
    if(config.mixpanelID!=""){
        htmlConfigObject.mixpanelToken = config.mixpanelID;
    };

    // If using Google Analytics add the token here
    if(config.googleUrchinID!==""){
        htmlConfigObject.googleAnalytics = config.googleUrchinID;
    };

    // Add the video vendor details to the HTML object so they can be passed to the HTML page
    if(request.params.vendor == "Vonage"){
        htmlConfigObject.videoVendor = "Vonage";
        htmlConfigObject.vendorAPIKey = config.VonageVideoAPIKey;
        htmlConfigObject.vendorAPISecret = config.VonageVideoSecret;
    }

    if(request.params.vendor == "Agora"){
        htmlConfigObject.videoVendor = "Agora";
        htmlConfigObject.vendorAPIKey = config.AgoraIOAPIKey;
        htmlConfigObject.vendorAPISecret = config.AgoraIOSecret;
    }

    if(request.params.vendor == "Sinch"){
        htmlConfigObject.videoVendor = "Sinch";
        htmlConfigObject.vendorAPIKey = config.SinchAPIKey;
        htmlConfigObject.vendorAPISecret = config.SinchSecret;
    }

    response.render('video', htmlConfigObject);
});


// Handle an App command
// app.post('/command/:commandType', (request, response) => {
//     // Handle a command from a chat message, this is usually send an SMS, do a thing etc.

//     if(request.params.commandType =='sms'){






//         if(config.useNexmo == true){
//             nexmoClient.message.sendSms(from, to, text);
//         }
//         if(config.useTwilio == true){

//         }

//         // 
//     }
// });

// Handle an inbound Message Request
app.post('/message', (request, response) => {
    var responseJSON = {};
    responseJSON.status = 500;
    responseJSON.success = false;

    var pubnubClientConfig = null;
    var outgoingPubNubPayload = null;
    var outgoingMessagePayload = {};
    var messageMetaData = {};

    const accessToken = request.body.accessToken;
    var toID = request.body.to; // Variable incase we need to modify the destination some time later
    const messageType = request.body.messageType || request.body.type;
    const encryptedMessage = request.body.encrypted || false;
    var messageObject = request.body;
    // 99% of the time the request will include the language the user sent the message in.
    // Only falling back to the browser header language if something has not been passed.
    var messageLanguage = request.body.language || request.headers["accept-language"]; 
    var languageArray = null;
    if(messageLanguage.includes("-")){
        languageArray = messageLanguage.split("-");
    } else {
        languageArray = [messageLanguage];
    }

    console.log('Got a request to send a message, here are the details:');
    console.log(request.body);

    // Validate the Access Token
    jwt.verify(accessToken, config.AppName, function(err, decodedToken) {
        if(err){
            console.log('JWT Decoded Error');
            //console.log(err);
            responseJSON.status = 401;
            responseJSON.success = false;
            responseJSON.message = "Bad Credentials";
            // Return the Response Object
            response.status(responseJSON.status).json(responseJSON);
        } else {
            console.log(decodedToken)
            const decodedUsername = decodedToken.data.user
            if(decodedToken === undefined){
                console.log('Broken Token');
                responseJSON.status = 401;
                responseJSON.success = false;
                responseJSON.message = "Bad Credentials";
                // Return the Response Object
                response.status(responseJSON.status).json(responseJSON);

            } else {
                console.log('Valid Token');
                // Check all the input variables to make sure everything is valid and not missing.
                if(decodedUsername == null || toID == null || messageType == null || messageObject == null){
                    responseJSON.status = 400;
                    responseJSON.success = false;
                    responseJSON.message = "Missing Message Details";
                    

                    console.log(messageObject);
                } else {
                    // Generate the Meta Data for this message, including messageSID, fromID, fromIP, timestamp, toID, messageObject, messageType, messageActiveState, parentThreadID
                    messageMetaData.messageSID = 'MS'+generateUUID();
                    messageMetaData.fromID = decodedUsername;
                    //messageMetaData.fromIP = request.clientIp;

                    console.log(messageMetaData.messageSID);

                    // Epoch Time Stamp
                    const now = new Date();
                    messageMetaData.timestamp = Math.round(now.getTime() / 1000);
                    messageMetaData.toID = toID;
                    messageMetaData.type = messageType;
                    messageMetaData.active = true;
                    messageMetaData.viaAPI= true;

                    if(encryptedMessage == true){
                        console.log('This Message is encrypted');
                        messageMetaData.encrypted = true;
                    };

                    if(messageType == 'text'){
                        // Inspect the message for any '/' commands, eg; /sms|+14152555613|Hi, this is my message!
                        // if(messageObject.startsWith("/sms|")){
                        //     console.log('This message has the slash SMS command, going to decode the SMS');
                        //     // Split the string so we can get to the array of data
                        //     var smsArray = messageObject.split("|");
                        //     console.log(smsArray);
                        //     // If using Nexmo fire off the message using Nexmo
                        //     if(config.useNexmo == true){
                        //         // nexmoClient.message.sendSms(config.nexmoSenderID, smsArray[1], smsArray[2]);
                        //         nexmoClient.message.sendSms(config.nexmoSenderID, smsArray[1], smsArray[2], (err, responseData) => {
                        //             if (err) {
                        //                 console.log(err);
                        //             } else {
                        //                 if(responseData.messages[0]['status'] === "0") {
                        //                     console.log("Message sent via Nexmo was Successful.");
                        //                 } else {
                        //                     console.log(`Message sent via Nexmo failed with error: ${responseData.messages[0]['error-text']}`);
                        //                 }
                        //             }
                        //         })
                        //     };
                        //     // If using Twilio, fire off the message using Twilio.
                        //     // Please note, if both are turned on, a user might recieve two messages so watch out!
                        //     if(config.useTwilio == true){};

                        //     // Because the '/sms' command looks a bit ugly, modify the message payload so it looks a lot prettier. 
                        //     messageObject = 'SMS To: '+smsArray[1]+' Body: '+smsArray[2];
                        // };

                        // Message commands are built on IRC style commands and then extend them with new features.
                        // https://kiwiirc.com/docs/client/commands
                        if(messageObject.body.startsWith("/msg")){

                        };
                        if(messageObject.body.startsWith("/action")){

                        };
                        if(messageObject.body.startsWith("/query")){

                        };
                        if(messageObject.body.startsWith("/notice")){

                        };
                        if(messageObject.body.startsWith("/join")){

                        };
                        if(messageObject.body.startsWith("/part")){

                        };
                        if(messageObject.body.startsWith("/kick")){

                        };
                        if(messageObject.body.startsWith("/nick")){

                        };
                        if(messageObject.body.startsWith("/topic")){

                        };
                        if(messageObject.body.startsWith("/whois")){

                        };
                        if(messageObject.body.startsWith("/whowas")){

                        };
                        if(messageObject.body.startsWith("/ctcp")){

                        };
                        if(messageObject.body.startsWith("/quote")){

                        };
                        if(messageObject.body.startsWith("/clear")){

                        };
                        if(messageObject.body.startsWith("/ignore")){

                        };
                        if(messageObject.body.startsWith("/unignore")){

                        };
                        if(messageObject.body.startsWith("/sms")){
                            // an SMS command is broken up in to three parts; toID, fromID, messageBody
                        };
                        if(messageObject.body.startsWith("/bandwidth")){
                            // A bandwidth command is broken up in to three parts; toID, fromID, messageBody
                            console.log('This message has the slash Bandwidth command, going to decode the SMS');
                            // Split the string so we can get to the array of data
                            var smsArray = messageObject.body.split("|");
                            console.log(smsArray);

                            // Fire off the message to Bandwidth API's
                            if(config.useBandwidth == true){
                                console.log('Making Request to Bandwidth');
                                const bandwidthRequestOptions = {
                                    method: 'POST',
                                    url: 'https://'+config.bandwidthAPIKey+':'+config.bandwidthAPISecret+'@messaging.bandwidth.com/api/v2/users/5006489/messages',
                                    json: true,
                                    headers: {
                                        'user-agent': "MatChatMe",
                                        'X-With-Love-From': 'MatJ'
                                    },
                                    body: {
                                        to: smsArray[1],
                                        from: config.bandwidthDefaultNumber,
                                        text: smsArray[3],
                                        applicationId: config.bandwidthAppID
                                    }
                                };
                                get.concat(bandwidthRequestOptions, function (err, res, data) {
                                    console.log('Bandwidth Response: ');
                                    console.log(data);
                                });
                            };
                            messageObject.body = smsArray[2]+': '+ smsArray[3];
                        };
                        if(messageObject.body.startsWith("/video")){

                        };
                    };
                    if(messageType == 'videoInvite'){
                        console.log('This is a video invite, the contents are:');
                        console.log(messageObject);
                    };
                    // Check to see if this is a DM message.
                    if(toID.startsWith('private-')){
                        toID = toID.split('-');

                        // Check if this message is to a bot, bots UUID's are defined by 'bot' at the end. 
                        if(toID[1].endsWith("Bot")){

                        }
                        // If using PubNub to distribute the messages push the message into the appropriate PubNub Channel. 
                        if(config.usePubNub == true){
                            pubnubClientConfig = {
                                publishKey : config.pubnubPublishKey,
                                subscribeKey : config.pubnubSubscribeKey,
                                ssl: true,
                                uuid: decodedUsername,
                                origin: config.pubnubDomain+".pubnub.com"
                            };
                            if(config.useMessageEncryption == true){
                                pubnubClientConfig.cipherKey = config.cipherKey || config.AppName;
                            }

                            var assembledMessagePayload = assembleMessageObject(messageType, messageObject);
                            console.log('P2P assembledMessagePayload',assembledMessagePayload);
                            // Outgoing Payload is to the reciever of the P2P message
                            outgoingPubNubPayload = {
                                channel : toID[1],
                                message : {content: assembledMessagePayload, sender: decodedUsername, to: toID[1]}, 
                                sendByPost: true, 
                                meta: messageMetaData,
                                sender: {id: decodedUsername, name: decodedUsername},
                                viaAPI: true
                            };
                            asyncSendToPubNub(pubnubClientConfig, outgoingPubNubPayload).then(publishEvent => {
                                //console.log(publishEvent);
                                // Return the success object
                                // responseJSON.status = 200;
                                // responseJSON.success = true;
                                // responseJSON.message = "Message Successful";
                                // response.status(responseJSON.status).json(responseJSON);
                            });
                            // If the user is messaging themself dont send an origin payload
                            if(toID[1] == decodedUsername){
                                responseJSON.status = 200;
                                responseJSON.success = true;
                                responseJSON.message = "Message Successful";
                                response.status(responseJSON.status).json(responseJSON);
                            } else {
                                // Origin Payload is to the original sender of the message
                            var originPubNubPayload = {
                                channel : toID[2],
                                message : {content: assembledMessagePayload, sender: decodedUsername, to: toID[1]}, 
                                sendByPost: true, 
                                meta: messageMetaData,
                                sender: {id: decodedUsername, name: decodedUsername},
                                viaAPI: true
                            };
                            asyncSendToPubNub(pubnubClientConfig, originPubNubPayload).then(publishEvent => {
                                //console.log(publishEvent);
                                // Return the success object
                                responseJSON.status = 200;
                                responseJSON.success = true;
                                responseJSON.message = "Message Successful";
                                response.status(responseJSON.status).json(responseJSON);
                            });
                            }
                        };
                    } else {
                        console.log('Not a private message');
                        // Check to make sure this user can send this message to this person or group/channel
                        // Lookup the channel
                        const lookupChannelSQL = "SELECT DISTINCT `channelID`, `channelName`, `channelType`, `channelLanguages`, `channelParticipants` FROM `channels` WHERE `channelID` LIKE '"+toID+"' AND `channelActive` = 1";
                        asyncQueryLookup(lookupChannelSQL).then(findChannelQueryResponse => {
                            console.log(findChannelQueryResponse);
                            const findChannelObject = findChannelQueryResponse[0];
                            console.log(findChannelObject);
                            var participantArray = findChannelObject.channelParticipants;
                            participantArray = participantArray.replace('"', '');
                            console.log(participantArray);
                            // If the channel is public then anyone is free to post to this channel.
                            if(findChannelObject.channelType == 'public'){
                                console.log('This is a Public Room');

                                // If using PubNub to distribute the messages push the message into the appropriate PubNub Channel. 
                                if(config.usePubNub == true){
                                    pubnubClientConfig = {
                                        publishKey : config.pubnubPublishKey,
                                        subscribeKey : config.pubnubSubscribeKey,
                                        ssl: true,
                                        uuid: decodedUsername,
                                        origin: config.pubnubDomain+".pubnub.com"
                                    };
                                    if(config.useMessageEncryption == true){
                                        pubnubClientConfig.cipherKey = config.cipherKey || config.AppName;
                                    }

                                    var assembledMessagePayload = assembleMessageObject(messageType, messageObject);
                                    console.log('Public assembledMessagePayload',assembledMessagePayload);
                                    outgoingPubNubPayload = {
                                        channel : toID,
                                        message : {content: assembledMessagePayload, sender: decodedUsername}, 
                                        sendByPost: true, 
                                        meta: messageMetaData,
                                        sender: {id: decodedUsername, name: decodedUsername},
                                        viaAPI: true
                                    };
                                    asyncSendToPubNub(pubnubClientConfig, outgoingPubNubPayload).then(publishEvent => {
                                        //console.log(publishEvent);
                                        // Return the success object
                                        responseJSON.status = 200;
                                        responseJSON.success = true;
                                        responseJSON.message = "Message Successful";
                                        response.status(responseJSON.status).json(responseJSON);
                                    });
                                };
                            } else {
                                console.log('The room: '+toID+' is marked as private.');
                                // Check the user can send messages to this room.
                                if(participantArray.includes(decodedUsername)){
                                    console.log('Success! The user can send to this private room');
                                    // If using PubNub to distribute the messages push the message into the appropriate PubNub Channel. 
                                    if(config.usePubNub == true){
                                        pubnubClientConfig = {
                                            publishKey : config.pubnubPublishKey,
                                            subscribeKey : config.pubnubSubscribeKey,
                                            ssl: true,
                                            uuid: decodedUsername,
                                            origin: config.pubnubDomain+".pubnub.com"
                                        };
                                        if(config.useMessageEncryption == true){
                                            pubnubClientConfig.cipherKey = config.cipherKey || config.AppName;
                                        }

                                        var assembledMessagePayload = assembleMessageObject(messageType, messageObject);
                                        console.log('Private assembledMessagePayload',assembledMessagePayload);
                                        outgoingPubNubPayload = {
                                            channel : toID,
                                            message : assembledMessagePayload, 
                                            sendByPost: true, 
                                            meta: messageMetaData, 
                                            sender: {id: decodedUsername, name: decodedUsername},
                                            viaAPI: true
                                        };
                                        asyncSendToPubNub(pubnubClientConfig, outgoingPubNubPayload).then(publishEvent => {
                                            //console.log(publishEvent);
                                            // Return the success object
                                            responseJSON.status = 200;
                                            responseJSON.success = true;
                                            responseJSON.message = "Message Successful";
                                            response.status(responseJSON.status).json(responseJSON);
                                        });
                                    };
                                } else {
                                    console.log('Failed! This user is not permitted to send messages to this channel.');
                                    responseJSON.status = 401;
                                    responseJSON.success = false;
                                    responseJSON.message = "Bad Credentials";
                                    // Return the Response Object
                                    response.status(responseJSON.status).json(responseJSON);
                                }
                            }
                        });
                    };
                }
            }
        };
    });
    function assembleMessageObject(messageType, messageObject){
        console.log('assembleMessageObject', messageObject);
        var assembledMessageObject = {};
        // If the message is a text message
        if(messageType == 'text'){
            assembledMessageObject.type = 'text';
            assembledMessageObject.message = messageObject.body;
        }
        if(messageType == 'reaction'){
    
        }
        if(messageType == 'pollAnswer'){
    
        }
        // If the Message is an image 
        if(messageType == 'image'){
            assembledMessageObject.type = 'image';
            assembledMessageObject.full = messageObject.full;
            assembledMessageObject.thumbnail = messageObject.thumbnail;
        }
        if(messageType == 'video'){
    
        }
        if(messageType == 'videoInvite'){
            assembledMessageObject.type = 'videoInvite';
            assembledMessageObject.session = messageObject.session;
            assembledMessageObject.vendor = messageObject.vendor
        }
        // Unaccountable File type.
        if(messageType == 'raw'){
            assembledMessageObject.type = 'image';
            assembleMessageObject.content = messageObject;
        }
        return assembledMessageObject;
    }
});

app.get('/chat', (request, response) => {
    console.log('Serving a Chat Page');
    const htmlConfigObject = {
        "appName": config.AppName,
        "appLogoURL": config.AppLogoURL,
        "favIconURL": config.favIconURL,

    };
    // If using Mixpanel add the Mixpanel token here
    if(config.mixpanelID!=""){
        htmlConfigObject.mixpanelToken = config.mixpanelID;
    };

    // If using Google Analytics add the token here
    if(config.googleUrchinID!==""){
        htmlConfigObject.googleAnalytics = config.googleUrchinID;
    };

    if(config.TokBoxAPIKey !==""){
        htmlConfigObject.tokBoxAPIKey = config.TokBoxAPIKey
    }
    response.render('chat', htmlConfigObject);
});

app.get('/', (request, response) => {
    response.sendFile(path.join(__dirname, './public', 'index.html'));
});

// Admin and dashboards are protected by a Basic Auth service.
// app.use(basicAuth({
//     users: config.adminUsersOject,
//     challenge: true,
//     realm: config.appName+' Admin',
// }));

// // Load a live dashboard
// app.get('/dashboard', (request, response) => {
//     console.log('Serving a Dashboard Page');
//     const htmlConfigObject = {"appName": config.AppName, "pubnubSubscribeKey": config.pubnubSubscribeKey, "favIconURL": config.favIconURL};
//     response.render('dashboard', htmlConfigObject);
// });

// // Get the Admin SPA
// app.get('/admin', (request, response) =>{
//     const htmlConfigObject = {
//         "favIconURL": config.favIconURL,
//         "appName": config.AppName,
//         "appLogoURL":config.AppLogoURL,
//         "appThumbnailURL":config.appThumbnailURL,
//     };

//     if(config.usePubNub == true){
//         htmlConfigObject.pubnubSubscribeKey = config.pubnubSubscribeKey,
//         htmlConfigObject.pubnubPublishKey =  config.pubnubPublishKey,
//         htmlConfigObject.pubnubSecretKey = config.pubnubSecretKey
//     }
//     response.render('admin', htmlConfigObject);
// });

// app.get('/admin/user', (request, response) =>{
//     // Handle an Admin request to get a list of users and their state
// });

// app.post('/admin/user/create', (request, response) =>{
//     // Handle an Admin request to create a user
// });

// app.post('/admin/user/update', (request, response) =>{
//     // Handle an Admin request to update a user
// });

app.listen(config.port, () => console.log(`${config.AppName} App listening on port ${config.port}!`));