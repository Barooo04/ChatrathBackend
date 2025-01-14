const mysql = require('mysql2');
require('dotenv').config();

const connection = mysql.createConnection({
    host: process.env.DB_HOST, // o l'indirizzo del tuo server MySQL
    user: process.env.DB_USER, // il tuo nome utente MySQL
    password: process.env.DB_PASSWORD, // la tua password MySQL
    database: process.env.DB_DATABASE, // il nome del tuo database
    port: process.env.DB_PORT,
    connectTimeout: 10000 // Timeout di 10 secondi
});

connection.connect((err) => {
    if (err) {
        console.error('Errore di connessione: ' + err.stack);
        return;
    }
    console.log('Connesso come id ' + connection.threadId);
});

module.exports = connection; 