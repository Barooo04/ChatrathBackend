const connection = require('../../db');
const { v4: uuidv4 } = require('uuid');
const cors = require('../../utils/corsOptions');

module.exports = async (req, res) => {
    cors(req, res);

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Metodo non consentito' });
    }

    const { userId, assistantId, assistantName } = req.body;
    const now = new Date();
    const dataApertura = now.toISOString().slice(0, 19).replace('T', ' ');
    const threadId = uuidv4();

    const query = `
        INSERT INTO metadata 
        (user_id, assistant_id, data_apertura, nome_chatpage, thread_id) 
        VALUES (?, ?, ?, ?, ?)
    `;

    connection.query(query, [userId, assistantId, dataApertura, assistantName, threadId], (err, results) => {
        if (err) {
            console.error('Errore inserimento metadata:', err);
            return res.status(500).json({ message: 'Errore interno del server' });
        }
        res.json({
            message: 'Metadata inseriti con successo',
            metadataId: results.insertId,
            threadId: threadId
        });
    });
}; 