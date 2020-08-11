# Setup Banned Items
# ------------------------------------------------------------

DROP TABLE IF EXISTS `bannedItems`;

CREATE TABLE `bannedItems` (
  `dbid` int(254) NOT NULL AUTO_INCREMENT COMMENT 'DatabaseID',
  `object` varchar(254) NOT NULL COMMENT 'The thing being banned, username, IP Address etc',
  `objectType` varchar(254) NOT NULL COMMENT 'Type of object thats being banned.',
  `dateBanned` int(254) NOT NULL COMMENT 'Epoc of when an item was banned.',
  `dateUnBanned` int(254) DEFAULT NULL COMMENT 'EPOC of when this object was unbanned, either by a MOD or some other purpose',
  `currentlyBanned` int(1) NOT NULL DEFAULT 1 COMMENT 'Bool, if this object is currently banned.',
  `Admin Notes` text NOT NULL COMMENT 'Admin Notes',
  PRIMARY KEY (`dbid`),
  UNIQUE KEY `object` (`object`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;



# Setup channels
# ------------------------------------------------------------

DROP TABLE IF EXISTS `channels`;

CREATE TABLE `channels` (
  `dbid` int(254) NOT NULL AUTO_INCREMENT COMMENT 'DatabaseID',
  `channelID` varchar(254) NOT NULL COMMENT 'Channel ID, this is the machine identifier of a channel',
  `channelName` varchar(254) NOT NULL COMMENT 'Channel Name, this is the human identifer of a channel. EG:"Main Chat" ',
  `channelType` varchar(150) NOT NULL COMMENT 'Channel Type; Private, Public, Group, Bot',
  `channelActive` tinyint(1) NOT NULL COMMENT 'Is the Channel Active or Not',
  `channelLanguages` varchar(254) NOT NULL COMMENT 'What Languages are being spoken in the channel. This can be dynamic or static list.',
  `dateCreated` int(254) NOT NULL COMMENT 'Epoch of when the channel was created',
  `dateClosed` int(254) DEFAULT NULL COMMENT 'Epoch of when the channel was marked as inactive. Its not recommended to reactivate channels after they are maked as inactive.',
  `createdBy` varchar(254) NOT NULL COMMENT 'UserID of who created the channel.',
  `channelParticipants` text NOT NULL COMMENT 'UserIDs of the participants in a channel.',
  `channelNotes` text NOT NULL COMMENT 'Admin Notes on the channel',
  PRIMARY KEY (`dbid`),
  UNIQUE KEY `channelID` (`channelID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;



# Setup messages
# ------------------------------------------------------------

DROP TABLE IF EXISTS `messages`;

CREATE TABLE `messages` (
  `dbid` int(11) NOT NULL AUTO_INCREMENT COMMENT 'DatabaseID',
  `messageID` varchar(254) NOT NULL COMMENT 'MessageID, this is a generated serial number for this message.',
  `fromUser` varchar(254) NOT NULL COMMENT 'The Username who submitted the message',
  `fromIP` varchar(245) NOT NULL COMMENT 'The IP address the Message was captured from',
  `dateCreated` int(254) NOT NULL COMMENT 'The Epoch date of when the message was recieved',
  `toID` text NOT NULL COMMENT 'The destination of this message was intended for.',
  `messageObject` text NOT NULL COMMENT 'The contents of the message; text/media/document/etc.',
  `messageType` varchar(254) NOT NULL COMMENT 'The type of message. text/media/document/etc.',
  `messageActive` tinyint(1) NOT NULL COMMENT 'Is this message active or has it been revoked for some reason.',
  `threadOfMessage` varchar(254) NOT NULL COMMENT 'Is this message part of a thread of another message.',
  PRIMARY KEY (`dbid`),
  UNIQUE KEY `messageID` (`messageID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;



# Setup users
# ------------------------------------------------------------

DROP TABLE IF EXISTS `users`;

CREATE TABLE `users` (
  `dbid` int(11) NOT NULL AUTO_INCREMENT COMMENT 'DatabaseID',
  `username` varchar(254) NOT NULL COMMENT 'Users submitted username',
  `password` varchar(254) DEFAULT NULL COMMENT 'Users submitted password',
  `requirePasswordChange` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Bool, If the user needs to change their password on next login.',
  `userType` varchar(254) NOT NULL COMMENT 'Type of user; basic, premium, admin, superuser',
  `emailAddress` varchar(254) NOT NULL COMMENT 'Users submitted Email Address',
  `emailAddressVerified` tinyint(1) DEFAULT 0 COMMENT 'If the email is verified',
  `activeUser` int(1) NOT NULL COMMENT 'User is marked as active.',
  `dateCreated` int(254) NOT NULL COMMENT 'Epoch of when the user was created',
  `dateFirstLogin` int(254) DEFAULT NULL COMMENT 'Date of first login',
  `dateClosed` int(254) DEFAULT NULL COMMENT 'Epoch of when the user was closed',
  `signupIP` varchar(254) NOT NULL COMMENT 'IP Address of the signup location of the user',
  `signupUserAgent` varchar(254) NOT NULL COMMENT 'Agent used in the signup process, this is usually an indication of the browser.',
  `signupCountry` varchar(254) NOT NULL COMMENT 'GeoIP of the country where the signup occured. This is done by looking up the IP Address',
  `locale` varchar(254) DEFAULT NULL COMMENT 'Language used by the users app/browser.',
  `authorisedChannels` text DEFAULT NULL COMMENT 'Array Of Channels This user is allowed to access.',
  `supportVoiceConnectivity` tinyint(1) DEFAULT 0 COMMENT 'Bool, If the user is given any voice connectivity Tokens',
  `recordedGender` varchar(254) DEFAULT NULL COMMENT 'Users submitted gender',
  `recordedDOB` varchar(254) DEFAULT NULL COMMENT 'Date of birth as submitted by the user. Month/Day/Year',
  `userIcon` varchar(254) DEFAULT 'http://s3.amazonaws.com/37assets/svn/765-default-avatar.png' COMMENT 'User icon URL used to show the user to others.',
  `mfaID` varchar(254) DEFAULT NULL COMMENT 'AuthyID of the user, if MFA is required.',
  `mfaRequired` varchar(254) DEFAULT NULL COMMENT 'No/Sometimes/Always if the user is presented with MFA auth, known IP ranges arent questioned.',
  `knownIPAddresses` text NOT NULL COMMENT 'Array of IP Addresss the user has previously logged in from.',
  `adminNotes` text DEFAULT NULL COMMENT 'Administrator Notes for this user',
  `lastSeenIP` varchar(254) DEFAULT NULL COMMENT 'IP Address the last time the user was seen.',
  `lastSeenTimestamp` varchar(254) DEFAULT NULL COMMENT 'Timestamp of when the user was last seen online.',
  PRIMARY KEY (`dbid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

