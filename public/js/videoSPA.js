'use-strict';
var videoSPA = {
    username: null,
    VideoVendor: null,
    VideoAPIKey: null,
    VideoAPISecret: null,
    VideoProjectID: null,
    SessionID: null,
    TokenID: null,
    videoClient: null,
    screenClient: null,
    remoteClientsObject: {},
    transcribePublisher: true,
    recognition: null,
    voiceActive: false,
    launcher: function(){
        // Get the details of the video session from meta data
        videoSPA.username = localStorage.getItem('username');
        videoSPA.VideoVendor = $('meta[name=Vendor]').attr("content");
        videoSPA.VideoAPIKey = $('meta[name=VendorAPIKey]').attr("content");
        videoSPA.VideoAPISecret = $('meta[name=vendorAPISecret]').attr("content");
        videoSPA.VideoProjectID = $('meta[name=vendorProjectID]').attr("content");
        videoSPA.SessionID = $('meta[name=SessionID]').attr("content");
        videoSPA.TokenID = localStorage.getItem('videoTokenID');

        // Check who the video Vendor is and load the approprate video serivce up. 
        if(videoSPA.VideoVendor == "Vonage"){
            videoSPA.initializeVonageSession(videoSPA.VideoAPIKey, videoSPA.SessionID, videoSPA.TokenID);
            console.log('Vonage Launcher Loaded');
        }
        if(videoSPA.VideoVendor == "Sinch"){
          console.log("Sinch Launcher Loaded");
          videoSPA.initializeSinchSession(videoSPA.VideoAPIKey);
        }
        if(videoSPA.VideoVendor == "Agora"){
          console.log("Agora Launcher Loaded");
          videoSPA.initializeAgoraSession(videoSPA.VideoAPIKey);
        }
        if(videoSPA.VideoVendor == "Dolby"){
            videoSPA.initializeDolbySession(videoSPA.VideoAPIKey, videoSPA.VideoAPISecret, videoSPA.SessionID);
        }
        videoSPA.initializeAudioTranscription();
    },
    handleError:function(error) {
        if (error) {
            alert(error.message);
        }
    },
    initializeAudioTranscription: function (){
      try {
        var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        videoSPA.recognition = new SpeechRecognition();
      }
      catch(e) {
        console.log("Was not able to activate SpeechRecognition, heres the error:");
        console.error(e);
      }

      videoSPA.recognition.onstart = function() {
        videoSPA.voiceActive = true;
        console.log('Voice recognition activated.');
      }
      
      videoSPA.recognition.onspeechend = function() {
        videoSPA.voiceActive = false;
        console.log('No Audio was detected, SpeechRecognition was turned off.');
      }
      
      videoSPA.recognition.onerror = function(event) {
        videoSPA.voiceActive = false;
        if(event.error == 'no-speech') {
          console.log('No speech was detected. Try again.');  
        };
      }

      videoSPA.recognition.onresult = function(event) {
        // event is a SpeechRecognitionEvent object.
        // It holds all the lines we have captured so far. 
        // We only need the current one.
        var current = event.resultIndex;
      
        // Get a transcript of what was said.
        var transcript = event.results[current][0].transcript;

        var mobileRepeatBug = (current == 1 && transcript == event.results[0][0].transcript);
        if(!mobileRepeatBug) {
          console.log(transcript);
          // Write the transcription to closed captioning div 
          $('#closedCaptioning').html('<p><bold>'+localStorage.getItem('username')+':</bold>'+transcript+'</p>');
        }
      }


    },
    initializeVonageSession:function(apiKey, sessionId, token){
        var session = OT.initSession(apiKey, sessionId);

        // Subscribe to a newly created stream
        session.on('streamCreated', function(event) {
          console.log('Video Stream Event: ',event);
            session.subscribe(event.stream, 'subscriber', {
                insertMode: 'append',
                width: '100%',
                height: '100%',
                style: { 
                  nameDisplayMode: "on",
                  audioLevelDisplayMode: 'off',
                }
            }, videoSPA.handleError);
        });

        // Create a publisher
        var publisher = OT.initPublisher('publisher', {
            insertMode: 'append',
            width: '100%',
            height: '100%',
            name: videoSPA.username,
            style: { 
              nameDisplayMode: "on",
              audioLevelDisplayMode: 'off',
            }
        }, videoSPA.handleError);

        var movingAvg = null;
        publisher.on('audioLevelUpdated', function(event) {
          if (movingAvg === null || movingAvg <= event.audioLevel) {
            movingAvg = event.audioLevel;
          } else {
            movingAvg = 0.7 * movingAvg + 0.3 * event.audioLevel;
          }
        
          // 1.5 scaling to map the -30 - 0 dBm range to [0,1]
          var logLevel = (Math.log(movingAvg) / Math.LN10) / 1.5 + 1;
          logLevel = Math.min(Math.max(logLevel, 0), 1);
          //document.getElementById('subscriberMeter').value = logLevel;
          //console.log('Log Level '+logLevel);
          logLevel = Math.round(logLevel * 10);
          //console.log('Log Level '+logLevel);
          if(logLevel >2 && videoSPA.voiceActive == false){
            videoSPA.recognition.start();
          };
        });

        // Connect to the session
        session.connect(token, function(error) {
        // If the connection is successful, publish to the session
        if (error) {
            videoSPA.handleError(error);
        } else {
            session.publish(publisher, videoSPA.handleError);
            // videoSPA.recognition.start();
        }
        });
    },
    initializeSinchSession: function(sinchAppID){
      sinchClient = new SinchClient({
        applicationKey: 'fe474c60-f832-45d8-9d11-92cb038077c7',
        capabilities: { calling: true, video: true },
        supportActiveConnection: true,
        //Note: For additional loging, please uncomment the three rows below
        onLogMessage: function (message) {
          console.log(message);
        },
      });
      
      sinchClient.startActiveConnection();

      var sessionName = videoSPA.sessionID;
      var sessionObj = JSON.parse(localStorage[sessionName] || '{}');
      if (sessionObj.userId) {
        sinchClient.start(sessionObj)
          .then(function () {
            console.log('Loaded Client from Local Storage');
            localStorage[sessionName] = JSON.stringify(sinchClient.getSession());
          })
          .fail(function () {
            console.log('No Session data could be loaded');
          });
      }
      else {
        console.log('No Session data could be loaded - else clause');
        var signUpObj = {};
        signUpObj.username = videoSPA.username;
        signUpObj.password = '123';
        console.log(signUpObj);

        sinchClient.newUser({username: 'N0tMat'}, function (ticket) {
          //On success, start the client
          sinchClient.start(ticket, function () {
            console.log('Was able to make a user');
      
            //Store session & manage in some way (optional)
            localStorage[sessionName] = JSON.stringify(sinchClient.getSession());
          }).fail(videoSPA.handleError);
        }).fail(videoSPA.handleError);
      }



    },
    initializeAgoraSession: function(agoraAppId){
      // stream references (keep track of active streams) 
      //var remoteStreams = {}; // remote streams obj struct [id : stream] 

      var localStreams = {
        camera: {
          id: "",
          stream: {}
        },
        screen: {
          id: "",
          stream: {}
        }
      };

      var mainStreamId; // reference to main stream
      var screenShareActive = false; // flag for screen share 

      var cameraVideoProfile = '720p_6';
      var screenVideoProfile = '720p_6';

      // create client instances for camera (client) and screen share (screenClient)
      videoSPA.videoClient = AgoraRTC.createClient({mode: 'rtc', codec: "h264"}); // h264 better detail at a higher motion
      videoSPA.screenClient = AgoraRTC.createClient({mode: 'rtc', codec: 'vp8'}); // use the vp8 for better detail in low motion

      // init Agora SDK
      videoSPA.videoClient.init(agoraAppId, function () {
        console.log("AgoraRTC client initialized");
        joinChannel(); // join channel upon successfull init
      }, function (err) {
        console.log("[ERROR] : AgoraRTC client init failed", err);
      });

      function joinChannel() {
        videoSPA.videoClient.join(videoSPA.TokenID, videoSPA.SessionID, videoSPA.username, function(uid) {
            console.log("User " + uid + " join channel successfully");
            createCameraStream(uid);
            localStreams.camera.id = uid; // keep track of the stream uid 
        }, function(err) {
            console.log("[ERROR] : join channel failed", err);
        });
      };

      function createCameraStream(uid) {
        var localStream = AgoraRTC.createStream({
          streamID: uid,
          audio: true,
          video: true,
          screen: false
        });
        localStream.setVideoProfile(cameraVideoProfile);
        localStream.init(function() {
          console.log("getUserMedia successfully");
          // TODO: add check for other streams. play local stream full size if alone in channel
          localStream.play('publisher'); // play the given stream within the local-video div
          // publish local stream
          videoSPA.videoClient.publish(localStream, function (err) {
            console.log("[ERROR] : publish local stream error: " + err);
          });
        
          enableUiControls(localStream); // move after testing
          localStreams.camera.stream = localStream; // keep track of the camera stream for later
        }, function (err) {
          console.log("[ERROR] : getUserMedia failed", err);
        });
      };

      // connect remote streams
      videoSPA.videoClient.on('stream-added', function (event) {
        console.log("new stream added: ");
        console.log(event);
        // Check if the stream is local
        if (event.streamId != localStreams.screen.id) {
          console.log('subscribe to remote stream:' + event.streamId);
          // Subscribe to the stream.
          videoSPA.videoClient.subscribe(event.stream, function (err) {
            console.log("[ERROR] : subscribe stream failed", err);
          });
          console.log("stream-added remote-uid: ", event.streamId);
        }
      });

      videoSPA.videoClient.on("stream-subscribed", function (event) {
        var remoteStream = event.stream;
        var id = remoteStream.getId();
        // Add a view for the remote stream.
        //addView(id);
        // Play the remote stream.
        remoteStream.play("subscriber");
        console.log("stream-subscribed remote-uid: ", id);
      });


    },
    initializeDolbySession: function(dolbyKey, dolbySecret, sessionID){
        VoxeetSDK.initialize(dolbyKey, dolbySecret);
        VoxeetSDK.session.open({name: videoSPA.username});

        const constraints = {
          audio: true,
          video: {
            width: {
              min: "320",
              max: "1280",
            },
            height: {
              min: "240",
              max: "720",
            },
          },
        }

        VoxeetSDK.conference
        .join(sessionID, { constraints: constraints })
        .then(info => {
          console.log("Connected to Conference by Dolby");
          // Start the Video and Audio
          VoxeetSDK.conference.startVideo(participant).catch(error => {
            // Error occurred during start video
          })
        })
        .catch(error => {})
    }
};