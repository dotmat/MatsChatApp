module.exports = {
    "port":3000, // Port the App will run on
    "AppURL": "demo.matschat.app", // The root URL of the apps location
    "AppName":"MatsChatApp", // App Name 'MatChat' 
    "AppLogoURL":"/images/brand/MatsChatAppLogo.png", // Logo of the App
    "AppThumbnailURL":"/images/brand/favicon.png", // Thumbnail Of the App Logo
    "favIconURL": "/images/favicon.png", // Fav Icon URL
    "defaultChannel": "main", // Whats the default channel that all users can join
    "requireEmailValidation": false, // When a new person signs up, require them to validate their email address via an email token.
    "requiredAge": null, // If the signup age has a required minimum.
    "requiredGender": null, // If the signup process requires a gender.
    "scanAllRequestsForBannedIPorUsername": false, // Scans every incoming HTTP request for a banned IP or Username
    "useBanishBot": false, // BanishBot, service for banishing IP's and Usernames.
    "banishbotAPIKey": null, // BanishBot API key
    "useTwilio": false, // Use Twilio
    "supportMedia": true, // Does the platform support sending files
    "useCloudinary": true, // Use Cloudinary for the media upload service
    "cloudinaryKey": null, // The upload key for use on Cloudinary 
    "twilioAccountSID": "ACxxx", // Twilio AccountSID
    "twilioAuthToken": null, // Twilio AuthToken
    "twilioMessageService": null, // Twilio's message service/copilot for sending outgoing messages
    "useTwilioClient":false, // Use Twilio Client for voice & video connectivity
    "twilioVoiceAppSID":"APyyy", // Twilio Voice AppSID
    "twilioVideoAppSID":"", // Twilio Video AppSID
    "useNexmo":false, // Use Nexmo for Voice and SMS Auth
    "nexmoAPIKey": null, // Nexmo API key
    "nexmoAuthToken":null, // Nexmo Auth Token
    "nexmoSenderID": null, // The phonenumber for sending out messages
    "nexmoAppID": null, // AppID for Sending Messages
    "useBandwidth": false, // Use Bandwidth API for Voice and SMS/MMS Messages
    "bandwidthAPIKey": null, // Bandwidth API Key
    "bandwidthAPISecret": null, // Bandwidth API Secret
    "bandwidthAppID": null, // Bandwidth Application ID
    "bandwidthDefaultNumber": null, // Bandwidth Default TelephoneNumber
    "useAuthy": false, // Use Authy for verification
    "authyID":null, // Authy ID
    "authyAPIKey": null, // Authy API Key, used to communicate with the Authy API Servers
    "methodology": "waterfall", // What kind of chat architecture is to be implimented. Waterfall, distributed, etc 
    "translateMessages": false, // Translate the message into an array of messages used in a chat channel.
    "usePubNub": true, // Use PubNub to deliver the messages to user
    "usePubNubSignals": false, // Use PubNub Signals to deliver typing indicators and throw away messages
    "pubnubPublishKey": null, // PubNub Publish Key
    "pubnubSubscribeKey": null, // PubNub Subscribe Key
    "pubnubSecretKey": null, // PubNub Secret Key, used for Server to Server tasks
    "useMessageEncryption":false, // Should the message payload be encrypted.
    "cipherKey":null, // Encryption Key to use
    "useSQLStorage": true, // Use Maria / MySQL for the database
    "storeMessages": true, // Storage the messages in the DB
    "allowGuests": false, // Typically used in temporary style chat rooms
    "mariaDBHost":null, // Database Host
    "mariaDBUser": null, // Database User
    "mariaDBPassword":null, // Database Password
    "mariaDBDatabase":null,
    "useMongoDB": false, // Use MongoDB for the database
    "mongoDBConnectionString": null, // MongoDB Connection String
    "mongoDBName":null, // MongoDB DatabaseName
    "trackJSToken": null, // TrackJS Token
    "googleUrchinID":null, // Google Urchin Tracking ID, this is the ID used in Google Analytics
    "mixpanelID": null, // Mixpanel TrackingID
    "support3rdPartyLogin": false, // Support 3rd Party Logins from things like google, facebook, apple etc.
    "googleSigninClientID": null, // Google Signin Client 
    "appleSigninClientID": null, // Apple Signin Client
    "facebookSigninClientID": null, // Facebook Signin client
    "useMailGunEmail": true, // Use MailGun Email service to send emails out to customers.
    "mailGunAPIKey": null, // Mailgun API Key
    "mailGunDomain":null, // MailGun Domain to Send Messages from.
    "mailGunSenderString": null, // MailGun SenderID String
    "adminUsersOject": { 'mathew': 'Mathew' }, // The Object containing all users who can access the admin page.
    "supportVideo": true, // Allow Video on this service
    "allowMultiVideoVendors": true, // Allow the user to pick which video service they want to use
    //"videoVendorArray": ["Vonage", "Sinch", "Agora", "Dolby", "SignalWire", "Bandwidth"], // List of Video Service providors.
    "videoVendorArray": ["Vonage"], // List of Video Service providors.
    "defaultVideoVendor": "Vonage", // The default video service to use
    "VonageVideoAPIKey": null, // Vonage API Key
    "VonageVideoSecret" : null, // TokBox Secret
    "SinchAPIKey":null, // Sinch API Key
    "SinchSecret":null, // Sinch Secret
    "DolbyAPIKey": null, // Dolby.io API Key
    "DolbyAPISecret":null, // Dolby.io API Secret
    "DolbyMediaAPI":null, // Dolby.io Media API Key
    "DolyBase64Key": null, // Base64 Key Version
    "AgoraIOAPIKey": null, // AgoraIO API Key
    "AgoraIOSecret": null, // AgoraIO API Secret  
    "AgoraIOProject": "", // AgoraIO Project ID
    "SignalWireAPIKey": null, // SignalWire API Key
    "SignalWireSpaceURL":null, // SignalWire Space URL
    "SignalWireProjectID":null // SignalWire Project ID
};