'use-strict';

var signupSPA = {
    appName: null,
    signupUsername: null,
    signupEmailAddress: null,    
    signupPassword: null,
    signupUserAgreeToTOS: null,
    signupAge: null,
    requiredAge: null,
    requiredGender: null,
    signupErrorMessage: null,
    launcher: function(){
        signupSPA.appName = $('meta[name=appName]').attr("content") || 'ChatApp';
        console.log(signupSPA.appName+' is launching!');
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
        };
        const requireAgeCheck = $('meta[name=requireAgeCheck]').attr("content") || false;
        if(requireAgeCheck !== false){
            console.log('Age Requirement is '+requireAgeCheck+'. You must input your DOB to be able to signup here.');
            signupSPA.requiredAge = requireAgeCheck;
            $('#ageRequiredForm').removeAttr('hidden');
        } else {
            console.log('This app does not require a DOB Check.');
            signupSPA.requiredAge = false;
        };
        const requireGenderInput = $('meta[name=requireGender]').attr("content") || false;
        if(requireGenderInput == true){
            console.log('Gender Requirement is '+requireAgeCheck+'. You must provide your gender to signup.');
            signupSPA.requiredGender = requireGenderInput;
            $('#genderRequiredForm').removeAttr('hidden');
        } else {
            console.log('This app does not require a Gender Check.');
            signupSPA.requiredGender = false;
        };
    },
    presentSignupErrorToUser: function(errorMessage){
        $('#loginErrorMessage').html(errorMessage);
    },
    handleSignupButtonClick: function(){
        // Clear any signup errors so that any new ones are contexually relevant to the user.
        signupSPA.presentSignupErrorToUser('');
        var signupObject = {};

        signupSPA.signupUsername = $('#textUsernameInput').val();
        signupSPA.signupEmailAddress = $('#textEmailInput').val();
        signupSPA.signupPassword = $('#textPasswordInput').val();
        if ($('#checkboxUserAgreeToTOSInput').is(":checked")){
            signupSPA.signupUserAgreeToTOS = true;
        } else {
            signupSPA.signupUserAgreeToTOS = false;
        };
        // Check to make sure that the username, email, password and TOS are not blank.
        if(signupSPA.signupUsername == null || signupSPA.signupEmailAddress == null || signupSPA.signupPassword == null || signupSPA.signupUserAgreeToTOS == null || signupSPA.signupUserAgreeToTOS == false){
            signupSPA.presentSignupErrorToUser('Credentials cant be blank.');
            if(signupSPA.signupUsername != null && signupSPA.signupUserAgreeToTOS == false){
                signupSPA.presentSignupErrorToUser('You must agree to Terms and Conditions.');
            }
        } else {
            signupObject.username = signupSPA.signupUsername;
            signupObject.emailAddress = signupSPA.signupEmailAddress;
            signupObject.password = signupSPA.signupPassword;
            signupObject.tosAgreed =  signupSPA.signupUserAgreeToTOS;
            // If there is an age check, then compare the inputted date against the required age field.
            if(signupSPA.requiredAge != false){
                var inputtedDOBString = $('#monthdropdown').val()+'/'+$('#daydropdown').val()+'/'+$('#yeardropdown').val(); // DOB is in US form. Month/Day/Year
                //console.log('Inputted DOB is: '+inputtedDOBString);
                const calculateAge = signupSPA.calculateAge(inputtedDOBString);
                //console.log('Calculated age: '+calculateAge);
                if(calculateAge <= signupSPA.requiredAge){
                    //console.log('User is younger than required age');
                    signupSPA.presentSignupErrorToUser('Sorry, you need to be older than '+signupSPA.requiredAge+'.</br>To use this service.');
                } else {
                    console.log('User is older than required age');
                    signupObject.dob = inputtedDOBString;
                };
            };

            // If the gender is required 
            if(signupSPA.requiredGender == true){
                const inputtedGender = $('#genderDropDown').val();
                signupObject.gender = inputtedGender;
            };
            
            // HTTP POST to the Server to attempt signup.
            console.log('Request Payload is: ');
            console.log(signupObject);
            $.ajax({
                url: '/signup',
                timeout: 5000,
                dataType: 'json',
                type: 'post',
                contentType: 'application/json',
                data: JSON.stringify(signupObject),
                processData: false,
                success: function( data, textStatus, jQxhr ){
                    console.log(data);
                    signupSPA.handleSignupSuccess(data);
                },
                error: function( jqXhr, textStatus, errorThrown ){
                    console.log('Signup Request Error:');
                    console.log(errorThrown);
                    console.log(jqXhr.responseJSON);
                    if(textStatus == 'timeout'){
                        //console.log('Request Timeout');
                        signupSPA.handleSignupSuccess({success: false, message: 'timeout'});
                    } else {
                        signupSPA.handleSignupFailure(jqXhr.responseJSON);
                    }
                }
            });
        }
    },
    handleSignupSuccess: function(signupObject){
        console.log('Success! Was able to sign up a user!');
        // Write the username and details to local storage, then forward the user over to login to attempt a login
        // In this setup, an implicit login is required. You dont just get to login based on a signup. 

        localStorage.setItem("username", signupSPA.signupUsername);
        localStorage.setItem("emailAddress", signupSPA.signupEmailAddress);
        localStorage.setItem("password", signupSPA.signupPassword);
        
        // Redirect the page to the chat URL which will load the Chat SPA.
        window.location.replace("/login?utm_source=signupSPA&autoLogin=true");
    },
    handleSignupFailure: function(signupObject){
        // Present the error back to the user.
        if(signupObject.message == 'timeout'){
            signupSPA.presentSignupErrorToUser('Connection timeout.</br>Are you connected to the internet?');
        } else {
            signupSPA.presentSignupErrorToUser(signupObject.message);
        }
    },
    calculateAge: function(dateString){
        //console.log('Date String: '+dateString);
        var now = new Date();
        var today = new Date(now.getYear(),now.getMonth(),now.getDate());
      
        var yearNow = now.getYear();
        var monthNow = now.getMonth();
        var dateNow = now.getDate();

        var dobObject = dateString.split("/");
        var dob = new Date(dobObject[2], dobObject[0], dobObject[1]); 
      
        var yearDob = dob.getYear();
        var monthDob = dob.getMonth();
        var dateDob = dob.getDate();
        var age = {};
        var ageString = "";
        var yearString = "";
        var monthString = "";
        var dayString = "";
      
      
        yearAge = yearNow - yearDob;
      
        if (monthNow >= monthDob)
          var monthAge = monthNow - monthDob;
        else {
          yearAge--;
          var monthAge = 12 + monthNow -monthDob;
        }
      
        if (dateNow >= dateDob)
          var dateAge = dateNow - dateDob;
        else {
          monthAge--;
          var dateAge = 31 + dateNow - dateDob;
      
          if (monthAge < 0) {
            monthAge = 11;
            yearAge--;
          }
        }
      
        age = {
            years: yearAge,
            months: monthAge,
            days: dateAge
        };

        console.log('User is: '+age.years+' years old.');
        return age.years;
      
        // if ( age.years > 1 ) yearString = " years";
        // else yearString = " year";
        // if ( age.months> 1 ) monthString = " months";
        // else monthString = " month";
        // if ( age.days > 1 ) dayString = " days";
        // else dayString = " day";
      
      
        // if ( (age.years > 0) && (age.months > 0) && (age.days > 0) )
        //   ageString = age.years + yearString + ", " + age.months + monthString + ", and " + age.days + dayString + " old.";
        // else if ( (age.years == 0) && (age.months == 0) && (age.days > 0) )
        //   ageString = "Only " + age.days + dayString + " old!";
        // else if ( (age.years > 0) && (age.months == 0) && (age.days == 0) )
        //   ageString = age.years + yearString + " old. Happy Birthday!!";
        // else if ( (age.years > 0) && (age.months > 0) && (age.days == 0) )
        //   ageString = age.years + yearString + " and " + age.months + monthString + " old.";
        // else if ( (age.years == 0) && (age.months > 0) && (age.days > 0) )
        //   ageString = age.months + monthString + " and " + age.days + dayString + " old.";
        // else if ( (age.years > 0) && (age.months == 0) && (age.days > 0) )
        //   ageString = age.years + yearString + " and " + age.days + dayString + " old.";
        // else if ( (age.years == 0) && (age.months > 0) && (age.days == 0) )
        //   ageString = age.months + monthString + " old.";
        // else ageString = "Oops! Could not calculate age!";
      
        // return ageString;
      }
}