#include <ArduinoOTA.h>
#include <ESP8266WiFi.h>

#include <DNSServer.h>            //Local DNS Server used for redirecting all requests to the configuration portal
#include <ESP8266WebServer.h>     //Local WebServer used to serve the configuration portal
#include <WiFiManager.h>          //https://github.com/tzapu/WiFiManager WiFi Configuration Magic

#include <Ticker.h>
#include <AsyncMqttClient.h>
#include <ArduinoJson.h>

#include <Servo.h>

#define DEVICENAME "larry_robot"



#define SENSORPIN 14
int sensorState = 0, lastState=0; 


Servo myservo;
Ticker servoTicker;
Ticker keepAliveTicker;
Ticker treatTicker;
Ticker lightTicker;


char robot_status[50] = "offline";
char treat_username[50] = "Kbearz";



/****************************************MQTT***************************************/
#define MQTT_HOST "192.168.0.29"  //change to your MQTT server IP
#define MQTT_PORT 1883 //change to your MQTT server port
#define MQTT_USERNAME "username" //change to your MQTT username if any
#define MQTT_PASSWORD "password" //change to your MQTT password if any

const int BUFFER_SIZE = JSON_OBJECT_SIZE(10);
#define MQTT_MAX_PACKET_SIZE 512;

AsyncMqttClient mqttClient;
Ticker mqttReconnectTimer;

bool HASMQTT = false;

WiFiEventHandler wifiConnectHandler;
WiFiEventHandler wifiDisconnectHandler;
Ticker wifiReconnectTimer;

/*******************************************************************************/

void setup()
{
    pinMode(SENSORPIN, INPUT_PULLUP); //servo needs a pullup resistor or use the built-in pullup 


    Serial.begin(115200);
    
    keepAliveTicker.attach(10, keepAlive); //Send robot_status MQTT message every 10 seconds (keep alive)
    
    myservo.attach(2); //attach servo
    myservo.write(90); //90 means stop on a continuous servo
    
    wifiConnectHandler = WiFi.onStationModeGotIP(onWifiConnect);
    wifiDisconnectHandler = WiFi.onStationModeDisconnected(onWifiDisconnect);
  
    mqttClient.onConnect(onMqttConnect);
    mqttClient.onDisconnect(onMqttDisconnect);
    mqttClient.onMessage(onMqttMessage);
    mqttClient.onPublish(onMqttPublish);
    mqttClient.setServer(MQTT_HOST, MQTT_PORT);
    mqttClient.setCredentials(MQTT_USERNAME, MQTT_PASSWORD);
  
    WiFiManager wifiManager;
    wifiManager.autoConnect("Robot AP");

   
    
}


void loop()
{
   ArduinoOTA.handle();
   sensorState = digitalRead(SENSORPIN);


   //Treating - turn servo until treat passes the sensor, then tell the server it was a success
   if(strcmp(robot_status, "treating") == 0){
      //move servo forward slowly
      myservo.write(94);
      if (!sensorState && lastState) {
        //beam sensor triggered
        treatSuccess();
      }
  }
  //Loading - turn servo until treat passes the sensor, then put robot back online
  else if(strcmp(robot_status, "load") == 0){
      myservo.write(94);
      if (!sensorState && lastState) {
        change_status("online");
      }
  }
  //Empty - turn servo for an amount of time to drain the hopper
  else if(strcmp(robot_status, "empt") == 0){
      myservo.write(94);
  }
  else{
    //stop servo
    myservo.write(90);
  }

 

  lastState = sensorState;
}

void treatFailure()
{
  if(HASMQTT){
    mqttClient.publish("treat_failure", 1, false, "empty");
  }
  change_light(3); //Change light to error red
  lightTicker.attach(5, lightZero); //in 5 seconds turn light off
  change_status("online");
}

void treatSuccess()
{
  if(HASMQTT){
    mqttClient.publish("treat_success", 1, false, treat_username);
  }
  change_light(2); //change light to flashing success
  lightTicker.attach(5, lightZero); //in 5 seconds turn light off
  change_status("online");
}

