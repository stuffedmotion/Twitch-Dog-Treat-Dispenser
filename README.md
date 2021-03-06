>"**LarryBot**" is an automated dog treat dispenser that let's live viewers on Twitch.tv give treats to a good boy on command.

#### See full blog post at [https://www.tylerpearce.ca/twitch-dog-treat-dispenser-bot/](https://www.tylerpearce.ca/twitch-dog-treat-dispenser-bot/)

# Server 
The server is a Node.js/Express server and can be run locally on your machine. 

### Requirements

- Node.js
- Python
- `npm install --global --production windows-build-tools` (If on windows)
- Setup a MongoDB database (e.g. [MLab](https://mlab.com))
- Add 3 collections to database 'treats', 'admins', 'settings'
- Add initial document to 'settings' collection.  
`{
    "type": "system",
    "systemStatus": 1
}`
- Add your Twitch Username in a new document to the 'admins' collection. This lets you bypass the cooldown restrictions that other users would have. You can add as many admins as you would like (e.g. channel mods)  
`{
    "name": "YourTwitchName"
}`  
- Setup a MQTT server (e.g. [EMQTT](http://emqtt.io) or [CloudMQTT](https://www.cloudmqtt.com)) 
- Create a new Twitch account to be used as your bot user
- Generate your OAuth Password for the bot account at [https://twitchapps.com/tmi/](https://twitchapps.com/tmi/)
- Create a file called `.env` in the root of your server directory. Add the following replaced with your information and save 
```
DEV=false  
MQTT_SERVER="ws://localhost:8083/mqtt"  
TWITCH_CHANNEL="YourTwitchChannelName"  
TWITCH_BOT_USERNAME="YourBotUserName"  
TWITCH_BOT_OAUTH="oauth:YourOauthKey Get from https://twitchapps.com/tmi/"  
SLTOKEN="YourStreamLabsToken If you want to give treats when someone follows automatically. Go to your https://streamlabs.com/dashboard#/apisettings > API Tokens to find your token"  
DB_CONNECTION_STRING="mongodb://exampledb:password@ds312762.mlab.com:15762/larrybot"  
DB_NAME="larrybot"  
```
- Run `npm install` 
- Start the server with `node server`

The dashboard can be accessed at http://localhost:8090

# The Robot
![Robot Schematic](https://musing-goldberg-cca785.netlify.com/robot/robot_fritz.png)
The source code here is only for the dispenser. The LED strip lighting source code is not included at the moment. Take a look into [NeoPixelBus](https://github.com/Makuna/NeoPixelBus) as there can be conflicts with servos/interrupts and LED strips.

See Waltermixxx's [Thingiverse](https://www.thingiverse.com/thing:2187877/files) & [post](https://www.raspberrypi.org/forums/viewtopic.php?t=179424) for information on building the 3D printed dispenser. I used [3DHubs](https://3dhubs.com) for printing.

![Robot Schematic](https://musing-goldberg-cca785.netlify.com/robot/robot_inside.jpg)

This is the [IR beam splitter](https://www.adafruit.com/product/2167) I used and the [servo](https://www.adafruit.com/product/155)

I used an [EMQTT](http://emqtt.io) broker running on the same machine as the Express server to be my MQTT server, rather than using a free cloud MQTT server, it was much faster and more reliable. If you do this, you should go into your router and assign a dedicated IP address to your computer running the server so the arduino/esp8266 can connect easily (e.g. 192.168.0.14).

You may need to download and add certain dependencies that are missing. This was developed for use on a NodeMCU/ESP8266 board, but can likely be easily modified to work with an Arduino

WifiManager library is being used for wifi. On the first run, a wifi access point will be available that you can connect to from your phone. From there you can configure your wifi settings.

Update the MQTT server settings with your own.
