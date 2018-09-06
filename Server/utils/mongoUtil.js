require('dotenv').config({ path: __dirname + "/.env" }) //ENV variable helper. Loads from .env file
var MongoClient = require('mongodb').MongoClient;

var _db;

module.exports = {

    connectToServer: function (callback) {
        MongoClient.connect(process.env.DB_CONNECTION_STRING, (err, database) => {
            _db = database.db(process.env.DB_NAME);
            return callback(err);
        });
    },

    getDb: function () {
        return _db;
    }
};