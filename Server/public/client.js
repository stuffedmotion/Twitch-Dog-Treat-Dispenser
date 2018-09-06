var robot_status = "offline";

// MQTT ////////////////////////////////////////////////////
////////////////////////////////////////////////////////////

var audio = new Audio('error.wav');


// Create a client instance
var client = mqtt.connect(mqtt_server)

client.on('connect', function () {
    console.log("MQTT Connected");
    client.subscribe("treat_success");
    client.subscribe("treat_failure");
    client.subscribe("robot_status", {qos: 1});
})

client.on('message', function (topic, message) {

    console.log("MQTT: " + topic + " - " + message.toString());

    if (topic == "robot_status") {
        robot_status = message.toString();

        if (robot_status == "online") {
            $('.robot_actions .button').removeAttr("disabled");
            $('#robot_status').html('Robot Online!').removeClass('offline').removeClass('connecting');
        }
        else if (robot_status == "load") {
            $('#robot_status').html('Loading robot').removeClass('offline').addClass('connecting');
            $('.robot_actions .button').attr('disabled', 'disabled');
        }
        else if (robot_status == "empty") {
            $('#robot_status').html('Emptying chamber').removeClass('offline').addClass('connecting');
            $('.robot_actions .button').attr('disabled', 'disabled');
        }
        else {
            $('.robot_actions .button').attr('disabled','disabled');
            $('#robot_status').html('Robot Offline').addClass('offline').removeClass('connecting');
        }
    }
    else if (topic == "treat_failure"){
        audio.play();
        if (message.toString() == "empty"){
            $('#error_msg').html('Robot is out of food!');
            $('#error').show();
        }
        else{
            $('#error_msg').html('Something went wrong :(');
            $('#error').show();
        }
    }
    else if (topic == "treat_success"){
        $('.pending').hide();
        var d = new Date();
        $('#larrybotlog').prepend(`
        <div class="event">
                <div class="label">
                    <img src="img/treat.png">
                </div>
                <div class="content">
                    <div class="summary"> 
                        <a class="user">${message.toString()}</a> gave Larry a treat!<div class="date">${d.toLocaleTimeString()}</div>
                    </div>
                </div>
            </div>`
        );
    }
})


$('.robot_actions .button').click(function () {
    var mode = $(this).attr('data-mode');

    if(mode == "load"){
        client.publish('robot_status', 'load', { qos: 1, retain: true });
    }
    else if (mode == "empty") {
        client.publish('robot_status', 'empty', { qos: 1, retain: true });
    }
    else if (mode == "treat") {
        client.publish('treat_give', "Kbearz_", { qos: 1 });
    }
})
            


reloadData();

const button = document.getElementById('toggleSystem');
button.addEventListener('click', function (e) {
    toggleSystemStatus();
});

setInterval(function () {
    reloadData();
}, 15000);


$('.message .close').on('click', function () {
    $("#error").hide();
});

function toggleSystemStatus(){
    fetch('/clicked', { method: 'POST' })
        .then(function (response) {
            if (response.ok) {
                reloadData();
                return;
            }
            throw new Error('Request failed.');
        })
        .catch(function (error) {
            console.log(error);
        });
}

function reloadData(){
    fetch('/status', { method: 'GET' })
        .then(function (response) {
            if (response.ok) return response.json();
            throw new Error('Request failed.');
        })
        .then(function (data) {
           // console.log(data);
            if (data.systemStatus == 1){
                $('#toggleSystem').html('Enabled').addClass('active');
            }
            else{
                $('#toggleSystem').html('Disabled').removeClass('active');
            }
        })
        .catch(function (error) {
            console.log(error);
        });
}

