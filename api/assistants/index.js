const connection = require('../../db');
const cors = require('../../utils/corsOptions');

module.exports = async (req, res) => {
    cors(req, res);

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Metodo non consentito' });
    }

    const userId = req.body.userId;

    const query = `
        SELECT *
        FROM assistants a
        JOIN canAccess ca ON a.id = ca.assistant_id
        WHERE ca.user_id = ?
    `;

    connection.query(query, [userId], (err, results) => {
        if (err) {
            return res.status(500).json({ message: 'Errore interno del server' });
        }
        res.json(results);
    });
}; 