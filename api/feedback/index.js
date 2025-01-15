const connection = require('../../db');
const cors = require('../../utils/corsOptions');

module.exports = async (req, res) => {
    cors(req, res);

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Metodo non consentito' });
    }

    const { assistantId, userId, rating, comment, threadId } = req.body;

    // Validazione
    if (!assistantId || !userId || !rating || !threadId) {
        return res.status(400).json({ 
            success: false, 
            message: 'Mancano dei campi obbligatori' 
        });
    }

    const now = new Date();
    const dataChiusura = now.toISOString().slice(0, 19).replace('T', ' ');

    const query = `
        UPDATE metadata 
        SET data_chiusura = ?,
            rating = ?,
            comment = ?
        WHERE thread_id = ? 
        AND user_id = ? 
        AND assistant_id = ?
    `;

    connection.query(
        query, 
        [dataChiusura, rating, comment || '', threadId, userId, assistantId],
        (err, results) => {
            if (err) {
                console.error('Errore durante l\'aggiornamento del feedback:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Errore durante il salvataggio del feedback'
                });
            }

            if (results.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Sessione di chat non trovata'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Feedback salvato con successo'
            });
        }
    );
}; 