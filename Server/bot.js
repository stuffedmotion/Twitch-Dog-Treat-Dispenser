//IMPORTS
const log = require('simple-node-logger').createSimpleLogger({ logFilePath: __dirname + '/bot.log', timestampFormat: 'YYYY-MM-DD HH:mm' }) //logger -> bot.log
const tmi = require('tmi.js') //Twitch api
const mqtt = require('mqtt') //MQTT client to send/receive messages
const StreamlabsSocketClient = require('streamlabs-socket-client') //Helper to listen to Subscribes/Follows
const mongoUtil = require('./utils/mongoUtil') //Helper file to share DB instance across app
require('dotenv').config({ path: __dirname + "/.env" }) //ENV variable helper. Loads from .env file


//VARIABLES
let is_twitch_ready = false //Tied to onConnectedHandler and onDisconnectedHandler
let is_mqtt_ready = false //Tied to MQTT on->connect and on->close

const cooldown = 30 //specific user cooldown
const treatDelay = 5 //general delay between treats

let devMode = process.env.DEV //Dev mode variable if needed for testing

var last_status = new Date() //timestamp of last system status update for keep alive functionality
let last_treat = new Date() //timestamp of last treat given for general treat cooldown
last_treat.setSeconds(last_treat.getSeconds() - treatDelay) //initialize the treat so system is ready immediately

let db = mongoUtil.getDb() //get the shared DB instance




////////////////////////////////////////////////////////////////////////////
// MQTT Setup /////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////
let robot_status = 'unknown' //will update through MQTT 'robot_status' message
let mqttclient = mqtt.connect(process.env.MQTT_SERVER) //connect to local EMQTTD broker over websocket. 

//Check robot_status keep alive. If haven't received robot_status in a while then broadcast the robot is offline. Robot_status messages are always retained. The robot arduino will send this message frequently
setInterval(() => {
    let now = new Date()
    let diff = Math.abs((now.getTime() - last_status.getTime()) / 1000)

    if (diff > 21 && robot_status != 'offline') {
        robot_status = 'offline'
        mqttclient.publish('robot_status', 'offline', { qos: 1, retain: true })
        log.error("Robot failed keep alive. Broadcast offline.")
    }
}, 1000)


//Setup initial MQTT subscriptions
mqttclient.on('connect', function () {
    log.info('MQTT connected')
    is_mqtt_ready = true
    mqttclient.subscribe('robot_status')
    mqttclient.subscribe('treat_success')
    mqttclient.subscribe('treat_failure')
})

mqttclient.on('close', function () {
    is_mqtt_ready = false
    log.info('MQTT disconnected')
})

//Receive messages broadcasted by the robot & dashboard
mqttclient.on('message', function (topic, message) {

    // robot_status (online/load/empty/offline)
    if (topic == "robot_status") {
        if (robot_status != message.toString()) {
            log.info('MQTT Robot status - ' + message.toString())
            robot_status = message.toString()
        }
        last_status = new Date()
    }

    // treat_success (username)
    if (topic == "treat_success") {
        treatSuccess(message.toString())
    }

    // treat_failure (empty)
    if (topic == "treat_failure") {
        if (message.toString() == "empty") {
            sendMessage(`Looks like the robot is out of treats. Tell Kbearz to fill it up!`)
        }
        else {
            sendMessage(`Something went wrong with the robot :(`, true)
        }
    }

})



////////////////////////////////////////////////////////////////////////////
// TWITCH /////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////

let opts = {
    options: {
        debug: false
    },
    identity: {
        username: process.env.TWITCH_BOT_USERNAME,
        password: process.env.TWITCH_BOT_OAUTH
    },
    channels: [
        process.env.TWITCH_CHANNEL
    ]
}
let client = new tmi.client(opts)

// Register our event handlers (defined below):
client.on('message', onMessageHandler)
client.on('connected', onConnectedHandler)
client.on('disconnected', onDisconnectedHandler)
client.connect()

// These are the commands the bot knows (defined below):
let knownCommands = { treat }

////////////////////////////////////////////////////////////////////////////
// STREAM LABS ////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////

//We use the StreamLabs API to listen for new Followers to dispense a treat as well

const slclient = new StreamlabsSocketClient({
    token: process.env.SLTOKEN,
    emitTests: true // true if you want alerts triggered by the test buttons on the streamlabs dashboard to be emitted. default false.
})

//Listen for follow events & give treat
slclient.on('follow', (data) => {
    giveTreat(data.name, 'follow')
    log.info("SL FOLLOW: ", data)
})

slclient.connect()


////////////////////////////////////////////////////////////////////////////
// Functions //////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////


