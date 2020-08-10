'use-strict';

var chatSPA = {
    appName: null,
    appURL: null,
    pubnubClient: null,
    usePNSignals: false,
    username: null,
    accessToken: null,
    deliveryMethology: null,
    channelsArray:[],
    directMessagesObject: {},
    availableChannelsObject:{},
    usersObject: [],
    blockedUsersArray: [],
    uploadSourcesArray: [ 'local', 'camera','facebook', 'instagram'],
    getUrlParameter: function getUrlParameter(sParam) {
        var sPageURL = window.location.search.substring(1),
            sURLVariables = sPageURL.split('&'),
            sParameterName,
            i;
    
        for (i = 0; i < sURLVariables.length; i++) {
            sParameterName = sURLVariables[i].split('=');
    
            if (sParameterName[0] === sParam) {
                return sParameterName[1] === undefined ? true : decodeURIComponent(sParameterName[1]);
            }
        }
    },
    niceifyTimeStamp: function(timestamp){
        return timestamp;
    },
    generateUUID: function(){
        var dt = new Date().getTime();
        var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = (dt + Math.random()*16)%16 | 0;
            dt = Math.floor(dt/16);
            return (c=='x' ? r :(r&0x3|0x8)).toString(16);
        });
        return uuid;
    },
    showNotification: function(from, align, color, timer, messageBody, messageIcon) {
        $.notify({icon: messageIcon,message: messageBody}, {
            type: color,
            timer: timer,
            placement: {
                from: from,
                align: align
            }
        });
    },
    openMobileMenuBar: function(){
        // To open the Mobile Menu Bar, in the 'navbar-main-toggler-button' button, remove the 'collapsed' value from class
        // then set 'aria-expanded' to true
        // then add the 'show' class to id 'sidenav-collapse-main'
        $('#navbar-main-toggler-button').removeClass('collapsed');
        // ToDo: space for aria-expanded
        $('#sidenav-collapse-main').addClass('show');
    },
    closeMobileMenuBar: function(){
        // To close the Mobile Menu Bar, remove the 'show' class from id 'sidenav-collapse-main'
        // then set 'aria-expanded' to false
        // then in the 'navbar-main-toggler-button' button, add the 'collapsed' value to class
        $('#sidenav-collapse-main').removeClass('show');
        // ToDo: space for aria-expanded
        $('#navbar-main-toggler-button').addClass('collapsed');
    },
    searchArray: function(keyToFind, arrayToSearch){
        //console.log('Going to search array:', arrayToSearch);
        var boolReturn = false
        for (var i = 0, len = arrayToSearch.length; i < len; i++) {
            console.log(arrayToSearch[i]);
            if(arrayToSearch[i][keyToFind]){
                // Found a onbject with that array
                console.log('Found the Key');
                boolReturn = true;
            } else {
                // No object in that array exists
                console.log('No Key exists');
            }
        }
        return boolReturn;
    },
    detectBrowser: function(){
        return navigator.userAgent;
    },
    gracefulDisconnect: function(){
        // Gracefully Unsubscribe from PubNub, this will generate a leave event
        chatSPA.pubnubClient.unsubscribe({channels: chatSPA.channelsArray});
        // Reset the page by forcing a reboot
        chatSPA.forceLogUserOut();
    },
    logUserOutButton:function(){
        // Button Handler to log user out.
        chatSPA.logUserOut();
    },
    logUserOut: function(){
        // Initiating user logout
        // Gracefully Unsubscribe from PubNub, this will generate a leave event
        chatSPA.pubnubClient.unsubscribe({channels: chatSPA.channelsArray});
        // Remove all the local storage items
        localStorage.clear();
        // Reboot the page
        location.reload();
    },
    forceLogUserOut: function(){
        // Initiating user logout
        // Remove all the local storage items
        localStorage.clear();
        // Reboot the page
        location.reload();
    },
    handleInvalidAccessToken: function(){
        console.log('Got a request to refresh the accessToken');
        chatSPA.lazyAPIRequestToServer('/login',{},'PUT', chatSPA.handleRefreshAccessTokenSuccess, chatSPA.handleRefreshAccessTokenFailure);
    },
    handleRefreshAccessTokenSuccess: function(successTokenPayload){

    },
    handleRefreshAccessTokenFailure: function(){
        // Any kind of accessToken failure results in an instant re-login.
        window.location.replace('/login');
    },
    launcher: function(){
        chatSPA.appName = $('meta[name=appName]').attr("content") || 'ChatApp';
        console.log(chatSPA.appName+' is launching!');

        // Check for the presence of an accessToken and username. Everything else is secondary
        if(localStorage.getItem('username') && localStorage.getItem('accessToken')){
            chatSPA.username = localStorage.getItem('username');
            chatSPA.accessToken = localStorage.getItem('accessToken');

            // Check for the presence of a private room for the user, if one does not exist, create one.
            if(localStorage.getItem('private-'+chatSPA.username+'-'+chatSPA.username)){
                console.log('Private User Room exists');
            } else {
                console.log('Private room does not exist');
                localStorage.setItem('private-'+chatSPA.username+'-'+chatSPA.username,[]);
                console.log('Private room now exists.');
            }

            // Make a request to get the users profile. This will include what channels the user can subscribe to.
            chatSPA.getUserProfileRequest();

            // Check for the presence of a profile URL, if one exists then load it in the UI pages. If one does not then use initials to generate one.
            if(localStorage.getItem('userProfileURL')){
                $("#userProfileURL0").attr("src",localStorage.getItem('userProfileURL'));
                $("#userProfileURL1").attr("src",localStorage.getItem('userProfileURL'));
            } else {
                //console.log('No User ProfileURL was found, using text generated');
                // Draw the initials.
                $("#userProfileURL0").initial({name:chatSPA.username,});
                $("#userProfileURL1").initial({name:chatSPA.username,});
            };

            // If we have a username and accessToken, assume they are valid for now
            // Check what kind of socket service we are using. 
            if(localStorage.getItem('pubnubSubKey')){
                const pubnubSubKey = localStorage.getItem('pubnubSubKey');
                // If using PubNub, load the PubNub Client.
                var pubnubConstructorObject = {
                    subscribeKey: pubnubSubKey,
                    uuid: chatSPA.username,
                    origin: chatSPA.appName+".pubnub.com", // Custom Origin
                    ssl: true,
                    presenceTimeout: 60
                };
                // In addition to the basic contruction object we also need to check if the app uses waterfall methology or waterfall to transmit messages
                chatSPA.deliveryMethology = localStorage.getItem('methodology') || 'waterfall'
                if(localStorage.getItem('pubnubPublishKey')){
                    pubnubConstructorObject.publishKey = localStorage.getItem('pubnubPublishKey')
                };
                // If the app uses PN signals for things like typing indicators.
                if(localStorage.getItem('usePNSignals') == true){
                    chatSPA.usePNSignals == true;
                };
                // If we are encrypting the payloads via cipherKey.
                if(localStorage.getItem('cipherKey')){
                    pubnubConstructorObject.cipherKey = localStorage.getItem('cipherKey');
                };

                // If theirs a voiceToken, initalise the voice Client
                if(localStorage.getItem('voiceToken')){
                    Twilio.Device.setup(localStorage.getItem('voiceToken'));
                    Twilio.Device.ready(function(device) {
                        console.log('Twilio Client has been maked as ready.', device);
                    });
                    
                    Twilio.Device.error(function(error) {
                        console.log('Twilio Client Failed to connect, heres the error', error);
                    });

                };
                // Initalise the PubNub Client with the constructor object
                console.log('Creating PubNub Client', pubnubConstructorObject);
                // Write constructor to local storage
                localStorage.setItem('PNConstructor',pubnubConstructorObject)
                chatSPA.pubnubClient = new PubNub(pubnubConstructorObject);

                // Create Event Listeners for the App
                chatSPA.pubnubClient.addListener({
                    status: function(statusEvent) {
                        if (statusEvent.category === "PNConnectedCategory") {
                            console.log('Connected Event;', statusEvent);
                            // Write the connected time to localStorage
                            localStorage.setItem('connectedTime', statusEvent.currentTimetoken);
                        };
                        if (statusEvent.category === "PNReconnectedCategory") {
                            console.log('PubNub Issued a Reconnect Event');
                            // If a reconnection event occurrs check the expiration time of the accessToken
                            // This is done to ensure that if the client has been offline for a few days and the token gets expired make it seamless to get a reconnection event.
                            // if(){
                            //     // Access Token is Valid
                            // } else {
                            //     // Access Token is Invalid
                            //     chatSPA.handleInvalidAccessToken();
                            // };
                        };
                    },
                    message: function(messagePayload) {
                        // handle message
                        //console.log('New message event, here is the object:', messagePayload);

                        // If the message is from the Admin Channel
                        if(messagePayload.channel == chatSPA.appName+'-admin'){

                        }
                        else if(messagePayload.channel == chatSPA.username){
                            // If the message is from the private user channel
                            chatSPA.messageManager(messagePayload);
                        } else {
                            // If the Message is from any other kind of channel
                            chatSPA.messageManager(messagePayload);
                        }
                    },
                    presence: function(presenceEvent) {
                        // handle presence
                        console.log('New presence event, here are the details', presenceEvent);
                    }
                });

                // Assemble the list of channels this user can subscribe to.
                chatSPA.channelsArray = [chatSPA.appName+'-admin', chatSPA.username]

                // Subscribe to the Channels needed for this user.
                chatSPA.pubnubClient.subscribe({
                    channels: chatSPA.channelsArray
                });

                // Make a request to get all the users currently online via a HereNow request
                chatSPA.pubnubClient.hereNow(
                    {channels: [chatSPA.appName+'-admin'],includeUUIDs: true,includeState: true},
                    function (status, response) {
                        console.log('Admin HereNow Response:', response);
                    }
                );
            }
        } else {
            // With no username or accessToken force the page back to login to make the user authenticate
            window.location.replace("/login");
        }

        // Tell MixPanel that chat was initalised.
        mixpanel.identify(chatSPA.username);
        mixpanel.track('Chat Initialized', {distinct_id: chatSPA.username});

    },
    leaveThisChatChannelButton: function(channelID){
        if(channelID.startsWith('private-')){
            // Remove the DM from the DM's list
        } else {

        };
    },
    blockThisChannelButton: function(channelID){
        if(channelID.startsWith('private-')){
            // Blocking a private channel adds the user to the blockedUsersArray
            // deletes the messages from the messages array
            // then removes the conversation from the UI
            localStorage.removeItem(channelID);
            const channelIDArray = channelID.split("-");
            chatSPA.blockedUsersArray.push(channelIDArray[1]);
            chatSPA.jumpToChannel(chatSPA.channelsArray[2]);
            chatSPA.updateDMsView();
        } else {

        };
    },
    showUsersInChannelButton:function(channelID){
        // Draws a modal that shows what users are in a specific channel
        // This then lets you DM a user from the modal.
        chatSPA.getActiveUsersInChannelToShowUserModal(channelID);
    },
    getActiveUsersInChannelToShowUserModal: function(channelID){
        // If the channel is a P2P or a self channel then just display the two users, if its a group channel do a hereNow
        if(channelID == 'private-'+chatSPA.username+'-'+chatSPA.username){
            const messageHTML = '<div class="row"><p>This is your very own channel, you get this space to write yourself fun notes. Try it out!</p></div>';
            // Draw the Modal HTML
            const userModalHTML = '<div class="modal-dialog" role="document"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">Your private channel</h5><button type="button" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button></div><div class="modal-body"><div class="container-fluid">'+messageHTML+'</div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button></div></div></div>';

            // Call the Modal to be displayed
            $('#showUsersInChannelModal').html(userModalHTML);
            $('#showUsersInChannelModal').modal('show'); 

        } else if(channelID.startsWith('private-')) {
            const channelInfoArray = channelID.split('-');
            const messageHTML = '<div class="row"><p>This is private conversation between you and '+channelInfoArray[1]+', </br> use this space to chat.</p></div>';
            const userModalHTML = '<div class="modal-dialog" role="document"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">Your private channel</h5><button type="button" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button></div><div class="modal-body"><div class="container-fluid">'+messageHTML+'</div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button></div></div></div>';

            // Call the Modal to be displayed
            $('#showUsersInChannelModal').html(userModalHTML);
            $('#showUsersInChannelModal').modal('show'); 

        } else {
            // Find out what users are in the channel
            chatSPA.pubnubClient.hereNow({channels: [channelID],includeUUIDs: true,},
                function (status, response) {
                    //console.log(response);
                    const occupantsArray = response.channels[channelID].occupants;
                    console.log(occupantsArray);
                    console.log('There are '+occupantsArray.length+' user(s) in channel '+channelID);

                    var usersHTML = '';
                    for (var i = 0, len = occupantsArray.length; i < len; i++) {
                        //usersHTML = usersHTML+'<div class="row"><div class="col-md-4">'+occupantsArray[i].uuid+'</div><div class="col-md-4 ml-auto">'+chatSPA.generateUserInteractionButtonHTML(occupantsArray[i].uuid);+'</div></div></div>';
                        //usersHTML = usersHTML+'<div class="row"><p>'+occupantsArray[i].uuid+'</p></div>';
                        usersHTML = usersHTML +'<div class="row"><p>'
                        +'<div class="btn-group" role="group" aria-label="Button group with nested dropdown">'
                            //+'<button type="button" class="btn btn-secondary">'+occupantsArray[i].uuid+'</button>'
                            +'<div class="btn-group" role="group">'
                                +'<button id="btnGroupDrop1" type="button" class="btn btn-link dropdown-toggle" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">'+occupantsArray[i].uuid+'</button>'
                                +'<div class="dropdown-menu" aria-labelledby="btnGroupDrop1">'
                                    + '<button class="dropdown-item btn btn-link" id="chatSPAMessageUserWithinMessageButton" data-userid="User0" onclick="chatSPA.handleMessageUserButton(\''+occupantsArray[i].uuid+'\'); $(\'.modal\').modal(\'hide\'); $(\'.modal-backdrop\').remove(); return false;">Message User</button>'
                                    + '<button class="dropdown-item btn btn-link" id="chatSPAReportUserWithinMessageButton" data-userid="User0" onclick="chatSPA.handleReportUserButton(\''+occupantsArray[i].uuid+'\');return false;">Report User</button>'
                                +'</div>'
                            +'</div>'
                        +'</div>'
                        +'</p></div>';
                    };
                    // Draw the Modal HTML
                    const userModalHTML = '<div class="modal-dialog" role="document"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">'
                    +channelID+'</h5><button type="button" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button></div><div class="modal-body"><div class="container-fluid">'
                    +usersHTML+'</div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button></div></div></div>';

                    // Call the Modal to be displayed
                    $('#showUsersInChannelModal').html(userModalHTML);
                    $('#showUsersInChannelModal').modal('show'); 
                }
            );
        };
    },
    leaveThisChannelButton:function(channelID){
        // User has requested to leave this channel
        chatSPA.leaveThisChannel(channelID);
    },
    leaveThisChannel: function(channelID){
        const indexToRemove = chatSPA.channelsArray.indexOf(channelID);
        if (indexToRemove > -1) {
            chatSPA.channelsArray.splice(indexToRemove, 1);
        }

        var localStorageArray = localStorage.getItem('activeChannels');
        localStorageArray = localStorageArray.split(',');
        const localStorageIndexToRemove = localStorageArray.indexOf(channelID);
        if(localStorageIndexToRemove > -1 ){
            localStorageArray.splice(localStorageIndexToRemove, 1);
        }
        localStorage.setItem('activeChannels', localStorageArray);

        // Unsubscribe the channel from PubNub
        chatSPA.pubnubClient.unsubscribe({
            channels: [channelID]
        });

        // If the channel is the active channel, jump to another channel
        if(localStorage.getItem('activeChannel') == channelID){
            chatSPA.jumpToChannel(chatSPA.channelsArray[2]);
        }

        // Update the Chats View
        chatSPA.updateChatsView();

        // Send a request to the server to remove this user from the channel so they are no longer part of this channel.
    },
    handleMessageUserButton:function(username){
        // Initiates a direct message to a selected user.
        console.log('Initiating direct message to user', username);
        chatSPA.updateDMsView(username);
        chatSPA.jumpToChannel('private-'+username+'-'+chatSPA.username);
    },
    jumpToChannelButton:function(channelID){
        console.log('Handling button press to jump to channel', channelID);
        chatSPA.jumpToChannel(channelID);
    },
    jumpToChannel: function(channelID){
        // Clear the HTML in Chat container so messages dont bleed over
        $('#chatSPAMainViewContainer').html('');
        var channelTitle = channelID;
        var channelSubTitle = '';

        // Draw the Skeleton of the chat container
        var chatContainer = '<div class="card">'
        + '<div class="card-header d-inline-block" id="chatSPAChatContainerHeader"></div>'
        + '<div class="card-body" id="chatSPAChatContainerBody" style="height:71vh;overflow-y:scroll;"></div>'
        + '<div class="card-footer" id="chatSPAChatContainerFooter"></div>'

        $('#chatSPAMainViewContainer').html(chatContainer);


        // If the destination channel and the active channel are the same do nothing.
        // if(localStorage.getItem('activeChannel') == channelID){
        //     console.log('Channel is already active.');
        // } else {
            // Jumps the UI to the desired channel, if the channel has previously been opened in this session pull the messages from messagesArray
            // Get the details of the channel by looking in chatSPA.channelsArray
            console.log('Jumping to channel', channelID);

            if(channelID.startsWith('private-')){
                var channelIDArray = channelID.split("-");
                const usernameOfPersonWeAreMessaging = channelIDArray[1];
                channelTitle = usernameOfPersonWeAreMessaging;
                channelSubTitle = 'Private chat with '+usernameOfPersonWeAreMessaging;
                chatSPA.directMessagesObject[usernameOfPersonWeAreMessaging] = 0;
                // Redraw the DM's UI
                chatSPA.updateDMsView(usernameOfPersonWeAreMessaging);
            };

            // chatTitleHTML = '<div class="btn-group" role="group">'
            // +'<button id="chatSPATitleButton" type="button" class="btn btn-link btn-lg btn-block dropdown-toggle nav-link" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false"><i class="ni ni-planet text-blue"></i> '+channelTitle+'</button>'
            // +'<div class="dropdown-menu" aria-labelledby="chatSPATitleButton">'
            // +'<button class="dropdown-item" onclick="chatSPA.showUsersInChannelButton(\''+channelID+'\');return false;">Users</button>'
            // //+'<button class="dropdown-item" onclick="chatSPA.favouriteThisChannelButton(\''+channelID+'\');return false;">Favourite</button>'
            // +'<button class="dropdown-item" onclick="chatSPA.leaveThisChannelButton(\''+channelID+'\');return false;">Leave</button>'
            // +'</div></div>'
            // //+'<small>'+channelID+'</small>';



            // Draw the header of the container 
            chatTitleHTML = '<div class="row">'
            + '<div class="col-md-10">'
            + '<div class="media align-items-center">'
            + '<img id="chatSPAChatContainerImage" alt="Channel Logo" src="" class="avatar shadow">'
            + '<div class="media-body" style="padding-left:5px;"><h6 class="mb-0 d-block">'+channelTitle+'</h6><span class="text-muted text-small">'+channelSubTitle+'</span></div>'
            + '</div>'
            + '</div>'
            + '<div class="col-md-1 col-3">'
            + '<div class="dropdown">'
            + '<button class="btn btn-link text-primary" type="button" data-toggle="dropdown"><i class="ni ni-settings-gear-65"></i></button>'
            + '<div class="dropdown-menu dropdown-menu-right">'
            //+ '<button class="dropdown-item" onclick="chatSPA.createVideoSessionForChannel(\''+channelID+'\');return false;"><i class="ni ni-camera-compact"></i> Video</button>'
            + '<button class="dropdown-item" onclick="chatSPA.getListOfVideoProviders(\''+channelID+'\');return false;"><i class="ni ni-camera-compact"></i> Video</button>'
            +'<button class="dropdown-item" onclick="chatSPA.showUsersInChannelButton(\''+channelID+'\');return false;"><i class="ni ni-single-02"></i> Users</button>'
            //+'<button class="dropdown-item" onclick="chatSPA.favouriteThisChannelButton(\''+channelID+'\');return false;"><i class="ni ni-book-bookmark"></i> Favourite</button>'
            + '<div class="dropdown-divider"></div><button class="dropdown-item" onclick="chatSPA.leaveThisChannelButton(\''+channelID+'\');return false;"><i class="ni ni-fat-remove"></i> Leave</button>'
            + '</div>'
            + '</div>'
            + '</div>'
            + '<div class="col-md-1 col-3">'
            //+ '<button class="btn btn-link btn-text" type="button" data-toggle="tooltip" data-placement="top" title="Video call"><i class="ni ni-book-bookmark"></i></button>'
            + '</div>'
            + '</div>';

            $('#chatSPAChatContainerHeader').html(chatTitleHTML);
            $("#chatSPAChatContainerImage").initial({name:channelTitle,});

            // Grab (any) history from localstorage and update the UI to reflect these messages
            if(localStorage.getItem(channelID)){
                var messageArray = JSON.parse(localStorage.getItem(channelID)); 
                // Add the messages in the array to the HTML
                var messagesHTML = '';
                for (var i = 0, len = messageArray.length; i < len; i++) {
                    const messageItem = messageArray[i];
                    console.log(messageItem);
                    if(messageItem.messageType == 'text'){
                        messagesHTML =messagesHTML+'<h6 class="card-title text-uppercase text-muted mb-0" id="chatSPAMessageTitle" data-messageid="001" data-userid="User0">'+messageItem.sender+' <small hidden>'+chatSPA.niceifyTimeStamp(messageItem.timestamp)+'</small></h6>'
                        + '<span class="h5 font-weight-bold mb-0" id="chatSPAMessageBody" data-messageid="001" data-userid="User0" data-messagetype="text">'+messageItem.messageBody+'</span>'
                        + chatSPA.generateUserInteractionButtonHTML(messageItem.sender);
                    };
                    if(messageItem.messageType == 'image'){
                        messagesHTML = messagesHTML+'<h6 class="card-title text-uppercase text-muted mb-0" id="chatSPAMessageTitle" data-messageid="001" data-userid="User0">'+messageItem.sender+' <small hidden>'+chatSPA.niceifyTimeStamp(messageItem.timestamp)+'</small></h6>'
                        + '<button type="button" class="btn btn-link" onclick="chatSPA.launchModalFromImageButtonClick(\''+messageItem.full+'\')"><img src="'+messageItem.thumbnail+'" alt="User Provided Image"></button>'
                        + chatSPA.generateUserInteractionButtonHTML(messageItem.sender);
                    };
                    // messagesHTML = messagesHTML 
                    // + '<h6 class="card-title text-uppercase text-muted mb-0" id="chatSPAMessageTitle" data-messageid="001" data-userid="User0">'+messageItem.sender+' <small>'+chatSPA.niceifyTimeStamp(messageItem.timestamp)+'</small></h6>'
                    // + '<span class="h5 font-weight-bold mb-0" id="chatSPAMessageBody" data-messageid="001" data-userid="User0" data-messagetype="text">'+messageItem.messageBody+'</span>'
                    // + chatSPA.generateUserInteractionButtonHTML(messageItem.sender);
                };
                // Display the HTML in the chat container
                $('#chatSPAChatContainerBody').html(messagesHTML);
            } else {
                // With no messages in the array, just open an empty container and let the user send messages

                if(channelID.startsWith('private-')){

                } else {
                    var connectedTimeString = '';
                    try{
                        connectedTimeString = localStorage.getItem('connectedTime').toString();
                    }
                    catch(err) {
                        chatSPA.pubnubClient.time(function(time){connectedTimeString = time;});
                    }
                    
                    chatSPA.pubnubClient.fetchMessages(
                        { 
                            channels: [channelID], 
                            end: connectedTimeString,
                            count: 25
                        }, 
                    (status, response) => {
                        console.log('Response from FetchMessages Call For Channel: '+channelID, response);
                        // If the response is undefined that means there are no messages, therefore do nothing
                        if(typeof response === 'undefined') {
                            
                        } else {
                            const historyArray = response.channels[channelID] || [];
                            var messagesHTML = '';
                            if(historyArray == 0 || undefined){

                            } else {
                                for (var i = 0, len = historyArray.length; i < len; i++) {
                                    //console.log(historyArray[i]);
                                    const messageItem = historyArray[i];
                                    //console.log(messageItem);
                                    if(messageItem.message.content.type == 'text'){
                                        messagesHTML =messagesHTML+'<h6 class="card-title text-uppercase text-muted mb-0" id="chatSPAMessageTitle" data-messageid="001" data-userid="User0">'+messageItem.message.sender+' <small hidden>'+chatSPA.niceifyTimeStamp(messageItem.timetoken)+'</small></h6>'
                                        + '<span class="h5 font-weight-bold mb-0" id="chatSPAMessageBody" data-messageid="001" data-userid="User0" data-messagetype="text">'+messageItem.message.content.message+'</span>'
                                        + chatSPA.generateUserInteractionButtonHTML(messageItem.message.sender);
                                    };
                                    if(messageItem.message.content.type == 'image'){
                                        messagesHTML = messagesHTML+'<h6 class="card-title text-uppercase text-muted mb-0" id="chatSPAMessageTitle" data-messageid="001" data-userid="User0">'+messageItem.message.sender+' <small hidden>'+chatSPA.niceifyTimeStamp(messageItem.timetoken)+'</small></h6>'
                                        + '<button type="button" class="btn btn-link" onclick="chatSPA.launchModalFromImageButtonClick(\''+messageItem.message.content.full+'\')"><img src="'+messageItem.message.content.thumbnail+'" alt="User Provided Image"></button>'
                                        + chatSPA.generateUserInteractionButtonHTML(messageItem.message.sender);
                                    };
                                };
                                // Display the HTML in the chat container
                                $('#chatSPAChatContainerBody').html(messagesHTML);
                            };
                        };
                    });
                };
            };

            // Draw the Chat input box and add it to footer
            var footerObject = '<div class="form-group">'
            + '<div class="input-group mb-4">'
            + '<div id="chatSPATypingIndicator" class="container"><!-- <h6>Mathew is typing...</h6> --></div>'
            + '<!-- Send Message Container -->'
            + '<div class="container d-flex input-group" id="sendMessagesFullContainer">'
            + '<div class="input-group-btn"><button class="btn btn-primary" id="btn-uploadMedia" onclick="chatSPA.handleMediaUpload();return false;"><i class="fa fa-image fa-1x" aria-hidden="true"></i></button></div>'
            + '<div class="flex-grow-1"><input id="chatSPA-textInput" autocomplete="off" type="text" class="form-control input-sm chat_input" placeholder="Write your message here..." /></div>'
            + '<div class="input-group-btn"><button onclick="chatSPA.handleTextInput();return false;" class="btn btn-primary" id="btn-chat-submit"><i class="fa fa-paper-plane" aria-hidden="true"></i></button></div>'
            + '</div>'
            + '</div>'
            + '</div>'
            $('#chatSPAChatContainerFooter').html(footerObject);

            $("#chatSPA-textInput").keyup(function(event) {if (event.keyCode === 13) {chatSPA.handleTextInput();}});

            // Scroll to the bottom
            chatSPA.scrollToBottomOfChat();

            // Set the active channel
            localStorage.setItem('activeChannel', channelID);
            chatSPA.addNewChannelToChannelsArray(channelID);
            // Set the URL of the page to include this chat ID so that a user can navigate back to it if needed.
            window.location.hash = channelID;
        //}
        // Call the closeMenuBar function, this function is always called incase another function has left it open.
        chatSPA.closeMobileMenuBar();
    },
    generateUserInteractionButtonHTML: function(username){
        var userButtonHTML = 
          '<div class="float-right dropdown">'
            + '<a class="btn btn-sm btn-icon-only text-light" href="#" role="button" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false"><i class="fas fa-ellipsis-v"></i></a>'
            + '<div class="dropdown-menu dropdown-menu-right dropdown-menu-arrow" x-placement="bottom-end" style="position: absolute; will-change: transform; top: 0px; left: 0px; transform: translate3d(-160px, 31px, 0px);">'
                + '<button class="dropdown-item btn btn-link" id="chatSPAMessageUserWithinMessageButton" data-userid="User0" onclick="chatSPA.handleMessageUserButton(\''+username+'\'); $(\'.modal\').modal(\'hide\'); $(\'.modal-backdrop\').remove(); return false;">Message '+username+'</button>'
                + '<button class="dropdown-item btn btn-link" id="chatSPAReportUserWithinMessageButton" data-userid="User0" onclick="chatSPA.handleReportUserButton(\''+username+'\');return false;">Report '+username+'</button>'
            + '</div>'
        + '</div>';
        return userButtonHTML;
    },
    adminManager: function(messageObject){

    },
    userManager: function(messageObject){

    },
    messageManager: function(messagePayload){
        console.log('Message Manager Payload: ',messagePayload);
        // Assemble the message from Payload
        var messageToStore;
        var direction;
        if(messagePayload.publisher == chatSPA.username){
            direction = "outgoing";
            //console.log('This is an outgoing message.');
        } else {
            direction = "incoming";
            //console.log('This is an incoming message.');
        }
        
        if(messagePayload.message.content.type == 'text'){
            messageToStore = {
                "messageID": messagePayload.userMetadata.messageSID || 'PN'+messagePayload.timetoken,
                "sender": messagePayload.publisher,
                "messageType": messagePayload.message.content.type,
                "messageBody": messagePayload.message.content.message,
                "timestamp": messagePayload.timetoken,
                "channel": messagePayload.channel,
                "encrypted": messagePayload.userMetadata.encrypted
            };
        }
        if(messagePayload.message.content.type == 'image'){
            messageToStore = {
                "messageID": messagePayload.userMetadata.messageSID || 'PN'+messagePayload.timetoken,
                "sender": messagePayload.publisher,
                "messageType": messagePayload.message.content.type,
                "full": messagePayload.message.content.full,
                "thumbnail": messagePayload.message.content.thumbnail,
                "timestamp": messagePayload.timetoken,
                "channel": messagePayload.channel
            };
        };

        if(messagePayload.message.content.type == "videoInvite"){
            messageToStore = {
                "messageID": messagePayload.userMetadata.messageSID || 'PN'+messagePayload.timetoken,
                "sender": messagePayload.publisher,
                "messageType": messagePayload.message.content.type,
                "sessionDetails": messagePayload.message.content.session,
                "timestamp": messagePayload.timetoken,
                "channel": messagePayload.channel,
                "vendor": messagePayload.message.content.vendor,
            };
            console.log(messageToStore);
            if(direction == 'incoming'){
                // Do a screen pop alerting the user to the video request
            Swal.fire({
                title: 'Incoming Video Request!',
                text: 'Want to Chat with '+messagePayload.publisher+'?',
                showCancelButton: true,
                confirmButtonColor: '#3085d6',
                cancelButtonColor: '#d33',
                confirmButtonText: 'Yes, Lets Video!',
                allowEnterKey: true,
                cancelButtonText: 'No Thanks!',
              }).then((result) => {
                if (result.value) {
                    console.log('User Accepted Video Request');
                    chatSPA.joinExistingVideoSession(messageToStore.sessionDetails, messageToStore.vendor);
                    Swal.close()
                } else {
                    console.log('User Rejected Video Request');
                }
              });
            };
        };

        // Check to see if the sender is banned. If so, just drop the message
        if(chatSPA.blockedUsersArray.includes(messageToStore.sender)){
            console.log('Recieved a new message, however the sender is banned.');
        } else {
            console.log('Recieved a new message and the sender is not banned.');
            
            // If the channel starts with 'private-' then its a private message for this user
            if(messagePayload.userMetadata.toID.startsWith('private-')){
                var storageChannel;
                if(direction == "outgoing"){
                    storageChannel = 'private-'+messagePayload.message.to+'-'+chatSPA.username;
                    console.log('This is an outgoing message');
                } else {
                    storageChannel = 'private-'+messagePayload.message.sender+'-'+chatSPA.username;
                    console.log('This is an incoming message');
                };
                // Check if this is an existing conversation
                if(localStorage.getItem(storageChannel)){
                    console.log('A conversation exists');
                    chatSPA.addMessageToLocalStorageChannel(storageChannel, true, messageToStore);
                    // If this message belongs to the activeChannel then add the message to the active UI
                    if(localStorage.getItem('activeChannel') == storageChannel){
                        chatSPA.addMessageToCurrentUIView(storageChannel, messageToStore);
                    } else {
                        // If the message is incoming, add 1 to the unread ui count
                        if(direction == "incoming"){
                            chatSPA.directMessagesObject[messagePayload.publisher] = chatSPA.directMessagesObject[messagePayload.publisher] + 1;
                            chatSPA.updateDMsView(messagePayload.publisher);
                        };
                    };
                } else {
                    console.log('This is a new conversation');
                    if(direction == "outgoing"){
                        if(localStorage.getItem('activeChannel') == storageChannel){
                            chatSPA.addMessageToCurrentUIView(storageChannel, messageToStore);
                        };
                    } else {
                        chatSPA.directMessagesObject[messagePayload.publisher] = 1;
                        chatSPA.updateDMsView(messagePayload.publisher);
                    };
                    chatSPA.addMessageToLocalStorageChannel(storageChannel, false, messageToStore);
                };
            } 
            // else if(messagePayload.channel == chatSPA.username){
            //     // The username channel is a private channel for the user to message themself, this is useful for sharing files between devices and taking notes. 
            //     console.log('Adding message to private users channel.');
            // } 
            else {
                console.log('This is a group message');
                // If the channel is the active channel display the message to the UI
                if(messagePayload.channel == localStorage.getItem('activeChannel')){
                    console.log('Inbound message matches active channel');
                    chatSPA.addMessageToCurrentUIView(messageToStore.channel, messageToStore);
                } else {
                    
                };
            };
        };
    },
    addMessageToLocalStorageChannel: function(channelToAddTo, existingChannel, messageObject){
        // If existingChannel is true, this means the channel already exists so we need to grab a copy of the message array, add to it and then put it back
        // If existingChannel is false, assemble the first message and the contents to local storage
        var messageArray;
        if(existingChannel == true){
            messageArray = JSON.parse(localStorage.getItem(channelToAddTo));
            //console.log(messageArray);
            messageArray.push(messageObject);
        } else {
            messageArray = [messageObject];
        };
        localStorage.setItem(channelToAddTo, JSON.stringify(messageArray));
    },
    addMessageToCurrentUIView: function(channel, messageObject){
        console.log('Adding Message to existing view.');
        console.log(messageObject);
        var messageHTML = '';
        if(messageObject.messageType == 'text'){
            var messageString = messageObject.messageBody;
            if(messageObject.encrypted == true){
                const cipherKey = localStorage.getItem('activeChannel')+'-cipherKey';
                messageString = chatSPA.decryptMessageUsingProvidedCipherKey(messageObject.messageBody,localStorage.getItem(cipherKey));
                console.log(messageString);
            }
            messageHTML = '<h6 class="card-title text-uppercase text-muted mb-0" id="chatSPAMessageTitle" data-messageid="001" data-userid="User0">'+messageObject.sender+' <small hidden>'+chatSPA.niceifyTimeStamp(messageObject.timestamp)+'</small></h6>'
            + '<span class="h5 font-weight-bold mb-0" id="chatSPAMessageBody" data-messageid="001" data-userid="User0" data-messagetype="text">'+messageString+'</span>'
            + chatSPA.generateUserInteractionButtonHTML(messageObject.sender);
        };
        if(messageObject.messageType == 'image'){
            messageHTML = '<h6 class="card-title text-uppercase text-muted mb-0" id="chatSPAMessageTitle" data-messageid="001" data-userid="User0">'+messageObject.sender+' <small hidden>'+chatSPA.niceifyTimeStamp(messageObject.timestamp)+'</small></h6>'
            + '<button type="button" class="btn btn-link" onclick="chatSPA.launchModalFromImageButtonClick(\''+messageObject.full+'\')"><img style="object-fit: fill;" src="'+messageObject.thumbnail+'" alt="User Provided Image"></button>'
            + chatSPA.generateUserInteractionButtonHTML(messageObject.sender);
        };
        if(messageObject.messageType == 'videoInvite'){
            
        }
        $('#chatSPAChatContainerBody').append(messageHTML);
        chatSPA.scrollToBottomOfChat();
    },
    getUserProfileRequest: function(){
        console.log('Making request to get the users profile.');
        $.ajax({
            url: '/profile',
            timeout: 5000,
            dataType: 'json',
            type: 'get',
            headers: {
                "x-api-key":localStorage.getItem('accessToken')
            },
            contentType: 'application/json',
            processData: false,
            success: function( data, textStatus, jQxhr ){
                console.log('User Profile Object',data);
                chatSPA.handleGetProfileSuccess(data);
            },
            error: function( jqXhr, textStatus, errorThrown ){
                if(textStatus == 'timeout'){
                    //console.log('Request Timeout');
                    chatSPA.handleGetProfileFailure({success: false, message: 'timeout'});
                } else {
                    chatSPA.handleGetProfileFailure(jqXhr.responseJSON);
                }
                //console.log(errorThrown);
                //console.log(jqXhr.responseJSON);
            }
        });
    },
    handleGetProfileSuccess: function(profileObject){
        // status: 200
        // success: true
        // profile:
        //     username: "Matty"
        //     requirePasswordChange: 0
        //     userType: "user"
        //     emailAddress: "mathew@mathewjenkinson.co.uk"
        //     emailAddressVerified: 0
        //     dateCreated: 1577373680
        //     locale: "en-US,en;q=0.9"
        //     authorisedChannels: "main,NotMain,WaterCooler"
        //     recordedGender: "null"
        //     recordedDOB: "undefined"
        //     userIcon: "http://s3.amazonaws.com/37assets/svn/765-default-avatar.png"

        // The profileObject contains a profile container.
        // Check if a password change is required
        if(profileObject.profile.requirePasswordChange == 1 || profileObject.profile.requirePasswordChange == true){
            chatSPA.launchChangePasswordNotClosbleModal();
        };

        // Check the user needs to be verify their account, if so launch a closable modal.
        if(profileObject.profile.emailAddressVerified == 0 || profileObject.profile.emailAddressVerified == false){

        };

        // Update the user profile with the details
        if(profileObject.profile.userIcon){
            if(profileObject.profile.userIcon.startsWith("http")){
                localStorage.setItem('userProfileURL', profileObject.profile.userIcon);
                $("#userProfileURL0").attr("src",localStorage.getItem('userProfileURL'));
                $("#userProfileURL1").attr("src",localStorage.getItem('userProfileURL'));
            };
        };

        // Update User channels array and call the subscription
        var oldChannelsArray = null;
        if(localStorage.getItem('activeChannels')){
            oldChannelsArray = localStorage.getItem('activeChannels');
            oldChannelsArray = oldChannelsArray.split(',');
        } else {
            oldChannelsArray = chatSPA.channelsArray;
        }

        var authorisedChannels = null;
        var newChannelsArray = null;
        if(profileObject.profile.authorisedChannels){
            authorisedChannels = profileObject.profile.authorisedChannels;
            authorisedChannels = authorisedChannels.split(",");

            newChannelsArray = oldChannelsArray.concat(authorisedChannels);
            newChannelsArray = chatSPA.removeDuplicatesFromArray(newChannelsArray);
            chatSPA.channelsArray = newChannelsArray;
            //authorisedChannels = newChannelsArray;
            localStorage.setItem('activeChannels',newChannelsArray);
        }
    
        chatSPA.pubnubClient.subscribe({
            channels: chatSPA.channelsArray
        });

        // Jump the UI to the first channel in the authorised channels array
        if(authorisedChannels == null){
            chatSPA.jumpToChannel('private-'+chatSPA.username+'-'+chatSPA.username);
        } else {
            chatSPA.jumpToChannel(authorisedChannels[0]);
            // Update the UI of the channels
            var channelsHTML = '';
            for (var i = 0, len = authorisedChannels.length; i < len; i++) {
                channelsHTML = channelsHTML + '<div class="btn-group" role="group">'
                + '<button type="button" class="nav-link btn btn-link" onclick="chatSPA.jumpToChannelButton(\''+authorisedChannels[i]+'\');return false;"><i class="ni ni-planet text-blue"></i> '+authorisedChannels[i]+'</button>'
                + '<button id="btnGroupPublicMain" type="button" class="btn btn-link btn-lg btn-block dropdown-toggle nav-link" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false"></button>'
                + '<div class="dropdown-menu" aria-labelledby="btnGroupPublicMain">'
                + '<button class="dropdown-item" onclick="chatSPA.showUsersInChannelButton(\''+authorisedChannels[i]+'\');return false;">Users</button>'
                //+ '<button class="dropdown-item" onclick="chatSPA.favouriteThisChannelButton(\''+authorisedChannels[i]+'\');return false;">Favourite</button>'
                + '<button class="dropdown-item" onclick="chatSPA.leaveThisChannelButton(\''+authorisedChannels[i]+'\');return false;">Leave</button>'
                + '</div></div>';
            };
            $('#chatSPAPublicChannelsNavList').html(channelsHTML);
        };
       // Update the DM's UI
       chatSPA.updateDMsView(chatSPA.username);
       //const channelString = 'private-'+chatSPA.username+'-'+chatSPA.username;
       //var dmsHTML = '<li class="nav-item"><div class="btn-group" role="group"><button type="button" class="nav-link btn btn-link" onclick="chatSPA.jumpToChannelButton(\''+channelString+'\');return false;"><i class="fas fa-user"></i> '+chatSPA.username+'</button><button id="btnGroupPublicMain" type="button" class="btn btn-link btn-lg btn-block dropdown-toggle nav-link" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false"></button><div class="dropdown-menu" aria-labelledby="btnGroupPublicMain"><button class="dropdown-item" onclick="chatSPA.favouriteThisChannelButton\''+chatSPA.username+'\');return false;">Favourite</button><button class="dropdown-item" onclick="chatSPA.leaveThisChatChannelButton\''+chatSPA.username+'\');return false;">Close</button><button class="dropdown-item" onclick="chatSPA.blockThisChannelButton\''+chatSPA.username+'\');return false;">Block</button></div></div></li>';
       //$('#chatSPADirectMessageNavList').html(dmsHTML);
    },
    handleGetProfileFailure: function(failureObject){
        //chatSPA.pubnubClient.unsubscribe({channels: chatSPA.channelsArray});
        console.log('Get Profile Error',failureObject);
        if(failureObject.status == 401 && failureObject.message == 'Bad Credentials'){
            chatSPA.handleInvalidAccessToken('chatSPA.getUserProfileRequest()');
        }
    },
    updateChatsView: function(){
        console.log('Updating Chats View.');
        chatSPA.channelsArray = chatSPA.removeDuplicatesFromArray(chatSPA.channelsArray);
        var authorisedChannels = chatSPA.channelsArray;
        var channelsHTML = '';
        for (var i = 0, len = authorisedChannels.length; i < len; i++) {
            // Remove the admin and usename channels from the UI, they still exist under the hood but the user doesnt need to see them
            if(authorisedChannels[i] == chatSPA.appName+'-admin' || authorisedChannels[i] == chatSPA.username){

            } else {
                channelsHTML = channelsHTML + '<div class="btn-group" role="group">'
            + '<button type="button" class="nav-link btn btn-link" onclick="chatSPA.jumpToChannelButton(\''+authorisedChannels[i]+'\');return false;"><i class="ni ni-planet text-blue"></i> '+authorisedChannels[i]+'</button>'
            + '<button id="btnGroupPublicMain" type="button" class="btn btn-link btn-lg btn-block dropdown-toggle nav-link" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false"></button>'
            + '<div class="dropdown-menu" aria-labelledby="btnGroupPublicMain">'
            + '<button class="dropdown-item" onclick="chatSPA.showUsersInChannelButton(\''+authorisedChannels[i]+'\');return false;">Users</button>'
            //+ '<button class="dropdown-item" onclick="chatSPA.favouriteThisChannelButton(\''+authorisedChannels[i]+'\');return false;">Favourite</button>'
            + '<button class="dropdown-item" onclick="chatSPA.leaveThisChannelButton(\''+authorisedChannels[i]+'\');return false;">Leave</button>'
            + '</div></div>';
            }
        };
        $('#chatSPAPublicChannelsNavList').html(channelsHTML);
    }, 
    updateDMsView: function(senderID){
        if(chatSPA.username == senderID){
            // Do nothing
        } else {
            //chatSPA.directMessagesObject[senderID] = 1;
            // if(chatSPA.directMessagesObject[senderID]){
            //     console.log('We have seen this sender before');
            //     var messageCount = chatSPA.directMessagesObject[senderID];
            //     messageCount = messageCount +1;
            //     chatSPA.directMessagesObject[senderID] = messageCount;
            // } else {
            //     console.log('Woah! New sender!');
            //     chatSPA.directMessagesObject[senderID] = 1;
            // };
            // console.log('New count of unreads for this sender is: ', chatSPA.directMessagesObject[senderID]);
        };


        // var dmsHTML = '<li class="nav-item"><div class="btn-group" role="group">'
        // +'<button type="button" class="nav-link btn btn-link" onclick="chatSPA.jumpToChannelButton(\'private-'+chatSPA.username+'-'+chatSPA.username+'\');return false;">'
        // +'<i class="fas fa-user"></i> '+chatSPA.username+'</button>'
        // +'<button id="btnGroupPublicMain" type="button" class="btn btn-link btn-lg btn-block dropdown-toggle nav-link" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false"></button>'
        // +'<div class="dropdown-menu" aria-labelledby="btnGroupPublicMain">'
        // //+'<button class="dropdown-item" onclick="chatSPA.favouriteThisChannelButton\''+chatSPA.username+'\');return false;">Favourite</button>'
        // +'<button class="dropdown-item" onclick="chatSPA.leaveThisChatChannelButton\''+chatSPA.username+'\');return false;">Close</button>'
        // +'<button class="dropdown-item" onclick="chatSPA.blockThisChannelButton\''+chatSPA.username+'\');return false;">Block</button>'
        // +'</div></div></li>';
        var dmsHTML = '';
        Object.keys(chatSPA.directMessagesObject).forEach(function(senderID) {

            console.log(senderID, chatSPA.directMessagesObject[senderID]);
            var userBannerHTML = null;
            if(chatSPA.directMessagesObject[senderID] > 0){
                userBannerHTML = senderID+' ('+chatSPA.directMessagesObject[senderID]+')';
            } else {
                userBannerHTML = '<small>'+senderID+'</small>';
            };
            dmsHTML = dmsHTML +'<li class="nav-item">'
            +'<div class="btn-group" role="group">'
            +'<button type="button" class="nav-link btn btn-link" onclick="chatSPA.handleMessageUserButton(\''+senderID+'\');return false;"><i class="fas fa-user"></i> '+userBannerHTML+'</button>'
            +'<button id="btnGroupPublicMain" type="button" class="btn btn-link btn-lg btn-block dropdown-toggle nav-link" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false"></button>'
            +'<div class="dropdown-menu" aria-labelledby="btnGroupPublicMain">'
            //+'<button class="dropdown-item" onclick="chatSPA.favouriteThisChannelButton\''+senderID+'\');return false;">Favourite</button>'
            +'<button class="dropdown-item" onclick="chatSPA.leaveThisChatChannelButton\''+senderID+'\');return false;">Close</button>'
            +'<button class="dropdown-item" onclick="chatSPA.blockThisChannelButton\''+senderID+'\');return false;">Block</button>'
            +'</div></div></li>';         
        });
        // Update the Nav list
        $('#chatSPADirectMessageNavList').html(dmsHTML);
    },
    subscribeToANewPubNubChannel(channelID){
        chatSPA.addNewChannelToChannelsArray(channelID);
        // Tell PubNub Client to subscribe to this new channel
        chatSPA.pubnubClient.subscribe({
            channels: chatSPA.channelsArray
        });
    },
    addNewChannelToChannelsArray: function(channelID){
        // Adds the new channel to both local storage
        var oldLocalStorageArray = localStorage.getItem('activeChannels');
        oldLocalStorageArray = oldLocalStorageArray.split(",");
        oldLocalStorageArray.push(channelID);
        var cleanedLocalStorarageArray = chatSPA.removeDuplicatesFromArray(oldLocalStorageArray);
        localStorage.setItem('activeChannels', cleanedLocalStorarageArray);

        // Add the new channel to the channelsArray
        chatSPA.channelsArray.push(channelID);
    },
    handleTextInput: function(){
        // Grab the text input from the text box
        var textBody = $('#chatSPA-textInput').val();
        var requireServer = false;
        var messageType = "text";
        var encryptedMessage = false;
        var channelToMessage = localStorage.getItem('activeChannel');
        if(textBody == ''){
            console.log('Text Body Blank');
        } else {
            // Check the textBody for a / command, depending on the type of command these can be served locally. 
            // / Commands mimic IRC based commands of old, they also extend them. 
            // Some commands are served locally such as banning someone or unbanning them.

            if(textBody.startsWith("/")){
                if(textBody.startsWith("/me")){
                    // Sends a 'Me' Message, an example would be '/Me slaps you in the face with a wet fish'
                    messageType = "action";
                    requireServer = true;
                    textBody = textBody.replace("/me", chatSPA.username);
                };
                if(textBody.startsWith("/msg")){

                };
                if(textBody.startsWith("/action")){
                    // Sends a 'Me' Message, an example would be '/Me slaps you in the face with a wet fish'
                    messageType = "action";
                    requireServer = true;
                    textBody = textBody.replace("/action", chatSPA.username);
                };
                if(textBody.startsWith("/encrypt")){
                    // Enables Message encryption using a Cipher Key for that room
                    // Only a specific room can be encrypted. EG: 'main' can have a different cipher to 'foodies', however all parties in that channel must have the same cipher key.
                    // Calling /encrypt abc123 within a room will just secure that room.
                    requireServer = false;
                    var cipherString = textBody.replace("/encrypt ", "");
                    // Write the cipher string to LocalStorage for this channel
                    localStorage.setItem(channelToMessage+'-cipherKey', cipherString);
                    chatSPA.showSweetAlertModal("Alert", "Encryption is enabled for this room.", "success");
                    console.log('User has enabled encryption for channel '+channelToMessage);
                    chatSPA.clearChatInputContainer();
                };
                if(textBody.startsWith("/decrypt")){
                    // Disables message encryption for a specific room, this means that future messages wont be decrypted.
                    requireServer = false;
                    localStorage.removeItem(channelToMessage+'-cipherKey');
                    chatSPA.showSweetAlertModal("Alert", "Encryption has been disabled for this room.", "warning");
                    // Clear the text container
                    chatSPA.clearChatInputContainer();
                };
                if(textBody.startsWith("/decipher")){
                    // Decrypts a message using the rooms cipherkey if it has one, this now decrypted message is then injected into the UI of the chat room.
                    // This is only temporary and does not remain when the user then moves away to another channel.
                    requireServer = false;
                    var encryptedTextString = textBody.replace("/decrypt ", "");
                    var plainTextMessage = chatSPA.decryptMessageUsingProvidedCipherKey(encryptedTextString, localStorage.getItem(channelToMessage+'-cipherKey'));
                    chatSPA.addMessageToCurrentUIView(channelToMessage, {type:"text",sender:"EncryptionBot", messageBody: plainTextMessage});
                    chatSPA.clearChatInputContainer();
                };
                if(textBody.startsWith("/query")){

                };
                if(textBody.startsWith("/notice")){

                };
                if(textBody.startsWith("/join")){
                    // Issues a join command to a room. An example would be '/join main', split the string via space and then join array[1]
                    const joinString = textBody.split(" ");
                    chatSPA.jumpToChannelFromNotificationModal(joinString[1]);
                    requireServer = false;
                };
                if(textBody.startsWith("/part")){
                    // Leave a room, an example would be '/part notMain', split the string via space and then leave array[1]
                    const leaveString = textBody.split(" ");
                    chatSPA.leaveThisChannel(leaveString[1]);
                    requireServer = false;
                };
                if(textBody.startsWith("/kick")){
                    // Issues a kick command to the server, if the user has this power then the server will remove them.
                };
                if(textBody.startsWith("/nick")){

                };
                if(textBody.startsWith("/topic")){

                };
                if(textBody.startsWith("/whois")){
                    // Gets the profile for a user
                };
                if(textBody.startsWith("/whowas")){

                };
                if(textBody.startsWith("/ctcp")){

                };
                if(textBody.startsWith("/quote")){

                };
                if(textBody.startsWith("/clear")){
                    // Clears the UI of messages and lets the user start again, this is only temp, if the user leaves and comes back the UI will backfill.
                    $('#chatSPAChatContainerBody').html('');
                    chatSPA.clearChatInputContainer();
                    requireServer = false;
                };
                if(textBody.startsWith("/ignore")){
                    // Adds a user to the local banned list
                    var messageArray = textBody.split(" ");
                    var userToBlock = messageArray[1];
                    chatSPA.blockedUsersArray.push(userToBlock);

                    // Add a message to the UI to tell the user that the person has been banned
                    chatSPA.notifyUser("alert",userToBlock+" has been blocked","Admin",null)

                    // Set the requireServer flag to true so that the Server can also update its DB of banned users
                    requireServer = true;                    

                    // Clear the contents if the text box
                    chatSPA.clearChatInputContainer();
                };
                if(textBody.startsWith("/unignore")){
                    // Unbans a user
                    var messageArray = textBody.split(" ");
                    var userToUnBlock = messageArray[1];

                    const index = chatSPA.blockedUsersArray.indexOf(userToUnBlock);
                    if (index > -1) { 
                        chatSPA.blockedUsersArray.splice(index, 1);
                    };
                    // Add a message to the UI to tell the user this person is now unbanned.
                    chatSPA.notifyUser("alert",userToBlock+" can message you again.","Admin",null)

                    // Set the requireServer flag to true so that the Server can also update its DB of banned users
                    requireServer = true;
                };
                if(textBody.startsWith("/bandwidth")){
                    // An example Bandwidth command would be: 
                    // /bandwidth sms +14152555613 Hi Mathew!
                    // This is comprised of the vendor action destination message, a user should be able to write this message with minimal computer formatting so we will have to do a lot of the work here. 
                    // textBody = textBody.replace("/bandwidth ", "");
                    // const textArray = textBody.split(" ");
                    // const action = textArray[0];
                    // const destinationID = textArray[1];
                    // var charactersToRemove = action.length + 1 + destinationID.length + 1;
                    // textBody = "/bandwidth"|+destinationID+"|+16282661469"+"|Static Test!";
                    requireServer = true;
                }

            } else {
                requireServer = true;
            }

            if(localStorage.getItem(channelToMessage+'-cipherKey')){
                // Encrypt the message using the cipherKey 
                textBody = chatSPA.pubnubClient.encrypt(JSON.stringify(textBody), localStorage.getItem(channelToMessage+'-cipherKey'));
                encryptedMessage = true;
            };
            // Assemble the chat payload
            const messagePayload = {
                "messageType":messageType,
                "body": textBody,
                "to": channelToMessage,
                "accessToken": localStorage.getItem('accessToken')
            };
            if(encryptedMessage == true){
                messagePayload.encrypted = true;
            }
            // Check localStorage to see how to send the message.
            if(chatSPA.deliveryMethology == 'waterfall' && requireServer == true){
                // If the method is API driven, make an API request to pass the message
                chatSPA.messageAPIRequestToServer(messagePayload, 'post', chatSPA.handleMessageAPIRequestToServerSuccess, chatSPA.handleMessageAPIRequestToServerFailure);
            } else {
                // Check to see if we are using PubNub or another socket connection
                if(localStorage.getItem('pubnubPubKey') && requireServer == true){
                    chatSPA.handlePushToPubNub(messagePayload, localStorage.getItem('activeChannel'));
                };
            };
        };
    },
    decryptMessageUsingProvidedCipherKey: function(encryptedTextString, cipherKey){
        var returnString = "";
        returnString = chatSPA.pubnubClient.decrypt(encryptedTextString, cipherKey);
        return returnString;
    },
    lazyAPIRequestToServer: function(resourceURL,messagePayload, requestType, successFunction, failureFunction){
        $.ajax({
            url: resourceURL,
            timeout: 5000,
            dataType: 'json',
            type: requestType,
            contentType: 'application/json',
            headers: { 'x-api-key': localStorage.getItem('accessToken') },
            data: JSON.stringify(messagePayload),
            processData: false,
            success: function( data, textStatus, jQxhr ){
                //console.log(data);
                //chatSPA.handleMessageAPIRequestToServerSuccess(data);
                successFunction(data);
            },
            error: function( jqXhr, textStatus, errorThrown ){
                if(textStatus == 'timeout'){
                    //console.log('Request Timeout');
                    //chatSPA.handleMessageAPIRequestToServerFailure({success: false, message: 'timeout'});
                    failureFunction({success: false, message: 'timeout'});
                } else {
                    //chatSPA.handleMessageAPIRequestToServerFailure(jqXhr.responseJSON);
                    failureFunction({success: false, message: 'timeout'});
                }
                //console.log(errorThrown);
                //console.log(jqXhr.responseJSON);
            }
        });
    },
    lazyFailureFunction(failureObject){
        console.log('Lazy failure function reported an error ', failureObject);
    },
    messageAPIRequestToServer: function(messagePayload, requestType, successFunction, failureFunction){
        $.ajax({
            url: '/message',
            timeout: 5000,
            dataType: 'json',
            type: requestType,
            contentType: 'application/json',
            data: JSON.stringify(messagePayload),
            processData: false,
            success: function( data, textStatus, jQxhr ){
                //console.log(data);
                //chatSPA.handleMessageAPIRequestToServerSuccess(data);
                successFunction(data);
            },
            error: function( jqXhr, textStatus, errorThrown ){
                if(textStatus == 'timeout'){
                    //console.log('Request Timeout');
                    //chatSPA.handleMessageAPIRequestToServerFailure({success: false, message: 'timeout'});
                    failureFunction({success: false, message: 'timeout'});
                } else {
                    //chatSPA.handleMessageAPIRequestToServerFailure(jqXhr.responseJSON);
                    failureFunction({success: false, message: 'timeout'});
                }
                //console.log(errorThrown);
                //console.log(jqXhr.responseJSON);
            }
        });
    },
    handleMessageAPIRequestToServerSuccess(successObject){
        // Clear the contents if the text box
        chatSPA.clearChatInputContainer();
    },
    clearChatInputContainer: function(){
        $('#chatSPA-textInput').val('');
    },
    handleMessageAPIRequestToServerFailure(failureObject){
        console.log(failureObject);
    },
    handlePushToPubNub: function(messagePayload, channelDestination){
        const publishPayload = {channel : channelDestination,message: messagePayload};
        // Send the payload to PubNub
        chatSPA.pubnubClient.publish(publishPayload, function(status, response) {
            console.log(status, response);
        });
    },
    handleMediaUpload: function(){
        //$('#uploadMediaModal').modal('show');
        var cloudinaryWidget = cloudinary.openUploadWidget({cloudName: "Demo", secure: true, uploadPreset: "Demo",sources: chatSPA.uploadSourcesArray,}, (error, result) => { 
            if (!error && result && result.event === "success") { 
              console.log('Media Uploaded via Cloudinary. Here is the image info: ', result.info);
              chatSPA.handleMediaInputFromCloudinary(result.info);
              cloudinaryWidget.close({quiet: true});
            }
        });
    },
    handleMediaInputFromCloudinary: function(mediaPayload){
        console.log('Got data from a cloudinary upload.');
        console.log(mediaPayload);
        var pubNubMediaPayload = null;
        // Media Payload could be an image, gif, movie file, document or really anything else. 
        // The media payload should contain a value called 'resource_type' that will tell you what type of file we are working with.
        if(mediaPayload.resource_type == 'image'){
            // If the file is an image then we need to obtain the full size URL and the thumbnail URL. 
            pubNubMediaPayload = {
                "type":"image",
                "full":mediaPayload.secure_url,
                "thumbnail": mediaPayload.thumbnail_url,
                "fromUser":localStorage.getItem('username'),
                "to": localStorage.getItem('activeChannel'),
                "accessToken": localStorage.getItem('accessToken')
            };
            if(chatSPA.deliveryMethology == 'waterfall'){
                chatSPA.messageAPIRequestToServer(pubNubMediaPayload, 'post',chatSPA.handleMessageAPIRequestToServerSuccess, chatSPA.handleMessageAPIRequestToServerFailure);
            } else {
                if(localStorage.getItem('pubnubPubKey')){
                    chatSPA.handlePushToPubNub(pubNubMediaPayload, localStorage.getItem('activeChannel'));
                };
            };
        };
        if(mediaPayload.resource_type == 'raw'){
            // Generic Catch all if the file is a CSV or a log file or something else
            pubNubMediaPayload = {
                "type":"raw",
                "fileURL":mediaPayload.secure_url,
                "fromUser":localStorage.getItem('username')
            };
            if(chatSPA.deliveryMethology == 'waterfall'){
                chatMatSPA.messageAPIRequestToServer(pubNubMediaPayload);
            } else {
                if(localStorage.getItem('pubnubPubKey')){
                    chatSPA.handlePushToPubNub(pubNubMediaPayload, localStorage.getItem('activeChannel'));
                };
            };
        }
    },
    launchModalFromImageButtonClick: function(imageURL){
        // Affix the Image to the Media Modal and then open the container
        var imageHTML = '<img src="'+imageURL+'" alt="User Provided Media" style="width:100%;">';
        $('#showMediaModalContainer').html(imageHTML);
        $('#showMediaModal').modal('show'); 
    },
    notifyUser: function(notificationType, message, sender, onClickSucess){

    },
    showNotificationInTopRight: function(iconToDisplay, messageToDisplay, colorToDisplay) {
        $.notify({
            icon: iconToDisplay,
            // icon: "nc-icon nc-app",
            message: messageToDisplay
        }, {
            type: colorToDisplay,
            timer: 8000,
            placement: {
                from: 'top',
                align: 'right'
            }
        });
    },
    showSweetAlertModal: function(title,messagebody,iconType){
        Swal.fire(
            title,
            messagebody,
            iconType
          );
    },
    showLargeAlertModal: function(modalTitle, modalBody){
        var modalHTML = '<div class="modal-dialog">'
        + '<div class="modal-content">'
        + '<div class="modal-header">'
        + '<h5 class="modal-title">'+modalTitle+'</h5>'
        + '<button type="button" class="close" data-dismiss="modal" aria-label="Close">'
        + '<span aria-hidden="true">&times;</span>'
        + '</button>'
        + '</div>'
        + '<div class="modal-body">'
        + modalBody
        + '</div>'
        + '<div class="modal-footer">'
        + '<button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>'
        + '</div>'
        + '</div>'
        + '</div>'

        $('#showAlertOrNoficiationModal').html(modalHTML);
        $('#showAlertOrNoficiationModal').modal('show');
    },
    showAvailableChannelsButton: function(){
        console.log('User requested available channels list');
        chatSPA.lazyAPIRequestToServer('/channels', {}, 'GET', chatSPA.handleAvailableChannelsResponse, chatSPA.lazyFailureFunction)
    },
    handleAvailableChannelsResponse: function(availableChannelObject){
        console.log('Got a response from available channels request ', availableChannelObject);
        const availableChannelsArray = availableChannelObject.channels;
        var availableChannelsHTML = '';

        // Store the available channels array in availableChannelsObject
        for (var i = 0, len = availableChannelsArray.length; i < len; i++) {
            var channelID = availableChannelsArray[i].channelID;
            chatSPA.availableChannelsObject[channelID] = availableChannelsArray[i];
            availableChannelsHTML = availableChannelsHTML
            + '<p><button class="btn btn-secondary" id="chatSPAAvailableChannelsButton" onclick="chatSPA.jumpToChannelFromNotificationModal(\''+channelID+'\');return false;">'+availableChannelsArray[i].channelName+'</button></p>'
        };

        // Call the modal that shows channels this user can jump to
        chatSPA.showLargeAlertModal('Available Channels', availableChannelsHTML);
    },
    jumpToChannelFromNotificationModal(channelID){
        // Tell PubNubClient to subscribe to this channel - it doesnt matter if we resubscribe to the channel
        chatSPA.pubnubClient.subscribe({channels:[channelID]});

        // Check and add channel to the authorisedChannels array
        chatSPA.channelsArray.push(channelID);

        // Draw the new list of chats
        chatSPA.updateChatsView();

        // Close the modal
        $('#showAlertOrNoficiationModal').modal('hide');

        // Jump to a channel from the Channel Modal
        chatSPA.jumpToChannel(channelID);
    },
    makeNewGroupRoomButton: function(){
        console.log('User clicked to make a new room');

    },
    handleReportUserButton: function(usernameToReport){
        console.log('Got a request to report user ', usernameToReport);
    },
    showActiveDMsButton: function(){
        // Shows a list of DM's this user is currently private chatting to and allows them to jump directly to that conversation. directMessagesObject
        var dmsHTML = '';
        Object.keys(chatSPA.directMessagesObject).forEach(function (userID) {
            const personWeAreMessaging = userID;
            const unReadMessageCount = chatSPA.directMessagesObject[userID];

            dmsHTML = dmsHTML +'<div class="row"><p>'
            +'<div class="btn-group" role="group" aria-label="Button group with nested dropdown">'
                //+'<button type="button" class="btn btn-secondary">'+occupantsArray[i].uuid+'</button>'
                +'<div class="btn-group" role="group">'
                    +'<button id="btnGroupDrop1" type="button" class="btn btn-link dropdown-toggle" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">'+personWeAreMessaging+'</button>'
                    +'<div class="dropdown-menu" aria-labelledby="btnGroupDrop1">'
                        + '<button class="dropdown-item btn btn-link" id="chatSPAMessageUserWithinMessageButton" data-userid="User0" onclick="chatSPA.handleMessageUserButton(\''+personWeAreMessaging+'\'); $(\'.modal\').modal(\'hide\'); $(\'.modal-backdrop\').remove(); return false;">Message User</button>'
                        + '<button class="dropdown-item btn btn-link" id="chatSPAReportUserWithinMessageButton" data-userid="User0" onclick="chatSPA.handleReportUserButton(\''+personWeAreMessaging+'\');return false;">Report User</button>'
                    +'</div>'
                +'</div>'
            +'</div>'
            +'</p></div>';
        });


        // Call the Alert Modal to display the active DMs list
        chatSPA.showLargeAlertModal('Active DM\'s with you', dmsHTML);
    },
    removeDuplicatesFromArray: function(arrayToClean) {
        let unique = {};
        arrayToClean.forEach(function(i) {
            if(!unique[i]) {
            unique[i] = true;
            }
        });
        return Object.keys(unique);
    },
    scrollToBottomOfChat: function(){
        $('#chatSPAChatContainerBody').stop ().animate ({
            scrollTop: $('#chatSPAChatContainerBody')[0].scrollHeight
        });
    },
    handleVoiceButton: function(idToCall){
        if(localStorage.getItem('voiceToken')){
            chatSPA.initiateTwilioClientVoiceCall(idToCall);
        };
    },
    initiateTwilioClientVoiceCall: function(destinationID){
        const params = { To: destinationID, from: chatSPA.username };
        Twilio.Device.connect(params);
    },
    handleVoiceDisconnectButton: function(){
        chatSPA.disconnectTwilioClient();
    },
    disconnectTwilioClient: function(){
        console.log('Hanging up...');
        Twilio.Device.disconnectAll();
    },

    getListOfVideoProviders(){
        // Gets a list of video providers, this displays a modal that gives the user an option of which one to use. 
        console.log("Making a request to get video vendors");
        chatSPA.lazyAPIRequestToServer('/video/vendors', {}, 'get', chatSPA.handleGetListOfVideoProvidersSuccess,chatSPA.lazyFailureFunction);
    },
    handleGetListOfVideoProvidersSuccess(providersObject){
        console.log('Got a list of video providers', providersObject);
        var videoProvidersArray = providersObject.vendors
        // If the array is just one provider, acttivate that provider
        if(videoProvidersArray.length == 1){
            chatSPA.createVideoSessionForChannel(videoProvidersArray[0], localStorage.getItem('activeChannel'))
        } else {
            // Draw a modal that gives the user a choice of what video vendor to use
            var videoVendorsHTML = '<div class="row">';
            for (var i = 0, len = videoProvidersArray.length; i < len; i++) {
                videoVendorsHTML = videoVendorsHTML + '<p><button type="button" class="btn btn-secondary"  onclick="chatSPA.createVideoSessionForChannel(\''+videoProvidersArray[i]+'\', \''+localStorage.getItem('activeChannel')+'\');return false;">'+videoProvidersArray[i]+'</button><br></p>';
            };
            videoVendorsHTML = videoVendorsHTML+'</div>'

            const videoVendotModalHTML = '<div class="modal-dialog" role="document"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">Select Video Vendor</h5><button type="button" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button></div><div class="modal-body"><div class="container-fluid">'
            +videoVendorsHTML+'</div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button></div></div></div>';

            // Call the Modal to be displayed
            $('#showAlertOrNoficiationModal').html(videoVendotModalHTML);
            $('#showAlertOrNoficiationModal').modal('show'); 
        };
    },
    createVideoSessionForChannel(videoVendor, channelID){
        // Makes a request to the server to get a video session established for a Channel
        console.log('Making request to setup a video session, Vendor '+videoVendor+' Channel '+channelID);
        chatSPA.lazyAPIRequestToServer('/video/create/session/'+videoVendor,{channel: channelID}, 'post', chatSPA.handleCreateVideoSessionForChannelSuccess, chatSPA.lazyFailureFunction)
    },
    handleCreateVideoSessionForChannelSuccess(videoObject){
        console.log('Was able to generate a session for a new video event, here are the details:');
        console.log(videoObject.video);
        var sessionID = videoObject.video.session;
        var token = videoObject.video.token;
        var videoVendor= videoObject.video.vendor;

        // Write the session and token to local storage for use later on
        localStorage.setItem('videoSessionID', sessionID);
        localStorage.setItem('videoTokenID', token);

        // Publish to the details of the video room to the channel so that people can join
        const videoPayload = {
            "type": "videoInvite",
            "session": sessionID,
            "vendor": videoVendor,
            "to": localStorage.getItem('activeChannel'),
            "accessToken": localStorage.getItem('accessToken')
        };

        if(chatSPA.deliveryMethology == 'waterfall'){
            chatSPA.messageAPIRequestToServer(videoPayload, 'post',chatSPA.handleMessageAPIRequestToServerSuccess, chatSPA.handleMessageAPIRequestToServerFailure);
        } else {
            if(localStorage.getItem('pubnubPubKey')){
                chatSPA.handlePushToPubNub(pubNubMediaPayload, localStorage.getItem('activeChannel'));
            };
        };


        // Open a new window to the session/token url
        window.open('/video/'+sessionID+'/'+videoVendor,'_blank', 'width=800,height=600', false)
    },


    joinExistingVideoSession(sessionID, vendor){
        // Makes a request to get a token to join an existing video session
        console.log("Making a request to get a token for an existing video session: ", sessionID)
        chatSPA.lazyAPIRequestToServer('/video/join/session/'+vendor,{session:sessionID}, 'post', chatSPA.handleJoinExistingVideoSession, chatSPA.lazyFailureFunction)
    },
    handleJoinExistingVideoSession(videoObject){
        console.log('Was able to get a token for video session', videoObject);
        // Write the session and token to local storage for use later on
        localStorage.setItem('videoSessionID', videoObject.video.session);
        localStorage.setItem('videoTokenID', videoObject.video.token);
        // Open a new window to the session/token url
        window.open('/video/'+videoObject.video.session+'/'+videoObject.video.vendor,'_blank', 'width=800,height=600', false)
    }
};