void change_light(int lightState){
  //send custom JSON data to light over MQTT. This is meant to work with my custom home LED system.
  //You will likely want to implement your own method for the lighting if any. 
  if(HASMQTT){
    if(lightState == 0){
      mqttClient.publish("LED_ROBOT", 1, true, "{\"default\":\"\",\"title\":\"\",\"speed\":1500,\"mode\":\"Gradient Twinkle\",\"icon\":\"\",\"tv_active\":false,\"kitchen_active\":false,\"colors\":[{\"hexcolor\":\"#009aff\",\"slider\":0},{\"hexcolor\":\"#031e2b\",\"slider\":133},{\"hexcolor\":\"#c7edff\",\"slider\":255}],\"colorbytes\":[0,0,154,255,133,3,30,43,255,199,237,255],\"colorstring\":\"#009aff 0%, #031e2b 52.15686274509804%, #c7edff 100%\"}");
    }
    else if(lightState == 1){
      mqttClient.publish("LED_ROBOT", 1, true, "{\"greenflash\":\"\",\"title\":\"\",\"speed\":150,\"mode\":\"Gradient Pulse\",\"icon\":\"\",\"tv_active\":false,\"kitchen_active\":false,\"colors\":[{\"hexcolor\":\"#2dff0a\",\"slider\":0},{\"hexcolor\":\"#17e022\",\"slider\":255}],\"colorbytes\":[0,45,255,10,255,23,224,34],\"colorstring\":\"#2dff0a 0%, #17e022 100%\"} ");
    }
    else if(lightState == 2){
       mqttClient.publish("LED_ROBOT", 1, true, "{\"downwards\":\"\",\"title\":\"\",\"speed\":400,\"mode\":\"Gradient Slide\",\"icon\":\"\",\"tv_active\":false,\"kitchen_active\":false,\"colors\":[{\"hexcolor\":\"#ff00e2\",\"slider\":0},{\"hexcolor\":\"#2dff0a\",\"slider\":88},{\"hexcolor\":\"#00efff\",\"slider\":180},{\"hexcolor\":\"#f200b3\",\"slider\":255}],\"colorbytes\":[0,255,0,226,88,45,255,10,180,0,239,255,255,242,0,179],\"colorstring\":\"#ff00e2 0%, #2dff0a 34.509803921568626%, #00efff 70.58823529411765%, #f200b3 100%\"}");
    }
    else if(lightState == 3){
       mqttClient.publish("LED_ROBOT", 1, true, "{\"redflash\":\"\",\"title\":\"\",\"speed\":150,\"mode\":\"Gradient Pulse\",\"icon\":\"\",\"tv_active\":false,\"kitchen_active\":false,\"colors\":[{\"hexcolor\":\"#2dff0a\",\"slider\":0},{\"hexcolor\":\"#17e022\",\"slider\":255}],\"colorbytes\":[0,255,45,10,255,255,24,34],\"colorstring\":\"#2dff0a 0%, #17e022 100%\"}");
    }
  }
}
void change_status(char* newstatus)
{

  strcpy(robot_status, newstatus);
  treatTicker.detach();

  if(strcmp(robot_status, "prepare_treating") == 0){
      Serial.println("Prepare Treating");
      change_light(1);
      lightTicker.detach();
      lightTicker.attach(1, lightTwo);
  }
  
  if(strcmp(robot_status, "treating") == 0){
      Serial.println("Is Treating");
      treatTicker.attach(12, treatFailure);
  }

  if(strcmp(robot_status, "load") == 0){
      treatTicker.attach(20, resetStatus);
  }

  if(strcmp(robot_status, "empt") == 0){
      treatTicker.attach(11, resetStatus);
  }

  keepAlive();
}

//Helper functions for various light modes
void lightTwo(){
  lightTicker.detach();
  change_status("treating");
}

void lightZero(){
  lightTicker.detach();
  change_light(0);
}

void resetStatus(){
  change_light(0);
  change_status("online");
}

//Send keepalive message to server often
void keepAlive() {
  if(HASMQTT){
    mqttClient.publish("robot_status", 1, true, robot_status);
  }
  Serial.println(robot_status);
}


/* Setup functions for mqtt/wifi/ota  ----------------------------------------------------------------------------------------------- */
void onMqttMessage(char* topic, char* payload, AsyncMqttClientMessageProperties properties, size_t len, size_t index, size_t total) {
  Serial.println("Publish received.");
  Serial.print("  topic: ");
  Serial.println(topic);

  if(strcmp(topic, robot_status) != 0){
      if(strcmp(topic, "do_robot_status") == 0){
        // handleLookJson(message);
         change_status(payload);
      }
      if(strcmp(topic, "treat_give") == 0){
          Serial.println("TREATGIVE");
          strcpy(treat_username, payload);
          change_status("prepare_treating");
      }
  }

}


void connectToWifi() {
  Serial.println("Connecting to Wi-Fi...");
  WiFi.begin();
   
}

void onWifiConnect(const WiFiEventStationModeGotIP& event) {
  Serial.println("Connected to Wi-Fi.");
  setupOTA();
  connectToMqtt();
}

void onWifiDisconnect(const WiFiEventStationModeDisconnected& event) {
  Serial.println("Disconnected from Wi-Fi.");
  mqttReconnectTimer.detach(); // ensure we don't reconnect to MQTT while reconnecting to Wi-Fi
  wifiReconnectTimer.once(4, connectToWifi);
}

void connectToMqtt() {
  Serial.println("Connecting to MQTT...");
  mqttClient.connect();
}

void onMqttConnect(bool sessionPresent) {
  Serial.println("Connected to MQTT.");
  uint16_t packetIdSub = mqttClient.subscribe("treat_give", 1);
  uint16_t packetIdSub2 = mqttClient.subscribe("do_robot_status", 1);
  HASMQTT = true;
  change_status("online");
  change_light(0);
}

void onMqttDisconnect(AsyncMqttClientDisconnectReason reason) {
  Serial.println("Disconnected from MQTT.");
  HASMQTT = false;

  if (WiFi.isConnected()) {
    mqttReconnectTimer.once(2, connectToMqtt);
  }
}

void onMqttPublish(uint16_t packetId) {
  Serial.println("Publish acknowledged.");
}

/****************************************OTA***************************************/
void setupOTA(){
  ArduinoOTA.setHostname(DEVICENAME);

  ArduinoOTA.onStart([]() {
    Serial.println("Start");
  });
  ArduinoOTA.onEnd([]() {
    Serial.println("\nEnd");
  });
  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    Serial.printf("Progress: %u%%\r", (progress / (total / 100)));
  });
  ArduinoOTA.onError([](ota_error_t error) {
    Serial.printf("Error[%u]: ", error);
    if (error == OTA_AUTH_ERROR) Serial.println("Auth Failed");
    else if (error == OTA_BEGIN_ERROR) Serial.println("Begin Failed");
    else if (error == OTA_CONNECT_ERROR) Serial.println("Connect Failed");
    else if (error == OTA_RECEIVE_ERROR) Serial.println("Receive Failed");
    else if (error == OTA_END_ERROR) Serial.println("End Failed");
  });
  ArduinoOTA.begin();
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
}