function treat(target, context, params) {
    log.info(context)
    let admins = []
    db.collection('admins').find({ name: context['display-name'] }).toArray((err, result) => {
        admins = result

        if (admins.length > 0) {
            giveTreat(context['display-name'], 'admin')
        }
        else if (context.subscriber) {
            giveTreat(context['display-name'], 'subscriber')
        }
        else {
            sendMessage("Sorry, only subscribers can give Larry treat!")
        }
    })
    
}

function giveTreat(username, type) {
    db.collection('settings').findOne({ type: "system" }, (err, result) => {
        if (err) {
            sendMessage("Sorry, something went wrong. Tell Kbearz! Error: 14", true, `Db find system`)
        }
        else {
            //Is System toggled on?
            if (result.systemStatus == 1) {

                //check if Robot is online
                if (robot_status != "online") {
                    sendMessage("Sorry, looks like the robot is offline for some reason. Try again in a bit", true)
                    return
                }

                //check the treat delay
                let now = new Date()
                if (Math.abs((now.getTime() - last_treat.getTime()) / 1000) < treatDelay) {
                    sendMessage("Try again in 30 seconds. Larry just got a treat.")
                    return
                }
                //Get treats for user and verify cooldown
                db.collection('treats').find({ name: username }).sort({ $natural: -1 }).limit(1).toArray((err, result) => {
                    if (err) {
                        sendMessage("Sorry, something went wrong. Tell Kbearz! Error: 74", true, `db find ${username}`)
                    }

                    //Check user cooldown - skip for admins
                    if (type == "admin" || checkCooldown(result)) {

                        //ALL GOOD LETS GIVE A TREAT!
                        //Send message to robot to begin giving a treat
                        mqttclient.publish('treat_give', username, { qos: 1 }, function (err) {
                            if (err) {
                                sendMessage("Sorry, something went wrong. Tell Kbearz! Error: 27", true, `treat_give: ${username}`)
                            }
                            else {
                                //message has been received by broker
                                sendMessage(`OhMyDog ${username} is dispensing a treat...`)
                                //MQTT topic 'treat_success' will be sent from robot once treat has been confirmed and will proceed at treatSuccess()
                            }
                        })
                    }
                    else {
                        sendMessage(`${username} has already given Larry a treat. Please try again later.`)
                    }
                })
            }
            else {
                sendMessage("The TreatBot is currently turned off. Did Larry leave the room?")
            }
        }
    })
}

//Treat has been successfully dispensed
function treatSuccess(username) {

    sendMessage(`OhMyDog ${username} gave Larry a treat!`)

    last_treat = new Date()

    //save to db for cooldown tracking
    db.collection('treats').save({ name: username, dateUTC: new Date(), dateEST: new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }) }, (err, result) => {
        if (err) {
            log.error(`db save treat for ${username} - ${err}`)
        }
    })
}



function checkCooldown(result) {
    //if user hasn't ever given a treat then all good
    if (result.length == 0) {
        return true
    }
    //else check cooldown
    else {
        let now = new Date()
        let diff = Math.abs((now.getTime() - result[0].dateUTC.getTime()) / 1000)


        if (diff >= cooldown) {
            return true
        }
        else {
            return false
        }
    }
}

// Helper function to send a message
function sendMessage(message, err = false, info = "") {
    if (is_twitch_ready) {
        client.say(process.env.TWITCH_CHANNEL, message)

        err ? log.error(message + " " + info) : log.info(message + " " + info)
    }
}

// Called every time a twitch message comes in:
function onMessageHandler(target, context, msg, self) {
    if (self) { return } // Ignore messages from the bot

    // This isn't a command since it has no prefix:
    if (msg.substr(0, 1) !== "!") {sendMessage
        log.info(`[${target} (${context['message-type']})] ${context.username}: ${msg}`)
        if (!context['display-name'].includes('bot') && msg.includes('treat')) { sendMessage("Did someone say treat?") }
        return
    }

    // Split the message into individual words:
    const parse = msg.slice(1).split(' ')
    // The command name is the first (0th) one:
    const commandName = parse[0]
    // The rest (if any) are the parameters:
    const params = parse.splice(1)

    // If the command is known, let's execute it:
    if (commandName in knownCommands) {
        // Retrieve the function by its name:
        const command = knownCommands[commandName]
        // Then call the command with parameters:
        command(target, context, params)
        log.info(`* Executed ${commandName} command for ${context.username}`)
    } else {
        //log.info(`* Unknown command ${commandName} from ${context.username}`)
    }
}

// Called every time the bot connects to Twitch chat:
function onConnectedHandler(addr, port) {
    is_twitch_ready = true
    log.info(`* Connected to ${addr}:${port}`)
}

// Called every time the bot disconnects from Twitch:
function onDisconnectedHandler(reason) {
    is_twitch_ready = false
    log.error(`Womp womp, disconnected: ${reason}`)
    process.exit(1)
}