# MatChatMe

## What is MatChatMe?
MatChatMe is a template tool that can be used to build production ready chat applications for both web and direct API connection based services. 

With MatChatMe, you should be able to very quickly build a Whatsapp or Slack clone with minimal modifications. 
The application has been built to be as flexible as possible, using a config file to modify the user experience based on how you want to run the chat application. 

The main config settings are: 
* Architecture type; Distributed or P2P
* Use MySQL/MariaDB to store the app data
* Signin with 3rd Party services such as Google, Facebook, Apple etc.
* Custom App name, with logo and fav icons deployed in HTML pages.
* Support for Bots
* Multi-language support
* Connect via API or HTML provided pages, allows you to offer hybrid models of connectivity.

## How to setup MatChatMe
1. Clone the repo.
2. Edit Config.js, adding the appropriate credentials and settings relevant to your app and setup.
3. Add your logo and fav icons and reference them as whole URL's in Config.js
4. Deploy the app using PM2, ClaudiaJS, GCE or whatever you run your NodeJS apps on.



Mike Oxmall