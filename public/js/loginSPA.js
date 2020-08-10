'use-strict';

var loginSPA = {
    appName: null,
    loginUsername: null,
    loginPassword: null,
    mfaToken: null,
    mfaLoginObject: null,
    remembermeCheckBox: null,
    loginErrorMessage: null,
    userAccessToken: null,
    assignedUsername: null,
    pubnubSubKey: null,
    tokenExpiry: null,
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
        // Check for the autologin flag in the GET URL. 
        var autoLoginCheck = false;
        try {
            autoLoginCheck = JSON.parse(loginSPA.getUrlParameter('autoLogin')) || false;
        } catch(e){
            //console.log('Auto Login Error',e);
        }
        //const autoLoginCheck = JSON.parse(loginSPA.getUrlParameter('autoLogin')) || false;
        if(autoLoginCheck == true){
            console.log('AutoLogin Flag has been found, proceeding to Auto Log the user in.');
            loginSPA.handleHTTPToLoginServer({"username": localStorage.getItem('username'), "password": localStorage.getItem('password')});
            // Destroy the password so it cant be reused. 
            localStorage.removeItem('password');
        }
        else {
            console.log('No Auto Login for you');
        }
        loginSPA.appName = $('meta[name=appName]').attr("content") || 'ChatApp';
        console.log(loginSPA.appName+' is launching!');
        // Check for the presence of 3rd party signin values
        // If they exist then present those buttons.
        const support3rdPartyLoginBool = $('meta[name=support3rdPartyLogin]').attr("content") || false;
        if(support3rdPartyLoginBool == true){
            console.log('This app supports login via 3rd Party credentials.');
            $('#3rdPartyLoginContainer').removeAttr('hidden');
            const signInWithGoogleBool = $('meta[name=signInWithGoogle]').attr("content");
            if(signInWithGoogleBool == true){
                $('#signinWithGoogleContainer').removeAttr('hidden');
            };
        } else {
            console.log('This app does not support login via 3rd party credentials.');
        }
    },
    presentLoginErrorToUser: function(errorMessage){
        $('#loginErrorMessage').html(errorMessage);
    },
    handleSignInButtonClick: function(){
        // Clear the error message so any new message is contextually relevant.
        loginSPA.presentLoginErrorToUser('');
        loginSPA.loginUsername = $('#textUsernameInput').val();
        loginSPA.loginPassword = $('#textPasswordInput').val();
        if ($('#checkboxRememberMeInput').is(":checked")){
            loginSPA.remembermeCheckBox = true;
        } else {
            loginSPA.remembermeCheckBox = false;
        };

        // The username and password fields cant be blank, if they are then fire off an error
        if(loginSPA.loginUsername == null || loginSPA.loginUsername == '' || loginSPA.loginPassword == null || loginSPA.loginPassword == ''){
            loginSPA.presentLoginErrorToUser('Credentials cant be blank.');
        } else {
            console.log('Attempting to log '+loginSPA.loginUsername+' with password '+loginSPA.loginPassword+'. If they want to be remembered '+loginSPA.remembermeCheckBox);
            loginSPA.handleHTTPToLoginServer({"username": loginSPA.loginUsername, "password": loginSPA.loginPassword});
        }
    },
    handleHTTPToLoginServer: function(loginObject){
        // HTTP POST to the Server to attempt login.
        $.ajax({
            url: '/login',
            timeout: 5000,
            dataType: 'json',
            type: 'post',
            contentType: 'application/json',
            data: JSON.stringify(loginObject),
            processData: false,
            success: function( data, textStatus, jQxhr ){
                console.log(data);
                loginSPA.handleLoginSuccess(data);
            },
            error: function( jqXhr, textStatus, errorThrown ){
                if(textStatus == 'timeout'){
                    //console.log('Request Timeout');
                    loginSPA.handleLoginFailure({success: false, message: 'timeout'});
                } else {
                    loginSPA.handleLoginFailure(jqXhr.responseJSON);
                }
                //console.log(errorThrown);
                //console.log(jqXhr.responseJSON);
            }
        });
    },
    handleLoginSuccess: function(loginObject){
        console.log('Handle Login Success');
        // Check for the presence of MFA required, if an MFA flag is passed then we need to get the user to pass MFA before a login token will be issued.
        if(loginObject.mfaRequired == true){
            // Write the login object to localstorage 
            localStorage.setItem("mfaLoginObject", loginObject.login);
            loginSPA.mfaLoginObject = loginObject.login;
            loginSPA.assignedUsername = loginObject.username;
            localStorage.setItem("username", loginObject.username);

            // Launch the MFA Modal
            loginSPA.launchMFAModal();
        } else {
            //console.log(loginObject.login);
            // Save all the tokens to the SPA and local storage
            loginSPA.assignedUsername = loginObject.username;
            localStorage.setItem("username", loginObject.username);

            loginSPA.userAccessToken = loginObject.login.accessToken;
            localStorage.setItem("accessToken", loginObject.login.accessToken);

            loginSPA.userRefreshToken = loginObject.login.refreshToken;
            localStorage.setItem("refreshToken", loginObject.login.refreshToken);
            //console.log(loginObject.login.accessToken);

            loginSPA.pubnubSubKey = loginObject.login.pubnubSubKey;
            localStorage.setItem("pubnubSubKey", loginObject.login.PubNubSubKey);
            //console.log(loginObject.login.PubNubSubKey);

            if(loginObject.login.PubNubPubKey){
                localStorage.setItem("pubnubPublishKey", loginObject.login.PubNubPubKey);
                //console.log(loginObject.login.PubNubPubKey);
            };

            if(loginObject.login.useSignals == true){
                localStorage.setItem("usePNSignals", true);
            };

            if(loginObject.login.cipherKey){
                localStorage.setItem("cipherKey", loginObject.login.cipherKey);
            };

            if(loginObject.login.methodology){
                localStorage.setItem("methodology", loginObject.login.methodology);
            };

            if(loginObject.login.voiceToken){
                localStorage.setItem("voiceToken", loginObject.login.voiceToken);
            }

            loginSPA.tokenExpiry = loginObject.login.expires;
            localStorage.setItem("tokenExpiry", loginObject.login.expires);
            //console.log(loginObject.login.expires);

            // Redirect the page to the chat URL which will load the Chat SPA.
            window.location.replace("/chat");
        }
    },
    handleLoginFailure: function(errorObject){
        //console.log('Handle Login Failure');
        console.log(errorObject);
        if(errorObject.message == 'timeout'){
            loginSPA.presentLoginErrorToUser('Connection timeout.</br>Are you connected to the internet?');
        } else {
            loginSPA.presentLoginErrorToUser(errorObject.message);
        }
    },
    handleSigninWithGoogle: function(){

    },
    handleSigninWithApple: function(){

    },
    launchMFAModal: function(){
        $('#mfaRequiredModal').modal({backdrop: 'static', keyboard: false});
    },
    handleMFAModalFormClick: function(){
        // Get the MFA code entered
        loginSPA.mfaToken = $('#textMFATokenInput').val();
        //console.log(loginSPA.mfaLoginObject);
        // HTTP POST to the Server to attempt login.
        $.ajax({
            url: '/verify',
            dataType: 'json',
            type: 'post',
            contentType: 'application/json',
            data: JSON.stringify({"username": loginSPA.loginUsername, "mfaToken": loginSPA.mfaToken, loginObject: loginSPA.mfaLoginObject}),
            processData: false,
            success: function( data, textStatus, jQxhr ){
                console.log(data);
                loginSPA.handleMFARequestSuccess(data);
            },
            error: function( jqXhr, textStatus, errorThrown ){
                console.log(errorThrown);
                //console.log(jqXhr.responseJSON);
                if(textStatus == 'timeout'){
                    //console.log('Request Timeout');
                    loginSPA.handleMFARequestFailure({success: false, message: 'timeout'});
                } else {
                    loginSPA.handleMFARequestFailure(jqXhr.responseJSON);
                }
            }
        });
    },
    handleMFARequestSuccess: function(loginObject){
        // User's MFA token was accepted and the user was returned a login Object that contains all the needed access and socket tokens.
        // Save all the tokens to the SPA and local storage
        loginSPA.assignedUsername = loginObject.username;
        localStorage.setItem("username", loginObject.username);

        loginSPA.userAccessToken = loginObject.login.accessToken;
        localStorage.setItem("accessToken", loginObject.login.accessToken);

        loginSPA.pubnubSubKey = loginObject.login.pubnubSubKey;
        localStorage.setItem("pubnubSubKey", loginObject.login.PubNubSubKey);

        loginSPA.tokenExpiry = loginObject.login.expires;
        localStorage.setItem("tokenExpiry", loginObject.login.expires);

        // Remove the login object is its no longer needed
        localStorage.removeItem('mfaLoginObject');

        // Redirect the page to the chat URL which will load the Chat SPA.
        window.location.replace("/chat");
    },
    handleMFARequestFailure: function(errorObject){
        if(errorObject.message == 'timeout'){
            loginSPA.presentLoginErrorToUser('Connection timeout.</br>Are you connected to the internet?');
        }
    },
    launchForgotPasswordModal: function(){
        $('#forgotPasswordModal').modal();
    },
    handleForgotPasswordModalFormClick: function(){
        const resetUsername = $('#textResetUsernameInput').val();

        // Make a request to the reset resource to initiate the password reset process.
        $.ajax({
            url: '/reset/password',
            dataType: 'json',
            type: 'post',
            contentType: 'application/json',
            data: JSON.stringify({"username": resetUsername}),
            processData: false,
            success: function( data, textStatus, jQxhr ){
                console.log(data);
                loginSPA.handleMFARequestSuccess(data);
            },
            error: function( jqXhr, textStatus, errorThrown ){
                //console.log(errorThrown);
                //console.log(jqXhr.responseJSON);
                if(textStatus == 'timeout'){
                    //console.log('Request Timeout');
                    loginSPA.handleMFARequestFailure({success: false, message: 'timeout'});
                } else {
                    loginSPA.handleMFARequestFailure(jqXhr.responseJSON);
                }
            }
        });
    },
};
 