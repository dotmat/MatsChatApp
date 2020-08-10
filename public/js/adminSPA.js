'use-strict';

var adminSPA = {
    appName: null,
    pubnubClient: null,
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
    launcher: function(){
        adminSPA.appName = $('meta[name=appName]').attr("content");
        console.log(adminSPA.appName+' Admin App is launching!');
        const pubnubPublishKey = $('meta[name=pubnubPublishKey]').attr("content");
        const pubnubSubscribeKey = $('meta[name=pubnubSubscribeKey]').attr("content");
        const pubnubSecretKey = $('meta[name=pubnubSecretKey]').attr("content");

        // Create the PubNub Client
        adminSPA.pubnubClient = new PubNub({
            publishKey: pubnubPublishKey,
            subscribeKey: pubnubSubscribeKey,
            uuid: "Admin-"+adminSPA.appName,
            secretKey: pubnubSecretKey,
            autoNetworkDetection: true, // enable for non-browser environment automatic reconnection
            restore: true, // enable catchup on missed messages,
            origin: adminSPA.appName+".pubnub.com" // Custom Origin
        });

        // Subscribe to the Admin Channel to keep an eye on events and notices.
        adminSPA.pubnubClient.addListener({
            status: function(statusEvent) {
                if (statusEvent.category === "PNConnectedCategory") {};
            },
            message: function(message) {
                // handle message
            },
            presence: function(presenceEvent) {
                // handle presence
            }
        })
        
        const adminChannel = adminSPA.appName+".admin";
        const dashboardChannel = adminSPA.appName+".dashboard";
        adminSPA.pubnubClient.subscribe({
            channels: [dashboardChannel, adminChannel]
        });

        // Check the Hash URL to see if any direct links
        if(window.location.hash == '#users'){
            adminSPA.showUsersView();
        };

        if(window.location.hash == '#spaces'){
            adminSPA.showSpacesView();
        };

        // Every 5 seconds run a HereNow function on PubNub
        // This will get the number of unique ID's that are connected and online.
        // window.setInterval(function(){
        //     adminSPA.pubnubClient.hereNow({channels: ["{{appName}}.admin"], includeUUIDs: true,includeState: true },
        //     function (hereNowResponseStatus, hereNowResponse) {
        //     // handle status, response
        //     //console.log(hereNowResponse);
        //     // From Response The admin channel is used to count the number of users actually online as every (human) will connect to admin.
        //     const adminObject = hereNowResponse.channels["{{appName}}.admin"];
        //     const countOfAdminSubscribers = adminObject.occupants.length;

        //     //console.log('Total Channels Online: ', hereNowResponse.totalChannels);
        //     // $("#liveMetricsActiveChannels").text(hereNowResponse.totalChannels);
        //     console.log('Total Users Online: ', countOfAdminSubscribers);
        //     // $("#liveMetricsUsersOnline").text(countOfAdminSubscribers);
        //     });
        // }, 5000);
    },
    showUsersView:function(){
        // Make an API Request to the server to get the list of users on this server
        $.ajax({
            url: '/admin/user',
            timeout: 5000,
            dataType: 'json',
            type: 'get',
            contentType: 'application/json',
            processData: false,
            success: function( data, textStatus, jQxhr ){
                console.log('User Profile Object',data);
                adminSPA.handleShowUsersViewSuccess(data);
            },
            error: function( jqXhr, textStatus, errorThrown ){
                if(textStatus == 'timeout'){
                    //console.log('Request Timeout');
                    adminSPA.handleShowUsersViewFailure({success: false, message: 'timeout'});
                } else {
                    adminSPA.handleShowUsersViewFailure(jqXhr.responseJSON);
                }
                //console.log(errorThrown);
                //console.log(jqXhr.responseJSON);
            }
        });
    },
    handleShowUsersViewSuccess: function(usersPayload){
        // Update the URL to show we are in the Users Section
        parent.location.hash = "users";

        const usersHeader = 'Registered Users <span class="pull-right"><button type="button" class="btn btn-outline-primary btn-sm" onclick="adminSPA.createNewUserModalButtonClick();return false;">Add User</button></span>';
        $("#adminSPAContainerHeader").html(usersHeader);

        // Draw the Users Table
        const usersTableHTML = '<!-- Users Table--><div class="row"><div class="col"><div class="card shadow"><div class="table-responsive"><table class="table align-items-center table-flush"><tbody id="adminSPAUsersTableBody"></tbody></table></div></div></div></div><!-- End Users Table-->';
        $("#adminSPAContainerBody").html(usersTableHTML);
    },
    handleShowUsersViewFailure: function(failurePayload){

    },

    showChannelsView:function(){
        // Make an API Request to the server to get the list of currently active channels.

    },
    handleShowChannelsViewSuccess:function(channelPayload){

    },

    handleShowChannelsViewFailure:function(failurePayload){

    },
    createNewUserModalButtonClick: function(){
        // Launch a modal form to make a new user.
        $("#adminSPANewUserModal").modal()
    },
    handleCreateUserFromModalButtonClick: function(){
        const signupdUsername = $('#newUsernameFromModal').val();
        const signupPassword = $('#newUserPasswordFromModal').val();

        const signupEmailAddress = $('#newUserEmailFromModal').val();
        const userType = $('#newUserTypeFromModal').val();
        const adminNotes = $('#newUserAdminNotesFromModal').val();


        const newUserSignupObject = {
            signupdUsername:signupdUsername,
            signupPassword:signupPassword,
            reqirePasswordChange: false,
            signupEmailAddress:signupEmailAddress,
            signupEmailAddressVerified: true,
            locale: 'en',
            ipAddress: '["::1"]',
            userType: userType,
            adminNotes: adminNotes
        };

        // Create User API Request
        $.ajax({
            url: '/admin/user/create',
            timeout: 5000,
            dataType: 'json',
            type: 'post',
            contentType: 'application/json',
            data: JSON.stringify(newUserSignupObject),
            processData: false,
            success: function( data, textStatus, jQxhr ){
                console.log('User Profile Object',data);
                adminSPA.handleAdminMakeUserSuccess(data);
            },
            error: function( jqXhr, textStatus, errorThrown ){
                if(textStatus == 'timeout'){
                    //console.log('Request Timeout');
                    adminSPA.handleAdminMakeUserFailure({success: false, message: 'timeout'});
                } else {
                    adminSPA.handleAdminMakeUserFailure(jqXhr.responseJSON);
                }
                //console.log(errorThrown);
                //console.log(jqXhr.responseJSON);
            }
        });
    },
    handleAdminMakeUserSuccess: function(signupObject){

    },
    handleAdminMakeUserFailure: function(failurObject){
        
    },
    moreInfoOnUserButton: function(userID){

    },
    createNewChannelModalButtonClick: function(){
        // Launch a modal form to make a new channel.
        $("#adminSPANewChannelModal").modal()
    },
    handleCreateChannelFromModalButtonClick: function(){

    },
    showBannedItemsView:function(){
        // Shows a list of banned objects
        // Banned items include; usernames, IP Addresses, 
    },
    generateHumanDate: function(dateString){
        dateString = dateString.split('T');
        return dateString[0];
    }
};