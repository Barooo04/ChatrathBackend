const mysql = require('mysql2');
require('dotenv').config();

// Crea una connessione in pool
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    port: process.env.DB_PORT || 3306,  // Assicurati di includere una porta di fallback
    waitForConnections: true,          // Attende connessioni se la connessione è occupata
    connectionLimit: 10,               // Limita il numero di connessioni simultanee
    queueLimit: 0                      // Senza limiti nella coda
});

// Esegui una query usando il pool
const query = (sql, params) => {
    return new Promise((resolve, reject) => {
        pool.execute(sql, params, (err, results) => {
            if (err) {
                reject(err);
            } else {
                resolve(results);
            }
        });
    });
};

module.exports = { query };