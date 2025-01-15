const connection = require('../../db');
const cors = require('../../utils/corsOptions');

module.exports = async (req, res) => {
    cors(req, res);

    const { token } = req.query;

    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Metodo non consentito' });
    }

    const query = 'SELECT id, name FROM assistants WHERE token = ?';

    connection.query(query, [token], (err, results) => {
        if (err) {
            console.error('Errore query:', err);
            return res.status(500).json({ message: 'Errore interno del server' });
        }

        if (results.length === 0) {
            return res.status(404).json({ message: 'Assistente non trovato' });
        }

        res.json({
            id: results[0].id,
            name: results[0].name
        });
    });
}; 