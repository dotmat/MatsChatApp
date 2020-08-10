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
    showUsersView: function(){
        parent.location.hash = "users";
        // Set the Page Title to users
        const usersHeader = 'Registered Users <span class="pull-right"><button type="button" class="btn btn-outline-primary btn-sm" onclick="adminSPA.createNewUserModalButtonClick();return false;">Add User</button></span>';
        $("#adminSPAContainerHeader").html(usersHeader);

        // Draw the Users Table
        const usersTableHTML = '<!-- Users Table--><div class="row"><div class="col"><div class="card shadow"><div class="table-responsive"><table class="table align-items-center table-flush"><tbody id="adminSPAUsersTableBody"></tbody></table></div></div></div></div><!-- End Users Table-->';
        $("#adminSPAContainerBody").html(usersTableHTML);

        adminSPA.pubnubClient.getUsers(
            {
              include: {
                customFields: true
              }
            },
            function(status, response) {
                console.log('List of users:');
                console.log(response);
                const usersArray = response.data;


                // Populate the users Table with the users
                var usersHTML = null;

                for (var i = 0, len = usersArray.length; i < len; i++) {
                    console.log(usersArray[i]);
                    var userHTMLRecord = '<tr><td>'+usersArray[i].id+'</td><td>'+usersArray[i].name+'</td><td>'+usersArray[i].email+'</td><td>'+usersArray[i].custom.ISOCountryCode+'</td><td>'+usersArray[i].custom.requestLanguage+'</td><td>'+adminSPA.generateHumanDate(usersArray[i].created)+'</td><td class="text-right"><div class="dropdown"><a class="btn btn-sm btn-icon-only text-light" href="#" role="button" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false"><i class="fas fa-ellipsis-v"></i></a><div class="dropdown-menu dropdown-menu-right dropdown-menu-arrow"><a class="dropdown-item" href="#" onclick="adminSPA.deleteUserButton(\''+usersArray[i].id+'\');return false;" >Delete User</a><a class="dropdown-item" href="#" onclick="adminSPA.getMemebershipsOnUserButton(\''+usersArray[i].id+'\');return false;">Show Memberships</a><a class="dropdown-item" href="#" onclick="adminSPA.moreInfoOnUserButton(\''+usersArray[i].id+'\');return false;">More Info</a></div></div></td></tr>';
                    usersHTML = usersHTML+userHTMLRecord;
                };

                // Load the users HTML into the Table
                $("#adminSPAUsersTableBody").html(usersHTML);
            }
          );
    },
    showSpacesView: function(){
        parent.location.hash = "spaces";
        // Set the Page Title to users
        const spacesHeader = 'Registered Spaces <span class="pull-right"><button type="button" class="btn btn-outline-primary btn-sm" onclick="adminSPA.createNewSpaceButtonClick();return false;">Add Space</button></span>';
        $("#adminSPAContainerHeader").html(spacesHeader);

        // Draw the Spaces Table
        const spacesTableHTML = '<!-- Spaces Table--><div class="row"><div class="col"><div class="card shadow"><div class="table-responsive"><table class="table align-items-center table-flush"><tbody id="adminSPASpacesTableBody"></tbody></table></div></div></div></div><!-- End Spaces Table--><div class="card-header bg-transparent"><h3 class="mb-0" id="adminSPAMembersHeader"></h3></div><!-- Memberships Table--><div class="row"><div class="col"><div class="card shadow"><div class="table-responsive"><table class="table align-items-center table-flush"><tbody id="adminSPAMembershipsTableBody"></tbody></table></div></div></div></div><!-- End Memberships Table-->';
        $("#adminSPAContainerBody").html(spacesTableHTML);

        adminSPA.pubnubClient.getSpaces(
            {
                limit: 10000
            },
            function(status, response) {
                //console.log(response);
                var spacesArray = response.data;

                // Populate The Spaces Table with the Spaces
                var spacesHTML = null;
                for (var i = 0, len = spacesArray.length; i < len; i++) {
                    //console.log(spacesArray[i]);
                    var spaceHTMLRecord = '<tr><td>'+spacesArray[i].id+'</td><td>'+spacesArray[i].name+'</td><td>'+adminSPA.generateHumanDate(spacesArray[i].created)+'</td><td class="text-right"><div class="dropdown"><a class="btn btn-sm btn-icon-only text-light" href="#" role="button" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false"><i class="fas fa-ellipsis-v"></i></a><div class="dropdown-menu dropdown-menu-right dropdown-menu-arrow"><a class="dropdown-item" href="#" onclick="adminSPA.deleteSpacebutton(\''+spacesArray[i].id+'\');return false;" >Delete Space</a><a class="dropdown-item" href="#" onclick="adminSPA.getMemebershipsOnSpaceButton(\''+spacesArray[i].id+'\');return false;">Show Memberships</a><a class="dropdown-item" href="#" onclick="adminSPA.moreInfoOnSpaceButton(\''+spacesArray[i].id+'\');return false;">More Info</a></div></div></td></tr>';
                    spacesHTML = spacesHTML + spaceHTMLRecord;
                };

                // Load the Spaces HTML into the Table
                $("#adminSPASpacesTableBody").html(spacesHTML);

            }
        );
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
            url: '/admin/user',
            timeout: 5000,
            dataType: 'json',
            type: 'post',
            headers: {
                "x-admin-key":localStorage.getItem('accessToken')
            },
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
    createNewUserInPubNub: function(userObject){
        console.log('Time to make a new User');
        console.log(userObject);
        adminSPA.pubnubClient.createUser(
            {
                id: userObject.signupUsername,
                name: userObject.signupUsername,
                email: userObject.signupEmail,
                custom: {
                    type: "user",
                    email: userObject.signupEmail,
                    ISOCountryCode: userObject.ISOCountryCode,
                    requestLanguage: userObject.requestLanguage
                } 
            },
            function(status, response) {
                console.log(status);
                console.log(response);
            }
        );
    },
    deleteUserButton: function(userID){
        console.log('Are you sure you want to delete user', userID);
        Swal.fire({
            title: 'Are you sure?',
            text: "You won't be able to revert this!",
            type: 'error',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Yes, Delete '
          }).then((result) => {
            if (result.value) {
                adminSPA.deleteUserFromPubNub(userID);
            }
          })
    },
    deleteUserFromPubNub: function(userID){
        adminSPA.pubnubClient.deleteUser(userID, function(status, response) {
            console.log(response);
            Swal.fire('Deleted!',userID+' has been deleted.','success')
        });
    },
    getMemebershipsOnUserButton: function(userID){
        console.log('User requested more info on userID', userID);
        adminSPA.getMembershipsOnUserFromPubNub(userID);
    },
    getMembershipsOnUserFromPubNub: function(userID){
        adminSPA.pubnubClient.getMemberships(
            {userId: userID}, function(status, response) {
                console.log(response);
            }
        );
    },
    moreInfoOnUserButton: function(userID){

    },
    createNewSpaceButtonClick: function(){
        // Launch a modal form to make a new space.
        $("#adminSPANewSpaceModal").modal();
    },
    handleNewSpaceModalButtonClick: function(){
        var createNewSpaceObject = {
            id: $('#newSpaceModalSpaceID').val(),
            name: $('#newSpaceModalSpaceName').val(),
            description: $('#newSpaceModalSpaceDescription').val(),
            custom: {}
        };
        //console.log(createNewSpaceObject);
        adminSPA.createNewSpaceInPubNub(createNewSpaceObject);
    },
    createNewSpaceInPubNub: function(spaceObject){
        adminSPA.pubnubClient.createSpace(
            {
                id: spaceObject.id,
                name: spaceObject.name,
                description: spaceObject.description,
                custom: spaceObject.metaData
            },
            function(status, response) {
                console.log(response);
                if(response.status===200){
                    // Close the modal
                    $("#adminSPANewSpaceModal").modal('hide');
                    // Reload the spaces table to show the new space thats been created
                    adminSPA.showSpacesView();
                }
            }
        );
    },
    deleteSpacebutton: function(spaceID){
        console.log('Are you sure you want to delete space', spaceID);
        Swal.fire({
            title: 'Are you sure?',
            text: "You won't be able to revert this!",
            type: 'error',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Yes, Delete '
          }).then((result) => {
            if (result.value) {
                adminSPA.deleteSpaceFromPubNub(spaceID);
            }
          })
    },
    deleteSpaceFromPubNub: function(spaceID){
        adminSPA.pubnubClient.deleteSpace(spaceID, function(status, response) {
            console.log(response);
            Swal.fire('Deleted!',spaceID+' has been deleted.','success');
            // Reload the Spaces Container to reflect the deleted space
            adminSPA.showSpacesView();
        });
    },
    getMemebershipsOnSpaceButton: function(spaceID){
        console.log('Got a request to get membership details on space:', spaceID);
        adminSPA.getMembershipsOnSpaceFromPubNub(spaceID);
    },
    getMembershipsOnSpaceFromPubNub: function(spaceID){
        var membersHTML = null;
        adminSPA.pubnubClient.getMembers(
            {
              spaceId: spaceID
            },
            function(status, response) {
                console.log(response);
                var membersArray = response.data;
                // Draw the members rows and then add this to the adminSPAMembershipsTableBody container
                for (var i = 0, len = membersArray.length; i < len; i++) {
                    //console.log(membersArray[i]);
                    var memberRowHTML = '<tr><td>'+membersArray[i].id+'</td><td>'+adminSPA.generateHumanDate(membersArray[i].updated)+'</td><td><button type="button" class="btn btn-outline-primary btn-sm" onclick="adminSPA.removeMemberFromSpaceButton(\''+membersArray[i].id+'\', \''+spaceID+'\');return false;" >Remove User</button></td></tr>';
                    membersHTML = membersHTML + memberRowHTML;
                };
                $("#adminSPAMembersHeader").html('Members of '+spaceID);
                $("#adminSPAMembershipsTableBody").html(membersHTML);
            }
          );
    },
    removeMemberFromSpaceButton(userID, spaceID){
        console.log('Removing user from space');
        adminSPA.removeMemberFromSpaceFromPubNub(userID, spaceID);
    }, 
    removeMemberFromSpaceFromPubNub(userID, spaceID){
        adminSPA.pubnubClient.removeMembers(
            {
                spaceId: spaceID,
                users: [userID]
            },
            function(status, response) {
                // Redraw the members table to show the new list of members in this space.
                adminSPA.getMembershipsOnSpaceFromPubNub(spaceID);
            }
        );
    },
    generateHumanDate: function(dateString){
        dateString = dateString.split('T');
        return dateString[0];
    }
};