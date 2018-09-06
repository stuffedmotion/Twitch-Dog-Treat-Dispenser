console.log('Server-side code running');

const express = require('express');
const app = express();
var mongoUtil = require('./utils/mongoUtil'); //Helper file to share DB instance across app
require('dotenv').config({ path: __dirname + "/.env" }) //ENV variable helper. Loads from .env file
const fs = require('fs');
var path = require("path");

// serve files from the public directory
app.use(express.static(__dirname + "/public"));

//Setup EJS render engine
app.set('views', path.join(__dirname, 'views'));
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');


let db;

mongoUtil.connectToServer((err) => {
    if (err) {
        return console.log(err);
    }
    db = mongoUtil.getDb();
    // start the express web server listening on 8080
    app.listen(8090, () => {
        console.log('listening on 8090');
        console.log('Starting LarryBot');
        var bot = require('./bot');
        var opn = require('opn');
        opn('http://localhost:8090/');
    });
});

// Serve the homepage
app.get('/', (req, res) => {
    //get filesize of log file
    let stats = fs.statSync(__dirname + "/bot.log")
    let fileSizeInBytes = stats.size
    let fileSizeInKB = fileSizeInBytes / Math.pow(1024, 1)

    //render page
    res.render('index.ejs', { 
        log_size: fileSizeInKB.toFixed(2),
        mqtt_server: process.env.MQTT_SERVER
    })
});

// Endpoint to toggle the systemStatus (either 1 or 0)
app.post('/clicked', (req, res) => {
    db.collection('settings').updateOne({ type: "system" }, { $bit: { systemStatus: { xor: Number(1) } }},  (err, result) => {
        if (err) {
            return console.log(err);
        }
        res.sendStatus(201);
    });
});

// Get status from db
app.get('/status', (req, res) => {
    db.collection('settings').findOne({ type: "system" }, (err, result) => {
        if (err) return console.log(err);
        res.send(result);
    });
});

// Clear log file
app.get('/clearlog', (req, res) => {
    fs.truncate(__dirname + "/bot.log", 0, (err) => {
        if (err) throw err;
        console.log('Log was cleared');
        res.redirect('/');
    });
});